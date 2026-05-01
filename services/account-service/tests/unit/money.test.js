// Phase 0.2 — proves shared/money eliminates IEEE-754 drift in TND amounts.
const Money = require("/shared/money")

describe("Money (shared/money.js)", () => {
  test("0.1 + 0.2 yields exactly 0.3000 (no float drift)", () => {
    const sum = new Money("0.1", "TND").add(new Money("0.2", "TND"))
    expect(sum.toFixed(4)).toBe("0.3000")
    // Sanity: raw JS floats fail this
    expect((0.1 + 0.2).toString()).not.toBe("0.3")
  })

  test("accumulating 1000 deposits of 0.01 yields exactly 10.0000", () => {
    let total = new Money("0", "TND")
    for (let i = 0; i < 1000; i++) {
      total = total.add(new Money("0.01", "TND"))
    }
    expect(total.toFixed(4)).toBe("10.0000")
  })

  test("subtract throws on insufficient funds (would go negative)", () => {
    const balance = new Money("50.0000", "TND")
    expect(() => balance.subtract(new Money("50.0001", "TND")))
      .toThrow(/Insufficient/)
  })

  test("currency mismatch is rejected", () => {
    expect(() => new Money("10", "TND").add(new Money("10", "EUR")))
      .toThrow(/Currency mismatch/)
  })

  test("rounding boundary uses ROUND_HALF_EVEN at 4 dp", () => {
    // 0.00005 → banker's rounding → 0.0000
    expect(new Money("0.00005", "TND").toFixed(4)).toBe("0.0000")
    // 0.00015 → banker's rounding → 0.0002
    expect(new Money("0.00015", "TND").toFixed(4)).toBe("0.0002")
  })
})
