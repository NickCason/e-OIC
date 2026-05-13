import React, { useState, useEffect } from 'react';
import {
  getJob, listPanels, createPanel, updatePanel, deletePanel, duplicatePanel,
  listAllRows, listPanelPhotos, exportJobJSON, updateJob,
  exportPanelRaw, restorePanelRaw,
} from '../db';
import { getPanelProgress, getJobAggregateStats, getJobChecklist } from '../lib/metrics';
import { nav } from '../App.jsx';
import { toast } from '../lib/toast';
import ExportDialog from './ExportDialog.jsx';
import ResyncDialog from './ResyncDialog.jsx';
import { fmtRelative } from './JobList.jsx';
import AppBar from './AppBar';
import Icon from './Icon';
import EmptyState from './EmptyState';
import Marquee from './Marquee';
import CountUp from './CountUp';
import PercentRing from './PercentRing';
import PercentBar from './PercentBar';

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
  const [duplicating, setDuplicating] = useState(null); // panel being duplicated
  const [duplicateName, setDuplicateName] = useState('');

  async function refresh() {
    const j = await getJob(jobId);
    if (!j) { nav('/'); return; }
    setJob(j);
    const ps = await listPanels(jobId);
    setPanels(ps);
    const perPanel = await Promise.all(
      ps.map(async (p) => {
        const [rows, photos, progress] = await Promise.all([
          listAllRows(p.id),
          listPanelPhotos(p.id),
          getPanelProgress(p.id),
        ]);
        return [p.id, { rows: rows.length, photos: photos.length }, progress.percent];
      })
    );
    const s = {};
    const pp = {};
    for (const [id, sizes, pct] of perPanel) {
      s[id] = sizes;
      pp[id] = pct;
    }
    setStats(s);
    setPanelPercents(pp);
    const [agg, tasks] = await Promise.all([
      getJobAggregateStats(jobId),
      getJobChecklist(jobId),
    ]);
    setAggregate(agg);
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
    const snapshot = await exportPanelRaw(panel.id);
    await deletePanel(panel.id);
    await refresh();
    toast.undoable(`Deleted panel “${panel.name}”`, {
      onUndo: async () => {
        await restorePanelRaw(snapshot);
        await refresh();
      },
    });
  }

  function onDuplicate(panel) {
    setDuplicating(panel);
    setDuplicateName(`${panel.name} (copy)`);
  }

  async function confirmDuplicate() {
    const newName = duplicateName.trim();
    if (!newName || !duplicating) return;
    const dup = await duplicatePanel(duplicating.id, newName);
    setDuplicating(null);
    setDuplicateName('');
    await refresh();
    toast.show(`Duplicated as “${dup.name}”`);
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

  if (!job) {
    return (
      <>
        <AppBar onBack={() => nav('/')} wordmark="" />
        <main>
          <div className="hero">
            <div className="skeleton-bar skeleton-bar--sub skeleton-shimmer" />
            <div className="skeleton-bar skeleton-shimmer" style={{ width: '60%', height: 28, marginTop: 8 }} />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton-row">
              <div className="skeleton-grow">
                <div className="skeleton-bar skeleton-bar--title skeleton-shimmer" />
                <div className="skeleton-bar skeleton-bar--sub skeleton-shimmer" />
              </div>
              <div className="skeleton-circle skeleton-shimmer" />
            </div>
          ))}
        </main>
      </>
    );
  }

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
            JOB · <CountUp value={aggregate.jobPercent} />% COMPLETE
            {' · '}<CountUp value={aggregate.panelCount} /> PANEL{aggregate.panelCount === 1 ? '' : 'S'}
            {' · '}<CountUp value={aggregate.photoCount} /> PHOTO{aggregate.photoCount === 1 ? '' : 'S'}
          </div>
          <h1 className="hero-title"><Marquee>{job.name || 'Loading…'}</Marquee></h1>
        </div>
        <button
          type="button"
          className="checklist-cta"
          onClick={() => nav(`/job/${jobId}/checklist`)}
        >
          <div className="checklist-cta__top">
            <span className="checklist-cta__title">Checklist</span>
            <span className="checklist-cta__count">
              <CountUp value={checklistTotals.checked} /> / <CountUp value={checklistTotals.total} /> · <CountUp value={aggregate.jobPercent} />%
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
            body={`Add the first panel to ${job.name || 'this job'}.`}
            onIconClick={() => setCreating(true)}
            iconLabel="Add panel"
          />
        )}
        {panels.map((p) => {
          const s = stats[p.id] || { rows: 0, photos: 0 };
          return (
            <div key={p.id} className="list-item" onClick={() => nav(`/job/${jobId}/panel/${p.id}`)}>
              <div className="grow">
                <div className="title"><Marquee>{p.name}</Marquee></div>
                <div className="subtitle">
                  <CountUp value={s.rows} /> row{s.rows !== 1 ? 's' : ''} · <CountUp value={s.photos} /> photo{s.photos !== 1 ? 's' : ''}
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
                <span className="panel-row-ring__pct"><CountUp value={panelPercents[p.id] ?? 0} /></span>
              </PercentRing>
              <div className="actions">
                <button className="ghost icon-btn" onClick={(e) => { e.stopPropagation(); setEditing(p); }} aria-label="Edit">
                  <Icon name="edit" size={16} />
                </button>
                <button className="ghost icon-btn" onClick={(e) => { e.stopPropagation(); onDuplicate(p); }} aria-label="Duplicate">
                  <Icon name="copy" size={16} />
                </button>
                <button className="ghost danger icon-btn" onClick={(e) => { e.stopPropagation(); onDelete(p); }} aria-label="Delete">
                  <Icon name="trash" size={16} />
                </button>
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
      {duplicating && (
        <div className="modal-bg" onClick={() => setDuplicating(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Duplicate panel</h2>
            <div className="field">
              <label>New panel name</label>
              <input
                value={duplicateName}
                onChange={(e) => setDuplicateName(e.target.value)}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') confirmDuplicate(); }}
              />
            </div>
            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={() => setDuplicating(null)}>Cancel</button>
              <button className="primary" onClick={confirmDuplicate} disabled={!duplicateName.trim()}>
                Duplicate
              </button>
            </div>
          </div>
        </div>
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
            <button className="modal-list-btn" onClick={() => { setMenuOpen(false); onBackupJob(); }}>
              <Icon name="download" size={16} /><span style={{ marginLeft: 8 }}>Back up this job</span>
            </button>
            <button className="modal-list-btn" onClick={() => { setMenuOpen(false); setEditing({ ...job, _isJob: true }); }}>
              <Icon name="edit" size={16} /><span style={{ marginLeft: 8 }}>Edit job details</span>
            </button>
            <button className="modal-list-btn" onClick={() => { setMenuOpen(false); setResyncing(true); }}>
              <Icon name="refresh" size={16} /><span style={{ marginLeft: 8 }}>Re-sync from xlsx</span>
            </button>
            {job.source && (
              <button className="modal-list-btn" onClick={() => { setMenuOpen(false); setConfirmingDisconnect(true); }}>
                <Icon name="unlink" size={16} /><span style={{ marginLeft: 8 }}>Disconnect from xlsx</span>
              </button>
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
            One panel per cabinet. Photos and notes live inside.
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
