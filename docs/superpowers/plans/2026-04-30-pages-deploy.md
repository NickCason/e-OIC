# e-OIC GitHub Pages Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get e-OIC v1.1.0 live at `https://nickcason.github.io/e-OIC/` with a clean initial commit that includes 4 small fixes and 3 iOS-specific code additions.

**Architecture:** Flatten the nested prototype, apply targeted fixes, verify the production build locally, push to `main`, enable Pages via the GitHub API, confirm deploy.

**Tech Stack:** React 18 + Vite, IndexedDB, ExcelJS, JSZip, hand-rolled service worker, GitHub Actions for Pages deploy.

**Spec:** `docs/superpowers/specs/2026-04-30-pages-deploy-design.md`

**Working dir:** `/Users/nickcason/DevSpace/Work/e-OIC` (the cloned empty repo).

**No unit tests are added by this plan.** The prototype has no test framework, the spec explicitly defers tests, and these are surgical edits to a smoke-tested codebase. Verification is: production build succeeds → preview loads → deploy succeeds → URL reachable.

---

## File Structure (post-flatten)

After Task 1, repo root will contain — relative to `/Users/nickcason/DevSpace/Work/e-OIC`:

| Path | Responsibility |
|------|----------------|
| `index.html` | App shell, iOS PWA meta tags |
| `package.json` / `package-lock.json` | Deps + npm scripts |
| `vite.config.js` | Build config (`base: './'` + manualChunks) |
| `src/App.jsx` | Hash router root |
| `src/components/SheetForm.jsx` | Sheet editor — **target of Task 2 + Task 4** |
| `src/exporter.js` | Excel + zip export pipeline — **target of Task 3** |
| `src/photoOverlay.js` | Image overlay + EXIF — **target of Task 6** |
| `src/components/SettingsView.jsx` | Settings screen — **target of Task 7** |
| `public/service-worker.js` | Offline cache (already at `v3`) |
| `public/apple-touch-icon-180.png` | **New file in Task 8** |
| `public/manifest.webmanifest` | PWA manifest |
| `public/template.xlsx` | Canonical template (only copy) |
| `.github/workflows/deploy.yml` | Pages deploy on push to main |
| `SPEC.md` | Project spec — **target of Task 5** |
| `docs/superpowers/specs/...` | Design doc (already committed conceptually) |
| `docs/superpowers/plans/2026-04-30-pages-deploy.md` | This plan |

---

## Task 1: Flatten the repo

**Files:**
- Move: `e-OIC/e-oic/*` → `e-OIC/` (everything, including dotfiles)
- Delete: `e-OIC/e-oic/` (now empty)
- Delete: `e-OIC/e-oic-v1.1.0.zip` (reproducible from source)
- Delete: `e-OIC/3.1 Onsite Investigation - Template v1.1.xlsx` (duplicate of `public/template.xlsx`)
- Delete: `e-OIC/.DS_Store` (macOS junk; `.gitignore` already covers it)
- Keep: `e-OIC/SPEC.md`, `e-OIC/.git/`, `e-OIC/docs/`

- [ ] **Step 1: Verify starting state**

Run:
```bash
cd /Users/nickcason/DevSpace/Work/e-OIC && ls -la
```
Expected: see `e-oic/` folder, `e-oic-v1.1.0.zip`, `SPEC.md`, `.git/`, `3.1 Onsite Investigation - Template v1.1.xlsx`, `docs/`, `.DS_Store`.

- [ ] **Step 2: Move nested contents up**

Run:
```bash
cd /Users/nickcason/DevSpace/Work/e-OIC && \
  shopt -s dotglob 2>/dev/null; \
  mv e-oic/.github e-oic/.gitignore e-oic/index.html e-oic/package.json e-oic/package-lock.json e-oic/public e-oic/README.md e-oic/scripts e-oic/src e-oic/vite.config.js .
```
Expected: command exits 0; `e-oic/` is now empty.

- [ ] **Step 3: Remove unwanted files**

Run:
```bash
cd /Users/nickcason/DevSpace/Work/e-OIC && \
  rmdir e-oic && \
  rm -f e-oic-v1.1.0.zip "3.1 Onsite Investigation - Template v1.1.xlsx" .DS_Store
```
Expected: all four removed; `ls` shows the structure listed in File Structure above.

- [ ] **Step 4: Verify final layout**

