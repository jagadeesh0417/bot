import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "crypto";
import { withDb, toId, now } from "./db.js";

const SECRET = process.env.SECRET_KEY || "dev-secret-change-me";
const ACCESS_TTL = parseInt(process.env.ACCESS_TOKEN_EXPIRE_MINUTES || "60") * 60;
const REFRESH_TTL_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRE_DAYS || "30");

export function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}

export function verifyPassword(pw, hash) {
  return bcrypt.compareSync(pw, hash || "");
}

export function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

function signAccess(userId, role) {
  return jwt.sign({ sub: userId, role }, SECRET, { expiresIn: ACCESS_TTL });
}

function signRefresh() {
  return randomBytes(48).toString("hex");
}

export async function issueTokens(user) {
  const refreshToken = signRefresh();
  await withDb(async (db) => {
    await db.collection("users").updateOne(
      { _id: user._id },
      { $set: { lastLoginAt: now(), lastActiveAt: now() }, $push: { refreshTokenHashes: tokenHash(refreshToken) } }
    );
  });
  return { accessToken: signAccess(String(user._id), user.role), refreshToken, tokenType: "bearer", expiresIn: ACCESS_TTL };
}

export async function rotateRefresh(refreshToken) {
  const hash = tokenHash(refreshToken);
  return withDb(async (db) => {
    const user = await db.collection("users").findOne({ refreshTokenHashes: hash });
    if (!user) return null;
    const tokens = await issueTokens(user);
    const updated = await db
      .collection("users")
      .updateOne({ _id: user._id }, { $pull: { refreshTokenHashes: hash } });
    return updated.modifiedCount ? tokens : null;
  });
}

export async function revokeRefresh(refreshToken) {
  const hash = tokenHash(refreshToken);
  await withDb(async (db) => {
    await db.collection("users").updateOne({ refreshTokenHashes: hash }, { $pull: { refreshTokenHashes: hash } });
  });
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, error: "Not authenticated" });
  try {
    const payload = jwt.verify(token, SECRET);
    req.user = { userId: payload.sub, role: payload.role };
    next();
  } catch (e) {
    return res.status(401).json({ success: false, error: "Invalid or expired token" });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ success: false, error: "Admin access required" });
  }
  next();
}

export function requireStudent(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, error: "Not authenticated" });
  next();
}

export async function bootstrapAdmin() {
  const email = (process.env.ADMIN_EMAIL || "admin@college.edu").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "Admin@123456";
  const name = process.env.ADMIN_NAME || "College Admin";
  await withDb(async (db) => {
    const exists = await db.collection("users").findOne({ email });
    if (exists) return;
    await db.collection("users").insertOne({
      name,
      email,
      role: "admin",
      passwordHash: hashPassword(password),
      refreshTokenHashes: [],
      status: "active",
      createdAt: now(),
      updatedAt: now(),
    });
  });
}

export { SECRET };
