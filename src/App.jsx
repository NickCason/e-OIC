import React, { useState, useEffect, useRef } from 'react';
import JobList from './components/JobList.jsx';
import JobView from './components/JobView.jsx';
import PanelView from './components/PanelView.jsx';
import SettingsView from './components/SettingsView.jsx';
import ChecklistView from './components/ChecklistView.jsx';
import ToastHost from './components/ToastHost';
import UpdatePill from './components/UpdatePill';
import { getGeolocationConsent, setGeolocationConsent, requestGeolocation } from './lib/geolocation';
import { maybeSeedSampleJob } from './lib/seed';
import useKeyboardInset from './lib/useKeyboardInset';

// Route depth drives the directional cue on the cross-fade. Going to a
// deeper route reads "forward"; going back up the hierarchy reads "back".
function routeDepth(r) {
  if (r.name === 'panel' || r.name === 'checklist') return 2;
  if (r.name === 'job') return 1;
  return 0;
}
function routeKey(r) {
  return `${r.name}|${r.jobId || ''}|${r.panelId || ''}`;
}

function parseHash() {
  const h = window.location.hash.replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'jobs' };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'job' && parts[1] && parts[2] === 'panel' && parts[3]) {
    return { name: 'panel', jobId: parts[1], panelId: parts[3] };
  }
  if (parts[0] === 'job' && parts[1] && parts[2] === 'checklist') {
    return { name: 'checklist', jobId: parts[1] };
  }
  if (parts[0] === 'job' && parts[1]) {
    return { name: 'job', jobId: parts[1] };
  }
  return { name: 'jobs' };
}

export { nav } from './lib/nav';

export default function App() {
  useKeyboardInset();
  const [route, setRoute] = useState(parseHash());
  const [direction, setDirection] = useState('initial');
  const prevDepthRef = useRef(routeDepth(parseHash()));
  const [showGeoPrompt, setShowGeoPrompt] = useState(false);

  useEffect(() => {
    const onHash = () => {
      window.scrollTo(0, 0);
      const next = parseHash();
      const nextDepth = routeDepth(next);
      const prev = prevDepthRef.current;
      setDirection(nextDepth > prev ? 'forward' : nextDepth < prev ? 'back' : 'same');
      prevDepthRef.current = nextDepth;
      setRoute(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // First-run geolocation prompt: ask once, store the answer.
  useEffect(() => {
    (async () => {
      const consent = await getGeolocationConsent();
      if (consent === undefined || consent === null) setShowGeoPrompt(true);
    })();
  }, []);

  // First-launch sample-job seed (idempotent).
  useEffect(() => {
    maybeSeedSampleJob().then((seeded) => {
      if (seeded) {
        // Trigger a route refresh so JobList re-fetches and the sample
        // job appears without requiring a manual reload.
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
    });
  }, []);

  return (
    <div className="app">
      <div key={routeKey(route)} className={`route-shell route-shell--${direction}`}>
        {route.name === 'jobs' && <JobList />}
        {route.name === 'job' && <JobView jobId={route.jobId} />}
        {route.name === 'panel' && <PanelView jobId={route.jobId} panelId={route.panelId} />}
        {route.name === 'checklist' && <ChecklistView jobId={route.jobId} />}
        {route.name === 'settings' && <SettingsView />}
      </div>
      <ToastHost />
      <UpdatePill />
      {showGeoPrompt && <GeoPrompt onClose={() => setShowGeoPrompt(false)} />}
    </div>
  );
}

function GeoPrompt({ onClose }) {
  const [busy, setBusy] = useState(false);

  async function allow() {
    setBusy(true);
    // Trigger the browser permission dialog by actually trying to read GPS.
    const pos = await requestGeolocation({ timeout: 10000 });
    await setGeolocationConsent(pos ? 'granted' : 'denied');
    setBusy(false);
    onClose();
  }

  async function deny() {
    await setGeolocationConsent('denied');
    onClose();
  }

  return (
    <div className="modal-bg">
      <div className="modal">
        <h2 className="modal-title">Tag photos with location?</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 14, marginTop: 0 }}>
          The app can attach GPS coordinates to every photo you take, written into:
        </p>
        <ul style={{ color: 'var(--text-dim)', fontSize: 13, paddingLeft: 18 }}>
          <li>The visible overlay on each photo</li>
          <li>The JPEG&apos;s EXIF metadata (embedded into the photo file itself)</li>
          <li>A sidecar CSV included in your export</li>
        </ul>
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          Your phone will ask for permission. You can change this anytime in Settings.
        </p>
        <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="ghost" onClick={deny} disabled={busy}>Not now</button>
          <button className="primary" onClick={allow} disabled={busy}>
            {busy ? 'Asking…' : 'Enable location'}
          </button>
        </div>
      </div>
    </div>
  );
}
