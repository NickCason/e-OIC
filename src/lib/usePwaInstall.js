// usePwaInstall — captures Chrome's beforeinstallprompt and exposes a single
// `install()` callback that works on:
//   - Android/desktop Chromium (native prompt)
//   - iOS Safari (returns 'ios-instructions' so caller can show a how-to modal)
// Hides itself when the app is already running as an installed PWA.

import { useEffect, useState, useCallback } from 'react';
import { isInWrapper } from './wrapperBridge.js';

function detectStandalone() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  if (window.navigator.standalone === true) return true; // older iOS Safari
  return false;
}

function detectIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function detectAndroid() {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

export function usePwaInstall() {
  const [installEvent, setInstallEvent] = useState(null);
  const [standalone, setStandalone] = useState(detectStandalone());
  const [installed, setInstalled] = useState(false);
  const isIOS = detectIOS();
  const isAndroid = detectAndroid();
  const inWrapper = isInWrapper();

  useEffect(() => {
    function onBeforeInstall(e) {
      e.preventDefault();
      // On Android (out of wrapper), the wrapper-install banner takes the
      // slot; ignore the native PWA prompt to avoid two competing CTAs.
      if (isAndroid && !inWrapper) return;
      setInstallEvent(e);
    }
    function onInstalled() {
      setInstalled(true);
      setInstallEvent(null);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    const mq = window.matchMedia?.('(display-mode: standalone)');
    const onModeChange = () => setStandalone(detectStandalone());
    mq?.addEventListener?.('change', onModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      mq?.removeEventListener?.('change', onModeChange);
    };
  }, [isAndroid, inWrapper]);

  const install = useCallback(async () => {
    if (installEvent) {
      installEvent.prompt();
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
  const canInstall =
    !standalone && !installed && !inWrapper && (installEvent !== null || isIOS || isAndroid);

  return { canInstall, isIOS, isAndroid, inWrapper, install, standalone };
}
