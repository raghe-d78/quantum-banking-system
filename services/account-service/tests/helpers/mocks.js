// Shared jest mocks for account-service unit/API tests. Repositories are
// mocked; the real withTransaction runs against a fake pg client so BEGIN /
// COMMIT / ROLLBACK ordering is exercised too.
function fakeClient(queryImpl) {
  return {
    query:   jest.fn(queryImpl || (async () => ({ rows: [] }))),
    release: jest.fn(),
  }
}

function installRepoMocks() {
  const client = fakeClient()
  const pool = { connect: jest.fn(async () => client), query: jest.fn(async () => ({ rows: [] })) }

  jest.doMock("../../src/repositories/account.repository", () => ({
    pool,
    create: jest.fn(), findByUserId: jest.fn(), findById: jest.fn(),
    getAccountForUpdate: jest.fn(), getAccountForUpdateByUserId: jest.fn(),
    lockAccounts: jest.fn(), updateBalance: jest.fn(),
    listPayees: jest.fn(async () => []), findPayeeByCode: jest.fn(),
    claimIdempotencyKey: jest.fn(async () => ({ claimed: true })), storeIdempotentResponse: jest.fn(),
  }))
  jest.doMock("../../src/repositories/ledger.repository", () => ({
    pool, TX_TYPES: ["DEPOSIT", "WITHDRAW", "TRANSFER", "BILL_PAYMENT", "MERCHANT_PAYMENT", "CANCELLATION"],
    OUTBOUND_TYPES: ["TRANSFER", "BILL_PAYMENT", "MERCHANT_PAYMENT"],
    insertEntry: jest.fn(async (_c, e) => ({ id: "L-" + Math.random().toString(36).slice(2, 8), ...e })),
    sumTransferDebitsSince: jest.fn(async () => "0"),
    findByTransactionId: jest.fn(async () => []),
    findById: jest.fn(),
  }))
  jest.doMock("../../src/repositories/outbox.repository", () => ({
    pool,
    enqueue: jest.fn(async () => "outbox-id"),
    claimPendingBatch: jest.fn(), markSent: jest.fn(), markFailed: jest.fn(), stats: jest.fn(async () => ({})),
  }))
  jest.doMock("/shared/cache", () => ({
    connect: jest.fn(), disconnect: jest.fn(), get: jest.fn(async () => null),
    setEx: jest.fn(), del: jest.fn(), publishInvalidate: jest.fn(),
  }))
  return { client, pool }
}

module.exports = { fakeClient, installRepoMocks }
