import { useState, useRef, type ChangeEvent } from 'react';
import Icon from './Icon';
import { parseChecklistXlsx } from '../lib/xlsxParser';
import { applyParsedXlsxToNewJob } from '../lib/xlsxRoundTrip';
import { nav } from '../lib/nav';
import { toast } from '../lib/toast';
import EtechLoader from './EtechLoader';
import LoadingPhrases from './LoadingPhrases';
import { withMinDuration, fadeOutLoader } from '../lib/loaderHold';
import type { IParsedXlsx, IXlsxParserWarning, IXlsxParseProgress } from '../types/xlsx';

const MAX_FILE_BYTES = 50 * 1024 * 1024;

type PullStage = 'idle' | 'parsing' | 'confirm' | 'creating' | 'error';

function nameFromFilename(filename: string): string {
    return filename.replace(/\.xlsx$/i, '').replace(/[_-]+/g, ' ').trim();
}

// Map the first parser error to a user-visible string. Hoisted to keep
// onFile's depth at <= 2 once it's already inside a try block.
function describeParseError(kind: string | undefined): string {
    if (kind === 'invalid-xlsx') return 'Couldn\'t read this file. Make sure it\'s an .xlsx exported from Excel or e-OIC.';
    if (kind === 'no-recognized-sheets') return 'This .xlsx doesn\'t look like an e-OIC checklist — none of the expected sheets were found.';
    if (!kind) return 'Parse error';
    return `Parse error: ${kind}`;
}

function formatWarning(w: IXlsxParserWarning): string {
    switch (w.kind) {
    case 'unknown-sheet': return `Sheet "${w.sheetName}" not in schema — skipped`;
    case 'missing-sheet': return `Sheet "${w.sheetName}" missing from xlsx`;
    case 'extra-column': return `Column "${w.columnName}" in ${w.sheetName} skipped`;
    case 'missing-column': return `Column "${w.columnName}" missing from ${w.sheetName}`;
    case 'unknown-panel-reference': return `${w.rowCount} row(s) in ${w.sheetName} reference unknown panel "${w.panelName}"`;
    case 'notes-row-unmatched': return `Note for "${w.label}" in ${w.sheetName} couldn't be matched to a row`;
    default: return JSON.stringify(w);
    }
}

function progressLabel(p: IXlsxParseProgress, filename: string): string {
    switch (p.phase) {
    case 'loading': return `Reading ${filename}…`;
    case 'panels': return `${p.detail}…`;
    case 'rows': return `${p.detail}…`;
    case 'matching': return 'Matching to schema…';
    default: return `Reading ${filename}…`;
    }
}

export interface IPullDialogProps {
    onClose: () => void;
    onCreated?: () => void;
}

