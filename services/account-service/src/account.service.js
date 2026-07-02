// services/account-service/src/account.service.js
const accountRepo = require("./account.repository")
const ledgerRepo = require("./repositories/ledger.repository")
const outboxRepo = require("./repositories/outbox.repository")
const { randomUUID: uuidv4 } = require("crypto")
const Money = require("/shared/money")
const cache = require("/shared/cache")

const TX_TOPIC = process.env.TX_EVENTS_TOPIC || "transaction.events"
const BALANCE_TTL_SEC = Number(process.env.BALANCE_CACHE_TTL || 60)
const balanceKey = (userId) => `balance:user:${userId}`

// Phase 0.3 — daily transfer cap (rolling 24h window of DEBITs from source).
// Tunable per environment via DAILY_TRANSFER_LIMIT_TND (default 10 000 TND).
const DAILY_TRANSFER_LIMIT_TND = Number(process.env.DAILY_TRANSFER_LIMIT_TND || 10000)

// Invalidate cached balance for a user on every committed mutation.
// Uses both DEL (immediate) and pub/sub (cross-replica fan-out hook).
async function invalidateBalanceFor(userId) {
  if (!userId) return
  const k = balanceKey(userId)
  await cache.del(k)
  await cache.publishInvalidate(k)
}


// Called by identity-service after creating a user with role "user"
exports.createAccount = async ({ userId, currency = "TND" }) => {
  if (!userId) throw new Error("userId is required")

  // Prevent duplicate accounts
  const existing = await accountRepo.findByUserId(userId)
  if (existing) throw new Error("Account already exists for this user")

  const account = await accountRepo.create({ userId, currency })

  return { account }
}

// Called by customer frontend GET /balance
exports.getBalance = async (userId) => {
  // Read-through cache (Phase 2.1) — TTL bounds staleness even if a writer
  // forgets to invalidate. Cache miss falls back to DB then warms the entry.
  const cached = await cache.get(balanceKey(userId))
  if (cached) {
    try { return JSON.parse(cached) } catch (_) { /* corrupt entry — fall through */ }
  }

  const account = await accountRepo.findByUserId(userId)
  if (!account) throw new Error("Account not found")

  const payload = {
    balance:       parseFloat(account.cached_balance),
    available:     parseFloat(account.cached_balance),  // no pending logic yet
    pending:       0.000,
    currency:      account.currency,
    accountNumber: account.id,
  }
  await cache.setEx(balanceKey(userId), JSON.stringify(payload), BALANCE_TTL_SEC)
  return payload
}




exports.deposit = async (accountId, amount) => {
  if (!amount || amount <= 0) {
    throw new Error("Invalid amount")
  }

  const accountClient = await accountRepo.pool.connect()
  const ledgerClient = await ledgerRepo.pool.connect()

  try {
    await accountClient.query("BEGIN")
    await ledgerClient.query("BEGIN")

    // 🔒 Lock account row
    const account = await accountRepo.getAccountForUpdate(
      accountClient,
      accountId
    )

    if (!account) throw new Error("Account not found")

    // 💱 Decimal-safe arithmetic via shared/money.js
    const currency       = account.currency
    const currentMoney   = new Money(account.cached_balance, currency)
    const depositMoney   = new Money(amount, currency)
    const newBalanceStr  = currentMoney.add(depositMoney).toFixed(4)
    const newBalanceNum  = Number(newBalanceStr)

    const transactionId = uuidv4()
    const timestamp     = new Date().toISOString()

    // 📜 Ledger entry
    await ledgerRepo.insertEntry(ledgerClient, {
      id: uuidv4(),
      transactionId,
      accountId,
      type: "CREDIT",
      amount: Number(depositMoney.toFixed(4)),
      balance_snapshot: newBalanceNum,
      reference: `Deposit ${new Date().toLocaleDateString()}`,
      created_at: timestamp,
    })

    // 💰 Update balance
    await accountRepo.updateBalance(
      accountClient,
      accountId,
      newBalanceStr
    )

    // 📤 Phase 1.2 — Outbox: enqueue Kafka event in the SAME ledger txn.
    await outboxRepo.enqueue(ledgerClient, {
      transactionId,
      topic: TX_TOPIC,
      partitionKey: accountId,
      payload: {
        transactionId, type: "DEPOSIT", accountId,
        amount: Number(depositMoney.toFixed(4)), currency,
        balanceSnapshot: newBalanceNum,
        reference: `Deposit ${new Date().toLocaleDateString()}`,
        timestamp,
      },
    })

    await accountClient.query("COMMIT")
    await ledgerClient.query("COMMIT")

    // Phase 2.1 — invalidate cached balance for the affected user.
    invalidateBalanceFor(account.user_id).catch(() => {})

    return {
      transactionId,
      balance: newBalanceNum
    }

  } catch (err) {
    console.error("Error in deposit transaction:", err) 
    await accountClient.query("ROLLBACK")
    await ledgerClient.query("ROLLBACK")
    throw err
  } finally {
    accountClient.release()
    ledgerClient.release()
  }
}

