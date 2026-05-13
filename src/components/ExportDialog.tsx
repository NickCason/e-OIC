import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import Icon from './Icon';
import DiffView from './DiffView';
import { buildExport, downloadBlob, shareBlob, type IExportProgress, type IBuildExportResult, type ExportMode } from '../exporter';
import { parseChecklistXlsx } from '../lib/xlsxParser';
import { diffJobs } from '../lib/jobDiff';
import { getJobSizeEstimate, listPanels, listAllRows, getSheetNotes, updateJob, type IJobSizeEstimate } from '../db';
import schemaMap from '../schema.json' with { type: 'json' };
import { toast } from '../lib/toast';
import EtechLoader from './EtechLoader';
import LoadingPhrases from './LoadingPhrases';
import CountUp from './CountUp';
import { withMinDuration, fadeOutLoader } from '../lib/loaderHold';
import type { IJob, IRow } from '../types/job';
import type { IJobDiff, ISheetSchema, IParsedXlsx } from '../types/xlsx';

// schema.json shape is broader than ISheetSchema's optional-string typing
// (e.g. nullable hyperlink_column). Cast at the boundary.
const schemaMapTyped = schemaMap as unknown as Record<string, ISheetSchema | undefined>;

const MAX_FILE_BYTES = 50 * 1024 * 1024;

interface ITypewriterOptions {
    speedMs?: number;
    startMs?: number;
}