const PullDialog = ({ onClose, onCreated }: IPullDialogProps) => {
    const [stage, setStage] = useState<PullStage>('idle');
    const [error, setError] = useState<string | null>(null);
    const [parsed, setParsed] = useState<IParsedXlsx | null>(null);
    const [filename, setFilename] = useState<string>('');
    const [name, setName] = useState<string>('');
    const [client, setClient] = useState<string>('');
    const [location, setLocation] = useState<string>('');
    const [showAllWarnings, setShowAllWarnings] = useState<boolean>(false);
    const [progress, setProgress] = useState<IXlsxParseProgress>({ phase: 'loading', detail: '' });
    const [isFading, setIsFading] = useState<boolean>(false);
    const inputRef = useRef<HTMLInputElement | null>(null);

    function pick(): void {
        inputRef.current?.click();
    }

    async function onFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!/\.xlsx?$/i.test(file.name)) {
            toast.error('Pick a .xlsx file (e-OIC checklist).');
            return;
        }
        if (file.size > MAX_FILE_BYTES) {
            toast.error('File looks too large to be a checklist (>50 MB).');
            return;
        }
        setStage('parsing');
        setIsFading(false);
        setError(null);
        setFilename(file.name);
        try {
            const work = (async () => {
                const buf = await file.arrayBuffer();
                return parseChecklistXlsx(buf, { onProgress: setProgress });
            })();
            const r = await withMinDuration(work, 4500);
            if (r.errors.length > 0) {
                setError(describeParseError(r.errors[0]?.kind));
                setStage('error');
                return;
            }
            setParsed(r);
            setName(nameFromFilename(file.name));
            await fadeOutLoader(setIsFading);
            setStage('confirm');
            setIsFading(false);
        } catch (err) {
            console.error(err);
            const m = (err as { message?: string }).message || String(err);
            setError(m);
            setStage('error');
        }
    }

    async function create(): Promise<void> {
        if (!name.trim() || !parsed) return;
        setStage('creating');
        setIsFading(false);
        try {
            const work = applyParsedXlsxToNewJob(parsed, {
                name: name.trim(),
                client: client.trim(),
                location: location.trim(),
                source: {
                    kind: 'xlsx', filename, pulledAt: Date.now()
                },
            });
            const jobId = await withMinDuration(work, 4500);
            await fadeOutLoader(setIsFading);
            toast.show(`Imported from ${filename}`);
            onCreated?.();
            nav(`/job/${jobId}`);
            onClose();
        } catch (err) {
            console.error(err);
            const m = (err as { message?: string }).message || String(err);
            setError(m);
            setStage('error');
        }
    }

    const totalRows = parsed
        ? Object.values(parsed.rowsBySheet).reduce((s, rs) => s + rs.length, 0)
        : 0;
    const blockClose = stage === 'parsing' || stage === 'creating';

    return (
        /* eslint-disable-next-line jsx-a11y/click-events-have-key-events -- modal backdrop click-to-dismiss; Cancel button covers keyboard path */
        <div className="modal-bg" onClick={blockClose ? undefined : onClose}>
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- stopPropagation guard, not an interactive surface */}
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h2 className="modal-title">Pull from xlsx</h2>

                <input
                    ref={inputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    style={{ display: 'none' }}
                    onChange={onFile}
                />

                {stage === 'idle' && (
                    <>
                        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                            Bring an existing investigation in from SharePoint. We&apos;ll read
                            the panels, rows, and notes — your data lives in the app, ready to
                            update in the field.
                        </p>
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
                        <LoadingPhrases set="parse" />
                        <div className="export-progress-sub">{progressLabel(progress, filename)}</div>
                    </div>
                )}

                {stage === 'confirm' && parsed && (
                    <>
                        <div className="export-summary">
                            <div><strong>{filename}</strong></div>
                            <div className="export-summary-sub">
                                {parsed.panels.length}
                                {' panel'}
                                {parsed.panels.length !== 1 ? 's' : ''}
                                {' · '}
                                {totalRows}
                                {' row'}
                                {totalRows !== 1 ? 's' : ''}
                                {' · '}
                                {parsed.sheetNotes.length}
                                {' sheet note'}
                                {parsed.sheetNotes.length !== 1 ? 's' : ''}
                            </div>
                        </div>

                        {parsed.warnings.length > 0 && (
                            <div
                                className="warnings-block"
                                style={{
                                    background: 'var(--surface-alt)', padding: 'var(--sp-2)', borderRadius: 6, fontSize: 12, marginTop: 'var(--sp-2)'
                                }}
                            >
                                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                                    {parsed.warnings.length}
                                    {' warning'}
                                    {parsed.warnings.length !== 1 ? 's' : ''}
                                </div>
                                <ul style={{ margin: 0, paddingLeft: 18 }}>
                                    {parsed.warnings.slice(0, showAllWarnings ? undefined : 3).map((w, i) => (
                                        // eslint-disable-next-line react/no-array-index-key -- warnings have no stable id; index is fine for a static list
                                        <li key={i}>{formatWarning(w)}</li>
                                    ))}
                                </ul>
                                {parsed.warnings.length > 3 && !showAllWarnings && (
                                    <button type="button" className="ghost" style={{ marginTop: 4, fontSize: 12 }} onClick={() => setShowAllWarnings(true)}>
                                        Show all
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="field" style={{ marginTop: 'var(--sp-3)' }}>
                            <label htmlFor="pull-name">
                                Job name *
                                {/* eslint-disable-next-line jsx-a11y/no-autofocus -- modal entry; focus the primary text input on open */}
                                <input id="pull-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                            </label>
                        </div>
                        <div className="field">
                            <label htmlFor="pull-client">
                                Client (optional)
                                <input id="pull-client" value={client} onChange={(e) => setClient(e.target.value)} />
                            </label>
                        </div>
                        <div className="field">
                            <label htmlFor="pull-location">
                                Location (optional)
                                <input id="pull-location" value={location} onChange={(e) => setLocation(e.target.value)} />
                            </label>
                        </div>

                        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                            <button type="button" className="ghost" onClick={onClose}>Cancel</button>
                            <button type="button" className="primary" disabled={!name.trim()} onClick={create}>Create job</button>
                        </div>
                    </>
                )}

                {stage === 'creating' && (
                    <div className={`export-progress${isFading ? ' is-fading-out' : ''}`}>
                        <EtechLoader variant="color" size={72} />
                        <LoadingPhrases set="build" />
                        <div className="export-progress-sub">Creating job</div>
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

export default PullDialog;
