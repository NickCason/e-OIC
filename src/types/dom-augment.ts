// DOM type augmentations for browser surfaces not covered by lib.dom.d.ts
// (or covered but with looser types than the app actually uses).

// ===== BeforeInstallPromptEvent =====
//
// Chrome/Chromium PWA install prompt event. No standard typing in lib.dom
// as of TS 5.x; declared here so usePwaInstall.ts can capture and replay
// the event without `any`.

export interface IUserChoiceResult {
    outcome: 'accepted' | 'dismissed';
    platform: string;
}

export interface IBeforeInstallPromptEvent extends Event {
    readonly platforms: ReadonlyArray<string>;
    readonly userChoice: Promise<IUserChoiceResult>;
    prompt(): Promise<void>;
}

/* eslint-disable @typescript-eslint/naming-convention, no-underscore-dangle --
 * Augmenting built-in DOM interfaces (Window, Navigator, WindowEventMap)
 * requires their exact names — they can't carry the I-prefix the standards
 * apply to interfaces we own. __BUILD_VERSION__ is the literal Vite
 * `define` token; its name is fixed by vite.config.js.
 */
declare global {
    /** Injected by Vite's `define` (see vite.config.js) from version.json
     *  at build time. Consumed via src/version.ts → BUILD_VERSION. */
    const __BUILD_VERSION__: string;

    interface WindowEventMap {
        beforeinstallprompt: IBeforeInstallPromptEvent;
        appinstalled: Event;
    }

    interface Navigator {
        /** Legacy iOS Safari: `true` when running as an installed home-screen
         *  app. The modern path is matchMedia('(display-mode: standalone)'),
         *  but older iOS only supports this property. */
        readonly standalone?: boolean;
    }

    interface Window {
        /** Older IE / Edge legacy. usePwaInstall reads it as part of an
         *  iOS detection guard. */
        readonly MSStream?: unknown;

        /** Installed by the splash coordinator inlined in index.html. Called
         *  by src/main.tsx after the first React commit to release the
         *  splash without waiting for the MAX_MS fallback. */
        __dismissSplash?: () => void;
    }
}
/* eslint-enable @typescript-eslint/naming-convention, no-underscore-dangle */

// Module marker — required for the `declare global` block above to be
// treated as an augmentation rather than a script file.
export {};
