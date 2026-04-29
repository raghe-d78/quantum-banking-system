// services/identity-service/src/routes.js
const express     = require("express");
const router      = express.Router();
const authService = require("./auth.service");
const userService = require("./user.service");
const { authenticate, requireAdmin, requireStaff } = require("./middleware/auth.middleware");

router.post("/auth/staff/login", async (req, res) => {
  try {
    const result = await authService.login(req.body)

    // ✅ Allow both admin and employee
    if (!["admin", "employee"].includes(result.user.role)) {
      return res.status(403).json({ message: "Access denied: staff only" })
    }

    res.json(result)
  } catch (err) {
    res.status(401).json({ message: err.message })
  }
})
// CUSTOMER LOGIN
router.post("/auth/customer/login", async (req, res) => {
  try {
    const result = await authService.login({
      ...req.body,
      role: "customer"
    })
    res.json(result)
  } catch (err) {
    console.error("Error in /auth/login:", err)
    res.status(401).json({ message: err.message })
  }
})

// ── Authenticated (any role) ────────────────────────────────────────
router.get("/auth/me", authenticate, async (req, res) => {
  try {
    const user = await userService.getUser(req.user.userId);
    res.json({ user });
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
});

// PUT /auth/me — update own profile (name, email, phone, address)
router.put("/auth/me", authenticate, async (req, res) => {
  try {
    const user = await userService.updateProfile(req.user.userId, req.body);
    res.json({ user });
  } catch (err) {
    const status = err.message.includes("required") ? 400
                 : err.message.includes("use")      ? 409 : 500;
    res.status(status).json({ message: err.message });
  }
});

// PUT /auth/password — change own password
router.put("/auth/password", authenticate, async (req, res) => {
  try {
    res.json(await userService.updatePassword(req.user.userId, req.body));
  } catch (err) {
    const status = err.message.includes("incorrect") ? 401
                 : err.message.includes("required")  ? 400
                 : err.message.includes("8 characters") ? 422 : 500;
    res.status(status).json({ message: err.message });
  }
});

// ── Admin only ──────────────────────────────────────────────────────

// POST /admin/users — create a new user
router.post("/admin/users", authenticate, requireAdmin, async (req, res) => {
  try {
    res.status(201).json(await authService.createUser(req.body));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// GET /admin/users — list all users with optional filters
// Query: ?role=customer|employee|admin  &status=active|suspended  &search=xxx
router.get("/admin/users", authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await userService.listUsers(req.query);
    res.json({ users, count: users.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /admin/users/:id — get single user
router.get("/admin/users/:id", authenticate, requireStaff, async (req, res) => {
  try {
    res.json({ user: await userService.getUser(req.params.id) });
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
});

// PUT /admin/users/:id — update user (name, email, role, status, phone, address)
router.put("/admin/users/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const user = await userService.updateUser(req.params.id, req.body);
    res.json({ user });
  } catch (err) {
    const status = err.message.includes("not found") ? 404
                 : err.message.includes("use")       ? 409 : 400;
    res.status(status).json({ message: err.message });
  }
});

// DELETE /admin/users/:id — delete user
router.delete("/admin/users/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    res.json(await userService.deleteUser(req.params.id, req.user.userId));
  } catch (err) {
    const status = err.message.includes("not found") ? 404
                 : err.message.includes("own account") ? 403 : 400;
    res.status(status).json({ message: err.message });
  }
});

module.exports = router;