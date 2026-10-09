// services/account-service/src/account.service.js
//
// Core money path. Every mutation runs in ONE CockroachDB transaction that
// spans account_db + ledger_db (fully-qualified table names, see
// repositories/pool.js), so the cached balance, the double-entry ledger rows
// and the outbox event commit or roll back together. Serialization conflicts
// (40001) are retried by withTransaction.
const { randomUUID } = require("crypto")
const { withTransaction } = require("/shared/db")
const Money  = require("/shared/money")
const cache  = require("/shared/cache")
const { E }  = require("/shared/errors")
const { isStaff } = require("/shared/auth")
const accountRepo = require("./repositories/account.repository")
const ledgerRepo  = require("./repositories/ledger.repository")
const outboxRepo  = require("./repositories/outbox.repository")

const TX_TOPIC        = process.env.TX_EVENTS_TOPIC    || "transaction.events"
const CANCELLED_TOPIC = process.env.TX_CANCELLED_TOPIC || "transaction.cancelled"
const BALANCE_TTL_SEC = Number(process.env.BALANCE_CACHE_TTL || 60)
const DAILY_TRANSFER_LIMIT_TND = Number(process.env.DAILY_TRANSFER_LIMIT_TND || 10000)
const MAX_TX_AMOUNT = process.env.MAX_TX_AMOUNT || "1000000000"

const balanceKey = (userId) => `balance:user:${userId}`
const nowIso = () => new Date().toISOString()

// ── helpers ───────────────────────────────────────────────────────
async function invalidateBalanceFor(userId) {
  if (!userId) return
  const k = balanceKey(userId)
  await cache.del(k)
  await cache.publishInvalidate(k)
}

// Accepts number or decimal string; rejects NaN, <= 0, > hard cap.
function parseAmount(amount, currency) {
  let m
  try { m = new Money(amount, currency) } catch (e) { throw E.invalidAmount("Invalid amount") }
  if (m.isZero()) throw E.invalidAmount("Invalid amount: must be greater than zero")
  if (m.isGreaterThan(new Money(MAX_TX_AMOUNT, currency))) throw E.invalidAmount("Invalid amount: exceeds maximum")
  return m
}

const num = (m) => Number(m.toFixed(4))

function assertActive(account) {
  if (account.status && account.status !== "ACTIVE")
    throw E.unprocessable("ACCOUNT_INACTIVE", `Account ${account.id} is ${account.status}`)
}

const actorId = (actor) => (actor && actor.userId && actor.userId !== "system") ? actor.userId : null

// ── create / read ─────────────────────────────────────────────────
exports.createAccount = async ({ userId, currency = "TND" }) => {
  if (!userId) throw E.validation("userId is required")
  const existing = await accountRepo.findByUserId(userId)
  if (existing) throw E.conflict("ACCOUNT_EXISTS", "Account already exists for this user")
  const account = await accountRepo.create({ userId, currency })
  return { account }
}

exports.getBalance = async (userId) => {
  const cached = await cache.get(balanceKey(userId))
  if (cached) {
    try { return JSON.parse(cached) } catch (_) { /* corrupt entry — fall through */ }
  }
  const account = await accountRepo.findByUserId(userId)
  if (!account) throw E.notFound("Account not found")
  const payload = {
    balance:       parseFloat(account.cached_balance),
    available:     parseFloat(account.cached_balance),
    pending:       0,
    currency:      account.currency,
    accountNumber: account.id,
    status:        account.status || "ACTIVE",
  }
  await cache.setEx(balanceKey(userId), JSON.stringify(payload), BALANCE_TTL_SEC)
  return payload
}

