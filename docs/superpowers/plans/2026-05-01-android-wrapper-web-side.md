# Android wrapper — e-OIC web-side implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Capacitor-aware behavior to the e-OIC PWA so it routes share through native intents inside the Android wrapper, shows an "Install Android app" banner to out-of-wrapper Android users, and prompts wrapper users to install APK updates.

**Architecture:** A single `wrapperBridge.js` module gates all `window.Capacitor` interaction. `usePwaInstall.js` learns to detect Android and to suppress the existing `beforeinstallprompt` flow there. `InstallBanner.jsx` grows a third (wrapper-install) variant. A new `WrapperUpdateBanner.jsx` polls `wrapper-version.json` and triggers in-app APK download + install via `@capacitor/filesystem` and `@capacitor-community/file-opener`. `exporter.js` forks the share path on `isInWrapper()`.

**Tech Stack:** React 18, Vite 5, `node:test` for pure-JS helpers. No new bundle deps — Capacitor plugins are reached via runtime-injected `globalThis.Capacitor.Plugins.*` so non-wrapper users incur zero bundle cost.

**Spec:** `docs/superpowers/specs/2026-05-01-android-wrapper-design.md`

**Conventions:** Direct-on-main, scoped commits with conventional prefixes, `git add <specific files>` (never `-A`), pure-JS helpers get `node:test` coverage.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/wrapperBridge.js` | Create | All `window.Capacitor` touching. Detection + share + update install. |
| `src/lib/wrapperBridge.test.js` | Create | `node:test` coverage of detection/comparator helpers. |
| `src/lib/usePwaInstall.js` | Modify | Add Android detection; suppress `canInstall` when Android & not in wrapper. |
| `src/components/InstallBanner.jsx` | Modify | Add Android-wrapper-install variant; route CTA differently per variant. |
| `src/components/WrapperUpdateBanner.jsx` | Create | Mounts in wrapper only; fetches `wrapper-version.json`; offers Update CTA. |
| `src/components/JobList.jsx` | Modify | Render `<WrapperUpdateBanner />` alongside `<InstallBanner />`. |
| `src/exporter.js` | Modify | Fork `shareBlob` on `isInWrapper()`. |
| `public/wrapper-version.json` | Create | Latest wrapper APK version + URL, served by GH Pages. |

---

## Task 1: `wrapperBridge` — detection and version helpers (TDD)

**Files:**
- Create: `src/lib/wrapperBridge.js`
- Test: `src/lib/wrapperBridge.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/wrapperBridge.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isInWrapper, isAndroidWrapper, getWrapperVersion, compareWrapperVersions } from './wrapperBridge.js';

function withGlobals(globals, fn) {
  const saved = {};
  for (const k of Object.keys(globals)) {
    saved[k] = globalThis[k];
    globalThis[k] = globals[k];
  }
  try { return fn(); }
  finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete globalThis[k];
      else globalThis[k] = saved[k];
    }
  }
}

test('isInWrapper: false when no Capacitor', () => {
  withGlobals({ Capacitor: undefined }, () => {
    assert.equal(isInWrapper(), false);
  });
});

test('isInWrapper: false when Capacitor lacks isNativePlatform', () => {
  withGlobals({ Capacitor: {} }, () => {
    assert.equal(isInWrapper(), false);
  });
});

test('isInWrapper: false when isNativePlatform returns false', () => {
  withGlobals({ Capacitor: { isNativePlatform: () => false } }, () => {
    assert.equal(isInWrapper(), false);
  });
});

test('isInWrapper: true when isNativePlatform returns true', () => {
  withGlobals({ Capacitor: { isNativePlatform: () => true } }, () => {
    assert.equal(isInWrapper(), true);
  });
});

test('isAndroidWrapper: false when not in wrapper', () => {
  withGlobals({ Capacitor: undefined }, () => {
    assert.equal(isAndroidWrapper(), false);
  });
});

test('isAndroidWrapper: false when in wrapper but platform is ios', () => {
  withGlobals({
    Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
  }, () => {
    assert.equal(isAndroidWrapper(), false);
  });
});

test('isAndroidWrapper: true when in wrapper and platform is android', () => {
  withGlobals({
    Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
  }, () => {
    assert.equal(isAndroidWrapper(), true);
  });
});

