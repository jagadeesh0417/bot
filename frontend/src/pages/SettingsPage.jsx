import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { useToast, Field } from "../ui.jsx";

export default function SettingsPage() {
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ name: "", phone: "", bio: "" });
  const [pwd, setPwd] = useState({ oldPassword: "", newPassword: "" });
  const [college, setCollege] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyPwd, setBusyPwd] = useState(false);
  const [busyCollege, setBusyCollege] = useState(false);

  useEffect(() => {
    api("/auth/me").then((d) => {
      setUser(d.user);
      setProfile({ name: d.user.name || "", phone: d.user.phone || "", bio: d.user.bio || "" });
    }).catch(() => {});
    api("/settings").then(setCollege).catch(() => {});
  }, []);

  const saveProfile = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await api("/auth/me", { method: "PATCH", body: JSON.stringify(profile) });
      setUser(d.user);
      toast("Profile updated", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const savePwd = async (e) => {
    e.preventDefault();
    setBusyPwd(true);
    try {
      await api("/auth/change-password", { method: "POST", body: JSON.stringify(pwd) });
      setPwd({ oldPassword: "", newPassword: "" });
      toast("Password changed", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusyPwd(false);
    }
  };

  const saveCollege = async (e) => {
    e.preventDefault();
    setBusyCollege(true);
    try {
      await api("/settings", { method: "PATCH", body: JSON.stringify(college) });
      toast("College settings saved", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusyCollege(false);
    }
  };

  const isAdmin = user?.role === "admin";

  return (
    <div style={{ paddingTop: 24 }}>
      <div className="grid-2">
        <div className="panel glass">
          <div className="panel-head"><h2>👤 My Profile</h2></div>
          <form onSubmit={saveProfile}>
            <Field label="Name">
              <input className="input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input className="input" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
            </Field>
            <Field label="Bio">
              <textarea className="textarea" value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} />
            </Field>
            <div style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 14 }}>
              Email: <strong>{user?.email}</strong> · Role: <strong>{user?.role}</strong> · ID: <strong>{user?.id}</strong>
            </div>
            <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save Profile"}</button>
          </form>
        </div>

        <div className="panel glass">
          <div className="panel-head"><h2>🔒 Change Password</h2></div>
          <form onSubmit={savePwd}>
            <Field label="Current password">
              <input className="input" type="password" required value={pwd.oldPassword} onChange={(e) => setPwd({ ...pwd, oldPassword: e.target.value })} />
            </Field>
            <Field label="New password (8+ chars with a number)">
              <input className="input" type="password" required value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} />
            </Field>
            <button className="btn btn-primary" disabled={busyPwd}>{busyPwd ? "Saving…" : "Update Password"}</button>
          </form>
        </div>
      </div>

      {isAdmin && college && (
        <div className="panel glass" style={{ marginTop: 20 }}>
          <div className="panel-head"><h2>🏛️ College Settings</h2><span className="hint">Shown to all users</span></div>
          <form onSubmit={saveCollege}>
            <div className="form-row">
              <Field label="College name">
                <input className="input" value={college.collegeName || ""} onChange={(e) => setCollege({ ...college, collegeName: e.target.value })} />
              </Field>
              <Field label="Website">
                <input className="input" value={college.website || ""} onChange={(e) => setCollege({ ...college, website: e.target.value })} />
              </Field>
            </div>
            <div className="form-row">
              <Field label="Contact email">
                <input className="input" value={college.contactEmail || ""} onChange={(e) => setCollege({ ...college, contactEmail: e.target.value })} />
              </Field>
              <Field label="Contact phone">
                <input className="input" value={college.contactPhone || ""} onChange={(e) => setCollege({ ...college, contactPhone: e.target.value })} />
              </Field>
            </div>
            <Field label="Address">
              <textarea className="textarea" value={college.address || ""} onChange={(e) => setCollege({ ...college, address: e.target.value })} />
            </Field>
            <button className="btn btn-primary" disabled={busyCollege}>{busyCollege ? "Saving…" : "Save Settings"}</button>
          </form>
        </div>
      )}
    </div>
  );
}
