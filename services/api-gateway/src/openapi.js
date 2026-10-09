// Hand-written OpenAPI 3.0 spec for the Quantum Banking gateway (Phase 6).
// Every route below is served by the gateway; auth is enforced AT the gateway
// (JWT) and again by each downstream service.
const uuid = { type: "string", format: "uuid" }
const bearer = [{ bearerAuth: [] }]
const err = (description) => ({ description, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } })
const ok  = (description, schema) => ({ description, ...(schema ? { content: { "application/json": { schema } } } : {}) })
const idParam = (name = "id", schema = uuid) => ({ name, in: "path", required: true, schema })

module.exports = {
  openapi: "3.0.3",
  info: {
    title: "Quantum Banking System — Gateway API",
    version: "2.0.0",
    description:
      "Public surface of the Quantum Banking System, fronted by the API gateway. " +
      "All endpoints except `/health`, `/ready`, `/docs*` and the four `/auth/*` entry points require a Bearer access token " +
      "from `/auth/customer/login` or `/auth/staff/login` (HS256, 15 min). `/admin/*`, `/fraud/*`, `/kms/*`, `/ledger/*` and " +
      "`/audit/*` additionally require a staff role (`admin` or `employee`). Money is decimal-safe end-to-end (4 fractional digits). " +
      "Errors use `{ ok:false, code, message }` with stable machine codes.",
  },
  servers: [{ url: "http://localhost:3000", description: "Local docker stack" }, { url: "https://{domain}", variables: { domain: { default: "localhost" } }, description: "Caddy TLS edge (prod overlay)" }],
  tags: [
    { name: "meta" }, { name: "auth" }, { name: "account" }, { name: "transactions" }, { name: "money" },
    { name: "admin" }, { name: "ledger" }, { name: "audit" }, { name: "fraud" }, { name: "quantum" }, { name: "kms" }, { name: "documents" },
  ],
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    schemas: {
      Error: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: false },
          code: { type: "string", example: "INSUFFICIENT_FUNDS",
            description: "VALIDATION_ERROR | INVALID_AMOUNT | NOT_FOUND | FORBIDDEN | INSUFFICIENT_FUNDS | CURRENCY_MISMATCH | DAILY_LIMIT_EXCEEDED | ACCOUNT_INACTIVE | ALREADY_CANCELLED | INVALID_TARGET | REVERSAL_INSUFFICIENT_FUNDS | RATE_LIMITED | UPSTREAM_UNAVAILABLE | UPSTREAM_TIMEOUT | INTERNAL" },
          message: { type: "string" },
        },
      },
      LoginRequest: { type: "object", required: ["username", "password"], properties: { username: { type: "string", example: "adminn", description: "username or email" }, password: { type: "string", example: "admin123" } } },
      LoginResponse: {
        type: "object",
        properties: {
          token: { type: "string", description: "Access JWT (JWT_EXPIRES, default 15m)" },
          refreshToken: { type: "string", description: "Rotating refresh JWT (7d), stored hashed server-side" },
          user: { $ref: "#/components/schemas/User" },
        },
      },
      RefreshRequest: { type: "object", required: ["refreshToken"], properties: { refreshToken: { type: "string" } } },
      User: {
        type: "object",
        properties: {
          id: uuid, username: { type: "string" }, email: { type: "string", format: "email" }, name: { type: "string" },
          role: { type: "string", enum: ["admin", "employee", "customer"] }, status: { type: "string", enum: ["active", "suspended"] },
          phone: { type: "string", nullable: true }, address: { type: "string", nullable: true },
        },
      },
      CreateUserRequest: {
        type: "object", required: ["username", "email", "name", "password"],
        properties: { username: { type: "string", pattern: "^[a-zA-Z0-9._-]{3,50}$" }, email: { type: "string", format: "email" }, name: { type: "string" }, password: { type: "string", minLength: 8 }, role: { type: "string", enum: ["admin", "employee", "customer"], default: "customer" } },
      },
      Balance: {
        type: "object",
        properties: { balance: { type: "number" }, available: { type: "number" }, pending: { type: "number" }, currency: { type: "string", example: "TND" }, accountNumber: uuid, status: { type: "string", enum: ["ACTIVE", "FROZEN", "CLOSED"] } },
      },
      Transaction: {
        type: "object",
        properties: {
          id: uuid, transactionId: uuid, accountId: uuid,
          type: { type: "string", enum: ["CREDIT", "DEBIT"] },
          txType: { type: "string", enum: ["DEPOSIT", "WITHDRAW", "TRANSFER", "BILL_PAYMENT", "MERCHANT_PAYMENT", "CANCELLATION"] },
          amount: { type: "number" }, balanceSnapshot: { type: "number" }, reference: { type: "string", nullable: true },
          compensates: { ...uuid, nullable: true, description: "Original ledger row this entry reverses" },
          createdAt: { type: "string", format: "date-time" }, initiatedBy: { type: "string", enum: ["Staff", "Customer"] },
        },
      },
      TransferRequest: {
        type: "object", required: ["sourceAccountId", "destinationAccountId", "amount"],
        properties: {
          sourceAccountId: { ...uuid, description: "Must belong to the caller unless the caller is staff" },
          destinationAccountId: uuid,
          amount: { oneOf: [{ type: "number" }, { type: "string" }], example: "250.5000", description: "Decimal string preferred" },
          reference: { type: "string", maxLength: 100, example: "Rent payment" },
        },
      },
      TransferResult: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          data: { type: "object", properties: {
            transactionId: uuid, amount: { type: "number" }, currency: { type: "string" }, reference: { type: "string", nullable: true }, timestamp: { type: "string", format: "date-time" },
            source: { type: "object", properties: { accountId: uuid, previousBalance: { type: "number" }, newBalance: { type: "number" } } },
            destination: { type: "object", properties: { accountId: uuid, previousBalance: { type: "number" }, newBalance: { type: "number" } } },
          } },
        },
      },
      WithdrawRequest: { type: "object", required: ["amount"], properties: { amount: { oneOf: [{ type: "number" }, { type: "string" }], example: "50.0000" }, note: { type: "string", maxLength: 100 } } },
      DepositRequest: { type: "object", required: ["accountId", "amount"], properties: { accountId: uuid, amount: { oneOf: [{ type: "number" }, { type: "string" }], example: "1000.0000" }, note: { type: "string", maxLength: 100 } } },
      CancelRequest: { type: "object", required: ["reason"], properties: { reason: { type: "string", minLength: 3, maxLength: 500, example: "Confirmed fraud — card-not-present pattern" } } },
      CancelResult: {
        type: "object",
        properties: {
          ok: { type: "boolean" }, originalTransactionId: uuid, cancellationId: uuid, reason: { type: "string" }, cancelledBy: uuid,
          affectedAccounts: { type: "array", items: uuid },
          compensations: { type: "array", items: { type: "object", properties: { ledgerId: uuid, compensatesLedgerId: uuid, accountId: uuid, type: { type: "string" }, amount: { type: "number" }, balanceSnapshot: { type: "number" } } } },
        },
      },
      FraudAlert: {
        type: "object",
        properties: {
          transactionId: uuid, accountId: uuid, riskLevel: { type: "string", enum: ["High", "Critical"] }, decisionScore: { type: "number" },
          status: { type: "string", enum: ["OPEN", "CANCELLED", "DISMISSED"] }, createdAt: { type: "string", format: "date-time" },
          resolvedAt: { type: "string", format: "date-time", nullable: true }, resolvedBy: { ...uuid, nullable: true },
        },
      },
      Reconciliation: {
        type: "object",
        properties: { accountId: uuid, entries: { type: "integer" }, ledgerBalance: { type: "string" }, cachedBalance: { type: "string" }, lastSnapshot: { type: "string", nullable: true }, drift: { type: "string" }, consistent: { type: "boolean" } },
      },
      BB84Request: {
        type: "object",
        properties: { n_qubits: { type: "integer", minimum: 8, maximum: 1024, default: 256 }, rounds: { type: "integer", minimum: 1, maximum: 9, default: 3 }, with_eve: { type: "boolean", default: false }, qber_threshold: { type: "number", default: 0.11 }, backend: { type: "string", enum: ["simulator", "ibm"] } },
      },
    },
  },
  security: bearer,
  paths: {
    "/health": { get: { tags: ["meta"], security: [], summary: "Gateway liveness", responses: { "200": ok("OK") } } },
    "/ready":  { get: { tags: ["meta"], security: [], summary: "Readiness incl. upstream health", responses: { "200": ok("All critical upstreams up"), "503": ok("Degraded") } } },

    "/auth/customer/login": { post: { tags: ["auth"], security: [], summary: "Customer login (rate-limited 20/15min/IP)", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/LoginRequest" } } } },
      responses: { "200": ok("Tokens issued", { $ref: "#/components/schemas/LoginResponse" }), "401": err("Bad credentials / suspended"), "429": err("Rate limit exceeded") } } },
    "/auth/staff/login": { post: { tags: ["auth"], security: [], summary: "Staff/admin login (rate-limited)", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/LoginRequest" } } } },
      responses: { "200": ok("Tokens issued", { $ref: "#/components/schemas/LoginResponse" }), "401": err("Bad credentials"), "403": err("Not a staff account"), "429": err("Rate limit exceeded") } } },
    "/auth/refresh": { post: { tags: ["auth"], security: [], summary: "Rotate refresh token (reuse detection revokes the whole chain)", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/RefreshRequest" } } } },
      responses: { "200": ok("New token pair", { $ref: "#/components/schemas/LoginResponse" }), "401": err("Invalid, expired or reused refresh token") } } },
    "/auth/logout": { post: { tags: ["auth"], security: [], summary: "Revoke a refresh token (idempotent)", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/RefreshRequest" } } } }, responses: { "200": ok("Revoked") } } },
    "/auth/me": {
      get: { tags: ["auth"], summary: "Current user profile", responses: { "200": ok("Profile", { type: "object", properties: { user: { $ref: "#/components/schemas/User" } } }), "401": err("Unauthorized") } },
      put: { tags: ["auth"], summary: "Update own profile (name, email, phone, address)", responses: { "200": ok("Updated"), "400": err("Validation"), "409": err("Email in use") } },
    },
    "/auth/password": { put: { tags: ["auth"], summary: "Change own password", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["currentPassword", "newPassword"], properties: { currentPassword: { type: "string" }, newPassword: { type: "string", minLength: 8 } } } } } },
      responses: { "200": ok("Updated"), "401": err("Current password incorrect"), "422": err("Too short") } } },

    "/balance": { get: { tags: ["account"], summary: "Balance of the caller's account (Redis read-through, 60 s TTL)", responses: { "200": ok("OK", { $ref: "#/components/schemas/Balance" }), "404": err("No account") } } },
    "/accounts/verify/{id}": { get: { tags: ["account"], summary: "Verify a recipient account before transferring (non-sensitive fields only)", parameters: [idParam()],
      responses: { "200": ok("OK", { type: "object", properties: { accountId: uuid, name: { type: "string" }, currency: { type: "string" }, status: { type: "string" } } }), "404": err("Not found") } } },

    "/payees": { get: { tags: ["transactions"], summary: "Billers and merchants that can be paid", parameters: [{ name: "kind", in: "query", schema: { type: "string", enum: ["BILLER", "MERCHANT"] } }],
      responses: { "200": ok("OK", { type: "object", properties: { payees: { type: "array", items: { type: "object", properties: { code: { type: "string" }, name: { type: "string" }, kind: { type: "string" }, category: { type: "string" }, referenceHint: { type: "string" } } } } } }) } } },
    "/transactions": {
      post: { tags: ["transactions"], summary: "Create a transaction from the caller's own account (unified endpoint)",
        description: "`kind` selects the flow: TRANSFER (destinationAccountId), BILL_PAYMENT (payeeCode + referenceNumber), MERCHANT_PAYMENT (payeeCode), WITHDRAW. Send an `Idempotency-Key` header (8-128 chars) to make retries safe: the stored response is replayed with HTTP 200 and `replayed: true`.",
        parameters: [{ name: "Idempotency-Key", in: "header", required: false, schema: { type: "string", pattern: "^[\\w.:-]{8,128}$" } }],
        requestBody: { required: true, content: { "application/json": { schema: {
          type: "object", required: ["kind", "amount"],
          properties: {
            kind: { type: "string", enum: ["TRANSFER", "BILL_PAYMENT", "MERCHANT_PAYMENT", "WITHDRAW"] },
            amount: { oneOf: [{ type: "number" }, { type: "string" }], example: "45.0000" },
            destinationAccountId: { ...uuid, description: "TRANSFER only" },
            payeeCode: { type: "string", example: "STEG", description: "BILL_PAYMENT / MERCHANT_PAYMENT" },
            documentId: { ...uuid, description: "Supporting document from POST /documents/analyze (owner-bound, single use, analysed for this amount). SUSPICIOUS documents park the request: HTTP 202 { held:true }." },
            referenceNumber: { type: "string", maxLength: 64, description: "Contract / invoice / order number (required for bills)" },
            reference: { type: "string", maxLength: 100 }, note: { type: "string", maxLength: 100, description: "WITHDRAW" },
          } } } } },
        responses: {
          "201": ok("Created", { type: "object", properties: { success: { type: "boolean" }, data: { type: "object", properties: { transactionId: uuid, kind: { type: "string" }, amount: { type: "number" }, currency: { type: "string" }, newBalance: { type: "number" }, reference: { type: "string", nullable: true }, timestamp: { type: "string", format: "date-time" }, counterparty: { type: "object", nullable: true, properties: { code: { type: "string" }, name: { type: "string" }, accountId: uuid } } } } } }),
          "200": ok("Replayed from Idempotency-Key"), "202": ok("Held for manual verification", { type: "object", properties: { success: { type: "boolean" }, data: { type: "object", properties: { held: { type: "boolean" }, holdId: uuid, reason: { type: "string" }, documentId: uuid, documentStatus: { type: "string" }, amount: { type: "number" } } } } }),
          "400": err("Validation"), "403": err("Not your account / document"), "404": err("Payee / destination / document not found"),
          "409": err("IDEMPOTENT_IN_PROGRESS or DOCUMENT_ALREADY_USED"), "422": err("Insufficient funds / inactive"), "429": err("Daily limit"),
        } },
      get: { tags: ["transactions"], summary: "List the caller's ledger entries",
      parameters: [
        { name: "type", in: "query", schema: { type: "string", enum: ["CREDIT", "DEBIT"] } },
        { name: "txType", in: "query", schema: { type: "string", enum: ["DEPOSIT", "WITHDRAW", "TRANSFER", "CANCELLATION"] } },
        { name: "dateFrom", in: "query", schema: { type: "string", format: "date" } }, { name: "dateTo", in: "query", schema: { type: "string", format: "date" } },
        { name: "minAmount", in: "query", schema: { type: "number" } }, { name: "maxAmount", in: "query", schema: { type: "number" } },
        { name: "initiatedBy", in: "query", schema: { type: "string", enum: ["staff", "customer"] } },
        { name: "limit", in: "query", schema: { type: "integer", maximum: 100, default: 20 } }, { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        { name: "order", in: "query", schema: { type: "string", enum: ["ASC", "DESC"], default: "DESC" } },
      ],
      responses: { "200": ok("OK", { type: "object", properties: { transactions: { type: "array", items: { $ref: "#/components/schemas/Transaction" } }, count: { type: "integer" } } }), "400": err("Bad filter") } },
    },
    "/transactions/holds": { get: { tags: ["transactions"], summary: "The caller's transactions suspended by the document-risk policy", parameters: [{ name: "status", in: "query", schema: { type: "string", enum: ["PENDING_REVIEW", "RELEASED", "REJECTED"] } }], responses: { "200": ok("OK") } } },
    "/documents/analyze": { post: { tags: ["documents"], summary: "Analyse an uploaded check or receipt (OCR, integrity, signature, cross-checks, duplicates)",
      description: "multipart/form-data: `file` (JPEG/PNG ≤ 10 MB), `expectedAmount` (decimal string, the amount the customer will declare), `expectedCurrency`, `kind` (default CHECK). Returns status CLEAN / REVIEW / SUSPICIOUS, a risk score, reasons, the 9-feature vector, OCR fields with confidences and every integrity signal. The image is stored encrypted; see docs/CV_EXTENSION.md.",
      requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["file"], properties: { file: { type: "string", format: "binary" }, expectedAmount: { type: "string" }, expectedCurrency: { type: "string" }, kind: { type: "string" } } } } } },
      responses: { "201": ok("Analysis"), "400": err("EMPTY_FILE | UNSUPPORTED_FORMAT | CORRUPT_IMAGE | IMAGE_TOO_SMALL | IMAGE_TOO_LARGE"), "413": err("FILE_TOO_LARGE"), "415": err("Not multipart") } } },
    "/documents/{id}": { get: { tags: ["documents"], summary: "Document analysis (owner or staff)", parameters: [idParam()], responses: { "200": ok("Analysis"), "403": err("Not your document"), "404": err("Not found") } } },
    "/documents/{id}/image": { get: { tags: ["documents"], summary: "Decrypted image (owner or staff), never cached", parameters: [idParam()], responses: { "200": { description: "image/jpeg" }, "403": err("Forbidden"), "404": err("Not found") } } },
    "/documents": { get: { tags: ["documents"], summary: "All analysed documents (staff)", parameters: [{ name: "status", in: "query", schema: { type: "string", enum: ["CLEAN", "REVIEW", "SUSPICIOUS"] } }, { name: "owner", in: "query", schema: uuid }, { name: "limit", in: "query", schema: { type: "integer", maximum: 200 } }], responses: { "200": ok("OK") } } },
    "/documents/{id}/review": { post: { tags: ["documents"], summary: "Annotate a document as reviewed (staff)", parameters: [idParam()], requestBody: { content: { "application/json": { schema: { type: "object", properties: { note: { type: "string" } } } } } }, responses: { "200": ok("OK") } } },
    "/documents/signatures/{userId}": {
      post: { tags: ["documents"], summary: "Enrol a customer's reference signature (staff, multipart `file`)", parameters: [idParam("userId")], responses: { "201": ok("Enrolled") } },
      get:  { tags: ["documents"], summary: "Enrolment status (staff)", parameters: [idParam("userId")], responses: { "200": ok("OK") } },
    },
    "/admin/holds": { get: { tags: ["admin"], summary: "Held transactions (staff)", parameters: [{ name: "status", in: "query", schema: { type: "string", enum: ["PENDING_REVIEW", "RELEASED", "REJECTED", "all"], default: "PENDING_REVIEW" } }], responses: { "200": ok("OK") } } },
    "/admin/holds/{id}/release": { post: { tags: ["admin"], summary: "Release a held transaction: executes the parked request atomically on behalf of the customer", parameters: [idParam()], requestBody: { content: { "application/json": { schema: { type: "object", properties: { note: { type: "string" } } } } } }, responses: { "200": ok("Released, includes the transaction"), "404": err("Not found"), "409": err("HOLD_ALREADY_DECIDED"), "422": err("Insufficient funds at release time") } } },
    "/admin/holds/{id}/reject": { post: { tags: ["admin"], summary: "Reject a held transaction (nothing is written to the ledger)", parameters: [idParam()], responses: { "200": ok("Rejected"), "409": err("HOLD_ALREADY_DECIDED") } } },
    "/transactions/export": { get: { tags: ["transactions"], summary: "Export the caller's statement (CSV, or print-ready HTML)", parameters: [{ name: "format", in: "query", schema: { type: "string", enum: ["csv", "pdf"], default: "csv" } }],
      responses: { "200": { description: "text/csv or text/html" }, "400": err("Unsupported format") } } },
    "/transactions/{id}": { get: { tags: ["transactions"], summary: "Read one ledger entry (must belong to the caller)", parameters: [idParam()],
      responses: { "200": ok("OK", { type: "object", properties: { transaction: { $ref: "#/components/schemas/Transaction" } } }), "403": err("Not yours"), "404": err("Not found") } } },

    "/transfer": { post: { tags: ["money"], summary: "Atomic transfer (one CockroachDB transaction: both balances, two ledger rows, two outbox events)",
      description: "Customers may only debit their own account. Enforces a rolling-24h `DAILY_TRANSFER_LIMIT_TND` on outgoing TRANSFER debits. Retries transparently on serialization conflicts.",
      requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/TransferRequest" } } } },
      responses: { "200": ok("Committed", { $ref: "#/components/schemas/TransferResult" }), "400": err("Validation / currency mismatch"), "403": err("Source account not owned by caller"), "404": err("Account not found"), "422": err("Insufficient funds / inactive account"), "429": err("Daily transfer limit exceeded") } } },
    "/withdraw": { post: { tags: ["money"], summary: "Withdraw from the caller's own account (row-locked)", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/WithdrawRequest" } } } },
      responses: { "200": ok("Committed"), "400": err("Invalid amount"), "422": err("Insufficient funds") } } },

    "/admin/users": {
      get: { tags: ["admin"], summary: "List users (admin)", parameters: [{ name: "role", in: "query", schema: { type: "string" } }, { name: "status", in: "query", schema: { type: "string" } }, { name: "search", in: "query", schema: { type: "string" } }], responses: { "200": ok("OK"), "403": err("Admin only") } },
      post: { tags: ["admin"], summary: "Create a user (admin); customers get an account provisioned atomically", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateUserRequest" } } } },
        responses: { "201": ok("Created"), "400": err("Validation"), "409": err("Username/email in use"), "502": err("Account provisioning failed") } },
    },
    "/admin/users/{id}": {
      get:    { tags: ["admin"], summary: "Get a user (staff)", parameters: [idParam()], responses: { "200": ok("OK"), "404": err("Not found") } },
      put:    { tags: ["admin"], summary: "Update a user (admin): name, email, phone, address, role, status", parameters: [idParam()], responses: { "200": ok("OK"), "404": err("Not found"), "409": err("Email in use") } },
      delete: { tags: ["admin"], summary: "Delete a user (admin, not self)", parameters: [idParam()], responses: { "200": ok("Deleted"), "403": err("Own account"), "404": err("Not found") } },
    },
    "/admin/deposit": { post: { tags: ["admin"], summary: "Staff deposit into any account", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/DepositRequest" } } } },
      responses: { "200": ok("Committed"), "400": err("Invalid amount"), "404": err("Account not found"), "422": err("Account inactive") } } },
    "/admin/accounts/{id}": { get: { tags: ["admin"], summary: "Look up an account by account id, user id, username or email (staff)", parameters: [idParam("id", { type: "string" })], responses: { "200": ok("OK"), "404": err("Not found") } } },
    "/admin/accounts/{id}/transactions": { get: { tags: ["admin"], summary: "Ledger entries of any account (staff), same filters as /transactions", parameters: [idParam()], responses: { "200": ok("OK"), "404": err("Not found") } } },
    "/admin/transactions/{id}/cancel": { post: { tags: ["admin"], summary: "Cancel a transaction with compensating ledger entries (idempotent)",
      description: "Never mutates or deletes original rows. Writes a reverse row per leg tagged `compensates`, registers the cancellation, publishes `transaction.cancelled`, and the fraud alert is closed asynchronously.",
      parameters: [idParam()], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CancelRequest" } } } },
      responses: { "200": ok("Cancelled", { $ref: "#/components/schemas/CancelResult" }), "400": err("Reason required"), "404": err("Original transaction not found"), "409": err("ALREADY_CANCELLED or REVERSAL_INSUFFICIENT_FUNDS"), "422": err("Cannot cancel a compensating entry") } } },
    "/admin/outbox/stats": { get: { tags: ["admin"], summary: "Outbox row counts by status (PENDING / SENT / FAILED)", responses: { "200": ok("OK") } } },

    "/ledger/accounts/{id}/entries": { get: { tags: ["ledger"], summary: "Raw append-only ledger rows of an account (staff)", parameters: [idParam(), { name: "limit", in: "query", schema: { type: "integer", maximum: 500 } }, { name: "offset", in: "query", schema: { type: "integer" } }], responses: { "200": ok("OK") } } },
    "/ledger/accounts/{id}/reconcile": { get: { tags: ["ledger"], summary: "Recompute balance from the ledger and compare with the cached balance", parameters: [idParam()], responses: { "200": ok("OK", { $ref: "#/components/schemas/Reconciliation" }), "404": err("Not found") } } },
    "/ledger/transactions/{txId}": { get: { tags: ["ledger"], summary: "All legs of a transaction + double-entry balance check", parameters: [idParam("txId")], responses: { "200": ok("OK"), "404": err("Not found") } } },
    "/ledger/entries/{id}": { get: { tags: ["ledger"], summary: "One ledger row", parameters: [idParam()], responses: { "200": ok("OK"), "404": err("Not found") } } },

    "/audit/stats":  { get: { tags: ["audit"], summary: "Audit log counts by event type + consumer health", responses: { "200": ok("OK") } } },
    "/audit/recent": { get: { tags: ["audit"], summary: "Most recent audit rows", parameters: [{ name: "limit", in: "query", schema: { type: "integer", maximum: 200 } }, { name: "accountId", in: "query", schema: uuid }], responses: { "200": ok("OK") } } },

    "/fraud/stats":  { get: { tags: ["fraud"], summary: "Scored counts per risk level, alert counts, consumer metrics", responses: { "200": ok("OK") } } },
    "/fraud/alerts": { get: { tags: ["fraud"], summary: "Fraud alerts (High/Critical)", parameters: [{ name: "limit", in: "query", schema: { type: "integer", maximum: 200 } }, { name: "status", in: "query", schema: { type: "string", enum: ["OPEN", "CANCELLED", "DISMISSED"] } }, { name: "risk", in: "query", schema: { type: "string", enum: ["High", "Critical"] } }],
      responses: { "200": ok("OK", { type: "object", properties: { alerts: { type: "array", items: { $ref: "#/components/schemas/FraudAlert" } } } }) } } },
    "/fraud/alerts/{id}/dismiss": { post: { tags: ["fraud"], summary: "Close an alert as reviewed-benign (ledger untouched)", parameters: [idParam()], responses: { "200": ok("Dismissed"), "404": err("No open alert") } } },
    "/fraud/model-info": { get: { tags: ["fraud"], summary: "Classical + VQC model metadata and training metrics", responses: { "200": ok("OK") } } },
    "/fraud/score": { post: { tags: ["fraud"], summary: "Ad-hoc scoring of a transaction-shaped payload (optionally with a document)", requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { transactionId: { type: "string" }, accountId: { type: "string" }, amount: { type: "number" }, timestamp: { type: "string" }, documentId: uuid, document: { type: "object", description: "inline CV features (cv-features-v1)" } } } } } }, responses: { "200": ok("Verdict") } } },

    "/quantum/backend": { get: { tags: ["quantum"], summary: "Active quantum backend (simulator | ibm)", responses: { "200": ok("OK") } } },
    "/quantum/qrng": { get: { tags: ["quantum"], summary: "Quantum random bytes (Hadamard sampling; Aer or IBM hardware)", parameters: [{ name: "bytes", in: "query", schema: { type: "integer", minimum: 1, maximum: 65536, default: 16 } }], responses: { "200": ok("OK") } } },
    "/quantum/qkd/bb84": { post: { tags: ["quantum"], summary: "Run BB84 with optional eavesdropper", requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/BB84Request" } } } }, responses: { "200": ok("Key accepted"), "422": ok("All rounds exceeded QBER threshold") } } },
    "/quantum/qkd/visualize": { get: { tags: ["quantum"], summary: "BB84 circuit diagram (PNG)", parameters: [{ name: "n_qubits", in: "query", schema: { type: "integer", maximum: 16 } }, { name: "with_eve", in: "query", schema: { type: "boolean" } }], responses: { "200": { description: "image/png" } } } },

    "/kms/keys": { post: { tags: ["kms"], summary: "Mint a BB84-derived AES-256-GCM key (staff). Stored in Redis, read-once.", responses: { "201": ok("Key handle"), "503": err("BB84 rejected / insufficient key material") } } },
    "/kms/keys/{kid}": { get: { tags: ["kms"], summary: "Consume a key (returns it once, then deletes it)", parameters: [idParam("kid")], responses: { "200": ok("Key material"), "410": err("Missing or already consumed") } } },
  },
}
