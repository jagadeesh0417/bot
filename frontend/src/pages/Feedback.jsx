import React, { useEffect, useState } from "react";
import { api, fmtDate } from "../api.js";
import { useToast, Field, EmptyState } from "../ui.jsx";

export default function Feedback() {
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("general");
  const [rating, setRating] = useState(5);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState([]);

  useEffect(() => {
    api("/auth/me").then((d) => setUser(d.user)).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return toast("Write something first", "error");
    setBusy(true);
    try {
      await api("/feedback", {
        method: "POST",
        body: JSON.stringify({ message: message.trim(), category, rating: Number(rating) }),
      });
      toast("Thanks for your feedback!", "success");
      setMessage("");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const load = async () => {
    try {
      const res = await api("/feedback?pageSize=20");
      setItems(res.items || []);
    } catch (e) {
      /* admin only */
    }
  };

  const setStatus = async (item, status) => {
    try {
      await api(`/feedback/${item.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      load();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const isAdmin = user?.role === "admin";

  return (
    <div style={{ paddingTop: 24 }}>
      <div className="grid-2">
        <div className="panel glass">
          <div className="panel-head"><h2>💬 Submit Feedback</h2></div>
          <form onSubmit={submit}>
            <Field label="Category">
              <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                {["general", "academics", "facilities", "placements", "staff", "other"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Rating">
              <select className="select" value={rating} onChange={(e) => setRating(e.target.value)}>
                {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{"⭐".repeat(r)}{r < 5 ? "☆".repeat(5 - r) : ""}</option>)}
              </select>
            </Field>
            <Field label="Your feedback">
              <textarea className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us what you think…" />
            </Field>
            <button className="btn btn-primary" disabled={busy}>{busy ? "Sending…" : "Submit"}</button>
          </form>
        </div>

        {isAdmin && (
          <div className="panel glass">
            <div className="panel-head"><h2>📥 Inbox</h2></div>
            {items.length === 0 ? (
              <EmptyState emoji="💬" text="No feedback yet" />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {items.map((f) => (
                  <div key={f.id} style={{ padding: 14, background: "var(--input-bg)", borderRadius: 12, border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <span className="tag blue">{f.category}</span>
                      <span className={`tag ${f.status === "resolved" ? "green" : f.status === "reviewing" ? "amber" : "red"}`}>{f.status}</span>
                    </div>
                    <p style={{ margin: "10px 0 6px", fontSize: 14 }}>{f.message}</p>
                    <div style={{ fontSize: 12, color: "var(--text-3)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <span>{"⭐".repeat(f.rating || 0)}{fmtDate(f.createdAt)}</span>
                      {f.status !== "resolved" && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setStatus(f, f.status === "reviewing" ? "resolved" : "reviewing")}>
                          {f.status === "reviewing" ? "✓ Resolve" : "Start reviewing"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
