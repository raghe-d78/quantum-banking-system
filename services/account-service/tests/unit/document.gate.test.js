// CV extension: document gate on POST /transactions + staff hold release/reject.
const { installRepoMocks } = require("../helpers/mocks")
const { client } = installRepoMocks()

const svc         = require("../../src/account.service")
const accountRepo = require("../../src/repositories/account.repository")
const ledgerRepo  = require("../../src/repositories/ledger.repository")
const outboxRepo  = require("../../src/repositories/outbox.repository")
const docRepo     = require("../../src/repositories/document.repository")

const me = { userId: "u-me", role: "customer" }
const staff = { userId: "emp-1", role: "employee" }
const DOC = "11111111-1111-4111-8111-111111111111"
const acc = (id, user_id, bal) => ({ id, user_id, cached_balance: bal, currency: "TND", status: "ACTIVE" })
const doc = (over = {}) => ({ document_id: DOC, owner_user_id: "u-me", status: "CLEAN", risk_score: "0.1200", requires_review: false, reasons: [], expected_amount: "25.0000", transaction_id: null, ...over })

beforeEach(() => {
  jest.clearAllMocks()
  ledgerRepo.sumTransferDebitsSince.mockResolvedValue("0")
  accountRepo.findByUserId.mockResolvedValue(acc("acc-me", "u-me", "500.0000"))
  accountRepo.lockAccounts.mockImplementation(async (_c, ids) => {
    const all = { "acc-me": acc("acc-me", "u-me", "500.0000"), "acc-bob": acc("acc-bob", "u-bob", "10") }
    return Object.fromEntries(ids.filter(i => all[i]).map(i => [i, all[i]]))
  })
  accountRepo.getAccountForUpdateByUserId.mockResolvedValue(acc("acc-me", "u-me", "500.0000"))
})

const transfer = (extra = {}) => svc.createTransaction(me, { kind: "TRANSFER", destinationAccountId: "acc-bob", amount: "25.0000", ...extra })

test("clean document: transaction executes, ledger rows and event carry documentId, document linked", async () => {
  docRepo.getDocumentForUpdate.mockResolvedValue(doc())
  const r = await transfer({ documentId: DOC })
  expect(r.held).toBeUndefined()
  expect(r.documentId).toBe(DOC)
  expect(ledgerRepo.insertEntry.mock.calls.every(c => c[1].documentId === DOC)).toBe(true)
  expect(outboxRepo.enqueue.mock.calls[0][1].payload.documentId).toBe(DOC)
  expect(docRepo.linkDocument).toHaveBeenCalledWith(client, DOC, r.transactionId)
})

test("suspicious document: transaction is HELD, nothing is written to the ledger", async () => {
  docRepo.getDocumentForUpdate.mockResolvedValue(doc({ status: "SUSPICIOUS", risk_score: "0.8100", requires_review: true, reasons: ["tampering_signals"] }))
  const r = await transfer({ documentId: DOC })
  expect(r.held).toBe(true)
  expect(r).toMatchObject({ holdId: "hold-1", documentStatus: "SUSPICIOUS", amount: 25 })
  expect(docRepo.createHold).toHaveBeenCalledWith(client, expect.objectContaining({ userId: "u-me", kind: "TRANSFER", documentId: DOC, request: expect.objectContaining({ destinationAccountId: "acc-bob" }) }))
  expect(ledgerRepo.insertEntry).not.toHaveBeenCalled()
  expect(accountRepo.updateBalance).not.toHaveBeenCalled()
  expect(client.query.mock.calls.map(c => c[0])).toEqual(["BEGIN", "COMMIT"])
})

test("REVIEW with hard reason (duplicate / amount mismatch) is held; plain REVIEW proceeds", async () => {
  docRepo.getDocumentForUpdate.mockResolvedValue(doc({ status: "REVIEW", reasons: ["duplicate_document"] }))
  expect((await transfer({ documentId: DOC })).held).toBe(true)
  jest.clearAllMocks(); ledgerRepo.sumTransferDebitsSince.mockResolvedValue("0")
  docRepo.getDocumentForUpdate.mockResolvedValue(doc({ status: "REVIEW", reasons: ["low_quality"] }))
  expect((await transfer({ documentId: DOC })).held).toBeUndefined()
})

