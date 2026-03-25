// services/account-service/src/middleware/auth.middleware.js
const jwt = require("jsonwebtoken")

const JWT_SECRET = process.env.JWT_SECRET || "supersecret_change_in_prod"

exports.authenticate = (req, res, next) => {
  const header = req.headers.authorization
  if (!header || !header.startsWith("Bearer "))
    return res.status(401).json({ message: "Missing or invalid token" })

  const token = header.split(" ")[1]
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    return res.status(401).json({ message: "Token expired or invalid" })
  }
}

exports.requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin")
    return res.status(403).json({ message: "Admin access required" })
  next()
}

exports.requireStaff = (req, res, next) => {
  if (!req.user || !["admin", "employee"].includes(req.user.role))
    return res.status(403).json({ message: "Staff access required" })
  next()
}