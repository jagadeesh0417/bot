import React, { useCallback, useEffect, useState } from "react";
import { api, fmtDate } from "../api.js";
import { useToast, Modal, Field, Pagination, EmptyState, SkeletonRows } from "../ui.jsx";

const CONFIGS = {
  students: {
    api: "/students",
    singular: "student",
    label: "Students",
    emoji: "🧑‍🎓",
    adminOnly: true,
    searchable: true,
    columns: [
      { key: "name", label: "Student" },
      { key: "email", label: "Email", render: (v) => <span style={{ color: "var(--text-2)" }}>{v}</span> },
      { key: "studentId", label: "ID" },
      { key: "department", label: "Department" },
      { key: "semester", label: "Sem" },
      { key: "status", label: "Status", render: (v) => <span className={`tag ${v === "active" ? "green" : "red"}`}>{v}</span> },
    ],
    fields: [
      { key: "name", label: "Full name", required: true },
      { key: "email", label: "Email", required: true },
      { key: "password", label: "Temporary password (default: Student@123)" },
      { key: "studentId", label: "Student ID" },
      { key: "department", label: "Department" },
      { key: "semester", label: "Semester", type: "number" },
      { key: "phone", label: "Phone" },
      { key: "address", label: "Address", type: "textarea" },
    ],
  },
  faculty: {
    api: "/faculty",
    singular: "faculty member",
    label: "Faculty",
    emoji: "👩‍🏫",
    adminOnly: true,
    searchable: true,
    columns: [
      { key: "name", label: "Name" },
      { key: "designation", label: "Designation" },
      { key: "department", label: "Department" },
      { key: "qualification", label: "Qualification" },
      { key: "experience", label: "Exp (yrs)" },
    ],
    fields: [
      { key: "name", label: "Full name", required: true },
      { key: "email", label: "Email" },
      { key: "department", label: "Department", required: true },
      { key: "designation", label: "Designation" },
      { key: "qualification", label: "Qualification" },
      { key: "experience", label: "Experience (years)", type: "number" },
      { key: "phone", label: "Phone" },
      { key: "bio", label: "Bio", type: "textarea" },
    ],
  },
  departments: {
    api: "/departments",
    singular: "department",
    label: "Departments",
    emoji: "🏛️",
    adminOnly: true,
    searchable: true,
    columns: [
      { key: "name", label: "Name" },
      { key: "code", label: "Code" },
      { key: "head", label: "Head" },
      { key: "established", label: "Established" },
    ],
    fields: [
      { key: "name", label: "Department name", required: true },
      { key: "code", label: "Code (e.g. CSE)", required: true },
      { key: "head", label: "Head of department" },
      { key: "established", label: "Year established", type: "number" },
      { key: "description", label: "Description", type: "textarea" },
    ],
  },
  courses: {
    api: "/courses",
    singular: "course",
    label: "Courses",
    emoji: "📚",
    adminOnly: true,
    searchable: true,
    columns: [
      { key: "name", label: "Course" },
      { key: "code", label: "Code" },
      { key: "department", label: "Department" },
      { key: "semester", label: "Semester" },
      { key: "credits", label: "Credits" },
    ],
    fields: [
      { key: "name", label: "Course name", required: true },
      { key: "code", label: "Code (e.g. CS301)", required: true },
      { key: "department", label: "Department" },
      { key: "semester", label: "Semester", type: "number" },
      { key: "credits", label: "Credits", type: "number" },
      { key: "description", label: "Description", type: "textarea" },
    ],
  },
  notices: {
    api: "/notices",
    singular: "notice",
    label: "Notices",
    emoji: "📢",
    adminOnly: true,
    searchable: true,
    columns: [
      { key: "title", label: "Title" },
      { key: "category", label: "Category" },
      { key: "pinned", label: "Pinned", render: (v) => (v ? <span className="tag amber">pinned</span> : "—") },
      { key: "createdAt", label: "Posted", render: (v) => fmtDate(v) },
    ],
    fields: [
      { key: "title", label: "Title", required: true },
      { key: "category", label: "Category" },
      { key: "pinned", label: "Pinned", type: "checkbox" },
      { key: "description", label: "Description", type: "textarea" },
    ],
  },
  events: {
    api: "/events",
    singular: "event",
    label: "Events",
    emoji: "🎉",
    adminOnly: true,
    searchable: true,
    columns: [
      { key: "title", label: "Event" },
      { key: "category", label: "Category" },
      { key: "date", label: "Date", render: (v) => fmtDate(v, false) },
      { key: "venue", label: "Venue" },
    ],
    fields: [
      { key: "title", label: "Event name", required: true },
      { key: "category", label: "Category" },
      { key: "date", label: "Date (YYYY-MM-DD)" },
      { key: "venue", label: "Venue" },
      { key: "description", label: "Description", type: "textarea" },
    ],
  },
  placements: {
    api: "/placements",
    singular: "placement",
    label: "Placements",
    emoji: "💼",
    adminOnly: true,
    searchable: true,
    columns: [
      { key: "title", label: "Title" },
      { key: "company", label: "Company" },
      { key: "package", label: "Package (LPA)" },
      { key: "driveDate", label: "Drive date", render: (v) => fmtDate(v, false) },
      { key: "eligibleDepartments", label: "Departments" },
    ],
    fields: [
      { key: "title", label: "Role title", required: true },
      { key: "company", label: "Company" },
      { key: "package", label: "Package (LPA)" },
      { key: "driveDate", label: "Drive date (YYYY-MM-DD)" },
      { key: "eligibleDepartments", label: "Eligible departments (comma separated)" },
      { key: "description", label: "Description", type: "textarea" },
    ],
  },
  timetable: {
    api: "/timetable",
    singular: "timetable",
    label: "Timetable",
    emoji: "🗓️",
    adminOnly: true,
    searchable: false,
    columns: [
      { key: "title", label: "Title" },
      { key: "department", label: "Department" },
      { key: "semester", label: "Semester" },
      { key: "day", label: "Day" },
      { key: "startTime", label: "Start" },
      { key: "endTime", label: "End" },
    ],
    fields: [
      { key: "title", label: "Title (e.g. CS301 – Data Structures)", required: true },
      { key: "department", label: "Department" },
      { key: "semester", label: "Semester", type: "number" },
      { key: "day", label: "Day (Mon–Fri)" },
      { key: "startTime", label: "Start time (e.g. 09:00)" },
      { key: "endTime", label: "End time (e.g. 10:00)" },
    ],
  },
};

