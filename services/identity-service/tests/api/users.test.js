// services/identity-service/tests/api/users.test.js
jest.mock("../../src/user.repository", () => ({
  findAll: jest.fn(), findById: jest.fn(), findByEmail: jest.fn(),
  findByUsername: jest.fn(), update: jest.fn(), delete: jest.fn(),
  updatePassword: jest.fn(), create: jest.fn(),
}));

const request  = require("supertest");
const app      = require("../../src/app");
const userRepo = require("../../src/user.repository");
const jwt      = require("jsonwebtoken");
const bcrypt   = require("bcrypt");
const SECRET   = process.env.JWT_SECRET || "supersecret_change_in_prod";

const token = (role = "admin", userId = "admin-uuid") =>
  jwt.sign({ userId, role }, SECRET);

const MOCK_USER = { id:"uuid-1", username:"sarra", email:"s@banque.tn", name:"Sarra", role:"customer", status:"active", phone:"", address:"", created_at: new Date() };

beforeEach(() => jest.clearAllMocks());

// ── GET /admin/users ───────────────────────────────────────────────
describe("GET /admin/users", () => {
  test("admin gets user list", async () => {
    userRepo.findAll.mockResolvedValue([MOCK_USER]);
    const res = await request(app).get("/admin/users").set("Authorization", `Bearer ${token()}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.count).toBe(1);
  });
  test("returns 403 for non-admin", async () => {
    const res = await request(app).get("/admin/users").set("Authorization", `Bearer ${token("customer")}`);
    expect(res.statusCode).toBe(403);
  });
  test("returns 401 without token", async () => {
    const res = await request(app).get("/admin/users");
    expect(res.statusCode).toBe(401);
  });
});

// ── PUT /admin/users/:id ───────────────────────────────────────────
describe("PUT /admin/users/:id", () => {
  test("admin updates user successfully", async () => {
    userRepo.findById.mockResolvedValue(MOCK_USER);
    userRepo.findByEmail.mockResolvedValue(null);
    userRepo.update.mockResolvedValue({ ...MOCK_USER, name: "Sarra Updated", status: "suspended" });
    const res = await request(app)
      .put("/admin/users/uuid-1")
      .set("Authorization", `Bearer ${token()}`)
      .send({ name: "Sarra Updated", status: "suspended" });
    expect(res.statusCode).toBe(200);
    expect(res.body.user.name).toBe("Sarra Updated");
  });
  test("returns 404 for unknown user", async () => {
    userRepo.findById.mockResolvedValue(undefined);
    const res = await request(app)
      .put("/admin/users/unknown")
      .set("Authorization", `Bearer ${token()}`)
      .send({ name: "X" });
    expect(res.statusCode).toBe(404);
  });
  test("returns 409 if email already in use", async () => {
    userRepo.findById.mockResolvedValue(MOCK_USER);
    userRepo.findByEmail.mockResolvedValue({ id: "other-uuid" });
    const res = await request(app)
      .put("/admin/users/uuid-1")
      .set("Authorization", `Bearer ${token()}`)
      .send({ email: "taken@banque.tn" });
    expect(res.statusCode).toBe(409);
  });
});

// ── DELETE /admin/users/:id ────────────────────────────────────────
describe("DELETE /admin/users/:id", () => {
  test("admin deletes user", async () => {
    userRepo.findById.mockResolvedValue(MOCK_USER);
    userRepo.delete.mockResolvedValue({ id: "uuid-1" });
    const res = await request(app)
      .delete("/admin/users/uuid-1")
      .set("Authorization", `Bearer ${token("admin", "different-admin")}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.deleted).toBe(true);
  });
  test("returns 403 if admin tries to delete own account", async () => {
    const res = await request(app)
      .delete("/admin/users/admin-uuid")
      .set("Authorization", `Bearer ${token("admin", "admin-uuid")}`);
    expect(res.statusCode).toBe(403);
  });
  test("returns 404 for unknown user", async () => {
    userRepo.findById.mockResolvedValue(undefined);
    const res = await request(app)
      .delete("/admin/users/ghost")
      .set("Authorization", `Bearer ${token("admin", "different-admin")}`);
    expect(res.statusCode).toBe(404);
  });
});

// ── PUT /auth/me ───────────────────────────────────────────────────
describe("PUT /auth/me", () => {
  test("updates own profile", async () => {
    userRepo.findById.mockResolvedValue(MOCK_USER);
    userRepo.findByEmail.mockResolvedValue(null);
    userRepo.update.mockResolvedValue({ ...MOCK_USER, name: "New Name" });
    const res = await request(app)
      .put("/auth/me")
      .set("Authorization", `Bearer ${token("customer", "uuid-1")}`)
      .send({ name: "New Name", email: "s@banque.tn" });
    expect(res.statusCode).toBe(200);
  });
  test("returns 400 if name missing", async () => {
    const res = await request(app)
      .put("/auth/me")
      .set("Authorization", `Bearer ${token("customer")}`)
      .send({ email: "x@x.com" });
    expect(res.statusCode).toBe(400);
  });
});

// ── PUT /auth/password ─────────────────────────────────────────────
describe("PUT /auth/password", () => {
  test("updates password with correct current password", async () => {
    const hash = await bcrypt.hash("oldpass", 10);
    userRepo.findById.mockResolvedValue(MOCK_USER);
    userRepo.findByEmail.mockResolvedValue({ ...MOCK_USER, password_hash: hash });
    userRepo.updatePassword.mockResolvedValue();
    const res = await request(app)
      .put("/auth/password")
      .set("Authorization", `Bearer ${token("customer")}`)
      .send({ currentPassword: "oldpass", newPassword: "newpass123" });
    expect(res.statusCode).toBe(200);
    expect(res.body.updated).toBe(true);
  });
  test("returns 401 for wrong current password", async () => {
    const hash = await bcrypt.hash("correctpass", 10);
    userRepo.findById.mockResolvedValue(MOCK_USER);
    userRepo.findByEmail.mockResolvedValue({ ...MOCK_USER, password_hash: hash });
    const res = await request(app)
      .put("/auth/password")
      .set("Authorization", `Bearer ${token("customer")}`)
      .send({ currentPassword: "wrongpass", newPassword: "newpass123" });
    expect(res.statusCode).toBe(401);
  });
  test("returns 422 if new password too short", async () => {
    const res = await request(app)
      .put("/auth/password")
      .set("Authorization", `Bearer ${token("customer")}`)
      .send({ currentPassword: "oldpass", newPassword: "short" });
    expect(res.statusCode).toBe(422);
  });
});