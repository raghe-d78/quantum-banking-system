// tests/integration/user.repository.test.js
// Requires a real identity_db connection — run with a test DB

const userRepo = require("../../src/user.repository")

describe("userRepository (integration)", () => {
  const testEmail    = `test_${Date.now()}@banque.tn`
  const testUsername = `user_${Date.now()}`
  let createdUser

  test("creates a user and returns it", async () => {
    createdUser = await userRepo.create({
      username:     testUsername,
      email:        testEmail,
      name:         "Test User",
      passwordHash: "$2b$10$hashedpassword",
      role:         "user",
    })

    expect(createdUser).toHaveProperty("id")
    expect(createdUser.email).toBe(testEmail)
    expect(createdUser.role).toBe("user")
  })

  test("finds user by email", async () => {
    const found = await userRepo.findByEmail(testEmail)
    expect(found).toBeDefined()
    expect(found.username).toBe(testUsername)
  })

  test("finds user by username", async () => {
    const found = await userRepo.findByUsername(testUsername)
    expect(found).toBeDefined()
    expect(found.email).toBe(testEmail)
  })

  test("returns undefined for unknown email", async () => {
    const found = await userRepo.findByEmail("ghost@nowhere.tn")
    expect(found).toBeUndefined()
  })
})