import { useState, useEffect, useRef } from 'react';
import { getJob, getPanel } from '../db';
import { getPanelProgress } from '../lib/metrics';
import type { SheetStatus, IPanelSheetCount } from '../lib/metrics';
import { nav } from '../lib/nav';
import SheetForm from './SheetForm';
import AppBar from './AppBar';
import Icon from './Icon';
import SheetPicker from './SheetPicker';
import Marquee from './Marquee';
import CountUp from './CountUp';
import type { IJob, IPanel } from '../types/job';

const SHEET_ORDER: readonly string[] = [
    'Panels', 'Power', 'PLC Racks', 'PLC Slots', 'Fieldbus IO',
    'Network Devices', 'HMIs', 'Ethernet Switches', 'Drive Parameters',
    'Conv. Speeds', 'Safety Circuit', 'Safety Devices', 'Peer to Peer Comms',
];

interface IInkRect {
    left: number;
    width: number;
}

interface IPanelViewProps {
    jobId: string;
    panelId: string;
}

const PanelView = ({ jobId, panelId }: IPanelViewProps) => {
    const [job, setJob] = useState<IJob | null>(null);
    const [panel, setPanel] = useState<IPanel | null>(null);
    const [activeSheet, setActiveSheet] = useState<string>('Panels');
    const [progress, setProgress] = useState<Record<string, SheetStatus>>({});
    const [counts, setCounts] = useState<Record<string, IPanelSheetCount>>({});
    const [panelPercent, setPanelPercent] = useState<number>(0);
    const [showSheetPicker, setShowSheetPicker] = useState<boolean>(false);

    const tabsRef = useRef<HTMLDivElement | null>(null);
    const [inkRect, setInkRect] = useState<IInkRect>({ left: 0, width: 0 });
    useEffect(() => {
        const container = tabsRef.current;
        const el = container?.querySelector<HTMLElement>('.tab.active');
        if (!container || !el) return;
        if (typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({
                inline: 'center',
                block: 'nearest',
                behavior: 'smooth',
            });
        }
        // Measure relative to the scrollable container so the ink stays
        // glued under the active tab as the user scrolls horizontally.
        const cRect = container.getBoundingClientRect();
        const tRect = el.getBoundingClientRect();
        setInkRect({
            left: tRect.left - cRect.left + container.scrollLeft,
            width: tRect.width,
        });
    }, [activeSheet]);

    async function refreshProgress(): Promise<void> {
        const { percent, sheetStatuses, sheetCounts } = await getPanelProgress(panelId);
        setProgress(sheetStatuses);
        setCounts(sheetCounts);
        setPanelPercent(percent);
    }

    const refreshProgressSafe = (): void => {
        refreshProgress().catch((err: unknown) => console.warn('PanelView refreshProgress failed', err));
    };

    useEffect(() => {
        const load = async (): Promise<void> => {
            const j = await getJob(jobId);
            const pn = await getPanel(panelId);
            if (!j || !pn) { nav('/'); return; }
            setJob(j);
            setPanel(pn);
            await refreshProgress();
        };
        load().catch((err: unknown) => console.warn('PanelView load failed', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshProgress is a non-stable inline closure; adding it would infinite-loop. Intent: run only when jobId/panelId change.
    }, [jobId, panelId]);

    if (!job || !panel) {
        return (
            <>
                <AppBar onBack={() => nav(`/job/${jobId}`)} wordmark="" />
                <main>
                    <div className="hero">
                        <div className="skeleton-bar skeleton-bar--sub skeleton-shimmer" />
                        <div
                            className="skeleton-bar skeleton-shimmer"
                            style={{
                                width: '50%',
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
                        </div>
                    ))}
                </main>
            </>
        );
    }

    const sheetStatus = (sheet: string): SheetStatus => progress[sheet] ?? 'empty';
    const idx = SHEET_ORDER.indexOf(activeSheet);
    const total = SHEET_ORDER.length;

    return (
        <>
            <AppBar
                onBack={() => nav(`/job/${jobId}`)}
                wordmark={job.name || panel.name || 'e-OIC'}
                crumb={panel.name && job.name ? panel.name : ''}
            />
            <main>
                <div className="hero">
                    <div className="hero-pretitle">
                        {idx >= 0
                            ? (
                                <>
                                    PANEL ·
                                    {' '}
                                    <CountUp value={panelPercent} />
                                    % COMPLETE ·
                                    {' '}
                                    <CountUp value={idx + 1} />
                                    {' OF '}
                                    <CountUp value={total} />
                                    {' SHEETS'}
                                </>
                            )
                            : 'PANEL'}
                    </div>
                    <h1 className="hero-title"><Marquee>{panel.name || 'Panel'}</Marquee></h1>
                </div>
                <div className="tabs" ref={tabsRef}>
                    {SHEET_ORDER.map((s) => (
                        <button
                            key={s}
                            type="button"
                            className={`tab${activeSheet === s ? ' active' : ''}`}
                            onClick={() => setActiveSheet(s)}
                        >
                            <span className={`dot ${sheetStatus(s)}`} aria-hidden="true" />
                            <span>{s}</span>
                        </button>
                    ))}
                    <button
                        type="button"
                        className="tab tab--overflow"
                        onClick={() => setShowSheetPicker(true)}
                        aria-label="All sheets"
                    >
                        <Icon name="grid" size={14} />
                    </button>
                    <span
                        className="tab-ink"
                        style={{ left: inkRect.left, width: inkRect.width }}
                        aria-hidden="true"
                    />
                </div>
                <div className="sheet-anim" key={activeSheet}>
                    <SheetForm
                        job={job}
                        panel={panel}
                        sheetName={activeSheet}
                        onChange={refreshProgressSafe}
                    />
                </div>
            </main>
            {showSheetPicker && (
                <SheetPicker
                    sheets={SHEET_ORDER.map((s) => ({
                        id: s,
                        name: s,
                        status: sheetStatus(s),
                        counts: counts[s] ?? {
                            rows: 0,
                            photos: 0,
                            required: 0,
                        },
                    }))}
                    activeId={activeSheet}
                    onPick={(id) => setActiveSheet(id)}
                    onClose={() => setShowSheetPicker(false)}
                />
            )}
        </>
    );
};

export default PanelView;
