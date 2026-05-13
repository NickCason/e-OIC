import { useState, useEffect, useMemo, type ChangeEvent, type MouseEvent } from 'react';
import { listJobs, createJob, updateJob, deleteJob, getJobSizeEstimate, exportJobRaw, restoreJobRaw } from '../db';
import type { IJobSizeEstimate } from '../db';
import { getJobPercent } from '../lib/metrics';
import PercentRing from './PercentRing';
import { nav } from '../lib/nav';
import { toast } from '../lib/toast';
import AppBar from './AppBar';
import EmptyState from './EmptyState';
import CountUp from './CountUp';
import Icon from './Icon';
import Marquee from './Marquee';
import PullOrNewModal from './PullOrNewModal';
import PullDialog from './PullDialog';
import InstallBanner from './InstallBanner';
import WrapperUpdateBanner from './WrapperUpdateBanner';
import { fmtRelative } from '../lib/timeFormat';
import type { IJob } from '../types/job';

// Per-job snapshot the refresh() fan-out builds. Stays local — only JobList
// joins listJobs() against getJobSizeEstimate() + getJobPercent() this way.
interface IJobListRowData {
    id: string;
    size: IJobSizeEstimate;
    pct: number;
}

interface IJobTotals {
    panels: number;
    photos: number;
    inProgress: number;
    total: number;
    avgPercent: number;
}

function monogram(name: string): string {
    if (!name) return '·';
    // filter(Boolean) drops empty strings, so first/second are non-empty
    // when present. Destructure with explicit guards instead of [0]!.
    const [first, second] = name.split(/\s+/).filter(Boolean);
    if (!first) return '·';
    if (!second) return first.slice(0, 2).toUpperCase();
    return ((first[0] ?? '') + (second[0] ?? '')).toUpperCase();
}

function pl(n: number, word: string): string { return n === 1 ? word : `${word}s`; }

interface IJobModalProps {
    job?: IJob | null;
    onClose: () => void;
    onSaved: () => void;
}

