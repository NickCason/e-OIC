# Android Capacitor wrapper — design

**Status:** Approved design, awaiting implementation plans
**Date:** 2026-05-01
**Scope:** Two coordinated artifacts, specced together because they share a JS↔native contract:
1. e-OIC (this repo) — web-side changes to detect the wrapper, route share through Capacitor, surface install/update banners.
2. e-OIC-android-wrapper (new repo) — Capacitor Android shell whose WebView points at the live e-OIC URL, ships the share/filesystem/file-opener plugins, builds a signed APK to GitHub Releases.

## Background

`navigator.share({ files })` rejects with `NotAllowedError` on Android Chrome for `.zip`, `.xlsx`, and `application/octet-stream` files because Chrome's `share_service_impl.cc` enforces hardcoded MIME and extension allowlists (in place since 2019, no flag, no workaround). Field engineers need to share `.zip` exports to Outlook/Teams from the share sheet — currently broken on Android. The wrapper bypasses Chrome's gate by using Android's `Intent.ACTION_SEND` directly via Capacitor.

Full root-cause investigation: see prior session memory `project_e_oic_android_share.md`. Forward path was decided in that session; this spec details the build.

## Architecture

```
e-OIC (existing)                    e-OIC-android-wrapper (new)
─────────────────                   ───────────────────────────
React PWA on GH Pages               Capacitor Android shell
├── exporter.js — share fork        ├── WebView → live e-OIC URL
├── InstallBanner.jsx — Android var ├── @capacitor/share
├── WrapperUpdateBanner.jsx (new)   ├── @capacitor/filesystem
├── lib/wrapperBridge.js (new)      ├── @capacitor-community/file-opener
├── public/wrapper-version.json     ├── REQUEST_INSTALL_PACKAGES perm
└── usePwaInstall.js — Android      ├── version.ts (build-injected)
    suppressed when out-of-wrapper  └── .github/workflows/release.yml
```

The wrapper's WebView loads `https://nickcason.github.io/e-OIC/`. Capacitor injects `window.Capacitor` into the page. The web side feature-detects via `window.Capacitor?.isNativePlatform()` and forks behavior at three points: share, install banner, update prompt.

**iOS and desktop:** untouched. iOS uses the existing PWA install path. Desktop uses `navigator.share` or download fallback. Wrapper is Android-only.

**Distribution:** GitHub Actions on tag push builds a signed APK and uploads it as a Release asset. Stable URL `https://github.com/NickCason/e-OIC-android-wrapper/releases/latest/download/e-OIC.apk`. Field engineers sideload once; in-app updater handles subsequent versions.

## JS↔native contract

Single source of truth — both repos must agree on these surfaces.

**Wrapper exposes to webview:**
- `window.Capacitor` — injected by Capacitor runtime; standard.
- `window.Capacitor.isNativePlatform()` — returns `true` inside wrapper.
- `window.Capacitor.getPlatform()` — returns `'android'` inside wrapper.
- `window.__eoicWrapperVersion` — string like `"v1"`, build-injected from git tag. Read by web side to compare against `wrapper-version.json`.
- Plugins available via `Capacitor.Plugins` or the imported `@capacitor/*` packages: `Share`, `Filesystem`, `FileOpener` (community).

**Web side calls:**
- `Filesystem.writeFile({ path, directory: 'CACHE', data: <base64>, recursive: false })` → returns `{ uri }`.
- `Share.share({ title, text?, files: [uri] })` → resolves on success, rejects on cancel/error.
- `Filesystem.deleteFile({ path, directory: 'CACHE' })` — best-effort cache cleanup post-share.
- For update: `Filesystem.downloadFile({ url, path, directory: 'CACHE' })` then `FileOpener.open({ filePath, contentType: 'application/vnd.android.package-archive' })`.

## e-OIC (existing repo) changes

### New files

