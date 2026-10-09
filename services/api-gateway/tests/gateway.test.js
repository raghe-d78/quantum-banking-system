process.env.NODE_ENV = "test"
process.env.LOG_LEVEL = "error"
jest.mock("axios", () => {
  const fn = jest.fn()
  fn.get = jest.fn(); fn.post = jest.fn()
  return fn
})
jest.mock("redis", () => ({ createClient: () => ({ on: jest.fn(), connect: jest.fn(async () => {}), quit: jest.fn(async () => {}), sendCommand: jest.fn() }) }))

const axios   = require("axios")
const request = require("supertest")
const jwt     = require("jsonwebtoken")
const app     = require("../src/app")

const SECRET = process.env.JWT_SECRET || "supersecret_change_in_prod"
const tok = (role, userId = "u1") => jwt.sign({ userId, role }, SECRET)
const upstream = (status, data, headers = {}) => axios.mockResolvedValue({ status, data, headers })

beforeEach(() => jest.clearAllMocks())

describe("public surface", () => {
  test("health + docs are open", async () => {
    expect((await request(app).get("/health")).statusCode).toBe(200)
    const d = await request(app).get("/docs.json")
    expect(d.statusCode).toBe(200); expect(d.body).toHaveProperty("openapi")
  })
  test("login is proxied without a token", async () => {
    upstream(200, { token: "t" })
    const res = await request(app).post("/auth/customer/login").send({ username: "a", password: "b" })
    expect(res.statusCode).toBe(200)
    expect(axios.mock.calls[0][0]).toMatchObject({ method: "POST", url: expect.stringMatching(/identity-service:3001\/auth\/customer\/login$/), data: { username: "a", password: "b" } })
  })
})

describe("authentication at the edge", () => {
  test.each(["/balance", "/transactions", "/quantum/qrng", "/fraud/alerts", "/kms/keys/abc", "/admin/users"])("401 on %s without token", async (p) => {
    const res = await request(app).get(p)
    expect(res.statusCode).toBe(401)
    expect(axios).not.toHaveBeenCalled()
  })
  test("401 on garbage token", async () => {
    expect((await request(app).get("/balance").set("Authorization", "Bearer nope")).statusCode).toBe(401)
  })
})

describe("role gates", () => {
  test.each(["/fraud/alerts", "/fraud/stats", "/kms/keys/abc", "/admin/users", "/admin/accounts/x", "/ledger/entries/1", "/audit/stats"])(
    "customer gets 403 on %s and nothing is proxied", async (p) => {
      const res = await request(app).get(p).set("Authorization", `Bearer ${tok("customer")}`)
      expect(res.statusCode).toBe(403)
      expect(axios).not.toHaveBeenCalled()
    })
  test("employee passes staff gate", async () => {
    upstream(200, { alerts: [] })
    const res = await request(app).get("/fraud/alerts?limit=5").set("Authorization", `Bearer ${tok("employee")}`)
    expect(res.statusCode).toBe(200)
    expect(axios.mock.calls[0][0]).toMatchObject({ url: expect.stringMatching(/fraud-service:3007\/fraud\/alerts$/), params: { limit: "5" } })
  })
  test("customer can use quantum demos", async () => {
    upstream(200, { hex: "aa" })
    const res = await request(app).get("/quantum/qrng?bytes=1").set("Authorization", `Bearer ${tok("customer")}`)
    expect(res.statusCode).toBe(200)
    expect(axios.mock.calls[0][0].url).toMatch(/quantum-service:3005\/qrng$/)
  })
})