test('getWrapperVersion: null when EoicWrapper absent', () => {
  withGlobals({ EoicWrapper: undefined }, () => {
    assert.equal(getWrapperVersion(), null);
  });
});

test('getWrapperVersion: null when getVersion missing', () => {
  withGlobals({ EoicWrapper: {} }, () => {
    assert.equal(getWrapperVersion(), null);
  });
});

test('getWrapperVersion: returns string from getVersion()', () => {
  withGlobals({ EoicWrapper: { getVersion: () => 'v3' } }, () => {
    assert.equal(getWrapperVersion(), 'v3');
  });
});

test('getWrapperVersion: null when getVersion returns non-string', () => {
  withGlobals({ EoicWrapper: { getVersion: () => 42 } }, () => {
    assert.equal(getWrapperVersion(), null);
  });
});

test('getWrapperVersion: null when getVersion throws', () => {
  withGlobals({ EoicWrapper: { getVersion: () => { throw new Error('boom'); } } }, () => {
    assert.equal(getWrapperVersion(), null);
  });
});

test('compareWrapperVersions: equal', () => {
  assert.equal(compareWrapperVersions('v2', 'v2'), 0);
});

test('compareWrapperVersions: a < b', () => {
  assert.equal(compareWrapperVersions('v1', 'v2'), -1);
});

test('compareWrapperVersions: a > b', () => {
  assert.equal(compareWrapperVersions('v10', 'v2'), 1);
});

