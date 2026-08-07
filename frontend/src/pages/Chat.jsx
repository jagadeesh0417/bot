import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtDate } from "../api.js";
import { useToast, EmptyState } from "../ui.jsx";

export default function Chat() {
  const toast = useToast();
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [search, setSearch] = useState("");
  const bottomRef = useRef(null);

  const loadSessions = useCallback(async () => {
    try {
      const res = await api("/chat/sessions");
      setSessions(res.items || []);
    } catch (e) {
      toast(e.message, "error");
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const openSession = async (id) => {
    setActiveId(id);
    try {
      const res = await api(`/chat/sessions/${id}/messages?limit=50`);
      setMessages(res.items || []);
    } catch (e) {
      toast(e.message, "error");
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const send = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || typing) return;
    setInput("");
    setTyping(true);
    setMessages((m) => [...m, { role: "user", content: text, createdAt: new Date().toISOString(), temp: true }]);
    try {
      const res = await api("/chat", { method: "POST", body: JSON.stringify({ message: text, session_id: activeId }) });
      if (res.session_id && res.session_id !== activeId) {
        setActiveId(res.session_id);
        loadSessions();
      }
      setMessages((m) => {
        const cleaned = m.filter((x) => !x.temp);
        const reply = { role: "assistant", content: res.answer, sources: res.sources || [], createdAt: new Date().toISOString() };
        return res.session_id && res.session_id !== activeId
          ? [...cleaned.filter((x) => x.role !== "assistant" || true), reply]
          : [...cleaned, reply];
      });
    } catch (err) {
      toast(err.message, "error");
      setMessages((m) => m.filter((x) => !x.temp));
    } finally {
      setTyping(false);
    }
  };

  const newSession = () => {
    setActiveId(null);
    setMessages([]);
  };

  const deleteSession = async (id) => {
    if (!confirm("Delete this chat session?")) return;
    try {
      await api(`/chat/sessions/${id}`, { method: "DELETE" });
      if (activeId === id) { setActiveId(null); setMessages([]); }
      loadSessions();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  return (
    <div style={{ paddingTop: 24 }}>
      <div className="chat-layout">
        <div className="panel glass" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div className="panel-head" style={{ padding: "16px 16px 10px" }}>
            <h2>💬 Sessions</h2>
            <button className="btn btn-primary btn-sm" onClick={newSession}>+ New</button>
          </div>
          <div style={{ padding: "0 12px 8px" }}>
            <input className="input" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="chat-sessions">
            {sessions.filter((s) => !search || s.title?.toLowerCase().includes(search.toLowerCase())).map((s) => (
              <div key={s.id} className={`chat-session ${activeId === s.id ? "active" : ""}`} onClick={() => openSession(s.id)}>
                <span className="t">{s.title || "New chat"}</span>
                <button className="btn btn-ghost btn-sm" style={{ padding: "2px 6px" }} onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}>🗑️</button>
              </div>
            ))}
            {sessions.length === 0 && <p style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: 20 }}>No sessions yet</p>}
          </div>
        </div>

        <div className="panel glass chat-main">
          <div className="chat-messages">
            {messages.length === 0 && !typing && (
              <EmptyState emoji="🤖" text="Ask me anything about your college — exams, fees, placements, rules…" />
            )}
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role === "user" ? "user" : "bot"}`}>
                <span className="avatar">{m.role === "user" ? "👤" : "🤖"}</span>
                <div>
                  <div className="content markdown">{m.content}</div>
                  {m.sources?.length > 0 && (
                    <div className="sources">
                      {m.sources.slice(0, 3).map((s, j) => (
                        <div key={j} className="source">📄 {s.title || s.document_title || "Source"}</div>
                      ))}
                    </div>
                  )}
                  {m.createdAt && !m.temp && <div className="time">{fmtDate(m.createdAt)}</div>}
                </div>
              </div>
            ))}
            {typing && (
              <div className="msg bot">
                <span className="avatar">🤖</span>
                <div className="content">
                  <div className="typing"><span /><span /><span /></div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <form className="chat-input-bar" onSubmit={send}>
            <textarea
              placeholder="Ask about admissions, exams, fees, placements…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e); } }}
              rows={2}
            />
            <button className="btn btn-primary" disabled={!input.trim() || typing}>➤</button>
          </form>
        </div>
      </div>
    </div>
  );
}
