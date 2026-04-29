// services/account-service/src/account.service.js
// const accountRepo = require("./account.repository")
const accountRepo = require("./repositories/account.repository")
const ledgerRepo = require("./repositories/ledger.repository")
const { v4: uuidv4 } = require("uuid")


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

    const current = Number(account.cached_balance)
    const newBalance = current + Number(amount)

    const transactionId = uuidv4()

    // 📜 Ledger entry
    await ledgerRepo.insertEntry(ledgerClient, {
      transactionId,
      accountId,
      type: "CREDIT",
      amount,
      balance: newBalance
    })

    // 💰 Update balance
    await accountRepo.updateBalance(
      accountClient,
      accountId,
      newBalance
    )

    await accountClient.query("COMMIT")
    await ledgerClient.query("COMMIT")

    return {
      transactionId,
      balance: newBalance
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
      
      const sourceBalance = Number(sourceAccount.cached_balance);
      if (sourceBalance < amount) {
        throw new Error(`Insufficient funds: ${sourceBalance} < ${amount}`);
      }
      
      const newSourceBalance = sourceBalance - Number(amount);
      const newDestBalance = Number(destAccount.cached_balance) + Number(amount);
      
      console.log("💰 Calculated balances:", {
        sourceBalance,
        newSourceBalance,
        destBalance: Number(destAccount.cached_balance),
        newDestBalance,
        amount: Number(amount),
      });
      
      const transactionId = uuidv4();
      const timestamp = new Date().toISOString();
      
      // 🔥 CRITICAL: Log what we're about to insert
      const debitEntry = {
        id: uuidv4(),
        transactionId,
        accountId: sourceAccountId,
        type: "DEBIT",
        amount: Number(amount),
        balance_snapshot: newSourceBalance, // ← This MUST be a number
        reference: reference || `Transfer to ${destinationAccountId}`,
        
        created_at: timestamp,
      };
      
      const creditEntry = {
        id: uuidv4(),
        transactionId,
        accountId: destinationAccountId,
        type: "CREDIT",
        amount: Number(amount),
        balance_snapshot: newDestBalance, // ← This MUST be a number
        reference: reference || `Transfer from ${sourceAccountId}`,
        
        created_at: timestamp,
      };
      
      console.log("📝 DEBIT entry to insert:", {
        ...debitEntry,
        balance_snapshot_type: typeof debitEntry.balance_snapshot,
        balance_snapshot_is_nan: isNaN(debitEntry.balance_snapshot),
        balance_snapshot_is_null: debitEntry.balance_snapshot === null,
        balance_snapshot_is_undefined: debitEntry.balance_snapshot === undefined,
      });
      
      console.log("📝 CREDIT entry to insert:", {
        ...creditEntry,
        balance_snapshot_type: typeof creditEntry.balance_snapshot,
        balance_snapshot_is_nan: isNaN(creditEntry.balance_snapshot),
        balance_snapshot_is_null: creditEntry.balance_snapshot === null,
        balance_snapshot_is_undefined: creditEntry.balance_snapshot === undefined,
      });
      
      // 🔥 VALIDATE before inserting
      if (debitEntry.balance_snapshot === null || debitEntry.balance_snapshot === undefined || isNaN(debitEntry.balance_snapshot)) {
        throw new Error(`DEBIT balance_snapshot is invalid: ${debitEntry.balance_snapshot} (type: ${typeof debitEntry.balance_snapshot})`);
      }
      if (creditEntry.balance_snapshot === null || creditEntry.balance_snapshot === undefined || isNaN(creditEntry.balance_snapshot)) {
        throw new Error(`CREDIT balance_snapshot is invalid: ${creditEntry.balance_snapshot} (type: ${typeof creditEntry.balance_snapshot})`);
      }
      
      // Insert ledger entries
      await ledgerRepo.insertEntry(ledgerClient, debitEntry);
      await ledgerRepo.insertEntry(ledgerClient, creditEntry);
      
      // Update balances
      await Promise.all([
        accountRepo.updateBalance(accountClient, sourceAccountId, newSourceBalance),
        accountRepo.updateBalance(accountClient, destinationAccountId, newDestBalance),
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
          previousBalance: Number(destAccount.cached_balance),
          newBalance: newDestBalance,
        },
        amount,
        currency: sourceAccount.currency,
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

exports.withdraw = async (accountId, amount, note) => {
  if (!amount || amount <= 0) {
    throw new Error("Invalid amount")
  }
  const accountClient = await accountRepo.pool.connect()
  const ledgerClient = await ledgerRepo.pool.connect()
  try {
    await accountClient.query("BEGIN")
    await ledgerClient.query("BEGIN")
    // 🔒 Lock account row
    const account = await accountRepo.getAccountByCustomerId(
      accountClient,
      accountId
    )
    if (!account) throw new Error("Account not found")
    const current = Number(account.cached_balance)
    if (current < amount) {
      throw new Error("Insufficient funds")
    }
    const newBalance = current - Number(amount)
    const transactionId = uuidv4()
    // 📜 Ledger entry
    await ledgerRepo.insertEntry(ledgerClient, {
      transactionId,
      accountId: account.id,
      type: "DEBIT",
      amount,
      balance: newBalance,
      note
    })
    // 💰 Update balance
    await accountRepo.updateBalance(
      accountClient,
      account.id,
      newBalance
    )
    await accountClient.query("COMMIT")
    await ledgerClient.query("COMMIT")
    return {
      transactionId,
      balance: newBalance
    }
  } catch (err) {
    console.error("Error in withdraw transaction:", err) 
    await accountClient.query("ROLLBACK")
    await ledgerClient.query("ROLLBACK")
    throw err
  } finally {
    accountClient.release()
    ledgerClient.release()
  }
<<<<<<< HEAD
}
=======
}
>>>>>>> 8bfc41ab992050b783e85aa5f446c30d316c8846
