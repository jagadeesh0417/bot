import React, { useEffect, useState } from "react";
import { api } from "../api.js";

const NAV = [
  { section: "Main", links: [
    { hash: "#/app", icon: "📊", label: "Dashboard" },
    { hash: "#/search", icon: "🔍", label: "Search" },
    { hash: "#/chat", icon: "🤖", label: "AI Assistant" },
  ]},
  { section: "Campus", links: [
    { hash: "#/notices", icon: "📢", label: "Notices" },
    { hash: "#/events", icon: "🎉", label: "Events" },
    { hash: "#/placements", icon: "💼", label: "Placements" },
    { hash: "#/gallery", icon: "🖼️", label: "Gallery" },
    { hash: "#/timetable", icon: "🗓️", label: "Timetable" },
  ]},
  { section: "Academics", links: [
    { hash: "#/courses", icon: "📚", label: "Courses" },
    { hash: "#/faculty", icon: "👩‍🏫", label: "Faculty" },
    { hash: "#/departments", icon: "🏛️", label: "Departments" },
    { hash: "#/knowledge", icon: "🗂️", label: "Knowledge Base" },
  ]},
];

const ADMIN_LINKS = [
  { hash: "#/students", icon: "🧑‍🎓", label: "Students" },
  { hash: "#/feedback", icon: "💬", label: "Feedback" },
  { hash: "#/settings", icon: "⚙️", label: "Settings" },
];

export default function Shell({ route, theme, setTheme, logout, children, userCache }) {
  const [user, setUser] = useState(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    api("/auth/me")
      .then((d) => setUser(d.user))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user) {
      api("/notifications/unread-count")
        .then((d) => setUnread(d.count))
        .catch(() => {});
    }
  }, [user]);

  const current = route.split("?")[0];
  const allLinks = [...NAV.map((s) => s.links).flat(), ...(user?.role === "admin" ? ADMIN_LINKS : [])];

  return (
    <div className="shell">
      <aside className="sidebar glass">
        <div className="sidebar-brand">
          <span style={{ fontSize: 24 }}>🎓</span> CollegeAI
        </div>
        <nav className="sidebar-nav">
          {NAV.map((group) => (
            <React.Fragment key={group.section}>
              <div className="side-section-label">{group.section}</div>
              {group.links.map((l) => (
                <a key={l.hash} href={l.hash} className={`side-link ${current === l.hash.slice(1) ? "active" : ""}`}>
                  <span className="icon">{l.icon}</span> {l.label}
                  {l.hash === "#/chat" && unread > 0 && null}
                </a>
              ))}
            </React.Fragment>
          ))}
          {user?.role === "admin" && (
            <>
              <div className="side-section-label">Admin</div>
              {ADMIN_LINKS.map((l) => (
                <a key={l.hash} href={l.hash} className={`side-link ${current === l.hash.slice(1) ? "active" : ""}`}>
                  <span className="icon">{l.icon}</span> {l.label}
                </a>
              ))}
            </>
          )}
        </nav>
        <div className="sidebar-foot">
          <div className="user-chip">
            <span className="avatar">{user ? user.name.slice(0, 1).toUpperCase() : "?"}</span>
            <div className="meta">
              <div className="n">{user?.name || "Loading…"}</div>
              <div className="r">{user?.role || ""}</div>
            </div>
          </div>
          <a href="#/settings" className="btn btn-ghost btn-sm">⚙️ Settings</a>
          <button className="btn btn-ghost btn-sm" onClick={logout}>🚪 Logout</button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar glass">
          <div>
            <h1>{allLinks.find((l) => l.hash.slice(1) === current)?.label || "CollegeAI"}</h1>
            <div className="crumb">CollegeAI · {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
          </div>
          <div className="top-actions">
            <button className="icon-btn theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <a href="#/chat" className="btn btn-primary btn-sm">🤖 Ask AI</a>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
