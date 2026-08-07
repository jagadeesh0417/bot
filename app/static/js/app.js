/* ============================================================
   CollegeAI – Frontend application
   Vanilla JS SPA · hash router · auth · chat · admin
   ============================================================ */

"use strict";

/* ---------------- State ---------------- */
const S = {
  token: localStorage.getItem("cai_token"),
  refresh: localStorage.getItem("cai_refresh"),
  user: JSON.parse(localStorage.getItem("cai_user") || "null"),
  role: localStorage.getItem("cai_role") || null,
  route: "landing",
  chat: { session: null, sessions: [], messages: [], busy: false, lang: "en" },
  notices: { page: 1, data: null },
  admin: {},
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt) ? "—" : dt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};
const fmtTime = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  return isNaN(dt) ? "" : dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
};
const initials = (name) =>
  (name || "?")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

/* ---------------- Toasts ---------------- */
function toast(message, type = "info", ms = 3500) {
  const icons = { success: "✅", error: "⛔", warning: "⚠️", info: "ℹ️" };
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type] || "ℹ️"}</span><div>${esc(message)}</div>`;
  $("#toast-container").appendChild(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 400); }, ms);
}

/* ---------------- API client ---------------- */
async function api(path, options = {}, retried = false) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (S.token) headers.Authorization = `Bearer ${S.token}`;

  let body;
  if (options.body instanceof FormData) { body = options.body; delete headers["Content-Type"]; }
  else if (options.body !== undefined) body = JSON.stringify(options.body);

  let res;
  try {
    res = await fetch(`/api${path}`, { ...options, headers, body });
  } catch (e) {
    throw new Error("Network error — is the server running?");
  }

  if (res.status === 401 && S.refresh && !retried) {
    try {
      const r = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: S.refresh }),
      });
      if (r.ok) {
        const data = await r.json();
        S.token = data.access_token;
        localStorage.setItem("cai_token", S.token);
        return api(path, options, true);
      }
    } catch (e) { /* fall through */ }
    logout(false);
    throw new Error("Session expired. Please login again.");
  }

  if (res.status === 204) return null;
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    const detail = data?.detail || `Request failed (${res.status})`;
    const msg = typeof detail === "string" ? detail : (data?.errors?.map((e) => `${e.field}: ${e.message}`).join("; ") || "Validation error");
    throw new Error(msg);
  }
  return data;
}

function logout(redirect = true) {
  if (S.refresh) api("/auth/logout", { method: "POST", body: { refresh_token: S.refresh } }).catch(() => {});
  S.token = S.refresh = null; S.user = null; S.role = null; S.chat = { session: null, sessions: [], messages: [], busy: false, lang: "en" };
  localStorage.removeItem("cai_token"); localStorage.removeItem("cai_refresh");
  localStorage.removeItem("cai_user"); localStorage.removeItem("cai_role");
  if (redirect) location.hash = "#/landing";
}

function saveAuth(data) {
  S.token = data.access_token;
  S.refresh = data.refresh_token;
  S.role = data.role;
  localStorage.setItem("cai_token", S.token);
  localStorage.setItem("cai_refresh", S.refresh);
  localStorage.setItem("cai_role", S.role);
  return api("/auth/me").then((u) => { S.user = u; localStorage.setItem("cai_user", JSON.stringify(u)); });
}

/* ---------------- Modal ---------------- */
function openModal(html, wide = false) {
  $("#modal-root").innerHTML = `
    <div class="modal-backdrop" onclick="if(event.target===this)closeModal()">
      <div class="modal ${wide ? "modal-wide" : ""}">${html}</div>
    </div>`;
}
function closeModal() { $("#modal-root").innerHTML = ""; }

/* ---------------- Markdown-lite ---------------- */
function md(text) {
  let out = esc(text);
  out = out.replace(/^### (.*)$/gm, "<h3>$1</h3>").replace(/^## (.*)$/gm, "<h2>$1</h2>").replace(/^# (.*)$/gm, "<h1>$1</h1>");
  out = out.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/^\s*[-*] (.*)$/gm, "<li>$1</li>").replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m.replace(/\n/g, "")}</ul>`);
  out = out.replace(/^\s*(\d+)\. (.*)$/gm, "<li>$2</li>");
  out = out.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br/>");
  return `<p>${out}</p>`;
}

/* ---------------- Theme ---------------- */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("cai_theme", theme);
  $$(".theme-toggle").forEach((b) => (b.textContent = theme === "dark" ? "☀️" : "🌙"));
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  applyTheme(cur === "dark" ? "light" : "dark");
}
applyTheme(localStorage.getItem("cai_theme") || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));

/* ---------------- Charts (vanilla canvas) ---------------- */
function drawBarChart(canvas, labels, values, color = "rgba(99,102,241,.85)") {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  const pad = { l: 36, r: 12, t: 16, b: 28 };
  const max = Math.max(...values, 1);
  const cw = (W - pad.l - pad.r) / labels.length;
  ctx.font = "11px Inter";
  ctx.fillStyle = "var(--text-3)";
  ctx.strokeStyle = "var(--border)";
  ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, H - pad.b); ctx.stroke();
  labels.forEach((label, i) => {
    const v = values[i] || 0;
    const h = (v / max) * (H - pad.t - pad.b);
    const x = pad.l + cw * i + cw * 0.18;
    const y = H - pad.b - h;
    const g = ctx.createLinearGradient(0, y, 0, H - pad.b);
    g.addColorStop(0, color); g.addColorStop(1, "rgba(99,102,241,.15)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, y, cw * 0.64, h, 4);
    ctx.fill();
    ctx.fillStyle = "var(--text-3)"; ctx.textAlign = "center";
    ctx.fillText(String(label), x + cw * 0.32, H - pad.b + 16);
  });
}

function drawDoughnut(canvas, items) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  const total = items.reduce((a, b) => a + b.value, 0);
  if (!total) { ctx.fillStyle = "var(--text-3)"; ctx.font = "13px Inter"; ctx.textAlign = "center"; ctx.fillText("No data yet", W / 2, H / 2); return; }
  const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 14;
  const palette = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"];
  let angle = -Math.PI / 2;
  items.forEach((item, i) => {
    const a = (item.value / total) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + a);
    ctx.closePath(); ctx.fillStyle = palette[i % palette.length]; ctx.fill();
    angle += a;
  });
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2); ctx.fillStyle = "var(--card-solid)"; ctx.fill();
}

/* ---------------- Router ---------------- */
const routes = {
  "landing": renderLanding,
  "login": renderAuth("login"),
  "register": renderAuth("register"),
  "register-admin": renderAuth("register-admin"),
  "forgot": renderAuth("forgot"),
  "reset": renderAuth("reset"),
  "app": renderApp,
  "app/chat": renderChat,
  "app/notices": () => renderListPage("notices"),
  "app/knowledge": () => renderListPage("knowledge"),
  "app/timetable": () => renderListPage("timetable"),
  "app/events": () => renderListPage("events"),
  "app/placements": () => renderListPage("placements"),
  "app/faculty": () => renderListPage("faculty"),
  "app/courses": () => renderListPage("courses"),
  "app/gallery": () => renderListPage("gallery"),
  "app/history": renderHistory,
  "app/profile": renderProfile,
  "admin": renderAdmin,
  "admin/analytics": renderAdminAnalytics,
  "admin/students": () => renderAdminList("students"),
  "admin/faculty": () => renderAdminList("faculty"),
  "admin/departments": () => renderAdminList("departments"),
  "admin/courses": () => renderAdminList("courses"),
  "admin/notices": () => renderAdminList("notices"),
  "admin/events": () => renderAdminList("events"),
  "admin/placements": () => renderAdminList("placements"),
  "admin/gallery": () => renderAdminList("gallery"),
  "admin/knowledge": () => renderAdminList("knowledge"),
  "admin/timetable": () => renderAdminList("timetable"),
  "admin/feedback": () => renderAdminList("feedback"),
  "admin/notifications": renderAdminNotifications,
  "admin/settings": renderAdminSettings,
};

