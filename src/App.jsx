import React, { useState, useEffect } from 'react';
import JobList from './components/JobList.jsx';
import JobView from './components/JobView.jsx';
import PanelView from './components/PanelView.jsx';
import SettingsView from './components/SettingsView.jsx';
import ToastHost from './components/ToastHost.jsx';
import UpdatePill from './components/UpdatePill.jsx';
import { getGeolocationConsent, setGeolocationConsent, requestGeolocation } from './lib/geolocation.js';
import { maybeSeedSampleJob } from './lib/seed.js';

function parseHash() {
  const h = window.location.hash.replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'jobs' };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'job' && parts[1] && parts[2] === 'panel' && parts[3]) {
    return { name: 'panel', jobId: parts[1], panelId: parts[3] };
  }
  if (parts[0] === 'job' && parts[1]) {
    return { name: 'job', jobId: parts[1] };
  }
  return { name: 'jobs' };
}

export function nav(path) {
  window.location.hash = path;
}

export default function App() {
  const [route, setRoute] = useState(parseHash());
  const [showGeoPrompt, setShowGeoPrompt] = useState(false);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
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
      {route.name === 'jobs' && <JobList />}
      {route.name === 'job' && <JobView jobId={route.jobId} />}
      {route.name === 'panel' && <PanelView jobId={route.jobId} panelId={route.panelId} />}
      {route.name === 'settings' && <SettingsView />}
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
          <li>The JPEG's EXIF metadata (visible to mapping apps)</li>
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
