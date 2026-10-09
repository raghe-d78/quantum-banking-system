// scripts/e2e/api-workflow.mjs — end-to-end API workflow through the gateway.
// Needs a running stack (docker compose up) and the seeded admin. Exits non-zero
// on any failed check.  Usage: GATEWAY=http://localhost:3000 node scripts/e2e/api-workflow.mjs
const GW = process.env.GATEWAY || "http://localhost:3000";
const results = [];
let token = {};
const check = (name, ok, extra = "") => { results.push({ name, ok, extra }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const req = async (method, path, { body, who, headers = {} } = {}) => {
  const h = { "Content-Type": "application/json", ...headers };
  if (who && token[who]) h.Authorization = `Bearer ${token[who]}`;
  const r = await fetch(GW + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get("content-type") || "";
  const data = ct.includes("json") ? await r.json().catch(() => ({})) : await r.text();
  return { status: r.status, data, headers: r.headers };
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rnd = Math.random().toString(36).slice(2, 8);

// 0. public surface
let r = await req("GET", "/health");                 check("gateway /health", r.status === 200);
r = await req("GET", "/ready");                      check("gateway /ready", r.status === 200 || r.status === 503, JSON.stringify(r.data.upstreams));
r = await req("GET", "/balance");                    check("no token → 401", r.status === 401);
r = await req("GET", "/docs.json");                  check("openapi served", r.status === 200 && r.data.openapi);

// 1. staff login + user provisioning
r = await req("POST", "/auth/staff/login", { body: { username: "adminn", password: "admin123" } });
check("admin login", r.status === 200 && r.data.token, r.data.message); token.admin = r.data.token;
r = await req("POST", "/auth/customer/login", { body: { username: "adminn", password: "admin123" } });
check("admin cannot use customer portal", r.status === 401 || r.status === 403);
r = await req("POST", "/auth/staff/login", { body: { username: "adminn", password: "wrong" } });
check("bad password → 401", r.status === 401);

const mk = async (username, role) => {
  const res = await req("POST", "/admin/users", { who: "admin", body: { username, email: `${username}@example.com`, name: username.toUpperCase(), password: "Passw0rd!x", role } });
  check(`create ${role} ${username}`, res.status === 201, res.data.message); return res.data.user;
};
const alice = await mk(`alice_${rnd}`, "customer");
const bob   = await mk(`bob_${rnd}`, "customer");
const tell  = await mk(`teller_${rnd}`, "employee");
r = await req("POST", "/admin/users", { who: "admin", body: { username: `x_${rnd}`, email: "bad", name: "x", password: "short", role: "customer" } });
check("validation on create user", r.status === 400);

r = await req("POST", "/auth/customer/login", { body: { username: alice.username, password: "Passw0rd!x" } }); token.alice = r.data.token; const aliceRefresh = r.data.refreshToken;
check("alice login", r.status === 200 && token.alice);
r = await req("POST", "/auth/customer/login", { body: { username: bob.username, password: "Passw0rd!x" } }); token.bob = r.data.token;
r = await req("POST", "/auth/staff/login", { body: { username: tell.username, password: "Passw0rd!x" } }); token.teller = r.data.token;
check("teller login", r.status === 200 && token.teller);

// 2. accounts + RBAC
r = await req("GET", "/balance", { who: "alice" }); const aliceAcc = r.data.accountNumber;
check("alice balance (provisioned account)", r.status === 200 && aliceAcc && r.data.balance === 0, JSON.stringify(r.data));
r = await req("GET", "/balance", { who: "bob" }); const bobAcc = r.data.accountNumber;
r = await req("GET", "/fraud/alerts", { who: "alice" });   check("customer blocked from /fraud (403)", r.status === 403);
r = await req("GET", "/admin/users", { who: "teller" });   check("employee blocked from admin-only user list (403)", r.status === 403);
r = await req("GET", "/admin/accounts/" + alice.username, { who: "teller" });
check("staff lookup by username", r.status === 200 && r.data.accountId === aliceAcc, JSON.stringify(r.data));

// 3. deposits (staff) + cache invalidation
r = await req("POST", "/admin/deposit", { who: "teller", body: { accountId: aliceAcc, amount: "1000.0000", note: "Opening deposit" } });
check("teller deposit 1000", r.status === 200 && r.data.balance === 1000, JSON.stringify(r.data));
r = await req("POST", "/admin/deposit", { who: "alice", body: { accountId: aliceAcc, amount: "1000" } });
check("customer cannot deposit (403)", r.status === 403);
r = await req("POST", "/admin/deposit", { who: "teller", body: { accountId: aliceAcc, amount: "-5" } });
check("negative deposit rejected", r.status === 400 && r.data.code === "INVALID_AMOUNT", r.data.code);
r = await req("GET", "/balance", { who: "alice" }); check("balance reflects deposit (cache invalidated)", r.data.balance === 1000, String(r.data.balance));

// 4. transfers: ownership, verify, happy path, idempotency, limits
r = await req("GET", "/accounts/verify/" + bobAcc, { who: "alice" });
check("recipient verify returns name only", r.status === 200 && r.data.name && !("balance" in r.data), JSON.stringify(r.data));
r = await req("POST", "/transfer", { who: "bob", body: { sourceAccountId: aliceAcc, destinationAccountId: bobAcc, amount: 10 } });
check("bob cannot drain alice (403 FORBIDDEN)", r.status === 403 && r.data.code === "FORBIDDEN", r.data.code);
r = await req("POST", "/transfer", { who: "alice", body: { sourceAccountId: aliceAcc, destinationAccountId: bobAcc, amount: "250.0000", reference: "Rent" } });
check("alice → bob 250 (legacy /transfer)", r.status === 200 && r.data.data.source.newBalance === 750, JSON.stringify(r.data).slice(0, 160)); const tx1 = r.data.data.transactionId;
const key = `e2e-${rnd}-0001`;
r = await req("POST", "/transactions", { who: "alice", headers: { "Idempotency-Key": key }, body: { kind: "TRANSFER", destinationAccountId: bobAcc, amount: "100.0000", reference: "Idempotent" } });
check("POST /transactions TRANSFER 100 (201)", r.status === 201 && r.data.data.newBalance === 650, JSON.stringify(r.data).slice(0, 160)); const tx2 = r.data.data.transactionId;
r = await req("POST", "/transactions", { who: "alice", headers: { "Idempotency-Key": key }, body: { kind: "TRANSFER", destinationAccountId: bobAcc, amount: "100.0000", reference: "Idempotent" } });
check("retry with same key replays (200, no double charge)", r.status === 200 && r.data.data.replayed === true && r.data.data.transactionId === tx2);
r = await req("GET", "/balance", { who: "alice" }); check("alice balance 650 after replay", r.data.balance === 650, String(r.data.balance));
r = await req("POST", "/transactions", { who: "alice", body: { kind: "TRANSFER", destinationAccountId: bobAcc, amount: "5000" } });
check("insufficient funds → 422", r.status === 422 && r.data.code === "INSUFFICIENT_FUNDS", r.data.code);
r = await req("POST", "/transactions", { who: "alice", body: { kind: "TRANSFER", destinationAccountId: aliceAcc, amount: "1" } });
check("self transfer rejected", r.status === 400);

// 5. payments
r = await req("GET", "/payees", { who: "alice" }); check("payees listed", r.status === 200 && r.data.payees.length >= 8, String(r.data.payees?.length));
r = await req("POST", "/transactions", { who: "alice", body: { kind: "BILL_PAYMENT", payeeCode: "steg", amount: "45.5" } });
check("bill without reference → 400", r.status === 400);
r = await req("POST", "/transactions", { who: "alice", body: { kind: "BILL_PAYMENT", payeeCode: "steg", referenceNumber: "CTR-123456", amount: "45.5000" } });
check("STEG bill 45.5", r.status === 201 && r.data.data.counterparty.code === "STEG" && r.data.data.newBalance === 604.5, JSON.stringify(r.data).slice(0, 160));
r = await req("POST", "/transactions", { who: "alice", body: { kind: "MERCHANT_PAYMENT", payeeCode: "CARREFOUR", referenceNumber: "R-99", amount: "30" } });
check("Carrefour purchase 30", r.status === 201 && r.data.data.newBalance === 574.5, JSON.stringify(r.data).slice(0, 120));
r = await req("POST", "/transactions", { who: "alice", body: { kind: "MERCHANT_PAYMENT", payeeCode: "STEG", amount: "30" } });
check("biller code rejected for merchant payment", r.status === 400);
r = await req("POST", "/transactions", { who: "alice", body: { kind: "WITHDRAW", amount: "74.5", note: "ATM" } });
check("withdraw 74.5 → 500 left", r.status === 201 && r.data.data.newBalance === 500, JSON.stringify(r.data).slice(0, 120));

// 6. history + export + detail
r = await req("GET", "/transactions?limit=50", { who: "alice" });
check("alice history has 6 entries", r.status === 200 && r.data.count === 6, String(r.data.count));
const kinds = r.data.transactions.map(t => t.txType).sort().join(",");
check("history kinds", kinds === "BILL_PAYMENT,DEPOSIT,MERCHANT_PAYMENT,TRANSFER,TRANSFER,WITHDRAW", kinds);
const firstEntry = r.data.transactions[0];
r = await req("GET", "/transactions/" + firstEntry.id, { who: "alice" }); check("detail (own)", r.status === 200 && r.data.transaction.id === firstEntry.id);
r = await req("GET", "/transactions/" + firstEntry.id, { who: "bob" });   check("detail (other's) → 403", r.status === 403);
r = await req("GET", "/transactions?txType=TRANSFER", { who: "alice" }); check("filter by txType", r.data.count === 2, String(r.data.count));
r = await req("GET", "/transactions/export?format=csv", { who: "alice" });
check("CSV export", r.status === 200 && String(r.data).includes("Transaction") && (r.headers.get("content-type") || "").includes("text/csv"));
r = await req("GET", "/transactions/export?format=pdf", { who: "alice" });
check("HTML statement", r.status === 200 && String(r.data).includes("Transaction Statement"));
r = await req("GET", "/balance", { who: "bob" }); check("bob received 350", r.data.balance === 350, String(r.data.balance));

// 7. ledger reconciliation + audit (after outbox relay)
await sleep(2500);
r = await req("GET", `/ledger/accounts/${aliceAcc}/reconcile`, { who: "teller" });
check("ledger reconciles alice", r.status === 200 && r.data.consistent === true && r.data.cachedBalance === "500.0000", JSON.stringify(r.data));
r = await req("GET", `/ledger/transactions/${tx1}`, { who: "teller" });
check("double entry balanced", r.status === 200 && r.data.balanced === true && r.data.entries.length === 2);
r = await req("GET", "/admin/outbox/stats", { who: "teller" }); check("outbox drained", r.status === 200 && !r.data.PENDING, JSON.stringify(r.data));
r = await req("GET", "/audit/stats", { who: "teller" });
check("audit consumed events", r.status === 200 && Number(r.data.total) >= 10, JSON.stringify(r.data));
r = await req("GET", `/audit/recent?accountId=${aliceAcc}&limit=50`, { who: "teller" });
check("audit rows for alice (both legs of transfers)", r.status === 200 && r.data.count >= 6, String(r.data.count));

// 8. cancellation with compensating entries → fraud alert closed
r = await req("POST", `/admin/transactions/${tx1}/cancel`, { who: "teller", body: { reason: "Customer dispute — confirmed fraud" } });
check("cancel tx1", r.status === 200 && r.data.ok && r.data.compensations.length === 2, JSON.stringify(r.data).slice(0, 160));
r = await req("POST", `/admin/transactions/${tx1}/cancel`, { who: "teller", body: { reason: "again" } });
check("cancel is idempotent (409)", r.status === 409 && r.data.code === "ALREADY_CANCELLED");
r = await req("GET", "/balance", { who: "alice" }); check("alice refunded to 750", r.data.balance === 750, String(r.data.balance));
r = await req("GET", "/balance", { who: "bob" });   check("bob debited to 100", r.data.balance === 100, String(r.data.balance));
r = await req("GET", `/ledger/accounts/${aliceAcc}/reconcile`, { who: "teller" }); check("reconcile after reversal", r.data.consistent === true, JSON.stringify(r.data));
r = await req("POST", `/admin/transactions/${r.data.accountId ? tx2 : tx2}/cancel`, { who: "alice", body: { reason: "x" } }); check("customer cannot cancel (403)", r.status === 403);

// 9. fraud + quantum + kms (optional services)
r = await req("GET", "/fraud/stats", { who: "teller" });
if (r.status === 200) {
  check("fraud stats", true, JSON.stringify(r.data));
  r = await req("POST", "/fraud/score", { who: "teller", body: { transactionId: "adhoc-" + rnd, accountId: aliceAcc, amount: 50000, timestamp: "2026-01-01T03:00:00Z" } });
  check("fraud ad-hoc score", r.status === 200 && r.data.riskLevel, JSON.stringify(r.data).slice(0, 140));
  await sleep(3000);
  r = await req("GET", "/fraud/alerts?limit=50", { who: "teller" }); check("fraud alerts listed", r.status === 200, String(r.data.alerts?.length));
} else check("fraud-service reachable", false, "status " + r.status + " (service not running)");
r = await req("GET", "/quantum/qrng?bytes=8", { who: "alice" });
if (r.status === 200) {
  check("QRNG 8 bytes", r.data.hex?.length === 16 && r.data.source, r.data.source);
  r = await req("POST", "/quantum/qkd/bb84", { who: "alice", body: { n_qubits: 64, rounds: 2, with_eve: false } }); check("BB84 no Eve accepted", r.status === 200 && r.data.accepted, `qber=${JSON.stringify(r.data.qber_per_round)}`);
  r = await req("POST", "/quantum/qkd/bb84", { who: "alice", body: { n_qubits: 64, rounds: 2, with_eve: true } });  check("BB84 with Eve rejected", r.status === 422 && !r.data.accepted, `qber=${JSON.stringify(r.data.qber_per_round)}`);
  r = await req("POST", "/kms/keys", { who: "teller" }); const kid = r.data.kid; check("KMS mint key", r.status === 201 && kid, JSON.stringify(r.data).slice(0, 120));
  r = await req("GET", `/kms/keys/${kid}`, { who: "teller" }); check("KMS consume once", r.status === 200 && r.data.key_b64);
  r = await req("GET", `/kms/keys/${kid}`, { who: "teller" }); check("KMS second read → 410", r.status === 410);
  r = await req("POST", "/kms/keys", { who: "alice" }); check("customer cannot mint keys (403)", r.status === 403);
} else check("quantum-service reachable", false, "status " + r.status + " (service not running)");

// 10. profile, password, refresh rotation, suspension
r = await req("PUT", "/auth/me", { who: "alice", body: { name: "Alice Updated", email: alice.email, phone: "+216 55 000 000", address: "Tunis" } }); check("update profile", r.status === 200 && r.data.user.name === "Alice Updated");
r = await req("PUT", "/auth/password", { who: "alice", body: { currentPassword: "Passw0rd!x", newPassword: "N3wPassw0rd!" } }); check("change password", r.status === 200);
r = await req("POST", "/auth/customer/login", { body: { username: alice.username, password: "N3wPassw0rd!" } }); check("login with new password", r.status === 200);
r = await req("POST", "/auth/refresh", { body: { refreshToken: aliceRefresh } }); const rotated = r.data.refreshToken; check("refresh rotates", r.status === 200 && rotated);
r = await req("POST", "/auth/refresh", { body: { refreshToken: aliceRefresh } }); check("old refresh token reuse rejected", r.status === 401);
r = await req("PUT", `/admin/users/${bob.id}`, { who: "admin", body: { status: "suspended" } }); check("suspend bob", r.status === 200);
r = await req("POST", "/auth/customer/login", { body: { username: bob.username, password: "Passw0rd!x" } }); check("suspended bob cannot log in", r.status === 401);
r = await req("POST", "/auth/logout", { body: { refreshToken: rotated } }); check("logout", r.status === 200);

const failed = results.filter(x => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
