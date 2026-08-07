import React, { useCallback, useEffect, useState } from "react";
import { api, formPost, fmtDate } from "../api.js";
import { useToast, Modal, Field, EmptyState, SkeletonRows } from "../ui.jsx";

export default function Gallery() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ title: "", imageUrl: "", description: "" });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api("/gallery?pageSize=60");
      setItems(res.items || []);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    api("/auth/me").then((d) => setUser(d.user)).catch(() => {});
  }, [load]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      let url = form.imageUrl;
      if (file) {
        const fd = new FormData();
        fd.append("image", file);
        const up = await formPost("/gallery/upload", fd);
        url = up.url;
      }
      const payload = { title: form.title, description: form.description, imageUrl: url };
      if (modal?.item) {
        await api(`/gallery/${modal.item.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api("/gallery", { method: "POST", body: JSON.stringify(payload) });
      }
      toast("Gallery updated", "success");
      setModal(null);
      load();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const like = async (item) => {
    try {
      await api(`/gallery/${item.id}/like`, { method: "POST" });
      load();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const remove = async (item) => {
    if (!confirm("Delete this image?")) return;
    try {
      await api(`/gallery/${item.id}`, { method: "DELETE" });
      toast("Deleted", "success");
      load();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const isAdmin = user?.role === "admin";

  return (
    <div style={{ paddingTop: 24 }}>
      <div className="panel-head">
        <h2>🖼️ Campus Gallery</h2>
        {isAdmin && <button className="btn btn-primary btn-sm" onClick={() => { setForm({ title: "", imageUrl: "", description: "" }); setFile(null); setModal({}); }}>+ Add image</button>}
      </div>
      {loading ? (
        <SkeletonRows rows={4} />
      ) : items.length === 0 ? (
        <EmptyState emoji="🖼️" text="No photos yet" />
      ) : (
        <div className="card-grid">
          {items.map((it) => (
            <div key={it.id} className="item-card glass">
              <div className="thumb">
                {it.imageUrl ? <img src={it.imageUrl} alt={it.title} /> : "🖼️"}
              </div>
              <div className="body">
                <div className="title">{it.title}</div>
                <div className="desc">{it.description || "No description"}</div>
                <div className="meta-row">
                  <span>❤️ {it.likedBy?.length || 0}</span>
                  <span>{fmtDate(it.createdAt)}</span>
                </div>
                <div className="foot">
                  <button className="btn btn-ghost btn-sm" onClick={() => like(it)}>❤️ Like</button>
                  {isAdmin && (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setForm({ title: it.title, imageUrl: it.imageUrl || "", description: it.description || "" }); setFile(null); setModal({ item: it }); }}>✏️</button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(it)}>🗑️</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal title={modal.item ? "Edit image" : "Add image"} onClose={() => setModal(null)}>
          <form onSubmit={save}>
            <Field label="Title">
              <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="Description">
              <textarea className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Upload image (or paste URL below)">
              <input className="input" type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0] || null)} />
            </Field>
            <Field label="Image URL">
              <input className="input" placeholder="https://…" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
            </Field>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
