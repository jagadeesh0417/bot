import React, { useState } from "react";
import { api, storeTokens } from "../api.js";
import { useToast } from "../ui.jsx";

export default function Auth({ mode, onAuthed, theme, setTheme }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", email: "", password: "", studentId: "", department: "", semester: "", rememberMe: true });
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        const res = await api("/auth/login", { method: "POST", body: JSON.stringify({ email: form.email, password: form.password, rememberMe: form.rememberMe }) });
        storeTokens(res.tokens);
        toast("Welcome back!", "success");
        onAuthed();
      } else {
        const res = await api("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            password: form.password,
            studentId: form.studentId,
            department: form.department,
            semester: form.semester ? Number(form.semester) : null,
            rememberMe: form.rememberMe,
          }),
        });
        storeTokens(res.tokens);
        toast("Account created. Welcome to CollegeAI!", "success");
        onAuthed();
      }
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card glass">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <a href="#/" className="auth-back">← Back</a>
          <button className="icon-btn theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
        <div style={{ textAlign: "center" }}>
          <span style={{ fontSize: 42 }}>🎓</span>
          <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p className="sub">{mode === "login" ? "Sign in to your CollegeAI account" : "Join your college's smart assistant"}</p>
        </div>
        <form onSubmit={submit}>
          {mode === "register" && (
            <div className="field">
              <label>Full name</label>
              <input className="input" value={form.name} onChange={set("name")} placeholder="e.g. Aditi Sharma" required />
            </div>
          )}
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" value={form.email} onChange={set("email")} placeholder="you@college.edu" required />
          </div>
          {mode === "register" && (
            <>
              <div className="form-row">
                <div className="field">
                  <label>Student ID</label>
                  <input className="input" value={form.studentId} onChange={set("studentId")} placeholder="e.g. CS2024001" />
                </div>
                <div className="field">
                  <label>Semester</label>
                  <input className="input" type="number" min="1" max="8" value={form.semester} onChange={set("semester")} placeholder="e.g. 3" />
                </div>
              </div>
              <div className="field">
                <label>Department</label>
                <input className="input" value={form.department} onChange={set("department")} placeholder="e.g. Computer Science" />
              </div>
            </>
          )}
          <div className="field">
            <label>Password</label>
            <input className="input" type="password" value={form.password} onChange={set("password")} placeholder="Min 8 chars, with a number" required />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-2)", marginBottom: 16 }}>
            <input type="checkbox" checked={form.rememberMe} onChange={(e) => setForm({ ...form, rememberMe: e.target.checked })} />
            Keep me signed in
          </label>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>
        <div className="auth-switch">
          {mode === "login" ? (
            <>New here? <a href="#/register">Create an account</a></>
          ) : (
            <>Already have an account? <a href="#/login">Sign in</a></>
          )}
        </div>
      </div>
    </div>
  );
}