const JobModal = ({ job = null, onClose, onSaved }: IJobModalProps) => {
    const [name, setName] = useState<string>(job?.name || '');
    const [client, setClient] = useState<string>(job?.client || '');
    const [location, setLocation] = useState<string>(job?.location || '');
    const [notes, setNotes] = useState<string>(job?.notes || '');
    const [busy, setBusy] = useState<boolean>(false);

    async function submit(): Promise<void> {
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

    const handleSubmit = (): void => {
        submit().catch((err: unknown) => console.warn('JobModal submit failed', err));
    };

    return (
        /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- modal backdrop click-to-dismiss; Cancel button covers keyboard path */
        <div className="modal-bg" onClick={onClose}>
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- stopPropagation guard, not an interactive surface */}
            <div className="modal" onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}>
                <h2 className="modal-title">{job ? 'Edit job' : 'New job'}</h2>
                <div className="field">
                    <label htmlFor="job-name">
                        Job name *
                        <input
                            id="job-name"
                            value={name}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                            placeholder="e.g. Acme Plant — May 2026"
                            // eslint-disable-next-line jsx-a11y/no-autofocus -- modal entry; focus the primary text input on open
                            autoFocus
                        />
                    </label>
                </div>
                <div className="field">
                    <label htmlFor="job-client">
                        Client (optional)
                        <input id="job-client" value={client} onChange={(e: ChangeEvent<HTMLInputElement>) => setClient(e.target.value)} />
                    </label>
                </div>
                <div className="field">
                    <label htmlFor="job-location">
                        Location (optional)
                        <input id="job-location" value={location} onChange={(e: ChangeEvent<HTMLInputElement>) => setLocation(e.target.value)} />
                    </label>
                </div>
                <div className="field">
                    <label htmlFor="job-notes">
                        Job notes (optional)
                        <textarea
                            id="job-notes"
                            value={notes}
                            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                            placeholder="High-level notes for this job. Will be added to the export."
                        />
                    </label>
                </div>
                <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                    <button type="button" className="ghost" onClick={onClose}>Cancel</button>
                    <button
                        type="button"
                        className="primary"
                        onClick={handleSubmit}
                        disabled={busy || !name.trim()}
                    >
                        {job ? 'Save' : 'Create'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const JobList = () => {
    const [jobs, setJobs] = useState<IJob[]>([]);
    const [choosing, setChoosing] = useState<boolean>(false);
    const [creating, setCreating] = useState<boolean>(false);
    const [pulling, setPulling] = useState<boolean>(false);
    const [editing, setEditing] = useState<IJob | null>(null);
    const [stats, setStats] = useState<Record<string, IJobSizeEstimate>>({});
    const [percents, setPercents] = useState<Record<string, number>>({});
    const [search, setSearch] = useState<string>('');

    async function refresh(): Promise<void> {
        const all = await listJobs();
        setJobs(all);
        const results: IJobListRowData[] = await Promise.all(
            all.map(async (j): Promise<IJobListRowData> => {
                const [size, pct] = await Promise.all([
                    getJobSizeEstimate(j.id),
                    getJobPercent(j.id),
                ]);
                return {
                    id: j.id,
                    size,
                    pct,
                };
            }),
        );
        const s: Record<string, IJobSizeEstimate> = {};
        const p: Record<string, number> = {};
        results.forEach(({ id, size, pct }) => {
            s[id] = size;
            p[id] = pct;
        });
        setStats(s);
        setPercents(p);
    }

    const refreshSafe = (): void => {
        refresh().catch((err: unknown) => console.warn('JobList refresh failed', err));
    };

    useEffect(() => {
        refreshSafe();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshSafe is a non-stable inline closure; adding it would re-fire each render. Intent: run once on mount.
    }, []);

    async function onDelete(job: IJob): Promise<void> {
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

    const filtered = useMemo<IJob[]>(() => {
        const q = search.trim().toLowerCase();
        if (!q) return jobs;
        return jobs.filter((j) => [j.name, j.client, j.location].some((v) => (v || '').toLowerCase().includes(q)));
    }, [jobs, search]);

    // Aggregate stats across all jobs for the hero stat row.
    const totals = useMemo<IJobTotals>(() => {
        let panels = 0;
        let photos = 0;
        let inProgress = 0;
        let percentSum = 0;
        let percentCount = 0;
        jobs.forEach((j) => {
            const s = stats[j.id];
            if (s) {
                panels += s.panels || 0;
                photos += s.photos || 0;
                if ((s.panels || 0) > 0) inProgress += 1;
            }
            const pct = percents[j.id];
            if (pct != null) {
                percentSum += pct;
                percentCount += 1;
            }
        });
        const avgPercent = percentCount > 0 ? Math.round(percentSum / percentCount) : 0;
        return {
            panels,
            photos,
            inProgress,
            total: jobs.length,
            avgPercent,
        };
    }, [jobs, stats, percents]);

    return (
        <>
            <AppBar
                wordmark="e-OIC"
                actions={(
                    <button
                        className="icon-btn"
                        onClick={() => nav('/settings')}
                        aria-label="Settings"
                        type="button"
                    >
                        <Icon name="settings" size={20} />
                    </button>
                )}
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
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                                aria-label="Search jobs"
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
                                <div className="stat-val">
                                    {totals.avgPercent}
                                    %
                                </div>
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
                        /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- job-card row opens detail view on tap; per-row Edit/Delete buttons cover the keyboard path */
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
                                        {j.client && (
                                            <>
                                                {j.client}
                                                {' · '}
                                            </>
                                        )}
                                        {s
                                            ? (
                                                <>
                                                    <CountUp value={s.panels} />
                                                    {' '}
                                                    {pl(s.panels, 'panel')}
                                                    {' · '}
                                                    <CountUp value={s.photos} />
                                                    {' '}
                                                    {pl(s.photos, 'photo')}
                                                </>
                                            )
                                            : '…'}
                                        {j.updatedAt
                                            ? (
                                                <>
                                                    {' · '}
                                                    {fmtRelative(j.updatedAt)}
                                                </>
                                            )
                                            : null}
                                    </Marquee>
                                </div>
                            </div>
                            <div className="job-actions">
                                <button
                                    className="icon-btn ghost"
                                    onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); setEditing(j); }}
                                    aria-label="Edit"
                                    type="button"
                                >
                                    <Icon name="edit" size={16} />
                                </button>
                                <button
                                    className="icon-btn ghost danger"
                                    onClick={(e: MouseEvent<HTMLButtonElement>) => {
                                        e.stopPropagation();
                                        onDelete(j).catch((err: unknown) => console.warn('JobList delete failed', err));
                                    }}
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
            <button className="fab" onClick={() => setChoosing(true)} aria-label="New job" type="button">
                <Icon name="add" size={24} strokeWidth={2.25} />
            </button>
            {choosing && (
                <PullOrNewModal
                    onClose={() => setChoosing(false)}
                    onNew={() => { setChoosing(false); setCreating(true); }}
                    onPull={() => { setChoosing(false); setPulling(true); }}
                />
            )}
            {creating && (
                <JobModal
                    onClose={() => setCreating(false)}
                    onSaved={refreshSafe}
                />
            )}
            {pulling && (
                <PullDialog
                    onClose={() => setPulling(false)}
                    onCreated={refreshSafe}
                />
            )}
            {editing && (
                <JobModal
                    job={editing}
                    onClose={() => setEditing(null)}
                    onSaved={refreshSafe}
                />
            )}
        </>
    );
};

export default JobList;
