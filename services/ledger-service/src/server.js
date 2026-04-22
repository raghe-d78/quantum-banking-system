const express = require("express")

const app = express()

app.get("/", (req, res) => {
  res.send("Ledger service running")
})

app.listen(3003, () => {
  console.log("Ledger service running on port 3003")
})