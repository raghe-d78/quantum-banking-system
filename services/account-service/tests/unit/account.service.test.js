const { installRepoMocks } = require("../helpers/mocks")
installRepoMocks()

const accountService = require("../../src/account.service")
const accountRepo    = require("../../src/repositories/account.repository")
const cache          = require("/shared/cache")

beforeEach(() => jest.clearAllMocks())

describe("createAccount", () => {
  test("creates account and returns it", async () => {
    accountRepo.findByUserId.mockResolvedValue(null)
    accountRepo.create.mockResolvedValue({ id: "acc-uuid", user_id: "user-uuid", cached_balance: "0.0000", currency: "TND" })
    const result = await accountService.createAccount({ userId: "user-uuid" })
    expect(result.account).toMatchObject({ user_id: "user-uuid", currency: "TND" })
    expect(accountRepo.create).toHaveBeenCalledWith({ userId: "user-uuid", currency: "TND" })
  })
  test("rejects duplicate with ACCOUNT_EXISTS (409)", async () => {
    accountRepo.findByUserId.mockResolvedValue({ id: "existing" })
    await expect(accountService.createAccount({ userId: "u" })).rejects.toMatchObject({ code: "ACCOUNT_EXISTS", status: 409 })
  })
  test("rejects missing userId", async () => {
    await expect(accountService.createAccount({})).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })
})

describe("getBalance", () => {
  test("cache miss reads DB and warms cache", async () => {
    accountRepo.findByUserId.mockResolvedValue({ id: "acc", user_id: "u", cached_balance: "2450.5000", currency: "TND", status: "ACTIVE" })
    const r = await accountService.getBalance("u")
    expect(r).toMatchObject({ balance: 2450.5, currency: "TND", accountNumber: "acc" })
    expect(cache.setEx).toHaveBeenCalledWith("balance:user:u", expect.any(String), expect.any(Number))
  })
  test("cache hit skips DB", async () => {
    cache.get.mockResolvedValueOnce(JSON.stringify({ balance: 1, currency: "TND" }))
    const r = await accountService.getBalance("u")
    expect(r.balance).toBe(1)
    expect(accountRepo.findByUserId).not.toHaveBeenCalled()
  })
  test("throws NOT_FOUND when account missing", async () => {
    accountRepo.findByUserId.mockResolvedValue(undefined)
    await expect(accountService.getBalance("ghost")).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 })
  })
})

describe("parseAmount", () => {
  const { parseAmount } = accountService._internal
  test.each([0, -5, "abc", null, undefined, "1e999", NaN])("rejects %p", (v) => {
    expect(() => parseAmount(v, "TND")).toThrow(/Invalid amount/)
  })
  test("accepts decimal strings from the frontend", () => {
    expect(parseAmount("12.3400", "TND").toFixed(4)).toBe("12.3400")
  })
})
