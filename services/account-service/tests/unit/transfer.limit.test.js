// Phase 0.3 — daily transfer limit enforcement.
// We mock the repos so this is a pure-logic test, no DB.
process.env.DAILY_TRANSFER_LIMIT_TND = "1000"  // tighten for the test

jest.mock("../../src/account.repository", () => ({
  pool:                  { connect: jest.fn() },
  findByUserId:          jest.fn(),
  getAccountForUpdate:   jest.fn(),
  getAccountByCustomerId:jest.fn(),
  updateBalance:         jest.fn(),
  create:                jest.fn(),
  findById:              jest.fn(),
}))
jest.mock("../../src/repositories/ledger.repository", () => ({
  pool:           { connect: jest.fn() },
  insertEntry:    jest.fn(),
  sumDebitsSince: jest.fn(),
}))

const accountRepo = require("../../src/account.repository")
const ledgerRepo  = require("../../src/repositories/ledger.repository")
const accountService = require("../../src/account.service")

const fakeClient = () => ({
  query:   jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
})

beforeEach(() => {
  jest.clearAllMocks()
  const ac = fakeClient(); const lc = fakeClient()
  accountRepo.pool.connect.mockResolvedValue(ac)
  ledgerRepo.pool.connect.mockResolvedValue(lc)
  accountRepo.getAccountForUpdate.mockImplementation(async (_c, id) => ({
    id, currency: "TND", cached_balance: "100000.0000",
  }))
  accountRepo.updateBalance.mockResolvedValue(undefined)
  ledgerRepo.insertEntry.mockResolvedValue({})
})

describe("transfer daily limit (Phase 0.3)", () => {
  test("allows transfer when within rolling 24h limit", async () => {
    ledgerRepo.sumDebitsSince.mockResolvedValue("500.0000")  // already used 500
    const r = await accountService.transfer("acc-A", "acc-B", 400)
    expect(r.amount).toBe(400)
  })

  test("rejects transfer that would exceed the limit", async () => {
    ledgerRepo.sumDebitsSince.mockResolvedValue("999.0000")  // already used 999
    await expect(accountService.transfer("acc-A", "acc-B", 2))
      .rejects.toThrow(/Daily transfer limit/)
  })

  test("rejects transfer that hits exactly limit + 0.0001", async () => {
    ledgerRepo.sumDebitsSince.mockResolvedValue("0")
    await expect(accountService.transfer("acc-A", "acc-B", 1000.0001))
      .rejects.toThrow(/Daily transfer limit/)
  })
})
