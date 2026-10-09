// tests/unit/auth.service.test.js
jest.mock("../../src/user.repository", () => ({
  findByUsername: jest.fn(),
  findByEmail:    jest.fn(),
  create:         jest.fn(),
  findById:       jest.fn(),
}))
// Phase 0.1: login persists a refresh token; mock that repo too.
jest.mock("../../src/refreshToken.repository", () => ({
  insert:           jest.fn().mockResolvedValue(undefined),
  findActive:       jest.fn(),
  revoke:           jest.fn().mockResolvedValue(undefined),
  revokeAllForUser: jest.fn().mockResolvedValue(undefined),
}))
// tests/unit/auth.service.test.js
jest.mock("axios", () => ({
  post: jest.fn(() => Promise.resolve({ data: { accountId: 123 } }))
}));

const authService = require("../../src/auth.service")
const userRepo    = require("../../src/user.repository")
const bcrypt      = require("bcrypt")

describe("authService.login", () => {
  beforeEach(() => jest.clearAllMocks())

  test("returns token and safe user object", async () => {
    const hash = await bcrypt.hash("secret", 10)
    userRepo.findByUsername.mockResolvedValue({
      id: "uuid-1", username: "khalil", email: "k@banque.tn",
      name: "Khalil Admin", role: "admin", password_hash: hash,
    })

    const result = await authService.login({ username: "khalil", password: "secret" })

    expect(result).toHaveProperty("token")
    expect(result.user).toMatchObject({ username: "khalil", role: "admin" })
    expect(result.user).not.toHaveProperty("password_hash")
  })

  test("throws on invalid password", async () => {
    const hash = await bcrypt.hash("correct", 10)
    userRepo.findByUsername.mockResolvedValue({
      id: "uuid-1", username: "khalil", email: "k@banque.tn",
      name: "Khalil", role: "customer", password_hash: hash,
    })

    await expect(authService.login({ username: "khalil", password: "wrong" }))
      .rejects.toThrow("Invalid credentials")
  })

  test("throws when user not found", async () => {
    userRepo.findByUsername.mockResolvedValue(null)
    userRepo.findByEmail.mockResolvedValue(null)

    await expect(authService.login({ username: "nobody", password: "x" }))
      .rejects.toThrow("Invalid credentials")
  })
})

describe("authService.createUser", () => {
  beforeEach(() => jest.clearAllMocks())

  test("hashes password and returns safe user", async () => {
    userRepo.create.mockResolvedValue({
      id: "uuid-2", username: "sarra", email: "s@banque.tn",
      name: "Sarra", role: "customer",
    })

    const result = await authService.createUser({
      username: "sarra", email: "s@banque.tn",
      name: "Sarra", password: "mypassword1",
    })

    expect(result.user).toMatchObject({ username: "sarra", role: "customer" })
    // Verify create was called with a hash, not the raw password
    const callArgs = userRepo.create.mock.calls[0][0]
    expect(callArgs.passwordHash).not.toBe("mypassword")
    expect(callArgs.passwordHash).toMatch(/^\$2b\$/)
  })

  test("throws if required fields are missing", async () => {
    await expect(authService.createUser({ username: "x" }))
      .rejects.toThrow("required")
  })
})
describe("authService hardening (Phase 6)", () => {
  beforeEach(() => jest.clearAllMocks())

  test("suspended users cannot log in", async () => {
    const hash = await bcrypt.hash("secret", 10)
    userRepo.findByUsername.mockResolvedValue({ id: "u", username: "s", email: "s@x", name: "S", role: "customer", status: "suspended", password_hash: hash })
    await expect(authService.login({ username: "s", password: "secret" })).rejects.toThrow("Account suspended")
  })

  test("portal pin: staff cannot use the customer login", async () => {
    const hash = await bcrypt.hash("secret", 10)
    userRepo.findByUsername.mockResolvedValue({ id: "u", username: "e", email: "e@x", name: "E", role: "employee", status: "active", password_hash: hash })
    await expect(authService.login({ username: "e", password: "secret", role: "customer" })).rejects.toThrow("Access denied")
  })

  test("createUser enforces password length, username and email format", async () => {
    await expect(authService.createUser({ username: "ok_user", email: "a@b.co", name: "n", password: "short" })).rejects.toThrow("at least 8")
    await expect(authService.createUser({ username: "bad user!", email: "a@b.co", name: "n", password: "longenough" })).rejects.toThrow("Username")
    await expect(authService.createUser({ username: "ok_user", email: "nope", name: "n", password: "longenough" })).rejects.toThrow("Invalid email")
  })

  test("createUser surfaces account-provisioning failure instead of swallowing it", async () => {
    const axios = require("axios")
    axios.post.mockRejectedValueOnce(new Error("ECONNREFUSED"))
    userRepo.create.mockResolvedValue({ id: "uuid-3", username: "c", email: "c@b.co", name: "C", role: "customer" })
    await expect(authService.createUser({ username: "cust", email: "c@b.co", name: "C", password: "longenough" }))
      .rejects.toMatchObject({ code: "ACCOUNT_PROVISIONING_FAILED" })
  })

  test("createUser sends an internal admin token to account-service", async () => {
    const axios = require("axios")
    const jwt = require("jsonwebtoken")
    userRepo.create.mockResolvedValue({ id: "uuid-4", username: "d", email: "d@b.co", name: "D", role: "customer" })
    await authService.createUser({ username: "dcust", email: "d@b.co", name: "D", password: "longenough" })
    const [url, body, cfg] = axios.post.mock.calls[0]
    expect(url).toMatch(/\/accounts\/create$/)
    expect(body).toEqual({ userId: "uuid-4", currency: "TND" })
    const payload = jwt.verify(cfg.headers.Authorization.replace("Bearer ", ""), process.env.JWT_SECRET || "supersecret_change_in_prod")
    expect(payload).toMatchObject({ userId: "system", role: "admin", internal: true })
  })
})
