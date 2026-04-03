// shared/money.js
const Decimal = require("decimal.js");
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

const SUPPORTED_CURRENCIES = ["TND", "EUR", "USD"];

class Money {
  constructor(amount, currency = "TND") {
    if (!SUPPORTED_CURRENCIES.includes(currency))
      throw new Error(`Unsupported currency: ${currency}. Supported: ${SUPPORTED_CURRENCIES.join(", ")}`);

    if (amount === null || amount === undefined)
      throw new Error("Invalid amount: null or undefined");

    let decimal;
    try {
      decimal = new Decimal(amount);
      if (decimal.isNaN()) throw new Error();
    } catch {
      throw new Error(`Invalid amount: "${amount}" is not a valid number`);
    }

    if (decimal.isNegative())
      throw new Error(`Amount cannot be negative: ${amount}`);

    // Store as Decimal rounded to 4 places
    this._decimal  = decimal.toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN);
    this.currency  = currency;

    // Expose .amount as an object whose toString() always returns 4 decimals
    const self = this;
    this.amount = {
      toString:      () => self._decimal.toFixed(4),
      toNumber:      () => self._decimal.toNumber(),
      toFixed:       (n) => self._decimal.toFixed(n),
      isZero:        () => self._decimal.isZero(),
      greaterThan:   (o) => self._decimal.greaterThan(o._decimal),
      lessThan:      (o) => self._decimal.lessThan(o._decimal),
      equals:        (o) => self._decimal.equals(o._decimal),
      plus:          (o) => ({ _decimal: self._decimal.plus(o._decimal) }),
      minus:         (o) => ({ _decimal: self._decimal.minus(o._decimal) }),
      isNegative:    () => self._decimal.isNegative(),
    };

    Object.freeze(this);
  }

  add(other) {
    this._assertSameCurrency(other);
    return new Money(this._decimal.plus(other._decimal).toFixed(4), this.currency);
  }

  subtract(other) {
    this._assertSameCurrency(other);
    const result = this._decimal.minus(other._decimal);
    if (result.isNegative())
      throw new Error(`Insufficient funds: cannot subtract ${other.toString()} from ${this.toString()}`);
    return new Money(result.toFixed(4), this.currency);
  }

  isGreaterThan(other) {
    this._assertSameCurrency(other);
    return this._decimal.greaterThan(other._decimal);
  }

  isLessThan(other) {
    this._assertSameCurrency(other);
    return this._decimal.lessThan(other._decimal);
  }

  isEqualTo(other) {
    this._assertSameCurrency(other);
    return this._decimal.equals(other._decimal);
  }

  isZero() {
    return this._decimal.isZero();
  }

  toString() {
    return `${this._decimal.toFixed(4)} ${this.currency}`;
  }

  toNumber() {
    return this._decimal.toNumber();
  }

  toFixed(decimals = 4) {
    return this._decimal.toFixed(decimals);
  }

  static of(amount, currency = "TND") {
    return new Money(amount, currency);
  }

  _assertSameCurrency(other) {
    if (this.currency !== other.currency)
      throw new Error(`Currency mismatch: cannot operate on ${this.currency} and ${other.currency}`);
  }
}

module.exports = Money;