// services/account-service/tests/unit/account.service.test.js
jest.mock("../../src/account.repository", () => ({
  create:        jest.fn(),
  findByUserId:  jest.fn(),
  findById:      jest.fn(),
}))

const accountService = require("../../src/account.service")
const accountRepo    = require("../../src/account.repository")

describe("accountService.createAccount", () => {
  beforeEach(() => jest.clearAllMocks())

  test("creates account and returns it", async () => {
    accountRepo.findByUserId.mockResolvedValue(null)
    accountRepo.create.mockResolvedValue({
      id: "acc-uuid", user_id: "user-uuid",
      balance: "0.000", currency: "TND",
    })

    const result = await accountService.createAccount({ userId: "user-uuid" })

    expect(result.account).toMatchObject({ user_id: "user-uuid", currency: "TND" })
    expect(accountRepo.create).toHaveBeenCalledWith({ userId: "user-uuid", currency: "TND" })
  })

  test("throws if account already exists", async () => {
    accountRepo.findByUserId.mockResolvedValue({ id: "existing" })

    await expect(accountService.createAccount({ userId: "user-uuid" }))
      .rejects.toThrow("Account already exists")
  })

  test("throws if userId missing", async () => {
    await expect(accountService.createAccount({}))
      .rejects.toThrow("userId is required")
  })
})

describe("accountService.getBalance", () => {
  beforeEach(() => jest.clearAllMocks())

  test("returns balance data", async () => {
    accountRepo.findByUserId.mockResolvedValue({
      id: "acc-uuid", user_id: "user-uuid",
      balance: "2450.500", currency: "TND",
    })

    const result = await accountService.getBalance("user-uuid")

    expect(result).toMatchObject({ balance: 2450.5, currency: "TND" })
  })

  test("throws if account not found", async () => {
    accountRepo.findByUserId.mockResolvedValue(undefined)

    await expect(accountService.getBalance("ghost-uuid"))
      .rejects.toThrow("Account not found")
  })
})