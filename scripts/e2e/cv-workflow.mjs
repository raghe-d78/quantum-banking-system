// scripts/e2e/cv-workflow.mjs — CV extension end-to-end (needs the stack + sample checks from make_checks.py).
// Usage: python3 scripts/e2e/make_checks.py && node scripts/e2e/cv-workflow.mjs
// CV extension end-to-end: upload → analysis → attach to transaction → hold → staff release/reject.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const GW = process.env.GATEWAY || "http://localhost:3000";
const DOCS = process.env.DOCS_DIR || new URL("./samples/", import.meta.url).pathname;
const results = []; const check = (n, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${extra ? "  — " + extra : ""}`); };
const j = async (method, path, { body, token, headers = {} } = {}) => {
  const h = { ...headers }; if (token) h.Authorization = `Bearer ${token}`;
  const isForm = body instanceof FormData; if (body && !isForm) h["Content-Type"] = "application/json";
  const r = await fetch(GW + path, { method, headers: h, body: isForm ? body : body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get("content-type") || ""; return { status: r.status, data: ct.includes("json") ? await r.json().catch(() => ({})) : await r.arrayBuffer(), headers: r.headers };
};
const upload = (file, token, fields = {}) => { const fd = new FormData(); fd.append("file", new Blob([readFileSync(DOCS + file)], { type: "image/jpeg" }), file); for (const [k, v] of Object.entries(fields)) fd.append(k, String(v)); return j("POST", "/documents/analyze", { body: fd, token }); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rnd = Math.random().toString(36).slice(2, 7);

const admin = (await j("POST", "/auth/staff/login", { body: { username: "adminn", password: "admin123" } })).data.token;
const u1 = `cv_${rnd}`, u2 = `cvb_${rnd}`;
await j("POST", "/admin/users", { token: admin, body: { username: u1, email: `${u1}@example.com`, name: "Yasmine Trabelsi", password: "Passw0rd!x", role: "customer" } });
await j("POST", "/admin/users", { token: admin, body: { username: u2, email: `${u2}@example.com`, name: "Karim Ben Ali", password: "Passw0rd!x", role: "customer" } });
const t1 = (await j("POST", "/auth/customer/login", { body: { username: u1, password: "Passw0rd!x" } })).data.token;
const t2 = (await j("POST", "/auth/customer/login", { body: { username: u2, password: "Passw0rd!x" } })).data.token;
const acc1 = (await j("GET", "/balance", { token: t1 })).data.accountNumber; const acc2 = (await j("GET", "/balance", { token: t2 })).data.accountNumber;
await j("POST", "/admin/deposit", { token: admin, body: { accountId: acc1, amount: "2000.0000" } });

let r = await j("GET", "/ready"); check("cv upstream ready", r.data.upstreams?.cv === true, JSON.stringify(r.data.upstreams));
r = await j("POST", "/documents/analyze", { token: t1, body: { nope: 1 } }); check("JSON body refused (415)", r.status === 415);
r = await upload("clean.jpg", null); check("upload without token → 401", r.status === 401);

// 1. clean check, matching amount. The duplicate index is global and persistent: if this run's
// samples happen to collide (perceptual hash) with a previous run's, regenerate them and retry.
r = await upload("clean.jpg", t1, { expectedAmount: "320.0000", expectedCurrency: "TND" });
for (let attempt = 0; attempt < 3 && r.data.features?.duplicate_score === 1; attempt++) {
  console.log(`      sample collides with an earlier run's document (${r.data.duplicateOf?.slice(0, 8)}); regenerating samples`);
  execFileSync("python3", [new URL("./make_checks.py", import.meta.url).pathname, "--out", DOCS], { stdio: "inherit" });
  r = await upload("clean.jpg", t1, { expectedAmount: "320.0000", expectedCurrency: "TND" });
}
check("clean check analysed (201)", r.status === 201 && r.data.documentId, JSON.stringify({ status: r.data.status, risk: r.data.riskScore, reasons: r.data.reasons, amount: r.data.ocr?.fields?.amount, date: r.data.ocr?.fields?.date }));
const cleanDoc = r.data;
check("OCR read amount 320 and a date", cleanDoc.ocr?.fields?.amount === 320 && !!cleanDoc.ocr?.fields?.date, JSON.stringify(cleanDoc.ocr?.fields));
check("clean check status CLEAN", cleanDoc.status === "CLEAN", `${cleanDoc.status} risk=${cleanDoc.riskScore} ${cleanDoc.reasons}`);
check("features: amount_match 1, date_validity 1, duplicate 0", cleanDoc.features.amount_match === 1 && cleanDoc.features.date_validity === 1 && cleanDoc.features.duplicate_score === 0, JSON.stringify(cleanDoc.features));
check("image encrypted with KMS/BB84-derived or random key", ["bb84-kms", "os.urandom"].includes(cleanDoc.keySource), cleanDoc.keySource);

