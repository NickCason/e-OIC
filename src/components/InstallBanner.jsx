import React, { useState } from 'react';
import Icon from './Icon.jsx';
import { usePwaInstall } from '../lib/usePwaInstall.js';

const DISMISS_KEY = 'eoic-install-banner-dismissed';

export default function InstallBanner() {
  const { canInstall, isIOS, install } = usePwaInstall();
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });
  const [iosOpen, setIosOpen] = useState(false);

  if (!canInstall || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch {}
  }

  async function onInstall() {
    const r = await install();
    if (r === 'ios-instructions') setIosOpen(true);
  }

  return (
    <>
      <div className="install-banner" role="region" aria-label="Install app">
        <div className="install-banner-icon"><Icon name="download" size={18} /></div>
        <div className="install-banner-text">
          <div className="install-banner-title">Install e-OIC</div>
          <div className="install-banner-sub">
            {isIOS
              ? 'Add to your home screen for full-screen, offline-ready use.'
              : 'One-tap install for full-screen, offline-ready use.'}
          </div>
        </div>
        <button className="install-banner-cta" onClick={onInstall} type="button">Install</button>
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
              Apple doesn&apos;t let websites trigger installs directly — you have to do it from the Share sheet. Sorry!
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
