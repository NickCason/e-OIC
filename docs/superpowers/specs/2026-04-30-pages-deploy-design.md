# e-OIC — GitHub Pages Deploy Design

**Date:** 2026-04-30
**Goal:** Get e-OIC v1.1.0 live at `https://nickcason.github.io/e-OIC/` and installed as a PWA on iPhone, with a small set of pre-deploy fixes baked into the first commit.
**Out of scope:** Feature work, custom domain, tests/CI beyond the existing deploy workflow, SW auto-update UI.

---

## 1. Starting state

- Repo `NickCason/e-OIC` is empty (initial commit pending).
- Prototype `e-oic-v1.1.0.zip` extracted into `e-OIC/e-oic/` (nested one folder too deep for the existing `.github/workflows/deploy.yml`, which runs `npm ci` from repo root).
- `SPEC.md` present at repo root.
- Template xlsx present at repo root (duplicate of `e-oic/public/template.xlsx`).
- All app paths are already relative (`base: './'`), so no Vite config change is needed for a Pages subpath deploy.

## 2. Pre-deploy fixes

Four small fixes (the "A" set from review) plus three iOS-specific code additions, all in the same initial commit.

### 2.1 Small fixes

| # | File | Change |
|---|------|--------|
| 1 | `src/components/SheetForm.jsx:136` | `SheetNotes` placeholder embeds the literal `'this panel'` instead of the actual panel name. Thread `panel` (or `panelName`) prop through and substitute. |
| 2 | `src/exporter.js:289` | Delete the dead `const totalPhotos = panels.reduce((sum, _) => sum, 0);` line + its `// placeholder` comment. The real total is computed below as `grandTotalPhotos`. |
| 3 | `src/components/SheetForm.jsx:416` | Remove the `&& false` short-circuit dead branch in `looksNumeric()`. |
| 4 | `SPEC.md` § 11 | Bump `VERSION = 'v2'` reference to `'v3'` to match `public/service-worker.js`. |

### 2.2 iOS code additions

| # | File | Change |
|---|------|--------|
| 5 | `src/photoOverlay.js` | Wrap the `createImageBitmap(file)` call in try/catch. On failure throw `new Error("This photo format isn't supported in your browser. Try Take Photo, or re-save the image as JPEG.")` so `PhotoCapture`'s existing error UI surfaces a useful message instead of a generic one. Targets older iOS Safari + HEIC library picks. |
| 6 | `src/components/SettingsView.jsx` | In the About card, add a one-liner that calls `navigator.storage.estimate()` (when available) and renders `Storage: <usage MB> used of <quota MB> available`. Helps catch iOS storage-eviction situations during testing. |
| 7 | `public/apple-touch-icon-180.png` + `index.html` | Generate a 180×180 PNG (resample from `icon-512.png`) and add `<link rel="apple-touch-icon" sizes="180x180" href="./apple-touch-icon-180.png">`. iOS native home-screen size is 180; current 192 works but renders slightly soft. |

## 3. Repo restructure

Before commit:

1. Move every file/folder from `e-OIC/e-oic/` (including `.github/`, `.gitignore`) up to `e-OIC/`.
2. Delete the now-empty `e-OIC/e-oic/` folder.
3. Delete `e-OIC/e-oic-v1.1.0.zip` (reproducible from source).
4. Delete `e-OIC/3.1 Onsite Investigation - Template v1.1.xlsx` at repo root — `public/template.xlsx` is the canonical copy that `scripts/build-schema.py` reads per SPEC § 5.
5. Keep `SPEC.md` at repo root (project documentation belongs in source).
6. The directory `docs/superpowers/specs/` (this file's home) is committed alongside.

Final repo root layout:

```
e-OIC/
├── .github/workflows/deploy.yml
├── .gitignore
├── docs/superpowers/specs/2026-04-30-pages-deploy-design.md
├── index.html
├── package.json
├── package-lock.json
├── public/
│   ├── apple-touch-icon-180.png   ← new
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── icon.svg
│   ├── manifest.webmanifest
│   ├── service-worker.js
│   └── template.xlsx
├── README.md
├── scripts/build-schema.py
├── src/
│   ├── App.jsx
│   ├── components/
│   ├── db.js
│   ├── exporter.js
│   ├── lib/
│   ├── main.jsx
│   ├── photoOverlay.js
│   ├── schema.json
│   └── styles.css
├── SPEC.md
└── vite.config.js
```

## 4. Local verification

Before pushing:

```bash
npm install
npm run build       # confirm no Vite/import errors, dist/ produced
npm run preview     # serve dist on :4173
```

Open `http://localhost:4173/` in desktop Safari (closest to mobile WebKit), confirm:

- App loads, no console errors
- Service worker registers (`Application` → `Service Workers` in devtools)
- Settings → About shows the new storage estimate readout
- Apple touch icon link resolves (no 404 in network tab)

## 5. Push and enable Pages

1. **Commit:** single initial commit titled `initial: e-OIC v1.1.0 + pre-deploy fixes`.
2. **Push to `main`** — triggers `.github/workflows/deploy.yml` automatically.
3. **One-time Pages setup (manual, in browser):**
   Repo → Settings → Pages → "Build and deployment" → Source: **GitHub Actions**.
4. **Wait for Actions green check.** First deploy takes ~2 min build + 2–10 min Pages propagation.
5. **Verify in desktop Safari:** open `https://nickcason.github.io/e-OIC/`. Confirm app loads, SW registers, no 404s on assets.

## 6. iPhone install + on-device verification

1. Open `https://nickcason.github.io/e-OIC/` in iOS Safari.
2. Share → **Add to Home Screen**.
3. Launch the app from home screen (standalone mode).
4. Run a smoke test:
   - Create a job, panel, row.
   - Take a photo (camera) → confirm GPS prompt + overlay render.
   - Pick a photo from library → confirm HEIC handling (success or graceful error).
   - Build Export → confirm zip downloads/shares correctly.
   - Background app a few minutes, relaunch → confirm data persists.
5. Anything that breaks → file a GitHub Issue in the repo. **Do not** fix in this session — ship something concrete first, iterate after.

## 7. Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| First Pages deploy 404s for several minutes after enabling | Almost certain | Wait 5–10 min; not a real failure. |
| `createImageBitmap` rejects HEIC on user's iOS version | Possible | The try/catch in §2.2 #5 surfaces a friendly message instead of a broken capture. |
| Standalone-mode camera/GPS permission quirks on iOS | Low (iOS 16.4+) | If it bites, file an issue and add user-facing reauth prompts later. |
| Service-worker cache serves stale assets on next deploy | Low (first deploy) | Future deploys must bump `VERSION` in `public/service-worker.js`. |
| Repo name `e-OIC` is mixed-case, URL is case-sensitive | Cosmetic | Just use the correct casing in shared links. |

## 8. Success criteria

- ✅ `https://nickcason.github.io/e-OIC/` returns 200 and renders the JobList UI in desktop Safari
- ✅ Site installs to iOS home screen via Add to Home Screen
- ✅ Standalone-launched PWA can create a job, take a photo with overlay, and produce an export zip
- ✅ Settings → About shows non-zero storage estimate after a photo capture

## 9. Deferred (file as issues post-launch, do not fix in this session)

- Anything iPhone testing reveals beyond the success criteria above
- 180-degree-out edge cases for orientation, HEIC variants the catch doesn't help
- Storage quota warnings before reaching the limit
- Service worker update prompt UX
- Custom-domain mapping
- Any item in SPEC § 16 (Feature Backlog)
