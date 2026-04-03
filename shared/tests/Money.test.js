const Money = require("../money");

describe("Money — Construction", () => {
  test("creates Money with 4 decimal precision", () => {
    const m = new Money(10.5);
    expect(m.amount.toString()).toBe("10.5000");
  });
  test("creates Money from string", () => {
    expect(new Money("10.1234").amount.toString()).toBe("10.1234");
  });
  test("rounds to 4 decimals using HALF_EVEN", () => {
    // HALF_EVEN: digit before 5 is EVEN (4) → round DOWN
    expect(new Money("10.12345").amount.toString()).toBe("10.1234"); // banker's rounding
    // HALF_EVEN: digit before 5 is ODD (5) → round UP
    expect(new Money("10.12355").amount.toString()).toBe("10.1236");
  });
  test("throws if amount is null", () => {
    expect(() => new Money(null)).toThrow("Invalid amount");
  });
  test("throws if amount is string 'abc'", () => {
    expect(() => new Money("abc")).toThrow("Invalid amount");
  });
  test("throws if amount is negative", () => {
    expect(() => new Money(-1)).toThrow("Amount cannot be negative");
  });
  test("accepts zero", () => {
    expect(new Money(0).amount.toString()).toBe("0.0000");
  });
});

describe("Money — Currency", () => {
  test("defaults to TND", () => {
    expect(new Money(100).currency).toBe("TND");
  });
  test("accepts EUR, USD, TND", () => {
    expect(new Money(100, "EUR").currency).toBe("EUR");
    expect(new Money(100, "USD").currency).toBe("USD");
  });
  test("throws on unsupported currency", () => {
    expect(() => new Money(100, "XYZ")).toThrow("Unsupported currency");
  });
});

describe("Money — Addition", () => {
  test("Money(10.00) + Money(5.55) = Money(15.55)", () => {
    const result = new Money("10.00").add(new Money("5.55"));
    expect(result.amount.toString()).toBe("15.5500");
  });
  test("0.1 + 0.2 = 0.3000 (no float trap)", () => {
    expect(new Money("0.1").add(new Money("0.2")).amount.toString()).toBe("0.3000");
  });
  test("throws on currency mismatch", () => {
    expect(() => new Money(10,"TND").add(new Money(5,"EUR"))).toThrow("Currency mismatch");
  });
  test("returns new instance (immutability)", () => {
    const a = new Money(10);
    const c = a.add(new Money(5));
    expect(c).not.toBe(a);
    expect(a.amount.toString()).toBe("10.0000");
  });
});

describe("Money — Subtraction", () => {
  test("Money(10.00) - Money(3.50) = Money(6.50)", () => {
    expect(new Money("10.00").subtract(new Money("3.50")).amount.toString()).toBe("6.5000");
  });
  test("throws Insufficient funds when result negative", () => {
    expect(() => new Money("5.00").subtract(new Money("10.00"))).toThrow("Insufficient funds");
  });
  test("allows zero result", () => {
    expect(new Money("5.00").subtract(new Money("5.00")).amount.toString()).toBe("0.0000");
  });
  test("throws on currency mismatch", () => {
    expect(() => new Money(10,"TND").subtract(new Money(5,"EUR"))).toThrow("Currency mismatch");
  });
});

describe("Money — Comparison", () => {
  test("isGreaterThan", () => {
    expect(new Money(10).isGreaterThan(new Money(5))).toBe(true);
    expect(new Money(5).isGreaterThan(new Money(10))).toBe(false);
  });
  test("isLessThan", () => {
    expect(new Money(5).isLessThan(new Money(10))).toBe(true);
  });
  test("isEqualTo", () => {
    expect(new Money("10.0000").isEqualTo(new Money("10.00"))).toBe(true);
    expect(new Money(10).isEqualTo(new Money(11))).toBe(false);
  });
  test("isZero", () => {
    expect(new Money(0).isZero()).toBe(true);
    expect(new Money(0.0001).isZero()).toBe(false);
  });
});

describe("Money — Serialization", () => {
  test("toString returns amount with currency", () => {
    expect(new Money("1500.500","TND").toString()).toBe("1500.5000 TND");
  });
  test("toNumber returns JS number", () => {
    expect(new Money("10.5000").toNumber()).toBe(10.5);
  });
  test("toFixed(3) returns 3 decimals", () => {
    expect(new Money("10.5678").toFixed(3)).toBe("10.568");
  });
});