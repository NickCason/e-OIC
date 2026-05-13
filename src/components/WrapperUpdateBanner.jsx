import React, { useEffect, useState } from 'react';
import Icon from './Icon';
import { isInWrapper, getWrapperVersion, compareWrapperVersions, downloadAndInstallApk } from '../lib/wrapperBridge';
import { toast } from '../lib/toast';

const DISMISS_KEY = 'eoic-wrapper-update-dismissed';
// Relative path so it resolves under the deployed base
// (`/e-OIC/wrapper-version.json` on GH Pages, root on local preview).
const VERSION_URL = './wrapper-version.json';
const TROUBLE_URL = 'https://github.com/NickCason/e-OIC-android-wrapper/blob/main/docs/install.md';

export default function WrapperUpdateBanner() {
  const [remote, setRemote] = useState(null); // { version, url } when newer
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isInWrapper()) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(VERSION_URL, { cache: 'no-store' });
        if (!r.ok) return;
        const data = await r.json();
        if (cancelled) return;
        const installed = getWrapperVersion();
        if (compareWrapperVersions(installed, data.version) < 0 && data.url) {
          setRemote({ version: data.version, url: data.url });
        }
      } catch {
        // Network failure: silently skip. Try again next launch.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!remote || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch {}
  }

  async function onUpdate() {
    if (busy) return;
    setBusy(true);
    try {
      await downloadAndInstallApk(remote.url);
    } catch (e) {
      toast.error(`Update download failed: ${e?.message || 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="install-banner" role="region" aria-label="App update available">
      <div className="install-banner-icon"><Icon name="download" size={18} /></div>
      <div className="install-banner-text">
        <div className="install-banner-title">Update available</div>
        <div className="install-banner-sub">
          A new Android app version ({remote.version}) is ready.
          {' '}<a href={TROUBLE_URL} target="_blank" rel="noreferrer">Trouble updating?</a>
        </div>
      </div>
      <button className="install-banner-cta" onClick={onUpdate} type="button" disabled={busy}>
        {busy ? 'Updating…' : 'Update'}
      </button>
      <button className="install-banner-close" onClick={dismiss} aria-label="Dismiss" type="button">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
