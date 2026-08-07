import { Router } from "express";
import { withDb, toId, paginate, serialize, now } from "../db.js";
import { authMiddleware, requireAdmin, hashPassword } from "../auth.js";

const router = Router();

/* ---------------- Students ---------------- */

router.get("/students", authMiddleware, async (req, res) => {
  const { q, department, semester, status, page, pageSize } = req.query;
  const query = {};
  if (q) query.$or = [{ name: { $regex: q, $options: "i" } }, { email: { $regex: q, $options: "i" } }, { studentId: { $regex: q, $options: "i" } }];
  if (department) query.department = department;
  if (semester) query.semester = Number(semester);
  if (status) query.status = status;
  await withDb(async (db) => {
    const data = await paginate(db.collection("students"), query, page, pageSize, { createdAt: -1 });
    res.json({ success: true, data });
  });
});

router.get("/students/:id", authMiddleware, async (req, res) => {
  await withDb(async (db) => {
    const doc = await db.collection("students").findOne({ _id: toId(req.params.id) });
    if (!doc) throw { status: 404, message: "Student not found" };
    res.json({ success: true, data: serialize(doc) });
  });
});

router.post("/students", requireAdmin, async (req, res) => {
  const { name, email, password, studentId, department, semester, course, phone, address, photoUrl } = req.body || {};
  if (!name || !email) throw { status: 400, message: "Name and email are required" };
  await withDb(async (db) => {
    const exists = await db.collection("users").findOne({ email: String(email).toLowerCase() });
    if (exists) throw { status: 409, message: "A user with this email already exists" };
    const userResult = await db.collection("users").insertOne({
      name: String(name).trim(),
      email: String(email).toLowerCase(),
      role: "student",
      passwordHash: hashPassword(password || "Student@123"),
      refreshTokenHashes: [],
      studentId: studentId || null,
      department: department || null,
      semester: semester ? Number(semester) : null,
      status: "active",
      createdAt: now(),
      updatedAt: now(),
    });
    const doc = {
      userId: userResult.insertedId,
      name: String(name).trim(),
      email: String(email).toLowerCase(),
      studentId: studentId || null,
      department: department || null,
      semester: semester ? Number(semester) : null,
      course: course || null,
      phone: phone || null,
      address: address || null,
      photoUrl: photoUrl || null,
      status: "active",
      createdAt: now(),
      updatedAt: now(),
    };
    const result = await db.collection("students").insertOne(doc);
    res.status(201).json({ success: true, data: serialize({ ...doc, _id: result.insertedId }) });
  });
});

router.patch("/students/:id", requireAdmin, async (req, res) => {
  const { name, email, studentId, department, semester, course, phone, address, photoUrl, status } = req.body || {};
  await withDb(async (db) => {
    const update = {};
    if (name !== undefined) update.name = name;
    if (email !== undefined) update.email = String(email).toLowerCase();
    if (studentId !== undefined) update.studentId = studentId;
    if (department !== undefined) update.department = department;
    if (semester !== undefined) update.semester = Number(semester);
    if (course !== undefined) update.course = course;
    if (phone !== undefined) update.phone = phone;
    if (address !== undefined) update.address = address;
    if (photoUrl !== undefined) update.photoUrl = photoUrl;
    if (status !== undefined) update.status = status;
    update.updatedAt = now();
    const doc = await db.collection("students").findOneAndUpdate({ _id: toId(req.params.id) }, { $set: update }, { returnDocument: "after" });
    if (!doc.value) throw { status: 404, message: "Student not found" };
    res.json({ success: true, data: serialize(doc.value) });
  });
});

router.delete("/students/:id", requireAdmin, async (req, res) => {
  await withDb(async (db) => {
    const student = await db.collection("students").findOne({ _id: toId(req.params.id) });
    if (student?.userId) await db.collection("users").deleteOne({ _id: student.userId });
    const result = await db.collection("students").deleteOne({ _id: toId(req.params.id) });
    if (!result.deletedCount) throw { status: 404, message: "Student not found" };
  });
  res.json({ success: true });
});

/* ---------------- Faculty ---------------- */

