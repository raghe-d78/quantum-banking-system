// services/account-service/src/app.js
const express = require("express")
const cors    = require("cors")
const routes  = require("./routes")

const app = express()

app.use(cors())
app.use(express.json())
app.use(routes)

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ message: "Internal server error" })
})

module.exports = app