function navigate(hash) {
  const path = (hash || "#/landing").replace(/^#\/?/, "") || "landing";
  S.route = path;
  const handler = routes[path] || (path.startsWith("app") ? renderApp : renderLanding);
  renderShell(handler, path);
  window.scrollTo({ top: 0 });
  if (path.startsWith("admin") && S.role !== "admin") { toast("Admins only", "warning"); location.hash = "#/landing"; }
  if (path.startsWith("app") && !S.token) { toast("Please login first", "warning"); location.hash = "#/login"; }
}

function renderShell(contentFn, path) {
  const app = $("#app");
  $("#loader").classList.add("hidden");
  if (path === "landing" || path.startsWith("login") || path === "register" || path === "register-admin" || path === "forgot" || path === "reset") {
    app.innerHTML = contentFn();
    return;
  }
  if (path.startsWith("admin") && S.role !== "admin") { location.hash = "#/landing"; return; }
  if (path.startsWith("app") && S.role !== "student") { location.hash = "#/login"; return; }
  app.innerHTML = shellFrame(path);
  $$(".side-link").forEach((l) => l.classList.toggle("active", l.dataset.route === path));
  $$(".theme-toggle").forEach((b) => (b.textContent = document.documentElement.getAttribute("data-theme") === "dark" ? "☀️" : "🌙"));
  $("#bell").addEventListener("click", () => navigate("#/app/notices"));
  $("#menu-btn").addEventListener("click", () => $(".sidebar").classList.toggle("open"));
  contentFn();
}

window.addEventListener("hashchange", () => navigate(location.hash));
window.addEventListener("resize", () => { if (S.route === "admin/analytics") renderAdminAnalytics(); });

/* ---------------- Landing ---------------- */
function renderLanding() {
  const isLogged = !!S.token;
  return `
  <div class="landing">
    <nav class="nav">
      <a class="nav-brand" href="#/landing"><span class="logo-emoji">🎓</span> College<span style="background:var(--gradient);-webkit-background-clip:text;background-clip:text;color:transparent">AI</span></a>
      <button class="hamburger" onclick="document.querySelector('.nav-links').classList.toggle('open')">☰</button>
      <div class="nav-links">
        <a href="#features">Features</a>
        <button class="theme-toggle" onclick="toggleTheme()">☀️</button>
        ${isLogged
          ? `<button class="btn btn-primary btn-sm" onclick="location.hash='${S.role === "admin" ? "#/admin" : "#/app"}'">Dashboard</button>`
          : `<a href="#/login" class="btn btn-sm">Login</a><a href="#/register" class="btn btn-primary btn-sm">Get Started</a>`}
      </div>
    </nav>

    <section class="hero">
      <div class="hero-text">
        <div class="hero-badge"><span class="dot"></span> Powered by AI · Knowledge Base · 24/7</div>
        <h1>Your college, <span class="grad">reimagined</span> with intelligence.</h1>
        <p>CollegeAI is your personal campus companion — ask anything about rules, syllabus, exams, fees and events. Real answers from real documents, not guesswork.</p>
        <div class="hero-cta">
          ${isLogged ? `<a href="#/app" class="btn btn-primary">Open Assistant</a>` : `<a href="#/register" class="btn btn-primary">Create Account</a><a href="#/login" class="btn">I already have an account</a>`}
          <a href="/docs" class="btn" target="_blank">API Docs</a>
        </div>
      </div>
      <div class="hero-visual">
        <div class="chat-preview">
          <div class="chat-preview-head"><span>🤖</span> CollegeAI Assistant</div>
          <div class="chat-preview-body">
            <div class="bubble user">When are the semester exams?</div>
            <div class="bubble bot">Based on the Academic Calendar: <b>Semester exams start on 25 November</b>. Fee payment deadline is 10 November. 🗓️</div>
            <div class="bubble user">What is the hostel curfew?</div>
            <div class="bubble bot"><span class="typing"><span></span><span></span><span></span></span></div>
          </div>
        </div>
      </div>
    </section>

    <section class="section" id="features">
      <div class="section-head"><h2>Everything your campus needs</h2><p>One intelligent platform for students, faculty and administration.</p></div>
      <div class="features-grid">
        ${[
          ["🤖", "AI Chatbot", "Natural conversations with context memory. Answers only from official college documents — never hallucinates."],
          ["📚", "Knowledge Base", "Upload prospectus, syllabus, fee structure and rules. Text is extracted, chunked and indexed for instant answers."],
          ["📢", "Notices & Events", "Pinned priority notices, workshops, hackathons and sports with countdown timers."],
          ["💼", "Placements", "Company drives, packages, eligibility, selection process and interview tips in one place."],
          ["🗓️", "Timetable & Courses", "Semester-wise timetables, subjects, credits and faculty mapping per department."],
          ["👩‍🏫", "Faculty & Students", "Complete profiles with photos, departments, designations and search."],
          ["🖼️", "Media Gallery", "Campus photos and videos stored on Cloudinary with albums and lazy loading."],
          ["📊", "Admin Analytics", "Live statistics, charts, activity feed, global search and full CRUD management."],
        ].map(([icon, title, desc], i) => `
          <div class="feature-card" style="animation-delay:${i * 0.06}s">
            <div class="feature-icon">${icon}</div><h3>${title}</h3><p>${desc}</p>
          </div>`).join("")}
      </div>
    </section>

    <footer>© ${new Date().getFullYear()} CollegeAI — Intelligent College Assistant · <a href="/docs">Swagger API</a></footer>
  </div>`;
}

/* ---------------- Auth ---------------- */
function renderAuth(mode) {
  const titles = {
    login: ["Welcome back 👋", "Login to continue to your college portal"],
    register: ["Create student account", "Join your campus in under a minute"],
    "register-admin": ["Admin registration", "Register the college administrator"],
    forgot: ["Forgot password?", "Enter your email to receive a reset token"],
    reset: ["Reset password", "Enter the reset token from your email and a new password"],
  };
  const [title, sub] = titles[mode];

  const fields = {
    login: `
      <div class="field"><label>Email</label><input class="input" id="email" type="email" placeholder="you@college.edu" required></div>
      <div class="field"><label>Password</label><input class="input" id="password" type="password" placeholder="••••••••" required></div>
      <label style="display:flex;gap:8px;align-items:center;font-size:13px;color:var(--text-2);margin-bottom:18px"><input type="checkbox" id="remember"> Remember me for 30 days</label>
      <button class="btn btn-primary btn-block" id="submit-btn">Login</button>
      <div class="auth-switch"><a href="#/forgot">Forgot password?</a></div>`,
    register: `
      <div class="field"><label>Full name</label><input class="input" id="name" required></div>
      <div class="field"><label>Email</label><input class="input" id="email" type="email" required></div>
      <div class="form-row">
        <div class="field"><label>Roll number</label><input class="input" id="roll_number"></div>
        <div class="field"><label>Semester</label><input class="input" id="semester" type="number" min="1" max="12" value="1"></div>
      </div>
      <div class="field"><label>Department</label><select class="select" id="department_id"><option value="">Select department</option></select></div>
      <div class="field"><label>Phone</label><input class="input" id="phone"></div>
      <div class="field"><label>Password (min 8 chars, letters + numbers)</label><input class="input" id="password" type="password" required></div>
      <button class="btn btn-primary btn-block" id="submit-btn">Create Account</button>
      <div class="auth-switch">Already have an account? <a href="#/login">Login</a></div>`,
    "register-admin": `
      <div class="field"><label>Admin name</label><input class="input" id="name" required></div>
      <div class="field"><label>Email</label><input class="input" id="email" type="email" required></div>
      <div class="field"><label>Password (min 8 chars)</label><input class="input" id="password" type="password" required></div>
      <button class="btn btn-primary btn-block" id="submit-btn">Register Admin</button>`,
    forgot: `
      <div class="field"><label>Email</label><input class="input" id="email" type="email" required></div>
      <button class="btn btn-primary btn-block" id="submit-btn">Send Reset Token</button>
      <div class="auth-switch"><a href="#/login">Back to login</a></div>`,
    reset: `
      <div class="field"><label>Reset token</label><input class="input" id="token" required></div>
      <div class="field"><label>New password</label><input class="input" id="password" type="password" required></div>
      <button class="btn btn-primary btn-block" id="submit-btn">Reset Password</button>
      <div class="auth-switch"><a href="#/login">Back to login</a></div>`,
  };

  setTimeout(() => {
    if (mode === "register") {
      api("/departments/public").then((d) => {
        $("#department_id").innerHTML = `<option value="">Select department</option>` + d.items.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("");
      }).catch(() => {});
    }
    $("#submit-btn").addEventListener("click", async (e) => {
      const btn = e.target;
      btn.disabled = true; btn.textContent = "Please wait…";
      try {
        let data;
        if (mode === "login") data = await api("/auth/login", { method: "POST", body: { email: val("email"), password: val("password"), remember_me: $("#remember")?.checked } });
        else if (mode === "register") data = await api("/auth/register", { method: "POST", body: { name: val("name"), email: val("email"), password: val("password"), roll_number: val("roll_number") || null, semester: parseInt(val("semester") || "1"), department_id: val("department_id") || null, phone: val("phone") || null } });
        else if (mode === "register-admin") data = await api("/auth/register/admin", { method: "POST", body: { name: val("name"), email: val("email"), password: val("password") } });
        else if (mode === "forgot") {
          await api("/auth/forgot-password", { method: "POST", body: { email: val("email") } });
          toast("Reset token sent to your email", "success");
          setTimeout(() => (location.hash = "#/reset"), 1200);
          return;
        } else if (mode === "reset") {
          await api("/auth/reset-password", { method: "POST", body: { token: val("token"), new_password: val("password") } });
          toast("Password reset successful — login now", "success");
          setTimeout(() => (location.hash = "#/login"), 1200);
          return;
        }
        await saveAuth(data);
        toast(`Welcome, ${S.user?.name || "friend"}! 👋`, "success");
        location.hash = data.role === "admin" ? "#/admin" : "#/app";
      } catch (err) {
        toast(err.message, "error");
      } finally {
        btn.disabled = false; btn.textContent = mode === "login" ? "Login" : "Continue";
      }
    });
  }, 0);

  const val = (id) => ($(`#${id}`)?.value || "").trim();
  return `
  <div class="auth-wrap">
    <div class="auth-card glass">
      <a class="auth-back" href="#/landing">← Home</a>
      <h1>${title}</h1>
      <p class="sub">${sub}</p>
      ${fields[mode]}
      <div class="auth-switch" style="margin-top:10px;font-size:12px">Students register <a href="#/register">here</a> · Admins <a href="#/register-admin">here</a></div>
    </div>
  </div>`;
}

/* ---------------- Shell ---------------- */
function shellFrame(path) {
  const isAdmin = S.role === "admin";
  const nav = isAdmin ? adminNav(path) : studentNav(path);
  return `
  <div class="shell">
    <aside class="sidebar">
      <a class="sidebar-brand" href="#/landing"><span class="logo-emoji">🎓</span> CollegeAI</a>
      <nav class="sidebar-nav">${nav}</nav>
      <div class="sidebar-foot">
        <div class="user-chip">
          <span class="avatar">${S.user?.photo_url ? `<img src="${esc(S.user.photo_url)}" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover">` : esc(initials(S.user?.name))}</span>
          <div class="meta"><div class="n">${esc(S.user?.name || "User")}</div><div class="r">${esc(S.role)}</div></div>
        </div>
        <button class="btn btn-sm btn-danger" onclick="logout()">🚪 Logout</button>
      </div>
    </aside>
    <main class="main">
      <div class="topbar">
        <div>
          <h1 id="page-title">Dashboard</h1>
          <div class="crumb" id="page-crumb"></div>
        </div>
        <div class="top-actions">
          <button class="icon-btn theme-toggle" onclick="toggleTheme()">☀️</button>
          <button class="icon-btn" id="bell">🔔<span class="badge-count" id="bell-count" style="display:none">0</span></button>
          <button class="icon-btn" id="menu-btn" style="display:none">☰</button>
        </div>
      </div>
      <div id="view"></div>
    </main>
  </div>`;
}

function studentNav(path) {
  const links = [
    ["app", "🏠", "Dashboard"],
    ["app/chat", "🤖", "Ask AI"],
    ["app/notices", "📢", "Notices"],
    ["app/knowledge", "📚", "Documents"],
    ["app/timetable", "🗓️", "Timetable"],
    ["app/events", "🎉", "Events"],
    ["app/placements", "💼", "Placements"],
    ["app/faculty", "👩‍🏫", "Faculty"],
    ["app/courses", "📖", "Courses"],
    ["app/gallery", "🖼️", "Gallery"],
    ["app/history", "🕘", "Chat History"],
  ];
  return `<div class="side-section-label">Student</div>` + links.map(([r, i, l]) => `<button class="side-link ${path === r ? "active" : ""}" data-route="${r}" onclick="location.hash='#/${r}'"><span class="icon">${i}</span>${l}</button>`).join("")
    + `<div class="side-section-label">Account</div><button class="side-link ${path === "app/profile" ? "active" : ""}" data-route="app/profile" onclick="location.hash='#/app/profile'"><span class="icon">👤</span>My Profile</button>`;
}

function adminNav(path) {
  const groups = [
    ["Admin", [["admin", "📊", "Dashboard"], ["admin/analytics", "📈", "Analytics"]]],
    ["Manage", [
      ["admin/students", "🎓", "Students"],
      ["admin/faculty", "👩‍🏫", "Faculty"],
      ["admin/departments", "🏛️", "Departments"],
      ["admin/courses", "📖", "Courses"],
      ["admin/timetable", "🗓️", "Timetable"],
    ]],
    ["Content", [
      ["admin/notices", "📢", "Notices"],
      ["admin/events", "🎉", "Events"],
      ["admin/placements", "💼", "Placements"],
      ["admin/gallery", "🖼️", "Gallery"],
      ["admin/knowledge", "📚", "Knowledge Base"],
    ]],
    ["System", [
      ["admin/feedback", "💬", "Feedback"],
      ["admin/notifications", "🔔", "Notifications"],
      ["admin/settings", "⚙️", "Settings"],
    ]],
  ];
  return groups.map(([label, items]) =>
    `<div class="side-section-label">${label}</div>` +
    items.map(([r, i, l]) => `<button class="side-link ${path === r ? "active" : ""}" data-route="${r}" onclick="location.hash='#/${r}'"><span class="icon">${i}</span>${l}</button>`).join("")
  ).join("");
}

function setTitle(title, crumb = "") {
  $("#page-title").textContent = title;
  $("#page-crumb").textContent = crumb;
}

function renderView(html) { $("#view").innerHTML = html; }
const v = renderView;

/* ---------------- Student dashboard ---------------- */
function renderApp() {
  setTitle("Student Dashboard", "Overview of your campus life");
  const load = async () => {
    fieldVal(`<div class="stats-grid">${Array(4).fill('<div class="stat-card"><div class="skeleton" style="height:60px"></div></div>').join("")}</div>`);
    const [profile, notices, events, placements, faculty, courses, gallery, timetable, docs] = await Promise.all([
      api("/auth/me"),
      api("/notices?page=1&page_size=3"),
      api("/events?page=1&page_size=3&upcoming_only=true"),
      api("/placements?page=1&page_size=3&upcoming_only=true"),
      api("/faculty/public"),
      api("/courses/public"),
      api("/gallery?page=1&page_size=4"),
      api("/timetable/my"),
      api("/knowledge?page=1&page_size=3"),
    ]);
    v(`
      <div class="grid-3">
        <div class="stat-card"><span class="icon">🤖</span><div class="value">${(await api("/chat/sessions")).items.length}</div><div class="label">Chat Sessions</div></div>
        <div class="stat-card"><span class="icon">📢</span><div class="value">${notices.total}</div><div class="label">Notices</div></div>
        <div class="stat-card"><span class="icon">🎉</span><div class="value">${events.total}</div><div class="label">Upcoming Events</div></div>
      </div>
      <div class="grid-2">
        <div class="panel">
          <div class="panel-head"><h2>🤖 Ask CollegeAI</h2><button class="btn btn-primary btn-sm" onclick="location.hash='#/app/chat'">Open Chat</button></div>
          <p style="color:var(--text-2);font-size:14px;line-height:1.7">Your personal assistant knows the prospectus, syllabus, exam schedule, fees, hostel rules and more. Ask anything — it answers only from official documents.</p>
          <div style="display:flex;gap:10px;margin-top:16px">
            <input class="input" id="quick-q" placeholder="e.g. When are the semester exams?" style="flex:1">
            <button class="btn btn-primary" id="quick-go">Ask</button>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>📋 My Timetable</h2><button class="btn btn-sm" onclick="location.hash='#/app/timetable'">View all</button></div>
          ${timetable.items.length ? renderTimetableTable(timetable.items[0]) : `<div class="empty"><div class="emoji">🗓️</div>No timetable published for your department yet.</div>`}
        </div>
      </div>
      <div class="grid-2">
        <div class="panel">
          <div class="panel-head"><h2>📢 Latest Notices</h2><button class="btn btn-sm" onclick="location.hash='#/app/notices'">All notices</button></div>
          ${noticeList(notices.items)}
        </div>
        <div class="panel">
          <div class="panel-head"><h2>💼 Upcoming Placements</h2><button class="btn btn-sm" onclick="location.hash='#/app/placements'">All drives</button></div>
          ${placementList(placements.items)}
        </div>
      </div>
      <div class="grid-2">
        <div class="panel">
          <div class="panel-head"><h2>🎉 Upcoming Events</h2><button class="btn btn-sm" onclick="location.hash='#/app/events'">All events</button></div>
          ${eventList(events.items)}
        </div>
        <div class="panel">
          <div class="panel-head"><h2>🖼️ Gallery Preview</h2><button class="btn btn-sm" onclick="location.hash='#/app/gallery'">Open gallery</button></div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
            ${gallery.items.slice(0, 4).map((g) => `<img loading="lazy" src="${esc(g.url)}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;border:1px solid var(--border)" onerror="this.outerHTML='<div class=empty style=\'padding:20px\'>🖼️</div>'">`).join("")}
          </div>
        </div>
      </div>
      <div class="grid-2">
        <div class="panel">
          <div class="panel-head"><h2>📚 Documents</h2><button class="btn btn-sm" onclick="location.hash='#/app/knowledge'">Browse library</button></div>
          ${docList(docs.items)}
        </div>
        <div class="panel">
          <div class="panel-head"><h2>👩‍🏫 Faculty</h2><button class="btn btn-sm" onclick="location.hash='#/app/faculty'">All faculty</button></div>
          <div style="display:flex;flex-wrap:wrap;gap:12px">
            ${faculty.items.slice(0, 6).map((f) => `
              <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:12px;background:var(--input-bg);border:1px solid var(--border)">
                <span class="avatar">${f.photo_url ? `<img src="${esc(f.photo_url)}" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover">` : esc(initials(f.name))}</span>
                <div><div style="font-weight:600;font-size:13px">${esc(f.name)}</div><div style="font-size:12px;color:var(--text-3)">${esc(f.designation)}</div></div>
              </div>`).join("")}
          </div>
        </div>
      </div>
    `);
    $("#quick-go").addEventListener("click", () => {
      const q = $("#quick-q")?.value.trim();
      if (q) { localStorage.setItem("cai_quick_question", q); location.hash = "#/app/chat"; }
    });
  };
  load().catch((e) => { fieldVal(`<div class="empty"><div class="emoji">⚠️</div>${esc(e.message)}</div>`); });
}