// TRANSFER: Move funds from one account to another (atomic transaction)

// services/account-service/src/account.service.js

exports.transfer = async (sourceAccountId, destinationAccountId, amount, options = {}) => {
  const { reference = null, initiatedBy = null } = options;
  
  console.log("🔄 Transfer initiated:", {
    sourceAccountId,
    destinationAccountId,
    amount,
    reference,
    initiatedBy,
    amountType: typeof amount,
    amountValue: amount,
  });
  
  // Validation
  if (!amount || amount <= 0) {
    throw new Error("Invalid amount");
  }
  if (!sourceAccountId || !destinationAccountId) {
    throw new Error("Both source and destination account IDs are required");
  }
  if (sourceAccountId === destinationAccountId) {
    throw new Error("Cannot transfer to the same account");
  }

  const MAX_RETRIES = 3;
  let lastError;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const accountClient = await accountRepo.pool.connect();
    const ledgerClient = await ledgerRepo.pool.connect();
    
    try {
      console.log(`📝 Transfer attempt ${attempt}/${MAX_RETRIES}`);
      
      await accountClient.query("BEGIN");
      await ledgerClient.query("BEGIN");
      
      const [sourceAccount, destAccount] = await Promise.all([
        accountRepo.getAccountForUpdate(accountClient, sourceAccountId),
        accountRepo.getAccountForUpdate(accountClient, destinationAccountId),
      ]);
      
      console.log("📊 Accounts loaded:", {
        sourceBalance: sourceAccount?.cached_balance,
        destBalance: destAccount?.cached_balance,
        sourceCurrency: sourceAccount?.currency,
        destCurrency: destAccount?.currency,
      });
      
      if (!sourceAccount) throw new Error("Source account not found");
      if (!destAccount) throw new Error("Destination account not found");
      
      if (sourceAccount.currency !== destAccount.currency) {
        throw new Error(`Currency mismatch: ${sourceAccount.currency} ≠ ${destAccount.currency}`);
      }
      
      // 💱 Decimal-safe arithmetic — Money.subtract throws on insufficient funds
      const currency      = sourceAccount.currency;
      const sourceMoney   = new Money(sourceAccount.cached_balance, currency);
      const destMoney     = new Money(destAccount.cached_balance,   currency);
      const transferMoney = new Money(amount, currency);

      // 🛑 Phase 0.3 — Daily transfer cap (rolling 24h DEBITs from source).
      // Computed *inside* the locked transaction to avoid race conditions.
      // Only enforced for TND accounts; cross-currency limits TBD.
      if (currency === "TND" && DAILY_TRANSFER_LIMIT_TND > 0) {
        const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const usedStr = await ledgerRepo.sumDebitsSince(ledgerClient, sourceAccountId, since);
        const used    = new Money(usedStr, "TND");
        const limit   = new Money(DAILY_TRANSFER_LIMIT_TND, "TND");
        const wouldBe = used.add(transferMoney);
        if (wouldBe.isGreaterThan(limit)) {
          const err = new Error(
            `Daily transfer limit exceeded: ${wouldBe.toFixed(4)} TND > ${limit.toFixed(4)} TND ` +
            `(already used ${used.toFixed(4)} in last 24h)`
          );
          err.code = "DAILY_LIMIT_EXCEEDED";
          throw err;
        }
      }

      let newSourceMoney;
      try {
        newSourceMoney = sourceMoney.subtract(transferMoney);
      } catch (e) {
        throw new Error(`Insufficient funds: ${sourceMoney.toFixed(4)} < ${transferMoney.toFixed(4)}`);
      }
      const newDestMoney = destMoney.add(transferMoney);

      const newSourceBalance = Number(newSourceMoney.toFixed(4));
      const newDestBalance   = Number(newDestMoney.toFixed(4));
      const sourceBalance    = Number(sourceMoney.toFixed(4));
      
      const transactionId = uuidv4();
      const timestamp = new Date().toISOString();
      
      const debitEntry = {
        id: uuidv4(),
        transactionId,
        accountId: sourceAccountId,
        type: "DEBIT",
        amount: Number(transferMoney.toFixed(4)),
        balance_snapshot: newSourceBalance,
        reference: reference || `Transfer to ${destinationAccountId}`,
        created_at: timestamp,
      };
      
      const creditEntry = {
        id: uuidv4(),
        transactionId,
        accountId: destinationAccountId,
        type: "CREDIT",
        amount: Number(transferMoney.toFixed(4)),
        balance_snapshot: newDestBalance,
        reference: reference || `Transfer from ${sourceAccountId}`,
        created_at: timestamp,
      };
      
      // Insert ledger entries
      await ledgerRepo.insertEntry(ledgerClient, debitEntry);
      await ledgerRepo.insertEntry(ledgerClient, creditEntry);
      
      // Update balances (persist as fixed-precision strings)
      await Promise.all([
        accountRepo.updateBalance(accountClient, sourceAccountId, newSourceMoney.toFixed(4)),
        accountRepo.updateBalance(accountClient, destinationAccountId, newDestMoney.toFixed(4)),
      ]);

      // 📤 Phase 1.2 — Outbox: one event per side, both in the ledger txn.
      await outboxRepo.enqueue(ledgerClient, {
        transactionId, topic: TX_TOPIC, partitionKey: sourceAccountId,
        payload: {
          transactionId, type: "TRANSFER_DEBIT",
          accountId: sourceAccountId, counterpartyAccountId: destinationAccountId,
          amount: Number(transferMoney.toFixed(4)), currency,
          balanceSnapshot: newSourceBalance,
          reference: debitEntry.reference, initiatedBy,
          timestamp,
        },
      });
      await outboxRepo.enqueue(ledgerClient, {
        transactionId, topic: TX_TOPIC, partitionKey: destinationAccountId,
        payload: {
          transactionId, type: "TRANSFER_CREDIT",
          accountId: destinationAccountId, counterpartyAccountId: sourceAccountId,
          amount: Number(transferMoney.toFixed(4)), currency,
          balanceSnapshot: newDestBalance,
          reference: creditEntry.reference, initiatedBy,
          timestamp,
        },
      });

      await accountClient.query("COMMIT");
      await ledgerClient.query("COMMIT");

      // Phase 2.1 — invalidate balance cache for both ends of the transfer.
      invalidateBalanceFor(sourceAccount.user_id).catch(() => {})
      invalidateBalanceFor(destAccount.user_id).catch(() => {})

      console.log("✅ Transfer successful:", { transactionId, newSourceBalance, newDestBalance });
      
      return {
        transactionId,
        source: {
          accountId: sourceAccountId,
          previousBalance: sourceBalance,
          newBalance: newSourceBalance,
        },
        destination: {
          accountId: destinationAccountId,
          previousBalance: Number(destMoney.toFixed(4)),
          newBalance: newDestBalance,
        },
        amount: Number(transferMoney.toFixed(4)),
        currency,
        reference,
        timestamp,
      };
      
    } catch (err) {
      lastError = err;
      console.error(`❌ Transfer attempt ${attempt} failed:`, err.message);
      console.error("Full error:", err);
      
      if (err.code === "40001" && attempt < MAX_RETRIES) {
        console.log(`⚠️ Serialization error, retrying...`);
        try { await accountClient.query("ROLLBACK"); } catch (_) {}
        try { await ledgerClient.query("ROLLBACK"); } catch (_) {}
        continue;
      }
      
      try { await accountClient.query("ROLLBACK"); } catch (_) {}
      try { await ledgerClient.query("ROLLBACK"); } catch (_) {}
      
      throw err;
      
    } finally {
      accountClient.release();
      ledgerClient.release();
    }
  }
  
  throw lastError || new Error("Transfer failed after all retries");
};
// services/account-service/src/account.service.js

