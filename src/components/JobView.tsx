import { useState, useEffect, type ChangeEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { getJob, listPanels, createPanel, updatePanel, deletePanel, duplicatePanel, listAllRows, listPanelPhotos, exportJobJSON, updateJob, exportPanelRaw, restorePanelRaw } from '../db';
import { getPanelProgress, getJobAggregateStats, getJobChecklist } from '../lib/metrics';
import type { IJobAggregateStats } from '../lib/metrics';
import { nav } from '../lib/nav';
import { toast } from '../lib/toast';
import { fmtRelative } from '../lib/timeFormat';
import ExportDialog from './ExportDialog';
import ResyncDialog from './ResyncDialog';
import AppBar from './AppBar';
import Icon from './Icon';
import EmptyState from './EmptyState';
import Marquee from './Marquee';
import CountUp from './CountUp';
import PercentRing from './PercentRing';
import PercentBar from './PercentBar';
import type { IJob, IPanel } from '../types/job';

interface IPanelRowStats {
    rows: number;
    photos: number;
}

interface IChecklistTotals {
    checked: number;
    total: number;
}

// Discriminated union driving PanelModal — same component handles panel
// rename ('panel') and job-name edit ('job'), matching the original
// .jsx behavior where _isJob distinguished the two subjects.
type PanelModalSubject =
    | { kind: 'panel'; panel: IPanel }
    | { kind: 'job'; job: IJob };

interface IPanelModalProps {
    jobId: string;
    subject?: PanelModalSubject | null;
    onClose: () => void;
    onSaved: () => void;
}

function initialName(subject: PanelModalSubject | null): string {
    if (!subject) return '';
    if (subject.kind === 'job') return subject.job.name;
    return subject.panel.name;
}

const PanelModal = ({
    jobId, subject = null, onClose, onSaved,
}: IPanelModalProps) => {
    const isJobEdit = subject?.kind === 'job';
    const [name, setName] = useState<string>(initialName(subject));
    const [busy, setBusy] = useState<boolean>(false);

    async function submit(): Promise<void> {
        if (!name.trim()) return;
        setBusy(true);
        if (subject?.kind === 'job') {
            await updateJob(subject.job.id, { name: name.trim() });
        } else if (subject?.kind === 'panel') {
            await updatePanel(subject.panel.id, { name: name.trim() });
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

    const handleSubmit = (): void => {
        submit().catch((err: unknown) => console.warn('PanelModal submit failed', err));
    };

    const heading = subject ? (isJobEdit ? 'Edit job name' : 'Edit Panel') : 'New Panel';
    const labelText = isJobEdit ? 'Job name' : 'Panel name';
    const inputPlaceholder = isJobEdit ? '' : 'e.g. CP2';

    return (
        /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- modal backdrop click-to-dismiss; Cancel button covers keyboard path */
        <div className="modal-bg" onClick={onClose}>
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- stopPropagation guard, not an interactive surface */}
            <div className="modal" onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}>
                <h2>{heading}</h2>
                {!subject && (
                    <p style={{
                        color: 'var(--text-dim)',
                        marginTop: 0,
                        fontSize: 13,
                    }}
                    >
                        One panel per cabinet. Photos and notes live inside.
                    </p>
                )}
                <div className="field">
                    <label htmlFor="panel-modal-name">
                        {labelText}
                        {' *'}
                        <input
                            id="panel-modal-name"
                            value={name}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                            placeholder={inputPlaceholder}
                            // eslint-disable-next-line jsx-a11y/no-autofocus -- modal entry; focus the primary text input on open
                            autoFocus
                        />
                    </label>
                </div>
                <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                    <button type="button" className="ghost" onClick={onClose}>Cancel</button>
                    <button type="button" className="primary" onClick={handleSubmit} disabled={busy || !name.trim()}>{subject ? 'Save' : 'Create'}</button>
                </div>
            </div>
        </div>
    );
};

interface IJobViewProps {
    jobId: string;
}

const JobView = ({ jobId }: IJobViewProps) => {
    const [job, setJob] = useState<IJob | null>(null);
    const [panels, setPanels] = useState<IPanel[]>([]);
    const [creating, setCreating] = useState<boolean>(false);
    const [editing, setEditing] = useState<PanelModalSubject | null>(null);
    const [exporting, setExporting] = useState<boolean>(false);
    const [stats, setStats] = useState<Record<string, IPanelRowStats>>({});
    const [panelPercents, setPanelPercents] = useState<Record<string, number>>({});
    const [aggregate, setAggregate] = useState<IJobAggregateStats>({
        panelCount: 0,
        photoCount: 0,
        jobPercent: 0,
    });
    const [checklistTotals, setChecklistTotals] = useState<IChecklistTotals>({ checked: 0, total: 0 });
    const [menuOpen, setMenuOpen] = useState<boolean>(false);
    const [resyncing, setResyncing] = useState<boolean>(false);
    const [confirmingDisconnect, setConfirmingDisconnect] = useState<boolean>(false);
    const [duplicating, setDuplicating] = useState<IPanel | null>(null);
    const [duplicateName, setDuplicateName] = useState<string>('');

    async function refresh(): Promise<void> {
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
                return {
                    id: p.id,
                    sizes: { rows: rows.length, photos: photos.length },
                    pct: progress.percent,
                };
            }),
        );
        const s: Record<string, IPanelRowStats> = {};
        const pp: Record<string, number> = {};
        perPanel.forEach(({ id, sizes, pct }) => {
            s[id] = sizes;
            pp[id] = pct;
        });
        setStats(s);
        setPanelPercents(pp);
        const [agg, tasks] = await Promise.all([
            getJobAggregateStats(jobId),
            getJobChecklist(jobId),
        ]);
        setAggregate(agg);
        setChecklistTotals({ checked: tasks.filter((t) => t.completed).length, total: tasks.length });
    }

    const refreshSafe = (): void => {
        refresh().catch((err: unknown) => console.warn('JobView refresh failed', err));
    };

    useEffect(() => {
        refreshSafe();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshSafe is a non-stable inline closure; adding it would infinite-loop. Intent: run only when jobId changes.
    }, [jobId]);

    useEffect(() => {
        const onFocus = (): void => { refreshSafe(); };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshSafe is a non-stable inline closure; only state it reads is jobId (already the dep), so the closure is correct on each re-creation.
    }, [jobId]);

    async function onDelete(panel: IPanel): Promise<void> {
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

    function onDuplicate(panel: IPanel): void {
        setDuplicating(panel);
        setDuplicateName(`${panel.name} (copy)`);
    }

    async function confirmDuplicate(): Promise<void> {
        const newName = duplicateName.trim();
        if (!newName || !duplicating) return;
        const dup = await duplicatePanel(duplicating.id, newName);
        setDuplicating(null);
        setDuplicateName('');
        await refresh();
        if (dup) toast.show(`Duplicated as “${dup.name}”`);
    }

    const confirmDuplicateSafe = (): void => {
        confirmDuplicate().catch((err: unknown) => console.warn('JobView duplicate failed', err));
    };

    async function handleDisconnect(): Promise<void> {
        if (!job) return;
        await updateJob(job.id, { source: null });
        setConfirmingDisconnect(false);
        await refresh();
    }

    const handleDisconnectSafe = (): void => {
        handleDisconnect().catch((err: unknown) => console.warn('JobView disconnect failed', err));
    };

    async function onBackupJob(): Promise<void> {
        if (!job) return;
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
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : '';
            toast.error(`Backup failed: ${message}`);
        }
    }

    const onBackupJobSafe = (): void => {
        onBackupJob().catch((err: unknown) => console.warn('JobView backup failed', err));
    };

    const onDeleteSafe = (panel: IPanel): void => {
        onDelete(panel).catch((err: unknown) => console.warn('JobView panel delete failed', err));
    };

    if (!job) {
        return (
            <>
                <AppBar onBack={() => nav('/')} wordmark="" />
                <main>
                    <div className="hero">
                        <div className="skeleton-bar skeleton-bar--sub skeleton-shimmer" />
                        <div
                            className="skeleton-bar skeleton-shimmer"
                            style={{
                                width: '60%',
                                height: 28,
                                marginTop: 8,
                            }}
                        />
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

    const crumbBits: string[] = [];
    if (job.client) crumbBits.push(job.client);
    if (job.location) crumbBits.push(job.location);
    if (job.updatedAt) crumbBits.push(fmtRelative(job.updatedAt));
    const crumb = crumbBits.join(' · ');

    return (
        <>
            <AppBar
                onBack={() => nav('/')}
                wordmark={job.name || 'e-OIC'}
                crumb={crumb || ''}
                actions={(
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
                )}
            />
            <main>
                <div className="hero">
                    <div className="hero-pretitle">
                        JOB ·
                        {' '}
                        <CountUp value={aggregate.jobPercent} />
                        % COMPLETE
                        {' · '}
                        <CountUp value={aggregate.panelCount} />
                        {' PANEL'}
                        {aggregate.panelCount === 1 ? '' : 'S'}
                        {' · '}
                        <CountUp value={aggregate.photoCount} />
                        {' PHOTO'}
                        {aggregate.photoCount === 1 ? '' : 'S'}
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
                            <CountUp value={checklistTotals.checked} />
                            {' / '}
                            <CountUp value={checklistTotals.total} />
                            {' · '}
                            <CountUp value={aggregate.jobPercent} />
                            %
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
                    const s = stats[p.id] ?? { rows: 0, photos: 0 };
                    return (
                        /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- panel row opens PanelView on tap; per-row Edit/Duplicate/Delete buttons cover the keyboard path */
                        <div key={p.id} className="list-item" onClick={() => nav(`/job/${jobId}/panel/${p.id}`)}>
                            <div className="grow">
                                <div className="title"><Marquee>{p.name}</Marquee></div>
                                <div className="subtitle">
                                    <CountUp value={s.rows} />
                                    {' row'}
                                    {s.rows !== 1 ? 's' : ''}
                                    {' · '}
                                    <CountUp value={s.photos} />
                                    {' photo'}
                                    {s.photos !== 1 ? 's' : ''}
                                    {p.updatedAt && (
                                        <>
                                            {' · '}
                                            {fmtRelative(p.updatedAt)}
                                        </>
                                    )}
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
                                <button
                                    type="button"
                                    className="ghost icon-btn"
                                    onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); setEditing({ kind: 'panel', panel: p }); }}
                                    aria-label="Edit"
                                >
                                    <Icon name="edit" size={16} />
                                </button>
                                <button
                                    type="button"
                                    className="ghost icon-btn"
                                    onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onDuplicate(p); }}
                                    aria-label="Duplicate"
                                >
                                    <Icon name="copy" size={16} />
                                </button>
                                <button
                                    type="button"
                                    className="ghost danger icon-btn"
                                    onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onDeleteSafe(p); }}
                                    aria-label="Delete"
                                >
                                    <Icon name="trash" size={16} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </main>
            <button type="button" className="fab" onClick={() => setCreating(true)} aria-label="New panel">+</button>
            {creating && <PanelModal jobId={jobId} onClose={() => setCreating(false)} onSaved={refreshSafe} />}
            {editing && (
                <PanelModal
                    jobId={jobId}
                    subject={editing}
                    onClose={() => setEditing(null)}
                    onSaved={refreshSafe}
                />
            )}
            {exporting && <ExportDialog job={job} onClose={() => setExporting(false)} />}
            {resyncing && (
                <ResyncDialog
                    job={job}
                    onClose={() => setResyncing(false)}
                    onApplied={refreshSafe}
                />
            )}
            {duplicating && (
                /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- modal backdrop click-to-dismiss; Cancel button covers keyboard path */
                <div className="modal-bg" onClick={() => setDuplicating(null)}>
                    {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- stopPropagation guard, not an interactive surface */}
                    <div className="modal" onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}>
                        <h2 className="modal-title">Duplicate panel</h2>
                        <div className="field">
                            <label htmlFor="duplicate-panel-name">
                                New panel name
                                <input
                                    id="duplicate-panel-name"
                                    value={duplicateName}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => setDuplicateName(e.target.value)}
                                    onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') confirmDuplicateSafe(); }}
                                    // eslint-disable-next-line jsx-a11y/no-autofocus -- modal entry; focus the primary text input on open
                                    autoFocus
                                />
                            </label>
                        </div>
                        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                            <button type="button" className="ghost" onClick={() => setDuplicating(null)}>Cancel</button>
                            <button type="button" className="primary" onClick={confirmDuplicateSafe} disabled={!duplicateName.trim()}>
                                Duplicate
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {confirmingDisconnect && (
                /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- modal backdrop click-to-dismiss; Cancel button covers keyboard path */
                <div className="modal-bg" onClick={() => setConfirmingDisconnect(false)}>
                    {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- stopPropagation guard, not an interactive surface */}
                    <div className="modal" onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}>
                        <h2 className="modal-title">Disconnect from xlsx?</h2>
                        <p style={{ color: 'var(--text-dim)' }}>
                            This job will no longer be linked to
                            {' '}
                            <strong>{job.source?.filename}</strong>
                            . Future pushes will save as new.
                        </p>
                        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                            <button type="button" className="ghost" onClick={() => setConfirmingDisconnect(false)}>Cancel</button>
                            <button type="button" className="primary" onClick={handleDisconnectSafe}>Disconnect</button>
                        </div>
                    </div>
                </div>
            )}
            {menuOpen && (
                /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- modal backdrop click-to-dismiss; Close button covers keyboard path */
                <div className="modal-bg" onClick={() => setMenuOpen(false)}>
                    {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- stopPropagation guard, not an interactive surface */}
                    <div className="modal" onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}>
                        <h2>Job options</h2>
                        <button
                            type="button"
                            className="modal-list-btn"
                            onClick={() => { setMenuOpen(false); onBackupJobSafe(); }}
                        >
                            <Icon name="download" size={16} />
                            <span style={{ marginLeft: 8 }}>Back up this job</span>
                        </button>
                        <button
                            type="button"
                            className="modal-list-btn"
                            onClick={() => { setMenuOpen(false); setEditing({ kind: 'job', job }); }}
                        >
                            <Icon name="edit" size={16} />
                            <span style={{ marginLeft: 8 }}>Edit job details</span>
                        </button>
                        <button
                            type="button"
                            className="modal-list-btn"
                            onClick={() => { setMenuOpen(false); setResyncing(true); }}
                        >
                            <Icon name="refresh" size={16} />
                            <span style={{ marginLeft: 8 }}>Re-sync from xlsx</span>
                        </button>
                        {job.source && (
                            <button
                                type="button"
                                className="modal-list-btn"
                                onClick={() => { setMenuOpen(false); setConfirmingDisconnect(true); }}
                            >
                                <Icon name="unlink" size={16} />
                                <span style={{ marginLeft: 8 }}>Disconnect from xlsx</span>
                            </button>
                        )}
                        <div className="btn-row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                            <button type="button" className="ghost" onClick={() => setMenuOpen(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default JobView;
