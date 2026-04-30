import React, { useState, useEffect } from 'react';
import { buildExport, downloadBlob, shareBlob } from '../exporter.js';
import { getJobSizeEstimate } from '../db.js';
import { toast } from '../lib/toast.js';

export default function ExportDialog({ job, onClose }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, phase: '', detail: '' });
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    getJobSizeEstimate(job.id).then(setStats);
  }, [job.id]);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress({ percent: 0, phase: 'starting', detail: '' });
    try {
      const r = await buildExport(job, {
        onProgress: setProgress,
      });
      setResult(r);
    } catch (e) {
      console.error(e);
      // Friendly error messages for the most common failure modes
      let msg = e.message || 'Export failed';
      if (/quota|memory|out of memory/i.test(msg)) {
        msg = 'Ran out of memory while building the export. Try exporting fewer panels at a time, or close other browser tabs.';
      } else if (/template/i.test(msg)) {
        msg = 'Could not load template.xlsx. The app may need to be reopened to refresh its cache.';
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function onDownload() {
    if (!result) return;
    downloadBlob(result.blob, result.filename);
    toast.show('Downloaded');
  }

  async function onShare() {
    if (!result) return;
    try {
      const shared = await shareBlob(result.blob, result.filename, job.name);
      if (!shared) {
        downloadBlob(result.blob, result.filename);
        toast.show('Share not supported — downloaded instead');
      }
    } catch (e) {
      // User cancelled the share sheet — silent
      if (e.name !== 'AbortError') toast.error(e.message || 'Share failed');
    }
  }

  const sizeMB = result ? (result.sizeBytes / 1024 / 1024).toFixed(1) : null;

  return (
    <div className="modal-bg" onClick={busy ? null : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Export Job</h2>
        <p style={{ color: 'var(--text-dim)', marginTop: 0, fontSize: 14 }}>
          <strong>{job.name}</strong>
          {stats && <> · {stats.panels} panel{stats.panels !== 1 ? 's' : ''} · {stats.rows} row{stats.rows !== 1 ? 's' : ''} · {stats.photos} photo{stats.photos !== 1 ? 's' : ''}</>}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          Output: a single zip with the populated spreadsheet, a photo-metadata CSV (with GPS), and photos organized by panel and item/row.
        </p>

        {!result && !busy && (
          <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
            <button className="ghost" onClick={onClose}>Cancel</button>
            <button className="primary" onClick={run}>Build Export</button>
          </div>
        )}

        {busy && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              {progress.phase}{progress.detail ? ` · ${progress.detail}` : ''}
            </div>
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${progress.percent || 0}%` }} />
            </div>
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--danger)', marginTop: 12, padding: 10, border: '1px solid var(--danger)', borderRadius: 8 }}>
            {error}
            <div className="btn-row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
              <button onClick={onClose}>Close</button>
              <button className="primary" onClick={run}>Retry</button>
            </div>
          </div>
        )}

        {result && (
          <>
            <div className="card" style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Ready</div>
              <div style={{ fontWeight: 600, marginTop: 2 }}>{result.filename}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{sizeMB} MB</div>
            </div>
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button onClick={onDownload}>⬇ Download</button>
              <button className="primary" onClick={onShare}>📤 Share / Email / Cloud</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
              "Share" opens your phone's share sheet — pick Mail, Drive, Dropbox, SharePoint, etc.
            </div>
            <div className="btn-row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
