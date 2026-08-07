# 🎓 CollegeAI — Intelligent College Assistant

A production-ready full-stack college management platform with an AI chatbot that answers **only from official college documents**. Built with **Express.js (Node) + MongoDB + JWT + Cloudinary + React.js**, with a **Python (FastAPI) AI service** for the chatbot and knowledge base — all deployed on Vercel.

> No fake data, no placeholders — every module is fully implemented and tested (17 Node smoke tests + 12 Python tests passing).

---

## ✨ Features

| Module | Highlights |
|---|---|
| 🔐 Authentication | Student/Admin registration, login, JWT + refresh tokens, remember me, forgot/reset password, sessions, logout, profile, photo upload, account deletion, role-based access |
| 🤖 AI Chatbot | Conversation context & history, long conversations, multi-language (EN/HI/TE/TA/BN/…), spelling tolerance, typing animation, saved to MongoDB, response latency |
| 📚 Knowledge Base | Upload prospectus/rules/syllabus/fee/hostel/transport/library PDFs → text extraction → chunking → embedding (if OpenAI) → retrieval. **Answers only from documents, never hallucinates.** |
| 🎓 Students | CRUD, search, filters, pagination, department/semester assignment, enrollment, photos |
| 👩‍🏫 Faculty | CRUD, designation, experience, subjects, qualification, office, photos, search |
| 🏛️ Departments / 📖 Courses | CRUD with heads, stats, subjects, credits, semester mapping |
| 📢 Notices | Image/PDF/video attachments, priority, pinned, expiry, view counts, notification badge |
| 🎉 Events | Workshops, seminars, hackathons, sports, cultural — countdown timers, registration links |
| 💼 Placements | Companies, packages, eligibility, drive dates, selection process, interview tips |
| 🗓️ Timetable | Admin upload, student view by dept+semester, print/download |
| 🖼️ Gallery | Cloudinary images/videos, albums, lazy loading, likes |
| 🕘 Chat History | Every message saved; search, delete, export |
| 📊 Admin Dashboard | 12+ live stats, 14-day charts, doughnut charts, activity feed, global search |
| 🔍 Global Search | Students, faculty, courses, departments, notices, events, placements, PDFs, gallery |
| 🛡️ Security | JWT, role guards, rate limiting, input sanitization, file validation, size limits, CORS, secure error handling |
| 🚀 Deployment | Docker + docker-compose, Render/Railway ready, Swagger docs |

---

## 🏗️ Project Structure

```
college_ai/
├── api/
│   ├── index.js                # Express app (Vercel Node function) — all REST APIs + SPA
│   └── ai.py                   # Python AI function — /api/chat + /api/knowledge
├── src/                        # Express backend
│   ├── app.js                  # App assembly, middleware, error handling
│   ├── db.js                   # MongoDB connection (lazy, SRV fallback)
│   ├── auth.js                 # JWT + bcrypt + refresh rotation + admin bootstrap
│   ├── upload.js               # Multer + Cloudinary (data-URL fallback)
│   └── routes/                 # auth, catalog (students/faculty/departments/courses), content (notices/events/placements/gallery/timetable), system (dashboard/search/feedback/notifications/settings/uploads)
├── frontend/                   # React.js SPA (Vite) → builds into public/
├── public/                     # Built SPA (served by Express)
├── app/                        # Python AI engine (chatbot, knowledge base, PDF processing)
├── tests/
│   ├── smoke.test.mjs          # 17 Express end-to-end tests
│   └── test_api.py             # 12 Python tests (mongomock)
├── vercel.json                 # Rewrites: /api/chat + /api/knowledge → Python, rest → Express
├── package.json  ·  requirements.txt  ·  .env.example  ·  .gitignore
└── main.py                     # (legacy) FastAPI entry for local AI-service use
```

---

## 🚀 Quick Start (Windows / Linux / macOS)