// 2. access control + image retrieval
r = await j("GET", `/documents/${cleanDoc.documentId}`, { token: t2 }); check("another customer cannot read the document (403)", r.status === 403);
r = await j("GET", `/documents/${cleanDoc.documentId}/image`, { token: t1 }); check("owner can fetch decrypted image", r.status === 200 && (r.headers.get("content-type") || "").includes("image/jpeg") && r.data.byteLength > 1000, String(r.data.byteLength));
r = await j("GET", "/documents", { token: t1 }); check("customer cannot list documents (403)", r.status === 403);
r = await j("GET", "/documents?status=CLEAN", { token: admin }); check("staff lists documents", r.status === 200 && r.data.documents.length >= 1);

// 3. attach to a transfer → executes, linked
r = await j("POST", "/transactions", { token: t1, body: { kind: "TRANSFER", destinationAccountId: acc2, amount: "320.0000", reference: "Check deposit", documentId: cleanDoc.documentId } });
check("transfer with CLEAN document executes (201)", r.status === 201 && r.data.data.documentId === cleanDoc.documentId && r.data.data.newBalance === 1680, JSON.stringify(r.data).slice(0, 160));
const tx1 = r.data.data.transactionId;
r = await j("GET", `/documents/${cleanDoc.documentId}`, { token: t1 }); check("document linked to the transaction", r.data.transactionId === tx1);
r = await j("POST", "/transactions", { token: t1, body: { kind: "TRANSFER", destinationAccountId: acc2, amount: "320.0000", documentId: cleanDoc.documentId } });
check("document cannot be reused (409)", r.status === 409 && r.data.code === "DOCUMENT_ALREADY_USED");
r = await j("GET", `/ledger/transactions/${tx1}`, { token: admin }); check("ledger rows carry document_id", r.data.entries?.every(e => e.document_id === cleanDoc.documentId), JSON.stringify(r.data.entries?.map(e => e.document_id)));

// 4. duplicate detection: same image again
r = await upload("clean.jpg", t1, { expectedAmount: "320.0000" });
check("re-uploading the same check is flagged duplicate", r.data.features?.duplicate_score === 1 && r.data.requiresReview && r.data.duplicateOf === cleanDoc.documentId, `${r.data.status} ${r.data.reasons} dup=${r.data.duplicateOf?.slice(0, 8)}`);
const dupDoc = r.data;
r = await j("POST", "/transactions", { token: t1, body: { kind: "TRANSFER", destinationAccountId: acc2, amount: "320.0000", documentId: dupDoc.documentId } });
check("duplicate document → transaction HELD (202)", r.status === 202 && r.data.data.held === true, JSON.stringify(r.data).slice(0, 160));
const hold1 = r.data.data.holdId;
r = await j("GET", "/balance", { token: t1 }); check("no money moved for the held transaction", r.data.balance === 1680, String(r.data.balance));

// 5. amount mismatch and stale date
r = await upload("mismatch.jpg", t1, { expectedAmount: "320.0000" });
check("amount mismatch detected", r.data.features?.amount_match === 0 && r.data.reasons.includes("amount_mismatch"), JSON.stringify({ ocr: r.data.ocr?.fields?.amount, status: r.data.status, risk: r.data.riskScore }));
r = await upload("stale.jpg", t1, { expectedAmount: "45.0000" });
check("stale date detected", r.data.features?.date_validity === 0 && r.data.reasons.includes("invalid_date"), JSON.stringify({ date: r.data.ocr?.fields?.date, status: r.data.status, risk: r.data.riskScore }));
r = await upload("tampered.jpg", t1, { expectedAmount: "320.0000" });
check("tampered patch raises tampering score vs clean", r.data.integrity?.tampering_score > cleanDoc.integrity.tampering_score, `tampered=${r.data.integrity?.tampering_score} clean=${cleanDoc.integrity.tampering_score} status=${r.data.status}`);

