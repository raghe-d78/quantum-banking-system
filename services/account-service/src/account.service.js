// services/account-service/src/account.service.js
//
// Core money path. Every mutation runs in ONE CockroachDB transaction that
// spans account_db + ledger_db (fully-qualified table names, see
// repositories/pool.js), so the cached balance, the double-entry ledger rows
// and the outbox event commit or roll back together. Serialization conflicts
// (40001) are retried by withTransaction.
//
// Structure: each operation has an inner `xxxTx(client, …)` that assumes an
// open transaction, and a public wrapper that opens the transaction and
// invalidates caches afterwards. `createTransaction` composes the inner
// functions with idempotency-key handling inside the same transaction.
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
const invalidateAll = (userIds) => { for (const u of new Set(userIds)) if (u) invalidateBalanceFor(u).catch(() => {}) }

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
const cleanRef = (v, max = 100) => (v === undefined || v === null) ? null : String(v).trim().slice(0, max) || null

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

exports.listPayees = (filters) => accountRepo.listPayees(filters)

// ── deposit (staff) ───────────────────────────────────────────────
async function depositTx(client, accountId, amount, { actor = null, note = null } = {}) {
  const account = await accountRepo.getAccountForUpdate(client, accountId)
  if (!account) throw E.notFound("Account not found")
  assertActive(account)

  const currency      = account.currency
  const depositMoney  = parseAmount(amount, currency)
  const newMoney      = new Money(account.cached_balance, currency).add(depositMoney)
  const transactionId = randomUUID()
  const timestamp     = nowIso()
  const reference     = cleanRef(note) || `Deposit ${timestamp.slice(0, 10)}`

  await ledgerRepo.insertEntry(client, {
    transactionId, accountId, type: "CREDIT", txType: "DEPOSIT",
    amount: depositMoney.toFixed(4), balance_snapshot: newMoney.toFixed(4),
    reference, created_at: timestamp, initiatedBy: actorId(actor),
  })
  await accountRepo.updateBalance(client, accountId, newMoney.toFixed(4))
  await outboxRepo.enqueue(client, {
    transactionId, topic: TX_TOPIC, partitionKey: accountId,
    payload: {
      transactionId, type: "DEPOSIT", kind: "DEPOSIT", accountId,
      amount: num(depositMoney), currency, balanceSnapshot: num(newMoney),
      reference, initiatedBy: actorId(actor), timestamp,
    },
  })
  return { transactionId, balance: num(newMoney), currency, timestamp, _users: [account.user_id] }
}

exports.deposit = async (accountId, amount, opts = {}) => {
  if (!accountId) throw E.validation("accountId is required")
  parseAmount(amount, "TND")
  const r = await withTransaction(accountRepo.pool, (client) => depositTx(client, accountId, amount, opts))
  invalidateAll(r._users); delete r._users
  return r
}

// ── withdraw (customer, own account) ──────────────────────────────
async function withdrawTx(client, userId, amount, note) {
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
  const reference     = cleanRef(note) || `Withdrawal ${timestamp.slice(0, 10)}`

  await ledgerRepo.insertEntry(client, {
    transactionId, accountId: account.id, type: "DEBIT", txType: "WITHDRAW",
    amount: withdrawMoney.toFixed(4), balance_snapshot: newMoney.toFixed(4),
    reference, created_at: timestamp, initiatedBy: userId,
  })
  await accountRepo.updateBalance(client, account.id, newMoney.toFixed(4))
  await outboxRepo.enqueue(client, {
    transactionId, topic: TX_TOPIC, partitionKey: account.id,
    payload: {
      transactionId, type: "WITHDRAW", kind: "WITHDRAW", accountId: account.id,
      amount: num(withdrawMoney), currency, balanceSnapshot: num(newMoney),
      reference, initiatedBy: userId, timestamp,
    },
  })
  return {
    transactionId, accountId: account.id,
    previousBalance: num(currentMoney), newBalance: num(newMoney),
    amount: num(withdrawMoney), currency, reference: cleanRef(note), timestamp,
    _users: [userId],
  }
}

exports.withdraw = async (userId, amount, note) => {
  if (!userId) throw E.validation("userId is required")
  parseAmount(amount, "TND")
  const r = await withTransaction(accountRepo.pool, (client) => withdrawTx(client, userId, amount, note))
  invalidateAll(r._users); delete r._users
  return r
}

// ── move funds (transfer / bill payment / merchant payment) ───────
// `actor` is the authenticated JWT payload. Customers may only debit their
// own account; staff may move money between any two accounts.
async function moveFundsTx(client, sourceAccountId, destinationAccountId, amount, options = {}) {
  const { reference = null, actor = null, txType = "TRANSFER", counterparty = null } = options
  if (!ledgerRepo.OUTBOUND_TYPES.includes(txType)) throw E.validation(`Unsupported transaction kind: ${txType}`)

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

  // Daily cap: rolling 24h of outbound debits, checked under the row lock.
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
  const label     = counterparty?.name || null
  const debitRef  = cleanRef(reference) || (label ? `${label}` : `Transfer to ${destinationAccountId}`)
  const creditRef = cleanRef(reference) || `Transfer from ${sourceAccountId}`

  await ledgerRepo.insertEntry(client, {
    transactionId, accountId: sourceAccountId, type: "DEBIT", txType,
    amount: transferMoney.toFixed(4), balance_snapshot: newSourceMoney.toFixed(4),
    reference: debitRef, created_at: timestamp, initiatedBy,
  })
  await ledgerRepo.insertEntry(client, {
    transactionId, accountId: destinationAccountId, type: "CREDIT", txType,
    amount: transferMoney.toFixed(4), balance_snapshot: newDestMoney.toFixed(4),
    reference: creditRef, created_at: timestamp, initiatedBy,
  })
  await accountRepo.updateBalance(client, sourceAccountId,      newSourceMoney.toFixed(4))
  await accountRepo.updateBalance(client, destinationAccountId, newDestMoney.toFixed(4))

  const common = { transactionId, kind: txType, amount: num(transferMoney), currency, initiatedBy, timestamp,
                   counterparty: counterparty ? { code: counterparty.code, name: counterparty.name } : null }
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
    transactionId, kind: txType,
    source:      { accountId: sourceAccountId,      previousBalance: num(sourceMoney), newBalance: num(newSourceMoney) },
    destination: { accountId: destinationAccountId, previousBalance: num(destMoney),   newBalance: num(newDestMoney) },
    amount: num(transferMoney), currency, reference: cleanRef(reference), timestamp,
    counterparty: counterparty ? { code: counterparty.code, name: counterparty.name, accountId: destinationAccountId } : null,
    _users: [sourceAccount.user_id, destAccount.user_id],
  }
}

