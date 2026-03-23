const express = require("express")
const router = express.Router()

const authService = require("./auth.service")

router.post("/register", async (req, res) => {
  try {
    const result = await authService.register(req.body)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.post("/login", async (req, res) => {
  try {
    const result = await authService.login(req.body)
    res.json(result)
  } catch (err) {
    res.status(401).json({ error: err.message })
  }
})

module.exports = router