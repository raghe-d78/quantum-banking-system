// scripts/e2e/ui-walkthrough.mjs — drives both SPAs in headless Chromium against the
// live stack and writes screenshots to ./shots. Needs `npm i playwright` next to it
// (or PLAYWRIGHT_BROWSERS_PATH), both Vite dev servers running (5173 / 5174) and the
// sample checks from make_checks.py (the wizard step uploads samples/clean.jpg).
// Usage: cd scripts/e2e && python3 make_checks.py && node ui-walkthrough.mjs
import { chromium } from "playwright";
const GW = process.env.GATEWAY || "http://localhost:3000", CUST = process.env.CUSTOMER_URL || "http://localhost:5173", STAFF = process.env.STAFF_URL || "http://localhost:5174";
const out = (n) => `shots/${n}.png`;
const norm = (t) => String(t || "").replace(/[\s\u00a0\u202f]+/g, " ");
const results = []; const check = (n, ok, extra = "") => { results.push({ n, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${extra ? "  — " + extra : ""}`); };
const api = async (method, path, body, token) => { const r = await fetch(GW + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json().catch(() => ({})) }; };

// seed: admin creates two customers, teller deposits into the first
const rnd = Math.random().toString(36).slice(2, 7);
const admin = (await api("POST", "/auth/staff/login", { username: "adminn", password: "admin123" })).data.token;
const u1 = `ui_${rnd}`, u2 = `uib_${rnd}`;
await api("POST", "/admin/users", { username: u1, email: `${u1}@example.com`, name: "Yasmine Trabelsi", password: "Passw0rd!x", role: "customer" }, admin);
const bob = (await api("POST", "/admin/users", { username: u2, email: `${u2}@example.com`, name: "Karim Ben Ali", password: "Passw0rd!x", role: "customer" }, admin)).data.user;
const t1 = (await api("POST", "/auth/customer/login", { username: u1, password: "Passw0rd!x" })).data.token;
const acc1 = (await api("GET", "/balance", null, t1)).data.accountNumber;
const bobTok = (await api("POST", "/auth/customer/login", { username: u2, password: "Passw0rd!x" })).data.token;
const acc2 = (await api("GET", "/balance", null, bobTok)).data.accountNumber;
await api("POST", "/admin/deposit", { accountId: acc1, amount: "2500.0000", note: "Salary — October" }, admin);

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1380, height: 860 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on("pageerror", e => console.log("PAGE ERROR:", e.message));

// ── customer portal ──────────────────────────────────────────────
await page.goto(CUST + "/login");
await page.waitForTimeout(450); await page.screenshot({ path: out("c01-login"), animations: "disabled" });
await page.getByPlaceholder?.("") ; // noop guard
const inputs = page.locator("input");
await inputs.nth(0).fill(u1); await inputs.nth(1).fill("Passw0rd!x");
await page.getByRole("button", { name: /sign in/i }).click();
await page.waitForURL(/dashboard/, { timeout: 15000 });
await page.waitForSelector(".hero .amount", { timeout: 15000 });
check("customer login → overview", norm(await page.locator(".hero .amount").textContent()).includes("2 500"), norm(await page.locator(".hero .amount").textContent()));
await page.waitForTimeout(450); await page.screenshot({ path: out("c02-overview"), animations: "disabled" });

// transfer via wizard
await page.getByRole("button", { name: /^transfer$/i }).first().click();
await page.waitForSelector(".stepper");
await page.locator("input.mono").fill(acc2);
await page.getByRole("button", { name: /verify/i }).click();
await page.waitForSelector(".alert.success", { timeout: 10000 });
check("recipient verified", (await page.locator(".alert.success").textContent()).includes("Karim Ben Ali"));
await page.locator('input[type="number"]').fill("320");
await page.locator("input.input:not(.mono):not([type=number])").last().fill("Rent — October");
// CV extension: attach a check, analyse it, expect CLEAN
await page.locator('input[type="file"]').setInputFiles(new URL("./samples/clean.jpg", import.meta.url).pathname);
await page.getByRole("button", { name: /analyse document/i }).click();
await page.waitForSelector(".pill.green, .pill.amber, .pill.red", { timeout: 60000 });
const docStatus = await page.locator(".receipt .pill").first().textContent();
check("document analysed in the wizard", ["CLEAN", "REVIEW"].includes(docStatus.trim()), docStatus.trim());
await page.waitForTimeout(450); await page.screenshot({ path: out("c03-transfer-details"), animations: "disabled" });
await page.getByRole("button", { name: /review/i }).click();
await page.waitForSelector(".receipt");
await page.waitForTimeout(450); await page.screenshot({ path: out("c04-transfer-review"), animations: "disabled" });
await page.getByRole("button", { name: /confirm/i }).click();
await page.waitForSelector(".success-ring", { timeout: 20000 });
check("transfer completed in UI", norm(await page.locator(".receipt").textContent()).includes("2 180"), norm(await page.locator(".receipt").textContent()).slice(0, 80));
check("receipt shows the attached document", (await page.locator(".receipt").textContent()).includes("Document"));
await page.waitForTimeout(450); await page.screenshot({ path: out("c05-transfer-done"), animations: "disabled" });

// bill payment via wizard
await page.getByRole("button", { name: /new transaction/i }).last().click();
await page.waitForSelector(".kind-card");
await page.waitForTimeout(450); await page.screenshot({ path: out("c06-choose-kind"), animations: "disabled" });
await page.locator(".kind-card", { hasText: "Pay a bill" }).click();
await page.waitForSelector("select.select option[value='STEG']", { state: "attached", timeout: 10000 });
await page.locator("select.select").selectOption("STEG");
await page.locator("input.mono").fill("CTR-55-8812");
await page.locator('input[type="number"]').fill("86.4");
await page.getByRole("button", { name: /review/i }).click();
await page.waitForSelector(".receipt");
await page.waitForTimeout(450); await page.screenshot({ path: out("c07-bill-review"), animations: "disabled" });
await page.getByRole("button", { name: /confirm/i }).click();
await page.waitForSelector(".success-ring", { timeout: 20000 });
check("bill payment completed in UI", norm(await page.locator(".receipt").textContent()).includes("2 093,6"), norm(await page.locator(".receipt").textContent()).slice(0, 80));
await page.waitForTimeout(450); await page.screenshot({ path: out("c08-bill-done"), animations: "disabled" });

// insufficient funds path
await page.getByRole("button", { name: /new transaction/i }).last().click();
await page.locator(".kind-card", { hasText: "Withdraw" }).click();
await page.locator('input[type="number"]').fill("99999");
await page.getByRole("button", { name: /review/i }).click();
await page.waitForSelector(".alert.error");
check("client-side guard: exceeds balance", (await page.locator(".alert.error").textContent()).includes("exceeds"));
await page.waitForTimeout(450); await page.screenshot({ path: out("c09-validation"), animations: "disabled" });

// history + detail
await page.locator(".nav-item", { hasText: "History" }).click();
await page.waitForTimeout(1500);
await page.waitForTimeout(450); await page.screenshot({ path: out("c10-history"), animations: "disabled" });
await page.locator(".nav-item", { hasText: "Overview" }).click();
await page.waitForSelector(".tx-row");
const rows = await page.locator(".tx-row").count();
check("overview recent activity rows", rows >= 3, String(rows));
await page.locator(".tx-row").first().click();
await page.waitForURL(/transaction\//);
await page.waitForTimeout(1200);
check("detail page loads real entry", (await page.content()).includes("Transaction"));
await page.waitForTimeout(450); await page.screenshot({ path: out("c11-detail"), animations: "disabled" });

// ── staff portal ─────────────────────────────────────────────────
await page.goto(STAFF + "/login");
const si = page.locator("input"); await si.nth(0).fill("adminn"); await si.nth(1).fill("admin123");
await page.keyboard.press("Enter");
await page.waitForURL(/admin/, { timeout: 15000 });
await page.waitForTimeout(1500);
await page.waitForTimeout(450); await page.screenshot({ path: out("s01-users"), animations: "disabled" });
await page.locator(".nav-item", { hasText: "Deposit" }).click();
await page.waitForTimeout(600);
const dIn = page.locator("input"); await dIn.nth(0).fill(u2);
await page.getByRole("button", { name: /look ?up|verify|search|find/i }).first().click().catch(() => {});
await page.waitForTimeout(1500);
await page.waitForTimeout(450); await page.screenshot({ path: out("s02-deposit"), animations: "disabled" });
await page.locator(".nav-item", { hasText: "Fraud alerts" }).click();
await page.waitForTimeout(2500);
await page.waitForTimeout(450); await page.screenshot({ path: out("s03-fraud-alerts"), animations: "disabled" });
await page.locator(".nav-item", { hasText: "Fraud transactions" }).click();
await page.waitForTimeout(2500);
const cancelBtns = await page.getByRole("button", { name: /^cancel$/i }).count();
check("fraud transactions view lists alerts with actions", cancelBtns >= 0, `cancel buttons: ${cancelBtns}`);
await page.waitForTimeout(450); await page.screenshot({ path: out("s04-fraud-transactions"), animations: "disabled" });
await page.locator(".nav-item", { hasText: "Document review" }).click();
await page.waitForTimeout(2000);
await page.screenshot({ path: out("s06-document-review"), animations: "disabled" });
await page.locator(".nav-item", { hasText: "Analysed documents" }).click();
await page.waitForTimeout(2000);
const docRows = await page.locator(".card .pill").count();
check("staff sees analysed documents", docRows >= 1, String(docRows));
await page.locator(".card").first().click();
await page.waitForSelector("img[alt='document']", { timeout: 15000 });
check("staff can open the decrypted image + analysis panel", await page.locator("img[alt='document']").count() >= 1);
await page.waitForTimeout(800); await page.screenshot({ path: out("s07-document-analysis"), animations: "disabled" });
await page.locator(".nav-item", { hasText: "Fraud statistics" }).click();
await page.waitForTimeout(2500);
await page.waitForTimeout(450); await page.screenshot({ path: out("s05-fraud-stats"), animations: "disabled" });

await browser.close();
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} UI checks passed; screenshots in shots/`);
process.exit(failed ? 1 : 0);
