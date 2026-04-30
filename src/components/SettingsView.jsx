import React, { useState, useEffect } from 'react';
import { getSetting, setSetting, exportAllJSON, importJSON } from '../db.js';
import { applyTheme, saveTheme } from '../lib/theme.js';
import { getGeolocationConsent, setGeolocationConsent, requestGeolocation } from '../lib/geolocation.js';
import { reloadSampleJob } from '../lib/seed.js';
import { nav } from '../App.jsx';
import { toast } from '../lib/toast.js';
import { BUILD_VERSION } from '../version.js';

const APP_VERSION = '1.1.0';

function fmtMB(bytes) {
  if (bytes == null) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(1)} MB`;
}

export default function SettingsView() {
  const [theme, setTheme] = useState('auto');
  const [gpsConsent, setGpsConsent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [storage, setStorage] = useState(null);

  useEffect(() => {
    (async () => {
      setTheme((await getSetting('theme')) || 'auto');
      setGpsConsent(await getGeolocationConsent());
      if (navigator.storage?.estimate) {
        try {
          const est = await navigator.storage.estimate();
          setStorage(est);
        } catch {
          // estimate() can throw in some private-mode contexts; ignore
        }
      }
    })();
  }, []);

  async function onTheme(t) {
    setTheme(t);
    await saveTheme(t);
  }

  async function onGpsToggle(v) {
    if (v) {
      const pos = await requestGeolocation({ timeout: 10000 });
      const consent = pos ? 'granted' : 'denied';
      await setGeolocationConsent(consent);
      setGpsConsent(consent);
      if (!pos) {
        toast.error('Could not get location. Check your phone\'s location permission for this app.');
      } else {
        toast.show('Location enabled');
      }
    } else {
      await setGeolocationConsent('denied');
      setGpsConsent('denied');
      toast.show('Location disabled');
    }
  }

  async function onBackup() {
    setBusy(true);
    try {
      const snapshot = await exportAllJSON();
      const blob = new Blob([JSON.stringify(snapshot)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `onsite-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast.show('Backup downloaded');
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Backup failed');
    } finally {
      setBusy(false);
    }
  }

  async function onRestore(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!confirm('Restore this backup?\n\nMerge mode: existing jobs are kept; new ones are added.\nIf you want to overwrite duplicates, cancel and use "Replace" via the menu (advanced).')) return;
    setBusy(true);
    try {
      const text = await file.text();
      const snapshot = JSON.parse(text);
      const stats = await importJSON(snapshot, { mode: 'merge' });
      toast.show(`Restored ${stats.jobs} job(s), ${stats.panels} panels, ${stats.photos} photos`);
    } catch (err) {
      console.error(err);
      toast.error('Restore failed: ' + (err.message || 'invalid backup'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="appbar">
        <button className="back" onClick={() => nav('/')} aria-label="Back">‹</button>
        <h1>Settings</h1>
      </header>
      <main>
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Theme</h3>
          <div className="btn-row">
            {['auto', 'light', 'dark'].map((t) => (
              <button
                key={t}
                className={theme === t ? 'primary' : ''}
                onClick={() => onTheme(t)}
                style={{ textTransform: 'capitalize' }}
              >{t}</button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
            Auto follows your phone's system setting.
          </div>
        </section>

        <section className="card">
          <h3 style={{ marginTop: 0 }}>Location tagging</h3>
          <div className="field-checkbox">
            <input
              type="checkbox"
              id="gps-toggle"
              checked={gpsConsent === 'granted'}
              onChange={(e) => onGpsToggle(e.target.checked)}
            />
            <label htmlFor="gps-toggle">
              Tag photos with GPS location
            </label>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            When enabled, every captured photo is tagged with coordinates in:
            the visible overlay, the JPEG's EXIF metadata, and a sidecar CSV
            in your export. Status: <strong>{gpsConsent || 'not set'}</strong>.
          </div>
          {gpsConsent === 'denied' && (
            <div style={{ fontSize: 12, color: 'var(--warn)', marginTop: 8 }}>
              If you blocked location at the OS level, you'll need to also re-enable it in your phone's Settings → app permissions.
            </div>
          )}
        </section>

        <section className="card">
          <h3 style={{ marginTop: 0 }}>Backup &amp; Restore</h3>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 0 }}>
            Backup saves all your jobs (including photos as base64) into a single .json file.
            Useful for moving data between devices or as a safety copy.
          </p>
          <div className="btn-row">
            <button onClick={onBackup} disabled={busy}>⬇ Backup all jobs</button>
            <label className="primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 14px', border: '1px solid var(--accent-2)', borderRadius: 'var(--radius)', background: 'var(--accent-2)', color: 'white', cursor: 'pointer' }}>
              ⬆ Restore
              <input type="file" accept="application/json" style={{ display: 'none' }} onChange={onRestore} disabled={busy} />
            </label>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
            Backups can be large (photos are embedded as base64 — roughly 1.4× the original size).
          </div>
        </section>

        <section className="card">
          <h3 style={{ marginTop: 0 }}>Sample data</h3>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 0 }}>
            Restore the bundled sample job ("Cooker Line Investigation"). Useful
            for demos or for testing the export end-to-end without entering data.
          </p>
          <button
            onClick={async () => {
              if (!confirm('Reload the sample job? Any local edits to the sample will be overwritten. Other jobs are untouched.')) return;
              setBusy(true);
              try {
                const stats = await reloadSampleJob();
                toast.show(`Sample reloaded: ${stats.jobs} job, ${stats.panels} panels, ${stats.rows} rows`);
              } catch (e) {
                toast.error('Could not load sample: ' + (e.message || e));
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
          >🧪 Reload sample job</button>
        </section>

        <section className="card">
          <h3 style={{ marginTop: 0 }}>About</h3>
          <div className="kv"><span className="k">App</span><span className="v">e-OIC</span></div>
          <div className="kv"><span className="k">Build</span><span className="v">{BUILD_VERSION}</span></div>
          <div className="kv"><span className="k">Full name</span><span className="v">eTechGroup Onsite Investigation Checklist</span></div>
          <div className="kv"><span className="k">Version</span><span className="v">{APP_VERSION}</span></div>
          <div className="kv"><span className="k">Storage</span><span className="v">IndexedDB · local to this device</span></div>
          <div className="kv"><span className="k">Offline</span><span className="v">Yes (after first load)</span></div>
          {storage && (
            <div className="kv">
              <span className="k">Storage used</span>
              <span className="v">
                {fmtMB(storage.usage)} of {fmtMB(storage.quota)}
              </span>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
