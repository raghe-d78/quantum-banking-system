// services/account-service/src/server.js
require("dotenv").config()
const app = require("./app")

const PORT = process.env.PORT || 3002

console.log("Starting account service...")

app.listen(PORT, () => {
  console.log(`Account service running on port ${PORT}`)
})