// One-shot typewriter for the export success filename. Snaps to full
// text under prefers-reduced-motion.
function useTypewriter(text: string, options: ITypewriterOptions = {}): string {
    const { speedMs = 24, startMs = 80 } = options;
    const [shown, setShown] = useState<string>('');
    useEffect(() => {
        setShown('');
        if (!text) return undefined;
        const reduced = typeof window !== 'undefined'
            && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (reduced) {
            setShown(text);
            return undefined;
        }
        let i = 0;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const tick = (): void => {
            i += 1;
            setShown(text.slice(0, i));
            if (i < text.length) timer = setTimeout(tick, speedMs);
        };
        timer = setTimeout(tick, startMs);
        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [text, speedMs, startMs]);
    return shown;
}

function stripExt(s: string): string {
    return s.replace(/\.[^.]+$/, '');
}

type ExportStage = 'config' | 'parsing-target' | 'push-diff' | 'generating' | 'done' | 'error';
type ExportUiMode = 'zip' | 'xlsx-only';

// Build the localSheetNotes-for-one-panel shape that diffJobs expects:
// sheet → text. Hoisted out of the click handler to keep handler depth <= 2.
async function collectPanelSheetNotes(panelId: string): Promise<Record<string, string>> {
    const sheetNames = Object.keys(schemaMap);
    const results = await Promise.all(sheetNames.map(async (sn) => ({ sn, text: await getSheetNotes(panelId, sn) })));
    const out: Record<string, string> = {};
    results.forEach(({ sn, text }) => {
        if (text) out[sn] = text;
    });
    return out;
}

interface ITargetParseSuccess {
    fallback?: false;
    r: IParsedXlsx;
    d: IJobDiff;
}
interface ITargetParseFallback {
    fallback: true;
}
type TargetParseResult = ITargetParseSuccess | ITargetParseFallback;

interface IDoneSuccessProps {
    result: IBuildExportResult;
    sizeMB: string | null;
    sharing: boolean;
    onClose: () => void;
    onDownload: () => void;
    onShare: () => void;
}

/* eslint-disable react/jsx-no-bind -- arrow handlers in JSX are intentional throughout this dialog; the local handler set is small and stable */

const DoneSuccess = ({
    result, sizeMB, sharing, onClose, onDownload, onShare
}: IDoneSuccessProps) => {
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
                    {'Ready: '}
                    <span className="export-filename-mono">{filename}</span>
                    <span className="type-caret" aria-hidden="true">|</span>
                </div>
                <div className="export-summary-sub export-size-countup">
                    <CountUp value={parseInt(whole ?? '0', 10) || 0} duration={700} />
                    .
                    <CountUp value={parseInt(decimal ?? '0', 10) || 0} duration={700} />
                    {' MB'}
                </div>
            </div>
            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="ghost" onClick={onClose}>Done</button>
                <button type="button" onClick={onDownload} disabled={sharing}>
                    <Icon name="download" size={16} />
                    <span style={{ marginLeft: 6 }}>Download</span>
                </button>
                <button
                    type="button"
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
};

export interface IExportDialogProps {
    job: IJob;
    onClose: () => void;
}

const ExportDialog = ({ job, onClose }: IExportDialogProps) => {
    const [mode, setMode] = useState<ExportUiMode>('zip');
    const [stage, setStage] = useState<ExportStage>('config');
    const [progress, setProgress] = useState<IExportProgress>({
        percent: 0, phase: '', detail: ''
    });
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<IBuildExportResult | null>(null);
    const [stats, setStats] = useState<IJobSizeEstimate | null>(null);
    const [targetDiff, setTargetDiff] = useState<IJobDiff | null>(null);
    const [targetFilename, setTargetFilename] = useState<string>('');
    const [sharing, setSharing] = useState<boolean>(false);
    const [isFading, setIsFading] = useState<boolean>(false);
    const targetInputRef = useRef<HTMLInputElement | null>(null);

    const hasSource = !!job.source?.filename;

    useEffect(() => {
        getJobSizeEstimate(job.id).then(setStats);
    }, [job.id]);

    async function generate(buildMode: ExportMode, filenameOverride?: string): Promise<void> {
        setStage('generating');
        setIsFading(false);
        setError(null);
        setResult(null);
        setProgress({
            percent: 0, phase: 'starting', detail: ''
        });
        try {
            const work = buildExport(job, {
                onProgress: setProgress,
                mode: buildMode,
                filename: filenameOverride ?? null,
            });
            const r = await withMinDuration(work, 4500);
            setResult(r);
            await fadeOutLoader(setIsFading);
            setStage('done');
            setIsFading(false);
        } catch (e) {
            console.error(e);
            const err = e as { message?: string };
            let msg = err.message || 'Export failed';
            if (/quota|memory|out of memory/i.test(msg)) {
                msg = 'Ran out of memory while building the export. Try exporting fewer panels at a time, or close other browser tabs.';
            } else if (/template/i.test(msg)) {
                msg = 'Could not load template.xlsx. The app may need to be reopened to refresh its cache.';
            }
            setError(msg);
            toast.error(`Export failed: ${msg}`);
            setStage('error');
        }
    }

    function pickTarget(): void { targetInputRef.current?.click(); }

    async function onTargetFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!/\.xlsx?$/i.test(file.name)) { toast.error('Pick a .xlsx file.'); return; }
        if (file.size > MAX_FILE_BYTES) { toast.error('File looks too large (>50 MB).'); return; }
        setStage('parsing-target');
        setIsFading(false);
        setTargetFilename(file.name);
        try {
            const work: Promise<TargetParseResult> = (async () => {
                const buf = await file.arrayBuffer();
                const parsed = await parseChecklistXlsx(buf);
                if (parsed.errors.length > 0) return { fallback: true };
                const panels = await listPanels(job.id);
                const rowsBySheet: Record<string, IRow[]> = {};
                const localSheetNotes: Record<string, Record<string, string>> = {};
                const panelRows = await Promise.all(panels.map((p) => listAllRows(p.id)));
                panels.forEach((_p, idx) => {
                    const rows = panelRows[idx] ?? [];
                    rows.forEach((row) => {
                        const arr = rowsBySheet[row.sheet] ?? (rowsBySheet[row.sheet] = []);
                        arr.push(row);
                    });
                });
                const notesPerPanel = await Promise.all(panels.map((p) => collectPanelSheetNotes(p.id)));
                panels.forEach((p, idx) => {
                    const notes = notesPerPanel[idx];
                    if (notes && Object.keys(notes).length > 0) localSheetNotes[p.name] = notes;
                });
                const d = diffJobs(
                    {
                        localJob: job,
                        localPanels: panels,
                        localRowsBySheet: rowsBySheet,
                        localSheetNotes,
                    },
                    parsed,
                    schemaMapTyped,
                    { direction: 'push' },
                );
                return { r: parsed, d };
            })();
            const out = await withMinDuration(work, 4500);
            if (out.fallback) {
                toast.error('Couldn\'t read target file. Saving as new instead.');
                await generate('xlsx-only', `${stripExt(file.name)}.xlsx`);
                return;
            }
            setTargetDiff(out.d);
            await fadeOutLoader(setIsFading);
            setStage('push-diff');
            setIsFading(false);
        } catch (err) {
            console.error(err);
            const m = (err as { message?: string }).message || 'Failed to read target file';
            toast.error(m);
            setStage('config');
        }
    }

    async function confirmPush(): Promise<void> {
        await updateJob(job.id, {
            source: {
                kind: 'xlsx', filename: targetFilename, pulledAt: Date.now()
            },
        });
        await generate('xlsx-only', targetFilename);
    }

    async function saveAsNew(): Promise<void> {
        const fn = job.source?.filename || `${stripExt(job.name) || 'export'}.xlsx`;
        await generate('xlsx-only', fn);
    }

    function onDownload(): void {
        if (!result) return;
        downloadBlob(result.blob, result.filename);
        toast.show('Downloaded');
    }

    async function onShare(): Promise<void> {
        if (!result || sharing) return;
        setSharing(true);
        try {
            const shared = await shareBlob(result.blob, result.filename, job.name, result.shareFile);
            if (!shared) {
                downloadBlob(result.blob, result.filename);
                toast.show('Share not supported — saved to Downloads instead');
            }
        } catch (e) {
            const err = e as { name?: string; message?: string };
            if (err.name === 'AbortError') {
                setSharing(false);
                return;
            }
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
                toast.error(`${err.name || 'Error'}: ${err.message || 'Share failed'}`);
            }
        } finally {
            setSharing(false);
        }
    }

    const sizeMB = result ? (result.sizeBytes / 1024 / 1024).toFixed(1) : null;
    const progressText = progress.phase
        ? `${progress.phase}${progress.detail ? ` · ${progress.detail}` : ''}`
        : 'Working…';
    const blockClose = stage === 'generating' || stage === 'parsing-target';

    return (
        /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- modal backdrop click-to-dismiss; Cancel button covers keyboard path */
        <div className="modal-bg" onClick={blockClose ? undefined : onClose}>
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- stopPropagation guard, not an interactive surface */}
            <div className="export-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '85vh', overflow: 'auto' }}>
                <div className="sheet-picker-grip" aria-hidden="true" />
                <h2 className="modal-title">Export job</h2>

                <input ref={targetInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={onTargetFile} />

                {stage === 'config' && (
                    <>
                        <div
                            className="export-mode-toggle"
                            style={{
                                display: 'flex', gap: 8, marginBottom: 'var(--sp-3)'
                            }}
                        >
                            <button
                                type="button"
                                className={mode === 'zip' ? 'primary' : 'ghost'}
                                onClick={() => (mode === 'zip' ? generate('zip') : setMode('zip'))}
                            >
                                Build Export (zip)
                            </button>
                            <button
                                type="button"
                                className={mode === 'xlsx-only' ? 'primary' : 'ghost'}
                                onClick={() => (mode === 'xlsx-only' ? pickTarget() : setMode('xlsx-only'))}
                            >
                                Push to xlsx
                            </button>
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
                                    <button type="button" className="ghost" onClick={onClose}>Cancel</button>
                                    <button type="button" className="primary" onClick={() => generate('zip')}>
                                        <Icon name="download" size={16} />
                                        <span style={{ marginLeft: 6 }}>Build Export</span>
                                    </button>
                                </div>
                            </>
                        )}

                        {mode === 'xlsx-only' && (
                            <>
                                {hasSource ? (
                                    <div className="export-summary-sub" style={{ marginTop: 6 }}>
                                        {'Pulled from '}
                                        <strong>{job.source?.filename}</strong>
                                        . Pick that file to overwrite (with diff), or save as new.
                                    </div>
                                ) : (
                                    <div className="export-summary-sub" style={{ marginTop: 6 }}>
                                        Saves the bare .xlsx (no photos, no csv, no backup). Route the file to SharePoint via the share sheet.
                                    </div>
                                )}
                                <div
                                    className="btn-row"
                                    style={{
                                        justifyContent: 'flex-end', marginTop: 'var(--sp-3)', flexWrap: 'wrap'
                                    }}
                                >
                                    <button type="button" className="ghost" onClick={onClose}>Cancel</button>
                                    {hasSource && (
                                        <button type="button" className="primary" onClick={pickTarget}>
                                            <Icon name="download" size={16} />
                                            <span style={{ marginLeft: 6 }}>Pick target file</span>
                                        </button>
                                    )}
                                    <button type="button" className={hasSource ? '' : 'primary'} onClick={saveAsNew}>
                                        <Icon name="download" size={16} />
                                        <span style={{ marginLeft: 6 }}>Save as new</span>
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
                        <div className="export-progress-sub">{`Reading ${targetFilename}`}</div>
                    </div>
                )}

                {stage === 'push-diff' && targetDiff && (
                    <>
                        <div className="diff-push-ribbon">
                            <Icon name="arrowRight" size={14} />
                            <span>
                                {'Pushing to '}
                                <strong>{targetFilename}</strong>
                            </span>
                        </div>
                        <DiffView diff={targetDiff} direction="push" />
                        <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 'var(--sp-3)' }}>
                            <button type="button" className="ghost" onClick={() => setStage('config')}>Back</button>
                            <button type="button" className="primary" onClick={confirmPush}>Generate xlsx</button>
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

                {stage === 'done' && result && (
                    <DoneSuccess
                        result={result}
                        sizeMB={sizeMB}
                        sharing={sharing}
                        onClose={onClose}
                        onDownload={onDownload}
                        onShare={onShare}
                    />
                )}

                {stage === 'error' && (
                    <>
                        <div className="export-progress export-progress--error">
                            <Icon name="warn" size={28} />
                            <div className="export-progress-text">{error || 'Export failed.'}</div>
                        </div>
                        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                            <button type="button" className="ghost" onClick={onClose}>Close</button>
                            <button type="button" className="primary" onClick={() => generate(mode === 'xlsx-only' ? 'xlsx-only' : 'zip')}>
                                <Icon name="refresh" size={16} />
                                <span style={{ marginLeft: 6 }}>Try again</span>
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

/* eslint-enable react/jsx-no-bind */

export default ExportDialog;
