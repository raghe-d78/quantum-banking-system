// services/account-service/src/app.js
const express = require("express")
const cors    = require("cors")
const routes  = require("./routes")
const { errorHandler } = require("/shared/errors")
const log = require("/shared/logger")("account-service")

const app = express()
app.disable("x-powered-by")
app.use(cors())
app.use(express.json({ limit: "64kb" }))
app.use(routes)
app.use((_req, res) => res.status(404).json({ ok: false, code: "NOT_FOUND", message: "Route not found" }))
app.use(errorHandler(log))

module.exports = app
