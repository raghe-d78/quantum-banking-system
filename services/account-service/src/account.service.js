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
