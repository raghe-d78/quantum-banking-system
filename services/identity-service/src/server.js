// identity-service/src/server.js
require("dotenv").config()
const app = require("./app")

const PORT = process.env.PORT || 3001

app.listen(PORT, () => {
  console.log(`Identity service running on port ${PORT}`)
})