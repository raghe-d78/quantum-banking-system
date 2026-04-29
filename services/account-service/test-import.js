console.log("🧪 Testing txService import...");

try {
  const txService = require("./src/transaction.service");
  console.log("✅ txService loaded:", Object.keys(txService));
  console.log("✅ listTransactions is:", typeof txService.listTransactions);
} catch (err) {
  console.error("❌ Failed to import txService:", err.message);
  console.error("Stack:", err.stack);
}

console.log("🧪 Testing accountService import...");
try {
  const accountService = require("./src/account.service");
  console.log("✅ accountService loaded:", Object.keys(accountService));
} catch (err) {
  console.error("❌ Failed to import accountService:", err.message);
}