test("document ownership, reuse, amount consistency and format are enforced", async () => {
  docRepo.getDocumentForUpdate.mockResolvedValue(doc({ owner_user_id: "someone-else" }))
  await expect(transfer({ documentId: DOC })).rejects.toMatchObject({ code: "FORBIDDEN" })
  docRepo.getDocumentForUpdate.mockResolvedValue(doc({ transaction_id: "already" }))
  await expect(transfer({ documentId: DOC })).rejects.toMatchObject({ code: "DOCUMENT_ALREADY_USED", status: 409 })
  docRepo.getDocumentForUpdate.mockResolvedValue(doc({ expected_amount: "99.0000" }))
  await expect(transfer({ documentId: DOC })).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  docRepo.getDocumentForUpdate.mockResolvedValue(undefined)
  await expect(transfer({ documentId: DOC })).rejects.toMatchObject({ code: "NOT_FOUND" })
  await expect(transfer({ documentId: "not-a-uuid" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
})

test("withdraw with a clean document links it too", async () => {
  docRepo.getDocumentForUpdate.mockResolvedValue(doc({ expected_amount: "40.0000" }))
  const r = await svc.createTransaction(me, { kind: "WITHDRAW", amount: "40", documentId: DOC })
  expect(r.documentId).toBe(DOC)
  expect(docRepo.linkDocument).toHaveBeenCalledWith(client, DOC, r.transactionId)
})

describe("staff decides a hold", () => {
  const hold = (over = {}) => ({ id: "hold-1", user_id: "u-me", account_id: "acc-me", kind: "TRANSFER", status: "PENDING_REVIEW",
    request: { kind: "TRANSFER", destinationAccountId: "acc-bob", amount: "25.0000", reference: "held one" }, document_id: DOC, ...over })
  const HID = "22222222-2222-4222-8222-222222222222"

  test("release executes the parked request on behalf of the customer, with the staff actor", async () => {
    docRepo.getHoldForUpdate.mockResolvedValue(hold())
    const r = await svc.decideHold(HID, { action: "RELEASE", actor: staff, note: "verified by phone" })
    expect(r).toMatchObject({ ok: true, status: "RELEASED" })
    expect(r.transaction).toMatchObject({ kind: "TRANSFER", amount: 25, newBalance: 475, documentId: DOC })
    expect(ledgerRepo.insertEntry.mock.calls[0][1]).toMatchObject({ initiatedBy: "emp-1", documentId: DOC })
    expect(docRepo.decideHold).toHaveBeenCalledWith(client, HID, expect.objectContaining({ status: "RELEASED", decidedBy: "emp-1", transactionId: r.transaction.transactionId }))
  })
  test("reject only marks the hold", async () => {
    docRepo.getHoldForUpdate.mockResolvedValue(hold())
    const r = await svc.decideHold(HID, { action: "REJECT", actor: staff, note: "forged" })
    expect(r.status).toBe("REJECTED")
    expect(ledgerRepo.insertEntry).not.toHaveBeenCalled()
  })
  test("already decided → 409; customers → 403; unknown → 404", async () => {
    docRepo.getHoldForUpdate.mockResolvedValue(hold({ status: "REJECTED" }))
    await expect(svc.decideHold(HID, { action: "RELEASE", actor: staff })).rejects.toMatchObject({ code: "HOLD_ALREADY_DECIDED" })
    await expect(svc.decideHold(HID, { action: "RELEASE", actor: me })).rejects.toMatchObject({ code: "FORBIDDEN" })
    docRepo.getHoldForUpdate.mockResolvedValue(undefined)
    await expect(svc.decideHold(HID, { action: "RELEASE", actor: staff })).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})