Run:
```bash
cd /Users/nickcason/DevSpace/Work/e-OIC && ls -la && test -f package.json && test -f vite.config.js && test -f public/template.xlsx && test -f .github/workflows/deploy.yml && echo OK
```
Expected: `OK` printed; no `e-oic/` subfolder; no `.zip`; `package.json` at root.

---

## Task 2: Fix SheetForm placeholder bug

**Files:**
- Modify: `src/components/SheetForm.jsx` — `SheetNotes` component (currently lines ~101-143) and its caller in `SheetForm` (~line 67)

The bug: `SheetNotes`'s `<textarea>` placeholder reads `Notes for ${sheet} on ${'this panel'}.` — the literal string `'this panel'` was left in place of the panel name. Fix: thread `panelName` through and substitute.

- [ ] **Step 1: Update the call site to pass `panelName`**

In `src/components/SheetForm.jsx`, find:
```jsx
      <SheetNotes panelId={panel.id} sheet={sheetName} />
```
Replace with:
```jsx
      <SheetNotes panelId={panel.id} sheet={sheetName} panelName={panel.name} />
```

- [ ] **Step 2: Accept the new prop and use it**

In `src/components/SheetForm.jsx`, find the function signature:
```jsx
function SheetNotes({ panelId, sheet }) {
```
Replace with:
```jsx
function SheetNotes({ panelId, sheet, panelName }) {
```

Then in the same component, find:
```jsx
            placeholder={`Notes for ${sheet} on ${'this panel'}. Saved automatically. Included in the export's Notes sheet.`}
```
Replace with:
```jsx
            placeholder={`Notes for ${sheet} on ${panelName || 'this panel'}. Saved automatically. Included in the export's Notes sheet.`}
```

- [ ] **Step 3: Verify the file still parses**

Run:
```bash
cd /Users/nickcason/DevSpace/Work/e-OIC && node --check src/components/SheetForm.jsx 2>&1 | head -5 || true
```
Expected: errors are OK (this is JSX, node --check doesn't parse JSX). Skip if it errors on JSX syntax — Vite will catch real errors at build time. The substantive verification is in Task 9.

---

## Task 3: Remove dead code in exporter.js

**Files:**
- Modify: `src/exporter.js` line ~289

- [ ] **Step 1: Delete the placeholder line**

In `src/exporter.js`, find:
```js
  const totalPhotos = panels.reduce((sum, _) => sum, 0); // placeholder
  let writtenPhotos = 0;
```
Replace with:
```js
  let writtenPhotos = 0;
```

(The real total is `grandTotalPhotos`, computed a few lines below.)

---

## Task 4: Clean up `looksNumeric` dead branch

**Files:**
- Modify: `src/components/SheetForm.jsx` line ~414-417

- [ ] **Step 1: Drop the `&& false` short-circuit**

In `src/components/SheetForm.jsx`, find:
```jsx
function looksNumeric(h) {
  return /(^|\s)(volts?|amps?|amperage|voltage|hp|kw|hz|frequency|fla|scc|rpm|sec|seconds|inches|height|width|depth|count|qty|fpm|phase|fuse)(\s|$)/i.test(h)
    || /\b(min|max|address|port)\b/i.test(h) && false; // disabled — too many false positives
}
```
Replace with:
```jsx
function looksNumeric(h) {
  return /(^|\s)(volts?|amps?|amperage|voltage|hp|kw|hz|frequency|fla|scc|rpm|sec|seconds|inches|height|width|depth|count|qty|fpm|phase|fuse)(\s|$)/i.test(h);
}
```

(The `min|max|address|port` rule was already disabled — removing the dead clause matches that intent.)

---

## Task 5: Fix SPEC.md service-worker version drift

**Files:**
- Modify: `SPEC.md` § 11 (Reliability Patterns)

- [ ] **Step 1: Bump the version reference**

In `SPEC.md`, find:
```
  `template.xlsx`, and assets, then serves them offline. `VERSION = 'v2'`
```
Replace with:
```
  `template.xlsx`, and assets, then serves them offline. `VERSION = 'v3'`
