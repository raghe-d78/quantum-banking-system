// Route-level tests: auth gates, status-code mapping, request shaping.
const { installRepoMocks } = require("../helpers/mocks")
installRepoMocks()
jest.doMock("../../src/account.service", () => ({
  createAccount: jest.fn(), getBalance: jest.fn(), deposit: jest.fn(), withdraw: jest.fn(),
  transfer: jest.fn(), cancelTransaction: jest.fn(), createTransaction: jest.fn(), listPayees: jest.fn(),
}))
jest.doMock("axios", () => ({ get: jest.fn(), post: jest.fn() }))

const request = require("supertest")
const jwt     = require("jsonwebtoken")
const app     = require("../../src/app")
const svc     = require("../../src/account.service")
const accountRepo = require("../../src/repositories/account.repository")
const { AppError, E } = require("/shared/errors")

const SECRET = process.env.JWT_SECRET || "supersecret_change_in_prod"
const tok = (role, userId = "test-uuid") => jwt.sign({ userId, role }, SECRET)

beforeEach(() => jest.clearAllMocks())

describe("auth gates", () => {
  test("401 without token", async () => {
    expect((await request(app).get("/balance")).statusCode).toBe(401)
    expect((await request(app).post("/accounts/create").send({})).statusCode).toBe(401)
  })
  test("401 with token of unknown role", async () => {
    const res = await request(app).get("/balance").set("Authorization", `Bearer ${tok("user")}`)
    expect(res.statusCode).toBe(401)
  })
  test("403 when customer hits staff/admin routes", async () => {
    expect((await request(app).post("/accounts/create").set("Authorization", `Bearer ${tok("customer")}`).send({ userId: "x" })).statusCode).toBe(403)
    expect((await request(app).post("/deposit").set("Authorization", `Bearer ${tok("customer")}`).send({})).statusCode).toBe(403)
    expect((await request(app).post("/admin/transactions/t/cancel").set("Authorization", `Bearer ${tok("customer")}`).send({})).statusCode).toBe(403)
  })
  test("employee cannot create accounts (admin only)", async () => {
    expect((await request(app).post("/accounts/create").set("Authorization", `Bearer ${tok("employee")}`).send({ userId: "x" })).statusCode).toBe(403)
  })
})

describe("POST /accounts/create", () => {
  test("admin creates", async () => {
    svc.createAccount.mockResolvedValue({ account: { id: "acc", currency: "TND" } })
    const res = await request(app).post("/accounts/create").set("Authorization", `Bearer ${tok("admin")}`).send({ userId: "u" })
    expect(res.statusCode).toBe(201)
    expect(res.body.account.currency).toBe("TND")
  })
})

describe("GET /balance", () => {
  test("returns balance for the token's user", async () => {
    svc.getBalance.mockResolvedValue({ balance: 1500, currency: "TND" })
    const res = await request(app).get("/balance").set("Authorization", `Bearer ${tok("customer", "u-9")}`)
    expect(res.statusCode).toBe(200)
    expect(svc.getBalance).toHaveBeenCalledWith("u-9")
  })
  test("maps NOT_FOUND to 404", async () => {
    svc.getBalance.mockRejectedValue(E.notFound("Account not found"))
    const res = await request(app).get("/balance").set("Authorization", `Bearer ${tok("customer")}`)
    expect(res.statusCode).toBe(404)
    expect(res.body.code).toBe("NOT_FOUND")
  })
})

describe("POST /transfer", () => {
  test("passes the JWT payload as actor", async () => {
    svc.transfer.mockResolvedValue({ transactionId: "t" })
    const res = await request(app).post("/transfer").set("Authorization", `Bearer ${tok("customer", "u-1")}`)
      .send({ sourceAccountId: "A", destinationAccountId: "B", amount: 10, reference: "r" })
    expect(res.statusCode).toBe(200)
    expect(svc.transfer).toHaveBeenCalledWith("A", "B", 10, { reference: "r", actor: expect.objectContaining({ userId: "u-1", role: "customer" }) })
  })
  test.each([
    [E.forbidden(), 403], [E.insufficientFunds(), 422], [E.dailyLimit("x"), 429],
    [E.currencyMismatch(), 400], [E.notFound(), 404], [new Error("boom"), 500],
  ])("maps %p → %i", async (err, status) => {
    svc.transfer.mockRejectedValue(err)
    const res = await request(app).post("/transfer").set("Authorization", `Bearer ${tok("customer")}`).send({ sourceAccountId: "A", destinationAccountId: "B", amount: 1 })
    expect(res.statusCode).toBe(status)
    if (status === 500) expect(res.body.message).toBe("Internal server error")
  })
})