### 1. Prerequisites
- Node **20+** and Python **3.11+**
- MongoDB (local, Atlas, or via docker-compose)
- Cloudinary account (optional — falls back to local uploads)
- OpenAI or Gemini API key (optional — template answers without it)

### 2. Install & run

```bash
npm install                  # Express backend deps
cd frontend && npm install   # React deps
cd ..
npm run dev                  # http://localhost:3000
```

The React app is already built into `public/` (rebuild with `npm --prefix frontend run build`). The Python AI service runs separately on Vercel (`/api/ai`); for local AI testing use `python main.py` (port 8000) — Vercel routes `/api/chat` and `/api/knowledge` to the Python function.

### 3. Configure

```bash
copy .env.example .env        # Windows
# cp .env.example .env        # Linux/macOS
```

Edit `.env` and set at minimum: `MONGODB_URL`, `SECRET_KEY`. Add Cloudinary and AI keys for full features.

Default admin is bootstrapped from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`.

### 4. Run tests

```bash
npm test                     # 17 Express E2E tests (uses MONGODB_URL from .env, or in-memory Mongo)
python -m pytest tests -q    # 12 Python tests (mongomock — no MongoDB needed)
```

---

## 🐳 Docker Deployment

```bash
docker compose up -d --build   # starts MongoDB + app
# app: http://localhost:8000
```

Or build alone:

```bash
docker build -t collegeai .
docker run -p 8000:8000 --env-file .env collegeai
```

## ☁️ Vercel Deployment

1. Push this repo to GitHub and import it in Vercel (or use the CLI from this folder).
2. **Project → Settings → Deployment Protection: off** (so visitors don't hit a login wall).
3. **Project → Settings → Environment Variables** — set at minimum:

| Variable | Example |
|---|---|
| `MONGODB_URL` | `mongodb+srv://user:pass@cluster.mongodb.net` (SRV works on Vercel) |
| `MONGODB_DB` | `college_ai` |
| `SECRET_KEY` | long random string |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | optional, image uploads |
| `AI_PROVIDER` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | optional, AI answers |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | bootstrap admin |

Routing: `/api/chat/*` and `/api/knowledge/*` run on the Python function (`api/ai.py`), everything else on the Express function (`api/index.js`), and the React SPA is served by Express from `public/`.

---

## 🔧 Environment Variables

| Variable | Description | Default |
|---|---|---|
| `MONGODB_URL` | MongoDB connection string | `mongodb://localhost:27017` |
| `MONGODB_DB` | Database name | `college_ai` |
| `SECRET_KEY` | JWT signing secret (use 32+ random chars) | `change-this-in-production` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token lifetime | `60` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token lifetime | `30` |
| `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` | Cloudinary credentials | — |
| `AI_PROVIDER` | `openai` / `gemini` / `none` | `none` |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | OpenAI credentials | `gpt-4o-mini` |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Gemini credentials | `gemini-1.5-flash` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Bootstrap admin (created on first start) | `admin@college.edu` / `Admin@123456` |
| `RATE_LIMIT_PER_MINUTE` | Per-IP API limit | `60` |
| `MAX_UPLOAD_SIZE_MB` | Max upload size | `20` |
| `CORS_ORIGINS` | Allowed origins (`*` or comma list) | `*` |

---

## 📡 API Overview (Swagger at `/docs`)

