import React, { useState, useEffect, useMemo } from 'react';
import { listJobs, createJob, updateJob, deleteJob, getJobSizeEstimate, exportJobRaw, restoreJobRaw } from '../db';
import { getJobPercent } from '../lib/metrics';
import PercentRing from './PercentRing';
import { nav } from '../App.jsx';
import { toast } from '../lib/toast';
import AppBar from './AppBar.jsx';
import EmptyState from './EmptyState';
import CountUp from './CountUp';
import Icon from './Icon';
import Marquee from './Marquee';
import PullOrNewModal from './PullOrNewModal.jsx';
import PullDialog from './PullDialog.jsx';
import InstallBanner from './InstallBanner.jsx';
import WrapperUpdateBanner from './WrapperUpdateBanner.jsx';

export default function JobList() {
  const [jobs, setJobs] = useState([]);
  const [choosing, setChoosing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [editing, setEditing] = useState(null);
  const [stats, setStats] = useState({});
  const [percents, setPercents] = useState({});
  const [search, setSearch] = useState('');

  async function refresh() {
    const all = await listJobs();
    setJobs(all);
    const results = await Promise.all(
      all.map(async (j) => {
        const [size, pct] = await Promise.all([
          getJobSizeEstimate(j.id),
          getJobPercent(j.id),
        ]);
        return [j.id, size, pct];
      })
    );
    const s = {};
    const p = {};
    for (const [id, size, pct] of results) {
      s[id] = size;
      p[id] = pct;
    }
    setStats(s);
    setPercents(p);
  }

  useEffect(() => { refresh(); }, []);

  async function onDelete(job) {
    const snapshot = await exportJobRaw(job.id);
    await deleteJob(job.id);
    await refresh();
    toast.undoable(`Deleted "${job.name}"`, {
      onUndo: async () => {
        await restoreJobRaw(snapshot);
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

  // Aggregate stats across all jobs for the hero stat row.
  const totals = useMemo(() => {
    let panels = 0, photos = 0, inProgress = 0, percentSum = 0, percentCount = 0;
    for (const j of jobs) {
      const s = stats[j.id];
      if (s) {
        panels += s.panels || 0;
        photos += s.photos || 0;
        if ((s.panels || 0) > 0) inProgress += 1;
      }
      if (percents[j.id] != null) {
        percentSum += percents[j.id];
        percentCount += 1;
      }
    }
    const avgPercent = percentCount > 0 ? Math.round(percentSum / percentCount) : 0;
    return { panels, photos, inProgress, total: jobs.length, avgPercent };
  }, [jobs, stats, percents]);

  return (
    <>
      <AppBar
        wordmark="e-OIC"
        actions={
          <button
            className="icon-btn"
            onClick={() => nav('/settings')}
            aria-label="Settings"
            type="button"
          >
            <Icon name="settings" size={20} />
          </button>
        }
      />
      <main>
        <WrapperUpdateBanner />
        <InstallBanner />
        <div className="hero">
          <div className="hero-pretitle">
            {jobs.length === 0
              ? 'NO JOBS YET'
              : `${jobs.length} ${jobs.length === 1 ? 'INVESTIGATION' : 'INVESTIGATIONS'}`}
          </div>
          <h1 className="hero-title">Your jobs</h1>
        </div>

        {jobs.length > 0 && (
          <>
            <div className="search-wrap">
              <Icon name="search" size={16} className="search-icon" />
              <input
                className="search-bar search-bar--with-icon"
                placeholder="Search jobs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="stat-row stat-row--four">
              <div className="stat-tile">
                <div className="stat-label">Active</div>
                <div className="stat-val">{totals.inProgress}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Panels</div>
                <div className="stat-val">{totals.panels}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Photos</div>
                <div className="stat-val">{totals.photos}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Average</div>
                <div className="stat-val">{totals.avgPercent}%</div>
              </div>
            </div>
          </>
        )}

        {jobs.length === 0 && (
          <EmptyState
            icon="add"
            title="No jobs yet"
            body="Start your first investigation."
            onIconClick={() => setChoosing(true)}
            iconLabel="New job"
          />
        )}

        {filtered.map((j) => {
          const s = stats[j.id];
          return (
            <div key={j.id} className="job-card" onClick={() => nav(`/job/${j.id}`)}>
              <PercentRing
                percent={percents[j.id] ?? 0}
                size={56}
                stroke={5}
                className="job-monogram-ring"
                ariaLabel={`${percents[j.id] ?? 0}% complete`}
              >
                {monogram(j.name)}
              </PercentRing>
              <div className="job-grow">
                <div className="job-title"><Marquee>{j.name}</Marquee></div>
                <div className="job-sub">
                  <Marquee>
                    {j.client && <>{j.client} · </>}
                    {s
                      ? <><CountUp value={s.panels} /> {pl(s.panels, 'panel')} · <CountUp value={s.photos} /> {pl(s.photos, 'photo')}</>
                      : '…'}
                    {j.updatedAt ? <> · {fmtRelative(j.updatedAt)}</> : null}
                  </Marquee>
                </div>
              </div>
              <div className="job-actions">
                <button
                  className="icon-btn ghost"
                  onClick={(e) => { e.stopPropagation(); setEditing(j); }}
                  aria-label="Edit"
                  type="button"
                >
                  <Icon name="edit" size={16} />
                </button>
                <button
                  className="icon-btn ghost danger"
                  onClick={(e) => { e.stopPropagation(); onDelete(j); }}
                  aria-label="Delete"
                  type="button"
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </main>
      <button className="fab" onClick={() => setChoosing(true)} aria-label="New job">
        <Icon name="add" size={24} strokeWidth={2.25} />
      </button>
      {choosing && (
        <PullOrNewModal
          onClose={() => setChoosing(false)}
          onNew={() => { setChoosing(false); setCreating(true); }}
          onPull={() => { setChoosing(false); setPulling(true); }}
        />
      )}
      {creating && <JobModal onClose={() => setCreating(false)} onSaved={refresh} />}
      {pulling && <PullDialog onClose={() => setPulling(false)} onCreated={refresh} />}
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
      await updateJob(job.id, {
        name: name.trim(),
        client: client.trim(),
        location: location.trim(),
        notes,
      });
      toast.show('Job updated');
    } else {
      const created = await createJob({
        name: name.trim(),
        client: client.trim(),
        location: location.trim(),
        notes,
      });
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
        <h2 className="modal-title">{job ? 'Edit job' : 'New job'}</h2>
        <div className="field">
          <label>Job name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Plant — May 2026"
            autoFocus
          />
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
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="High-level notes for this job. Will be added to the export."
          />
        </div>
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button
            className="primary"
            onClick={submit}
            disabled={busy || !name.trim()}
          >
            {job ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function monogram(name) {
  if (!name) return '·';
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '·';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function pl(n, word) { return n === 1 ? word : `${word}s`; }

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
