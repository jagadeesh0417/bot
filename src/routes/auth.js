import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "crypto";
import {
  withDb,
  toId,
  serialize,
  now,
} from "../db.js";
import {
  hashPassword,
  verifyPassword,
  issueTokens,
  rotateRefresh,
  revokeRefresh,
  authMiddleware,
  tokenHash,
} from "../auth.js";
import { upload, saveFile, deleteFile } from "../upload.js";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_OK = (pw) => typeof pw === "string" && pw.length >= 8 && /\d/.test(pw);

function cleanUser(user) {
  const d = serialize(user);
  delete d.passwordHash;
  delete d.refreshTokenHashes;
  return d;
}

router.post("/register", async (req, res) => {
  const { name, email, password, studentId, department, semester, rememberMe } = req.body || {};
  if (!name || !String(name).trim()) throw { status: 400, message: "Name is required" };
  if (!email || !EMAIL_RE.test(email)) throw { status: 400, message: "Valid email is required" };
  if (!PASSWORD_OK(password)) throw { status: 400, message: "Password must be 8+ characters and contain a number" };
  await withDb(async (db) => {
    const exists = await db.collection("users").findOne({ email: String(email).toLowerCase() });
    if (exists) throw { status: 409, message: "An account with this email already exists" };
    const result = await db.collection("users").insertOne({
      name: String(name).trim(),
      email: String(email).toLowerCase(),
      role: "student",
      passwordHash: hashPassword(password),
      refreshTokenHashes: [],
      studentId: studentId ? String(studentId).trim() : null,
      department: department ? String(department).trim() : null,
      semester: semester ? Number(semester) : null,
      status: "active",
      createdAt: now(),
      updatedAt: now(),
    });
    const user = await db.collection("users").findOne({ _id: result.insertedId });
    await db.collection("students").insertOne({
      userId: result.insertedId,
      name: user.name,
      email: user.email,
      studentId: user.studentId,
      department: user.department,
      semester: user.semester,
      createdAt: now(),
      updatedAt: now(),
    });
    const tokens = await issueTokens(user);
    res.status(201).json({ success: true, data: { user: cleanUser(user), tokens } });
  });
});

router.post("/register/admin", async (req, res) => {
  const { name, email, password, secretKey } = req.body || {};
  if (secretKey && secretKey !== process.env.ADMIN_SECRET) throw { status: 403, message: "Invalid admin secret" };
  if (!name || !EMAIL_RE.test(email) || !PASSWORD_OK(password)) throw { status: 400, message: "Invalid name, email or password" };
  await withDb(async (db) => {
    const exists = await db.collection("users").findOne({ email: String(email).toLowerCase() });
    if (exists) throw { status: 409, message: "An account with this email already exists" };
    const result = await db.collection("users").insertOne({
      name: String(name).trim(),
      email: String(email).toLowerCase(),
      role: "admin",
      passwordHash: hashPassword(password),
      refreshTokenHashes: [],
      status: "active",
      createdAt: now(),
      updatedAt: now(),
    });
    const user = await db.collection("users").findOne({ _id: result.insertedId });
    res.status(201).json({ success: true, data: { user: cleanUser(user) } });
  });
});

router.post("/login", async (req, res) => {
  const { email, password, rememberMe } = req.body || {};
  if (!email || !password) throw { status: 400, message: "Email and password are required" };
  await withDb(async (db) => {
    const user = await db.collection("users").findOne({ email: String(email).toLowerCase() });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw { status: 401, message: "Invalid email or password" };
    }
    if (user.status === "suspended") throw { status: 403, message: "Account is suspended" };
    const tokens = await issueTokens(user);
    res.json({ success: true, data: { user: cleanUser(user), tokens } });
  });
});

router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) throw { status: 400, message: "Refresh token is required" };
  const tokens = await rotateRefresh(refreshToken);
  if (!tokens) throw { status: 401, message: "Invalid or expired refresh token" };
  res.json({ success: true, data: { tokens } });
});

router.post("/logout", authMiddleware, async (req, res) => {
  const { refreshToken } = req.body || {};
  if (refreshToken) await revokeRefresh(refreshToken);
  res.json({ success: true });
});

router.post("/forgot-password", async (req, res) => {
  const { email } = req.body || {};
  if (!email) throw { status: 400, message: "Email is required" };
  const token = await withDb(async (db) => {
    const user = await db.collection("users").findOne({ email: String(email).toLowerCase() });
    if (!user) return null;
    const t = randomBytes(32).toString("hex");
    await db.collection("users").updateOne(
      { _id: user._id },
      { $set: { resetToken: createHash("sha256").update(t).digest("hex"), resetTokenExpires: new Date(Date.now() + 60 * 60 * 1000) } }
    );
    return t;
  });
  if (!token) throw { status: 404, message: "No account found with this email" };
  res.json({ success: true, data: { message: "Password reset link sent", resetToken: token } });
});

