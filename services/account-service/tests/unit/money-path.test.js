// deposit / withdraw / transfer run inside ONE transaction on a fake client.
process.env.DAILY_TRANSFER_LIMIT_TND = "1000"
const { installRepoMocks } = require("../helpers/mocks")
const { client } = installRepoMocks()

const svc         = require("../../src/account.service")
const accountRepo = require("../../src/repositories/account.repository")
const ledgerRepo  = require("../../src/repositories/ledger.repository")
const outboxRepo  = require("../../src/repositories/outbox.repository")
const cache       = require("/shared/cache")

const acc = (id, user_id, bal, currency = "TND", status = "ACTIVE") => ({ id, user_id, cached_balance: bal, currency, status })
const sqlCalls = () => client.query.mock.calls.map(c => c[0])

beforeEach(() => {
  jest.clearAllMocks()
  ledgerRepo.sumTransferDebitsSince.mockResolvedValue("0")
})

describe("deposit", () => {
  test("rejects non-positive / non-numeric amounts before touching the DB", async () => {
    await expect(svc.deposit("acc-1", 0)).rejects.toMatchObject({ code: "INVALID_AMOUNT" })
    await expect(svc.deposit("acc-1", "-5")).rejects.toMatchObject({ code: "INVALID_AMOUNT" })
    await expect(svc.deposit("acc-1", "abc")).rejects.toMatchObject({ code: "INVALID_AMOUNT" })
    expect(accountRepo.pool.connect).not.toHaveBeenCalled()
  })
  test("rolls back when account not found", async () => {
    accountRepo.getAccountForUpdate.mockResolvedValue(null)
    await expect(svc.deposit("ghost", 10)).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(sqlCalls()).toEqual(["BEGIN", "ROLLBACK"])
  })
  test("rejects frozen accounts", async () => {
    accountRepo.getAccountForUpdate.mockResolvedValue(acc("a", "u", "10.0000", "TND", "FROZEN"))
    await expect(svc.deposit("a", 10)).rejects.toMatchObject({ code: "ACCOUNT_INACTIVE" })
  })
  test("happy path: ledger + balance + outbox in one txn, then cache invalidation", async () => {
    accountRepo.getAccountForUpdate.mockResolvedValue(acc("acc-1", "u1", "100.0000"))
    const r = await svc.deposit("acc-1", "50.0000", { actor: { userId: "staff-1", role: "employee" } })
    expect(r.balance).toBe(150)
    expect(sqlCalls()).toEqual(["BEGIN", "COMMIT"])
    expect(ledgerRepo.insertEntry).toHaveBeenCalledWith(client, expect.objectContaining({ type: "CREDIT", txType: "DEPOSIT", amount: "50.0000", balance_snapshot: "150.0000", initiatedBy: "staff-1" }))
    expect(accountRepo.updateBalance).toHaveBeenCalledWith(client, "acc-1", "150.0000")
    expect(outboxRepo.enqueue).toHaveBeenCalledWith(client, expect.objectContaining({ topic: "transaction.events", payload: expect.objectContaining({ type: "DEPOSIT", amount: 50 }) }))
    await new Promise(r => setImmediate(r))
    expect(cache.del).toHaveBeenCalledWith("balance:user:u1")
  })
})

describe("withdraw", () => {
  test("locks the row by user id (FOR UPDATE path)", async () => {
    accountRepo.getAccountForUpdateByUserId.mockResolvedValue(acc("a", "u", "100.0000"))
    const r = await svc.withdraw("u", 40, "atm")
    expect(accountRepo.getAccountForUpdateByUserId).toHaveBeenCalledWith(client, "u")
    expect(r).toMatchObject({ previousBalance: 100, newBalance: 60, amount: 40 })
    expect(ledgerRepo.insertEntry).toHaveBeenCalledWith(client, expect.objectContaining({ type: "DEBIT", txType: "WITHDRAW" }))
  })
  test("insufficient funds → INSUFFICIENT_FUNDS and ROLLBACK", async () => {
    accountRepo.getAccountForUpdateByUserId.mockResolvedValue(acc("a", "u", "10.0000"))
    await expect(svc.withdraw("u", 100)).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" })
    expect(sqlCalls()).toEqual(["BEGIN", "ROLLBACK"])
    expect(accountRepo.updateBalance).not.toHaveBeenCalled()
  })
})

