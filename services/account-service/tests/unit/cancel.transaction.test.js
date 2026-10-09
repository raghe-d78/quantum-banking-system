const { installRepoMocks } = require("../helpers/mocks")
const { client } = installRepoMocks()

const svc         = require("../../src/account.service")
const accountRepo = require("../../src/repositories/account.repository")
const ledgerRepo  = require("../../src/repositories/ledger.repository")
const outboxRepo  = require("../../src/repositories/outbox.repository")

const acc = (id, bal) => ({ id, user_id: "u-" + id, currency: "TND", cached_balance: bal, status: "ACTIVE" })
const notCancelled = () => ({ rows: [] })

beforeEach(() => {
  jest.clearAllMocks()
  client.query.mockImplementation(async () => notCancelled())
})

describe("cancelTransaction", () => {
  test("argument validation", async () => {
    await expect(svc.cancelTransaction(null, { reason: "fraud confirmed", cancelledBy: "u1" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    await expect(svc.cancelTransaction("tx", { reason: "no", cancelledBy: "u1" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    await expect(svc.cancelTransaction("tx", { reason: "fraud confirmed", cancelledBy: null })).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })

  test("idempotent: second cancel → ALREADY_CANCELLED (409) with existing row", async () => {
    client.query.mockImplementation(async (sql) =>
      /FROM ledger_db\.public\.cancelled_transactions/.test(sql)
        ? { rows: [{ cancellation_id: "old", reason: "dup", cancelled_by: "x", cancelled_at: new Date() }] }
        : { rows: [] })
    await expect(svc.cancelTransaction("tx-dup", { reason: "fraud confirmed", cancelledBy: "admin" }))
      .rejects.toMatchObject({ code: "ALREADY_CANCELLED", status: 409, existing: expect.objectContaining({ cancellation_id: "old" }) })
  })

  test("unknown transaction → NOT_FOUND", async () => {
    ledgerRepo.findByTransactionId.mockResolvedValue([])
    await expect(svc.cancelTransaction("ghost", { reason: "fraud confirmed", cancelledBy: "admin" })).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  test("cannot reverse a reversal → INVALID_TARGET (422)", async () => {
    ledgerRepo.findByTransactionId.mockResolvedValue([{ id: "L1", account_id: "A1", type: "DEBIT", tx_type: "CANCELLATION", amount: "10", compensates: "OTHER" }])
    await expect(svc.cancelTransaction("tx-comp", { reason: "fraud confirmed", cancelledBy: "admin" })).rejects.toMatchObject({ code: "INVALID_TARGET", status: 422 })
  })

  test("reversal that would overdraw → REVERSAL_INSUFFICIENT_FUNDS (409), rolled back", async () => {
    ledgerRepo.findByTransactionId.mockResolvedValue([{ id: "L-credit", account_id: "A2", type: "CREDIT", tx_type: "DEPOSIT", amount: "100", compensates: null }])
    accountRepo.lockAccounts.mockResolvedValue({ A2: acc("A2", "20.0000") })
    await expect(svc.cancelTransaction("tx-1", { reason: "fraud confirmed", cancelledBy: "admin" }))
      .rejects.toMatchObject({ code: "REVERSAL_INSUFFICIENT_FUNDS", status: 409 })
    expect(client.query.mock.calls.map(c => c[0])).toEqual(["BEGIN", expect.stringMatching(/cancelled_transactions/), "ROLLBACK"])
  })

  test("happy path: compensating rows, registry row, outbox event, one COMMIT", async () => {
    ledgerRepo.findByTransactionId.mockResolvedValue([
      { id: "L-debit",  account_id: "A1", type: "DEBIT",  tx_type: "TRANSFER", amount: "100", compensates: null },
      { id: "L-credit", account_id: "A2", type: "CREDIT", tx_type: "TRANSFER", amount: "100", compensates: null },
    ])
    accountRepo.lockAccounts.mockResolvedValue({ A1: acc("A1", "900.0000"), A2: acc("A2", "1100.0000") })

    const out = await svc.cancelTransaction("tx-1", { reason: "fraud confirmed", cancelledBy: "admin" })

    expect(out.ok).toBe(true)
    expect(out.affectedAccounts).toEqual(["A1", "A2"])
    expect(out.compensations).toHaveLength(2)
    expect(out.compensations.find(c => c.accountId === "A1")).toMatchObject({ type: "CREDIT", balanceSnapshot: 1000 })
    expect(out.compensations.find(c => c.accountId === "A2")).toMatchObject({ type: "DEBIT",  balanceSnapshot: 1000 })
    expect(ledgerRepo.insertEntry).toHaveBeenCalledTimes(2)
    expect(ledgerRepo.insertEntry.mock.calls.every(c => c[1].txType === "CANCELLATION" && c[1].compensates)).toBe(true)
    expect(outboxRepo.enqueue).toHaveBeenCalledTimes(1)
    expect(outboxRepo.enqueue.mock.calls[0][1]).toMatchObject({ topic: "transaction.cancelled", payload: expect.objectContaining({ type: "TRANSACTION_CANCELLED", originalTransactionId: "tx-1" }) })
    const sql = client.query.mock.calls.map(c => c[0])
    expect(sql[0]).toBe("BEGIN")
    expect(sql[sql.length - 1]).toBe("COMMIT")
    expect(sql.some(s => /INSERT INTO ledger_db\.public\.cancelled_transactions/.test(s))).toBe(true)
  })
})