// ── deposit (staff) ───────────────────────────────────────────────
exports.deposit = async (accountId, amount, { actor = null, note = null } = {}) => {
  if (!accountId) throw E.validation("accountId is required")
  // Pre-validate shape before opening a transaction (currency checked again inside).
  parseAmount(amount, "TND")

  const result = await withTransaction(accountRepo.pool, async (client) => {
    const account = await accountRepo.getAccountForUpdate(client, accountId)
    if (!account) throw E.notFound("Account not found")
    assertActive(account)

    const currency     = account.currency
    const depositMoney = parseAmount(amount, currency)
    const newMoney     = new Money(account.cached_balance, currency).add(depositMoney)
    const transactionId = randomUUID()
    const timestamp     = nowIso()
    const reference     = note || `Deposit ${timestamp.slice(0, 10)}`

    await ledgerRepo.insertEntry(client, {
      transactionId, accountId, type: "CREDIT", txType: "DEPOSIT",
      amount: depositMoney.toFixed(4), balance_snapshot: newMoney.toFixed(4),
      reference, created_at: timestamp, initiatedBy: actorId(actor),
    })
    await accountRepo.updateBalance(client, accountId, newMoney.toFixed(4))
    await outboxRepo.enqueue(client, {
      transactionId, topic: TX_TOPIC, partitionKey: accountId,
      payload: {
        transactionId, type: "DEPOSIT", accountId,
        amount: num(depositMoney), currency, balanceSnapshot: num(newMoney),
        reference, initiatedBy: actorId(actor), timestamp,
      },
    })
    return { transactionId, balance: num(newMoney), currency, userId: account.user_id }
  })

  invalidateBalanceFor(result.userId).catch(() => {})
  const { userId, ...out } = result
  return out
}

// ── withdraw (customer, own account) ──────────────────────────────
exports.withdraw = async (userId, amount, note) => {
  if (!userId) throw E.validation("userId is required")
  parseAmount(amount, "TND")

  const result = await withTransaction(accountRepo.pool, async (client) => {
    const account = await accountRepo.getAccountForUpdateByUserId(client, userId)
    if (!account) throw E.notFound("Account not found")
    assertActive(account)

    const currency      = account.currency
    const currentMoney  = new Money(account.cached_balance, currency)
    const withdrawMoney = parseAmount(amount, currency)
    let newMoney
    try { newMoney = currentMoney.subtract(withdrawMoney) }
    catch { throw E.insufficientFunds(`Insufficient funds: ${currentMoney.toFixed(4)} < ${withdrawMoney.toFixed(4)}`) }

    const transactionId = randomUUID()
    const timestamp     = nowIso()
    const reference     = note || `Withdrawal ${timestamp.slice(0, 10)}`

    await ledgerRepo.insertEntry(client, {
      transactionId, accountId: account.id, type: "DEBIT", txType: "WITHDRAW",
      amount: withdrawMoney.toFixed(4), balance_snapshot: newMoney.toFixed(4),
      reference, created_at: timestamp, initiatedBy: userId,
    })
    await accountRepo.updateBalance(client, account.id, newMoney.toFixed(4))
    await outboxRepo.enqueue(client, {
      transactionId, topic: TX_TOPIC, partitionKey: account.id,
      payload: {
        transactionId, type: "WITHDRAW", accountId: account.id,
        amount: num(withdrawMoney), currency, balanceSnapshot: num(newMoney),
        reference, initiatedBy: userId, timestamp,
      },
    })
    return {
      transactionId, accountId: account.id,
      previousBalance: num(currentMoney), newBalance: num(newMoney),
      amount: num(withdrawMoney), currency, reference: note ?? null, timestamp,
    }
  })

  invalidateBalanceFor(userId).catch(() => {})
  return result
}

