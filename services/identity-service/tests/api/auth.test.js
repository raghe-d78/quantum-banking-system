const request = require("supertest")
const app = require("../../src/app")

describe("Auth API", () => {
  test("POST /register", async () => {
    const res = await request(app)
      .post("/register")
      .send({
        email: "test@test.com",
        password: "123456"
      })

    expect(res.statusCode).toBe(200)
    expect(res.body).toHaveProperty("userId")
  })
})