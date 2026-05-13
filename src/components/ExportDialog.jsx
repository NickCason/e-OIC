import React, { useState, useEffect, useRef } from 'react';
import Icon from './Icon.jsx';
import DiffView from './DiffView.jsx';
import { buildExport, downloadBlob, shareBlob } from '../exporter';
import { parseChecklistXlsx } from '../lib/xlsxParser';
import { diffJobs } from '../lib/jobDiff';
import { getJobSizeEstimate, listPanels, listAllRows, getSheetNotes, updateJob } from '../db';
import schemaMap from '../schema.json' with { type: 'json' };
import { toast } from '../lib/toast';
import EtechLoader from './EtechLoader.jsx';
import LoadingPhrases from './LoadingPhrases.jsx';
import CountUp from './CountUp.jsx';
import { withMinDuration, fadeOutLoader } from '../lib/loaderHold';

// One-shot typewriter for the export success filename. Snaps to full
// text under prefers-reduced-motion.
function useTypewriter(text, { speedMs = 24, startMs = 80 } = {}) {
  const [shown, setShown] = useState('');
  useEffect(() => {
    setShown('');
    if (!text) return undefined;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setShown(text);
      return undefined;
    }
    let i = 0;
    let timer;
    const tick = () => {
      i += 1;
      setShown(text.slice(0, i));
      if (i < text.length) timer = setTimeout(tick, speedMs);
    };
    timer = setTimeout(tick, startMs);
    return () => clearTimeout(timer);
  }, [text, speedMs, startMs]);
  return shown;
}

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
  const [sharing, setSharing] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const targetInputRef = useRef(null);

  const hasSource = !!job.source?.filename;

  useEffect(() => { getJobSizeEstimate(job.id).then(setStats); }, [job.id]);

  async function generate(buildMode, filenameOverride) {
    setStage('generating');
    setIsFading(false);
    setError(null);
    setResult(null);
    setProgress({ percent: 0, phase: 'starting', detail: '' });
    try {
      const work = buildExport(job, {
        onProgress: setProgress,
        mode: buildMode,
        filename: filenameOverride,
      });
      const r = await withMinDuration(work, 4500);
      setResult(r);
      await fadeOutLoader(setIsFading);
      setStage('done');
      setIsFading(false);
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
    setIsFading(false);
    setTargetFilename(file.name);
    try {
      const work = (async () => {
        const buf = await file.arrayBuffer();
        const r = await parseChecklistXlsx(buf);
        if (r.errors.length > 0) {
          return { fallback: true };
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
        return { r, d };
      })();
      const out = await withMinDuration(work, 4500);
      if (out.fallback) {
        toast.error('Couldn\'t read target file. Saving as new instead.');
        await generate('xlsx-only', `${stripExt(file.name)}.xlsx`);
        return;
      }
      const { r, d } = out;
      setTargetParsed(r);
      setTargetDiff(d);
      await fadeOutLoader(setIsFading);
      setStage('push-diff');
      setIsFading(false);
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
    if (!result || sharing) return;
    setSharing(true);
    try {
      const shared = await shareBlob(result.blob, result.filename, job.name, result.shareFile);
      if (!shared) {
        downloadBlob(result.blob, result.filename);
        toast.show('Share not supported — saved to Downloads instead');
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      // Android Chrome can reject navigator.share with NotAllowedError
      // even when canShare returned true — share-intent / MediaStore
      // issues we can't fix from the page. Fall back to download so the
      // user always ends up with the file in hand.
      console.error('share failed:', e);
      try {
        downloadBlob(result.blob, result.filename);
        toast.show('Couldn’t open the share sheet — saved to Downloads instead');
      } catch (e2) {
        console.error('download fallback also failed:', e2);
        toast.error(`${e.name || 'Error'}: ${e.message || 'Share failed'}`);
      }
    } finally {
      setSharing(false);
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
                onClick={() => mode === 'zip' ? generate('zip') : setMode('zip')}
              >Build Export (zip)</button>
              <button
                type="button"
                className={mode === 'xlsx-only' ? 'primary' : 'ghost'}
                onClick={() => mode === 'xlsx-only' ? pickTarget() : setMode('xlsx-only')}
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
          <div className={`export-progress${isFading ? ' is-fading-out' : ''}`}>
            <EtechLoader variant="color" size={72} />
            <LoadingPhrases set="diff" />
            <div className="export-progress-sub">Reading {targetFilename}</div>
          </div>
        )}

        {stage === 'push-diff' && targetDiff && (
          <>
            <div className="diff-push-ribbon">
              <Icon name="arrowRight" size={14} />
              <span>Pushing to <strong>{targetFilename}</strong></span>
            </div>
            <DiffView diff={targetDiff} direction="push" />
            <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 'var(--sp-3)' }}>
              <button className="ghost" onClick={() => setStage('config')}>Back</button>
              <button className="primary" onClick={confirmPush}>Generate xlsx</button>
            </div>
          </>
        )}

        {stage === 'generating' && (
          <div className={`export-progress${isFading ? ' is-fading-out' : ''}`}>
            <EtechLoader variant="color" size={72} />
            <LoadingPhrases set="export" />
            <div className="export-progress-sub">{progressText}</div>
            <div className="progress-bar progress-bar--paced" style={{ width: '100%' }}>
              <div className="progress-bar-fill" />
            </div>
          </div>
        )}

        {stage === 'done' && result && <DoneSuccess
          result={result}
          sizeMB={sizeMB}
          sharing={sharing}
          onClose={onClose}
          onDownload={onDownload}
          onShare={onShare}
        />}

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

function DoneSuccess({ result, sizeMB, sharing, onClose, onDownload, onShare }) {
  const filename = useTypewriter(result.filename, { speedMs: 22, startMs: 120 });
  // sizeMB is a string like "4.7" — split for separate count animations
  // so the decimal "ticks up" alongside the integer instead of jumping.
  const [whole, decimal] = (sizeMB || '0.0').split('.');
  return (
    <>
      <div className="export-progress export-progress--done">
        <div className="export-check export-check--celebrate">
          <Icon name="check" size={28} strokeWidth={2.5} />
        </div>
        <div className="export-progress-text export-progress-text--type">
          Ready: <span className="export-filename-mono">{filename}</span><span className="type-caret" aria-hidden="true">|</span>
        </div>
        <div className="export-summary-sub export-size-countup">
          <CountUp value={parseInt(whole, 10) || 0} duration={700} />.<CountUp value={parseInt(decimal, 10) || 0} duration={700} /> MB
        </div>
      </div>
      <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
        <button className="ghost" onClick={onClose}>Done</button>
        <button onClick={onDownload} disabled={sharing}>
          <Icon name="download" size={16} /><span style={{ marginLeft: 6 }}>Download</span>
        </button>
        <button
          className="primary share-btn-pulse"
          onClick={onShare}
          disabled={sharing}
        >
          <Icon name="link" size={16} />
          <span style={{ marginLeft: 6 }}>{sharing ? 'Sharing…' : 'Share / Email / Cloud'}</span>
        </button>
      </div>
    </>
  );
}
