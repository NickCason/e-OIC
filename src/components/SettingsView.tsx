import { useState, useEffect, type ChangeEvent } from 'react';
import AppBar from './AppBar';
import Icon from './Icon';
import { nav } from '../lib/nav';
import { BUILD_VERSION } from '../version';
import { getSetting, exportAllJSON, importJSON } from '../db';
import { saveTheme, type ThemeMode } from '../lib/theme';
import { getGeolocationConsent, setGeolocationConsent, requestGeolocation, type GeolocationConsent } from '../lib/geolocation';
import { reloadSampleJob } from '../lib/seed';
import { toast } from '../lib/toast';

function fmtBytes(n: number | undefined): string {
    if (!n) return '0 KB';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let val = n;
    while (val >= 1024 && i < units.length - 1) { val /= 1024; i += 1; }
    return `${val.toFixed(val >= 100 || i === 0 ? 0 : 1)} ${units[i] ?? 'B'}`;
}

const SettingsView = () => {
    const [theme, setTheme] = useState<ThemeMode>('auto');
    const [gpsConsent, setGpsConsent] = useState<GeolocationConsent | null>(null);
    const [busy, setBusy] = useState<boolean>(false);
    const [storage, setStorage] = useState<StorageEstimate | null>(null);
    const [pendingRestoreFile, setPendingRestoreFile] = useState<File | null>(null);
    const [confirmingReloadSample, setConfirmingReloadSample] = useState<boolean>(false);

    useEffect(() => {
        (async () => {
            const t = await getSetting<ThemeMode>('theme');
            setTheme(t || 'auto');
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

    async function pickTheme(t: ThemeMode): Promise<void> {
        setTheme(t);
        await saveTheme(t);
    }

    async function onGpsToggle(): Promise<void> {
        const enabling = gpsConsent !== 'granted';
        if (enabling) {
            const pos = await requestGeolocation({ timeout: 10000 });
            const consent: GeolocationConsent = pos ? 'granted' : 'denied';
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

    async function onBackup(): Promise<void> {
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
        } catch (e: unknown) {
            console.error(e);
            const msg = e instanceof Error ? e.message : 'Backup failed';
            toast.error(msg);
        } finally {
            setBusy(false);
        }
    }

    function onRestore(e: ChangeEvent<HTMLInputElement>): void {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setPendingRestoreFile(file);
    }

    async function confirmRestore(): Promise<void> {
        const file = pendingRestoreFile;
        setPendingRestoreFile(null);
        if (!file) return;
        setBusy(true);
        try {
            const text = await file.text();
            const snapshot = JSON.parse(text) as Parameters<typeof importJSON>[0];
            const stats = await importJSON(snapshot, { mode: 'merge' });
            toast.show(`Restored ${stats.jobs} job(s), ${stats.panels} panels, ${stats.photos} photos`);
        } catch (err: unknown) {
            console.error(err);
            const msg = err instanceof Error ? err.message : 'invalid backup';
            toast.error(`Restore failed: ${msg}`);
        } finally {
            setBusy(false);
        }
    }

    function onReloadSample(): void {
        setConfirmingReloadSample(true);
    }

    async function confirmReloadSample(): Promise<void> {
        setConfirmingReloadSample(false);
        setBusy(true);
        try {
            const stats = await reloadSampleJob();
            toast.show(`Sample reloaded: ${stats.jobs} job, ${stats.panels} panels, ${stats.rows} rows`);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            toast.error(`Could not load sample: ${msg}`);
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <AppBar onBack={() => nav('/')} wordmark="Settings" />
            <main>
                <div className="hero">
                    <div className="hero-pretitle">PREFERENCES</div>
                    <h1 className="hero-title">Settings</h1>
                </div>

                <section className="settings-card">
                    <h2 className="settings-section">Display</h2>
                    <div className="setting-row">
                        <div className="setting-label">Theme</div>
                        <div className="seg-control">
                            <button
                                type="button"
                                className={`seg-option${theme === 'auto' ? ' active' : ''}`}
                                onClick={() => pickTheme('auto')}
                            >
                                <Icon name="themeAuto" size={14} />
                                <span>Auto</span>
                            </button>
                            <button
                                type="button"
                                className={`seg-option${theme === 'light' ? ' active' : ''}`}
                                onClick={() => pickTheme('light')}
                            >
                                <Icon name="themeLight" size={14} />
                                <span>Light</span>
                            </button>
                            <button
                                type="button"
                                className={`seg-option${theme === 'dark' ? ' active' : ''}`}
                                onClick={() => pickTheme('dark')}
                            >
                                <Icon name="themeDark" size={14} />
                                <span>Dark</span>
                            </button>
                        </div>
                    </div>
                    <div className="setting-row">
                        <div className="setting-label">Build</div>
                        <span className="build-badge">{BUILD_VERSION}</span>
                    </div>
                </section>

                <section className="settings-card">
                    <h2 className="settings-section">Capture</h2>
                    <div className="setting-row">
                        <div className="setting-label">GPS on photos</div>
                        <button
                            type="button"
                            className={`toggle${gpsConsent === 'granted' ? ' on' : ''}`}
                            onClick={onGpsToggle}
                            aria-pressed={gpsConsent === 'granted'}
                            aria-label="Tag photos with GPS location"
                        >
                            <span className="toggle-thumb" />
                        </button>
                    </div>
                </section>

                <section className="settings-card">
                    <h2 className="settings-section">Data</h2>
                    {storage && (
                        <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                            <div className="setting-label">Storage</div>
                            <div className="storage-bar">
                                <div
                                    className="storage-bar-fill"
                                    style={{ width: `${Math.min(100, ((storage.usage || 0) / (storage.quota || 1)) * 100)}%` }}
                                />
                            </div>
                            <div className="storage-stats">
                                {fmtBytes(storage.usage)}
                                {' of '}
                                {fmtBytes(storage.quota)}
                                {' used'}
                            </div>
                        </div>
                    )}
                    <div className="setting-row">
                        <button type="button" className="ghost" onClick={onReloadSample} disabled={busy}>
                            <Icon name="refresh" size={14} />
                            <span style={{ marginLeft: 6 }}>Reload sample job</span>
                        </button>
                    </div>
                    <div className="setting-row">
                        <button type="button" className="ghost" onClick={onBackup} disabled={busy}>
                            <Icon name="download" size={14} />
                            <span style={{ marginLeft: 6 }}>Export backup</span>
                        </button>
                        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- label wraps the nested <input type="file"> on line below; the rule's nesting heuristic misses it through the icon/span siblings */}
                        <label
                            className="ghost"
                            style={{
                                cursor: busy ? 'not-allowed' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '10px 14px',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--r-md)',
                                opacity: busy ? 0.6 : 1,
                            }}
                        >
                            <Icon name="image" size={14} />
                            <span style={{ marginLeft: 6 }}>Import backup</span>
                            <input
                                type="file"
                                accept="application/json"
                                style={{ display: 'none' }}
                                onChange={onRestore}
                                disabled={busy}
                            />
                        </label>
                    </div>
                </section>

                <footer className="settings-footer">
                    <div className="settings-footer-mark" aria-hidden="true" />
                    <div className="settings-footer-text">
                        <strong>e-OIC</strong>
                        {' · '}
                        {BUILD_VERSION}
                    </div>
                    <div className="settings-footer-sub">An E Tech Group field tool.</div>
                </footer>
                {pendingRestoreFile && (
                    /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- modal backdrop click-to-dismiss; Cancel button covers keyboard path */
                    <div className="modal-bg" onClick={() => setPendingRestoreFile(null)}>
                        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- stopPropagation guard, not an interactive surface */}
                        <div className="modal" onClick={(e) => e.stopPropagation()}>
                            <h2 className="modal-title">Restore this backup?</h2>
                            <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                                <strong>Merge mode:</strong>
                                {' existing jobs are kept; new ones are added. If you want to overwrite duplicates, cancel and use "Replace" via the menu (advanced).'}
                            </p>
                            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                                <button type="button" className="ghost" onClick={() => setPendingRestoreFile(null)}>Cancel</button>
                                <button type="button" className="primary" onClick={confirmRestore}>Restore</button>
                            </div>
                        </div>
                    </div>
                )}

                {confirmingReloadSample && (
                    /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- modal backdrop click-to-dismiss; Cancel button covers keyboard path */
                    <div className="modal-bg" onClick={() => setConfirmingReloadSample(false)}>
                        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- stopPropagation guard, not an interactive surface */}
                        <div className="modal" onClick={(e) => e.stopPropagation()}>
                            <h2 className="modal-title">Reload the sample job?</h2>
                            <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                                Any local edits to the sample will be overwritten. Other jobs are untouched.
                            </p>
                            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                                <button type="button" className="ghost" onClick={() => setConfirmingReloadSample(false)}>Cancel</button>
                                <button type="button" className="primary" onClick={confirmReloadSample}>Reload sample</button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </>
    );
};

export default SettingsView;
