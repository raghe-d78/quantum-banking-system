const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")
const userRepo = require("./user.repository")

const JWT_SECRET = "supersecret"

exports.register = async ({ email, password }) => {
  const hash = await bcrypt.hash(password, 10)

  const user = await userRepo.create(email, hash)

  return { userId: user.id }
}

exports.login = async ({ email, password }) => {
  const user = await userRepo.findByEmail(email)

  if (!user) throw new Error("Invalid credentials")

  const valid = await bcrypt.compare(password, user.password_hash)

  if (!valid) throw new Error("Invalid credentials")

  const token = jwt.sign({ userId: user.id }, JWT_SECRET)

  return { token }
}