/* ---------------- Shared list renderers ---------------- */
function noticeList(items) {
  if (!items.length) return `<div class="empty"><div class="emoji">📭</div>No notices yet</div>`;
  return items.map((n) => `
    <div style="padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${n.pinned ? '<span class="tag red">📌 Pinned</span>' : ""}
        ${n.priority === "urgent" ? '<span class="tag red">Urgent</span>' : n.priority === "important" ? '<span class="tag amber">Important</span>' : ""}
        <b style="font-size:14px">${esc(n.title)}</b>
      </div>
      <p style="color:var(--text-2);font-size:13px;margin-top:5px">${esc(n.content).slice(0, 140)}${n.content.length > 140 ? "…" : ""}</p>
      <div style="font-size:11px;color:var(--text-3);margin-top:5px">${fmtDate(n.created_at)}</div>
    </div>`).join("");
}

function placementList(items) {
  if (!items.length) return `<div class="empty"><div class="emoji">💼</div>No drives scheduled yet</div>`;
  return items.map((p) => `
    <div style="padding:12px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;gap:10px;align-items:center">
      <div><b style="font-size:14px">${esc(p.company)}</b><div style="font-size:12px;color:var(--text-3)">${esc(p.role || "Open role")} · ${esc(p.package || "Package TBD")}</div></div>
      <div style="text-align:right"><span class="tag blue">${fmtDate(p.drive_date)}</span></div>
    </div>`).join("");
}

function eventList(items) {
  if (!items.length) return `<div class="empty"><div class="emoji">🎉</div>No events yet</div>`;
  return items.map((ev) => `
    <div style="padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
        <b style="font-size:14px">${esc(ev.title)}</b>
        <span class="countdown" data-date="${ev.date}">${countdown(ev.date)}</span>
      </div>
      <div style="font-size:12px;color:var(--text-3);margin-top:4px">${esc(ev.venue || "")} · ${fmtDate(ev.date)}</div>
    </div>`).join("");
}

function docList(items) {
  if (!items.length) return `<div class="empty"><div class="emoji">📚</div>No documents uploaded yet</div>`;
  return items.map((d) => `
    <div style="padding:12px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div style="display:flex;gap:10px;align-items:center;min-width:0">
        <span style="font-size:22px">📄</span>
        <div style="min-width:0"><div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.title)}</div><div style="font-size:11px;color:var(--text-3)">${esc(d.doc_type)} · ${d.chunk_count} chunks</div></div>
      </div>
      <a class="btn btn-sm" href="${esc(d.url)}" target="_blank">Download</a>
    </div>`).join("");
}

function countdown(dateStr) {
  if (!dateStr) return "";
  const target = new Date(dateStr); const now = new Date();
  if (isNaN(target)) return "";
  if (target < now) return "Ended";
  const days = Math.ceil((target - now) / 86400000);
  return days <= 1 ? "Today 🎯" : `${days}d left`;
}
setInterval(() => $$(".countdown").forEach((e) => (e.textContent = countdown(e.dataset.date))), 60000);

function pagination(meta, handlerName, ...fixed) {
  const pages = [];
  for (let p = 1; p <= meta.pages; p++) {
    if (meta.pages > 7 && p > 2 && p < meta.pages - 1 && Math.abs(p - meta.page) > 1) {
      if (pages[pages.length - 1] !== "…") pages.push("…");
      continue;
    }
    pages.push(p);
  }
  const go = (p) => `${handlerName}(${fixed.map((f) => `'${f}'`).join(", ")}${fixed.length ? ", " : ""}${p})`;
  return `
    <div class="pagination">
      <button class="page-btn" ${meta.page <= 1 ? "disabled" : ""} onclick="${go(meta.page - 1)}">←</button>
      ${pages.map((p) => p === "…" ? `<span style="color:var(--text-3)">…</span>` : `<button class="page-btn ${p === meta.page ? "active" : ""}" onclick="${go(p)}">${p}</button>`).join("")}
      <button class="page-btn" ${meta.page >= meta.pages ? "disabled" : ""} onclick="${go(meta.page + 1)}">→</button>
    </div>
    <div class="page-info">Showing ${meta.total} records</div>`;
}

/* ---------------- Student list pages ---------------- */
async function renderListPage(kind) {
  const meta = { title: "", crumb: "", render: null };
  const load = async (page = 1, search = "") => {
    let data;
    switch (kind) {
      case "notices": data = await api(`/notices?page=${page}&page_size=9&search=${encodeURIComponent(search)}`); break;
      case "knowledge": data = await api(`/knowledge?page=${page}&page_size=9&search=${encodeURIComponent(search)}`); break;
      case "timetable": data = await api(`/timetable/my`); break;
      case "events": data = await api(`/events?page=${page}&page_size=9&search=${encodeURIComponent(search)}`); break;
      case "placements": data = await api(`/placements?page=${page}&page_size=9&search=${encodeURIComponent(search)}`); break;
      case "faculty": data = await api(`/faculty?page=${page}&page_size=9&search=${encodeURIComponent(search)}`); break;
      case "courses": data = await api(`/courses?page=${page}&page_size=9&search=${encodeURIComponent(search)}`); break;
      case "gallery": data = await api(`/gallery?page=${page}&page_size=12`); break;
    }
    render(kind, data, page);
  };

  const render = (kind, data, page) => {
    let body;
    if (kind === "notices") body = noticeCards(data);
    else if (kind === "knowledge") body = data.items.map((d) => `
      <div class="item-card">
        <div class="thumb">📄</div>
        <div class="body">
          <div class="title">${esc(d.title)}</div>
          <div class="meta-row"><span class="tag">${esc(d.doc_type)}</span><span>${d.chunk_count} chunks</span></div>
          <div class="desc">${esc(d.description || "College knowledge document")}</div>
          <div class="foot"><a class="btn btn-sm btn-primary" href="${esc(d.url)}" target="_blank">⬇ Download PDF</a></div>
        </div>
      </div>`).join("");
    else if (kind === "timetable") {
      body = data.items.length
        ? `<div class="panel">${data.items.map(renderTimetableTable).join("<div style='height:24px'></div>")}</div>`
        : `<div class="empty"><div class="emoji">🗓️</div>No timetable published yet.</div>`;
    } else if (kind === "events") body = data.items.map((ev) => `
      <div class="item-card">
        <div class="thumb" style="background:var(--gradient-soft)">🎉</div>
        <div class="body">
          <div class="title">${esc(ev.title)}</div>
          <div class="meta-row"><span class="tag">${esc(ev.category)}</span><span class="countdown" data-date="${ev.date}">${countdown(ev.date)}</span></div>
          <div class="desc">${esc(ev.description || "No description")}</div>
          <div class="meta-row">📅 ${fmtDate(ev.date)}${ev.venue ? ` · 📍 ${esc(ev.venue)}` : ""}</div>
          <div class="foot">${ev.registration_link ? `<a class="btn btn-sm btn-primary" href="${esc(ev.registration_link)}" target="_blank">Register</a>` : `<span class="tag blue">Open event</span>`}</div>
        </div>
      </div>`).join("");
    else if (kind === "placements") body = data.items.map((p) => `
      <div class="item-card">
        <div class="thumb" style="background:var(--gradient-soft)">💼</div>
        <div class="body">
          <div class="title">${esc(p.company)}</div>
          <div class="meta-row"><span class="tag blue">${esc(p.role || "Open role")}</span><span class="tag green">${esc(p.package || "TBD")}</span></div>
          <div class="meta-row">📅 Drive: ${fmtDate(p.drive_date)} · <span class="${p.status === "upcoming" ? "tag amber" : "tag green"}">${esc(p.status)}</span></div>
          <div class="desc">${esc(p.eligibility || "Eligibility: all departments")}</div>
          <div class="foot">
            ${p.registration_link ? `<a class="btn btn-sm btn-primary" href="${esc(p.registration_link)}" target="_blank">Apply</a>` : ""}
            <button class="btn btn-sm" onclick="showPlacementDetail(${JSON.stringify(p).replace(/"/g, "&quot;")})">Details</button>
          </div>
        </div>
      </div>`).join("");
    else if (kind === "faculty") body = data.items.map((f) => `
      <div class="item-card">
        <div class="thumb" style="background:var(--card)"><span class="avatar" style="width:70px;height:70px;font-size:24px">${f.photo_url ? `<img src="${esc(f.photo_url)}" style="width:70px;height:70px;border-radius:50%;object-fit:cover">` : esc(initials(f.name))}</span></div>
        <div class="body">
          <div class="title">${esc(f.name)}</div>
          <div class="meta-row"><span class="tag">${esc(f.designation)}</span><span>${esc(f.department || "")}</span></div>
          <div class="desc">${esc(f.qualification || "")}${f.experience_years ? ` · ${f.experience_years}y experience` : ""}</div>
          <div class="foot">${f.email ? `<span class="cell-sub">✉️ ${esc(f.email)}</span>` : ""}</div>
        </div>
      </div>`).join("");
    else if (kind === "courses") body = data.items.map((c) => `
      <div class="item-card">
        <div class="thumb" style="background:var(--gradient-soft)">📖</div>
        <div class="body">
          <div class="title">${esc(c.name)} <span class="tag" style="margin-left:6px">${esc(c.code)}</span></div>
          <div class="meta-row"><span>${esc(c.department || "")}</span><span>${c.semesters} semesters</span><span>${c.credits} credits</span></div>
          <div class="desc">${esc(c.description || "No description")}</div>
          <div class="foot"><button class="btn btn-sm btn-primary" onclick="showCourseDetail(${JSON.stringify(c).replace(/"/g, "&quot;")})">Subjects</button></div>
        </div>
      </div>`).join("");
    else if (kind === "gallery") body = data.items.map((g) => `
      <div class="item-card" onclick="${g.media_type === "video" ? `window.open('${esc(g.url)}')` : `openLightbox('${esc(g.url)}')`}" style="cursor:pointer">
        <div class="thumb">${g.media_type === "video" ? `<span style="font-size:34px">▶️</span>` : `<img loading="lazy" src="${esc(g.url)}" alt="${esc(g.title)}">`}</div>
        <div class="body"><div class="title">${esc(g.title)}</div><div class="meta-row">${esc(g.album || "Campus")} · ${fmtDate(g.created_at)}</div></div>
      </div>`).join("");

    v(`
      <div class="search-bar" style="margin-bottom:20px">
        <input class="input" id="list-search" placeholder="Search…" value="${esc(search)}" onkeydown="if(event.key==='Enter')renderListPage('${kind}', 1)">
      </div>
      <div class="card-grid">${body || `<div class="empty" style="grid-column:1/-1"><div class="emoji">📭</div>Nothing found</div>`}</div>
      ${data.pages > 1 ? pagination(data, "renderListPage", kind) : ""}
    `);
  };

  const titles = { notices: "Notices", knowledge: "Documents", timetable: "Timetable", events: "Events", placements: "Placements", faculty: "Faculty", courses: "Courses", gallery: "Gallery" };
  setTitle(titles[kind], "Browse and explore");
  fieldVal(`<div class="skeleton" style="height:120px"></div><div class="skeleton" style="height:300px;margin-top:16px"></div>`);
  load(1, "");
  window.renderListPage = (k, page) => {
    S.listSearch = $("#list-search")?.value || "";
    load(page, S.listSearch || "");
  };
  if (kind === "gallery") openLightbox = (url) => {
    openModal(`<h3>Preview</h3><div style="margin-top:14px"><img src="${esc(url)}" style="width:100%;border-radius:12px" alt="preview"></div><div class="modal-actions"><a class="btn btn-primary" href="${esc(url)}" target="_blank">Open</a><button class="btn" onclick="closeModal()">Close</button></div>`);
  };
}

