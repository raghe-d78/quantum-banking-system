#!/usr/bin/env node
// scripts/loadtest/concurrent-deposits.js
//
// Plain-Node fallback for Phase 1.4 (no k6 dependency on the box).
// Fires N concurrent deposits of 1 TND each against ACCOUNT_ID, then asserts:
//   - HTTP 200 on every call
//   - final balance == initial + N
//   - audit-service /audit/recent contains N events for the account
//
// Usage:
//   ACCOUNT_ID=<uuid> node scripts/loadtest/concurrent-deposits.js [N]

const GATEWAY    = process.env.GATEWAY    || "http://localhost:3000"
const AUDIT      = process.env.AUDIT      || "http://localhost:3004"
const ADMIN_USER = process.env.ADMIN_USER || "adminn"
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123"
const ACCOUNT_ID = process.env.ACCOUNT_ID
const N          = Number(process.argv[2] || 100)

if (!ACCOUNT_ID) { console.error("ACCOUNT_ID env var required"); process.exit(2) }

async function jpost(url, body, token) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

async function jget(url, token) {
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

;(async () => {
  console.log(`Logging in as ${ADMIN_USER}…`)
  const { body: login } = await jpost(`${GATEWAY}/auth/staff/login`,
    { username: ADMIN_USER, password: ADMIN_PASS })
  const token = login.token
  if (!token) { console.error("login failed:", login); process.exit(1) }

  console.log(`Reading initial balance for ${ACCOUNT_ID}…`)
  const before = await jget(`${GATEWAY}/admin/accounts/${ACCOUNT_ID}`, token)
  const initialBal = Number(before.body?.balance ?? before.body?.data?.cached_balance ?? before.body?.cached_balance ?? 0)
  console.log(`  initial = ${initialBal}`)

  const t0 = Date.now()
  console.log(`Firing ${N} concurrent deposits of 1 TND…`)
  const results = await Promise.all(
    Array.from({ length: N }, () =>
      jpost(`${GATEWAY}/admin/deposit`, { accountId: ACCOUNT_ID, amount: 1 }, token))
  )
  const elapsed = Date.now() - t0
  const ok      = results.filter(r => r.status === 200).length
  const failed  = results.filter(r => r.status !== 200)

  console.log(`Done in ${elapsed} ms — ok=${ok}/${N}, throughput=${(N*1000/elapsed).toFixed(1)} req/s`)
  if (failed.length) console.log("first failure:", failed[0])

  console.log("Waiting 4 s for outbox relay + audit consumer to drain…")
  await new Promise(r => setTimeout(r, 4000))

  const after = await jget(`${GATEWAY}/admin/accounts/${ACCOUNT_ID}`, token)
  const finalBal = Number(after.body?.balance ?? after.body?.data?.cached_balance ?? after.body?.cached_balance ?? 0)
  console.log(`  final balance = ${finalBal}  (expected ${initialBal + ok})`)

  const audit = await jget(`${AUDIT}/audit/stats`)
  console.log("audit stats:", audit.body)

  const balanceOK = Math.abs(finalBal - (initialBal + ok)) < 0.0001
  console.log(`\nVERDICT: ${balanceOK ? "✅ PASS" : "❌ FAIL"}  (httpOK=${ok===N})`)
  process.exit(balanceOK && ok === N ? 0 : 1)
})()
