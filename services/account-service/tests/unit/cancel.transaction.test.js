// Phase 4.4 — cancelTransaction unit tests.
// Pure logic with mocked repos; verifies idempotency, validation, and the
// happy-path compensating-entry flow.

jest.mock("../../src/account.repository", () => ({
  pool:                  { connect: jest.fn() },
  getAccountForUpdate:   jest.fn(),
  updateBalance:         jest.fn(),
  findById:              jest.fn(),
}))
jest.mock("../../src/repositories/ledger.repository", () => ({
  pool:           { connect: jest.fn() },
  insertEntry:    jest.fn(),
  sumDebitsSince: jest.fn(),
}))
jest.mock("../../src/repositories/outbox.repository", () => ({
  enqueue:           jest.fn().mockResolvedValue("outbox-id"),
  fetchPendingBatch: jest.fn(),
  markSent:          jest.fn(),
  markFailed:        jest.fn(),
}))

const accountRepo = require("../../src/account.repository")
const ledgerRepo  = require("../../src/repositories/ledger.repository")
const outboxRepo  = require("../../src/repositories/outbox.repository")
const svc         = require("../../src/account.service")

function makeClient(queryImpl) {
  return {
    query:   jest.fn(queryImpl || (async () => ({ rows: [] }))),
    release: jest.fn(),
  }
}

describe("cancelTransaction (Phase 4.4)", () => {
  beforeEach(() => jest.clearAllMocks())

  test("requires originalTransactionId, reason, cancelledBy", async () => {
    await expect(svc.cancelTransaction(null, { reason: "fraud confirmed", cancelledBy: "u1" }))
      .rejects.toThrow(/originalTransactionId required/)

    accountRepo.pool.connect.mockResolvedValue(makeClient())
    ledgerRepo.pool.connect.mockResolvedValue(makeClient())

    await expect(svc.cancelTransaction("tx-1", { reason: "no", cancelledBy: "u1" }))
      .rejects.toThrow(/reason required/)
    await expect(svc.cancelTransaction("tx-1", { reason: "fraud confirmed", cancelledBy: null }))
      .rejects.toThrow(/cancelledBy required/)
  })

  test("returns 409-style error if transaction already cancelled", async () => {
    const ac = makeClient()
    const lc = makeClient(async (sql) => {
      if (/FROM cancelled_transactions/.test(sql)) {
        return { rows: [{ cancellation_id: "old-cancel", reason: "dup", cancelled_by: "x", cancelled_at: new Date() }] }
      }
      return { rows: [] }
    })
    accountRepo.pool.connect.mockResolvedValue(ac)
    ledgerRepo.pool.connect.mockResolvedValue(lc)

    await expect(svc.cancelTransaction("tx-dup", { reason: "fraud confirmed", cancelledBy: "admin" }))
      .rejects.toMatchObject({ code: "ALREADY_CANCELLED" })
  })

  test("rejects when original transaction not found", async () => {
    const ac = makeClient()
    const lc = makeClient(async (sql) => ({ rows: [] }))  // both queries return empty
    accountRepo.pool.connect.mockResolvedValue(ac)
    ledgerRepo.pool.connect.mockResolvedValue(lc)

    await expect(svc.cancelTransaction("tx-ghost", { reason: "fraud confirmed", cancelledBy: "admin" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  test("rejects cancelling a compensating entry", async () => {
    const ac = makeClient()
    const lc = makeClient(async (sql) => {
      if (/FROM cancelled_transactions/.test(sql)) return { rows: [] }
      if (/FROM ledger_entries/.test(sql)) {
        return { rows: [{ id: "L1", account_id: "A1", type: "DEBIT", amount: "10", reference: "x", compensates: "OTHER" }] }
      }
      return { rows: [] }
    })
    accountRepo.pool.connect.mockResolvedValue(ac)
    ledgerRepo.pool.connect.mockResolvedValue(lc)

    await expect(svc.cancelTransaction("tx-comp", { reason: "fraud confirmed", cancelledBy: "admin" }))
      .rejects.toMatchObject({ code: "INVALID_TARGET" })
  })

  test("happy path writes compensations + outbox event and returns ok", async () => {
    const ac = makeClient()
    const lc = makeClient(async (sql) => {
      if (/FROM cancelled_transactions/.test(sql)) return { rows: [] }
      if (/FROM ledger_entries/.test(sql)) {
        return { rows: [
          { id: "L-debit",  account_id: "A1", type: "DEBIT",  amount: "100", reference: "ref", compensates: null },
          { id: "L-credit", account_id: "A2", type: "CREDIT", amount: "100", reference: "ref", compensates: null },
        ] }
      }
      return { rows: [] }
    })
    accountRepo.pool.connect.mockResolvedValue(ac)
    ledgerRepo.pool.connect.mockResolvedValue(lc)
    accountRepo.getAccountForUpdate.mockImplementation(async (_c, id) => ({
      id, currency: "TND", cached_balance: id === "A1" ? "900.0000" : "1100.0000",
    }))
    accountRepo.findById.mockResolvedValue({ user_id: "u-1" })

    const out = await svc.cancelTransaction("tx-1", { reason: "fraud confirmed", cancelledBy: "admin" })

    expect(out.ok).toBe(true)
    expect(out.affectedAccounts.sort()).toEqual(["A1", "A2"])
    expect(out.compensations).toHaveLength(2)
    expect(outboxRepo.enqueue).toHaveBeenCalledTimes(1)
    expect(outboxRepo.enqueue.mock.calls[0][1].topic).toBe("transaction.cancelled")
  })
})