| Router | Prefix | Key endpoints |
|---|---|---|
| Authentication | `/api/auth` | register, register/admin, login, refresh, logout, forgot-password, reset-password, me, change-password, sessions, photo |
| Students | `/api/students` | CRUD + filters (admin) |
| Faculty | `/api/faculty` | CRUD + public list |
| Departments | `/api/departments` | CRUD + stats |
| Courses | `/api/courses` | CRUD + enroll |
| Notices | `/api/notices` | CRUD, pinned, expiry |
| Events | `/api/events` | CRUD, categories |
| Placements | `/api/placements` | CRUD |
| Gallery | `/api/gallery` | CRUD, albums, like |
| Timetable | `/api/timetable` | CRUD, `/my` |
| Knowledge Base | `/api/knowledge` | PDF upload (extract+index), list, delete |
| Chat | `/api/chat` | send, sessions, messages, rename, history, search, export |
| Search | `/api/search` | global search |
| Dashboard | `/api/dashboard` | stats, analytics, activity (admin) |
| Uploads | `/api/uploads` | Cloudinary upload/delete |
| Notifications | `/api/notifications` | mine, unread, broadcast |
| Feedback | `/api/feedback` | submit, list, status |
| Settings | `/api/settings` | get, update |

### Auth example

```bash
# Register
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Student","email":"s@college.edu","password":"Student123","semester":1}'

# Login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"s@college.edu","password":"Student123"}'

# Use token
curl http://localhost:8000/api/notices -H "Authorization: Bearer <access_token>"

# Ask the chatbot
curl -X POST http://localhost:8000/api/chat \
  -H "Authorization: Bearer <access_token>" -H "Content-Type: application/json" \
  -d '{"message":"When are the semester exams?","language":"en"}'
```

---

## 🤖 AI & Knowledge Base Behavior

1. Admin uploads a PDF (prospectus, syllabus, …) → text extracted with `pypdf` → split into ~1200-char chunks with overlap → each chunk stored in `knowledge_chunks` with its token index (and OpenAI embedding when configured).
2. On each question, relevant chunks are ranked by keyword scoring + cosine similarity (embeddings).
3. The top chunks + recent conversation history are sent to OpenAI/Gemini with a strict system prompt: **answer only from context, never invent**; if nothing matches, the bot replies politely.
4. With no AI key configured, the bot returns the best matching chunk excerpt — still grounded in documents.

---

## 📊 MongoDB Collections

`users` · `admins` · `departments` · `courses` · `subjects`(in courses) · `faculty` · `students` · `events` · `gallery` · `chat_history` · `chat_sessions` · `knowledge_base` · `knowledge_chunks` · `placements` · `timetable` · `notices` · `notifications` · `uploads` · `feedback` · `settings` · `analytics`(via aggregates) · `logs`(filesystem) · `user_sessions` · `password_reset_tokens`

Indexes are created automatically on startup for fast queries, search and pagination.

---

## 🧪 Testing Guide

```bash
python -m pytest tests -v
```

The suite uses `mongomock-motor` so it runs **without MongoDB**. Covered: health, register, duplicate email (409), login, refresh token, wrong password (401), forgot/reset password flow, role guard (403), chatbot answer + session, history search, global search, admin-only endpoints.

---

## 📝 Logs

Rotating logs in `logs/`:
- `app.log` — application activity
- `ai.log` — AI provider calls
- `auth.log` — registrations, logins, resets
- `errors.log` — unhandled exceptions
- `mongo.log` — database lifecycle
- `uploads.log` — file operations

---

## 🛡️ Security Checklist (implemented)

- ✅ JWT access + refresh tokens, rotation on refresh
- ✅ bcrypt (12 rounds) password hashing
- ✅ Role-based access (student/admin) on every protected route
- ✅ Per-IP rate limiting (60/min default)
- ✅ Input sanitization (HTML escaping, whitespace) + Pydantic validation
- ✅ File type/size validation before upload
- ✅ CORS policy + GZip compression
- ✅ Global exception handlers → consistent JSON errors (400/401/403/404/409/422/429/500)
- ✅ Secrets only in environment variables

---

## 🖥️ UI Highlights

- Glassmorphism design, animated gradient background
- Dark / Light mode with one click (persisted)
- Loading screen, skeleton loaders, toast notifications
- Typing animation for the chatbot, markdown-rendered answers
- Fully responsive: desktop, tablet, mobile (drawer sidebar, hamburger nav)
- Live countdown timers, notification badge, print-friendly timetable