router.get("/faculty", authMiddleware, async (req, res) => {
  const { q, department, designation, page, pageSize } = req.query;
  const query = {};
  if (q) query.$or = [{ name: { $regex: q, $options: "i" } }, { email: { $regex: q, $options: "i" } }];
  if (department) query.department = department;
  if (designation) query.designation = designation;
  await withDb(async (db) => {
    const data = await paginate(db.collection("faculty"), query, page, pageSize, { createdAt: -1 });
    res.json({ success: true, data });
  });
});

router.get("/faculty/public", async (req, res) => {
  await withDb(async (db) => {
    const items = await db.collection("faculty").find({}).sort({ name: 1 }).toArray();
    res.json({ success: true, data: { items: items.map(serialize), total: items.length } });
  });
});

router.get("/faculty/:id", authMiddleware, async (req, res) => {
  await withDb(async (db) => {
    const doc = await db.collection("faculty").findOne({ _id: toId(req.params.id) });
    if (!doc) throw { status: 404, message: "Faculty not found" };
    res.json({ success: true, data: serialize(doc) });
  });
});

router.post("/faculty", requireAdmin, async (req, res) => {
  const { name, email, department, designation, qualification, experience, phone, photoUrl, bio } = req.body || {};
  if (!name || !department) throw { status: 400, message: "Name and department are required" };
  await withDb(async (db) => {
    const result = await db.collection("faculty").insertOne({
      name: String(name).trim(),
      email: email || null,
      department,
      designation: designation || "Assistant Professor",
      qualification: qualification || null,
      experience: experience ? Number(experience) : null,
      phone: phone || null,
      photoUrl: photoUrl || null,
      bio: bio || null,
      createdAt: now(),
      updatedAt: now(),
    });
    res.status(201).json({ success: true, data: serialize({ _id: result.insertedId }) });
  });
});

router.patch("/faculty/:id", requireAdmin, async (req, res) => {
  const fields = ["name", "email", "department", "designation", "qualification", "experience", "phone", "photoUrl", "bio"];
  await withDb(async (db) => {
    const update = {};
    for (const f of fields) if (req.body[f] !== undefined) update[f] = f === "experience" ? Number(req.body[f]) : req.body[f];
    update.updatedAt = now();
    const doc = await db.collection("faculty").findOneAndUpdate({ _id: toId(req.params.id) }, { $set: update }, { returnDocument: "after" });
    if (!doc.value) throw { status: 404, message: "Faculty not found" };
    res.json({ success: true, data: serialize(doc.value) });
  });
});

router.delete("/faculty/:id", requireAdmin, async (req, res) => {
  await withDb(async (db) => {
    const result = await db.collection("faculty").deleteOne({ _id: toId(req.params.id) });
    if (!result.deletedCount) throw { status: 404, message: "Faculty not found" };
  });
  res.json({ success: true });
});

/* ---------------- Departments ---------------- */

router.get("/departments", authMiddleware, async (req, res) => {
  const { q, page, pageSize } = req.query;
  const query = q ? { $or: [{ name: { $regex: q, $options: "i" } }, { code: { $regex: q, $options: "i" } }] } : {};
  await withDb(async (db) => {
    const data = await paginate(db.collection("departments"), query, page, pageSize, { name: 1 });
    res.json({ success: true, data });
  });
});

router.get("/departments/public", async (req, res) => {
  await withDb(async (db) => {
    const items = await db.collection("departments").find({}).sort({ name: 1 }).toArray();
    res.json({ success: true, data: { items: items.map(serialize), total: items.length } });
  });
});

router.get("/departments/:id", authMiddleware, async (req, res) => {
  await withDb(async (db) => {
    const doc = await db.collection("departments").findOne({ _id: toId(req.params.id) });
    if (!doc) throw { status: 404, message: "Department not found" };
    const students = await db.collection("students").countDocuments({ department: doc.name });
    const faculty = await db.collection("faculty").countDocuments({ department: doc.name });
    res.json({ success: true, data: { ...serialize(doc), stats: { students, faculty } } });
  });
});

router.post("/departments", requireAdmin, async (req, res) => {
  const { name, code, description, head, established } = req.body || {};
  if (!name || !code) throw { status: 400, message: "Name and code are required" };
  await withDb(async (db) => {
    const result = await db.collection("departments").insertOne({
      name: String(name).trim(),
      code: String(code).trim().toUpperCase(),
      description: description || null,
      head: head || null,
      established: established ? Number(established) : null,
      createdAt: now(),
      updatedAt: now(),
    });
    res.status(201).json({ success: true, data: serialize({ _id: result.insertedId }) });
  });
});

