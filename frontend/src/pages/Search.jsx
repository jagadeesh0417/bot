import React, { useEffect, useState } from "react";
import { api, fmtDate } from "../api.js";
import { useToast, EmptyState } from "../ui.jsx";

const ICONS = {
  notice: "📢", event: "🎉", course: "📚", faculty: "👩‍🏫", department: "🏛️", placement: "💼",
};

export default function SearchPage() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!debounced) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    api(`/search?q=${encodeURIComponent(debounced)}`)
      .then((d) => { setResults(d.items || []); setSearched(true); })
      .catch((e) => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [debounced]);

  return (
    <div style={{ paddingTop: 24 }}>
      <div className="panel glass">
        <div className="panel-head">
          <h2>🔍 Global Search</h2>
        </div>
        <div style={{ maxWidth: 560, marginBottom: 24 }}>
          <input className="input" autoFocus placeholder="Search notices, events, courses, faculty, placements…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {loading && <div style={{ color: "var(--text-3)" }}>Searching…</div>}
        {!loading && searched && results.length === 0 && <EmptyState emoji="🔎" text={`No results for "${debounced}"`} />}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {results.map((r) => {
            const hash = { notice: "#/notices", event: "#/events", course: "#/courses", faculty: "#/faculty", department: "#/departments", placement: "#/placements" }[r.type] || "#/app";
            return (
              <a key={`${r.type}-${r.id}`} href={hash} style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ display: "flex", gap: 14, padding: "14px 16px", background: "var(--input-bg)", borderRadius: 12, border: "1px solid var(--border)", alignItems: "center" }}>
                  <span style={{ fontSize: 22 }}>{ICONS[r.type] || "📄"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{r.title || r.name || r.company}</div>
                    <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3, textTransform: "capitalize" }}>{r.type} {r.createdAt ? `· ${fmtDate(r.createdAt)}` : ""}</div>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
