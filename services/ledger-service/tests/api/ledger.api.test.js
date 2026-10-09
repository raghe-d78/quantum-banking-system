jest.mock("../../src/Ledger.repository", () => ({
  findByAccountId: jest.fn(), findById: jest.fn(), findByTransactionId: jest.fn(), reconcile: jest.fn(), ping: jest.fn(),
}));
const request = require("supertest");
const jwt = require("jsonwebtoken");
const app  = require("../../src/app");
const repo = require("../../src/Ledger.repository");
const SECRET = process.env.JWT_SECRET || "supersecret_change_in_prod";
const tok = (role) => jwt.sign({ userId: "u", role }, SECRET);

beforeEach(() => jest.clearAllMocks());

test("health is open, everything else is staff-only", async () => {
  expect((await request(app).get("/health")).statusCode).toBe(200);
  expect((await request(app).get("/ledger/entries/1")).statusCode).toBe(401);
  expect((await request(app).get("/ledger/entries/1").set("Authorization", `Bearer ${tok("customer")}`)).statusCode).toBe(403);
});

test("reconcile reports drift between ledger and cached balance", async () => {
  repo.reconcile.mockResolvedValue({ ledger_balance: "100.0000", cached_balance: "100.0000", entries: 3, last_snapshot: "100.0000" });
  let res = await request(app).get("/ledger/accounts/a/reconcile").set("Authorization", `Bearer ${tok("employee")}`);
  expect(res.body).toMatchObject({ consistent: true, drift: "0.0000" });

  repo.reconcile.mockResolvedValue({ ledger_balance: "100.0000", cached_balance: "99.5000", entries: 3, last_snapshot: "100.0000" });
  res = await request(app).get("/ledger/accounts/a/reconcile").set("Authorization", `Bearer ${tok("admin")}`);
  expect(res.body).toMatchObject({ consistent: false, drift: "-0.5000" });

  repo.reconcile.mockResolvedValue({ ledger_balance: "0", cached_balance: null, entries: 0, last_snapshot: null });
  expect((await request(app).get("/ledger/accounts/ghost/reconcile").set("Authorization", `Bearer ${tok("admin")}`)).statusCode).toBe(404);
});

test("transaction view checks double-entry balance", async () => {
  repo.findByTransactionId.mockResolvedValue([
    { id: "1", type: "DEBIT", amount: "10.0000" }, { id: "2", type: "CREDIT", amount: "10.0000" },
  ]);
  const res = await request(app).get("/ledger/transactions/t1").set("Authorization", `Bearer ${tok("employee")}`);
  expect(res.statusCode).toBe(200);
  expect(res.body.balanced).toBe(true);
  repo.findByTransactionId.mockResolvedValue([]);
  expect((await request(app).get("/ledger/transactions/none").set("Authorization", `Bearer ${tok("employee")}`)).statusCode).toBe(404);
});