exports.withdraw = async (accountId, amount, note) => {
  // ── Validation ───────────────────────────────────────────────────
  if (!amount || amount <= 0) {
    throw new Error("Invalid amount");
  }
  if (!accountId) {
    throw new Error("Account ID is required");
  }

  const accountClient = await accountRepo.pool.connect();
  const ledgerClient = await ledgerRepo.pool.connect();

  try {
    // ── Start distributed transaction ─────────────────────────────
    await accountClient.query("BEGIN");
    await ledgerClient.query("BEGIN");

    // 🔒 Lock account row for update (prevents race conditions)
    const account = await accountRepo.getAccountByCustomerId(
      accountClient,
      accountId
    );

    if (!account) {
      throw new Error("Account not found");
    }

    // 💱 Decimal-safe withdraw — Money.subtract throws on insufficient funds
    const currency        = account.currency;
    const currentMoney    = new Money(account.cached_balance, currency);
    const withdrawMoney   = new Money(amount, currency);

    let newMoney;
    try {
      newMoney = currentMoney.subtract(withdrawMoney);
    } catch (e) {
      throw new Error(`Insufficient funds: ${currentMoney.toFixed(4)} < ${withdrawMoney.toFixed(4)}`);
    }
    const newBalance      = Number(newMoney.toFixed(4));
    const current         = Number(currentMoney.toFixed(4));
    const transactionId   = uuidv4();
    const timestamp       = new Date().toISOString();

    // 📜 Insert DEBIT ledger entry
    await ledgerRepo.insertEntry(ledgerClient, {
      id: uuidv4(),
      transactionId,
      accountId: account.id,
      type: "DEBIT",
      amount: Number(withdrawMoney.toFixed(4)),
      balance_snapshot: newBalance,
      reference: note || `Withdrawal ${new Date().toLocaleDateString()}`,
      created_at: timestamp,
    });

    // 💰 Update account balance
    await accountRepo.updateBalance(
      accountClient,
      account.id,
      newMoney.toFixed(4)
    );

    // 📤 Phase 1.2 — Outbox: enqueue withdrawal event.
    await outboxRepo.enqueue(ledgerClient, {
      transactionId, topic: TX_TOPIC, partitionKey: account.id,
      payload: {
        transactionId, type: "WITHDRAW", accountId: account.id,
        amount: Number(withdrawMoney.toFixed(4)), currency,
        balanceSnapshot: newBalance,
        reference: note || `Withdrawal ${new Date().toLocaleDateString()}`,
        timestamp,
      },
    });

    // ✅ Commit both sides of distributed transaction
    await accountClient.query("COMMIT");
    await ledgerClient.query("COMMIT");

    // Phase 2.1 — invalidate balance cache for the affected user.
    invalidateBalanceFor(account.user_id).catch(() => {})

    return {
      transactionId,
      accountId: account.id,
      previousBalance: current,
      newBalance,
      amount: Number(withdrawMoney.toFixed(4)),
      currency,
      reference: note,
      timestamp,
    };

  } catch (err) {
    console.error("❌ Withdraw transaction failed:", err.message);

    // 🔄 Rollback both connections on error
    try { await accountClient.query("ROLLBACK"); } catch (_) {}
    try { await ledgerClient.query("ROLLBACK"); } catch (_) {}

    throw err; // Re-throw for upstream handling

  } finally {
    // ♻️ Always release connections back to pool
    accountClient.release();
    ledgerClient.release();
  }
};
// ─────────────────────────────────────────────────────────────────────
// Phase 4.4 — Cancel a fraudulent transaction.
//
// Writes COMPENSATING ledger entries (never UPDATE/DELETE) and an outbox
// event `transaction.cancelled` in the SAME ledger transaction. Idempotent
// on `originalTransactionId` via a unique row in `cancelled_transactions`.
//
// Compensating entry rules:
//   - For every ledger row with transaction_id = original_tx_id, insert a
//     reverse-type row of equal amount (CREDIT ↔ DEBIT) tagged with
//     compensates = original_ledger_entry_id.
//   - Lock affected accounts FOR UPDATE in deterministic id order to avoid
//     deadlocks when multiple cancellations interleave.
//   - Recompute balance_snapshot from the locked account row + new delta.
//   - Each compensation gets a NEW transaction_id so it does not collide
//     with the original on `event_outbox.transaction_id` (PRIMARY KEY).
// ─────────────────────────────────────────────────────────────────────
const CANCELLED_TOPIC = process.env.TX_CANCELLED_TOPIC || "transaction.cancelled"

