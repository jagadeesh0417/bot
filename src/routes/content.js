import { Router } from "express";
import { withDb, toId, paginate, serialize, now } from "../db.js";
import { authMiddleware, requireAdmin } from "../auth.js";
import { upload, saveFile, deleteFile } from "../upload.js";

const router = Router();

/* ---------------- Special routes (must precede :id routes) ---------------- */

router.get("/notices/pinned", authMiddleware, async (req, res) => {
  await withDb(async (db) => {
    const items = await db.collection("notices").find({ pinned: true }).sort({ createdAt: -1 }).limit(5).toArray();
    res.json({ success: true, data: { items: items.map(serialize), total: items.length } });
  });
});

router.get("/events/categories", authMiddleware, async (req, res) => {
  await withDb(async (db) => {
    const rows = await db.collection("events").aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }]).toArray();
    res.json({ success: true, data: { items: rows.map((r) => ({ category: r._id, count: r.count })) } });
  });
});

router.post("/gallery/upload", authMiddleware, requireAdmin, upload.single("image"), async (req, res) => {
  if (!req.file) throw { status: 400, message: "No image provided" };
  const asset = await saveFile(req.file, "gallery");
  res.json({ success: true, data: { url: asset.url, publicId: asset.publicId, storage: asset.storage } });
});

router.post("/gallery/:id/like", authMiddleware, async (req, res) => {
  await withDb(async (db) => {
    const doc = await db.collection("gallery").findOneAndUpdate(
      { _id: toId(req.params.id) },
      { $addToSet: { likedBy: toId(req.user.userId) }, $set: { updatedAt: now() } },
      { returnDocument: "after" }
    );
    if (!doc.value) throw { status: 404, message: "Gallery item not found" };
    res.json({ success: true, data: serialize(doc.value) });
  });
});

router.get("/timetable/my", authMiddleware, async (req, res) => {
  await withDb(async (db) => {
    const user = await db.collection("users").findOne({ _id: toId(req.user.userId) });
    const items = await db.collection("timetables")
      .find(user?.department ? { department: user.department, semester: user.semester || null } : {})
      .toArray();
    res.json({ success: true, data: { items: items.map(serialize), total: items.length } });
  });
});

/* ---------------- Generic CRUD ---------------- */

function buildCRUD(name, dbName, { publicList = false } = {}) {
  router.get(`/${name}`, authMiddleware, async (req, res) => {
    const { q, page, pageSize } = req.query;
    const query = q ? { $or: [{ title: { $regex: q, $options: "i" } }, { description: { $regex: q, $options: "i" } }] } : {};
    await withDb(async (db) => {
      const data = await paginate(db.collection(dbName), query, page, pageSize, { createdAt: -1 });
      res.json({ success: true, data });
    });
  });

  if (publicList) {
    router.get(`/${name}/public`, async (req, res) => {
      await withDb(async (db) => {
        const items = await db.collection(dbName).find({}).sort({ createdAt: -1 }).limit(20).toArray();
        res.json({ success: true, data: { items: items.map(serialize), total: items.length } });
      });
    });
  }

  router.get(`/${name}/:id`, authMiddleware, async (req, res) => {
    await withDb(async (db) => {
      const doc = await db.collection(dbName).findOne({ _id: toId(req.params.id) });
      if (!doc) throw { status: 404, message: `${name} not found` };
      res.json({ success: true, data: serialize(doc) });
    });
  });

  router.post(`/${name}`, authMiddleware, requireAdmin, upload.none(), async (req, res) => {
    if (!req.body.title) throw { status: 400, message: "Title is required" };
    const doc = { ...req.body, createdAt: now(), updatedAt: now() };
    await withDb(async (db) => {
      const result = await db.collection(dbName).insertOne(doc);
      res.status(201).json({ success: true, data: serialize({ ...doc, _id: result.insertedId }) });
    });
  });

  router.patch(`/${name}/:id`, authMiddleware, requireAdmin, async (req, res) => {
    await withDb(async (db) => {
      const update = { ...req.body, updatedAt: now() };
      delete update.id;
      const doc = await db.collection(dbName).findOneAndUpdate({ _id: toId(req.params.id) }, { $set: update }, { returnDocument: "after" });
      if (!doc.value) throw { status: 404, message: `${name} not found` };
      res.json({ success: true, data: serialize(doc.value) });
    });
  });

  router.delete(`/${name}/:id`, authMiddleware, requireAdmin, async (req, res) => {
    await withDb(async (db) => {
      const doc = await db.collection(dbName).findOne({ _id: toId(req.params.id) });
      if (!doc) throw { status: 404, message: `${name} not found` };
      if (doc.publicId) await deleteFile(doc.publicId);
      await db.collection(dbName).deleteOne({ _id: doc._id });
    });
    res.json({ success: true });
  });
}

buildCRUD("notices", "notices", { publicList: true });
buildCRUD("events", "events", { publicList: true });
buildCRUD("placements", "placements", { publicList: true });
buildCRUD("gallery", "gallery", { publicList: true });
buildCRUD("timetable", "timetables");

export default router;
