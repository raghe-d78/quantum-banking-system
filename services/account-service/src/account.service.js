// services/account-service/src/account.service.js
const accountRepo = require("./account.repository")

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
    balance:       parseFloat(account.balance),
    available:     parseFloat(account.balance),  // no pending logic yet
    pending:       0.000,
    currency:      account.currency,
    accountNumber: account.id,
  }
}