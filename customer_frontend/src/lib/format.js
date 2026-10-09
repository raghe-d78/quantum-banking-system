// Shared formatters for the customer SPA.
export const fmtMoney = (n, digits = 3) =>
  (Number(n) || 0).toLocaleString("fr-TN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtDate = (raw, opts = { day: "2-digit", month: "short", year: "numeric" }) =>
  raw ? new Date(raw).toLocaleDateString("en-GB", opts) : "—";
export const fmtTime = (raw) => raw ? new Date(raw).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
export const shortId = (s, n = 8) => (s ? `${String(s).slice(0, n)}…` : "—");
export const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || "").trim());

export const KIND_LABEL = {
  DEPOSIT: "Deposit", WITHDRAW: "Withdrawal", TRANSFER: "Transfer",
  BILL_PAYMENT: "Bill payment", MERCHANT_PAYMENT: "Purchase", CANCELLATION: "Reversal",
};

// Map backend error codes to human copy.
export const ERROR_COPY = {
  FORBIDDEN:                   "You can only move money from your own account.",
  INSUFFICIENT_FUNDS:          "Your balance is too low for this amount.",
  DAILY_LIMIT_EXCEEDED:        "This would exceed your 24-hour outgoing limit.",
  CURRENCY_MISMATCH:           "The two accounts use different currencies.",
  NOT_FOUND:                   "We could not find that account or payee.",
  ACCOUNT_INACTIVE:            "One of the accounts is frozen or closed.",
  INVALID_AMOUNT:              "Please enter a valid amount greater than zero.",
  VALIDATION_ERROR:            "Some details are missing or invalid.",
  RATE_LIMITED:                "Too many requests. Please wait a moment and try again.",
  IDEMPOTENT_IN_PROGRESS:      "This request is already being processed.",
  UPSTREAM_UNAVAILABLE:        "The banking core is temporarily unavailable. Please retry.",
  UPSTREAM_TIMEOUT:            "The request took too long. Please check your history before retrying.",
};
export const errorMessage = (err) => {
  const d = err?.response?.data;
  return ERROR_COPY[d?.code] || d?.message || d?.error || err?.message || "Something went wrong.";
};
