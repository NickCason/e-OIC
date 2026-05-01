import React, { useState, useEffect } from 'react';
import {
  getJob, listPanels, createPanel, updatePanel, deletePanel, duplicatePanel,
  listAllRows, listPanelPhotos, exportJobJSON, importJSON, updateJob,
} from '../db.js';
import { getPanelProgress, getJobAggregateStats, getJobChecklist } from '../lib/metrics.js';
import { nav } from '../App.jsx';
import { toast } from '../lib/toast.js';
import ExportDialog from './ExportDialog.jsx';
import ResyncDialog from './ResyncDialog.jsx';
import { fmtRelative } from './JobList.jsx';
import AppBar from './AppBar.jsx';
import Icon from './Icon.jsx';
import EmptyState from './EmptyState.jsx';
import PercentRing from './PercentRing.jsx';
import PercentBar from './PercentBar.jsx';

export default function JobView({ jobId }) {
  const [job, setJob] = useState(null);
  const [panels, setPanels] = useState([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [stats, setStats] = useState({});
  const [panelPercents, setPanelPercents] = useState({});
  const [aggregate, setAggregate] = useState({ panelCount: 0, photoCount: 0, jobPercent: 0 });
  const [checklistTotals, setChecklistTotals] = useState({ checked: 0, total: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  async function refresh() {
    const j = await getJob(jobId);
    if (!j) { nav('/'); return; }
    setJob(j);
    const ps = await listPanels(jobId);
    setPanels(ps);
    const s = {};
    const pp = {};
    for (const p of ps) {
      const rows = await listAllRows(p.id);
      const photos = await listPanelPhotos(p.id);
      s[p.id] = { rows: rows.length, photos: photos.length };
      pp[p.id] = (await getPanelProgress(p.id)).percent;
    }
    setStats(s);
    setPanelPercents(pp);
    setAggregate(await getJobAggregateStats(jobId));
    const tasks = await getJobChecklist(jobId);
    setChecklistTotals({ checked: tasks.filter((t) => t.completed).length, total: tasks.length });
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh is a non-stable inline async fn; adding it would infinite-loop. Intent: run only when jobId changes.
  useEffect(() => { refresh(); }, [jobId]);
  useEffect(() => {
    const onFocus = () => { refresh(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh is a non-stable inline async fn; only state it reads is jobId (already the dep), so the closure is correct on each re-creation.
  }, [jobId]);

  async function onDelete(panel) {
    // Snapshot panel via per-job export, then filter to just this panel's data
    // for the undo. Easiest: just snapshot the whole job and re-import the
    // panel-related slices on undo. We'll do the simpler thing — full
    // job snapshot, replace on undo (will atomically restore the panel).
    const snapshot = await exportJobJSON(jobId);
    await deletePanel(panel.id);
    await refresh();
    toast.undoable(`Deleted panel “${panel.name}”`, {
      onUndo: async () => {
        await importJSON(snapshot, { mode: 'replace' });
        await refresh();
      },
    });
  }

  async function onDuplicate(panel) {
    const newName = prompt(`Duplicate “${panel.name}” as:`, `${panel.name} (copy)`);
    if (!newName?.trim()) return;
    const dup = await duplicatePanel(panel.id, newName.trim());
    await refresh();
    toast.show(`Duplicated as “${dup.name}” (rows copied, photos not)`);
  }

  async function handleDisconnect() {
    await updateJob(job.id, { source: null });
    setConfirmingDisconnect(false);
    await refresh();
  }

  async function onBackupJob() {
    try {
      const snapshot = await exportJobJSON(jobId);
      const blob = new Blob([JSON.stringify(snapshot)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${job.name}-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast.show('Job backup downloaded');
    } catch (e) {
      toast.error('Backup failed: ' + (e.message || ''));
    }
  }

  if (!job) return null;

  const crumbBits = [];
  if (job.client) crumbBits.push(job.client);
  if (job.location) crumbBits.push(job.location);
  if (job.updatedAt) crumbBits.push(fmtRelative(job.updatedAt));
  const crumb = crumbBits.join(' · ');
  const totalPanels = panels.length;

  return (
    <>
      <AppBar
        onBack={() => nav('/')}
        wordmark={job.name || 'e-OIC'}
        crumb={crumb || undefined}
        actions={
          <>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setMenuOpen(true)}
              aria-label="More"
            >
              <Icon name="more" size={20} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setExporting(true)}
              disabled={panels.length === 0}
              aria-label="Export"
            >
              <Icon name="download" size={20} />
            </button>
          </>
        }
      />
      <main>
        <div className="hero">
          <div className="hero-pretitle">
            {`JOB · ${aggregate.jobPercent}% COMPLETE · ${aggregate.panelCount} PANEL${aggregate.panelCount === 1 ? '' : 'S'} · ${aggregate.photoCount} PHOTO${aggregate.photoCount === 1 ? '' : 'S'}`}
          </div>
          <h1 className="hero-title">{job.name || 'Loading…'}</h1>
        </div>
        <button
          type="button"
          className="checklist-cta"
          onClick={() => nav(`/job/${jobId}/checklist`)}
        >
          <div className="checklist-cta__top">
            <span className="checklist-cta__title">Checklist</span>
            <span className="checklist-cta__count">
              {checklistTotals.checked} / {checklistTotals.total} · {aggregate.jobPercent}%
            </span>
          </div>
          <PercentBar
            percent={aggregate.jobPercent}
            height={6}
            ariaLabel={`Checklist ${aggregate.jobPercent}% complete`}
          />
        </button>
        {panels.length === 0 && (
          <EmptyState
            icon="add"
            title="No panels yet"
            body={`Tap the + button below to add the first panel to ${job.name || 'this job'}.`}
            pointTo="fab"
          />
        )}
        {panels.map((p) => {
          const s = stats[p.id] || { rows: 0, photos: 0 };
          return (
            <div key={p.id} className="list-item" onClick={() => nav(`/job/${jobId}/panel/${p.id}`)}>
              <div className="grow">
                <div className="title">{p.name}</div>
                <div className="subtitle">
                  {s.rows} row{s.rows !== 1 ? 's' : ''} · {s.photos} photo{s.photos !== 1 ? 's' : ''}
                  {p.updatedAt && <> · {fmtRelative(p.updatedAt)}</>}
                </div>
              </div>
              <PercentRing
                percent={panelPercents[p.id] ?? 0}
                size={36}
                stroke={3}
                className="panel-row-ring"
                ariaLabel={`${panelPercents[p.id] ?? 0}% complete`}
              >
                <span className="panel-row-ring__pct">{panelPercents[p.id] ?? 0}</span>
              </PercentRing>
              <div className="actions">
                <button className="ghost icon-btn" onClick={(e) => { e.stopPropagation(); setEditing(p); }} aria-label="Edit">✎</button>
                <button className="ghost icon-btn" onClick={(e) => { e.stopPropagation(); onDuplicate(p); }} aria-label="Duplicate">⧉</button>
                <button className="ghost danger icon-btn" onClick={(e) => { e.stopPropagation(); onDelete(p); }} aria-label="Delete">✕</button>
              </div>
            </div>
          );
        })}
      </main>
      <button className="fab" onClick={() => setCreating(true)} aria-label="New panel">+</button>
      {creating && <PanelModal jobId={jobId} onClose={() => setCreating(false)} onSaved={refresh} />}
      {editing && <PanelModal jobId={jobId} panel={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      {exporting && <ExportDialog job={job} onClose={() => setExporting(false)} />}
      {resyncing && (
        <ResyncDialog
          job={job}
          onClose={() => setResyncing(false)}
          onApplied={() => { refresh(); }}
        />
      )}
      {confirmingDisconnect && (
        <div className="modal-bg" onClick={() => setConfirmingDisconnect(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Disconnect from xlsx?</h2>
            <p style={{ color: 'var(--text-dim)' }}>
              This job will no longer be linked to <strong>{job.source?.filename}</strong>.
              Future pushes will save as new.
            </p>
            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={() => setConfirmingDisconnect(false)}>Cancel</button>
              <button className="primary" onClick={handleDisconnect}>Disconnect</button>
            </div>
          </div>
        </div>
      )}
      {menuOpen && (
        <div className="modal-bg" onClick={() => setMenuOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Job options</h2>
            <button className="modal-list-btn" onClick={() => { setMenuOpen(false); onBackupJob(); }}>⬇ Back up this job</button>
            <button className="modal-list-btn" onClick={() => { setMenuOpen(false); setEditing({ ...job, _isJob: true }); }}>✎ Edit job details</button>
            <button className="modal-list-btn" onClick={() => { setMenuOpen(false); setResyncing(true); }}>↻ Re-sync from xlsx</button>
            {job.source && (
              <button className="modal-list-btn" onClick={() => { setMenuOpen(false); setConfirmingDisconnect(true); }}>⛓ Disconnect from xlsx</button>
            )}
            <div className="btn-row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={() => setMenuOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PanelModal({ jobId, panel = null, onClose, onSaved }) {
  const isJobEdit = panel?._isJob;
  const [name, setName] = useState(panel?.name || '');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    if (isJobEdit) {
      await updateJob(panel.id, { name: name.trim() });
    } else if (panel) {
      await updatePanel(panel.id, { name: name.trim() });
      toast.show('Panel renamed');
    } else {
      const created = await createPanel({ jobId, name: name.trim() });
      onSaved();
      onClose();
      nav(`/job/${jobId}/panel/${created.id}`);
      return;
    }
    setBusy(false);
    onSaved();
    onClose();
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{panel ? (isJobEdit ? 'Edit job name' : 'Edit Panel') : 'New Panel'}</h2>
        {!panel && (
          <p style={{ color: 'var(--text-dim)', marginTop: 0, fontSize: 13 }}>
            A panel is your working unit. Each gets its own photo folders and rows across all 13 sheets.
          </p>
        )}
        <div className="field">
          <label>{isJobEdit ? 'Job name' : 'Panel name'} *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={isJobEdit ? '' : 'e.g. CP2'} autoFocus />
        </div>
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={submit} disabled={busy || !name.trim()}>{panel ? 'Save' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}
