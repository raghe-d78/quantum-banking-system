// API tests for /admin/transactions/:id/cancel and /transfer.
jest.mock("../../src/account.service", () => ({
  cancelTransaction: jest.fn(),
  transfer:          jest.fn(),
  deposit:           jest.fn(),
  getBalance:        jest.fn(),
  createAccount:     jest.fn(),
}))
jest.mock("../../src/account.repository", () => ({
  create: jest.fn(), findByUserId: jest.fn(), findById: jest.fn(),
}))

const request = require("supertest")
const app     = require("../../src/app")
const svc     = require("../../src/account.service")
const jwt     = require("jsonwebtoken")

const SECRET = process.env.JWT_SECRET || "supersecret_change_in_prod"
const tok = (role, userId = "test-uuid") => jwt.sign({ userId, role }, SECRET)

describe("POST /admin/transactions/:id/cancel", () => {
  beforeEach(() => jest.clearAllMocks())

  test("staff can cancel transaction", async () => {
    svc.cancelTransaction.mockResolvedValue({ ok: true, cancellationId: "cid-1" })
    const res = await request(app)
      .post("/admin/transactions/tx-1/cancel")
      .set("Authorization", `Bearer ${tok("employee")}`)
      .send({ reason: "fraud confirmed" })
    expect(res.statusCode).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  test("non-staff is rejected (403)", async () => {
    const res = await request(app)
      .post("/admin/transactions/tx-1/cancel")
      .set("Authorization", `Bearer ${tok("user")}`)
      .send({ reason: "fraud confirmed" })
    expect(res.statusCode).toBe(403)
  })

  test("missing token (401)", async () => {
    const res = await request(app).post("/admin/transactions/tx-1/cancel").send({ reason: "fraud confirmed" })
    expect(res.statusCode).toBe(401)
  })

  test("ALREADY_CANCELLED maps to 409", async () => {
    const e = new Error("Transaction already cancelled"); e.code = "ALREADY_CANCELLED"
    svc.cancelTransaction.mockRejectedValue(e)
    const res = await request(app)
      .post("/admin/transactions/tx-1/cancel")
      .set("Authorization", `Bearer ${tok("employee")}`)
      .send({ reason: "fraud confirmed" })
    expect(res.statusCode).toBe(409)
  })

  test("NOT_FOUND maps to 404", async () => {
    const e = new Error("nope"); e.code = "NOT_FOUND"
    svc.cancelTransaction.mockRejectedValue(e)
    const res = await request(app)
      .post("/admin/transactions/tx-1/cancel")
      .set("Authorization", `Bearer ${tok("employee")}`)
      .send({ reason: "fraud confirmed" })
    expect(res.statusCode).toBe(404)
  })

  test("INVALID_TARGET maps to 422", async () => {
    const e = new Error("can't"); e.code = "INVALID_TARGET"
    svc.cancelTransaction.mockRejectedValue(e)
    const res = await request(app)
      .post("/admin/transactions/tx-1/cancel")
      .set("Authorization", `Bearer ${tok("employee")}`)
      .send({ reason: "fraud confirmed" })
    expect(res.statusCode).toBe(422)
  })

  test("missing reason maps to 400", async () => {
    const e = new Error("reason required (min 3 chars)")
    svc.cancelTransaction.mockRejectedValue(e)
    const res = await request(app)
      .post("/admin/transactions/tx-1/cancel")
      .set("Authorization", `Bearer ${tok("employee")}`)
      .send({})
    expect(res.statusCode).toBe(400)
  })
})

describe("GET /health", () => {
  test("returns 200", async () => {
    const res = await request(app).get("/health")
    expect(res.statusCode).toBe(200)
  })
})
