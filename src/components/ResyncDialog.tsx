import { useState, useRef, type ChangeEvent } from 'react';
import Icon from './Icon';
import DiffView from './DiffView';
import { parseChecklistXlsx } from '../lib/xlsxParser';
import { diffJobs } from '../lib/jobDiff';
import { applyResyncToJob } from '../lib/xlsxRoundTrip';
import schemaMap from '../schema.json' with { type: 'json' };
import { listPanels, listAllRows, getSheetNotes, updateJob } from '../db';
import { toast } from '../lib/toast';
import EtechLoader from './EtechLoader';
import LoadingPhrases from './LoadingPhrases';
import { withMinDuration, fadeOutLoader } from '../lib/loaderHold';
import type { IJob, IRow } from '../types/job';
import type { IJobDiff, IParsedXlsx, ISheetSchema } from '../types/xlsx';

// schema.json shape is broader than ISheetSchema; cast at the boundary.
const schemaMapTyped = schemaMap as unknown as Record<string, ISheetSchema | undefined>;

const MAX_FILE_BYTES = 50 * 1024 * 1024;

type ResyncStage = 'idle' | 'parsing' | 'diff' | 'applying' | 'error';

// Hoist note collection to keep the click-handler depth at <= 2.
async function collectPanelSheetNotes(panelId: string): Promise<Record<string, string>> {
    const sheetNames = Object.keys(schemaMap);
    const results = await Promise.all(sheetNames.map(async (sn) => ({ sn, text: await getSheetNotes(panelId, sn) })));
    const out: Record<string, string> = {};
    results.forEach(({ sn, text }) => {
        if (text) out[sn] = text;
    });
    return out;
}

function describeFallback(kind: string | undefined): string {
    if (kind === 'invalid-xlsx') return 'Couldn\'t read this file.';
    return 'This .xlsx doesn\'t look like an e-OIC checklist.';
}

interface IParseSuccess {
    fallback?: false;
    r: IParsedXlsx;
    d: IJobDiff;
}
interface IParseFallback {
    fallback: true;
    kind: string | undefined;
}
type ParseResult = IParseSuccess | IParseFallback;

export interface IResyncDialogProps {
    job: IJob;
    onClose: () => void;
    onApplied?: () => void;
}

/* eslint-disable react/jsx-no-bind -- arrow handlers in JSX are intentional throughout this dialog; the handler set is small and stable */

