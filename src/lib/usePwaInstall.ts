// usePwaInstall — captures Chrome's beforeinstallprompt and exposes a single
// `install()` callback that works on:
//   - Android/desktop Chromium (native prompt)
//   - iOS Safari (returns 'ios-instructions' so caller can show a how-to modal)
// Hides itself when the app is already running as an installed PWA.

import {useEffect, useState, useCallback,} from 'react';
import { isInWrapper } from './wrapperBridge';
import type { IBeforeInstallPromptEvent } from '../types/dom-augment';

export type PwaInstallOutcome = 'installed' | 'dismissed' | 'ios-instructions' | 'unsupported';

export interface IUsePwaInstallResult {
    canInstall: boolean;
    isIOS: boolean;
    isAndroid: boolean;
    inWrapper: boolean;
    install: () => Promise<PwaInstallOutcome>;
    standalone: boolean;
}

function detectStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
    if (window.navigator.standalone === true) return true; // older iOS Safari
    return false;
}

function detectIOS(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function detectAndroid(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /Android/i.test(navigator.userAgent);
}

export function usePwaInstall(): IUsePwaInstallResult {
    const [installEvent, setInstallEvent] = useState<IBeforeInstallPromptEvent | null>(null);
    const [standalone, setStandalone] = useState<boolean>(detectStandalone());
    const [installed, setInstalled] = useState<boolean>(false);
    const isIOS = detectIOS();
    const isAndroid = detectAndroid();
    const inWrapper = isInWrapper();

    useEffect(() => {
        function onBeforeInstall(e: IBeforeInstallPromptEvent): void {
            e.preventDefault();
            // On Android (out of wrapper), the wrapper-install banner takes
            // the slot; ignore the native PWA prompt to avoid two competing
            // CTAs.
            if (isAndroid && !inWrapper) return;
            setInstallEvent(e);
        }
        function onInstalled(): void {
            setInstalled(true);
            setInstallEvent(null);
        }
        window.addEventListener('beforeinstallprompt', onBeforeInstall);
        window.addEventListener('appinstalled', onInstalled);

        const mq = window.matchMedia?.('(display-mode: standalone)');
        const onModeChange = (): void => setStandalone(detectStandalone());
        mq?.addEventListener?.('change', onModeChange);

        return () => {
            window.removeEventListener('beforeinstallprompt', onBeforeInstall);
            window.removeEventListener('appinstalled', onInstalled);
            mq?.removeEventListener?.('change', onModeChange);
        };
    }, [isAndroid, inWrapper]);

    const install = useCallback<() => Promise<PwaInstallOutcome>>(async () => {
        if (installEvent) {
            await installEvent.prompt();
            const choice = await installEvent.userChoice;
            setInstallEvent(null);
            return choice.outcome === 'accepted' ? 'installed' : 'dismissed';
        }
        if (isIOS) return 'ios-instructions';
        return 'unsupported';
    }, [installEvent, isIOS]);

    // Banner visibility:
    //  - Hidden inside the wrapper (no install pitch needed)
    //  - Hidden when already standalone or installed
    //  - Visible on Android (not in wrapper) -> wrapper-install variant
    //  - Visible on iOS -> add-to-home-screen instructions
    //  - Visible on desktop when beforeinstallprompt has fired
    const canInstall = !standalone
        && !installed
        && !inWrapper
        && (installEvent !== null || isIOS || isAndroid);

    return {
        canInstall, isIOS, isAndroid, inWrapper, install, standalone,
    };
}
