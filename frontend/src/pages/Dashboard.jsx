import React, { useEffect, useState } from "react";
import { api, fmtDate } from "../api.js";
import { useToast, SkeletonRows } from "../ui.jsx";

export default function Dashboard() {
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [notices, setNotices] = useState([]);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    api("/auth/me").then((d) => setUser(d.user)).catch(() => {});
    api("/dashboard/stats").then(setStats).catch((e) => toast(e.message, "error"));
    api("/dashboard/activity").then((d) => setActivity(d.items || [])).catch(() => {});
    api("/notices/public").then((d) => setNotices(d.items || [])).catch(() => {});
    api("/events/public").then((d) => setEvents(d.items || [])).catch(() => {});
  }, []);

  const isAdmin = user?.role === "admin";

  const statCards = isAdmin
    ? [
        { icon: "🧑‍🎓", value: stats?.students ?? "—", label: "Students" },
        { icon: "👩‍🏫", value: stats?.faculty ?? "—", label: "Faculty" },
        { icon: "🏛️", value: stats?.departments ?? "—", label: "Departments" },
        { icon: "📚", value: stats?.courses ?? "—", label: "Courses" },
        { icon: "📢", value: stats?.notices ?? "—", label: "Notices" },
        { icon: "🎉", value: stats?.events ?? "—", label: "Events" },
        { icon: "💼", value: stats?.placements ?? "—", label: "Placements" },
      ]
    : [
        { icon: "📢", value: stats?.notices ?? "—", label: "Notices" },
        { icon: "🎉", value: stats?.events ?? "—", label: "Upcoming Events" },
        { icon: "💼", value: stats?.placements ?? "—", label: "Placements" },
        { icon: "🤖", value: stats?.chatSessions ?? 0, label: "Chat Sessions" },
      ];

  return (
    <div style={{ paddingTop: 24 }}>
      <div className="stats-grid">
        {statCards.map((s) => (
          <div key={s.label} className="stat-card glass">
            <span className="icon">{s.icon}</span>
            <div className="value">{s.value}</div>
            <div className="label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="panel glass">
          <div className="panel-head">
            <h2>📢 Latest Notices</h2>
            <a href="#/notices" className="btn btn-ghost btn-sm">View all</a>
          </div>
          {notices.length === 0 ? (
            <p style={{ color: "var(--text-3)" }}>No notices yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {notices.slice(0, 5).map((n) => (
                <div key={n.id} style={{ padding: "12px 14px", background: "var(--input-bg)", borderRadius: 12, border: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{n.title}</div>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>{fmtDate(n.createdAt)} {n.pinned ? <span className="tag amber">pinned</span> : null}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel glass">
          <div className="panel-head">
            <h2>🎉 Upcoming Events</h2>
            <a href="#/events" className="btn btn-ghost btn-sm">View all</a>
          </div>
          {events.length === 0 ? (
            <p style={{ color: "var(--text-3)" }}>No events scheduled.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {events.slice(0, 5).map((e) => (
                <div key={e.id} style={{ padding: "12px 14px", background: "var(--input-bg)", borderRadius: 12, border: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{e.title}</div>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>📅 {fmtDate(e.date || e.createdAt)} {e.venue ? `· 📍 ${e.venue}` : ""}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="panel glass">
        <div className="panel-head">
          <h2>🕒 Recent Activity</h2>
        </div>
        {activity.length === 0 ? (
          <p style={{ color: "var(--text-3)" }}>No recent activity.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {activity.map((a, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 14px", background: "var(--input-bg)", borderRadius: 10, fontSize: 13 }}>
                <span>{a.text}</span>
                <span style={{ color: "var(--text-3)", whiteSpace: "nowrap" }}>{fmtDate(a.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
