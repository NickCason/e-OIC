import React, { useState, useEffect } from 'react';
import Icon from './Icon.jsx';
import { buildExport, downloadBlob, shareBlob } from '../exporter.js';
import { getJobSizeEstimate } from '../db.js';
import { toast } from '../lib/toast.js';

export default function ExportDialog({ job, onClose }) {
  // 'config' | 'generating' | 'done' | 'error'
  const [stage, setStage] = useState('config');
  const [progress, setProgress] = useState({ percent: 0, phase: '', detail: '' });
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    getJobSizeEstimate(job.id).then(setStats);
  }, [job.id]);

  async function generate() {
    setStage('generating');
    setError(null);
    setResult(null);
    setProgress({ percent: 0, phase: 'starting', detail: '' });
    try {
      const r = await buildExport(job, {
        onProgress: setProgress,
      });
      setResult(r);
      setStage('done');
    } catch (e) {
      console.error(e);
      let msg = e.message || 'Export failed';
      if (/quota|memory|out of memory/i.test(msg)) {
        msg = 'Ran out of memory while building the export. Try exporting fewer panels at a time, or close other browser tabs.';
      } else if (/template/i.test(msg)) {
        msg = 'Could not load template.xlsx. The app may need to be reopened to refresh its cache.';
      }
      setError(msg);
      toast.error('Export failed: ' + msg);
      setStage('error');
    }
  }

  function onDownload() {
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
      if (e.name !== 'AbortError') toast.error(e.message || 'Share failed');
    }
  }

  const sizeMB = result ? (result.sizeBytes / 1024 / 1024).toFixed(1) : null;
  const progressText = progress.phase
    ? `${progress.phase}${progress.detail ? ` · ${progress.detail}` : ''}`
    : 'Working…';

  return (
    <div className="modal-bg" onClick={stage === 'generating' ? undefined : onClose}>
      <div className="export-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-picker-grip" aria-hidden="true" />
        <h2 className="modal-title">Export job</h2>

        {stage === 'config' && (
          <>
            <div className="export-summary">
              <div><strong>{job.name}</strong></div>
              <div className="export-summary-sub">
                {stats
                  ? `${stats.panels} panel${stats.panels !== 1 ? 's' : ''} · ${stats.rows} row${stats.rows !== 1 ? 's' : ''} · ${stats.photos} photo${stats.photos !== 1 ? 's' : ''}`
                  : 'Calculating…'}
              </div>
              <div className="export-summary-sub" style={{ marginTop: 6 }}>
                Builds a .zip with the populated spreadsheet, a photo-metadata CSV (with GPS), and photos organized by panel and item.
              </div>
            </div>
            <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 'var(--sp-3)' }}>
              <button className="ghost" onClick={onClose}>Cancel</button>
              <button className="primary" onClick={generate}>
                <Icon name="download" size={16} />
                <span style={{ marginLeft: 6 }}>Build Export</span>
              </button>
            </div>
          </>
        )}

        {stage === 'generating' && (
          <div className="export-progress">
            <div className="export-spinner" />
            <div className="export-progress-text">{progressText}</div>
            <div className="progress-bar" style={{ width: '100%' }}>
              <div className="progress-bar-fill" style={{ width: `${progress.percent || 0}%` }} />
            </div>
          </div>
        )}

        {stage === 'done' && result && (
          <>
            <div className="export-progress export-progress--done">
              <div className="export-check"><Icon name="check" size={28} strokeWidth={2.5} /></div>
              <div className="export-progress-text">Ready: {result.filename}</div>
              <div className="export-summary-sub">{sizeMB} MB</div>
            </div>
            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={onClose}>Done</button>
              <button onClick={onDownload}>
                <Icon name="download" size={16} />
                <span style={{ marginLeft: 6 }}>Download</span>
              </button>
              <button className="primary" onClick={onShare}>
                <Icon name="link" size={16} />
                <span style={{ marginLeft: 6 }}>Share / Email / Cloud</span>
              </button>
            </div>
          </>
        )}

        {stage === 'error' && (
          <>
            <div className="export-progress export-progress--error">
              <Icon name="warn" size={28} />
              <div className="export-progress-text">{error || 'Export failed.'}</div>
            </div>
            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={onClose}>Close</button>
              <button className="primary" onClick={generate}>
                <Icon name="refresh" size={16} />
                <span style={{ marginLeft: 6 }}>Try again</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
