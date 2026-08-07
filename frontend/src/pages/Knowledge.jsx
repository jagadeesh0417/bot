import React, { useCallback, useEffect, useState } from "react";
import { api, formPost, fmtDate } from "../api.js";
import { useToast, Modal, Field, EmptyState, SkeletonRows, Pagination } from "../ui.jsx";

const DOC_TYPES = ["prospectus", "rules", "academic_calendar", "syllabus", "exam_schedule", "fee_structure", "faculty_list", "placement_brochure", "hostel_rules", "transport_details", "library_rules", "other"];

export default function Knowledge() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [file, setFile] = useState(null);
  const [docType, setDocType] = useState("other");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState(null);
  const pageSize = 10;

  useEffect(() => {
    api("/auth/me").then((d) => setUser(d.user)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(`/knowledge?page=${page}&pageSize=${pageSize}`);
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (e) => {
    e.preventDefault();
    if (!file) return toast("Choose a PDF file", "error");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("doc_type", docType);
      if (description) fd.append("description", description);
      const doc = await formPost("/knowledge", fd);
      toast(`Indexed "${doc.title}" (${doc.chunk_count} chunks) — ask the AI about it!`, "success");
      setModal(false);
      setFile(null);
      setDescription("");
      load();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item) => {
    if (!confirm("Delete this document and its indexed chunks?")) return;
    try {
      await api(`/knowledge/${item.id}`, { method: "DELETE" });
      toast("Deleted", "success");
      load();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const isAdmin = user?.role === "admin";

  return (
    <div style={{ paddingTop: 24 }}>
      <div className="panel glass">
        <div className="panel-head">
          <h2>🗂️ Knowledge Base <span className="hint">{total} documents</span></h2>
          {isAdmin && <button className="btn btn-primary btn-sm" onClick={() => setModal(true)}>+ Upload PDF</button>}
        </div>
        <p style={{ color: "var(--text-2)", fontSize: 13, marginBottom: 18 }}>
          PDFs here power the AI assistant — upload prospectus, rules, syllabi, exam schedules and more.
        </p>
        {loading ? (
          <SkeletonRows rows={4} />
        ) : items.length === 0 ? (
          <EmptyState emoji="🗂️" text="No documents yet — upload a PDF to teach the assistant" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {items.map((d) => (
              <div key={d.id} style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "14px 16px", background: "var(--input-bg)", borderRadius: 12, border: "1px solid var(--border)", alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>📄 {d.title}</div>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
                    <span className="tag blue">{d.doc_type}</span> · {d.chunk_count} chunks · {(d.file_size / 1024).toFixed(0)} KB · {fmtDate(d.createdAt)}
                  </div>
                </div>
                {isAdmin && <button className="btn btn-danger btn-sm" onClick={() => remove(d)}>🗑️ Delete</button>}
              </div>
            ))}
          </div>
        )}
        <Pagination page={page} pages={Math.ceil(total / pageSize)} onChange={setPage} />
      </div>

      {modal && (
        <Modal title="Upload PDF" sub="The document is parsed into chunks and indexed for AI answers." onClose={() => setModal(false)}>
          <form onSubmit={upload}>
            <Field label="PDF file">
              <input className="input" type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files[0] || null)} required />
            </Field>
            <Field label="Document type">
              <select className="select" value={docType} onChange={(e) => setDocType(e.target.value)}>
                {DOC_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select>
            </Field>
            <Field label="Description (optional)">
              <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy}>{busy ? "Indexing…" : "Upload & Index"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