function validateMove(sourceAccountId, destinationAccountId, amount, reference) {
  if (!sourceAccountId || !destinationAccountId) throw E.validation("Both source and destination account IDs are required")
  if (sourceAccountId === destinationAccountId)  throw E.validation("Cannot transfer to the same account")
  parseAmount(amount, "TND")
  if (reference && String(reference).length > 100) throw E.validation("reference must be at most 100 characters")
}

exports.transfer = async (sourceAccountId, destinationAccountId, amount, options = {}) => {
  validateMove(sourceAccountId, destinationAccountId, amount, options.reference)
  const r = await withTransaction(accountRepo.pool, (client) =>
    moveFundsTx(client, sourceAccountId, destinationAccountId, amount, { ...options, txType: "TRANSFER" }))
  invalidateAll(r._users); delete r._users
  return r
}

// ── unified POST /transactions ────────────────────────────────────
// kinds: TRANSFER | BILL_PAYMENT | MERCHANT_PAYMENT | WITHDRAW
// Optional idempotency key: the first request with a key owns it; retries
// replay the stored response; a concurrent duplicate gets 409.
const KINDS = ["TRANSFER", "BILL_PAYMENT", "MERCHANT_PAYMENT", "WITHDRAW"]

exports.createTransaction = async (actor, body = {}, idempotencyKey = null) => {
  if (!actor?.userId) throw E.forbidden("Authentication required")
  const kind = String(body.kind || "").toUpperCase()
  if (!KINDS.includes(kind)) throw E.validation(`kind must be one of ${KINDS.join(", ")}`)
  parseAmount(body.amount, "TND")
  if (idempotencyKey !== null && !/^[\w.:-]{8,128}$/.test(idempotencyKey))
    throw E.validation("Idempotency-Key must be 8-128 chars [A-Za-z0-9_.:-]")

  const result = await withTransaction(accountRepo.pool, async (client) => {
    if (idempotencyKey) {
      const claim = await accountRepo.claimIdempotencyKey(client, actor.userId, idempotencyKey)
      if (!claim.claimed) {
        if (claim.response) return { ...claim.response, replayed: true, _users: [] }
        throw E.conflict("IDEMPOTENT_IN_PROGRESS", "A request with this Idempotency-Key is still being processed")
      }
    }

    let out
    if (kind === "WITHDRAW") {
      const w = await withdrawTx(client, actor.userId, body.amount, body.note ?? body.reference)
      out = { transactionId: w.transactionId, kind, amount: w.amount, currency: w.currency,
              newBalance: w.newBalance, reference: w.reference, timestamp: w.timestamp, counterparty: null, _users: w._users }
    } else {
      const source = await accountRepo.findByUserId(actor.userId, client)
      if (!source) throw E.notFound("Account not found")

      let destinationAccountId, counterparty = null, reference = body.reference
      if (kind === "TRANSFER") {
        destinationAccountId = body.destinationAccountId
      } else {
        const code = body.payeeCode || body.billerCode || body.merchantCode
        if (!code) throw E.validation("payeeCode is required")
        const payee = await accountRepo.findPayeeByCode(code, client)
        if (!payee) throw E.notFound(`Unknown payee: ${code}`)
        const expected = kind === "BILL_PAYMENT" ? "BILLER" : "MERCHANT"
        if (payee.kind !== expected) throw E.validation(`${payee.code} is a ${payee.kind.toLowerCase()}, not valid for ${kind}`)
        if (kind === "BILL_PAYMENT" && !cleanRef(body.referenceNumber, 64))
          throw E.validation("referenceNumber is required for bill payments")
        destinationAccountId = payee.account_id
        counterparty = { code: payee.code, name: payee.name }
        const refNo = cleanRef(body.referenceNumber, 64)
        reference = refNo ? `${payee.name} · ${refNo}` : (cleanRef(body.reference) ? `${payee.name} · ${cleanRef(body.reference)}` : payee.name)
      }

      validateMove(source.id, destinationAccountId, body.amount, reference)
      const m = await moveFundsTx(client, source.id, destinationAccountId, body.amount,
        { reference, actor, txType: kind, counterparty })
      out = { transactionId: m.transactionId, kind, amount: m.amount, currency: m.currency,
              newBalance: m.source.newBalance, reference: m.reference ?? reference, timestamp: m.timestamp,
              counterparty: m.counterparty || { accountId: destinationAccountId }, _users: m._users }
    }

    if (idempotencyKey) {
      const { _users, ...stored } = out
      await accountRepo.storeIdempotentResponse(client, actor.userId, idempotencyKey, stored)
    }
    return out
  })

  invalidateAll(result._users); delete result._users
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

  invalidateAll(result._users); delete result._users
  return result
}

exports._internal = { parseAmount, balanceKey, KINDS }