**`src/lib/wrapperBridge.js`** — single module gating all `window.Capacitor` interaction. Exports:
- `isInWrapper()` — returns `globalThis.Capacitor?.isNativePlatform?.() === true`.
- `getWrapperVersion()` — returns `globalThis.__eoicWrapperVersion ?? null`.
- `shareViaCapacitor(file: File)` — writes file to cache via `Filesystem.writeFile`, calls `Share.share` with the URI, schedules cleanup via `Filesystem.deleteFile` regardless of share outcome (don't block on cleanup).
- `downloadAndInstallApk(url: string)` — downloads via `Filesystem.downloadFile`, opens via `FileOpener.open` with the APK MIME.
- `compareWrapperVersions(installed: string, remote: string)` — strict `vN`-integer comparator returning `-1 | 0 | 1`. Returns `0` on parse failure (treat as no-op rather than spam an update banner).

**`public/wrapper-version.json`** — served at `/wrapper-version.json` by GH Pages.
```json
{
  "version": "v1",
  "url": "https://github.com/NickCason/e-OIC-android-wrapper/releases/latest/download/e-OIC.apk",
  "minRequired": "v1"
}
```
Bumped manually when a new wrapper APK ships. Not subject to Vite's `__BUILD_VERSION__` substitution. Existing `version.json` (PWA content version) is independent.

**`src/components/WrapperUpdateBanner.jsx`** — mounts only when `isInWrapper()`. On mount, fetches `/wrapper-version.json`. If `compareWrapperVersions(getWrapperVersion(), remote.version) < 0`, renders a non-blocking banner with two buttons: "Update" (calls `downloadAndInstallApk(remote.url)`) and dismiss (session-scoped). Banner copy: "A new Android app version is available." Shows a tiny help link "Trouble updating?" pointing at the wrapper repo's README install section.

### Modified files

**`src/exporter.js`** (~line 724) — fork the share path:
```js
import { isInWrapper, shareViaCapacitor } from './lib/wrapperBridge.js';
// ...
if (isInWrapper()) {
  await shareViaCapacitor(file);
} else {
  if (!navigator.canShare || !navigator.canShare({ files: [file] })) {
    // existing fallback
  }
  await navigator.share(payload);
}
```
Existing `canShare` precheck only runs in the non-wrapper branch. The wrapper branch trusts Capacitor's plugin to either succeed or throw a meaningful error.

**`src/components/InstallBanner.jsx`** — add a third variant alongside the existing iOS and PWA-install variants. When `isAndroid && !isInWrapper && !installed`, render the wrapper-install variant: title "Install Android app", subtitle "Full sharing support — required for Android.", CTA button links to `https://github.com/NickCason/e-OIC-android-wrapper/releases/latest/download/e-OIC.apk`. Re-uses existing styling. Dismiss is `sessionStorage`-scoped (re-shows next launch — deliberate adoption pressure for an internal tool). After this change, the PWA-install variant effectively covers desktop Chromium only (Android beforeinstallprompt is suppressed; iOS uses its own branch).

**`src/lib/usePwaInstall.js`** — add `detectAndroid()` mirroring `detectIOS()`. Compute `canInstall` such that on Android (and not in wrapper), `canInstall` is `false` for the existing PWA prompt — the wrapper banner takes the slot. Existing iOS and desktop logic untouched.

**`src/App.jsx`** (or wherever `InstallBanner` is rendered) — also render `<WrapperUpdateBanner />` so it appears alongside other top-of-app banners.

### Dependencies added to e-OIC

- `@capacitor/core` (devDep — types only; runtime is provided by the wrapper). The PWA bundle does not import any Capacitor plugin code; everything is reached via the runtime-injected `globalThis.Capacitor.Plugins.*` to avoid bloating the PWA bundle for non-wrapper users.

Practically: `wrapperBridge.js` reads from `globalThis.Capacitor.Plugins.Share` etc. rather than `import { Share } from '@capacitor/share'`. This keeps the PWA bundle free of Capacitor weight when running in plain browsers.

## e-OIC-android-wrapper (new repo) structure

```
e-OIC-android-wrapper/
├── capacitor.config.ts
├── package.json
├── android/                            # generated by `npx cap add android`, committed
│   └── app/src/main/AndroidManifest.xml
├── src/
│   └── version.ts                      # exports BUILD_VERSION, written by CI
├── .github/workflows/release.yml
├── README.md                           # build, sideload, update instructions
├── docs/install.md                     # one-screen field-engineer how-to
└── .gitignore
```

**`capacitor.config.ts`:**
```ts
import { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.etechgroup.eoic',
  appName: 'e-OIC',
  webDir: 'src',                          // unused but required
  server: {
    url: 'https://nickcason.github.io/e-OIC/',
    cleartext: false,
    androidScheme: 'https',
  },
};
export default config;
```

**Bridge to expose version to webview:** in `android/app/src/main/java/.../MainActivity.java`, override `onCreate` to call `webView.evaluateJavascript("window.__eoicWrapperVersion = 'v1';", null)` after page load (or use `WebView.addJavascriptInterface`). Concrete approach finalized at plan time. Version string injected into the Java source by `release.yml` from the git tag.

**`AndroidManifest.xml` permissions:**
- `INTERNET` (Capacitor default)
- `REQUEST_INSTALL_PACKAGES` — for in-app APK install via FileOpener.
- No SD-card write, no location, no storage. Cache writes use Capacitor's `Directory.Cache` which is app-private.

**Dependencies:**
- `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`
- `@capacitor/share`
- `@capacitor/filesystem`
- `@capacitor-community/file-opener`

**`.github/workflows/release.yml` outline:**
- Trigger: `on: push: tags: [v*]` plus `workflow_dispatch`.
- Job 1 (PR check): `assembleDebug` only — verifies build doesn't break.
- Job 2 (release): on tag —
  1. Checkout, setup JDK 17, setup Android SDK.
  2. Write tag name into `version.ts` and into the Java bridge stub.
  3. Decode `KEYSTORE_BASE64` secret to a file; pass `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` into Gradle as env vars.
  4. `./gradlew assembleRelease`.
  5. Rename APK to `e-OIC.apk`.
  6. `gh release create $TAG e-OIC.apk --notes-file CHANGELOG-NOTES.md`.

Keystore is generated once locally, base64-encoded, and stored as a GitHub Actions secret. Same keystore for all releases (so updates install over previous versions without uninstall).

## Data flows

### Share flow (in wrapper)

```
User taps Share in ExportDialog
  └─ exporter.js produces File (zip/xlsx Blob)
       └─ isInWrapper() === true
            ├─ Filesystem.writeFile({ path: 'eoic-export-{ts}.zip',
            │                          directory: 'CACHE', data: <base64> })
            │    → returns { uri: 'file:///.../cache/eoic-export-{ts}.zip' }
            ├─ Share.share({ title, files: [uri] })
            │    → Capacitor invokes Intent.ACTION_SEND via FileProvider
            │    → Android share sheet appears
            └─ on settle: Filesystem.deleteFile (best-effort, swallow errors)
```

### Update flow

```
App launches, in wrapper
  └─ WrapperUpdateBanner mounts
       ├─ fetch /wrapper-version.json from live origin
       ├─ compareWrapperVersions(installed, remote)
       └─ if remote > installed, render banner

User taps "Update"
  └─ downloadAndInstallApk(url)
       ├─ Filesystem.downloadFile({ url, path: 'eoic-update.apk', directory: 'CACHE' })
       └─ FileOpener.open({ filePath, contentType: 'application/vnd.android.package-archive' })
            → Android system installer launches
            → user confirms → installs over existing (same keystore signature)
```

### Install banner trigger

```
Page renders, useEffect runs
  └─ in usePwaInstall: detect platform
       ├─ if iOS: existing path (canInstall true if not standalone)
       ├─ if Android && !isInWrapper: canInstall false (suppress beforeinstallprompt)
       └─ if desktop && beforeinstallprompt fired: existing path

InstallBanner picks variant:
  ├─ isInWrapper → render nothing
  ├─ isIOS → existing iOS instructions modal
  ├─ isAndroid && !isInWrapper → render wrapper-install variant
  └─ else → existing PWA install variant
```

## Error handling

**Share:**
- `Filesystem.writeFile` fails → toast "Couldn't prepare export. Free up space and try again." Do NOT fall through to `navigator.share`.
- `Share.share` rejects with cancel → silent. Cancellation is not an error.
- `Share.share` rejects with anything else → toast `"Share failed: <message>"`.
- Cache cleanup failure → swallow.

**Bridge detection:**
- `window.Capacitor` exists but `isNativePlatform()` returns false (desktop Capacitor or test scaffold) → fall through to `navigator.share`.
- Stale service-worker cached `wrapperBridge.js` after wrapper update → bridge module feature-detects specific Capacitor APIs (`if (typeof Filesystem?.writeFile === 'function')`) before calling, so a forward-incompatible call gracefully degrades to a toast.

**Update path:**
- `wrapper-version.json` fetch fails → silently skip update check; try again next launch.
- Version parse failure in `compareWrapperVersions` → returns `0`, no banner.
- APK download fails → toast "Update download failed. Try again or visit Releases." with link to GitHub Releases page.
- `FileOpener.open` returns but installer doesn't appear → likely missing `REQUEST_INSTALL_PACKAGES` grant; banner shows a "Trouble updating?" link to wrapper README.
- User declines installer prompt → no-op; banner re-renders next launch.

**Install banner:**
- User has both PWA and wrapper installed → wrapper takes precedence; PWA leftover is harmless.
- No share targets registered for MIME → Capacitor returns share-canceled-error → toast "No apps available to share with."
- WebView fails to load live URL on first launch (offline before SW priming) → Capacitor default error page. Acceptable for v1; offline shell caching is a v2 concern.

**Platform detection:**
- UA-string-based Android detection (mirroring `detectIOS`). Chromebook over-trigger is harmless (banner appears, tap leads to APK that won't install, user dismisses).

## Testing

### e-OIC web side — automated

- `src/lib/wrapperBridge.test.js` (`node:test`) — pure-JS helpers:
  - `isInWrapper()` across four states: no Capacitor, Capacitor without `isNativePlatform`, Capacitor + non-native, Capacitor + native.
  - `compareWrapperVersions` — `v1` vs `v2`, equal, malformed inputs.
- Existing `npm run test:unit` and `test:e2e` should pass untouched. The wrapper fork is additive at one call site.
- No jsdom UI tests for the new banner — matches repo convention (UI is real-device QA).

### e-OIC web side — manual

- Desktop Chrome: existing share path unchanged.
- iOS Safari: install banner unchanged; share unchanged.
- Android Chrome (no wrapper): wrapper install banner appears; PWA install banner suppressed; share path unchanged.

### Wrapper repo — automated

- `release.yml` PR-trigger job: `./gradlew assembleDebug` succeeds. Catches Capacitor/Gradle breakage.
- No JS tests in v1 — wrapper is mostly config.

### Wrapper integration — manual on node7 emulator

Existing emulator setup at `inspiron-node7` (see `reference_android_devspace_node7.md`). Workflow:

1. Build debug APK locally: `./gradlew assembleDebug`.
2. `adb -s emulator-5554 install -r app-debug.apk`.
3. Open via scrcpy.
4. Verify: `window.Capacitor.isNativePlatform()` is `true`; share `.zip` to Drive (pre-installed); share `.xlsx`; cancel share sheet; trigger update flow with a manually-set lower `__eoicWrapperVersion`; install update over existing.

### Pre-release smoke checklist (in wrapper README)

1. WebView loads live e-OIC.
2. `window.Capacitor.isNativePlatform()` returns `true`.
3. Share zip → Outlook (or emulator stand-in) → file arrives intact.
4. Update banner appears when `wrapper-version.json` declares a newer version.
5. APK installs over existing without uninstall (signature match).

### Out of scope for v1 testing

- Automated e2e against the emulator (worth doing later; v1 manual cadence is fine for an internal tool).
- iOS — wrapper is Android-only.

## YAGNI / explicit non-goals

- No iOS wrapper. Apple's allowlist isn't broken in the same way and sideloading is impractical.
- No offline shell caching in the wrapper — relies on PWA's existing service worker.
- No Play Store distribution — sideload only.
- No analytics, no crash reporting, no auto-update silently in background.
- No bundled webview content — wrapper is purely a thin shell pointing at live URL.

## Open items deferred to plan time

- Exact mechanism for injecting `__eoicWrapperVersion` (JS evaluate vs. JavascriptInterface vs. Capacitor plugin shim).
- Whether `WrapperUpdateBanner` and the existing `UpdatePill` (PWA content update) should visually coordinate to avoid stacked banners.
- Help-page copy for "install from unknown apps" — short page to live in wrapper repo's `docs/install.md`.

## Implementation sequencing

Two plans, executable in either order but most useful in this sequence:

1. **e-OIC web-side plan** — implement `wrapperBridge.js`, banner variants, share fork, update banner. Ship without a wrapper present; verify desktop/iOS/Android-Chrome behavior unchanged. Wrapper banner becomes visible but its CTA is dead until the wrapper repo ships.
2. **e-OIC-android-wrapper plan** — scaffold Capacitor project, configure plugins, set up workflow, generate keystore, ship v1 APK. First sideload exercises the wrapper banner CTA from step 1.
