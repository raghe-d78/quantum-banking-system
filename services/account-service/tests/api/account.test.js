// services/account-service/tests/api/account.test.js
jest.mock("../../src/account.repository", () => ({
  create:       jest.fn(),
  findByUserId: jest.fn(),
  findById:     jest.fn(),
}))

const request     = require("supertest")
const app         = require("../../src/app")
const accountRepo = require("../../src/account.repository")
const jwt         = require("jsonwebtoken")

const SECRET = process.env.JWT_SECRET || "supersecret_change_in_prod"

const makeToken = (role) =>
  jwt.sign({ userId: "test-uuid", role }, SECRET)

describe("POST /accounts/create", () => {
  beforeEach(() => jest.clearAllMocks())

  test("admin can create account", async () => {
    accountRepo.findByUserId.mockResolvedValue(null)
    accountRepo.create.mockResolvedValue({
      id: "acc-uuid", user_id: "user-uuid",
      balance: "0.000", currency: "TND",
    })

    const res = await request(app)
      .post("/accounts/create")
      .set("Authorization", `Bearer ${makeToken("admin")}`)
      .send({ userId: "user-uuid" })

    expect(res.statusCode).toBe(201)
    expect(res.body.account).toMatchObject({ currency: "TND" })
  })

  test("returns 403 if not admin", async () => {
    const res = await request(app)
      .post("/accounts/create")
      .set("Authorization", `Bearer ${makeToken("user")}`)
      .send({ userId: "user-uuid" })

    expect(res.statusCode).toBe(403)
  })

  test("returns 401 without token", async () => {
    const res = await request(app)
      .post("/accounts/create")
      .send({ userId: "user-uuid" })

    expect(res.statusCode).toBe(401)
  })
})

describe("GET /balance", () => {
  beforeEach(() => jest.clearAllMocks())

  test("returns balance for authenticated user", async () => {
    accountRepo.findByUserId.mockResolvedValue({
      id: "acc-uuid", user_id: "test-uuid",
      cached_balance: "1500.000", currency: "TND",
    })

    const res = await request(app)
      .get("/balance")
      .set("Authorization", `Bearer ${makeToken("user")}`)

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ balance: 1500, currency: "TND" })
  })

  test("returns 401 without token", async () => {
    const res = await request(app).get("/balance")
    expect(res.statusCode).toBe(401)
  })
})