describe("POST /withdraw", () => {
  test("uses token user, never body account", async () => {
    svc.withdraw.mockResolvedValue({ ok: 1 })
    await request(app).post("/withdraw").set("Authorization", `Bearer ${tok("customer", "me")}`).send({ amount: "5.0000", note: "n", accountId: "someone-else" })
    expect(svc.withdraw).toHaveBeenCalledWith("me", "5.0000", "n")
  })
})

describe("POST /deposit (staff)", () => {
  test("forwards actor", async () => {
    svc.deposit.mockResolvedValue({ balance: 1 })
    const res = await request(app).post("/deposit").set("Authorization", `Bearer ${tok("employee", "emp")}`).send({ accountId: "A", amount: "10.0000" })
    expect(res.statusCode).toBe(200)
    expect(svc.deposit).toHaveBeenCalledWith("A", "10.0000", { actor: expect.objectContaining({ userId: "emp" }), note: undefined })
  })
})

describe("POST /admin/transactions/:id/cancel", () => {
  const call = (body = { reason: "fraud confirmed" }) =>
    request(app).post("/admin/transactions/tx-1/cancel").set("Authorization", `Bearer ${tok("employee")}`).send(body)
  test("200 ok", async () => {
    svc.cancelTransaction.mockResolvedValue({ ok: true, cancellationId: "c" })
    const res = await call()
    expect(res.statusCode).toBe(200)
    expect(svc.cancelTransaction).toHaveBeenCalledWith("tx-1", { reason: "fraud confirmed", cancelledBy: "test-uuid" })
  })
  test.each([
    ["ALREADY_CANCELLED", 409], ["NOT_FOUND", 404], ["INVALID_TARGET", 422], ["VALIDATION_ERROR", 400], ["REVERSAL_INSUFFICIENT_FUNDS", 409],
  ])("%s → %i", async (code, status) => {
    svc.cancelTransaction.mockRejectedValue(new AppError(code, "x", status))
    const res = await call()
    expect(res.statusCode).toBe(status)
    expect(res.body.code).toBe(code)
  })
})

describe("GET /accounts/verify/:id", () => {
  test("returns only non-sensitive fields", async () => {
    accountRepo.findById.mockResolvedValue({ id: "acc-1", user_id: "u", currency: "TND", cached_balance: "999", status: "ACTIVE" })
    require("axios").get.mockRejectedValue(new Error("down"))
    const res = await request(app).get("/accounts/verify/acc-1").set("Authorization", `Bearer ${tok("customer")}`)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ accountId: "acc-1", name: "Account acc-1", currency: "TND", status: "ACTIVE" })
    expect(res.body).not.toHaveProperty("balance")
  })
})

describe("POST /transactions + GET /payees", () => {
  test("forwards actor, body and Idempotency-Key; 201 on create, 200 on replay", async () => {
    svc.createTransaction.mockResolvedValueOnce({ transactionId: "t1", kind: "WITHDRAW" })
    let res = await request(app).post("/transactions").set("Authorization", `Bearer ${tok("customer", "u-7")}`).set("Idempotency-Key", "k-12345678").send({ kind: "WITHDRAW", amount: "5" })
    expect(res.statusCode).toBe(201)
    expect(svc.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ userId: "u-7" }), { kind: "WITHDRAW", amount: "5" }, "k-12345678")
    svc.createTransaction.mockResolvedValueOnce({ transactionId: "t1", replayed: true })
    res = await request(app).post("/transactions").set("Authorization", `Bearer ${tok("customer", "u-7")}`).send({ kind: "WITHDRAW", amount: "5" })
    expect(res.statusCode).toBe(200)
    expect(svc.createTransaction.mock.calls[1][2]).toBeNull()
  })
  test("payees are listed for any authenticated role", async () => {
    svc.listPayees.mockResolvedValue([{ code: "STEG", name: "STEG", kind: "BILLER", category: "Utilities", reference_hint: "Contract" }])
    const res = await request(app).get("/payees?kind=BILLER").set("Authorization", `Bearer ${tok("customer")}`)
    expect(res.statusCode).toBe(200)
    expect(res.body.payees[0]).toEqual({ code: "STEG", name: "STEG", kind: "BILLER", category: "Utilities", referenceHint: "Contract" })
    expect(svc.listPayees).toHaveBeenCalledWith({ kind: "BILLER" })
    expect((await request(app).get("/payees")).statusCode).toBe(401)
  })
})

describe("misc", () => {
  test("health + unknown route + malformed JSON", async () => {
    expect((await request(app).get("/health")).statusCode).toBe(200)
    expect((await request(app).get("/nope")).statusCode).toBe(404)
    const res = await request(app).post("/transfer").set("Authorization", `Bearer ${tok("customer")}`).set("Content-Type", "application/json").send("{bad")
    expect(res.statusCode).toBe(400)
    expect(res.body.code).toBe("BAD_JSON")
  })
})