exports.cancelTransaction = async (originalTransactionId, { reason, cancelledBy }) => {
  if (!originalTransactionId) throw new Error("originalTransactionId required")
  if (!reason || String(reason).trim().length < 3) throw new Error("reason required (min 3 chars)")
  if (!cancelledBy) throw new Error("cancelledBy required")

  const accountClient = await accountRepo.pool.connect()
  const ledgerClient  = await ledgerRepo.pool.connect()
  const cancellationId = uuidv4()

  try {
    await accountClient.query("BEGIN")
    await ledgerClient.query("BEGIN")

    // 1) Idempotency check — fail fast if already cancelled.
    const existing = await ledgerClient.query(
      `SELECT cancellation_id, reason, cancelled_by, cancelled_at
         FROM cancelled_transactions
        WHERE original_transaction_id = $1`,
      [originalTransactionId]
    )
    if (existing.rows.length) {
      await accountClient.query("ROLLBACK")
      await ledgerClient.query("ROLLBACK")
      const e = new Error("Transaction already cancelled")
      e.code = "ALREADY_CANCELLED"
      e.existing = existing.rows[0]
      throw e
    }

    // 2) Load original ledger entries for this transaction. Reject if any of
    //    them is itself a compensation (cannot reverse a reversal).
    const orig = await ledgerClient.query(
      `SELECT id, account_id, type, amount, reference, compensates
         FROM ledger_entries
        WHERE transaction_id = $1
        ORDER BY account_id ASC`,
      [originalTransactionId]
    )
    if (orig.rows.length === 0) {
      const e = new Error("Original transaction not found")
      e.code = "NOT_FOUND"
      throw e
    }
    if (orig.rows.some(r => r.compensates !== null && r.compensates !== undefined)) {
      const e = new Error("Cannot cancel a compensating entry")
      e.code = "INVALID_TARGET"
      throw e
    }

    // 3) Lock ALL affected accounts in deterministic order (sorted ids).
    const accountIds = [...new Set(orig.rows.map(r => r.account_id))].sort()
    const lockedAccounts = {}
    for (const accId of accountIds) {
      const acc = await accountRepo.getAccountForUpdate(accountClient, accId)
      if (!acc) throw new Error(`Account ${accId} not found during cancellation`)
      lockedAccounts[accId] = acc
    }

    // 4) For each original entry: write a reverse entry + update balance.
    const compensations = []
    for (const e of orig.rows) {
      const acc        = lockedAccounts[e.account_id]
      const currency   = acc.currency
      const balMoney   = new Money(acc.cached_balance, currency)
      const amtMoney   = new Money(e.amount, currency)
      const reverseType = e.type === "DEBIT" ? "CREDIT" : "DEBIT"
      const newBalMoney = reverseType === "CREDIT" ? balMoney.add(amtMoney) : balMoney.subtract(amtMoney)
      const newBalance  = Number(newBalMoney.toFixed(4))

      const compEntry = {
        id:               uuidv4(),
        transactionId:    cancellationId,           // distinct tx_id for outbox PK
        accountId:        e.account_id,
        type:             reverseType,
        amount:           Number(amtMoney.toFixed(4)),
        balance_snapshot: newBalance,
        reference:        `Cancellation of ${originalTransactionId}: ${reason}`,
        created_at:       new Date().toISOString(),
      }
      // ledger.repository's insertEntry helper doesn't know about `compensates`,
      // so we INSERT directly so the FK-style tag column is set atomically.
      await ledgerClient.query(
        `INSERT INTO ledger_entries
           (id, transaction_id, account_id, type, amount, balance_snapshot, reference, created_at, compensates)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [compEntry.id, compEntry.transactionId, compEntry.accountId, compEntry.type,
         compEntry.amount, compEntry.balance_snapshot, compEntry.reference, compEntry.created_at, e.id]
      )
      await accountRepo.updateBalance(accountClient, e.account_id, newBalMoney.toFixed(4))
      lockedAccounts[e.account_id] = { ...acc, cached_balance: newBalMoney.toFixed(4) }
      compensations.push({
        compensatesLedgerId: e.id,
        accountId:           e.account_id,
        type:                reverseType,
        amount:              compEntry.amount,
        balanceSnapshot:     newBalance,
      })
    }

    // 5) Mark cancellation in registry.
    await ledgerClient.query(
      `INSERT INTO cancelled_transactions
         (original_transaction_id, cancellation_id, reason, cancelled_by)
       VALUES ($1, $2, $3, $4)`,
      [originalTransactionId, cancellationId, reason, cancelledBy]
    )

    // 6) Outbox event — relayed to Kafka by the existing relay loop.
    await outboxRepo.enqueue(ledgerClient, {
      transactionId: cancellationId,
      topic:         CANCELLED_TOPIC,
      partitionKey:  accountIds[0],
      payload: {
        type:                  "TRANSACTION_CANCELLED",
        originalTransactionId,
        cancellationId,
        reason,
        cancelledBy,
        affectedAccounts:      accountIds,
        compensations,
        timestamp:             new Date().toISOString(),
      },
    })

    await accountClient.query("COMMIT")
    await ledgerClient.query("COMMIT")

    // 7) Invalidate balance caches for every affected user.
    for (const accId of accountIds) {
      try {
        const acc = await accountRepo.findById(accId)
        if (acc) invalidateBalanceFor(acc.user_id).catch(() => {})
      } catch (_) {}
    }

    return {
      ok:                    true,
      originalTransactionId,
      cancellationId,
      reason,
      cancelledBy,
      affectedAccounts:      accountIds,
      compensations,
    }
  } catch (err) {
    try { await accountClient.query("ROLLBACK") } catch (_) {}
    try { await ledgerClient.query("ROLLBACK")  } catch (_) {}
    throw err
  } finally {
    accountClient.release()
    ledgerClient.release()
  }
}