function renderTimetableTable(tt) {
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const entries = tt.entries || [];
  return `
    <div style="margin-bottom:10px"><b>${esc(tt.title)}</b> <span class="tag" style="margin-left:8px">Semester ${tt.semester}</span></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Day</th>${days.map((_, i) => `<th>P${i + 1}</th>`).join("")}</tr></thead>
      <tbody>${days.map((day) => `
        <tr><td class="cell-main" style="text-transform:capitalize">${day}</td>
        ${[1, 2, 3, 4, 5, 6, 7, 8].map((period) => {
          const e = entries.find((x) => x.day === day && x.period === period);
          return e ? `<td><div class="cell-main">${esc(e.subject)}</div><div class="cell-sub">${esc(e.time)}${e.room ? ` · ${esc(e.room)}` : ""}</div></td>` : `<td class="cell-sub">—</td>`;
        }).join("")}
        </tr>`).join("")}
      </tbody>
    </table></div>
    <button class="btn btn-sm" style="margin-top:12px" onclick="printTimetable('${esc(tt.title)}')">🖨️ Download / Print</button>`;
}

function printTimetable(title) {
  const win = window.open("", "_blank");
  win.document.write(`<html><head><title>${esc(title)}</title><style>body{font-family:sans-serif;padding:30px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #333;padding:8px}</style></head><body><h2>${esc(title)}</h2>${$("#view table")?.outerHTML || ""}<script>window.print()<\/script></body></html>`);
  win.document.close();
}

window.showCourseDetail = (c) => openModal(`
  <h3>${esc(c.name)}</h3><p class="sub">${esc(c.code)} · ${esc(c.department || "")} · ${c.semesters} semesters · ${c.credits} credits</p>
  <div style="display:flex;flex-direction:column;gap:8px;max-height:50vh;overflow-y:auto">
    ${(c.subjects || []).map((s) => `
      <div style="display:flex;justify-content:space-between;gap:10px;padding:10px 14px;background:var(--input-bg);border:1px solid var(--border);border-radius:10px">
        <div><b>${esc(s.name)}</b><div class="cell-sub">${esc(s.code || "")}</div></div>
        <div class="tag">Sem ${s.semester} · ${s.credits} cr</div>
      </div>`).join("") || '<div class="empty">No subjects listed</div>'}
  </div>
  <div class="modal-actions"><button class="btn" onclick="closeModal()">Close</button></div>`);

window.showPlacementDetail = (p) => openModal(`
  <h3>${esc(p.company)}</h3><p class="sub">${esc(p.role || "Open role")} · ${esc(p.package || "TBD")} · ${fmtDate(p.drive_date)}</p>
  <div style="display:flex;flex-direction:column;gap:12px;font-size:14px">
    ${p.eligibility ? `<div><b>Eligibility</b><p style="color:var(--text-2)">${esc(p.eligibility)}</p></div>` : ""}
    ${p.selection_process ? `<div><b>Selection process</b><p style="color:var(--text-2)">${esc(p.selection_process)}</p></div>` : ""}
    ${p.interview_tips ? `<div><b>Interview tips</b><p style="color:var(--text-2)">${esc(p.interview_tips)}</p></div>` : ""}
    ${(p.branches_eligible || []).length ? `<div><b>Eligible branches</b><div>${p.branches_eligible.map((b) => `<span class="tag" style="margin:3px">${esc(b)}</span>`).join("")}</div></div>` : ""}
  </div>
  <div class="modal-actions">
    ${p.registration_link ? `<a class="btn btn-primary" href="${esc(p.registration_link)}" target="_blank">Apply Now</a>` : ""}
    <button class="btn" onclick="closeModal()">Close</button>
  </div>`);

window.openLightbox = null;
function noticeCards(data) {
  return data.items.map((n) => `
    <div class="item-card">
      <div class="thumb">${n.attachment_type === "image" && n.attachment_url ? `<img loading="lazy" src="${esc(n.attachment_url)}">` : n.attachment_type === "video" ? `<span>🎥</span>` : `<span>📢</span>`}</div>
      <div class="body">
        <div class="title">${esc(n.title)}</div>
        <div class="meta-row">
          ${n.pinned ? '<span class="tag red">📌 Pinned</span>' : ""}
          ${n.priority === "urgent" ? '<span class="tag red">Urgent</span>' : n.priority === "important" ? '<span class="tag amber">Important</span>' : '<span class="tag blue">Normal</span>'}
        </div>
        <div class="desc">${esc(n.content)}</div>
        <div class="meta-row">${fmtDate(n.created_at)}</div>
        <div class="foot">
          ${n.attachment_url && n.attachment_type === "pdf" ? `<a class="btn btn-sm btn-primary" href="${esc(n.attachment_url)}" target="_blank">⬇ Download PDF</a>` : ""}
          ${n.attachment_url && n.attachment_type !== "pdf" ? `<a class="btn btn-sm" href="${esc(n.attachment_url)}" target="_blank">Open attachment</a>` : ""}
        </div>
      </div>
    </div>`).join("");
}

/* ---------------- Chat ---------------- */
async function renderChat() {
  setTitle("Ask AI", "Answers only from official college documents");
  fieldVal(`<div class="chat-layout">
      <div class="chat-sessions glass" id="session-list">
        <div class="panel-head"><h2 style="font-size:14px">Sessions</h2><button class="btn btn-sm btn-primary" onclick="newChat()">＋ New</button></div>
        <div id="sessions-box"><div class="skeleton" style="height:40px"></div><div class="skeleton" style="height:40px;margin-top:8px"></div></div>
      </div>
      <div class="chat-main glass">
        <div class="chat-messages" id="messages">
          <div class="empty"><div class="emoji">🤖</div><b>Hi, I'm CollegeAI!</b><p style="margin-top:8px">Ask me about exams, fees, rules, syllabus, events and more.<br>I only answer from official college documents.</p></div>
        </div>
        <div class="chat-tools">
          <button class="tool active" data-lang="en" onclick="setLang('en',this)">🇬🇧 EN</button>
          <button class="tool" data-lang="hi" onclick="setLang('hi',this)">🇮🇳 HI</button>
          <button class="tool" data-lang="te" onclick="setLang('te',this)">🇮🇳 TE</button>
          <button class="tool" data-lang="ta" onclick="setLang('ta',this)">🇮🇳 TA</button>
          <span style="flex:1"></span>
          <button class="tool" onclick="exportChat()">⬇ Export</button>
        </div>
        <div class="chat-input-bar">
          <textarea id="chat-input" rows="1" placeholder="Type your question… (Enter to send, Shift+Enter for newline)" onkeydown="chatKey(event)"></textarea>
          <button class="btn btn-primary" onclick="sendChat()">Send ➤</button>
        </div>
      </div>
    </div>`);

  loadSessions();
  const quick = localStorage.getItem("cai_quick_question");
  if (quick) { localStorage.removeItem("cai_quick_question"); setTimeout(() => { $("#chat-input").value = quick; sendChat(); }, 600); }
}

window.newChat = () => {
  S.chat = { session: null, sessions: S.chat.sessions || [], messages: [], busy: false, lang: S.chat.lang || "en" };
  $("#messages").innerHTML = `<div class="empty"><div class="emoji">🤖</div><b>Hi, I'm CollegeAI!</b><p style="margin-top:8px">Ask me anything about your college.</p></div>`;
  $$("#session-list .chat-session").forEach((s) => s.classList.remove("active"));
};

window.exportChat = async () => {
  try {
    const data = await api("/chat/export");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "collegeai-chat-history.json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("History exported", "success");
  } catch (e) { toast(e.message, "error"); }
};

window.setLang = (lang, el) => {
  S.chat.lang = lang;
  $$(".chat-tools .tool").forEach((t) => t.classList.toggle("active", t.dataset.lang === lang));
};

async function loadSessions() {
  try {
    const data = await api("/chat/sessions");
    S.chat.sessions = data.items;
    $("#sessions-box").innerHTML = data.items.length
      ? data.items.map((s) => `<button class="chat-session" data-id="${s.id}" onclick="openSession('${s.id}')"><span>💬</span><span class="t">${esc(s.title)}</span></button>`).join("")
      : `<div class="empty" style="padding:24px">Start a new chat</div>`;
  } catch (e) { toast(e.message, "error"); }
}

window.openSession = async (id) => {
  try {
    const data = await api(`/chat/sessions/${id}/messages?limit=100`);
    S.chat.session = id;
    S.chat.messages = data.items;
    $$("#session-list .chat-session").forEach((s) => s.classList.toggle("active", s.dataset.id === id));
    renderMessages(data.items);
  } catch (e) { toast(e.message, "error"); }
};

function renderMessages(messages) {
  const box = $("#messages");
  box.innerHTML = messages.length
    ? messages.map((m) => `
        <div class="msg user"><span class="avatar">${esc(initials(S.user?.name))}</span><div class="content">${esc(m.question)}<div class="time">${fmtDate(m.created_at)} ${fmtTime(m.created_at)}</div></div></div>
        <div class="msg bot"><span class="avatar" style="background:var(--gradient)">🤖</span><div class="content"><div class="markdown">${md(m.answer)}</div>${sourcesHtml(m.sources)}<div class="time">${m.response_time_ms} ms</div></div></div>`).join("")
    : `<div class="empty"><div class="emoji">💬</div>No messages yet — ask something!</div>`;
  box.scrollTop = box.scrollHeight;
}

function sourcesHtml(sources) {
  if (!sources || !sources.length) return "";
  return `<div class="sources">${sources.map((s) => `<div class="source">📄 ${esc(s.title)}</div>`).join("")}</div>`;
}

window.chatKey = (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
  else setTimeout(() => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }, 0);
};

