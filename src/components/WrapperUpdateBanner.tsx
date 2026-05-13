import { useEffect, useState } from 'react';
import Icon from './Icon';
import { isInWrapper, getWrapperVersion, compareWrapperVersions, downloadAndInstallApk } from '../lib/wrapperBridge';
import { toast } from '../lib/toast';

const DISMISS_KEY = 'eoic-wrapper-update-dismissed';
// Relative path so it resolves under the deployed base
// (`/e-OIC/wrapper-version.json` on GH Pages, root on local preview).
const VERSION_URL = './wrapper-version.json';
const TROUBLE_URL = 'https://github.com/NickCason/e-OIC-android-wrapper/blob/main/docs/install.md';

interface IRemoteVersion {
    version: string;
    url: string;
}

interface IWrapperVersionPayload {
    version?: string;
    url?: string;
    minRequired?: string;
}

const WrapperUpdateBanner = () => {
    const [remote, setRemote] = useState<IRemoteVersion | null>(null);
    const [dismissed, setDismissed] = useState<boolean>(() => {
        try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
    });
    const [busy, setBusy] = useState<boolean>(false);

    useEffect(() => {
        if (!isInWrapper()) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const r = await fetch(VERSION_URL, { cache: 'no-store' });
                if (!r.ok) return;
                const data = await r.json() as IWrapperVersionPayload;
                if (cancelled) return;
                const installed = getWrapperVersion();
                if (
                    data.version
                    && data.url
                    && compareWrapperVersions(installed, data.version) < 0
                ) {
                    setRemote({ version: data.version, url: data.url });
                }
            } catch {
                // Network failure: silently skip. Try again next launch.
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (!remote || dismissed) return null;

    function dismiss(): void {
        setDismissed(true);
        try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* storage blocked */ }
    }

    async function onUpdate(): Promise<void> {
        if (busy || !remote) return;
        setBusy(true);
        try {
            await downloadAndInstallApk(remote.url);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'unknown error';
            toast.error(`Update download failed: ${msg}`);
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
                    {`A new Android app version (${remote.version}) is ready. `}
                    <a href={TROUBLE_URL} target="_blank" rel="noreferrer">Trouble updating?</a>
                </div>
            </div>
            <button
                className="install-banner-cta"
                onClick={() => { onUpdate().catch(() => { /* swallowed */ }); }}
                type="button"
                disabled={busy}
            >
                {busy ? 'Updating…' : 'Update'}
            </button>
            <button
                className="install-banner-close"
                onClick={dismiss}
                aria-label="Dismiss"
                type="button"
            >
                <Icon name="close" size={16} />
            </button>
        </div>
    );
};

export default WrapperUpdateBanner;
