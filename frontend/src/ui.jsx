import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ApiError } from "./api.js";

/* ---------------- Toast ---------------- */

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const push = useCallback((message, type = "info") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 10 }}>
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------------- Loading ---------------- */

export function Loader({ text = "Loading..." }) {
  return (
    <div className="loader-inner">
      <div className="loader-ring" style={{ width: 44, height: 44 }} />
      <p style={{ color: "var(--text-2)", marginTop: 14 }}>{text}</p>
    </div>
  );
}

/* ---------------- Modal ---------------- */

export function Modal({ title, sub, onClose, children, wide }) {
  return (
    <div className="modal-backdrop" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", backdropFilter: "blur(6px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className={`modal glass ${wide ? "modal-wide" : ""}`} onClick={(e) => e.stopPropagation()} style={{ width: "min(480px, 100%)", maxHeight: "90vh", overflowY: "auto" }}>
        {title && <h3>{title}</h3>}
        {sub && <div className="sub">{sub}</div>}
        {children}
      </div>
    </div>
  );
}

/* ---------------- Form helpers ---------------- */

export function Field({ label, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

export function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 18, flexWrap: "wrap" }}>
      {Array.from({ length: Math.min(pages, 8) }, (_, i) => i + 1).map((p) => (
        <button key={p} className={`btn btn-sm page-btn ${p === page ? "active" : ""}`} onClick={() => onChange(p)}>
          {p}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ emoji = "📭", text = "Nothing here yet" }) {
  return (
    <div className="empty">
      <div className="emoji">{emoji}</div>
      <p>{text}</p>
    </div>
  );
}

export function SkeletonRows({ rows = 3 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 56 }} />
      ))}
    </div>
  );
}

/* ---------------- Async runner hook ---------------- */

export function useAsync(fn, deps = []) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const toast = useToast();
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fn()
      .then((d) => alive && setData(d))
      .catch((e) => {
        if (!alive) return;
        setError(e.message || "Something went wrong");
        if (e instanceof ApiError && e.status >= 400) toast(e.message, "error");
      })
      .finally(() => alive && setLoading(false));
    return () => (alive = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { loading, error, data, setData, reload: () => setLoading(false) };
}

export function handleErr(e, toast) {
  toast(e?.message || "Something went wrong", "error");
}