window.sendChat = async () => {
  const input = $("#chat-input");
  const message = (input?.value || "").trim();
  if (!message || S.chat.busy) return;
  S.chat.busy = true;

  const box = $("#messages");
  const empty = box.querySelector(".empty");
  if (empty) box.innerHTML = "";

  box.insertAdjacentHTML("beforeend", `<div class="msg user"><span class="avatar">${esc(initials(S.user?.name))}</span><div class="content">${esc(message)}</div></div>`);
  box.insertAdjacentHTML("beforeend", `<div class="msg bot" id="typing-msg"><span class="avatar" style="background:var(--gradient)">🤖</span><div class="content"><span class="typing"><span></span><span></span><span></span></span></div></div>`);
  box.scrollTop = box.scrollHeight;
  input.value = "";

  try {
    const data = await api("/chat", { method: "POST", body: { message, session_id: S.chat.session, language: S.chat.lang || "en" } });
    S.chat.session = data.session_id;
    $("#typing-msg").outerHTML = `<div class="msg bot"><span class="avatar" style="background:var(--gradient)">🤖</span><div class="content"><div class="markdown">${md(data.answer)}</div>${sourcesHtml(data.sources)}<div class="time">${data.response_time_ms} ms</div></div></div>`;
    box.scrollTop = box.scrollHeight;
    loadSessions();
  } catch (e) {
    $("#typing-msg")?.remove();
    toast(e.message, "error");
  } finally {
    S.chat.busy = false;
  }
};

/* ---------------- Chat history page ---------------- */
async function renderHistory() {
  setTitle("Chat History", "Every conversation is saved");
  fieldVal(`
    <div class="panel">
      <div class="panel-head">
        <h2>History & sessions</h2>
        <div style="display:flex;gap:10px">
          <input class="input" id="hist-search" placeholder="Search messages…" style="max-width:260px" onkeydown="if(event.key==='Enter')loadHistory(1)">
          <button class="btn btn-sm btn-primary" onclick="loadHistory(1)">Search</button>
        </div>
      </div>
      <div id="hist-box"><div class="skeleton" style="height:200px"></div></div>
    </div>`);
  loadHistory(1);
}

async function loadHistory(page = 1) {
  try {
    const q = $("#hist-search")?.value || "";
    const data = await api(`/chat/history?q=${encodeURIComponent(q)}&page=${page}&page_size=10`);
    $("#hist-box").innerHTML = data.items.length
      ? `<div class="table-wrap"><table>
        <thead><tr><th>Question</th><th>Answer</th><th>Time</th><th>Latency</th><th></th></tr></thead>
        <tbody>${data.items.map((m) => `
          <tr>
            <td><div class="cell-main">${esc(m.question)}</div><div class="cell-sub">session ${String(m.session_id).slice(0, 8)}</div></td>
            <td class="cell-sub" style="max-width:320px">${esc(m.answer).slice(0, 110)}${m.answer.length > 110 ? "…" : ""}</td>
            <td class="cell-sub">${fmtDate(m.created_at)} ${fmtTime(m.created_at)}</td>
            <td class="cell-sub">${m.response_time_ms} ms</td>
            <td><button class="btn btn-sm btn-danger" onclick="delHistory('${m.id}')">🗑</button></td>
          </tr>`).join("")}
        </tbody></table></div>
        ${data.pages > 1 ? pagination(data, "loadHistory") : ""}`
      : `<div class="empty"><div class="emoji">🗂️</div>No chat history found</div>`;
  } catch (e) { toast(e.message, "error"); }
}

window.delHistory = async (id) => {
  if (!confirm("Delete this message?")) return;
  try { await api(`/chat/history/${id}`, { method: "DELETE" }); toast("Deleted", "success"); loadHistory(); }
  catch (e) { toast(e.message, "error"); }
};

/* ---------------- Profile ---------------- */
async function renderProfile() {
  setTitle("My Profile", "Manage your account");
  let user;
  try { user = await api("/auth/me"); } catch (e) { toast(e.message, "error"); return; }
  v(`
    <div class="grid-2">
      <div class="panel" style="text-align:center">
        <span class="avatar" style="width:90px;height:90px;font-size:32px;margin:0 auto 14px">${user.photo_url ? `<img src="${esc(user.photo_url)}" style="width:90px;height:90px;border-radius:50%;object-fit:cover">` : esc(initials(user.name))}</span>
        <h2 style="font-size:20px">${esc(user.name)}</h2>
        <p class="sub" style="margin-bottom:14px">${esc(user.email)}</p>
        <div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap">
          <span class="tag">${esc(user.department || "No department")}</span>
          <span class="tag blue">Semester ${user.semester ?? "—"}</span>
          <span class="tag green">${esc(user.roll_number || "No roll number")}</span>
        </div>
        <div style="margin-top:18px"><button class="btn btn-sm btn-primary" onclick="document.getElementById('photo-input').click()">📷 Upload Photo</button>
        <input type="file" id="photo-input" accept="image/*" style="display:none" onchange="uploadPhoto(this)"></div>
      </div>
      <div>
        <div class="panel" style="margin-bottom:20px">
          <div class="panel-head"><h2>Edit profile</h2></div>
          <div class="form-row">
            <div class="field"><label>Name</label><input class="input" id="p-name" value="${esc(user.name || "")}"></div>
            <div class="field"><label>Phone</label><input class="input" id="p-phone" value="${esc(user.phone || "")}"></div>
          </div>
          <div class="form-row">
            <div class="field"><label>Roll number</label><input class="input" id="p-roll" value="${esc(user.roll_number || "")}"></div>
            <div class="field"><label>Semester</label><input class="input" id="p-semester" type="number" min="1" max="12" value="${user.semester ?? 1}"></div>
          </div>
          <div class="field"><label>Address</label><input class="input" id="p-address" value="${esc(user.address || "")}"></div>
          <button class="btn btn-primary" onclick="saveProfile()">Save changes</button>
        </div>
        <div class="panel" style="margin-bottom:20px">
          <div class="panel-head"><h2>Security</h2></div>
          <div class="form-row">
            <div class="field"><label>Current password</label><input class="input" id="cp-old" type="password"></div>
            <div class="field"><label>New password</label><input class="input" id="cp-new" type="password"></div>
          </div>
          <button class="btn btn-primary" onclick="changePw()">Change password</button>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Danger zone</h2></div>
          <button class="btn btn-danger" onclick="deleteMyAccount()">Delete my account permanently</button>
        </div>
      </div>
    </div>`);
}

window.uploadPhoto = async (input) => {
  if (!input.files[0]) return;
  const fd = new FormData();
  fd.append("file", input.files[0]);
  try {
    const data = await api("/auth/photo", { method: "POST", body: fd });
    toast("Photo updated ✨", "success");
    const u = await api("/auth/me");
    S.user = u; localStorage.setItem("cai_user", JSON.stringify(u));
    renderProfile();
  } catch (e) { toast(e.message, "error"); }
};

window.saveProfile = async () => {
  try {
    await api("/auth/me", {
      method: "PATCH",
      body: {
        name: $("#p-name").value || null,
        phone: $("#p-phone").value || null,
        roll_number: $("#p-roll").value || null,
        semester: parseInt($("#p-semester").value || "1"),
        address: $("#p-address").value || null,
      },
    });
    toast("Profile updated", "success");
    renderProfile();
  } catch (e) { toast(e.message, "error"); }
};

window.changePw = async () => {
  try {
    await api("/auth/change-password", { method: "POST", body: { old_password: $("#cp-old").value, new_password: $("#cp-new").value } });
    toast("Password changed — you've been logged out of other devices", "success");
  } catch (e) { toast(e.message, "error"); }
};

window.deleteMyAccount = async () => {
  if (!confirm("This permanently deletes your account and all chats. Continue?")) return;
  try {
    await api("/auth/me", { method: "DELETE" });
    toast("Account deleted", "success");
    logout(false);
    location.hash = "#/landing";
  } catch (e) { toast(e.message, "error"); }
};

/* ============================================================
   ADMIN VIEWS
   ============================================================ */

/* ---------------- Admin dashboard ---------------- */
async function renderAdmin() {
  setTitle("Admin Dashboard", "College overview at a glance");
  fieldVal(`<div class="stats-grid">${Array(9).fill('<div class="stat-card"><div class="skeleton" style="height:60px"></div></div>').join("")}</div>`);
  const [stats, activity, analytics] = await Promise.all([
    api("/dashboard/stats"),
    api("/dashboard/activity"),
    api("/dashboard/analytics"),
  ]);
  const cards = [
    ["🎓", stats.students, "Students"],
    ["👩‍🏫", stats.faculty, "Faculty"],
    ["📖", stats.courses, "Courses"],
    ["🏛️", stats.departments, "Departments"],
    ["📄", stats.pdfs, "Knowledge PDFs"],
    ["📢", stats.notices, "Notices"],
    ["💬", stats.chats, "AI Chats"],
    ["🎉", stats.events, "Events"],
    ["💼", stats.placements, "Placements"],
  ];
  v(`
    <div class="stats-grid">${cards.map(([i, v, l], n) => `<div class="stat-card" style="animation-delay:${n * 0.05}s"><span class="icon">${i}</span><div class="value">${v}</div><div class="label">${l}</div></div>`).join("")}</div>
    <div class="grid-2">
      <div class="panel">
        <div class="panel-head"><h2>📈 Chats — last 14 days</h2></div>
        <canvas class="chart" id="chart-chats"></canvas>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>📊 Students by department</h2></div>
        <canvas class="chart" id="chart-depts"></canvas>
      </div>
    </div>
    <div class="grid-2">
      <div class="panel">
        <div class="panel-head"><h2>🕘 Latest activity</h2></div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${activity.items.map((a) => `
            <div style="display:flex;gap:12px;align-items:center;padding:10px 14px;background:var(--input-bg);border:1px solid var(--border);border-radius:12px">
              <span class="tag">${esc(a.type)}</span>
              <div style="flex:1;min-width:0"><div class="cell-main" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.title)}</div></div>
              <div class="cell-sub">${fmtDate(a.created_at)} ${fmtTime(a.created_at)}</div>
            </div>`).join("")}
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>🎯 Notices by priority</h2></div>
        <canvas class="chart" id="chart-priority"></canvas>
        <div class="panel-head" style="margin-top:18px"><h2>🔍 Quick search</h2></div>
        <div style="display:flex;gap:10px">
          <input class="input" id="admin-search" placeholder="Search students, faculty, courses…">
          <button class="btn btn-primary" onclick="adminSearch()">Go</button>
        </div>
        <div id="search-results" style="margin-top:14px"></div>
      </div>
    </div>`);
  requestAnimationFrame(() => {
    drawBarChart($("#chart-chats"), analytics.chats_last_14_days.map((_, i) => i + 1), analytics.chats_last_14_days);
    drawBarChart($("#chart-depts"), analytics.student_by_department.map((d) => d.name), analytics.student_by_department.map((d) => d.students));
    drawDoughnut($("#chart-priority"), analytics.notices_by_priority);
  });
}

window.adminSearch = async () => {
  const q = $("#admin-search").value.trim();
  if (!q) return;
  const results = await api(`/search?q=${encodeURIComponent(q)}`);
  const labels = { students: "🎓 Students", faculty: "👩‍🏫 Faculty", courses: "📖 Courses", departments: "🏛️ Departments", notices: "📢 Notices", events: "🎉 Events", placements: "💼 Placements", knowledge_base: "📚 Documents", gallery: "🖼️ Gallery" };
  $("#search-results").innerHTML = Object.entries(results).map(([key, res]) => res.items.length ? `
    <div style="margin-bottom:12px"><b style="font-size:13px">${labels[key] || key}</b>
      ${res.items.map((item) => `<div style="padding:8px 12px;background:var(--input-bg);border:1px solid var(--border);border-radius:9px;margin-top:6px;font-size:13px">${esc(item.title || item.name || item.company || "")}</div>`).join("")}
    </div>` : "").join("") || `<div class="empty" style="padding:20px">No results for "${esc(q)}"</div>`;
};