describe("proxy behaviour", () => {
  const auth = { Authorization: `Bearer ${tok("customer", "me")}` }
  test("forwards Authorization, request id and query params", async () => {
    upstream(200, { transactions: [] })
    const res = await request(app).get("/transactions?type=DEBIT&limit=5").set(auth).set("X-Request-Id", "req-12345678")
    expect(res.statusCode).toBe(200)
    expect(res.headers["x-request-id"]).toBe("req-12345678")
    const cfg = axios.mock.calls[0][0]
    expect(cfg.params).toEqual({ type: "DEBIT", limit: "5" })
    expect(cfg.headers.Authorization).toBe(auth.Authorization)
    expect(cfg.headers["X-Request-Id"]).toBe("req-12345678")
  })
  test("/admin/deposit is rewritten to account-service /deposit", async () => {
    upstream(200, { ok: 1 })
    await request(app).post("/admin/deposit").set("Authorization", `Bearer ${tok("employee")}`).send({ accountId: "a", amount: 1 })
    expect(axios.mock.calls[0][0].url).toMatch(/account-service:3002\/deposit$/)
  })
  test("upstream status/body propagate", async () => {
    upstream(429, { code: "DAILY_LIMIT_EXCEEDED" })
    const res = await request(app).post("/transfer").set(auth).send({ amount: 1 })
    expect(res.statusCode).toBe(429)
    expect(res.body.code).toBe("DAILY_LIMIT_EXCEEDED")
  })
  test("network failure → 502, timeout → 504", async () => {
    axios.mockRejectedValueOnce(new Error("ECONNREFUSED"))
    expect((await request(app).get("/balance").set(auth)).statusCode).toBe(502)
    const e = new Error("timeout"); e.code = "ECONNABORTED"
    axios.mockRejectedValueOnce(e)
    expect((await request(app).get("/balance").set(auth)).statusCode).toBe(504)
  })
  test("raw export passthrough keeps content headers", async () => {
    axios.get.mockResolvedValue({ status: 200, data: Buffer.from("a,b"), headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=\"x.csv\"" } })
    const res = await request(app).get("/transactions/export?format=csv").set(auth)
    expect(res.statusCode).toBe(200)
    expect(res.headers["content-type"]).toMatch(/text\/csv/)
    expect(res.headers["content-disposition"]).toMatch(/attachment/)
    expect(res.text).toBe("a,b")
  })
  test("unknown route → 404 JSON", async () => {
    expect((await request(app).get("/nope").set(auth)).statusCode).toBe(404)
  })
  test("POST /transactions forwards body and Idempotency-Key", async () => {
    upstream(201, { success: true })
    const res = await request(app).post("/transactions").set(auth).set("Idempotency-Key", "abc-12345678").send({ kind: "WITHDRAW", amount: "5" })
    expect(res.statusCode).toBe(201)
    const cfg = axios.mock.calls[0][0]
    expect(cfg.url).toMatch(/account-service:3002\/transactions$/)
    expect(cfg.headers["Idempotency-Key"]).toBe("abc-12345678")
    expect(cfg.data).toEqual({ kind: "WITHDRAW", amount: "5" })
  })
  test("multipart upload is forwarded raw with its boundary; JSON bodies are refused", async () => {
    axios.mockResolvedValue({ status: 201, data: { documentId: "d1" } })
    const res = await request(app).post("/documents/analyze").set(auth)
      .attach("file", Buffer.from([0xff, 0xd8, 0xff, 0x00]), { filename: "check.jpg", contentType: "image/jpeg" })
      .field("expectedAmount", "25.0000")
    expect(res.statusCode).toBe(201)
    const cfg = axios.mock.calls[0][0]
    expect(cfg.url).toMatch(/document-cv-service:3008\/documents\/analyze$/)
    expect(cfg.headers["Content-Type"]).toMatch(/^multipart\/form-data; boundary=/)
    expect(Buffer.isBuffer(cfg.data) && cfg.data.length > 50).toBe(true)
    const bad = await request(app).post("/documents/analyze").set(auth).send({ nope: 1 })
    expect(bad.statusCode).toBe(415)
  })
  test("document listing and signature enrolment are staff-only; own document read is not", async () => {
    expect((await request(app).get("/documents").set(auth)).statusCode).toBe(403)
    expect((await request(app).get("/documents/signatures/u1").set(auth)).statusCode).toBe(403)
    axios.mockResolvedValue({ status: 200, data: { documentId: "d1" } })
    expect((await request(app).get("/documents/d1").set(auth)).statusCode).toBe(200)
  })
  test("security headers present", async () => {
    const res = await request(app).get("/health")
    expect(res.headers["x-content-type-options"]).toBe("nosniff")
    expect(res.headers["x-powered-by"]).toBeUndefined()
  })
})
