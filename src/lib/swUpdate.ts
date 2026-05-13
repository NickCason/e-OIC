// Service worker update detection.
//
// The SW caches new assets on install but the open tab keeps running the
// old JS bundle until the page reloads. This module:
//   1. Registers the SW
//   2. Detects when a new SW has installed (i.e., there's a newer build)
//   3. Polls registration.update() on foreground + every 15 minutes
//   4. Exposes a tiny pub/sub so the UI can render a "Reload" pill and
//      trigger the swap on user click.

import { useEffect, useState } from 'react';

export interface ISwUpdateState {
    available: boolean;
    applying: boolean;
}

type Listener = (s: ISwUpdateState) => void;

const listeners = new Set<Listener>();
let state: ISwUpdateState = { available: false, applying: false };

function notify(): void {
    listeners.forEach((fn) => fn(state));
}

function setState(next: Partial<ISwUpdateState>): void {
    state = { ...state, ...next };
    notify();
}

let regPromise: Promise<ServiceWorkerRegistration | null> | null = null;

function attachWaitingDetection(reg: ServiceWorkerRegistration): void {
    if (reg.waiting && navigator.serviceWorker.controller) {
        setState({ available: true });
    }
    reg.addEventListener('updatefound', () => {
        const incoming = reg.installing;
        if (!incoming) return;
        incoming.addEventListener('statechange', () => {
            if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
                // A new SW finished installing AND there was a previous one
                // controlling this page → there's a real update available.
                setState({ available: true });
            }
        });
    });
}

function attachReloadOnControllerChange(): void {
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
    });
}

function attachUpdatePolling(reg: ServiceWorkerRegistration): void {
    // Foreground: ask the SW to check for updates.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            reg.update().catch(() => {});
        }
    });
    // Periodic check while open.
    setInterval(() => { reg.update().catch(() => {}); }, 15 * 60 * 1000);
}

export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (regPromise) return regPromise;
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);

    regPromise = navigator.serviceWorker
        .register('./service-worker.js', { updateViaCache: 'none' })
        .then((reg) => {
            attachWaitingDetection(reg);
            attachReloadOnControllerChange();
            attachUpdatePolling(reg);
            return reg;
        })
        .catch((err: unknown) => {
            console.warn('SW registration failed:', err);
            return null;
        });

    return regPromise;
}

export function applyUpdate(): void {
    if (state.applying) return;
    setState({ applying: true });
    regPromise?.then((reg) => {
        const waiting = reg?.waiting;
        if (waiting) {
            waiting.postMessage('skipWaiting');
            // controllerchange listener above will reload the page once the
            // new SW takes over.
        } else {
            // No waiting worker — fall back to a plain reload.
            window.location.reload();
        }
    });
}

export function useUpdateState(): ISwUpdateState {
    const [s, setS] = useState<ISwUpdateState>(state);
    useEffect(() => {
        listeners.add(setS);
        return () => { listeners.delete(setS); };
    }, []);
    return s;
}
