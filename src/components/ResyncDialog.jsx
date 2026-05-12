import React, { useState, useRef } from 'react';
import Icon from './Icon.jsx';
import DiffView from './DiffView.jsx';
import { parseChecklistXlsx } from '../lib/xlsxParser.js';
import { diffJobs } from '../lib/jobDiff.js';
import { applyResyncToJob } from '../lib/xlsxRoundTrip.js';
import schemaMap from '../schema.json' with { type: 'json' };
import { listPanels, listAllRows, getSheetNotes, updateJob } from '../db.js';
import { toast } from '../lib/toast';
import EtechLoader from './EtechLoader.jsx';
import LoadingPhrases from './LoadingPhrases.jsx';
import { withMinDuration, fadeOutLoader } from '../lib/loaderHold';

const MAX_FILE_BYTES = 50 * 1024 * 1024;

export default function ResyncDialog({ job, onClose, onApplied }) {
  const [stage, setStage] = useState('idle');
  const [error, setError] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [diff, setDiff] = useState(null);
  const [filename, setFilename] = useState('');
  const [removedDecisions, setRemovedDecisions] = useState(new Set());
  const [isFading, setIsFading] = useState(false);
  const inputRef = useRef(null);

  const sourceHint = job.source?.filename;

  function pick() { inputRef.current?.click(); }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.xlsx?$/i.test(file.name)) { toast.error('Pick a .xlsx file.'); return; }
    if (file.size > MAX_FILE_BYTES) { toast.error('File looks too large (>50 MB).'); return; }
    setStage('parsing');
    setIsFading(false);
    setFilename(file.name);
    try {
      const work = (async () => {
        const buf = await file.arrayBuffer();
        const r = await parseChecklistXlsx(buf);
        if (r.errors.length > 0) return { fallback: r.errors[0].kind };
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
        const localState = { localJob: job, localPanels: panels, localRowsBySheet, localSheetNotes };
        const d = diffJobs(localState, r, schemaMap, { direction: 'pull' });
        return { r, d };
      })();
      const out = await withMinDuration(work, 4500);
      if (out.fallback) {
        setError(out.fallback === 'invalid-xlsx'
          ? 'Couldn\'t read this file.'
          : 'This .xlsx doesn\'t look like an e-OIC checklist.');
        setStage('error'); return;
      }
      const { r, d } = out;
      setParsed(r);
      setDiff(d);
      const decisions = new Set();
      for (const sd of Object.values(d.sheets)) {
        for (const rr of sd.removed) decisions.add(rr.id);
      }
      setRemovedDecisions(decisions);
      await fadeOutLoader(setIsFading);
      setStage('diff');
      setIsFading(false);
    } catch (err) {
      console.error(err);
      setError(err.message || String(err));
      setStage('error');
    }
  }

  function toggleRemoved(rowId, accept) {
    setRemovedDecisions((prev) => {
      const next = new Set(prev);
      if (accept) next.add(rowId); else next.delete(rowId);
      return next;
    });
  }

  async function apply() {
    setStage('applying');
    setIsFading(false);
    try {
      const work = (async () => {
        await applyResyncToJob(job.id, parsed, diff, { removedRowIds: removedDecisions });
        await updateJob(job.id, {
          source: { kind: 'xlsx', filename, pulledAt: Date.now() },
        });
      })();
      await withMinDuration(work, 4500);
      await fadeOutLoader(setIsFading);
      toast.show('Re-sync applied');
      onApplied?.();
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.message || String(err));
      setStage('error');
    }
  }

  return (
    <div className="modal-bg" onClick={stage === 'parsing' || stage === 'applying' ? undefined : onClose}>
      <div className="export-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '85vh', overflow: 'auto' }}>
        <h2 className="modal-title">Re-sync from xlsx</h2>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={onFile} />

        {stage === 'idle' && (
          <>
            {sourceHint
              ? <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>You pulled this job from <strong>{sourceHint}</strong>. Pick that file (or a newer copy) to re-sync.</p>
              : <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Pick the e-OIC checklist .xlsx for this job.</p>}
            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={onClose}>Cancel</button>
              <button className="primary" onClick={pick}><Icon name="download" size={16}/><span style={{marginLeft:6}}>Choose file</span></button>
            </div>
          </>
        )}

        {stage === 'parsing' && (
          <div className={`export-progress${isFading ? ' is-fading-out' : ''}`}>
            <EtechLoader variant="color" size={72} />
            <LoadingPhrases set="diff" />
            <div className="export-progress-sub">Reading {filename}</div>
          </div>
        )}

        {stage === 'diff' && diff && (
          <>
            <div className="export-summary"><strong>{filename}</strong></div>
            <DiffView diff={diff} direction="pull" removedDecisions={removedDecisions} onToggleRemoved={toggleRemoved} />
            <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 'var(--sp-3)' }}>
              <button className="ghost" onClick={onClose}>Cancel</button>
              <button className="primary" onClick={apply}>Apply changes</button>
            </div>
          </>
        )}

        {stage === 'applying' && (
          <div className={`export-progress${isFading ? ' is-fading-out' : ''}`}>
            <EtechLoader variant="color" size={72} />
            <LoadingPhrases set="apply" />
            <div className="export-progress-sub">Applying changes</div>
          </div>
        )}

        {stage === 'error' && (
          <>
            <div className="export-progress export-progress--error">
              <Icon name="warn" size={28} />
              <div className="export-progress-text">{error}</div>
            </div>
            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={onClose}>Close</button>
              <button className="primary" onClick={() => { setStage('idle'); setError(null); }}>Try again</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