/* ---------------- Admin analytics ---------------- */
async function renderAdminAnalytics() {
  setTitle("Analytics", "Charts & insights");
  fieldVal(`<div class="grid-2"><div class="panel"><div class="panel-head"><h2>📈 Students registered — last 14 days</h2></div><canvas class="chart" id="a1"></canvas></div>
     <div class="panel"><div class="panel-head"><h2>📈 AI chats — last 14 days</h2></div><canvas class="chart" id="a2"></canvas></div></div>
     <div class="grid-2"><div class="panel"><div class="panel-head"><h2>🏛️ Students per department</h2></div><canvas class="chart" id="a3"></canvas></div>
     <div class="panel"><div class="panel-head"><h2>🎯 Notices by priority</h2></div><canvas class="chart" id="a4"></canvas></div></div>
     <div class="panel"><div class="panel-head"><h2>💬 Recent AI conversations</h2></div><div id="recent-chats"><div class="skeleton" style="height:120px"></div></div></div>`);
  const a = await api("/dashboard/analytics");
  requestAnimationFrame(() => {
    drawBarChart($("#a1"), a.students_registered_14_days.map((_, i) => i + 1), a.students_registered_14_days, "rgba(16,185,129,.85)");
    drawBarChart($("#a2"), a.chats_last_14_days.map((_, i) => i + 1), a.chats_last_14_days);
    drawBarChart($("#a3"), a.student_by_department.map((d) => d.name), a.student_by_department.map((d) => d.students), "rgba(139,92,246,.85)");
    drawDoughnut($("#a4"), a.notices_by_priority);
  });
  $("#recent-chats").innerHTML = a.recent_chats.length
    ? `<div class="table-wrap"><table><thead><tr><th>Question</th><th>Latency</th><th>When</th></tr></thead><tbody>
       ${a.recent_chats.map((c) => `<tr><td class="cell-main">${esc(c.question)}</td><td class="cell-sub">${c.response_time_ms} ms</td><td class="cell-sub">${fmtDate(c.created_at)} ${fmtTime(c.created_at)}</td></tr>`).join("")}
       </tbody></table></div>`
    : `<div class="empty"><div class="emoji">💬</div>No conversations yet</div>`;
}

/* ---------------- Admin CRUD tables ---------------- */
function adminTableConfig(kind) {
  const conf = {
    students: {
      title: "Students", endpoint: "/students",
      columns: ["Student", "Department", "Sem", "Status", "Actions"],
      row: (s) => `<td style="display:flex;gap:10px;align-items:center"><span class="avatar">${s.photo_url ? `<img src="${esc(s.photo_url)}" style="width:36px;height:36px;border-radius:50%;object-fit:cover">` : esc(initials(s.name))}</span><div><div class="cell-main">${esc(s.name)}</div><div class="cell-sub">${esc(s.email)} · ${esc(s.roll_number || "")}</div></div></td>
        <td>${esc(s.department || "—")}</td><td><span class="tag">${s.semester}</span></td>
        <td>${statusTag(s.status)}</td>
        <td><div class="row-actions"><button class="btn btn-sm" onclick="editStudent('${s.id}')">✏️</button><button class="btn btn-sm btn-danger" onclick="delRow('students','${s.id}')">🗑</button></div></td>`,
      form: `
        <div class="form-row"><div class="field"><label>Name</label><input class="input" id="s-name"></div><div class="field"><label>Email</label><input class="input" id="s-email" type="email"></div></div>
        <div class="form-row"><div class="field"><label>Roll number</label><input class="input" id="s-roll"></div><div class="field"><label>Semester</label><input class="input" id="s-sem" type="number" min="1" max="12"></div></div>
        <div class="form-row"><div class="field"><label>Department</label><select class="select" id="s-dept"></select></div><div class="field"><label>Password (create only)</label><input class="input" id="s-pass" type="password"></div></div>
        <div class="form-row"><div class="field"><label>Phone</label><input class="input" id="s-phone"></div><div class="field"><label>Status</label><select class="select" id="s-status"><option value="active">active</option><option value="inactive">inactive</option><option value="graduated">graduated</option><option value="suspended">suspended</option></select></div></div>`,
    },
    faculty: {
      title: "Faculty", endpoint: "/faculty",
      columns: ["Faculty", "Designation", "Department", "Subjects", "Actions"],
      row: (f) => `<td style="display:flex;gap:10px;align-items:center"><span class="avatar">${f.photo_url ? `<img src="${esc(f.photo_url)}" style="width:36px;height:36px;border-radius:50%;object-fit:cover">` : esc(initials(f.name))}</span><div><div class="cell-main">${esc(f.name)}</div><div class="cell-sub">${esc(f.email || "")}</div></div></td>
        <td>${esc(f.designation)}</td><td>${esc(f.department || "—")}</td>
        <td class="cell-sub">${(f.subjects || []).slice(0, 2).map((s) => `<span class="tag" style="margin:2px">${esc(s)}</span>`).join("")}</td>
        <td><div class="row-actions"><button class="btn btn-sm" onclick="editFaculty('${f.id}')">✏️</button><button class="btn btn-sm btn-danger" onclick="delRow('faculty','${f.id}')">🗑</button></div></td>`,
      form: `
        <div class="form-row"><div class="field"><label>Name</label><input class="input" id="f-name"></div><div class="field"><label>Email</label><input class="input" id="f-email" type="email"></div></div>
        <div class="form-row"><div class="field"><label>Designation</label><input class="input" id="f-desig"></div><div class="field"><label>Department</label><select class="select" id="f-dept"></select></div></div>
        <div class="form-row"><div class="field"><label>Qualification</label><input class="input" id="f-qual"></div><div class="field"><label>Experience (years)</label><input class="input" id="f-exp" type="number" min="0"></div></div>
        <div class="field"><label>Subjects (comma separated)</label><input class="input" id="f-subjects"></div>
        <div class="form-row"><div class="field"><label>Phone</label><input class="input" id="f-phone"></div><div class="field"><label>Office</label><input class="input" id="f-office"></div></div>`,
    },
    departments: {
      title: "Departments", endpoint: "/departments",
      columns: ["Department", "Code", "Head", "Stats", "Actions"],
      row: (d) => `<td><div class="cell-main">${esc(d.name)}</div></td><td><span class="tag">${esc(d.code)}</span></td><td>${esc(d.head_name || "—")}</td><td class="cell-sub">Students: ${d.students_count ?? "—"} · Faculty: ${d.faculty_count ?? "—"} · Courses: ${d.courses_count ?? "—"}</td>
        <td><div class="row-actions"><button class="btn btn-sm" onclick="editDept('${d.id}')">✏️</button><button class="btn btn-sm btn-danger" onclick="delRow('departments','${d.id}')">🗑</button></div></td>`,
      form: `
        <div class="form-row"><div class="field"><label>Name</label><input class="input" id="d-name"></div><div class="field"><label>Code</label><input class="input" id="d-code"></div></div>
        <div class="form-row"><div class="field"><label>Department head</label><input class="input" id="d-head"></div><div class="field"><label>Established year</label><input class="input" id="d-year" type="number"></div></div>
        <div class="field"><label>Description</label><textarea class="textarea" id="d-desc"></textarea></div>`,
    },
    courses: {
      title: "Courses", endpoint: "/courses",
      columns: ["Course", "Code", "Department", "Semesters", "Credits", "Actions"],
      row: (c) => `<td><div class="cell-main">${esc(c.name)}</div></td><td><span class="tag">${esc(c.code)}</span></td><td>${esc(c.department || "—")}</td><td>${c.semesters}</td><td>${c.credits}</td>
        <td><div class="row-actions"><button class="btn btn-sm" onclick="editCourse('${c.id}')">✏️</button><button class="btn btn-sm btn-danger" onclick="delRow('courses','${c.id}')">🗑</button></div></td>`,
      form: `
        <div class="form-row"><div class="field"><label>Name</label><input class="input" id="c-name"></div><div class="field"><label>Code</label><input class="input" id="c-code"></div></div>
        <div class="form-row"><div class="field"><label>Department</label><select class="select" id="c-dept"></select></div><div class="field"><label>Total credits</label><input class="input" id="c-credits" type="number"></div></div>
        <div class="field"><label>Number of semesters</label><input class="input" id="c-sems" type="number" min="1" max="12"></div>
        <div class="field"><label>Subjects (JSON, optional)</label><textarea class="textarea" id="c-subjects" placeholder='[{"name":"Maths","credits":4,"semester":1}]'></textarea></div>`,
    },
    notices: {
      title: "Notices", endpoint: "/notices",
      columns: ["Notice", "Priority", "Pinned", "Posted", "Actions"],
      row: (n) => `<td><div class="cell-main">${esc(n.title)}</div><div class="cell-sub">${esc(n.content).slice(0, 80)}…</div></td>
        <td>${n.priority === "urgent" ? '<span class="tag red">Urgent</span>' : n.priority === "important" ? '<span class="tag amber">Important</span>' : '<span class="tag blue">Normal</span>'}</td>
        <td>${n.pinned ? "📌" : "—"}</td><td class="cell-sub">${fmtDate(n.created_at)}</td>
        <td><div class="row-actions"><button class="btn btn-sm" onclick="editNotice('${n.id}')">✏️</button><button class="btn btn-sm btn-danger" onclick="delRow('notices','${n.id}')">🗑</button></div></td>`,
      form: `
        <div class="field"><label>Title</label><input class="input" id="n-title"></div>
        <div class="form-row"><div class="field"><label>Priority</label><select class="select" id="n-priority"><option value="normal">normal</option><option value="important">important</option><option value="urgent">urgent</option></select></div>
        <div class="field"><label>Category</label><input class="input" id="n-category"></div></div>
        <div class="field"><label>Content</label><textarea class="textarea" id="n-content"></textarea></div>
        <div class="form-row"><div class="field"><label>Expires at (YYYY-MM-DD, optional)</label><input class="input" id="n-expires" type="date"></div>
        <div class="field"><label>Attachment URL (optional)</label><input class="input" id="n-attach"></div></div>
        <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="n-pinned"> Pin this notice</label>`,
    },
    events: {
      title: "Events", endpoint: "/events",
      columns: ["Event", "Category", "Date", "Venue", "Actions"],
      row: (e) => `<td><div class="cell-main">${esc(e.title)}</div></td><td><span class="tag">${esc(e.category)}</span></td><td>${fmtDate(e.date)}</td><td class="cell-sub">${esc(e.venue || "—")}</td>
        <td><div class="row-actions"><button class="btn btn-sm" onclick="editEvent('${e.id}')">✏️</button><button class="btn btn-sm btn-danger" onclick="delRow('events','${e.id}')">🗑</button></div></td>`,
      form: `
        <div class="field"><label>Title</label><input class="input" id="e-title"></div>
        <div class="form-row"><div class="field"><label>Category</label><select class="select" id="e-category"><option>workshop</option><option>seminar</option><option>hackathon</option><option>sports</option><option>cultural</option><option>other</option></select></div>
        <div class="field"><label>Date</label><input class="input" id="e-date" type="date"></div></div>
        <div class="form-row"><div class="field"><label>Venue</label><input class="input" id="e-venue"></div><div class="field"><label>Organizer</label><input class="input" id="e-organizer"></div></div>
        <div class="field"><label>Registration link</label><input class="input" id="e-reg"></div>
        <div class="field"><label>Description</label><textarea class="textarea" id="e-desc"></textarea></div>`,
    },
    placements: {
      title: "Placements", endpoint: "/placements",
      columns: ["Company", "Role", "Package", "Drive date", "Status", "Actions"],
      row: (p) => `<td><div class="cell-main">${esc(p.company)}</div></td><td>${esc(p.role || "—")}</td><td class="cell-sub">${esc(p.package || "—")}</td><td>${fmtDate(p.drive_date)}</td>
        <td>${statusTag(p.status)}</td>
        <td><div class="row-actions"><button class="btn btn-sm" onclick="editPlacement('${p.id}')">✏️</button><button class="btn btn-sm btn-danger" onclick="delRow('placements','${p.id}')">🗑</button></div></td>`,
      form: `
        <div class="form-row"><div class="field"><label>Company</label><input class="input" id="pl-company"></div><div class="field"><label>Role</label><input class="input" id="pl-role"></div></div>
        <div class="form-row"><div class="field"><label>Package</label><input class="input" id="pl-package"></div><div class="field"><label>Drive date</label><input class="input" id="pl-date" type="date"></div></div>
        <div class="form-row"><div class="field"><label>Registration link</label><input class="input" id="pl-reg"></div><div class="field"><label>Status</label><select class="select" id="pl-status"><option value="upcoming">upcoming</option><option value="ongoing">ongoing</option><option value="completed">completed</option></select></div></div>
        <div class="field"><label>Eligibility</label><textarea class="textarea" id="pl-elig"></textarea></div>
        <div class="field"><label>Selection process</label><textarea class="textarea" id="pl-process"></textarea></div>
        <div class="field"><label>Interview tips</label><textarea class="textarea" id="pl-tips"></textarea></div>`,
    },
    gallery: {
      title: "Gallery", endpoint: "/gallery",
      columns: ["Media", "Title", "Album", "Type", "Actions"],
      row: (g) => `<td style="width:70px">${g.media_type === "video" ? `<div class="thumb" style="height:46px;width:70px"><span>▶️</span></div>` : `<img loading="lazy" src="${esc(g.url)}" style="width:70px;height:46px;object-fit:cover;border-radius:8px">`}</td>
        <td><div class="cell-main">${esc(g.title)}</div></td><td class="cell-sub">${esc(g.album || "—")}</td><td><span class="tag">${esc(g.media_type)}</span></td>
        <td><div class="row-actions"><button class="btn btn-sm" onclick="editGallery('${g.id}')">✏️</button><button class="btn btn-sm btn-danger" onclick="delRow('gallery','${g.id}')">🗑</button></div></td>`,
      form: `
        <div class="field"><label>Title</label><input class="input" id="g-title"></div>
        <div class="form-row"><div class="field"><label>Type</label><select class="select" id="g-type"><option value="image">image</option><option value="video">video</option></select></div>
        <div class="field"><label>Album</label><input class="input" id="g-album"></div></div>
        <div class="field"><label>Media URL (Cloudinary)</label><input class="input" id="g-url"></div>
        <div class="field"><label>Description</label><textarea class="textarea" id="g-desc"></textarea></div>`,
    },
    knowledge: {
      title: "Knowledge Base", endpoint: "/knowledge",
      columns: ["Document", "Type", "Chunks", "Uploaded", "Actions"],
      row: (k) => `<td><div class="cell-main">📄 ${esc(k.title)}</div></td><td><span class="tag">${esc(k.doc_type)}</span></td><td class="cell-sub">${k.chunk_count}</td><td class="cell-sub">${fmtDate(k.created_at)}</td>
        <td><div class="row-actions"><a class="btn btn-sm" href="${esc(k.url)}" target="_blank">⬇</a><button class="btn btn-sm btn-danger" onclick="delRow('knowledge','${k.id}')">🗑</button></div></td>`,
      form: null,
      upload: true,
    },
    timetable: {
      title: "Timetable", endpoint: "/timetable",
      columns: ["Title", "Department", "Semester", "Periods", "Actions"],
      row: (t) => `<td><div class="cell-main">${esc(t.title)}</div></td><td>${esc(t.department || "—")}</td><td><span class="tag">${t.semester}</span></td><td class="cell-sub">${(t.entries || []).length} slots</td>
        <td><div class="row-actions"><button class="btn btn-sm" onclick="editTimetable('${t.id}')">✏️</button><button class="btn btn-sm btn-danger" onclick="delRow('timetable','${t.id}')">🗑</button></div></td>`,
      form: `
        <div class="form-row"><div class="field"><label>Title</label><input class="input" id="tt-title"></div><div class="field"><label>Department</label><select class="select" id="tt-dept"></select></div></div>
        <div class="field"><label>Semester</label><input class="input" id="tt-sem" type="number" min="1" max="12"></div>
        <div class="field"><label>Entries (JSON array)</label><textarea class="textarea" id="tt-entries" style="min-height:140px" placeholder='[{"day":"monday","period":1,"time":"09:00","subject":"Maths","faculty_name":"Dr. Rao","room":"A101"}]'></textarea></div>`,
    },
    feedback: {
      title: "Feedback", endpoint: "/feedback",
      columns: ["Student", "Rating", "Message", "Status", "Actions"],
      row: (f) => `<td>${esc(f.user_name || "—")}</td><td>${"⭐".repeat(f.rating || 0)}</td><td class="cell-sub" style="max-width:320px">${esc(f.message).slice(0, 100)}</td><td>${statusTag(f.status)}</td>
        <td><button class="btn btn-sm" onclick="setFeedbackStatus('${f.id}')">Update status</button></td>`,
      form: null,
      noCreate: true,
    },
  };
  return conf[kind];
}

