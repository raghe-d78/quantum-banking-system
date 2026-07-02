// Tests proxy routes by mocking axios and verifying the gateway forwards.
jest.mock("axios", () => {
  const fn = jest.fn();
  return { __esModule: true, default: { get: fn, post: fn }, get: fn, post: fn };
});

const axios   = require("axios");
const request = require("supertest");
const app     = require("../src/server");

beforeEach(() => jest.clearAllMocks());

describe("API Gateway proxies", () => {
  test("GET /docs.json returns swagger spec", async () => {
    const res = await request(app).get("/docs.json");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("openapi");
  });

  test("GET /balance forwards with auth header", async () => {
    axios.get.mockResolvedValue({ status: 200, data: { balance: 42 } });
    const res = await request(app).get("/balance").set("Authorization", "Bearer X");
    expect(res.statusCode).toBe(200);
    expect(res.body.balance).toBe(42);
  });

  test("POST /transfer forwards", async () => {
    axios.post.mockResolvedValue({ status: 200, data: { ok: true } });
    const res = await request(app).post("/transfer")
      .set("Authorization", "Bearer X")
      .send({ destinationAccountId: "x", amount: 1 });
    expect(res.statusCode).toBe(200);
  });

  test("GET /transactions forwards", async () => {
    axios.get.mockResolvedValue({ status: 200, data: [] });
    const res = await request(app).get("/transactions").set("Authorization", "Bearer X");
    expect(res.statusCode).toBe(200);
  });

  test("POST /transactions forwards (create)", async () => {
    axios.post.mockResolvedValue({ status: 201, data: { id: "tx-1" } });
    const res = await request(app).post("/transactions")
      .set("Authorization", "Bearer X")
      .send({ amount: 1 });
    expect(res.statusCode).toBe(201);
  });

  test("GET /transactions/:id forwards", async () => {
    axios.get.mockResolvedValue({ status: 200, data: { id: "tx-1" } });
    const res = await request(app).get("/transactions/tx-1").set("Authorization", "Bearer X");
    expect(res.statusCode).toBe(200);
  });

  test("POST /withdraw forwards", async () => {
    axios.post.mockResolvedValue({ status: 200, data: { ok: true } });
    const res = await request(app).post("/withdraw").set("Authorization", "Bearer X").send({ amount: 1 });
    expect(res.statusCode).toBe(200);
  });

  test("GET /admin/accounts/:id forwards", async () => {
    axios.get.mockResolvedValue({ status: 200, data: {} });
    const res = await request(app).get("/admin/accounts/acc-1").set("Authorization", "Bearer X");
    expect(res.statusCode).toBe(200);
  });

  test("upstream error propagates status code (non-auth route)", async () => {
    const e = new Error("boom"); e.response = { status: 422, data: { msg: "bad" } };
    axios.get.mockRejectedValue(e);
    const res = await request(app).get("/balance").set("Authorization", "Bearer X");
    expect(res.statusCode).toBe(422);
    expect(res.body.msg).toBe("bad");
  });

  test("network error returns 500 (non-auth route)", async () => {
    axios.get.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await request(app).get("/balance").set("Authorization", "Bearer X");
    expect(res.statusCode).toBe(500);
  });
});