router.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token) throw { status: 400, message: "Reset token is required" };
  if (!PASSWORD_OK(newPassword)) throw { status: 400, message: "Password must be 8+ characters and contain a number" };
  const hash = createHash("sha256").update(String(token)).digest("hex");
  await withDb(async (db) => {
    const user = await db.collection("users").findOne({ resetToken: hash, resetTokenExpires: { $gt: new Date() } });
    if (!user) throw { status: 400, message: "Invalid or expired reset token" };
    await db.collection("users").updateOne(
      { _id: user._id },
      { $set: { passwordHash: hashPassword(newPassword), updatedAt: now() }, $unset: { resetToken: "", resetTokenExpires: "" } }
    );
  });
  res.json({ success: true, data: { message: "Password updated. You can now login." } });
});

router.get("/me", authMiddleware, async (req, res) => {
  await withDb(async (db) => {
    const user = await db.collection("users").findOne({ _id: toId(req.user.userId) });
    if (!user) throw { status: 404, message: "User not found" };
    res.json({ success: true, data: { user: cleanUser(user) } });
  });
});

router.patch("/me", authMiddleware, async (req, res) => {
  const { name, phone, bio, photoUrl, studentId, department, semester } = req.body || {};
  await withDb(async (db) => {
    const update = {};
    if (name) update.name = String(name).trim();
    if (phone !== undefined) update.phone = phone;
    if (bio !== undefined) update.bio = bio;
    if (photoUrl !== undefined) update.photoUrl = photoUrl;
    if (studentId !== undefined) update.studentId = studentId;
    if (department !== undefined) update.department = department;
    if (semester !== undefined) update.semester = Number(semester);
    update.updatedAt = now();
    const user = await db.collection("users").findOneAndUpdate({ _id: toId(req.user.userId) }, { $set: update }, { returnDocument: "after" });
    if (!user.value) throw { status: 404, message: "User not found" };
    res.json({ success: true, data: { user: cleanUser(user.value) } });
  });
});

router.post("/change-password", authMiddleware, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !PASSWORD_OK(newPassword)) throw { status: 400, message: "Provide old password and a strong new password" };
  await withDb(async (db) => {
    const user = await db.collection("users").findOne({ _id: toId(req.user.userId) });
    if (!user || !verifyPassword(oldPassword, user.passwordHash)) throw { status: 401, message: "Old password is incorrect" };
    await db.collection("users").updateOne({ _id: user._id }, { $set: { passwordHash: hashPassword(newPassword), updatedAt: now() } });
  });
  res.json({ success: true, data: { message: "Password changed" } });
});

router.get("/sessions", authMiddleware, async (req, res) => {
  await withDb(async (db) => {
    const user = await db.collection("users").findOne({ _id: toId(req.user.userId) });
    const hashes = user?.refreshTokenHashes || [];
    res.json({ success: true, data: { items: hashes.map((h, i) => ({ id: h.slice(0, 16), createdAt: null, current: i === 0 })), total: hashes.length } });
  });
});

router.delete("/sessions/:sessionId", authMiddleware, async (req, res) => {
  const { sessionId } = req.params;
  await withDb(async (db) => {
    await db.collection("users").updateOne(
      { _id: toId(req.user.userId), refreshTokenHashes: { $elemMatch: { $regex: `^${sessionId}` } } },
      { $pull: { refreshTokenHashes: { $regex: `^${sessionId}` } } }
    );
  });
  res.json({ success: true });
});

router.delete("/me", authMiddleware, async (req, res) => {
  await withDb(async (db) => {
    const userId = toId(req.user.userId);
    await db.collection("users").deleteOne({ _id: userId });
    await db.collection("students").deleteOne({ userId });
    await db.collection("chat_sessions").deleteMany({ user_id: userId });
    await db.collection("chat_history").deleteMany({ user_id: userId });
  });
  res.json({ success: true, data: { message: "Account deleted" } });
});

router.post("/photo", authMiddleware, upload.single("photo"), async (req, res) => {
  if (!req.file) throw { status: 400, message: "No photo provided" };
  const asset = await saveFile(req.file, "photos");
  await withDb(async (db) => {
    await db.collection("users").updateOne(
      { _id: toId(req.user.userId) },
      { $set: { photoUrl: asset.url, publicId: asset.publicId, updatedAt: now() } }
    );
  });
  res.json({ success: true, data: { url: asset.url, storage: asset.storage } });
});

export default router;
