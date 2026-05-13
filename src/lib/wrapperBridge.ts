// Single module gating all window.Capacitor interaction.
// All functions feature-detect at runtime so the module is safe to
// import in non-wrapper contexts (desktop, iOS Safari, vanilla Android Chrome).

import type {ICapacitorRuntime, IEoicWrapperInterface,} from '../types/wrapper';

declare global {
    // eslint-disable-next-line vars-on-top
    var Capacitor: ICapacitorRuntime | undefined;
    // eslint-disable-next-line vars-on-top
    var EoicWrapper: IEoicWrapperInterface | undefined;
}

export function isInWrapper(): boolean {
    const { Capacitor } = globalThis;
    return typeof Capacitor?.isNativePlatform === 'function'
        && Capacitor.isNativePlatform() === true;
}

export function isAndroidWrapper(): boolean {
    if (!isInWrapper()) return false;
    return globalThis.Capacitor?.getPlatform?.() === 'android';
}

// Reads the wrapper APK version exposed by Android's
// addJavascriptInterface (`window.EoicWrapper`). The interface is
// installed before page load by the wrapper's MainActivity, so it is
// safe to call from any React effect.
export function getWrapperVersion(): string | null {
    const ew = globalThis.EoicWrapper;
    if (!ew || typeof ew.getVersion !== 'function') return null;
    try {
        const v = ew.getVersion();
        return typeof v === 'string' ? v : null;
    } catch {
        return null;
    }
}

function parseVersion(s: unknown): number | null {
    if (typeof s !== 'string') return null;
    const m = /^v(\d+)$/.exec(s);
    return m && m[1] ? parseInt(m[1], 10) : null;
}

export function compareWrapperVersions(a: unknown, b: unknown): -1 | 0 | 1 {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    if (pa == null || pb == null) return 0;
    if (pa < pb) return -1;
    if (pa > pb) return 1;
    return 0;
}

async function fileToBase64(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (): void => {
            const r = reader.result;
            if (typeof r !== 'string') {
                reject(new Error('Unexpected FileReader result'));
                return;
            }
            const idx = r.indexOf(',');
            resolve(idx >= 0 ? r.slice(idx + 1) : r);
        };
        reader.onerror = (): void => {
            reject(reader.error || new Error('FileReader failed'));
        };
        reader.readAsDataURL(file);
    });
}

// Bridge entry: write the File to Capacitor's CACHE directory, then call
// the Share plugin with the resulting file:// URI. Bypasses Chrome's
// share_service_impl.cc allowlist by going straight through Android's
// Intent.ACTION_SEND via Capacitor's FileProvider.
export async function shareViaCapacitor(file: File): Promise<void> {
    const { Capacitor } = globalThis;
    const Filesystem = Capacitor?.Plugins?.Filesystem;
    const Share = Capacitor?.Plugins?.Share;
    if (!Filesystem || !Share) {
        throw new Error('Capacitor Share/Filesystem plugin not available');
    }
    const base64 = await fileToBase64(file);
    const path = `eoic-share-${Date.now()}-${file.name}`;
    const written = await Filesystem.writeFile({
        path, directory: 'CACHE', data: base64, recursive: false,
    });
    try {
        await Share.share({ title: file.name, files: [written.uri] });
    } finally {
        Filesystem.deleteFile({ path, directory: 'CACHE' }).catch(() => {});
    }
}

// Downloads the wrapper APK to CACHE then launches the Android system
// package installer. Requires REQUEST_INSTALL_PACKAGES in the wrapper's
// AndroidManifest.xml. Same-keystore APKs install over the existing
// install without uninstall.
export async function downloadAndInstallApk(url: string): Promise<void> {
    const { Capacitor } = globalThis;
    const Filesystem = Capacitor?.Plugins?.Filesystem;
    const FileOpener = Capacitor?.Plugins?.FileOpener;
    if (!Filesystem) throw new Error('Filesystem plugin not available');
    if (!FileOpener) throw new Error('FileOpener plugin not available');
    const path = 'eoic-update.apk';
    const dl = await Filesystem.downloadFile({
        url, path, directory: 'CACHE'
    });
    // dl.path is the absolute filesystem path of the saved APK.
    await FileOpener.open({
        filePath: dl.path,
        contentType: 'application/vnd.android.package-archive',
    });
}