export default function GenericList({ type }) {
  const cfg = CONFIGS[type];
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { mode: 'create' | 'edit', item }
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const pageSize = 10;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [debounced]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, pageSize });
      if (cfg.searchable && debounced) params.set("q", debounced);
      const res = await api(`${cfg.api}?${params}`);
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [page, debounced, cfg.api, cfg.searchable]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    const f = {};
    cfg.fields.forEach((x) => (f[x.key] = x.type === "checkbox" ? false : ""));
    setForm(f);
    setModal({ mode: "create" });
  };

  const openEdit = (item) => {
    const f = {};
    cfg.fields.forEach((x) => (f[x.key] = item[x.key] ?? (x.type === "checkbox" ? false : "")));
    setForm(f);
    setModal({ mode: "edit", item });
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (modal.mode === "create") {
        await api(cfg.api, { method: "POST", body: JSON.stringify(form) });
        toast(`${cfg.singular} created`, "success");
      } else {
        await api(`${cfg.api}/${modal.item.id}`, { method: "PATCH", body: JSON.stringify(form) });
        toast(`${cfg.singular} updated`, "success");
      }
      setModal(null);
      load();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item) => {
    if (!confirm(`Delete this ${cfg.singular}?`)) return;
    try {
      await api(`${cfg.api}/${item.id}`, { method: "DELETE" });
      toast(`${cfg.singular} deleted`, "success");
      load();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  return (
    <div style={{ paddingTop: 24 }}>
      <div className="panel glass">
        <div className="panel-head">
          <h2>{cfg.emoji} {cfg.label} <span className="hint">{total} total</span></h2>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {cfg.searchable && (
              <div className="search-bar">
                <input className="input" placeholder={`Search ${cfg.label.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            )}
            <button className="btn btn-primary btn-sm" onClick={openCreate}>+ Add {cfg.singular}</button>
          </div>
        </div>

        {loading ? (
          <SkeletonRows rows={5} />
        ) : items.length === 0 ? (
          <EmptyState text={`No ${cfg.label.toLowerCase()} found`} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {cfg.columns.map((c) => <th key={c.key}>{c.label}</th>)}
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    {cfg.columns.map((c) => (
                      <td key={c.key}>
                        {c.render ? c.render(it[c.key]) : (it[c.key] ?? "—")}
                      </td>
                    ))}
                    <td>
                      <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(it)}>✏️</button>
                        <button className="btn btn-danger btn-sm" onClick={() => remove(it)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={Math.ceil(total / pageSize)} onChange={setPage} />
      </div>

      {modal && (
        <Modal
          title={modal.mode === "create" ? `Add ${cfg.singular}` : `Edit ${cfg.singular}`}
          onClose={() => setModal(null)}
          wide={cfg.fields.length > 4}
        >
          <form onSubmit={save}>
            {cfg.fields.map((f) => (
              <Field key={f.key} label={f.label}>
                {f.type === "textarea" ? (
                  <textarea className="textarea" required={f.required} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                ) : f.type === "checkbox" ? (
                  <input type="checkbox" checked={Boolean(form[f.key])} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} />
                ) : (
                  <input className="input" type={f.type || "text"} required={f.required} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                )}
              </Field>
            ))}
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