describe("transfer", () => {
  const lock = (a, b) => accountRepo.lockAccounts.mockResolvedValue({ [a.id]: a, [b.id]: b })

  test("validation", async () => {
    await expect(svc.transfer("a", "b", 0)).rejects.toMatchObject({ code: "INVALID_AMOUNT" })
    await expect(svc.transfer("a", "a", 10)).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    await expect(svc.transfer("", "b", 10)).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })
  test("customer cannot debit someone else's account (FORBIDDEN, rolled back)", async () => {
    lock(acc("A", "owner", "1000.0000"), acc("B", "uB", "0.0000"))
    await expect(svc.transfer("A", "B", 10, { actor: { userId: "attacker", role: "customer" } }))
      .rejects.toMatchObject({ code: "FORBIDDEN", status: 403 })
    expect(sqlCalls()).toEqual(["BEGIN", "ROLLBACK"])
    expect(accountRepo.updateBalance).not.toHaveBeenCalled()
  })
  test("staff may transfer between arbitrary accounts", async () => {
    lock(acc("A", "uA", "1000.0000"), acc("B", "uB", "100.0000"))
    const r = await svc.transfer("A", "B", 75, { actor: { userId: "emp", role: "employee" } })
    expect(r.amount).toBe(75)
    expect(r.source.newBalance).toBe(925)
    expect(r.destination.newBalance).toBe(175)
  })
  test("owner happy path: 2 ledger rows, 2 balance updates, 2 outbox events, single COMMIT", async () => {
    lock(acc("A", "uA", "1000.0000"), acc("B", "uB", "100.0000"))
    const r = await svc.transfer("A", "B", "75.0000", { actor: { userId: "uA", role: "customer" }, reference: "rent" })
    expect(r.transactionId).toMatch(/^[0-9a-f-]{36}$/)
    expect(ledgerRepo.insertEntry).toHaveBeenCalledTimes(2)
    expect(ledgerRepo.insertEntry.mock.calls.map(c => c[1].type).sort()).toEqual(["CREDIT", "DEBIT"])
    expect(ledgerRepo.insertEntry.mock.calls.every(c => c[1].txType === "TRANSFER")).toBe(true)
    expect(accountRepo.updateBalance).toHaveBeenCalledTimes(2)
    expect(outboxRepo.enqueue).toHaveBeenCalledTimes(2)
    expect(outboxRepo.enqueue.mock.calls.map(c => c[1].payload.type).sort()).toEqual(["TRANSFER_CREDIT", "TRANSFER_DEBIT"])
    expect(sqlCalls()).toEqual(["BEGIN", "COMMIT"])
    expect(accountRepo.lockAccounts).toHaveBeenCalledWith(client, ["A", "B"])
  })
  test("insufficient funds", async () => {
    lock(acc("A", "uA", "10.0000"), acc("B", "uB", "0.0000"))
    await expect(svc.transfer("A", "B", 100, { actor: { userId: "uA", role: "customer" } })).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" })
  })
  test("currency mismatch", async () => {
    lock(acc("A", "uA", "1000", "TND"), acc("B", "uB", "100", "EUR"))
    await expect(svc.transfer("A", "B", 50, { actor: { userId: "uA", role: "customer" } })).rejects.toMatchObject({ code: "CURRENCY_MISMATCH" })
  })
  test("missing destination", async () => {
    accountRepo.lockAccounts.mockResolvedValue({ A: acc("A", "uA", "1000") })
    await expect(svc.transfer("A", "B", 50)).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  describe("daily transfer cap (rolling 24h, TRANSFER debits only)", () => {
    beforeEach(() => lock(acc("acc-A", "uA", "100000.0000"), acc("acc-B", "uB", "0.0000")))
    test("allows within limit", async () => {
      ledgerRepo.sumTransferDebitsSince.mockResolvedValue("500.0000")
      const r = await svc.transfer("acc-A", "acc-B", 400, { actor: { userId: "uA", role: "customer" } })
      expect(r.amount).toBe(400)
    })
    test("rejects when exceeding → DAILY_LIMIT_EXCEEDED (429)", async () => {
      ledgerRepo.sumTransferDebitsSince.mockResolvedValue("999.0000")
      await expect(svc.transfer("acc-A", "acc-B", 2, { actor: { userId: "uA", role: "customer" } }))
        .rejects.toMatchObject({ code: "DAILY_LIMIT_EXCEEDED", status: 429 })
    })
    test("rejects limit + 0.0001", async () => {
      ledgerRepo.sumTransferDebitsSince.mockResolvedValue("0")
      await expect(svc.transfer("acc-A", "acc-B", 1000.0001, { actor: { userId: "uA", role: "customer" } }))
        .rejects.toMatchObject({ code: "DAILY_LIMIT_EXCEEDED" })
    })
  })

  test("retries on CockroachDB serialization failure (40001)", async () => {
    lock(acc("A", "uA", "1000.0000"), acc("B", "uB", "100.0000"))
    const e = new Error("restart transaction"); e.code = "40001"
    accountRepo.updateBalance.mockRejectedValueOnce(e)
    const r = await svc.transfer("A", "B", 10, { actor: { userId: "uA", role: "customer" } })
    expect(r.amount).toBe(10)
    expect(sqlCalls()).toEqual(["BEGIN", "ROLLBACK", "BEGIN", "COMMIT"])
  })
})
