// shared/errors.js — typed application errors with a stable machine code and
// an HTTP status, so route handlers never have to pattern-match messages.
class AppError extends Error {
  constructor(code, message, status = 400, extra = {}) {
    super(message)
    this.name = "AppError"
    this.code = code
    this.status = status
    Object.assign(this, extra)
  }
  toJSON() {
    const { code, message } = this
    return { ok: false, code, message, ...(this.existing ? { existing: this.existing } : {}) }
  }
}

const E = {
  invalidAmount:        (m = "Invalid amount")                 => new AppError("INVALID_AMOUNT", m, 400),
  validation:           (m)                                     => new AppError("VALIDATION_ERROR", m, 400),
  notFound:             (m = "Not found")                       => new AppError("NOT_FOUND", m, 404),
  forbidden:            (m = "Access denied")                   => new AppError("FORBIDDEN", m, 403),
  insufficientFunds:    (m = "Insufficient funds")              => new AppError("INSUFFICIENT_FUNDS", m, 422),
  currencyMismatch:     (m = "Currency mismatch")               => new AppError("CURRENCY_MISMATCH", m, 400),
  dailyLimit:           (m)                                     => new AppError("DAILY_LIMIT_EXCEEDED", m, 429),
  conflict:             (code, m, extra)                        => new AppError(code, m, 409, extra),
  unprocessable:        (code, m)                               => new AppError(code, m, 422),
}

// Express error-handler factory: AppError → its status/body; anything else → 500.
function errorHandler(log) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, _next) => {
    if (err instanceof AppError) return res.status(err.status).json(err.toJSON())
    if (err?.type === "entity.parse.failed") return res.status(400).json({ ok: false, code: "BAD_JSON", message: "Malformed JSON body" })
    if (log) log.error("unhandled error", { err: err?.message, stack: err?.stack, path: req.originalUrl })
    else console.error(err)
    return res.status(500).json({ ok: false, code: "INTERNAL", message: "Internal server error" })
  }
}

module.exports = { AppError, E, errorHandler }
