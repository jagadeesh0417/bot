import { MongoClient, ObjectId } from "mongodb";
import { execFileSync } from "child_process";
import { platform } from "os";

let client = null;
let db = null;
let connecting = null;

async function resolveSrvViaSystem(url) {
  const parsed = new URL(url);
  const host = parsed.hostname;
  if (platform() === "win32") {
    const cmd = `Resolve-DnsName -Name "${host}" -Type SRV | Select-Object -ExpandProperty NameTarget; Resolve-DnsName -Name "${host}" -Type TXT | Select-Object -ExpandProperty Strings`;
    const out = execFileSync("powershell", ["-NoProfile", "-Command", cmd], { encoding: "utf8", timeout: 15000 });
    const lines = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const targets = lines.filter((l) => l.toLowerCase().endsWith(".mongodb.net")).map((l) => `${l}:27017`);
    const txt = lines.find((l) => l.includes("replicaSet=")) || "";
    const rs = (txt.match(/replicaSet=([^&]+)/) || [])[1];
    if (!targets.length) return null;
    const creds = `${encodeURIComponent(parsed.username)}:${encodeURIComponent(parsed.password)}`;
    const query = new URLSearchParams({ ssl: "true", authSource: "admin" });
    if (rs) query.set("replicaSet", rs);
    return `mongodb://${creds}@${targets.join(",")}/?${query.toString()}`;
  }
  return null;
}

async function makeClient(url) {
  const opts = { serverSelectionTimeoutMS: 4000 };
  try {
    const c = new MongoClient(url, opts);
    await c.connect();
    return c;
  } catch (e) {
    if (url.includes("+srv://") && /querySrv|ECONNREFUSED/.test(e.message)) {
      try {
        const direct = await resolveSrvViaSystem(url);
        if (direct) {
          const c = new MongoClient(direct, opts);
          await c.connect();
          return c;
        }
      } catch (e2) {
        /* fallback failed */
      }
    }
    if (process.env.VERCEL === "1") {
      throw new Error(
        `Database unreachable (${e.message}). Set MONGODB_URL in Vercel env and allow access from anywhere (0.0.0.0/0) in Atlas Network Access.`
      );
    }
    throw e;
  }
}

export async function connectDb() {
  if (db) return db;
  if (connecting) return connecting;
  const url = process.env.MONGODB_URL || "mongodb://localhost:27017";
  const name = process.env.MONGODB_DB || "college_ai";
  if (process.env.VERCEL === "1" && !process.env.MONGODB_URL) {
    throw new Error("MONGODB_URL is not set in Vercel environment variables");
  }
  connecting = (async () => {
    client = await makeClient(url);
    db = client.db(name);
    try {
      await createIndexes();
    } catch (e) {
      /* index creation is best-effort */
    }
    return db;
  })();
  return connecting;
}

export function getDb() {
  if (!db) throw new Error("Database not connected");
  return db;
}

async function createIndexes() {
  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  await db.collection("notices").createIndex({ createdAt: -1 });
  await db.collection("events").createIndex({ date: -1 });
  await db.collection("notifications").createIndex({ userId: 1, createdAt: -1 });
}

export async function withDb(handler) {
  await connectDb();
  return handler(getDb());
}

export function toId(id) {
  try {
    return new ObjectId(id);
  } catch (e) {
    throw { status: 400, message: "Invalid id format" };
  }
}

export function serialize(doc) {
  if (!doc) return doc;
  const d = { ...doc };
  if (d._id) {
    d.id = String(d._id);
    delete d._id;
  }
  delete d.passwordHash;
  delete d.refreshTokenHashes;
  return d;
}

export function stripPrivate(doc) {
  return serialize(doc);
}

export async function paginate(collection, query, page = 1, pageSize = 20, sort = { createdAt: -1 }) {
  const p = Math.max(1, parseInt(page) || 1);
  const ps = Math.min(100, Math.max(1, parseInt(pageSize) || 20));
  const total = await collection.countDocuments(query);
  const items = await collection
    .find(query)
    .sort(sort)
    .skip((p - 1) * ps)
    .limit(ps)
    .toArray();
  return { items: items.map(serialize), total, page: p, pageSize: ps, pages: Math.ceil(total / ps) };
}

export function now() {
  return new Date();
}
