import "dotenv/config";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { createApp, ready } from "../src/app.js";

const mongod = process.env.MONGODB_URL ? null : await MongoMemoryServer.create();
process.env.MONGODB_DB = process.env.MONGODB_DB || "college_ai_test";
process.env.SECRET_KEY = process.env.SECRET_KEY || "test-secret-key";
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@college.edu";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@123456";

const app = createApp();
await ready();

let pass = 0;
const t = (name, cond) => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ FAILED: ${name}`);
    process.exitCode = 1;
  }
};

console.log("CollegeAI Express smoke tests");

/* health */
{
  const r = await request(app).get("/health");
  t("GET /health returns ok with mongo connected", r.status === 200 && r.body.mongo === "connected");
}

/* public page */
{
  const r = await request(app).get("/");
  t("GET / serves the React SPA", r.status === 200 && r.text.includes("<div id=\"root\">"));
}

/* register student */
const runId = Date.now();
const studentEmail = `student${runId}@test.edu`;
let studentToken;
{
  const r = await request(app).post("/api/auth/register").send({
    name: "Test Student", email: studentEmail, password: "Pass12345", studentId: `CS${runId}`, department: "CSE", semester: 3,
  });
  t("POST /api/auth/register returns 201", r.status === 201);
  t("register returns tokens", Boolean(r.body.data?.tokens?.accessToken));
  studentToken = r.body.data.tokens.accessToken;
}

/* duplicate email rejected */
{
  const r = await request(app).post("/api/auth/register").send({ name: "Dup", email: studentEmail, password: "Pass12345" });
  t("duplicate email rejected (409)", r.status === 409);
}

/* login admin (bootstrapped) */
let adminToken;
{
  const r = await request(app).post("/api/auth/login").send({ email: "admin@college.edu", password: "Admin@123456" });
  t("POST /api/auth/login admin returns 200", r.status === 200);
  adminToken = r.body.data.tokens.accessToken;
}

/* wrong password */
{
  const r = await request(app).post("/api/auth/login").send({ email: "admin@college.edu", password: "WrongPass1" });
  t("wrong password rejected (401)", r.status === 401);
}

/* me */
{
  const r = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${studentToken}`);
  t("GET /api/auth/me works", r.status === 200 && r.body.data.user.email === studentEmail);
}

/* student cannot create notice */
{
  const r = await request(app).post("/api/notices").set("Authorization", `Bearer ${studentToken}`).send({ title: "Nope" });
  t("student blocked from admin actions (403)", r.status === 403);
}

/* admin creates notice */
{
  const r = await request(app).post("/api/notices").set("Authorization", `Bearer ${adminToken}`).send({ title: "Exam schedule released", description: "Final exams start Dec 9", category: "exams", pinned: true });
  t("admin creates notice (201)", r.status === 201);
}

/* notices listed */
{
  const r = await request(app).get("/api/notices/public");
  t("GET /api/notices/public lists notice", r.status === 200 && r.body.data.total >= 1);
}

/* dashboard stats */
{
  const r = await request(app).get("/api/dashboard/stats").set("Authorization", `Bearer ${adminToken}`);
  t("GET /api/dashboard/stats works", r.status === 200 && r.body.data.students >= 1);
}

/* search */
{
  const r = await request(app).get("/api/search?q=exam").set("Authorization", `Bearer ${adminToken}`);
  t("GET /api/search finds notice", r.status === 200 && r.body.data.items.length >= 1);
}

/* unknown api path -> JSON 404 */
{
  const r = await request(app).get("/api/nonexistent");
  t("unknown API path returns JSON 404", r.status === 404 && r.body.code === "http_error");
}

/* spa fallback */
{
  const r = await request(app).get("/some/page");
  t("unknown page path serves SPA", r.status === 200 && r.text.includes("<div id=\"root\">"));
}

/* settings public */
{
  const r = await request(app).get("/api/settings");
  t("GET /api/settings works", r.status === 200 && Boolean(r.body.data.collegeName));
}

/* refresh flow */
{
  const login = await request(app).post("/api/auth/login").send({ email: studentEmail, password: "Pass12345" });
  const refresh = login.body.data.tokens.refreshToken;
  const r = await request(app).post("/api/auth/refresh").send({ refreshToken: refresh });
  t("POST /api/auth/refresh issues new token", r.status === 200 && Boolean(r.body.data.tokens.accessToken));
}

if (mongod) await mongod.stop();
console.log(`\n${pass} tests passed`);
process.exit(0);
