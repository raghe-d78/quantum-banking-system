const request = require("supertest");
const app = require("../src/server");

describe("Gateway health", () => {
  it("should return status", async () => {
    const res = await request(app).get("/health");

    expect(res.statusCode).toBe(200);
  });
});