```

---

## Task 6: HEIC-friendly error in photoOverlay

**Files:**
- Modify: `src/photoOverlay.js` lines 7-9 (start of `applyOverlay`)

The bug: `createImageBitmap` can throw on HEIC files in older iOS Safari. Currently the user gets a generic "Could not save photo". Wrap and re-throw with a friendlier message.

- [ ] **Step 1: Wrap `createImageBitmap` in try/catch**

In `src/photoOverlay.js`, find:
```js
export async function applyOverlay(file, lines, gps = null) {
  const bitmap = await createImageBitmap(file);
```
Replace with:
```js
export async function applyOverlay(file, lines, gps = null) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (err) {
    throw new Error(
      "This photo format isn't supported in your browser. Try Take Photo, or re-save the image as JPEG before importing."
    );
  }
```

(The existing error UI in `PhotoCapture.jsx:63` will surface `e.message`.)

---

## Task 7: Add storage estimate to Settings → About

**Files:**
- Modify: `src/components/SettingsView.jsx` — add a state hook + new line in the About card

- [ ] **Step 1: Add the storage state hook**

In `src/components/SettingsView.jsx`, find:
```jsx
  const [theme, setTheme] = useState('auto');
  const [gpsConsent, setGpsConsent] = useState(null);
  const [busy, setBusy] = useState(false);
```
Replace with:
```jsx
  const [theme, setTheme] = useState('auto');
  const [gpsConsent, setGpsConsent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [storage, setStorage] = useState(null);
```

- [ ] **Step 2: Populate `storage` on mount**

In the same file, find:
```jsx
  useEffect(() => {
    (async () => {
      setTheme((await getSetting('theme')) || 'auto');
      setGpsConsent(await getGeolocationConsent());
    })();
  }, []);
```
Replace with:
```jsx
  useEffect(() => {
    (async () => {
      setTheme((await getSetting('theme')) || 'auto');
      setGpsConsent(await getGeolocationConsent());
      if (navigator.storage?.estimate) {
        try {
          const est = await navigator.storage.estimate();
          setStorage(est);
        } catch {
          // estimate() can throw in some private-mode contexts; ignore
        }
      }
    })();
  }, []);
```

- [ ] **Step 3: Render storage in the About card**

In the same file, find:
```jsx
          <div className="kv"><span className="k">Offline</span><span className="v">Yes (after first load)</span></div>
        </section>
```
Replace with:
```jsx
          <div className="kv"><span className="k">Offline</span><span className="v">Yes (after first load)</span></div>
          {storage && (
            <div className="kv">
              <span className="k">Storage used</span>
              <span className="v">
                {fmtMB(storage.usage)} of {fmtMB(storage.quota)}
              </span>
            </div>
          )}
        </section>
```

- [ ] **Step 4: Add the `fmtMB` helper**

In the same file, find the line:
```jsx
const APP_VERSION = '1.1.0';
```
Replace with:
```jsx
const APP_VERSION = '1.1.0';

function fmtMB(bytes) {
  if (bytes == null) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(1)} MB`;
}
```

---

## Task 8: 180×180 apple-touch-icon

**Files:**
- Create: `public/apple-touch-icon-180.png` (resampled from `public/icon-512.png`)
- Modify: `index.html` — add a `<link rel="apple-touch-icon" sizes="180x180">`

- [ ] **Step 1: Generate the 180px icon**

Run:
```bash
cd /Users/nickcason/DevSpace/Work/e-OIC && \
  sips -Z 180 -s format png public/icon-512.png --out public/apple-touch-icon-180.png
```
Expected: macOS `sips` produces `public/apple-touch-icon-180.png`. If `sips` is unavailable on the executor, fall back to:
```bash
cp public/icon-192.png public/apple-touch-icon-180.png
```
(The 192 is acceptable; iOS just downsamples. The point is to ship *something* at 180.)

- [ ] **Step 2: Verify file exists and is non-trivial**

Run:
```bash
cd /Users/nickcason/DevSpace/Work/e-OIC && test -s public/apple-touch-icon-180.png && echo OK
```
Expected: `OK`.

- [ ] **Step 3: Add the link tag to `index.html`**

In `index.html`, find:
```html
    <link rel="apple-touch-icon" href="./icon-192.png" />
```
Replace with:
```html
    <link rel="apple-touch-icon" sizes="180x180" href="./apple-touch-icon-180.png" />
    <link rel="apple-touch-icon" href="./icon-192.png" />
```

(Keeping the 192 fallback for non-iOS clients that read this tag.)

---

## Task 9: Local verify — install, build, preview

**Files:** none modified. This is a verification step.

- [ ] **Step 1: Install dependencies**

Run:
```bash
cd /Users/nickcason/DevSpace/Work/e-OIC && npm install
```
Expected: succeeds, populates `node_modules/`. May print warnings about deprecated transitives — those are fine.

- [ ] **Step 2: Production build**

Run:
```bash
cd /Users/nickcason/DevSpace/Work/e-OIC && npm run build 2>&1 | tail -30
```
Expected: ends with a Vite build summary. No `error` lines. `dist/` produced. Look for the gzipped sizes — main chunk should be ~76 KB gzipped per spec § 12.3 (close, not exact).

- [ ] **Step 3: Confirm dist contents**

Run:
```bash
cd /Users/nickcason/DevSpace/Work/e-OIC && ls dist && test -f dist/index.html && test -f dist/manifest.webmanifest && test -f dist/template.xlsx && test -f dist/service-worker.js && test -f dist/apple-touch-icon-180.png && echo OK
```
Expected: `OK`. The new 180px icon must be present in `dist/`.

- [ ] **Step 4: Start preview server in background and curl it**

Run:
```bash
cd /Users/nickcason/DevSpace/Work/e-OIC && (npm run preview > /tmp/eoic-preview.log 2>&1 &) && sleep 3 && curl -sf http://localhost:4173/ -o /tmp/eoic-index.html && head -20 /tmp/eoic-index.html && pkill -f "vite preview" || true
```
Expected: `<title>e-OIC — Onsite Investigation Checklist</title>` appears in the head dump. Preview server then killed.

If port 4173 is already in use, the test still validates the build — proceed.

---

## Task 10: Initial commit and push to main

**Files:** the entire repo content as the first commit.

- [ ] **Step 1: Confirm git state**

Run:
```bash
cd /Users/nickcason/DevSpace/Work/e-OIC && git status --short && git log --oneline -5 2>&1 | head -5
```
Expected: many "??" untracked entries. `git log` likely says `does not have any commits yet`.

- [ ] **Step 2: Stage all source content (excluding ignored)**

Run:
```bash
cd /Users/nickcason/DevSpace/Work/e-OIC && \
  git add .github .gitignore SPEC.md README.md docs index.html package.json package-lock.json public scripts src vite.config.js
```
Expected: command exits 0. `node_modules/` and `dist/` are excluded by `.gitignore`.

- [ ] **Step 3: Verify staging looks right**

Run:
```bash
cd /Users/nickcason/DevSpace/Work/e-OIC && git status --short && echo "---" && git ls-files --others --exclude-standard | head -10
```
Expected: staged tree has `package.json`, `src/`, `public/`, `.github/workflows/deploy.yml`, `SPEC.md`, `docs/superpowers/...`. No `node_modules/`, no `dist/`, no `.zip`, no `.DS_Store`.

- [ ] **Step 4: Create the commit**

Run:
```bash
cd /Users/nickcason/DevSpace/Work/e-OIC && git commit -m "$(cat <<'EOF'
initial: e-OIC v1.1.0 + pre-deploy fixes

Imports the v1.1.0 prototype (full app: React + Vite, IndexedDB,
ExcelJS export, photo capture with EXIF/GPS, hash router, service
worker, GitHub Actions deploy workflow).

Pre-deploy fixes:
- Pass actual panel name into SheetNotes placeholder (was hardcoded
  literal "this panel")
- Remove dead `totalPhotos` placeholder line in exporter.js
- Drop the disabled `&& false` clause in SheetForm.looksNumeric
- Bump SPEC.md service-worker VERSION reference v2 → v3

iOS code additions:
- Wrap createImageBitmap in try/catch to surface a friendlier
  message on HEIC / unsupported formats
- Show navigator.storage.estimate() in Settings → About
- Add apple-touch-icon at iOS-native 180x180

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```
Expected: commit succeeds, prints the commit hash and 1 file changed summary.

- [ ] **Step 5: Set branch and push to main**

Run:
```bash
cd /Users/nickcason/DevSpace/Work/e-OIC && git branch -M main && git push -u origin main
```
Expected: pushes to `https://github.com/NickCason/e-OIC`. Output mentions `branch 'main' set up to track 'origin/main'`.

If push fails because the remote is configured weirdly, the diagnostic is `git remote -v`. The repo was cloned via `gh repo clone NickCason/e-OIC` so the remote should already be `origin` → `git@github.com:NickCason/e-OIC.git` or HTTPS equivalent.

---

## Task 11: Enable Pages via API (one-time)

**Files:** none in repo. This calls the GitHub API.

- [ ] **Step 1: Enable Pages with workflow source**

Run:
```bash
gh api -X POST /repos/NickCason/e-OIC/pages \
  -f build_type=workflow \
  --silent && echo OK
```
Expected: `OK`. If the API returns `409 Conflict` it means Pages is already enabled — also acceptable, treat as success.

If the API returns any other error, diagnostic command:
```bash
gh api /repos/NickCason/e-OIC/pages
```
to see current state. The expected steady state is `{"build_type":"workflow", ...}`.

- [ ] **Step 2: Confirm Pages settings**

Run:
```bash
gh api /repos/NickCason/e-OIC/pages --jq '{html_url, build_type, status}'
```
Expected: `build_type` = `"workflow"`. `html_url` should be `https://nickcason.github.io/e-OIC/`. `status` may be `null` initially or `"queued"` / `"building"`.

---

## Task 12: Wait for deploy and verify URL

**Files:** none.

- [ ] **Step 1: Watch the deploy workflow**

Run:
```bash
cd /Users/nickcason/DevSpace/Work/e-OIC && \
  gh run list --workflow=deploy.yml --limit 1
```
Expected: at least one run is listed. Status will be `queued`, `in_progress`, or `completed`.

- [ ] **Step 2: Wait for the run to complete**

Run:
```bash
cd /Users/nickcason/DevSpace/Work/e-OIC && \
  gh run watch --exit-status $(gh run list --workflow=deploy.yml --limit 1 --json databaseId --jq '.[0].databaseId')
```
Expected: blocks until the run finishes, exits 0 on success. Up to ~3 minutes.

If the run fails: print `gh run view --log-failed` output and stop. Do not retry blindly.

- [ ] **Step 3: Curl the live URL**

Run:
```bash
sleep 30 && curl -sfI https://nickcason.github.io/e-OIC/ | head -5
```
Expected: `HTTP/2 200`. If `404`, retry up to 3× with 30 s sleeps — Pages can take a few minutes to wire DNS the first time.

- [ ] **Step 4: Sanity-check the response body**

Run:
```bash
curl -s https://nickcason.github.io/e-OIC/ | grep -E "(e-OIC|Onsite Investigation)" | head -3
```
Expected: at least one line containing the title or app name. Confirms Pages is serving the built `index.html`, not a generic 404 page.

- [ ] **Step 5: Report success to the user**

Final output to user (text, not a code block in the actual report):

```
Live URL: https://nickcason.github.io/e-OIC/
Open in iOS Safari → Share → Add to Home Screen.
On-device smoke test (per spec §6):
  - Create job + panel + row
  - Take photo (camera) — confirm overlay + GPS prompt
  - Pick photo from library — confirm HEIC handling
  - Build Export — confirm zip downloads
  - Background app, relaunch — confirm data persists
File anything that breaks as a GitHub Issue.
```

---

## Self-Review

**Spec coverage:** Walking spec § sections:
- Pre-deploy fixes (§ 2.1 #1–#4): Tasks 2–5 ✓
- iOS code additions (§ 2.2 #5–#7): Tasks 6–8 ✓
- Repo restructure (§ 3): Task 1 ✓
- Local verification (§ 4): Task 9 ✓
- Push and enable Pages (§ 5): Tasks 10–11 ✓
- iPhone install + on-device verification (§ 6): handed back to user in Task 12 final report ✓ (spec explicitly assigns this to the user)
- Risks (§ 7): mitigations encoded in Tasks 6, 11 (409 conflict OK), 12 (retry on 404) ✓
- Success criteria (§ 8): Tasks 9 + 12 verify (1) URL 200, (2) handed to user, (3) handed to user, (4) handed to user ✓
- Deferred items (§ 9): explicitly out of scope, no tasks added ✓

**Placeholder scan:** No "TBD", "TODO", "implement later". Every step has exact code or exact commands. The only `try/catch { /* ignore */ }` is intentional and explained inline.

**Type/name consistency:** `panelName` prop is named identically in Tasks 2.1, 2.2 call site and signature. `fmtMB` defined once in Task 7.4, used once in Task 7.3. `storage` state used in Task 7.1, 7.2, 7.3 consistently. Apple touch icon path `apple-touch-icon-180.png` is identical in Task 8.1 (create), 8.3 (link tag), and 9.3 (dist verify).

No issues found.