test('compareWrapperVersions: malformed returns 0', () => {
  assert.equal(compareWrapperVersions('foo', 'v2'), 0);
  assert.equal(compareWrapperVersions('v2', null), 0);
  assert.equal(compareWrapperVersions(undefined, 'v1'), 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:unit -- --test-name-pattern="isInWrapper|isAndroidWrapper|getWrapperVersion|compareWrapperVersions"
```
Expected: all fail (module does not exist yet).

- [ ] **Step 3: Implement minimal helpers**

Create `src/lib/wrapperBridge.js`:

```js
// Single module gating all window.Capacitor interaction.
// All functions feature-detect at runtime so the module is safe to
// import in non-wrapper contexts (desktop, iOS Safari, vanilla Android Chrome).

export function isInWrapper() {
  const Capacitor = globalThis.Capacitor;
  return typeof Capacitor?.isNativePlatform === 'function' && Capacitor.isNativePlatform() === true;
}

export function isAndroidWrapper() {
  if (!isInWrapper()) return false;
  return globalThis.Capacitor?.getPlatform?.() === 'android';
}

// Reads the wrapper APK version exposed by Android's
// addJavascriptInterface (`window.EoicWrapper`). The interface is
// installed before page load by the wrapper's MainActivity, so it is
// safe to call from any React effect.
export function getWrapperVersion() {
  const ew = globalThis.EoicWrapper;
  if (!ew || typeof ew.getVersion !== 'function') return null;
  try {
    const v = ew.getVersion();
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

function parseVersion(s) {
  if (typeof s !== 'string') return null;
  const m = /^v(\d+)$/.exec(s);
  return m ? parseInt(m[1], 10) : null;
}

export function compareWrapperVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (pa == null || pb == null) return 0;
  if (pa < pb) return -1;
  if (pa > pb) return 1;
  return 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:unit
```
Expected: all tests pass; pre-existing tests still pass.

- [ ] **Step 5: Lint**

```bash
npm run lint
```
Expected: 0 errors. (Pre-existing ~18 warnings unchanged.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/wrapperBridge.js src/lib/wrapperBridge.test.js
git commit -m "feat: add wrapperBridge with Capacitor detection helpers"
```

---

## Task 2: `wrapperBridge.shareViaCapacitor`

**Files:**
- Modify: `src/lib/wrapperBridge.js`

This function uses runtime Capacitor plugins; it cannot be unit-tested under `node:test`. Validation is deferred to manual emulator testing in Task 11.

- [ ] **Step 1: Append `shareViaCapacitor` and helper to `wrapperBridge.js`**

Append to `src/lib/wrapperBridge.js`:

```js
async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r !== 'string') {
        reject(new Error('Unexpected FileReader result'));
        return;
      }
      const idx = r.indexOf(',');
      resolve(idx >= 0 ? r.slice(idx + 1) : r);
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}

// Bridge entry: write the File to Capacitor's CACHE directory, then call
// the Share plugin with the resulting file:// URI. Bypasses Chrome's
// share_service_impl.cc allowlist by going straight through Android's
// Intent.ACTION_SEND via Capacitor's FileProvider.
export async function shareViaCapacitor(file) {
  const Capacitor = globalThis.Capacitor;
  const Filesystem = Capacitor?.Plugins?.Filesystem;
  const Share = Capacitor?.Plugins?.Share;
  if (!Filesystem || !Share) {
    throw new Error('Capacitor Share/Filesystem plugin not available');
  }
  const base64 = await fileToBase64(file);
  const path = `eoic-share-${Date.now()}-${file.name}`;
  const written = await Filesystem.writeFile({
    path,
    directory: 'CACHE',
    data: base64,
    recursive: false,
  });
  try {
    await Share.share({
      title: file.name,
      files: [written.uri],
    });
  } finally {
    Filesystem.deleteFile({ path, directory: 'CACHE' }).catch(() => {});
  }
}
```

- [ ] **Step 2: Lint**

```bash
npm run lint
```
Expected: 0 errors.

- [ ] **Step 3: Run unit tests (sanity — no new tests, existing must still pass)**

```bash
npm run test:unit
```
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/wrapperBridge.js
git commit -m "feat: add shareViaCapacitor bridge for native Android share"
```

---

## Task 3: `wrapperBridge.downloadAndInstallApk`

**Files:**
- Modify: `src/lib/wrapperBridge.js`

- [ ] **Step 1: Append `downloadAndInstallApk` to `wrapperBridge.js`**

Append:

```js
// Downloads the wrapper APK to CACHE then launches the Android system
// package installer. Requires REQUEST_INSTALL_PACKAGES in the wrapper's
// AndroidManifest.xml. Same-keystore APKs install over the existing
// install without uninstall.
export async function downloadAndInstallApk(url) {
  const Capacitor = globalThis.Capacitor;
  const Filesystem = Capacitor?.Plugins?.Filesystem;
  const FileOpener = Capacitor?.Plugins?.FileOpener;
  if (!Filesystem) throw new Error('Filesystem plugin not available');
  if (!FileOpener) throw new Error('FileOpener plugin not available');
  const path = 'eoic-update.apk';
  const dl = await Filesystem.downloadFile({
    url,
    path,
    directory: 'CACHE',
  });
  // dl.path is the absolute filesystem path of the saved APK.
  await FileOpener.open({
    filePath: dl.path,
    contentType: 'application/vnd.android.package-archive',
  });
}
```

- [ ] **Step 2: Lint and test**

```bash
npm run lint && npm run test:unit
```
Expected: 0 lint errors, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/wrapperBridge.js
git commit -m "feat: add downloadAndInstallApk for in-app wrapper updates"
```

---

## Task 4: Suppress `beforeinstallprompt` on Android in `usePwaInstall`

**Files:**
- Modify: `src/lib/usePwaInstall.js`

- [ ] **Step 1: Apply edits to `src/lib/usePwaInstall.js`**

Add `detectAndroid` next to `detectIOS`:

```js
function detectAndroid() {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}
```

Modify `usePwaInstall`:

```js
import { useEffect, useState, useCallback } from 'react';
import { isInWrapper } from './wrapperBridge.js';

// ...detectStandalone unchanged...
// ...detectIOS unchanged...
// ...detectAndroid added above...

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
```

- [ ] **Step 2: Lint and test**

```bash
npm run lint && npm run test:unit
```
Expected: 0 errors, tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/usePwaInstall.js
git commit -m "feat: detect Android and suppress beforeinstallprompt out of wrapper"
```

---

## Task 5: Add wrapper-install variant to `InstallBanner.jsx`

**Files:**
- Modify: `src/components/InstallBanner.jsx`

The wrapper APK URL is hardcoded here for the install link. The update path uses `wrapper-version.json` (Task 6); this banner is shown only to users who haven't installed the wrapper yet, so a static link is correct.

- [ ] **Step 1: Replace `src/components/InstallBanner.jsx` with the three-variant version**

```jsx
import React, { useState } from 'react';
import Icon from './Icon.jsx';
import { usePwaInstall } from '../lib/usePwaInstall.js';

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
```

- [ ] **Step 2: Lint**

```bash
npm run lint
```
Expected: 0 errors.

- [ ] **Step 3: Smoke-test locally**

```bash
npm run dev
```
Open http://localhost:5173 in desktop Chrome. Verify the existing install banner still works as before. (Android UA emulation in DevTools → Device Toolbar will show the new variant.)

- [ ] **Step 4: Commit**

```bash
git add src/components/InstallBanner.jsx
git commit -m "feat: add Android wrapper-install banner variant"
```

---

## Task 6: `WrapperUpdateBanner.jsx`

**Files:**
- Create: `src/components/WrapperUpdateBanner.jsx`

- [ ] **Step 1: Create component**

```jsx
import React, { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { isInWrapper, getWrapperVersion, compareWrapperVersions, downloadAndInstallApk } from '../lib/wrapperBridge.js';
import { showToast } from '../lib/toast.js';

const DISMISS_KEY = 'eoic-wrapper-update-dismissed';
const VERSION_URL = '/wrapper-version.json';
const TROUBLE_URL = 'https://github.com/NickCason/e-OIC-android-wrapper/blob/main/docs/install.md';

export default function WrapperUpdateBanner() {
  const [remote, setRemote] = useState(null); // { version, url } when newer
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isInWrapper()) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(VERSION_URL, { cache: 'no-store' });
        if (!r.ok) return;
        const data = await r.json();
        if (cancelled) return;
        const installed = getWrapperVersion();
        if (compareWrapperVersions(installed, data.version) < 0 && data.url) {
          setRemote({ version: data.version, url: data.url });
        }
      } catch {
        // Network failure: silently skip. Try again next launch.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!remote || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch {}
  }

  async function onUpdate() {
    if (busy) return;
    setBusy(true);
    try {
      await downloadAndInstallApk(remote.url);
    } catch (e) {
      showToast(`Update download failed: ${e?.message || 'unknown error'}`);
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
          A new Android app version ({remote.version}) is ready.
          {' '}<a href={TROUBLE_URL} target="_blank" rel="noreferrer">Trouble updating?</a>
        </div>
      </div>
      <button className="install-banner-cta" onClick={onUpdate} type="button" disabled={busy}>
        {busy ? 'Updating…' : 'Update'}
      </button>
      <button className="install-banner-close" onClick={dismiss} aria-label="Dismiss" type="button">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify `showToast` import path**

Run:
```bash
grep -n "export.*showToast\|export default" src/lib/toast.js
```
Expected: confirms `showToast` is exported. If it's exported under a different name, adjust the import.

- [ ] **Step 3: Lint**

```bash
npm run lint
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/WrapperUpdateBanner.jsx
git commit -m "feat: add WrapperUpdateBanner for in-app APK updates"
```

---

## Task 7: Render `WrapperUpdateBanner` in `JobList.jsx`

**Files:**
- Modify: `src/components/JobList.jsx`

- [ ] **Step 1: Add import and render**

In `src/components/JobList.jsx`:

Find the existing import:
```jsx
import InstallBanner from './InstallBanner.jsx';
```
Add directly below:
```jsx
import WrapperUpdateBanner from './WrapperUpdateBanner.jsx';
```

Find the existing `<InstallBanner />` render around line 104 and add `WrapperUpdateBanner` directly above it:
```jsx
<WrapperUpdateBanner />
<InstallBanner />
```

- [ ] **Step 2: Lint**

```bash
npm run lint
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/JobList.jsx
git commit -m "feat: render WrapperUpdateBanner alongside InstallBanner"
```

---

## Task 8: Fork share path in `exporter.js`

**Files:**
- Modify: `src/exporter.js`

- [ ] **Step 1: Add import at the top of `src/exporter.js`**

Add near the existing imports:
```js
import { isInWrapper, shareViaCapacitor } from './lib/wrapperBridge.js';
```

- [ ] **Step 2: Replace `shareBlob` body to fork on `isInWrapper()`**

Replace the existing `shareBlob` function (around lines 707-731) with:

```js
export async function shareBlob(blob, filename, title, shareFile = null) {
  const safeName = shareSafeFilename(filename);
  const safeTitle = shareSafeFilename(title);
  const mime = safeName.endsWith('.xlsx')
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'application/zip';
  const file = shareFile || new File([blob], safeName, { type: mime });

  // Inside the Android wrapper: bypass Chrome's share allowlist by going
  // through Android's Intent.ACTION_SEND via Capacitor. The web-side
  // canShare() check is irrelevant here — the native share plugin
  // accepts whatever file we hand it.
  if (isInWrapper()) {
    await shareViaCapacitor(file);
    return true;
  }

  // Browser path (desktop, iOS Safari, Android Chrome out of wrapper).
  // Stay synchronous up to the share() call; never call share() twice
  // from one gesture. canShare gating preserves the existing
  // download-fallback path when the browser refuses files.
  if (!navigator.canShare || !navigator.canShare({ files: [file] })) {
    return false;
  }
  const payload = { files: [file] };
  if (safeTitle && safeTitle !== 'unnamed') payload.title = safeTitle;
  await navigator.share(payload);
  return true;
}
```

- [ ] **Step 3: Lint and run all tests**

```bash
npm run lint && npm test
```
Expected: 0 lint errors; all unit and e2e tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/exporter.js
git commit -m "feat: route share through Capacitor when running in wrapper"
```

---

## Task 9: Publish `wrapper-version.json`

**Files:**
- Create: `public/wrapper-version.json`

- [ ] **Step 1: Create the JSON file**

```json
{
  "version": "v1",
  "url": "https://github.com/NickCason/e-OIC-android-wrapper/releases/latest/download/e-OIC.apk",
  "minRequired": "v1"
}
```

- [ ] **Step 2: Verify Vite copies `public/` to dist**

Run:
```bash
npm run build
ls dist/wrapper-version.json
```
Expected: `dist/wrapper-version.json` exists with the same content.

- [ ] **Step 3: Commit**

```bash
git add public/wrapper-version.json
git commit -m "feat: publish wrapper-version.json for in-app update checks"
```

---

## Task 10: Bump PWA version

**Files:**
- Modify: `public/version.json`

- [ ] **Step 1: Read current version**

```bash
cat public/version.json
```

- [ ] **Step 2: Bump to next**

If current is `vNN`, replace with `v(NN+1)`:

```json
{ "version": "v37" }
```
(Use the actual next number based on current state.)

- [ ] **Step 3: Commit**

```bash
git add public/version.json
git commit -m "chore: bump version for wrapper bridge changes"
```

---

## Task 11: Manual smoke checks (no wrapper available yet)

These run before pushing — the wrapper repo plan has its own emulator-based testing.

- [ ] **Step 1: Desktop Chrome regression**

```bash
npm run dev
```
Open http://localhost:5173. Verify:
- Install banner appears (PWA install prompt). Existing variant.
- Export → Share works as before (uses `navigator.share` or download fallback).
- No console errors related to Capacitor.

- [ ] **Step 2: Android UA emulation in DevTools**

DevTools → ⋮ → More tools → Device toolbar → pick a Pixel device. Reload. Verify:
- Install banner shows the new "Install Android app" variant with "Get APK" CTA.
- CTA `href` points at the APK release URL (right-click → inspect).
- Existing PWA install prompt (`beforeinstallprompt`) does NOT trigger a competing banner.

- [ ] **Step 3: iOS UA emulation**

Switch device to iPhone in DevTools. Reload. Verify:
- Install banner shows the iOS variant with "Add to Home Screen" instructions.
- No regression.

- [ ] **Step 4: Build, push, watch deploy**

```bash
npm test
npm run build
git push origin main
```
Open https://github.com/NickCason/e-OIC/actions and confirm the Pages deploy succeeds. Open https://nickcason.github.io/e-OIC/wrapper-version.json and confirm it serves correctly.

- [ ] **Step 5: Manual cleanup task list**

If any step fails, fix and re-commit. Do not proceed to wrapper-repo plan until step 4 succeeds — the wrapper plan depends on `wrapper-version.json` being live.

---

## Self-review summary

- All spec sections (Architecture, JS↔native contract, e-OIC changes, data flows, error handling) trace to a task in this plan.
- Wrapper-repo work is intentionally out of scope — covered by sibling plan `2026-05-01-android-wrapper-repo.md`.
- Open items deferred to plan-time (version-injection mechanism, banner-stack visual coordination, install help-page copy) are addressed inside the wrapper-repo plan since they live in that repo.
- No placeholders remain. Every code step shows the code; every command step shows the command and expected output.
