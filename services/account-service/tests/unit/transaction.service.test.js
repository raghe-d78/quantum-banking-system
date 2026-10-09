const mockPool = { query: jest.fn() }
jest.doMock("../../src/repositories/pool", () => ({ pool: mockPool, T: { ledger: "ledger_db.public.ledger_entries" } }))
jest.doMock("../../src/repositories/account.repository", () => ({ findByUserId: jest.fn() }))
jest.doMock("../../src/repositories/ledger.repository", () => ({ TX_TYPES: ["DEPOSIT", "WITHDRAW", "TRANSFER", "CANCELLATION"], findById: jest.fn() }))

const txService   = require("../../src/transaction.service")
const accountRepo = require("../../src/repositories/account.repository")
const ledgerRepo  = require("../../src/repositories/ledger.repository")

const row = { id: "L1", transaction_id: "T1", account_id: "acc", type: "DEBIT", tx_type: "TRANSFER", amount: "10.0000", balance_snapshot: "90.0000", reference: "r", compensates: null, initiated_by: null, created_at: "2026-01-01T00:00:00Z" }

beforeEach(() => { jest.clearAllMocks(); accountRepo.findByUserId.mockResolvedValue({ id: "acc" }); mockPool.query.mockResolvedValue({ rows: [row] }) })

test("list builds parameterised SQL with clamped limit and validated dates", async () => {
  const out = await txService.listTransactions("u", { type: "debit", dateFrom: "2026-01-01", dateTo: "2026-01-31", minAmount: "5", limit: "9999", offset: "-3", order: "asc", initiatedBy: "customer" })
  const [sql, params] = mockPool.query.mock.calls[0]
  expect(sql).toMatch(/type = \$2/)
  expect(sql).toMatch(/tx_type IN \('WITHDRAW','TRANSFER','BILL_PAYMENT','MERCHANT_PAYMENT'\)/)
  expect(sql).toMatch(/ORDER BY created_at ASC/)
  expect(params).toEqual(["acc", "DEBIT", "2026-01-01", "2026-01-31", 5, 100, 0])
  expect(out[0]).toMatchObject({ id: "L1", txType: "TRANSFER", amount: 10, initiatedBy: "Customer" })
})

test("rejects malformed dates instead of interpolating them", async () => {
  await expect(txService.listTransactions("u", { dateFrom: "1 OR 1=1" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
})

test("getTransaction enforces ownership", async () => {
  ledgerRepo.findById.mockResolvedValue({ ...row, account_id: "someone-else" })
  await expect(txService.getTransaction("u", "L1")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 })
})
