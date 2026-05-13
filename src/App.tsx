import { useState, useEffect, useRef } from 'react';
import JobList from './components/JobList';
import JobView from './components/JobView';
import PanelView from './components/PanelView';
import SettingsView from './components/SettingsView';
import ChecklistView from './components/ChecklistView';
import ToastHost from './components/ToastHost';
import UpdatePill from './components/UpdatePill';
import { getGeolocationConsent, setGeolocationConsent, requestGeolocation } from './lib/geolocation';
import { maybeSeedSampleJob } from './lib/seed';
import useKeyboardInset from './lib/useKeyboardInset';

type RouteName = 'jobs' | 'job' | 'panel' | 'checklist' | 'settings';

interface IRoute {
    name: RouteName;
    jobId?: string;
    panelId?: string;
}

type RouteDirection = 'initial' | 'forward' | 'back' | 'same';

// Route depth drives the directional cue on the cross-fade. Going to a
// deeper route reads "forward"; going back up the hierarchy reads "back".
function routeDepth(r: IRoute): number {
    if (r.name === 'panel' || r.name === 'checklist') return 2;
    if (r.name === 'job') return 1;
    return 0;
}

function routeKey(r: IRoute): string {
    return `${r.name}|${r.jobId || ''}|${r.panelId || ''}`;
}

function parseHash(): IRoute {
    const h = window.location.hash.replace(/^#\/?/, '');
    const parts = h.split('/').filter(Boolean);
    if (parts.length === 0) return { name: 'jobs' };
    if (parts[0] === 'settings') return { name: 'settings' };
    if (parts[0] === 'job' && parts[1] && parts[2] === 'panel' && parts[3]) {
        return {
            name: 'panel',
            jobId: parts[1],
            panelId: parts[3],
        };
    }
    if (parts[0] === 'job' && parts[1] && parts[2] === 'checklist') {
        return { name: 'checklist', jobId: parts[1] };
    }
    if (parts[0] === 'job' && parts[1]) {
        return { name: 'job', jobId: parts[1] };
    }
    return { name: 'jobs' };
}

interface IGeoPromptProps {
    onClose: () => void;
}

const GeoPrompt = ({ onClose }: IGeoPromptProps) => {
    const [busy, setBusy] = useState<boolean>(false);

    async function allow(): Promise<void> {
        setBusy(true);
        // Trigger the browser permission dialog by actually trying to read GPS.
        const pos = await requestGeolocation({ timeout: 10000 });
        await setGeolocationConsent(pos ? 'granted' : 'denied');
        setBusy(false);
        onClose();
    }

    const allowSafe = (): void => {
        allow().catch((err: unknown) => console.warn('GeoPrompt allow failed', err));
    };

    async function deny(): Promise<void> {
        await setGeolocationConsent('denied');
        onClose();
    }

    const denySafe = (): void => {
        deny().catch((err: unknown) => console.warn('GeoPrompt deny failed', err));
    };

    return (
        <div className="modal-bg">
            <div className="modal">
                <h2 className="modal-title">Tag photos with location?</h2>
                <p style={{
                    color: 'var(--text-dim)',
                    fontSize: 14,
                    marginTop: 0,
                }}
                >
                    The app can attach GPS coordinates to every photo you take, written into:
                </p>
                <ul style={{
                    color: 'var(--text-dim)',
                    fontSize: 13,
                    paddingLeft: 18,
                }}
                >
                    <li>The visible overlay on each photo</li>
                    <li>The JPEG&apos;s EXIF metadata (embedded into the photo file itself)</li>
                    <li>A sidecar CSV included in your export</li>
                </ul>
                <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                    Your phone will ask for permission. You can change this anytime in Settings.
                </p>
                <div
                    className="btn-row"
                    style={{ justifyContent: 'flex-end', marginTop: 16 }}
                >
                    <button type="button" className="ghost" onClick={denySafe} disabled={busy}>Not now</button>
                    <button type="button" className="primary" onClick={allowSafe} disabled={busy}>
                        {busy ? 'Asking…' : 'Enable location'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const App = () => {
    useKeyboardInset();
    const [route, setRoute] = useState<IRoute>(parseHash());
    const [direction, setDirection] = useState<RouteDirection>('initial');
    const prevDepthRef = useRef<number>(routeDepth(parseHash()));
    const [showGeoPrompt, setShowGeoPrompt] = useState<boolean>(false);

    useEffect(() => {
        const onHash = (): void => {
            window.scrollTo(0, 0);
            const next = parseHash();
            const nextDepth = routeDepth(next);
            const prev = prevDepthRef.current;
            const nextDir: RouteDirection = nextDepth > prev ? 'forward' : nextDepth < prev ? 'back' : 'same';
            setDirection(nextDir);
            prevDepthRef.current = nextDepth;
            setRoute(next);
        };
        window.addEventListener('hashchange', onHash);
        return () => window.removeEventListener('hashchange', onHash);
    }, []);

    // First-run geolocation prompt: ask once, store the answer.
    useEffect(() => {
        const checkConsent = async (): Promise<void> => {
            const consent = await getGeolocationConsent();
            if (consent === undefined || consent === null) setShowGeoPrompt(true);
        };
        checkConsent().catch((err: unknown) => console.warn('App geolocation consent check failed', err));
    }, []);

    // First-launch sample-job seed (idempotent).
    useEffect(() => {
        maybeSeedSampleJob()
            .then((seeded) => {
                if (seeded) {
                    // Trigger a route refresh so JobList re-fetches and the sample
                    // job appears without requiring a manual reload.
                    window.dispatchEvent(new HashChangeEvent('hashchange'));
                }
            })
            .catch((err: unknown) => console.warn('App sample-job seed failed', err));
    }, []);

    return (
        <div className="app">
            <div key={routeKey(route)} className={`route-shell route-shell--${direction}`}>
                {route.name === 'jobs' && <JobList />}
                {route.name === 'job' && route.jobId && <JobView jobId={route.jobId} />}
                {route.name === 'panel' && route.jobId && route.panelId && (
                    <PanelView jobId={route.jobId} panelId={route.panelId} />
                )}
                {route.name === 'checklist' && route.jobId && <ChecklistView jobId={route.jobId} />}
                {route.name === 'settings' && <SettingsView />}
            </div>
            <ToastHost />
            <UpdatePill />
            {showGeoPrompt && <GeoPrompt onClose={() => setShowGeoPrompt(false)} />}
        </div>
    );
};

export default App;