// ── transfer ──────────────────────────────────────────────────────
// `actor` is the authenticated JWT payload. Customers may only debit their
// own account; staff may move money between any two accounts.
exports.transfer = async (sourceAccountId, destinationAccountId, amount, options = {}) => {
  const { reference = null, actor = null } = options
  if (!sourceAccountId || !destinationAccountId) throw E.validation("Both source and destination account IDs are required")
  if (sourceAccountId === destinationAccountId)  throw E.validation("Cannot transfer to the same account")
  parseAmount(amount, "TND")
  if (reference && String(reference).length > 100) throw E.validation("reference must be at most 100 characters")

  const result = await withTransaction(accountRepo.pool, async (client) => {
    // Lock both rows in a deterministic order so A→B and B→A cannot deadlock.
    const locked = await accountRepo.lockAccounts(client, [sourceAccountId, destinationAccountId])
    const sourceAccount = locked[sourceAccountId]
    const destAccount   = locked[destinationAccountId]
    if (!sourceAccount) throw E.notFound("Source account not found")
    if (!destAccount)   throw E.notFound("Destination account not found")

    if (actor && !isStaff(actor) && sourceAccount.user_id !== actor.userId)
      throw E.forbidden("You can only transfer from your own account")

    assertActive(sourceAccount)
    assertActive(destAccount)
    if (sourceAccount.currency !== destAccount.currency)
      throw E.currencyMismatch(`Currency mismatch: ${sourceAccount.currency} ≠ ${destAccount.currency}`)

    const currency      = sourceAccount.currency
    const sourceMoney   = new Money(sourceAccount.cached_balance, currency)
    const destMoney     = new Money(destAccount.cached_balance, currency)
    const transferMoney = parseAmount(amount, currency)

    // Daily cap: rolling 24h of outgoing TRANSFER debits, checked under the row lock.
    if (currency === "TND" && DAILY_TRANSFER_LIMIT_TND > 0) {
      const since   = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      const used    = new Money(await ledgerRepo.sumTransferDebitsSince(client, sourceAccountId, since), "TND")
      const limit   = new Money(DAILY_TRANSFER_LIMIT_TND, "TND")
      const wouldBe = used.add(transferMoney)
      if (wouldBe.isGreaterThan(limit))
        throw E.dailyLimit(
          `Daily transfer limit exceeded: ${wouldBe.toFixed(4)} TND > ${limit.toFixed(4)} TND ` +
          `(already used ${used.toFixed(4)} in last 24h)`)
    }

    let newSourceMoney
    try { newSourceMoney = sourceMoney.subtract(transferMoney) }
    catch { throw E.insufficientFunds(`Insufficient funds: ${sourceMoney.toFixed(4)} < ${transferMoney.toFixed(4)}`) }
    const newDestMoney = destMoney.add(transferMoney)

    const transactionId = randomUUID()
    const timestamp     = nowIso()
    const initiatedBy   = actorId(actor)
    const debitRef  = reference || `Transfer to ${destinationAccountId}`
    const creditRef = reference || `Transfer from ${sourceAccountId}`

    await ledgerRepo.insertEntry(client, {
      transactionId, accountId: sourceAccountId, type: "DEBIT", txType: "TRANSFER",
      amount: transferMoney.toFixed(4), balance_snapshot: newSourceMoney.toFixed(4),
      reference: debitRef, created_at: timestamp, initiatedBy,
    })
    await ledgerRepo.insertEntry(client, {
      transactionId, accountId: destinationAccountId, type: "CREDIT", txType: "TRANSFER",
      amount: transferMoney.toFixed(4), balance_snapshot: newDestMoney.toFixed(4),
      reference: creditRef, created_at: timestamp, initiatedBy,
    })
    await accountRepo.updateBalance(client, sourceAccountId,      newSourceMoney.toFixed(4))
    await accountRepo.updateBalance(client, destinationAccountId, newDestMoney.toFixed(4))

    const common = { transactionId, amount: num(transferMoney), currency, initiatedBy, timestamp }
    await outboxRepo.enqueue(client, {
      transactionId, topic: TX_TOPIC, partitionKey: sourceAccountId,
      payload: { ...common, type: "TRANSFER_DEBIT", accountId: sourceAccountId,
                 counterpartyAccountId: destinationAccountId, balanceSnapshot: num(newSourceMoney), reference: debitRef },
    })
    await outboxRepo.enqueue(client, {
      transactionId, topic: TX_TOPIC, partitionKey: destinationAccountId,
      payload: { ...common, type: "TRANSFER_CREDIT", accountId: destinationAccountId,
                 counterpartyAccountId: sourceAccountId, balanceSnapshot: num(newDestMoney), reference: creditRef },
    })

    return {
      transactionId,
      source:      { accountId: sourceAccountId,      previousBalance: num(sourceMoney), newBalance: num(newSourceMoney) },
      destination: { accountId: destinationAccountId, previousBalance: num(destMoney),   newBalance: num(newDestMoney) },
      amount: num(transferMoney), currency, reference, timestamp,
      _users: [sourceAccount.user_id, destAccount.user_id],
    }
  })

  for (const u of result._users) invalidateBalanceFor(u).catch(() => {})
  delete result._users
  return result
}