// 6. staff review: holds list, document panel, reject, release
r = await j("GET", "/admin/holds", { token: admin }); check("staff sees pending hold", r.status === 200 && r.data.holds.some(h => h.id === hold1), String(r.data.count));
r = await j("GET", "/transactions/holds", { token: t1 }); check("customer sees own hold", r.data.holds?.some(h => h.id === hold1));
r = await j("POST", `/admin/holds/${hold1}/release`, { token: t1, body: {} }); check("customer cannot release (403)", r.status === 403);
r = await j("POST", `/admin/holds/${hold1}/reject`, { token: admin, body: { note: "duplicate check" } }); check("staff rejects hold", r.status === 200 && r.data.status === "REJECTED");
r = await j("POST", `/admin/holds/${hold1}/release`, { token: admin, body: {} }); check("decided hold cannot be released (409)", r.status === 409);
// a fresh hold, then release
r = await upload("clean.jpg", t1, { expectedAmount: "100.0000" });   // duplicate again → hold
r = await j("POST", "/transactions", { token: t1, body: { kind: "WITHDRAW", amount: "100.0000", documentId: r.data.documentId } });
check("held withdraw (202)", r.status === 202, JSON.stringify(r.data).slice(0, 100)); const hold2 = r.data.data.holdId;
r = await j("POST", `/admin/holds/${hold2}/release`, { token: admin, body: { note: "verified at the counter" } });
check("staff release executes the parked withdraw", r.status === 200 && r.data.status === "RELEASED" && r.data.transaction?.newBalance === 1580, JSON.stringify(r.data).slice(0, 160));
r = await j("GET", "/balance", { token: t1 }); check("balance after release 1580", r.data.balance === 1580, String(r.data.balance));
r = await j("GET", `/ledger/accounts/${acc1}/reconcile`, { token: admin }); check("ledger still reconciles", r.data.consistent === true, JSON.stringify(r.data));

// 7. fraud scoring consumed the documentId (features v2)
await sleep(3500);
r = await j("POST", "/fraud/score", { token: admin, body: { transactionId: "adhoc-cv-" + rnd, accountId: acc1, amount: 320, timestamp: new Date().toISOString(), documentId: cleanDoc.documentId } });
check("fraud scorer joins document features (v2, 17 dims)", r.status === 200 && r.data._features?.has_document === 1 && Object.keys(r.data._features).length === 17, `schema=${r.data.featureSchemaVersion} dims=${Object.keys(r.data._features || {}).length}`);
r = await j("GET", "/fraud/model-info", { token: admin }); check("models trained on fraud-features-v2", r.data.featureSchemaVersion === "fraud-features-v2" && r.data.baseline?.features?.length === 17, JSON.stringify({ schema: r.data.featureSchemaVersion, n: r.data.baseline?.features?.length }));

// 8. signature enrolment
const fd = new FormData(); fd.append("file", new Blob([readFileSync(DOCS + "clean.jpg")], { type: "image/jpeg" }), "sig.jpg");
const u2id = (await j("GET", `/admin/accounts/${u2}`, { token: admin })).data.userId;
r = await j("POST", `/documents/signatures/${u2id}`, { token: admin, body: fd }); check("staff enrols reference signature", r.status === 201 && r.data.ok, JSON.stringify(r.data));
r = await j("GET", `/documents/signatures/${u2id}`, { token: admin }); check("enrolment visible", r.data.enrolled === true);
r = await upload("clean.jpg", t2, { expectedAmount: "320.0000" });
check("document compared with enrolled signature", r.data.signature?.compared === true && r.data.features.signature_similarity > 0.5, `similarity=${r.data.features?.signature_similarity}`);

const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} CV checks passed`);
process.exit(failed ? 1 : 0);
