// Types for the Android wrapper bridge (src/lib/wrapperBridge.js).
//
// The wrapper currently exposes itself via two channels:
//   - `globalThis.Capacitor` (Capacitor 6 runtime, with Plugins.Filesystem,
//     Plugins.Share, Plugins.FileOpener).
//   - `globalThis.EoicWrapper` (Android `addJavascriptInterface` object
//     installed by MainActivity; today only carries `getVersion()`).
//
// No structured postMessage protocol exists today — the plan's
// WrapperInboundMessage / WrapperOutboundMessage discriminated unions are
// reserved for a future cross-process channel. They are declared here so
// Plan D can wire them up without churning the type surface, but the union
// arms are intentionally limited to what we can commit to today: the
// version handshake. New variants get added when the JS that emits them
// lands.

// ===== globalThis.EoicWrapper (Android JavascriptInterface) =====

export interface IEoicWrapperInterface {
    getVersion: () => string;
}

// ===== Capacitor plugin surface actually consumed by wrapperBridge.js =====

export type CapacitorFilesystemDirectory = 'CACHE' | 'DATA' | 'DOCUMENTS';

export interface ICapacitorFilesystemWriteFileOptions {
    path: string;
    directory: CapacitorFilesystemDirectory;
    data: string;
    recursive: boolean;
}

export interface ICapacitorFilesystemWriteFileResult {
    uri: string;
}

export interface ICapacitorFilesystemDownloadFileOptions {
    url: string;
    path: string;
    directory: CapacitorFilesystemDirectory;
}

export interface ICapacitorFilesystemDownloadFileResult {
    path: string;
}

export interface ICapacitorFilesystemDeleteFileOptions {
    path: string;
    directory: CapacitorFilesystemDirectory;
}

export interface ICapacitorFilesystemPlugin {
    writeFile: (options: ICapacitorFilesystemWriteFileOptions) => Promise<ICapacitorFilesystemWriteFileResult>;
    downloadFile: (options: ICapacitorFilesystemDownloadFileOptions) => Promise<ICapacitorFilesystemDownloadFileResult>;
    deleteFile: (options: ICapacitorFilesystemDeleteFileOptions) => Promise<void>;
}

export interface ICapacitorShareOptions {
    title?: string;
    text?: string;
    url?: string;
    files?: string[];
}

export interface ICapacitorSharePlugin {
    share: (options: ICapacitorShareOptions) => Promise<void>;
}

export interface ICapacitorFileOpenerOptions {
    filePath: string;
    contentType: string;
}

export interface ICapacitorFileOpenerPlugin {
    open: (options: ICapacitorFileOpenerOptions) => Promise<void>;
}

export interface ICapacitorPlugins {
    Filesystem?: ICapacitorFilesystemPlugin;
    Share?: ICapacitorSharePlugin;
    FileOpener?: ICapacitorFileOpenerPlugin;
}

export interface ICapacitorRuntime {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
    Plugins?: ICapacitorPlugins;
}

// ===== Reserved future message channel (Plan D wires up real variants) =====

export type WrapperInboundMessage =
    | { type: 'wrapper:hello'; version: string };

export type WrapperOutboundMessage =
    | { type: 'app:ready' };

// Exhaustiveness helper for discriminated-union switches. Throws at runtime
// if a new variant is added without a matching `case`, and TypeScript will
// flag the call site at compile time.
export function assertNever(x: never): never {
    throw new Error(`Unhandled discriminated union variant: ${JSON.stringify(x)}`);
}
