// tests/unit/auth.service.test.js
jest.mock("../../src/user.repository", () => ({
  findByUsername: jest.fn(),
  findByEmail:    jest.fn(),
  create:         jest.fn(),
  findById:       jest.fn(),
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
      name: "Khalil", role: "user", password_hash: hash,
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
      name: "Sarra", role: "user",
    })

    const result = await authService.createUser({
      username: "sarra", email: "s@banque.tn",
      name: "Sarra", password: "mypassword",
    })

    expect(result.user).toMatchObject({ username: "sarra", role: "user" })
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