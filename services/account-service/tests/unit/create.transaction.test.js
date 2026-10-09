// Unified POST /transactions: kinds, payees, idempotency — all inside one txn.
const { installRepoMocks } = require("../helpers/mocks")
const { client } = installRepoMocks()

const svc         = require("../../src/account.service")
const accountRepo = require("../../src/repositories/account.repository")
const ledgerRepo  = require("../../src/repositories/ledger.repository")
const outboxRepo  = require("../../src/repositories/outbox.repository")

const me = { userId: "u-me", role: "customer" }
const acc = (id, user_id, bal) => ({ id, user_id, cached_balance: bal, currency: "TND", status: "ACTIVE" })
const sqlCalls = () => client.query.mock.calls.map(c => c[0])
const PAYEES = {
  STEG:      { code: "STEG", name: "STEG — Electricity & Gas", kind: "BILLER",   account_id: "acc-steg" },
  CARREFOUR: { code: "CARREFOUR", name: "Carrefour Market",    kind: "MERCHANT", account_id: "acc-carrefour" },
}

beforeEach(() => {
  jest.clearAllMocks()
  ledgerRepo.sumTransferDebitsSince.mockResolvedValue("0")
  accountRepo.findByUserId.mockResolvedValue(acc("acc-me", "u-me", "500.0000"))
  accountRepo.findPayeeByCode.mockImplementation(async (c) => PAYEES[String(c).toUpperCase()] || undefined)
  accountRepo.lockAccounts.mockImplementation(async (_c, ids) => {
    const all = { "acc-me": acc("acc-me", "u-me", "500.0000"), "acc-steg": acc("acc-steg", "u-steg", "0"), "acc-carrefour": acc("acc-carrefour", "u-car", "0"), "acc-bob": acc("acc-bob", "u-bob", "10") }
    return Object.fromEntries(ids.filter(i => all[i]).map(i => [i, all[i]]))
  })
  accountRepo.claimIdempotencyKey.mockResolvedValue({ claimed: true })
  accountRepo.getAccountForUpdateByUserId.mockResolvedValue(acc("acc-me", "u-me", "500.0000"))
})

test("rejects unknown kind and bad amounts before opening a transaction", async () => {
  await expect(svc.createTransaction(me, { kind: "LOAN", amount: 1 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  await expect(svc.createTransaction(me, { kind: "TRANSFER", amount: "x" })).rejects.toMatchObject({ code: "INVALID_AMOUNT" })
  expect(accountRepo.pool.connect).not.toHaveBeenCalled()
})

test("TRANSFER: debits the caller's own account, never a body-supplied source", async () => {
  const r = await svc.createTransaction(me, { kind: "TRANSFER", destinationAccountId: "acc-bob", amount: "25.0000", reference: "lunch", sourceAccountId: "acc-victim" })
  expect(r).toMatchObject({ kind: "TRANSFER", amount: 25, newBalance: 475, counterparty: { accountId: "acc-bob" } })
  expect(accountRepo.lockAccounts).toHaveBeenCalledWith(client, ["acc-me", "acc-bob"])
  expect(ledgerRepo.insertEntry.mock.calls.every(c => c[1].txType === "TRANSFER")).toBe(true)
  expect(sqlCalls()).toEqual(["BEGIN", "COMMIT"])
})

test("BILL_PAYMENT: resolves the biller's settlement account and requires a reference number", async () => {
  await expect(svc.createTransaction(me, { kind: "BILL_PAYMENT", payeeCode: "steg", amount: 40 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  const r = await svc.createTransaction(me, { kind: "BILL_PAYMENT", payeeCode: "steg", referenceNumber: "CTR-778", amount: "40.0000" })
  expect(r).toMatchObject({ kind: "BILL_PAYMENT", amount: 40, newBalance: 460, counterparty: { code: "STEG", accountId: "acc-steg" } })
  expect(r.reference).toBe("STEG — Electricity & Gas · CTR-778")
  expect(ledgerRepo.insertEntry.mock.calls.every(c => c[1].txType === "BILL_PAYMENT")).toBe(true)
  expect(outboxRepo.enqueue.mock.calls[0][1].payload).toMatchObject({ kind: "BILL_PAYMENT", counterparty: { code: "STEG" } })
})

test("MERCHANT_PAYMENT: rejects a biller code and unknown payees", async () => {
  await expect(svc.createTransaction(me, { kind: "MERCHANT_PAYMENT", payeeCode: "STEG", amount: 5 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  await expect(svc.createTransaction(me, { kind: "MERCHANT_PAYMENT", payeeCode: "NOPE", amount: 5 })).rejects.toMatchObject({ code: "NOT_FOUND" })
  const r = await svc.createTransaction(me, { kind: "MERCHANT_PAYMENT", payeeCode: "carrefour", amount: 12.5 })
  expect(r).toMatchObject({ kind: "MERCHANT_PAYMENT", amount: 12.5, counterparty: { code: "CARREFOUR" } })
})

test("WITHDRAW kind uses the locked withdraw path", async () => {
  const r = await svc.createTransaction(me, { kind: "WITHDRAW", amount: "100", note: "atm" })
  expect(r).toMatchObject({ kind: "WITHDRAW", amount: 100, newBalance: 400, counterparty: null })
  expect(accountRepo.getAccountForUpdateByUserId).toHaveBeenCalledWith(client, "u-me")
})

test("daily cap counts payments too", async () => {
  ledgerRepo.sumTransferDebitsSince.mockResolvedValue("9990.0000")
  await expect(svc.createTransaction(me, { kind: "MERCHANT_PAYMENT", payeeCode: "CARREFOUR", amount: 20 }))
    .rejects.toMatchObject({ code: "DAILY_LIMIT_EXCEEDED" })
})

describe("Idempotency-Key", () => {
  test("rejects malformed keys", async () => {
    await expect(svc.createTransaction(me, { kind: "WITHDRAW", amount: 1 }, "bad key!")).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })
  test("first call claims the key and stores the response", async () => {
    const r = await svc.createTransaction(me, { kind: "WITHDRAW", amount: 1 }, "key-00000001")
    expect(accountRepo.claimIdempotencyKey).toHaveBeenCalledWith(client, "u-me", "key-00000001")
    expect(accountRepo.storeIdempotentResponse).toHaveBeenCalledWith(client, "u-me", "key-00000001", expect.objectContaining({ transactionId: r.transactionId }))
    expect(r.replayed).toBeUndefined()
  })
  test("retry replays the stored response without writing anything", async () => {
    accountRepo.claimIdempotencyKey.mockResolvedValue({ claimed: false, response: { transactionId: "old", kind: "WITHDRAW", amount: 1 } })
    const r = await svc.createTransaction(me, { kind: "WITHDRAW", amount: 1 }, "key-00000001")
    expect(r).toMatchObject({ transactionId: "old", replayed: true })
    expect(ledgerRepo.insertEntry).not.toHaveBeenCalled()
    expect(accountRepo.updateBalance).not.toHaveBeenCalled()
  })
  test("concurrent duplicate → 409 IDEMPOTENT_IN_PROGRESS", async () => {
    accountRepo.claimIdempotencyKey.mockResolvedValue({ claimed: false, response: null })
    await expect(svc.createTransaction(me, { kind: "WITHDRAW", amount: 1 }, "key-00000001")).rejects.toMatchObject({ code: "IDEMPOTENT_IN_PROGRESS", status: 409 })
  })
})