const ResyncDialog = ({ job, onClose, onApplied }: IResyncDialogProps) => {
    const [stage, setStage] = useState<ResyncStage>('idle');
    const [error, setError] = useState<string | null>(null);
    const [parsed, setParsed] = useState<IParsedXlsx | null>(null);
    const [diff, setDiff] = useState<IJobDiff | null>(null);
    const [filename, setFilename] = useState<string>('');
    const [removedDecisions, setRemovedDecisions] = useState<Set<string>>(new Set());
    const [isFading, setIsFading] = useState<boolean>(false);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const sourceHint = job.source?.filename;

    function pick(): void { inputRef.current?.click(); }

    async function onFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!/\.xlsx?$/i.test(file.name)) { toast.error('Pick a .xlsx file.'); return; }
        if (file.size > MAX_FILE_BYTES) { toast.error('File looks too large (>50 MB).'); return; }
        setStage('parsing');
        setIsFading(false);
        setFilename(file.name);
        try {
            const work: Promise<ParseResult> = (async () => {
                const buf = await file.arrayBuffer();
                const r = await parseChecklistXlsx(buf);
                if (r.errors.length > 0) return { fallback: true, kind: r.errors[0]?.kind };
                const panels = await listPanels(job.id);
                const localRowsBySheet: Record<string, IRow[]> = {};
                const localSheetNotes: Record<string, Record<string, string>> = {};
                const rowsPerPanel = await Promise.all(panels.map((p) => listAllRows(p.id)));
                panels.forEach((_p, idx) => {
                    const rows = rowsPerPanel[idx] ?? [];
                    rows.forEach((row) => {
                        if (!localRowsBySheet[row.sheet]) localRowsBySheet[row.sheet] = [];
                        localRowsBySheet[row.sheet]!.push(row);
                    });
                });
                const notesPerPanel = await Promise.all(panels.map((p) => collectPanelSheetNotes(p.id)));
                panels.forEach((p, idx) => {
                    const notes = notesPerPanel[idx];
                    if (notes && Object.keys(notes).length > 0) localSheetNotes[p.name] = notes;
                });
                const localState = {
                    localJob: job,
                    localPanels: panels,
                    localRowsBySheet,
                    localSheetNotes,
                };
                const d = diffJobs(localState, r, schemaMapTyped, { direction: 'pull' });
                return { r, d };
            })();
            const out = await withMinDuration(work, 4500);
            if (out.fallback) {
                setError(describeFallback(out.kind));
                setStage('error');
                return;
            }
            setParsed(out.r);
            setDiff(out.d);
            const decisions = new Set<string>();
            Object.values(out.d.sheets).forEach((sd) => {
                sd.removed.forEach((rr) => decisions.add(rr.id));
            });
            setRemovedDecisions(decisions);
            await fadeOutLoader(setIsFading);
            setStage('diff');
            setIsFading(false);
        } catch (err) {
            console.error(err);
            const m = (err as { message?: string }).message || String(err);
            setError(m);
            setStage('error');
        }
    }

    function toggleRemoved(rowId: string, accept: boolean): void {
        setRemovedDecisions((prev) => {
            const next = new Set(prev);
            if (accept) next.add(rowId); else next.delete(rowId);
            return next;
        });
    }

    async function apply(): Promise<void> {
        if (!parsed || !diff) return;
        setStage('applying');
        setIsFading(false);
        try {
            const work = (async () => {
                await applyResyncToJob(job.id, parsed, diff, { removedRowIds: removedDecisions });
                await updateJob(job.id, {
                    source: {
                        kind: 'xlsx', filename, pulledAt: Date.now()
                    },
                });
            })();
            await withMinDuration(work, 4500);
            await fadeOutLoader(setIsFading);
            toast.show('Re-sync applied');
            onApplied?.();
            onClose();
        } catch (err) {
            console.error(err);
            const m = (err as { message?: string }).message || String(err);
            setError(m);
            setStage('error');
        }
    }

    const blockClose = stage === 'parsing' || stage === 'applying';

    return (
        /* eslint-disable-next-line jsx-a11y/click-events-have-key-events -- modal backdrop click-to-dismiss; Cancel button covers keyboard path */
        <div className="modal-bg" onClick={blockClose ? undefined : onClose}>
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- stopPropagation guard, not an interactive surface */}
            <div className="export-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '85vh', overflow: 'auto' }}>
                <h2 className="modal-title">Re-sync from xlsx</h2>
                <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={onFile} />

                {stage === 'idle' && (
                    <>
                        {sourceHint
                            ? (
                                <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                                    {'You pulled this job from '}
                                    <strong>{sourceHint}</strong>
                                    . Pick that file (or a newer copy) to re-sync.
                                </p>
                            )
                            : <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Pick the e-OIC checklist .xlsx for this job.</p>}
                        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                            <button type="button" className="ghost" onClick={onClose}>Cancel</button>
                            <button type="button" className="primary" onClick={pick}>
                                <Icon name="download" size={16} />
                                <span style={{ marginLeft: 6 }}>Choose file</span>
                            </button>
                        </div>
                    </>
                )}

                {stage === 'parsing' && (
                    <div className={`export-progress${isFading ? ' is-fading-out' : ''}`}>
                        <EtechLoader variant="color" size={72} />
                        <LoadingPhrases set="diff" />
                        <div className="export-progress-sub">{`Reading ${filename}`}</div>
                    </div>
                )}

                {stage === 'diff' && diff && (
                    <>
                        <div className="export-summary"><strong>{filename}</strong></div>
                        <DiffView diff={diff} direction="pull" removedDecisions={removedDecisions} onToggleRemoved={toggleRemoved} />
                        <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 'var(--sp-3)' }}>
                            <button type="button" className="ghost" onClick={onClose}>Cancel</button>
                            <button type="button" className="primary" onClick={apply}>Apply changes</button>
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
                            <button type="button" className="ghost" onClick={onClose}>Close</button>
                            <button type="button" className="primary" onClick={() => { setStage('idle'); setError(null); }}>Try again</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

/* eslint-enable react/jsx-no-bind */

export default ResyncDialog;
