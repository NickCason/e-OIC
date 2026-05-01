import React, { useState, useEffect, useRef } from 'react';
import Icon from './Icon.jsx';
import DiffView from './DiffView.jsx';
import { buildExport, downloadBlob, shareBlob } from '../exporter.js';
import { parseChecklistXlsx } from '../lib/xlsxParser.js';
import { diffJobs } from '../lib/jobDiff.js';
import { getJobSizeEstimate, listPanels, listAllRows, getSheetNotes, updateJob } from '../db.js';
import schemaMap from '../schema.json' with { type: 'json' };
import { toast } from '../lib/toast.js';

const MAX_FILE_BYTES = 50 * 1024 * 1024;

export default function ExportDialog({ job, onClose }) {
  const [mode, setMode] = useState('zip'); // 'zip' | 'xlsx-only'
  const [stage, setStage] = useState('config');
  // Push-mode specific stages: 'config' | 'parsing-target' | 'push-diff' | 'generating' | 'done' | 'error'
  const [progress, setProgress] = useState({ percent: 0, phase: '', detail: '' });
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(null);
  const [targetParsed, setTargetParsed] = useState(null);
  const [targetDiff, setTargetDiff] = useState(null);
  const [targetFilename, setTargetFilename] = useState('');
  const targetInputRef = useRef(null);

  const hasSource = !!job.source?.filename;

  useEffect(() => { getJobSizeEstimate(job.id).then(setStats); }, [job.id]);

  async function generate(buildMode, filenameOverride) {
    setStage('generating');
    setError(null);
    setResult(null);
    setProgress({ percent: 0, phase: 'starting', detail: '' });
    try {
      const r = await buildExport(job, {
        onProgress: setProgress,
        mode: buildMode,
        filename: filenameOverride,
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

  function pickTarget() { targetInputRef.current?.click(); }

  async function onTargetFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.xlsx?$/i.test(file.name)) { toast.error('Pick a .xlsx file.'); return; }
    if (file.size > MAX_FILE_BYTES) { toast.error('File looks too large (>50 MB).'); return; }
    setStage('parsing-target');
    setTargetFilename(file.name);
    try {
      const buf = await file.arrayBuffer();
      const r = await parseChecklistXlsx(buf);
      if (r.errors.length > 0) {
        toast.error('Couldn\'t read target file. Saving as new instead.');
        await generate('xlsx-only', `${stripExt(file.name)}.xlsx`);
        return;
      }
      const panels = await listPanels(job.id);
      const localRowsBySheet = {};
      const localSheetNotes = {};
      for (const p of panels) {
        const rows = await listAllRows(p.id);
        for (const row of rows) {
          if (!localRowsBySheet[row.sheet]) localRowsBySheet[row.sheet] = [];
          localRowsBySheet[row.sheet].push(row);
        }
        for (const sn of Object.keys(schemaMap)) {
          const text = await getSheetNotes(p.id, sn);
          if (text) {
            if (!localSheetNotes[p.name]) localSheetNotes[p.name] = {};
            localSheetNotes[p.name][sn] = text;
          }
        }
      }
      const d = diffJobs(
        { localJob: job, localPanels: panels, localRowsBySheet, localSheetNotes },
        r, schemaMap, { direction: 'push' },
      );
      setTargetParsed(r);
      setTargetDiff(d);
      setStage('push-diff');
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to read target file');
      setStage('config');
    }
  }

  async function confirmPush() {
    await updateJob(job.id, {
      source: { kind: 'xlsx', filename: targetFilename, pulledAt: Date.now() },
    });
    await generate('xlsx-only', targetFilename);
  }

  async function saveAsNew() {
    const fn = job.source?.filename || `${stripExt(job.name) || 'export'}.xlsx`;
    await generate('xlsx-only', fn);
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
    <div className="modal-bg" onClick={stage === 'generating' || stage === 'parsing-target' ? undefined : onClose}>
      <div className="export-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '85vh', overflow: 'auto' }}>
        <div className="sheet-picker-grip" aria-hidden="true" />
        <h2 className="modal-title">Export job</h2>

        <input ref={targetInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={onTargetFile} />

        {stage === 'config' && (
          <>
            <div className="export-mode-toggle" style={{ display: 'flex', gap: 8, marginBottom: 'var(--sp-3)' }}>
              <button
                type="button"
                className={mode === 'zip' ? 'primary' : 'ghost'}
                onClick={() => setMode('zip')}
              >Build Export (zip)</button>
              <button
                type="button"
                className={mode === 'xlsx-only' ? 'primary' : 'ghost'}
                onClick={() => setMode('xlsx-only')}
              >Push to xlsx</button>
            </div>

            <div className="export-summary">
              <div><strong>{job.name}</strong></div>
              <div className="export-summary-sub">
                {stats
                  ? `${stats.panels} panel${stats.panels !== 1 ? 's' : ''} · ${stats.rows} row${stats.rows !== 1 ? 's' : ''} · ${stats.photos} photo${stats.photos !== 1 ? 's' : ''}`
                  : 'Calculating…'}
              </div>
            </div>

            {mode === 'zip' && (
              <>
                <div className="export-summary-sub" style={{ marginTop: 6 }}>
                  Builds a .zip with the populated spreadsheet, a photo-metadata CSV (with GPS), and photos organized by panel and item.
                </div>
                <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 'var(--sp-3)' }}>
                  <button className="ghost" onClick={onClose}>Cancel</button>
                  <button className="primary" onClick={() => generate('zip')}>
                    <Icon name="download" size={16} /><span style={{ marginLeft: 6 }}>Build Export</span>
                  </button>
                </div>
              </>
            )}

            {mode === 'xlsx-only' && (
              <>
                {hasSource ? (
                  <div className="export-summary-sub" style={{ marginTop: 6 }}>
                    Pulled from <strong>{job.source.filename}</strong>. Pick that file to overwrite (with diff), or save as new.
                  </div>
                ) : (
                  <div className="export-summary-sub" style={{ marginTop: 6 }}>
                    Saves the bare .xlsx (no photos, no csv, no backup). Route the file to SharePoint via the share sheet.
                  </div>
                )}
                <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 'var(--sp-3)', flexWrap: 'wrap' }}>
                  <button className="ghost" onClick={onClose}>Cancel</button>
                  {hasSource && (
                    <button className="primary" onClick={pickTarget}>
                      <Icon name="download" size={16}/><span style={{marginLeft:6}}>Pick target file</span>
                    </button>
                  )}
                  <button className={hasSource ? '' : 'primary'} onClick={saveAsNew}>
                    <Icon name="download" size={16}/><span style={{marginLeft:6}}>Save as new</span>
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {stage === 'parsing-target' && (
          <div className="export-progress"><div className="export-spinner" /><div className="export-progress-text">Reading {targetFilename}…</div></div>
        )}

        {stage === 'push-diff' && targetDiff && (
          <>
            <div className="export-summary"><strong>Pushing to {targetFilename}</strong></div>
            <DiffView diff={targetDiff} direction="push" />
            <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 'var(--sp-3)' }}>
              <button className="ghost" onClick={() => setStage('config')}>Back</button>
              <button className="primary" onClick={confirmPush}>Generate xlsx</button>
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
              <button onClick={onDownload}><Icon name="download" size={16} /><span style={{ marginLeft: 6 }}>Download</span></button>
              <button className="primary" onClick={onShare}><Icon name="link" size={16} /><span style={{ marginLeft: 6 }}>Share / Email / Cloud</span></button>
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
              <button className="primary" onClick={() => generate(mode === 'xlsx-only' ? 'xlsx-only' : 'zip')}>
                <Icon name="refresh" size={16} /><span style={{ marginLeft: 6 }}>Try again</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function stripExt(s) {
  return s.replace(/\.[^.]+$/, '');
}
