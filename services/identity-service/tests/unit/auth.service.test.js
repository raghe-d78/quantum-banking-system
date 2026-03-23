const authService = require("../../src/auth.service")

test("should hash password and create user", async () => {
  const result = await authService.register({
    email: "test@test.com",
    password: "123456"
  })

  expect(result).toHaveProperty("id")
})