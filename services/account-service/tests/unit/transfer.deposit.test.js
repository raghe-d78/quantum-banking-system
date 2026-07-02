// transfer/deposit happy-path tests with mocked repos.
// Avoid touching real DB or kafka.

jest.mock("../../src/account.repository", () => ({
  pool:                  { connect: jest.fn() },
  getAccountForUpdate:   jest.fn(),
  getAccountByCustomerId:jest.fn(),
  updateBalance:         jest.fn(),
  findById:              jest.fn(),
  findByUserId:          jest.fn(),
}))
jest.mock("../../src/repositories/ledger.repository", () => ({
  pool:           { connect: jest.fn() },
  insertEntry:    jest.fn(),
  sumDebitsSince: jest.fn().mockResolvedValue("0"),
}))
jest.mock("../../src/repositories/outbox.repository", () => ({
  enqueue: jest.fn().mockResolvedValue("outbox-id"),
}))

const accountRepo = require("../../src/account.repository")
const ledgerRepo  = require("../../src/repositories/ledger.repository")
const outboxRepo  = require("../../src/repositories/outbox.repository")
const svc         = require("../../src/account.service")

function client() {
  return { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() }
}

beforeEach(() => {
  jest.clearAllMocks()
  accountRepo.pool.connect.mockResolvedValue(client())
  ledgerRepo.pool.connect.mockResolvedValue(client())
  ledgerRepo.sumDebitsSince.mockResolvedValue("0")
})

describe("deposit", () => {
  test("rejects non-positive amount", async () => {
    await expect(svc.deposit("acc-1", 0)).rejects.toThrow(/Invalid amount/)
    await expect(svc.deposit("acc-1", -5)).rejects.toThrow(/Invalid amount/)
  })

  test("throws if account not found", async () => {
    accountRepo.getAccountForUpdate.mockResolvedValue(null)
    await expect(svc.deposit("ghost", 10)).rejects.toThrow(/Account not found/)
  })

  test("happy path writes ledger + outbox + updates balance", async () => {
    accountRepo.getAccountForUpdate.mockResolvedValue({
      id: "acc-1", user_id: "u1", currency: "TND", cached_balance: "100.0000",
    })
    accountRepo.updateBalance.mockResolvedValue(undefined)
    ledgerRepo.insertEntry.mockResolvedValue({})

    const r = await svc.deposit("acc-1", 50)

    expect(r.balance).toBeCloseTo(150)
    expect(typeof r.transactionId).toBe("string")
    expect(ledgerRepo.insertEntry).toHaveBeenCalledTimes(1)
    expect(outboxRepo.enqueue).toHaveBeenCalledTimes(1)
    expect(accountRepo.updateBalance).toHaveBeenCalledWith(
      expect.anything(), "acc-1", "150.0000"
    )
  })
})

describe("transfer", () => {
  test("rejects invalid amount", async () => {
    await expect(svc.transfer("a", "b", 0)).rejects.toThrow(/Invalid amount/)
  })

  test("rejects same source and destination", async () => {
    await expect(svc.transfer("a", "a", 10)).rejects.toThrow(/(same|different)/i)
  })

  test("rejects missing source/destination", async () => {
    await expect(svc.transfer("", "b", 10)).rejects.toThrow(/required/)
  })

  test("happy path debits/credits both accounts and emits outbox event", async () => {
    accountRepo.getAccountForUpdate
      .mockResolvedValueOnce({ id: "A", user_id: "uA", currency: "TND", cached_balance: "1000.0000" })
      .mockResolvedValueOnce({ id: "B", user_id: "uB", currency: "TND", cached_balance: "100.0000"  })

    const r = await svc.transfer("A", "B", 75)

    expect(r.amount).toBe(75)
    expect(ledgerRepo.insertEntry).toHaveBeenCalledTimes(2)
    expect(outboxRepo.enqueue).toHaveBeenCalledTimes(2)
  })

  test("rejects on insufficient funds", async () => {
    accountRepo.getAccountForUpdate
      .mockResolvedValueOnce({ id: "A", user_id: "uA", currency: "TND", cached_balance: "10.0000" })
      .mockResolvedValueOnce({ id: "B", user_id: "uB", currency: "TND", cached_balance: "0.0000"  })

    await expect(svc.transfer("A", "B", 100)).rejects.toThrow(/Insufficient/)
  })

  test("rejects currency mismatch", async () => {
    accountRepo.getAccountForUpdate
      .mockResolvedValueOnce({ id: "A", user_id: "uA", currency: "TND", cached_balance: "1000" })
      .mockResolvedValueOnce({ id: "B", user_id: "uB", currency: "EUR", cached_balance: "100"  })

    await expect(svc.transfer("A", "B", 50)).rejects.toThrow(/Currency mismatch/)
  })
})