function statusTag(status) {
  const map = { active: ["green", "Active"], inactive: ["amber", "Inactive"], graduated: ["blue", "Graduated"], suspended: ["red", "Suspended"], upcoming: ["amber", "Upcoming"], ongoing: ["blue", "Ongoing"], completed: ["green", "Completed"], new: ["blue", "New"], reviewed: ["amber", "Reviewed"], resolved: ["green", "Resolved"] };
  const [cls, label] = map[status] || ["blue", status || "—"];
  return `<span class="tag ${cls}">${label}</span>`;
}

async function renderAdminList(kind) {
  const conf = adminTableConfig(kind);
  setTitle(conf.title, "Full CRUD management");
  v(`
    <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
      <div class="search-bar"><input class="input" id="adm-search" placeholder="Search…" onkeydown="if(event.key==='Enter')loadAdminList('${kind}',1)"></div>
      ${!conf.noCreate ? `<button class="btn btn-primary" onclick="openCreate('${kind}')">＋ New ${conf.title.replace(/\s.*/, "").replace(/s$/, "")}</button>` : ""}
      ${conf.upload ? `<button class="btn btn-primary" onclick="openUpload('${kind}')">📤 Upload PDF</button>` : ""}
    </div>
    <div class="panel"><div id="adm-box"><div class="skeleton" style="height:220px"></div></div></div>`);
  loadAdminList(kind, 1);
}

window.loadAdminList = async (kind, page = 1) => {
  const conf = adminTableConfig(kind);
  const search = $("#adm-search")?.value || "";
  const data = await api(`${conf.endpoint}?page=${page}&page_size=10&search=${encodeURIComponent(search)}`);
  $("#adm-box").innerHTML = data.items.length
    ? `<div class="table-wrap"><table><thead><tr>${conf.columns.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
       <tbody>${data.items.map((item) => `<tr>${conf.row(item)}</tr>`).join("")}</tbody></table></div>
               ${data.pages > 1 ? pagination(data, "loadAdminList", kind) : ""}`
    : `<div class="empty"><div class="emoji">📭</div>Nothing here yet — click the button above to add your first record.</div>`;
};

window.delRow = async (kind, id) => {
  const conf = adminTableConfig(kind);
  if (!confirm("Delete this record permanently?")) return;
  try {
    await api(`${conf.endpoint}/${id}`, { method: "DELETE" });
    toast("Deleted", "success");
    loadAdminList(kind);
  } catch (e) { toast(e.message, "error"); }
};

async function deptOptions(selectId, selected) {
  const d = await api("/departments/public");
  $(`#${selectId}`).innerHTML = `<option value="">— none —</option>` + d.items.map((x) => `<option value="${x.id}" ${x.id === selected ? "selected" : ""}>${esc(x.name)}</option>`).join("");
}

window.openCreate = async (kind) => {
  const conf = adminTableConfig(kind);
  if (!conf.form) return;
  openModal(`<h3>New ${conf.title.replace(/s$/, "")}</h3><p class="sub">Fill the details below</p>${conf.form}<div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveRow('${kind}')">Create</button></div>`, true);
  ["s-dept", "f-dept", "c-dept", "tt-dept"].forEach((id) => { const el = document.getElementById(id); if (el) deptOptions(id); });
};

window.saveRow = async (kind) => {
  const conf = adminTableConfig(kind);
  let body;
  try {
    if (kind === "students") body = { name: fieldVal("s-name"), email: fieldVal("s-email"), password: fieldVal("s-pass") || "Student@123", roll_number: fieldVal("s-roll") || null, semester: parseInt(fieldVal("s-sem") || "1"), department_id: fieldVal("s-dept") || null, phone: fieldVal("s-phone") || null };
    else if (kind === "faculty") body = { name: fieldVal("f-name"), email: fieldVal("f-email"), designation: fieldVal("f-desig"), department_id: fieldVal("f-dept") || null, qualification: fieldVal("f-qual") || null, experience_years: parseInt(fieldVal("f-exp") || "0"), subjects: fieldVal("f-subjects").split(",").map((s) => s.trim()).filter(Boolean), phone: fieldVal("f-phone") || null, office: fieldVal("f-office") || null };
    else if (kind === "departments") body = { name: fieldVal("d-name"), code: fieldVal("d-code"), head_name: fieldVal("d-head") || null, established_year: parseInt(fieldVal("d-year") || "0") || null, description: fieldVal("d-desc") || null };
    else if (kind === "courses") {
      let subjects = [];
      try { subjects = JSON.parse($("#c-subjects").value || "[]"); } catch { throw new Error("Subjects must be valid JSON"); }
      body = { name: fieldVal("c-name"), code: fieldVal("c-code"), department_id: fieldVal("c-dept") || null, semesters: parseInt(fieldVal("c-sems") || "4"), credits: parseInt(fieldVal("c-credits") || "120"), subjects };
    } else if (kind === "notices") body = { title: fieldVal("n-title"), content: fieldVal("n-content"), priority: $("#n-priority").value, pinned: $("#n-pinned").checked, category: fieldVal("n-category") || null, expires_at: $("#n-expires").value || null, attachment_url: fieldVal("n-attach") || null };
    else if (kind === "events") body = { title: fieldVal("e-title"), category: $("#e-category").value, date: $("#e-date").value, venue: fieldVal("e-venue") || null, organizer: fieldVal("e-organizer") || null, registration_link: fieldVal("e-reg") || null, description: fieldVal("e-desc") || null };
    else if (kind === "placements") body = { company: fieldVal("pl-company"), role: fieldVal("pl-role") || null, package: fieldVal("pl-package") || null, drive_date: $("#pl-date").value, registration_link: fieldVal("pl-reg") || null, status: $("#pl-status").value, eligibility: fieldVal("pl-elig") || null, selection_process: fieldVal("pl-process") || null, interview_tips: fieldVal("pl-tips") || null };
    else if (kind === "gallery") body = { title: fieldVal("g-title"), media_type: $("#g-type").value, url: fieldVal("g-url"), album: fieldVal("g-album") || null, description: fieldVal("g-desc") || null };
    else if (kind === "timetable") {
      let entries = [];
      try { entries = JSON.parse($("#tt-entries").value || "[]"); } catch { throw new Error("Entries must be valid JSON"); }
      body = { title: fieldVal("tt-title"), department_id: fieldVal("tt-dept") || null, semester: parseInt(fieldVal("tt-sem") || "1"), entries };
    }
    await api(conf.endpoint, { method: "POST", body });
    toast("Created successfully", "success");
    closeModal(); loadAdminList(kind);
  } catch (e) { toast(e.message, "error"); }
};

const fieldVal = (id) => ($(`#${id}`)?.value || "").trim();

window.openUpload = (kind) => {
  openModal(`
    <h3>Upload PDF to Knowledge Base</h3><p class="sub">Text is extracted, chunked and indexed for AI answers</p>
    <div class="field"><label>Document type</label><select class="select" id="kb-type">
      ${["prospectus", "rules", "academic_calendar", "syllabus", "exam_schedule", "fee_structure", "faculty_list", "placement_brochure", "hostel_rules", "transport_details", "library_rules", "other"].map((t) => `<option>${t}</option>`).join("")}
    </select></div>
    <div class="field"><label>Description (optional)</label><input class="input" id="kb-desc"></div>
    <div class="field"><label>PDF file</label><input class="input" id="kb-file" type="file" accept=".pdf,application/pdf"></div>
    <div class="modal-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="kb-upload-btn" onclick="doUpload()">Upload & Index</button></div>`, true);
};

window.doUpload = async () => {
  const file = $("#kb-file").files[0];
  if (!file) return toast("Choose a PDF file", "warning");
  const fd = new FormData();
  fd.append("file", file);
  fd.append("doc_type", $("#kb-type").value);
  fd.append("description", $("#kb-desc").value || "");
  const btn = $("#kb-upload-btn");
  btn.disabled = true; btn.textContent = "Processing…";
  try {
    const res = await api("/knowledge", { method: "POST", body: fd });
    toast(`Indexed "${res.title}" — ${res.chunk_count} chunks extracted`, "success");
    closeModal(); loadAdminList("knowledge");
  } catch (e) { toast(e.message, "error"); }
  finally { btn.disabled = false; btn.textContent = "Upload & Index"; }
};

