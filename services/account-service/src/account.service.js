// services/account-service/src/account.service.js
const accountRepo = require("./account.repository")
const ledgerRepo = require("./repositories/ledger.repository")
const { randomUUID: uuidv4 } = require("crypto")
const Money = require("/shared/money")

// Phase 0.3 — daily transfer cap (rolling 24h window of DEBITs from source).
// Tunable per environment via DAILY_TRANSFER_LIMIT_TND (default 10 000 TND).
const DAILY_TRANSFER_LIMIT_TND = Number(process.env.DAILY_TRANSFER_LIMIT_TND || 10000)


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
  const account = await accountRepo.findByUserId(userId)
  if (!account) throw new Error("Account not found")

  return {
    balance:       parseFloat(account.cached_balance),
    available:     parseFloat(account.cached_balance),  // no pending logic yet
    pending:       0.000,
    currency:      account.currency,
    accountNumber: account.id,
  }
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

    await accountClient.query("COMMIT")
    await ledgerClient.query("COMMIT")

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
      
      await accountClient.query("COMMIT");
      await ledgerClient.query("COMMIT");
      
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

    // ✅ Commit both sides of distributed transaction
    await accountClient.query("COMMIT");
    await ledgerClient.query("COMMIT");

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