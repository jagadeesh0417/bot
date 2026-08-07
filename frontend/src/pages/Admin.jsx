import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { useToast, SkeletonRows } from "../ui.jsx";

export default function Admin() {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    api("/auth/me").then((d) => setUser(d.user)).catch(() => {});
    api("/dashboard/stats").then(setStats).catch((e) => toast(e.message, "error"));
    api("/dashboard/analytics").then(setAnalytics).catch(() => {});
  }, []);

  if (!stats) return <div style={{ paddingTop: 24 }}><SkeletonRows rows={4} /></div>;

  const deptMax = Math.max(1, ...(analytics?.departments || []).map((d) => d.count));
  const regMax = Math.max(1, ...(analytics?.registrations || []).map((d) => d.count));

  return (
    <div style={{ paddingTop: 24 }}>
      <div className="panel glass" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <h2>🛡️ Admin Console</h2>
          <span className="hint">Signed in as {user?.email}</span>
        </div>
        <p style={{ color: "var(--text-2)", fontSize: 14 }}>
          Manage students, faculty, notices, events, placements and the knowledge base from the side menu.
        </p>
      </div>

      <div className="grid-2">
        <div className="panel glass">
          <div className="panel-head"><h2>🧑‍🎓 Students per Department</h2></div>
          {(analytics?.departments || []).length === 0 ? (
            <p style={{ color: "var(--text-3)" }}>No data yet</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {analytics.departments.map((d) => (
                <div key={d.name}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
                    <span>{d.name}</span><strong>{d.count}</strong>
                  </div>
                  <div style={{ height: 8, background: "var(--input-bg)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(d.count / deptMax) * 100}%`, background: "var(--gradient)", borderRadius: 99 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel glass">
          <div className="panel-head"><h2>📈 Registrations (this month)</h2></div>
          {(analytics?.registrations || []).length === 0 ? (
            <p style={{ color: "var(--text-3)" }}>No data yet</p>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 140 }}>
              {analytics.registrations.map((r, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                  <strong style={{ fontSize: 13 }}>{r.count}</strong>
                  <div style={{ width: "100%", height: `${(r.count / regMax) * 100}%`, minHeight: 6, background: "var(--gradient)", borderRadius: "8px 8px 0 0" }} />
                  <span style={{ fontSize: 11, color: "var(--text-3)" }}>M{r._id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
