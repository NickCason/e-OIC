import React, { useState, useEffect, useMemo } from 'react';
import { listJobs, createJob, updateJob, deleteJob, getJobSizeEstimate, importJSON, exportJobJSON } from '../db.js';
import { nav } from '../App.jsx';
import { toast } from '../lib/toast.js';

export default function JobList() {
  const [jobs, setJobs] = useState([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [stats, setStats] = useState({});
  const [search, setSearch] = useState('');

  async function refresh() {
    const all = await listJobs();
    setJobs(all);
    const s = {};
    for (const j of all) s[j.id] = await getJobSizeEstimate(j.id);
    setStats(s);
  }

  useEffect(() => { refresh(); }, []);

  // Soft delete with undo: capture full snapshot of the job, then on undo
  // re-import it. This keeps the undo path simple and reliable.
  async function onDelete(job) {
    const snapshot = await exportJobJSON(job.id);
    await deleteJob(job.id);
    await refresh();
    toast.undoable(`Deleted “${job.name}”`, {
      onUndo: async () => {
        await importJSON(snapshot, { mode: 'replace' });
        await refresh();
      },
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) =>
      [j.name, j.client, j.location].some((v) => (v || '').toLowerCase().includes(q))
    );
  }, [jobs, search]);

  return (
    <>
      <header className="appbar">
        <h1>e-OIC</h1>
        <div className="actions">
          <button className="ghost icon-btn" onClick={() => nav('/settings')} aria-label="Settings">⚙</button>
        </div>
      </header>
      <main>
        {jobs.length > 0 && (
          <input
            className="search-bar"
            placeholder="Search jobs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}

        {jobs.length === 0 && (
          <div className="empty">
            <p>No jobs yet.</p>
            <p>Tap <strong>+</strong> to create your first job.</p>
          </div>
        )}

        {filtered.map((j) => {
          const s = stats[j.id];
          return (
            <div key={j.id} className="list-item" onClick={() => nav(`/job/${j.id}`)}>
              <div className="grow">
                <div className="title">{j.name}</div>
                <div className="subtitle">
                  {j.client && <>{j.client} · </>}
                  {s ? `${s.panels} panel${s.panels !== 1 ? 's' : ''} · ${s.photos} photo${s.photos !== 1 ? 's' : ''}` : '…'}
                  {j.updatedAt ? <> · {fmtRelative(j.updatedAt)}</> : null}
                </div>
              </div>
              <div className="actions">
                <button className="ghost icon-btn" onClick={(e) => { e.stopPropagation(); setEditing(j); }} aria-label="Edit">✎</button>
                <button className="ghost danger icon-btn" onClick={(e) => { e.stopPropagation(); onDelete(j); }} aria-label="Delete">✕</button>
              </div>
            </div>
          );
        })}
      </main>
      <button className="fab" onClick={() => setCreating(true)} aria-label="New job">+</button>
      {creating && <JobModal onClose={() => setCreating(false)} onSaved={refresh} />}
      {editing && <JobModal job={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </>
  );
}

function JobModal({ job = null, onClose, onSaved }) {
  const [name, setName] = useState(job?.name || '');
  const [client, setClient] = useState(job?.client || '');
  const [location, setLocation] = useState(job?.location || '');
  const [notes, setNotes] = useState(job?.notes || '');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    if (job) {
      await updateJob(job.id, { name: name.trim(), client: client.trim(), location: location.trim(), notes });
      toast.show('Job updated');
    } else {
      const created = await createJob({ name: name.trim(), client: client.trim(), location: location.trim(), notes });
      onSaved();
      onClose();
      nav(`/job/${created.id}`);
      return;
    }
    setBusy(false);
    onSaved();
    onClose();
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{job ? 'Edit Job' : 'New Job'}</h2>
        <div className="field">
          <label>Job name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Plant - May 2026" autoFocus />
        </div>
        <div className="field">
          <label>Client (optional)</label>
          <input value={client} onChange={(e) => setClient(e.target.value)} />
        </div>
        <div className="field">
          <label>Location (optional)</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div className="field">
          <label>Job notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="High-level notes for this job. Will be added to the export." />
        </div>
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={submit} disabled={busy || !name.trim()}>{job ? 'Save' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}

export function fmtRelative(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}