router.patch("/departments/:id", requireAdmin, async (req, res) => {
  const fields = ["name", "code", "description", "head", "established"];
  await withDb(async (db) => {
    const update = {};
    for (const f of fields) if (req.body[f] !== undefined) update[f] = f === "established" ? Number(req.body[f]) : req.body[f];
    if (update.code) update.code = String(update.code).toUpperCase();
    update.updatedAt = now();
    const doc = await db.collection("departments").findOneAndUpdate({ _id: toId(req.params.id) }, { $set: update }, { returnDocument: "after" });
    if (!doc.value) throw { status: 404, message: "Department not found" };
    res.json({ success: true, data: serialize(doc.value) });
  });
});

router.delete("/departments/:id", requireAdmin, async (req, res) => {
  await withDb(async (db) => {
    const result = await db.collection("departments").deleteOne({ _id: toId(req.params.id) });
    if (!result.deletedCount) throw { status: 404, message: "Department not found" };
  });
  res.json({ success: true });
});

/* ---------------- Courses ---------------- */

router.get("/courses", authMiddleware, async (req, res) => {
  const { q, department, semester, page, pageSize } = req.query;
  const query = {};
  if (q) query.$or = [{ name: { $regex: q, $options: "i" } }, { code: { $regex: q, $options: "i" } }];
  if (department) query.department = department;
  if (semester) query.semester = Number(semester);
  await withDb(async (db) => {
    const data = await paginate(db.collection("courses"), query, page, pageSize, { name: 1 });
    res.json({ success: true, data });
  });
});

router.get("/courses/public", async (req, res) => {
  await withDb(async (db) => {
    const items = await db.collection("courses").find({}).sort({ name: 1 }).toArray();
    res.json({ success: true, data: { items: items.map(serialize), total: items.length } });
  });
});

router.get("/courses/:id", authMiddleware, async (req, res) => {
  await withDb(async (db) => {
    const doc = await db.collection("courses").findOne({ _id: toId(req.params.id) });
    if (!doc) throw { status: 404, message: "Course not found" };
    res.json({ success: true, data: serialize(doc) });
  });
});

router.post("/courses", requireAdmin, async (req, res) => {
  const { name, code, department, semester, credits, description } = req.body || {};
  if (!name || !code) throw { status: 400, message: "Name and code are required" };
  await withDb(async (db) => {
    const result = await db.collection("courses").insertOne({
      name: String(name).trim(),
      code: String(code).trim().toUpperCase(),
      department: department || null,
      semester: semester ? Number(semester) : null,
      credits: credits ? Number(credits) : null,
      description: description || null,
      createdAt: now(),
      updatedAt: now(),
    });
    res.status(201).json({ success: true, data: serialize({ _id: result.insertedId }) });
  });
});

router.patch("/courses/:id", requireAdmin, async (req, res) => {
  const fields = ["name", "code", "department", "semester", "credits", "description"];
  await withDb(async (db) => {
    const update = {};
    for (const f of fields) if (req.body[f] !== undefined) update[f] = ["semester", "credits"].includes(f) ? Number(req.body[f]) : req.body[f];
    update.updatedAt = now();
    const doc = await db.collection("courses").findOneAndUpdate({ _id: toId(req.params.id) }, { $set: update }, { returnDocument: "after" });
    if (!doc.value) throw { status: 404, message: "Course not found" };
    res.json({ success: true, data: serialize(doc.value) });
  });
});

router.delete("/courses/:id", requireAdmin, async (req, res) => {
  await withDb(async (db) => {
    const result = await db.collection("courses").deleteOne({ _id: toId(req.params.id) });
    if (!result.deletedCount) throw { status: 404, message: "Course not found" };
  });
  res.json({ success: true });
});

router.post("/courses/:id/enroll", authMiddleware, async (req, res) => {
  await withDb(async (db) => {
    const doc = await db.collection("courses").findOneAndUpdate(
      { _id: toId(req.params.id) },
      { $addToSet: { enrolledStudents: toId(req.user.userId) }, $inc: { enrollments: 1 }, $set: { updatedAt: now() } },
      { returnDocument: "after" }
    );
    if (!doc.value) throw { status: 404, message: "Course not found" };
    res.json({ success: true, data: serialize(doc.value) });
  });
});

export default router;