// ── cancel (staff) ────────────────────────────────────────────────
// Writes COMPENSATING ledger rows (never UPDATE/DELETE), registers the
// cancellation (idempotent on original_transaction_id) and enqueues a
// `transaction.cancelled` event — all in one transaction.
exports.cancelTransaction = async (originalTransactionId, { reason, cancelledBy }) => {
  if (!originalTransactionId) throw E.validation("originalTransactionId required")
  if (!reason || String(reason).trim().length < 3) throw E.validation("reason required (min 3 chars)")
  if (!cancelledBy) throw E.validation("cancelledBy required")
  reason = String(reason).trim().slice(0, 500)

  const cancellationId = randomUUID()

  const result = await withTransaction(accountRepo.pool, async (client) => {
    const existing = await client.query(
      `SELECT cancellation_id, reason, cancelled_by, cancelled_at
         FROM ledger_db.public.cancelled_transactions WHERE original_transaction_id = $1`,
      [originalTransactionId]
    )
    if (existing.rows.length)
      throw E.conflict("ALREADY_CANCELLED", "Transaction already cancelled", { existing: existing.rows[0] })

    const orig = await ledgerRepo.findByTransactionId(client, originalTransactionId)
    if (orig.length === 0) throw E.notFound("Original transaction not found")
    if (orig.some(r => r.compensates !== null && r.compensates !== undefined) || orig.some(r => r.tx_type === "CANCELLATION"))
      throw E.unprocessable("INVALID_TARGET", "Cannot cancel a compensating entry")

    const accountIds = [...new Set(orig.map(r => r.account_id))].sort()
    const locked = await accountRepo.lockAccounts(client, accountIds)
    for (const id of accountIds) if (!locked[id]) throw E.notFound(`Account ${id} not found during cancellation`)

    const compensations = []
    const timestamp = nowIso()
    for (const e of orig) {
      const acc         = locked[e.account_id]
      const currency    = acc.currency
      const balMoney    = new Money(acc.cached_balance, currency)
      const amtMoney    = new Money(e.amount, currency)
      const reverseType = e.type === "DEBIT" ? "CREDIT" : "DEBIT"
      let newBalMoney
      if (reverseType === "CREDIT") newBalMoney = balMoney.add(amtMoney)
      else {
        try { newBalMoney = balMoney.subtract(amtMoney) }
        catch {
          throw E.conflict("REVERSAL_INSUFFICIENT_FUNDS",
            `Account ${e.account_id} holds ${balMoney.toFixed(4)} ${currency}, cannot reverse ${amtMoney.toFixed(4)}`)
        }
      }
      const row = await ledgerRepo.insertEntry(client, {
        transactionId: cancellationId, accountId: e.account_id, type: reverseType, txType: "CANCELLATION",
        amount: amtMoney.toFixed(4), balance_snapshot: newBalMoney.toFixed(4),
        reference: `Cancellation of ${originalTransactionId}: ${reason}`.slice(0, 100),
        created_at: timestamp, compensates: e.id, initiatedBy: cancelledBy,
      })
      await accountRepo.updateBalance(client, e.account_id, newBalMoney.toFixed(4))
      locked[e.account_id] = { ...acc, cached_balance: newBalMoney.toFixed(4) }
      compensations.push({
        ledgerId: row?.id, compensatesLedgerId: e.id, accountId: e.account_id,
        type: reverseType, amount: num(amtMoney), balanceSnapshot: num(newBalMoney),
      })
    }

    await client.query(
      `INSERT INTO ledger_db.public.cancelled_transactions
         (original_transaction_id, cancellation_id, reason, cancelled_by) VALUES ($1,$2,$3,$4)`,
      [originalTransactionId, cancellationId, reason, cancelledBy]
    )
    await outboxRepo.enqueue(client, {
      transactionId: cancellationId, topic: CANCELLED_TOPIC, partitionKey: accountIds[0],
      payload: {
        type: "TRANSACTION_CANCELLED", originalTransactionId, cancellationId, reason, cancelledBy,
        affectedAccounts: accountIds, compensations, timestamp,
      },
    })
    return {
      ok: true, originalTransactionId, cancellationId, reason, cancelledBy,
      affectedAccounts: accountIds, compensations,
      _users: Object.values(locked).map(a => a.user_id),
    }
  })

  for (const u of result._users) invalidateBalanceFor(u).catch(() => {})
  delete result._users
  return result
}

exports._internal = { parseAmount, balanceKey }