/* Edit handlers (reuse create modal with filled values) */
window.editStudent = async (id) => {
  const s = await api(`/students/${id}`);
  openCreate("students");
  setTimeout(() => {
    ["s-name", "s-email", "s-roll", "s-sem", "s-phone"].forEach((f, i) => ($(`#${f}`).value = [s.name, s.email, s.roll_number || "", s.semester, s.phone || ""][i]));
    $("#s-pass").value = "Unchanged@123"; $("#s-status").value = s.status; deptOptions("s-dept", s.department_id);
    window.__editId = { kind: "students", id };
    const btn = $("#modal-root .btn-primary"); btn.textContent = "Save"; btn.onclick = () => saveEdit();
  }, 60);
};
window.editFaculty = async (id) => {
  const f = await api(`/faculty/${id}`);
  openCreate("faculty");
  setTimeout(() => {
    $("#f-name").value = f.name; $("#f-email").value = f.email || ""; $("#f-desig").value = f.designation; $("#f-qual").value = f.qualification || ""; $("#f-exp").value = f.experience_years || 0; $("#f-subjects").value = (f.subjects || []).join(", "); $("#f-phone").value = f.phone || ""; $("#f-office").value = f.office || "";
    deptOptions("f-dept", f.department_id);
    window.__editId = { kind: "faculty", id };
    const btn = $("#modal-root .btn-primary"); btn.textContent = "Save"; btn.onclick = () => saveEdit();
  }, 60);
};
window.editDept = async (id) => {
  const d = await api(`/departments/${id}`);
  openCreate("departments");
  setTimeout(() => {
    $("#d-name").value = d.name; $("#d-code").value = d.code; $("#d-head").value = d.head_name || ""; $("#d-year").value = d.established_year || ""; $("#d-desc").value = d.description || "";
    window.__editId = { kind: "departments", id };
    const btn = $("#modal-root .btn-primary"); btn.textContent = "Save"; btn.onclick = () => saveEdit();
  }, 60);
};
window.editCourse = async (id) => {
  const c = await api(`/courses/${id}`);
  openCreate("courses");
  setTimeout(() => {
    $("#c-name").value = c.name; $("#c-code").value = c.code; $("#c-credits").value = c.credits; $("#c-sems").value = c.semesters; $("#c-subjects").value = JSON.stringify(c.subjects || []);
    deptOptions("c-dept", c.department_id);
    window.__editId = { kind: "courses", id };
    const btn = $("#modal-root .btn-primary"); btn.textContent = "Save"; btn.onclick = () => saveEdit();
  }, 60);
};
window.editNotice = async (id) => {
  const n = await api(`/notices/${id}`);
  openCreate("notices");
  setTimeout(() => {
    $("#n-title").value = n.title; $("#n-content").value = n.content; $("#n-priority").value = n.priority; $("#n-category").value = n.category || ""; $("#n-pinned").checked = !!n.pinned; $("#n-attach").value = n.attachment_url || ""; $("#n-expires").value = n.expires_at ? n.expires_at.slice(0, 10) : "";
    window.__editId = { kind: "notices", id };
    const btn = $("#modal-root .btn-primary"); btn.textContent = "Save"; btn.onclick = () => saveEdit();
  }, 60);
};
window.editEvent = async (id) => {
  const ev = await api(`/events/${id}`);
  openCreate("events");
  setTimeout(() => {
    $("#e-title").value = ev.title; $("#e-category").value = ev.category; $("#e-date").value = ev.date ? ev.date.slice(0, 10) : ""; $("#e-venue").value = ev.venue || ""; $("#e-organizer").value = ev.organizer || ""; $("#e-reg").value = ev.registration_link || ""; $("#e-desc").value = ev.description || "";
    window.__editId = { kind: "events", id };
    const btn = $("#modal-root .btn-primary"); btn.textContent = "Save"; btn.onclick = () => saveEdit();
  }, 60);
};
window.editPlacement = async (id) => {
  const p = await api(`/placements/${id}`);
  openCreate("placements");
  setTimeout(() => {
    $("#pl-company").value = p.company; $("#pl-role").value = p.role || ""; $("#pl-package").value = p.package || ""; $("#pl-date").value = p.drive_date ? p.drive_date.slice(0, 10) : ""; $("#pl-reg").value = p.registration_link || ""; $("#pl-status").value = p.status; $("#pl-elig").value = p.eligibility || ""; $("#pl-process").value = p.selection_process || ""; $("#pl-tips").value = p.interview_tips || "";
    window.__editId = { kind: "placements", id };
    const btn = $("#modal-root .btn-primary"); btn.textContent = "Save"; btn.onclick = () => saveEdit();
  }, 60);
};
window.editGallery = async (id) => {
  const g = await api(`/gallery/${id}`);
  openCreate("gallery");
  setTimeout(() => {
    $("#g-title").value = g.title; $("#g-type").value = g.media_type; $("#g-album").value = g.album || ""; $("#g-url").value = g.url; $("#g-desc").value = g.description || "";
    window.__editId = { kind: "gallery", id };
    const btn = $("#modal-root .btn-primary"); btn.textContent = "Save"; btn.onclick = () => saveEdit();
  }, 60);
};
window.editTimetable = async (id) => {
  const t = await api(`/timetable/${id}`);
  openCreate("timetable");
  setTimeout(() => {
    $("#tt-title").value = t.title; $("#tt-sem").value = t.semester; $("#tt-entries").value = JSON.stringify(t.entries || []);
    deptOptions("tt-dept", t.department_id);
    window.__editId = { kind: "timetable", id };
    const btn = $("#modal-root .btn-primary"); btn.textContent = "Save"; btn.onclick = () => saveEdit();
  }, 60);
};

window.saveEdit = async () => {
  const { kind, id } = window.__editId || {};
  if (!kind) return;
  const conf = adminTableConfig(kind);
  try {
    let body;
    if (kind === "students") body = { name: fieldVal("s-name") || null, roll_number: fieldVal("s-roll") || null, semester: parseInt(fieldVal("s-sem") || "1"), department_id: fieldVal("s-dept") || null, phone: fieldVal("s-phone") || null, status: $("#s-status").value };
    else if (kind === "faculty") body = { name: fieldVal("f-name") || null, email: fieldVal("f-email") || null, designation: fieldVal("f-desig") || null, department_id: fieldVal("f-dept") || null, qualification: fieldVal("f-qual") || null, experience_years: parseInt(fieldVal("f-exp") || "0"), subjects: fieldVal("f-subjects").split(",").map((s) => s.trim()).filter(Boolean), phone: fieldVal("f-phone") || null, office: fieldVal("f-office") || null };
    else if (kind === "departments") body = { name: fieldVal("d-name") || null, code: fieldVal("d-code") || null, head_name: fieldVal("d-head") || null, established_year: parseInt(fieldVal("d-year") || "0") || null, description: fieldVal("d-desc") || null };
    else if (kind === "courses") {
      let subjects = [];
      try { subjects = JSON.parse($("#c-subjects").value || "[]"); } catch { throw new Error("Subjects must be valid JSON"); }
      body = { name: fieldVal("c-name") || null, code: fieldVal("c-code") || null, department_id: fieldVal("c-dept") || null, semesters: parseInt(fieldVal("c-sems") || "4"), credits: parseInt(fieldVal("c-credits") || "120"), subjects };
    } else if (kind === "notices") body = { title: fieldVal("n-title") || null, content: fieldVal("n-content") || null, priority: $("#n-priority").value, pinned: $("#n-pinned").checked, category: fieldVal("n-category") || null, expires_at: $("#n-expires").value || null, attachment_url: fieldVal("n-attach") || null };
    else if (kind === "events") body = { title: fieldVal("e-title") || null, category: $("#e-category").value, date: $("#e-date").value || null, venue: fieldVal("e-venue") || null, organizer: fieldVal("e-organizer") || null, registration_link: fieldVal("e-reg") || null, description: fieldVal("e-desc") || null };
    else if (kind === "placements") body = { company: fieldVal("pl-company") || null, role: fieldVal("pl-role") || null, package: fieldVal("pl-package") || null, drive_date: $("#pl-date").value || null, registration_link: fieldVal("pl-reg") || null, status: $("#pl-status").value, eligibility: fieldVal("pl-elig") || null, selection_process: fieldVal("pl-process") || null, interview_tips: fieldVal("pl-tips") || null };
    else if (kind === "gallery") body = { title: fieldVal("g-title") || null, album: fieldVal("g-album") || null, description: fieldVal("g-desc") || null };
    else if (kind === "timetable") {
      let entries = [];
      try { entries = JSON.parse($("#tt-entries").value || "[]"); } catch { throw new Error("Entries must be valid JSON"); }
      body = { title: fieldVal("tt-title") || null, entries };
    }
    await api(`${conf.endpoint}/${id}`, { method: "PATCH", body });
    toast("Saved", "success");
    closeModal(); loadAdminList(kind);
  } catch (e) { toast(e.message, "error"); }
};

window.setFeedbackStatus = async (id) => {
  const status = prompt("New status (new / reviewed / resolved):", "reviewed");
  if (!status) return;
  try { await api(`/feedback/${id}?status=${status}`, { method: "PATCH" }); toast("Updated", "success"); loadAdminList("feedback"); }
  catch (e) { toast(e.message, "error"); }
};

/* ---------------- Notifications & settings ---------------- */
async function renderAdminNotifications() {
  setTitle("Notifications", "Broadcast to all students");
  fieldVal(`
    <div class="panel" style="margin-bottom:20px">
      <div class="panel-head"><h2>📣 Broadcast</h2></div>
      <div class="field"><label>Title</label><input class="input" id="bc-title"></div>
      <div class="field"><label>Message</label><textarea class="textarea" id="bc-msg"></textarea></div>
      <button class="btn btn-primary" onclick="broadcast()">Send to all students</button>
    </div>`);
}

window.broadcast = async () => {
  try {
    const res = await api(`/notifications/broadcast?title=${encodeURIComponent($("#bc-title").value)}&message=${encodeURIComponent($("#bc-msg").value)}`, { method: "POST" });
    toast(res.detail, "success");
  } catch (e) { toast(e.message, "error"); }
};

async function renderAdminSettings() {
  setTitle("Settings", "College-wide configuration");
  let s;
  try { s = await api("/settings"); } catch (e) { toast(e.message, "error"); return; }
  fieldVal(`
    <div class="panel" style="max-width:640px">
      <div class="panel-head"><h2>⚙️ College settings</h2></div>
      <div class="field"><label>College name</label><input class="input" id="set-name" value="${esc(s.college_name)}"></div>
      <div class="field"><label>Tagline</label><input class="input" id="set-tagline" value="${esc(s.tagline)}"></div>
      <div class="form-row">
        <div class="field"><label>Contact email</label><input class="input" id="set-email" value="${esc(s.contact_email)}"></div>
        <div class="field"><label>Contact phone</label><input class="input" id="set-phone" value="${esc(s.contact_phone)}"></div>
      </div>
      <div class="field"><label>Address</label><input class="input" id="set-address" value="${esc(s.address)}"></div>
      <div class="field"><label>Welcome message (shown in AI chat)</label><textarea class="textarea" id="set-welcome">${esc(s.welcome_message)}</textarea></div>
      <label style="display:flex;gap:8px;align-items:center;margin-bottom:18px"><input type="checkbox" id="set-maintenance" ${s.maintenance_mode ? "checked" : ""}> Maintenance mode</label>
      <button class="btn btn-primary" onclick="saveSettings()">Save settings</button>
    </div>`);
}

window.saveSettings = async () => {
  try {
    await api("/settings", { method: "PATCH", body: {
      college_name: $("#set-name").value, tagline: $("#set-tagline").value, contact_email: $("#set-email").value,
      contact_phone: $("#set-phone").value, address: $("#set-address").value, welcome_message: $("#set-welcome").value,
      maintenance_mode: $("#set-maintenance").checked,
    } });
    toast("Settings saved", "success");
  } catch (e) { toast(e.message, "error"); }
};

/* ---------------- Bell count + init ---------------- */
async function refreshBell() {
  if (!S.token) return;
  try {
    const d = await api("/notifications/unread-count");
    const b = $("#bell-count");
    if (b) { b.style.display = d.count > 0 ? "flex" : "none"; b.textContent = d.count > 99 ? "99+" : d.count; }
  } catch { /* ignore */ }
}
setInterval(refreshBell, 60000);

document.addEventListener("DOMContentLoaded", () => {
  navigate(location.hash || "#/landing");
  refreshBell();
});
