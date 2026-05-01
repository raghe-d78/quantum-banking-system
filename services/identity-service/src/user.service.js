// services/identity-service/src/user.service.js
const bcrypt   = require("bcrypt");
const userRepo = require("./user.repository");

const safeUser = (u) => ({
  id: u.id, username: u.username, email: u.email,
  name: u.name, role: u.role, status: u.status,
  phone: u.phone ?? null, address: u.address ?? null,
  createdAt: u.created_at,
});

// ── GET /admin/users ──────────────────────────────────────────────
exports.listUsers = async ({ role, status, search } = {}) => {
  const users = await userRepo.findAll({ role, status, search });
  return users.map(safeUser);
};

// ── GET /admin/users/:id ──────────────────────────────────────────
exports.getUser = async (id) => {
  const user = await userRepo.findById(id);
  if (!user) throw new Error("User not found");
  return safeUser(user);
};

// ── PUT /admin/users/:id ──────────────────────────────────────────
exports.updateUser = async (id, fields) => {
  const existing = await userRepo.findById(id);
  if (!existing) throw new Error("User not found");

  // If email is changing, check uniqueness
  if (fields.email && fields.email !== existing.email) {
    const conflict = await userRepo.findByEmail(fields.email);
    if (conflict) throw new Error("Email already in use");
  }

  const updated = await userRepo.update(id, fields);
  return safeUser(updated);
};

// ── DELETE /admin/users/:id ───────────────────────────────────────
exports.deleteUser = async (id, requesterId) => {
  if (id === requesterId) throw new Error("You cannot delete your own account");
  const existing = await userRepo.findById(id);
  if (!existing) throw new Error("User not found");
  await userRepo.delete(id);
  return { deleted: true, id };
};

// ── PUT /auth/me ──────────────────────────────────────────────────
exports.updateProfile = async (userId, { name, email, phone, address }) => {
  if (!name || !email) throw new Error("Name and email are required");

  const existing = await userRepo.findById(userId);
  if (!existing) throw new Error("User not found");

  if (email !== existing.email) {
    const conflict = await userRepo.findByEmail(email);
    if (conflict) throw new Error("Email already in use");
  }

  const updated = await userRepo.update(userId, { name, email, phone, address });
  return safeUser(updated);
};

// ── PUT /auth/password ────────────────────────────────────────────
exports.updatePassword = async (userId, { currentPassword, newPassword }) => {
  if (!currentPassword || !newPassword)
    throw new Error("currentPassword and newPassword are required");

  if (newPassword.length < 8)
    throw new Error("New password must be at least 8 characters");

  const user = await userRepo.findById(userId);
  if (!user) throw new Error("User not found");

  // Fetch full user (with hash) for comparison
  const fullUser = await userRepo.findByEmail(user.email);
  const valid    = await bcrypt.compare(currentPassword, fullUser.password_hash);
  if (!valid) throw new Error("Current password is incorrect");

  const newHash = await bcrypt.hash(newPassword, 10);
  await userRepo.updatePassword(userId, newHash);
  return { updated: true };
};