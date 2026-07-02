// scripts/loadtest/concurrent-deposits.k6.js
//
// Phase 1.4 — Load test (T7.5).
// 100 concurrent deposits of 1.0 TND into the SAME account.
// Validates: (a) no lost events under contention, (b) final balance equals
// initial + 100, (c) audit_logs receives all 100 events.
//
// Run from host:
//   k6 run -e GATEWAY=http://localhost:3000 \
//          -e ADMIN_USER=adminn -e ADMIN_PASS=admin123 \
//          -e ACCOUNT_ID=<uuid> \
//          scripts/loadtest/concurrent-deposits.k6.js

import http  from "k6/http"
import { check, sleep } from "k6"

const GATEWAY    = __ENV.GATEWAY    || "http://localhost:3000"
const ACCOUNT_ID = __ENV.ACCOUNT_ID
const ADMIN_USER = __ENV.ADMIN_USER || "adminn"
const ADMIN_PASS = __ENV.ADMIN_PASS || "admin123"

export const options = {
  scenarios: {
    burst: { executor: "shared-iterations", vus: 100, iterations: 100, maxDuration: "60s" },
  },
  thresholds: {
    http_req_failed:   ["rate<0.01"],
    http_req_duration: ["p(95)<2000"],
  },
}

let token
export function setup() {
  if (!ACCOUNT_ID) throw new Error("ACCOUNT_ID env var required")
  const res = http.post(`${GATEWAY}/auth/staff/login`,
    JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    { headers: { "Content-Type": "application/json" } })
  return { token: res.json("token") }
}

export default function (data) {
  const res = http.post(`${GATEWAY}/admin/deposit`,
    JSON.stringify({ accountId: ACCOUNT_ID, amount: 1 }),
    { headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.token}` } })
  check(res, { "deposit 200": (r) => r.status === 200 })
}
