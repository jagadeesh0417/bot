import React from "react";
import { getToken } from "../api.js";

function ThemeToggle({ theme, setTheme }) {
  return (
    <button
      className="icon-btn theme-toggle"
      title="Toggle theme"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}

const FEATURES = [
  { icon: "🤖", title: "AI Chatbot", desc: "Instant answers from your college's knowledge base with cited sources.", hash: "#/chat" },
  { icon: "📢", title: "Notices", desc: "Official announcements, exam alerts and pinned notices.", hash: "#/notices" },
  { icon: "🎉", title: "Events", desc: "Workshops, seminars, sports and cultural events.", hash: "#/events" },
  { icon: "💼", title: "Placements", desc: "Track drives, eligibility and upcoming opportunities.", hash: "#/placements" },
  { icon: "📚", title: "Knowledge Base", desc: "Prospectus, rules, syllabi and exam schedules as PDFs.", hash: "#/knowledge" },
  { icon: "🗓️", title: "Timetable", desc: "Personalised class timetables by department and semester.", hash: "#/timetable" },
  { icon: "📖", title: "Courses", desc: "Browse courses, credits and enrol in your subjects.", hash: "#/courses" },
  { icon: "👩‍🏫", title: "Faculty", desc: "Meet your professors — departments, designations and qualifications.", hash: "#/faculty" },
  { icon: "🏛️", title: "Departments", desc: "Explore departments, heads and their stats.", hash: "#/departments" },
  { icon: "🖼️", title: "Gallery", desc: "Campus photos and memories — like your favourites.", hash: "#/gallery" },
  { icon: "🔍", title: "Search", desc: "One search across notices, courses, faculty and more.", hash: "#/search" },
  { icon: "💬", title: "Feedback", desc: "Share your suggestions and ratings with the college.", hash: "#/feedback" },
  { icon: "📊", title: "Analytics", desc: "Admin dashboard with stats, trends and activity.", hash: "#/admin", admin: true },
  { icon: "🧑‍🎓", title: "Students", desc: "Manage students, enrolments and profiles.", hash: "#/students", admin: true },
];

export default function Landing({ theme, setTheme }) {
  const authed = Boolean(getToken());
  const link = (hash) => (authed ? hash : "#/login");
  return (
    <div className="landing">
      <nav className="nav glass">
        <div className="nav-brand">
          <span className="logo-emoji">🎓</span> CollegeAI
        </div>
        <div className="nav-links">
          <ThemeToggle theme={theme} setTheme={setTheme} />
          <a href="#/login" className="btn btn-ghost btn-sm">Login</a>
          <a href="#/register" className="btn btn-primary btn-sm">Get Started</a>
        </div>
      </nav>

      <header className="hero">
        <div className="hero-text">
          <div className="hero-badge">
            <span className="dot" /> AI-powered college assistant
          </div>
          <h1>
            Your college, <span className="grad">smarter</span>.
          </h1>
          <p>
            Ask anything about admissions, courses, exams, placements and campus life.
            CollegeAI answers instantly from your college&apos;s official documents and data.
          </p>
          <div className="hero-cta">
            <a href="#/register" className="btn btn-primary">Start Learning</a>
            <a href="#/login" className="btn btn-ghost">I have an account</a>
          </div>
        </div>
        <div className="hero-visual">
          <div className="chat-preview glass">
            <div className="chat-preview-head">
              <span style={{ fontSize: 18 }}>🤖</span> CollegeAI Assistant
            </div>
            <div className="chat-preview-body">
              <div className="bubble bot">Hi! Ask me anything about your college 🎓</div>
              <div className="bubble user">When are the semester exams?</div>
              <div className="bubble bot">
                According to the academic calendar, semester exams begin on <strong>December 9th</strong>. Admit cards are released 10 days before. 📅
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="section">
        <div className="section-head">
          <h2>Everything your campus needs</h2>
          <p>One intelligent platform for students, faculty and administration.</p>
        </div>
        <div className="features-grid">
          {FEATURES.map((f) => (
            <a
              key={f.title}
              href={link(f.hash)}
              className="feature-card glass"
              style={{ textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", gap: 10 }}
              title={authed ? `Open ${f.title}` : "Sign in to open"}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="feature-icon">{f.icon}</div>
                {f.admin && <span className="tag blue">admin</span>}
              </div>
              <h3 style={{ margin: 0 }}>{f.title}</h3>
              <p style={{ margin: 0 }}>{f.desc}</p>
              <span style={{ color: "var(--accent)", fontSize: 13, fontWeight: 600, marginTop: "auto", paddingTop: 8 }}>
                {authed ? "Open →" : "Sign in to explore →"}
              </span>
            </a>
          ))}
        </div>
      </section>

      <footer style={{ textAlign: "center", padding: "30px 5% 40px", color: "var(--text-3)", fontSize: 13 }}>
        🎓 CollegeAI — Intelligent College Assistant · <a href="#/login" style={{ color: "var(--accent)" }}>Sign in</a>
      </footer>
    </div>
  );
}
