import { Router } from "express";
import { withDb, toId, paginate, serialize, now } from "../db.js";
import { authMiddleware, requireAdmin, requireStudent } from "../auth.js";
import { upload, saveFile, deleteFile } from "../upload.js";

const router = Router();

router.get("/health", async (req, res) => {
  let mongo = "disconnected";
  try {
    await withDb(async (db) => {
      await db.command({ ping: 1 });
      mongo = "connected";
    });
  } catch (e) {
    mongo = "disconnected";
  }
  res.json({ status: "ok", app: process.env.APP_NAME || "CollegeAI", mongo });
});

/* ---------------- Dashboard ---------------- */

router.get("/dashboard/stats", authMiddleware, async (req, res) => {
  await withDb(async (db) => {
    const isAdmin = req.user.role === "admin";
    const [students, faculty, departments, courses, notices, events, placements] = await Promise.all([
      db.collection("students").countDocuments({}),
      db.collection("faculty").countDocuments({}),
      db.collection("departments").countDocuments({}),
      db.collection("courses").countDocuments({}),
      db.collection("notices").countDocuments({}),
      db.collection("events").countDocuments({}),
      db.collection("placements").countDocuments({}),
    ]);
    const myChats = isAdmin ? 0 : await db.collection("chat_sessions").countDocuments({ user_id: toId(req.user.userId) });
    res.json({
      success: true,
      data: isAdmin
        ? { students, faculty, departments, courses, notices, events, placements }
        : { notices, events, placements, chatSessions: myChats },
    });
  });
});

