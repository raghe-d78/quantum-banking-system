// tests/api/auth.test.js
const request = require("supertest")
const app     = require("../../src/app")

// Mock the user repository so tests don't need a real DB
jest.mock("../../src/user.repository", () => ({
  findByUsername: jest.fn(),
  findByEmail:    jest.fn(),
  create:         jest.fn(),
  findById:       jest.fn(),
}))

const userRepo = require("../../src/user.repository")
const bcrypt   = require("bcrypt")

describe("POST /auth/login", () => {
  beforeEach(() => jest.clearAllMocks())

  test("returns token and user on valid credentials", async () => {
    const hash = await bcrypt.hash("password123", 10)
    userRepo.findByUsername.mockResolvedValue({
      id: "uuid-1", username: "mohamed", email: "m@banque.tn",
      name: "Mohamed Ben Ali", role: "user", password_hash: hash,
    })

    const res = await request(app)
      .post("/auth/login")
      .send({ username: "mohamed", password: "password123" })

    expect(res.statusCode).toBe(200)
    expect(res.body).toHaveProperty("token")
    expect(res.body).toHaveProperty("user")
    expect(res.body.user).toMatchObject({
      username: "mohamed",
      name:     "Mohamed Ben Ali",
      role:     "user",
    })
    expect(res.body.user).not.toHaveProperty("password_hash")
  })

  test("returns 401 on wrong password", async () => {
    const hash = await bcrypt.hash("correctpassword", 10)
    userRepo.findByUsername.mockResolvedValue({
      id: "uuid-1", username: "mohamed", email: "m@banque.tn",
      name: "Mohamed Ben Ali", role: "user", password_hash: hash,
    })

    const res = await request(app)
      .post("/auth/login")
      .send({ username: "mohamed", password: "wrongpassword" })

    expect(res.statusCode).toBe(401)
    expect(res.body).toHaveProperty("message")
  })

  test("returns 401 when user not found", async () => {
    userRepo.findByUsername.mockResolvedValue(null)
    userRepo.findByEmail.mockResolvedValue(null)

    const res = await request(app)
      .post("/auth/login")
      .send({ username: "ghost", password: "whatever" })

    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe("Invalid credentials")
  })
})

describe("POST /admin/users", () => {
  beforeEach(() => jest.clearAllMocks())

  const getAdminToken = () => {
    const jwt = require("jsonwebtoken")
    return jwt.sign(
      { userId: "admin-uuid", role: "admin" },
      process.env.JWT_SECRET || "supersecret_change_in_prod"
    )
  }

  test("admin can create a user", async () => {
    userRepo.create.mockResolvedValue({
      id: "new-uuid", username: "sarra", email: "sarra@banque.tn",
      name: "Sarra Ben Ali", role: "user",
    })

    const res = await request(app)
      .post("/admin/users")
      .set("Authorization", `Bearer ${getAdminToken()}`)
      .send({ username: "sarra", email: "sarra@banque.tn", name: "Sarra Ben Ali", password: "pass123" })

    expect(res.statusCode).toBe(201)
    expect(res.body.user).toMatchObject({ username: "sarra", role: "user" })
  })

  test("returns 401 without token", async () => {
    const res = await request(app)
      .post("/admin/users")
      .send({ username: "x", email: "x@x.com", name: "X", password: "x" })

    expect(res.statusCode).toBe(401)
  })

  test("returns 403 if not admin", async () => {
    const jwt   = require("jsonwebtoken")
    const token = jwt.sign(
      { userId: "user-uuid", role: "user" },
      process.env.JWT_SECRET || "supersecret_change_in_prod"
    )

    const res = await request(app)
      .post("/admin/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ username: "x", email: "x@x.com", name: "X", password: "x" })

    expect(res.statusCode).toBe(403)
  })
})