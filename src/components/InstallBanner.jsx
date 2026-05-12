import React, { useState } from 'react';
import Icon from './Icon.jsx';
import { usePwaInstall } from '../lib/usePwaInstall';

const DISMISS_KEY = 'eoic-install-banner-dismissed';
const APK_URL = 'https://github.com/NickCason/e-OIC-android-wrapper/releases/latest/download/e-OIC.apk';

export default function InstallBanner() {
  const { canInstall, isIOS, isAndroid, install } = usePwaInstall();
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });
  const [iosOpen, setIosOpen] = useState(false);

  if (!canInstall || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch {}
  }

  // Android: link directly to the APK download. Browser handles the
  // sideload-from-unknown-apps flow; wrapper signs every release with
  // the same keystore so an upgrade install is also one tap.
  // iOS: open instructions modal (existing behavior).
  // Desktop with beforeinstallprompt: trigger the native prompt.
  async function onInstall() {
    if (isAndroid) {
      window.location.href = APK_URL;
      return;
    }
    const r = await install();
    if (r === 'ios-instructions') setIosOpen(true);
  }

  const title = isAndroid ? 'Install Android app' : 'Install e-OIC';
  const sub = isAndroid
    ? 'Required for sharing on Android.'
    : isIOS
      ? 'Add to your home screen for full-screen, offline-ready use.'
      : 'One-tap install for full-screen, offline-ready use.';
  const ctaLabel = isAndroid ? 'Get APK' : 'Install';

  return (
    <>
      <div className="install-banner" role="region" aria-label="Install app">
        <div className="install-banner-icon"><Icon name="download" size={18} /></div>
        <div className="install-banner-text">
          <div className="install-banner-title">{title}</div>
          <div className="install-banner-sub">{sub}</div>
        </div>
        <button className="install-banner-cta" onClick={onInstall} type="button">{ctaLabel}</button>
        <button className="install-banner-close" onClick={dismiss} aria-label="Dismiss" type="button">
          <Icon name="close" size={16} />
        </button>
      </div>

      {iosOpen && (
        <div className="modal-bg" onClick={() => setIosOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Install on iPhone / iPad</h2>
            <ol className="install-ios-steps">
              <li>
                <span className="install-ios-step-num">1</span>
                <div>Tap the <strong>Share</strong> button at the bottom of Safari (the square with the up-arrow).</div>
              </li>
              <li>
                <span className="install-ios-step-num">2</span>
                <div>Scroll down and tap <strong>Add to Home Screen</strong>.</div>
              </li>
              <li>
                <span className="install-ios-step-num">3</span>
                <div>Tap <strong>Add</strong>. e-OIC will appear on your home screen and run full-screen.</div>
              </li>
            </ol>
            <div className="install-ios-note">
              On iPhone, installs happen from the Share sheet — three quick taps and you&apos;re done.
            </div>
            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
              <button className="primary" onClick={() => setIosOpen(false)}>Got it</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