router.get("/dashboard/analytics", authMiddleware, async (req, res) => {
  await withDb(async (db) => {
    const month = new Date();
    month.setDate(1);
    const [registrations, notices] = await Promise.all([
      db.collection("students").aggregate([
        { $match: { createdAt: { $gte: month } } },
        { $group: { _id: { $month: "$createdAt" }, count: { $sum: 1 } } },
      ]).toArray(),
      db.collection("notices").aggregate([
        { $match: { createdAt: { $gte: month } } },
        { $group: { _id: { $month: "$createdAt" }, count: { $sum: 1 } } },
      ]).toArray(),
    ]);
    const deptRows = await db.collection("students").aggregate([
      { $group: { _id: { $ifNull: ["$department", "Unassigned"] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray();
    res.json({
      success: true,
      data: {
        registrations,
        notices,
        departments: deptRows.map((r) => ({ name: r._id, count: r.count })),
      },
    });
  });
});

router.get("/dashboard/activity", authMiddleware, async (req, res) => {
  await withDb(async (db) => {
    const [notices, events, students] = await Promise.all([
      db.collection("notices").find({}).sort({ createdAt: -1 }).limit(5).project({ title: 1, createdAt: 1 }).toArray(),
      db.collection("events").find({}).sort({ createdAt: -1 }).limit(5).project({ title: 1, createdAt: 1 }).toArray(),
      db.collection("students").find({}).sort({ createdAt: -1 }).limit(5).project({ name: 1, createdAt: 1 }).toArray(),
    ]);
    const items = [
      ...notices.map((n) => ({ type: "notice", text: `Notice added: ${n.title}`, createdAt: n.createdAt })),
      ...events.map((e) => ({ type: "event", text: `Event added: ${e.title}`, createdAt: e.createdAt })),
      ...students.map((s) => ({ type: "student", text: `New student: ${s.name}`, createdAt: s.createdAt })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10);
    res.json({ success: true, data: { items } });
  });
});

/* ---------------- Search ---------------- */

router.get("/search", authMiddleware, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ success: true, data: { items: [] } });
  const re = { $regex: String(q), $options: "i" };
  await withDb(async (db) => {
    const [notices, events, courses, faculty, departments, placements] = await Promise.all([
      db.collection("notices").find({ $or: [{ title: re }, { description: re }] }).limit(5).toArray(),
      db.collection("events").find({ $or: [{ title: re }, { description: re }] }).limit(5).toArray(),
      db.collection("courses").find({ $or: [{ name: re }, { code: re }] }).limit(5).toArray(),
      db.collection("faculty").find({ $or: [{ name: re }, { designation: re }] }).limit(5).toArray(),
      db.collection("departments").find({ $or: [{ name: re }, { code: re }] }).limit(5).toArray(),
      db.collection("placements").find({ $or: [{ title: re }, { company: re }] }).limit(5).toArray(),
    ]);
    res.json({
      success: true,
      data: {
        items: [
          ...notices.map((d) => ({ type: "notice", ...serialize(d) })),
          ...events.map((d) => ({ type: "event", ...serialize(d) })),
          ...courses.map((d) => ({ type: "course", ...serialize(d) })),
          ...faculty.map((d) => ({ type: "faculty", ...serialize(d) })),
          ...departments.map((d) => ({ type: "department", ...serialize(d) })),
          ...placements.map((d) => ({ type: "placement", ...serialize(d) })),
        ],
      },
    });
  });
});

/* ---------------- Feedback ---------------- */

router.post("/feedback", authMiddleware, requireStudent, async (req, res) => {
  const { message, category, rating } = req.body || {};
  if (!message) throw { status: 400, message: "Message is required" };
  await withDb(async (db) => {
    const result = await db.collection("feedback").insertOne({
      userId: toId(req.user.userId),
      message: String(message).trim(),
      category: category || "general",
      rating: rating ? Number(rating) : null,
      status: "pending",
      createdAt: now(),
    });
    res.status(201).json({ success: true, data: serialize({ _id: result.insertedId }) });
  });
});

router.get("/feedback", authMiddleware, requireAdmin, async (req, res) => {
  const { status, page, pageSize } = req.query;
  const query = status ? { status } : {};
  await withDb(async (db) => {
    const data = await paginate(db.collection("feedback"), query, page, pageSize, { createdAt: -1 });
    res.json({ success: true, data });
  });
});

router.patch("/feedback/:id", authMiddleware, requireAdmin, async (req, res) => {
  const { status, response } = req.body || {};
  await withDb(async (db) => {
    const update = {};
    if (status) update.status = status;
    if (response !== undefined) update.response = response;
    update.updatedAt = now();
    const doc = await db.collection("feedback").findOneAndUpdate({ _id: toId(req.params.id) }, { $set: update }, { returnDocument: "after" });
    if (!doc.value) throw { status: 404, message: "Feedback not found" };
    res.json({ success: true, data: serialize(doc.value) });
  });
});

/* ---------------- Notifications ---------------- */

router.get("/notifications", authMiddleware, async (req, res) => {
  await withDb(async (db) => {
    const data = await paginate(db.collection("notifications"), { userId: toId(req.user.userId) }, req.query.page, req.query.pageSize, { createdAt: -1 });
    res.json({ success: true, data });
  });
});

router.get("/notifications/unread-count", authMiddleware, async (req, res) => {
  await withDb(async (db) => {
    const count = await db.collection("notifications").countDocuments({ userId: toId(req.user.userId), read: false });
    res.json({ success: true, data: { count } });
  });
});

router.patch("/notifications/:id/read", authMiddleware, async (req, res) => {
  await withDb(async (db) => {
    await db.collection("notifications").updateOne({ _id: toId(req.params.id), userId: toId(req.user.userId) }, { $set: { read: true } });
  });
  res.json({ success: true });
});

router.post("/notifications/mark-all-read", authMiddleware, async (req, res) => {
  await withDb(async (db) => {
    await db.collection("notifications").updateMany({ userId: toId(req.user.userId), read: false }, { $set: { read: true } });
  });
  res.json({ success: true });
});

router.post("/notifications/broadcast", authMiddleware, requireAdmin, async (req, res) => {
  const { title, message } = req.body || {};
  if (!title || !message) throw { status: 400, message: "Title and message are required" };
  await withDb(async (db) => {
    const students = await db.collection("students").find({}).project({ userId: 1 }).toArray();
    const docs = students.map((s) => ({
      userId: s.userId,
      title: String(title).trim(),
      message: String(message).trim(),
      type: "broadcast",
      read: false,
      createdAt: now(),
    }));
    if (docs.length) await db.collection("notifications").insertMany(docs);
    res.status(201).json({ success: true, data: { delivered: docs.length } });
  });
});

/* ---------------- Settings ---------------- */

router.get("/settings", async (req, res) => {
  await withDb(async (db) => {
    const doc = await db.collection("settings").findOne({ key: "college" });
    res.json({
      success: true,
      data: {
        collegeName: doc?.collegeName || process.env.COLLEGE_NAME || "CollegeAI Institute",
        tagline: doc?.tagline || "Empowering Education with Artificial Intelligence",
        contactEmail: doc?.contactEmail || null,
        contactPhone: doc?.contactPhone || null,
        address: doc?.address || null,
        website: doc?.website || null,
        theme: doc?.theme || "light",
        features: doc?.features || [],
      },
    });
  });
});

router.patch("/settings", authMiddleware, requireAdmin, async (req, res) => {
  const fields = ["collegeName", "tagline", "contactEmail", "contactPhone", "address", "website", "theme", "features"];
  const update = {};
  for (const f of fields) if (req.body[f] !== undefined) update[f] = req.body[f];
  update.updatedAt = now();
  await withDb(async (db) => {
    await db.collection("settings").updateOne({ key: "college" }, { $set: update }, { upsert: true });
  });
  res.json({ success: true, data: { message: "Settings updated" } });
});

/* ---------------- Uploads ---------------- */

router.post("/uploads", authMiddleware, upload.single("file"), async (req, res) => {
  if (!req.file) throw { status: 400, message: "No file provided" };
  const asset = await saveFile(req.file, "uploads");
  res.json({ success: true, data: { url: asset.url, publicId: asset.publicId, storage: asset.storage } });
});

router.delete("/uploads/:publicId", authMiddleware, requireAdmin, async (req, res) => {
  await deleteFile(req.params.publicId);
  res.json({ success: true });
});

export default router;
