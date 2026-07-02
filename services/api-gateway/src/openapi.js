// Hand-written OpenAPI 3.0 spec for the Quantum Banking gateway.
// Kept in JS (not YAML) so we don't add yet another dependency.
module.exports = {
  openapi: "3.0.3",
  info: {
    title: "Quantum Banking System — Gateway API",
    version: "0.5.0",
    description:
      "Public surface of the Quantum Banking System, fronted by the API gateway " +
      "(port 3000). All write endpoints require a Bearer JWT obtained from " +
      "`/auth/customer/login` or `/auth/staff/login`. Money values are kept " +
      "decimal-safe end-to-end (Decimal.js, 4 fractional digits).",
  },
  servers: [{ url: "http://localhost:3000", description: "Local docker stack" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      LoginRequest: {
        type: "object",
        required: ["username", "password"],
        properties: {
          username: { type: "string", example: "adminn" },
          password: { type: "string", example: "admin123" },
        },
      },
      LoginResponse: {
        type: "object",
        properties: {
          token:        { type: "string", description: "Short-lived access JWT (24h)" },
          refreshToken: { type: "string", description: "Long-lived rotating refresh JWT (7d)" },
          user: {
            type: "object",
            properties: {
              id:       { type: "string", format: "uuid" },
              username: { type: "string" },
              email:    { type: "string", format: "email" },
              name:     { type: "string" },
              role:     { type: "string", enum: ["admin", "staff", "customer"] },
            },
          },
        },
      },
      RefreshRequest: {
        type: "object",
        required: ["refreshToken"],
        properties: { refreshToken: { type: "string" } },
      },
      Account: {
        type: "object",
        properties: {
          id:             { type: "string", format: "uuid" },
          customer_id:    { type: "string", format: "uuid" },
          currency:       { type: "string", example: "TND" },
          cached_balance: { type: "string", example: "1234.5600", description: "Decimal string, 4dp" },
          status:         { type: "string", example: "ACTIVE" },
        },
      },
      TransferRequest: {
        type: "object",
        required: ["sourceAccountId", "destinationAccountId", "amount"],
        properties: {
          sourceAccountId:      { type: "string", format: "uuid" },
          destinationAccountId: { type: "string", format: "uuid" },
          amount:               { type: "number", example: 250.5 },
          reference:            { type: "string", example: "Rent payment" },
        },
      },
      DepositRequest: {
        type: "object",
        required: ["accountId", "amount"],
        properties: {
          accountId: { type: "string", format: "uuid" },
          amount:    { type: "number", example: 1000 },
        },
      },
      Error: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error:   { type: "string" },
          message: { type: "string" },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/health": {
      get: {
        tags: ["meta"], security: [], summary: "Gateway liveness probe",
        responses: { "200": { description: "OK" } },
      },
    },
    "/auth/customer/login": {
      post: {
        tags: ["auth"], security: [], summary: "Customer login (rate-limited 20/15min)",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/LoginRequest" } } } },
        responses: {
          "200": { description: "Tokens issued", content: { "application/json": { schema: { $ref: "#/components/schemas/LoginResponse" } } } },
          "401": { description: "Bad credentials" },
          "429": { description: "Rate limit exceeded" },
        },
      },
    },
    "/auth/staff/login": {
      post: {
        tags: ["auth"], security: [], summary: "Staff/admin login (rate-limited 20/15min)",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/LoginRequest" } } } },
        responses: { "200": { description: "OK" }, "401": { description: "Bad credentials" }, "429": { description: "Rate limit exceeded" } },
      },
    },
    "/auth/me": {
      get: {
        tags: ["auth"], summary: "Current user profile from access token",
        responses: { "200": { description: "Profile" }, "401": { description: "Missing/invalid token" } },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["auth"], security: [], summary: "Rotate refresh token (revokes old, issues new)",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/RefreshRequest" } } } },
        responses: { "200": { description: "New token pair" }, "401": { description: "Refresh invalid or already used" } },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["auth"], security: [], summary: "Revoke current refresh chain",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/RefreshRequest" } } } },
        responses: { "200": { description: "Revoked" } },
      },
    },
    "/account": {
      get: {
        tags: ["account"], summary: "Get the authenticated user's primary account",
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Account" } } } } } },
          "401": { description: "Unauthorized" }, "404": { description: "Not found" },
        },
      },
    },
    "/balance": {
      get: { tags: ["account"], summary: "Get balance of authenticated user's account",
        responses: { "200": { description: "OK" }, "401": { description: "Unauthorized" } } },
    },
    "/transactions": {
      get: { tags: ["transactions"], summary: "List transactions for current user",
        responses: { "200": { description: "OK" } } },
      post: { tags: ["transactions"], summary: "Create a generic transaction (legacy)",
        responses: { "200": { description: "OK" } } },
    },
    "/transactions/{id}": {
      get: {
        tags: ["transactions"], summary: "Read one transaction by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
    "/transfer": {
      post: {
        tags: ["money"],
        summary: "Transfer money between two accounts (Decimal-safe, daily-capped)",
        description:
          "Atomically debits the source and credits the destination, with a write-ahead ledger entry. " +
          "Enforces a rolling-24h `DAILY_TRANSFER_LIMIT_TND` (default 10 000) for TND accounts.",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/TransferRequest" } } } },
        responses: {
          "200": { description: "Transfer committed" },
          "400": { description: "Insufficient funds / currency mismatch" },
          "404": { description: "Source or destination account not found" },
          "429": { description: "Daily transfer limit exceeded", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/withdraw": {
      post: { tags: ["money"], summary: "Customer withdrawal",
        responses: { "200": { description: "OK" }, "400": { description: "Insufficient funds" } } },
    },
    "/admin/deposit": {
      post: {
        tags: ["admin"], summary: "Staff/admin deposit into any account",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/DepositRequest" } } } },
        responses: { "200": { description: "OK" }, "401": { description: "Unauthorized" }, "403": { description: "Not staff" } },
      },
    },
    "/admin/users": {
      get:  { tags: ["admin"], summary: "List all users",   responses: { "200": { description: "OK" } } },
      post: { tags: ["admin"], summary: "Create a user",    responses: { "201": { description: "Created" } } },
    },
    "/admin/users/{id}": {
      get: {
        tags: ["admin"], summary: "Get a user by id",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
    "/admin/accounts/{accountId}": {
      get: {
        tags: ["admin"], summary: "Look up an account (staff only)",
        parameters: [{ name: "accountId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
  },
};
