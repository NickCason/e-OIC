# Health Review — Top 5 Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the five highest-leverage fixes from the 2026-05-01 health review: gate deploy on the e2e job, wire orphan unit tests + ESLint into CI, centralize the version string, fix the JobList N+1 IndexedDB pattern, and stop snapshotting the full job for the delete-undo toast.

**Architecture:** Each fix is independently shippable, so each task ends with its own commit. Fixes touch four areas: CI workflow YAML, root-level dev tooling (`package.json` / `eslint.config.js`), build-time version injection (`vite.config.js` + service worker template), and runtime React/IDB code (`JobList.jsx`, `JobView.jsx`, `db.js`). No new runtime dependencies are added by tasks 1, 4, 5, 6; tasks 2 and 3 add devDependencies only.

**Tech Stack:** React 18, Vite 5, idb 8 (IndexedDB), `node:test` + `node:assert/strict` (already used by orphan tests), GitHub Actions, ESLint 9 (flat config).

---

## File Structure

**Files this plan creates:**
- `eslint.config.js` — ESLint 9 flat config at repo root.

**Files this plan modifies:**
- `.github/workflows/deploy.yml` — gate `deploy` on `e2e-export`; add `lint` + `test:unit` jobs; gate `deploy` on those too.
- `package.json` — add `test`, `test:unit`, `lint` scripts; add devDependencies for ESLint.
- `vite.config.js` — read `BUILD_VERSION` from a single source and `define` it for both app and SW.
- `public/service-worker.js` — replace hardcoded `'v34'` with build-time-injected token.
- `src/version.js` — replace hardcoded `'v34'` with build-time-injected token.
- `src/components/JobList.jsx` — `Promise.all` the per-job stat fetches; replace full-job-export undo snapshot with the raw helpers added to `db.js`.
- `src/components/JobView.jsx` — `Promise.all` the per-panel stat fetches; replace full-job-export undo snapshot with a panel-scoped raw helper.
- `src/db.js` — add `exportJobRaw(jobId)`, `restoreJobRaw(snap)`, `exportPanelRaw(panelId)`, `restorePanelRaw(snap)` helpers that keep photo blobs as Blob (no base64 round-trip).

**Source of version truth (post-task-4):** a single constant exported from a new file `version.json` at repo root (one line, `{ "version": "v35" }`) consumed by `vite.config.js`, which injects it as `__BUILD_VERSION__` for the app and rewrites the literal in `public/service-worker.js` at build time.

---

## Task 1: Gate deploy on e2e-export

**Files:**
- Modify: `.github/workflows/deploy.yml:55-56`

The `deploy` job currently only `needs: build`. The `e2e-export` job runs in parallel; if it fails, prod still ships. One-line fix: add `e2e-export` to `needs`.

- [ ] **Step 1: Read the current deploy job block to confirm shape**

Run: `sed -n '55,64p' .github/workflows/deploy.yml`

Expected: prints
```
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Change `needs: build` to `needs: [build, e2e-export]`**

Edit `.github/workflows/deploy.yml`, replace:
```yaml
  deploy:
    needs: build
```
with:
```yaml
  deploy:
    needs: [build, e2e-export]
```

- [ ] **Step 3: Validate the YAML parses**

Run: `node -e "const yaml=require('node:fs').readFileSync('.github/workflows/deploy.yml','utf8'); console.log(yaml.includes('needs: [build, e2e-export]') ? 'OK' : 'MISSING')"`

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci(deploy): gate Pages deploy on e2e-export job

Previously deploy only needed build; e2e-export ran in parallel and a
failure didn't block prod."
```

---

## Task 2: Wire orphan unit tests into npm scripts and CI

**Files:**
- Modify: `package.json` (add `test:unit` and `test` scripts)
- Modify: `.github/workflows/deploy.yml` (add `unit-test` job; add to `deploy.needs`)

The repo already has ~580 LoC of `node:test` files at `src/lib/{jobDiff,photoExif,xlsxParser}.test.js` but no script runs them. They use `node:test` + `node:assert/strict` and import via JSON import attributes (`with { type: 'json' }`).

- [ ] **Step 1: Run the existing tests locally to confirm they pass before wiring up CI**

Run: `node --test src/lib/jobDiff.test.js src/lib/photoExif.test.js src/lib/xlsxParser.test.js`

Expected: all pass (TAP output ending in `# pass <N>` and `# fail 0`). If any fail, stop and report — they are pre-existing breakage that needs a separate fix before this task continues.

- [ ] **Step 2: Add `test:unit` and `test` scripts to package.json**

Edit `package.json`, replace the `"scripts"` block:
```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview --host",
    "test:e2e": "node scripts/e2e-test.mjs"
  },
```
with:
```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview --host",
    "test:unit": "node --test 'src/lib/*.test.js'",
    "test:e2e": "node scripts/e2e-test.mjs",
    "test": "npm run test:unit && npm run test:e2e"
  },
```

- [ ] **Step 3: Verify the script works**

Run: `npm run test:unit`

Expected: same TAP output as Step 1. Exit code 0.

- [ ] **Step 4: Add a `unit-test` job to the workflow and gate deploy on it**

Edit `.github/workflows/deploy.yml`. After the `e2e-export` job (the block ending at line 53 with `retention-days: 30`), insert a blank line and append:

```yaml
  unit-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run test:unit
```

Then update the deploy job's `needs` (set in Task 1 to `[build, e2e-export]`) to also include `unit-test`:
```yaml
  deploy:
    needs: [build, e2e-export, unit-test]
```

- [ ] **Step 5: Verify the YAML parses and the new job is wired correctly**

Run:
```bash
node -e "
const fs = require('node:fs');
const y = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
console.log('unit-test job:', y.includes('unit-test:') ? 'OK' : 'MISSING');
console.log('deploy needs unit-test:', y.includes('needs: [build, e2e-export, unit-test]') ? 'OK' : 'MISSING');
"
```

Expected: both `OK`.

- [ ] **Step 6: Commit**

```bash
git add package.json .github/workflows/deploy.yml
git commit -m "test: wire orphan unit tests into npm scripts and CI

src/lib/*.test.js existed but never ran. Adds test:unit, test scripts
and a CI unit-test job that now gates deploy alongside e2e-export."
```

---

## Task 3: Add ESLint with React + react-hooks plugins

**Files:**
- Create: `eslint.config.js`
- Modify: `package.json` (devDependencies + `lint` script)
- Modify: `.github/workflows/deploy.yml` (add `lint` job; add to `deploy.needs`)

Minimum-viable static checking: ESLint 9 flat config with `eslint-plugin-react` and `eslint-plugin-react-hooks`. The two rules with the highest immediate value at this dev pace are `react-hooks/exhaustive-deps` and `no-unused-vars`. Set rules that surface real bugs to `error`; set style-only rules off.

- [ ] **Step 1: Install ESLint and plugins as devDependencies**

Run:
```bash
npm install --save-dev --save-exact \
  eslint@^9.18.0 \
  @eslint/js@^9.18.0 \
  eslint-plugin-react@^7.37.0 \
  eslint-plugin-react-hooks@^5.1.0 \
  globals@^15.14.0
```

Expected: installs cleanly; `package.json` `devDependencies` now contains all five.

- [ ] **Step 2: Create the flat config**

Create `eslint.config.js` with this content:

```js
import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'public/service-worker.js'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2024,
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['scripts/**/*.{js,mjs}', '*.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    files: ['src/lib/*.test.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
```

- [ ] **Step 3: Add `lint` script to package.json**

Edit `package.json` `"scripts"`. Add `"lint": "eslint ."` so the block becomes:
```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview --host",
    "lint": "eslint .",
    "test:unit": "node --test 'src/lib/*.test.js'",
    "test:e2e": "node scripts/e2e-test.mjs",
    "test": "npm run test:unit && npm run test:e2e"
  },
```

- [ ] **Step 4: Run lint and triage results**

Run: `npm run lint`

Expected outcomes:
- **0 errors, any number of warnings** → proceed to Step 5.
- **`react-hooks/exhaustive-deps` errors** → these are real bugs; fix each by adding the missing dep to the array OR (only if intentionally stale) prefix the line with `// eslint-disable-next-line react-hooks/exhaustive-deps` and a one-line WHY comment. Re-run.
- **`no-undef` errors for browser globals** → the file probably needs the browser env; check `eslint.config.js` `files` glob actually matches it. Adjust if needed.
- **Errors that look like genuine pre-existing bugs unrelated to lint setup** → stop, do not paper over with disables, escalate in the task report.

- [ ] **Step 5: Add `lint` job to workflow and gate deploy on it**

Edit `.github/workflows/deploy.yml`. Insert before the `deploy` job:

```yaml
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
```

Then update the deploy job's `needs` to:
```yaml
  deploy:
    needs: [build, e2e-export, unit-test, lint]
```

- [ ] **Step 6: Verify**

Run:
```bash
npm run lint && \
node -e "console.log(require('node:fs').readFileSync('.github/workflows/deploy.yml','utf8').includes('needs: [build, e2e-export, unit-test, lint]') ? 'OK' : 'MISSING')"
```

Expected: lint passes (exit 0) and prints `OK`.

- [ ] **Step 7: Commit**

```bash
git add eslint.config.js package.json package-lock.json .github/workflows/deploy.yml
git commit -m "lint: add ESLint with react + react-hooks; gate deploy on lint

Flat config for ESLint 9 with react-hooks/exhaustive-deps as the
highest-value rule at our dev pace. Lint job now gates deploy."
```

---

## Task 4: Centralize the version string

**Files:**
- Create: `version.json` (single source of truth)
- Modify: `vite.config.js` (read version, `define` it for app, write it into SW at build)
- Modify: `src/version.js` (consume injected define)
- Modify: `public/service-worker.js` (use a build-time placeholder, not a hardcoded literal)
- Modify: `package.json` (`version` field synced)

Today, the version is duplicated in `src/version.js`, `public/service-worker.js`, `package.json`, and `SPEC.md`. After this task, bumping `version.json` updates all consumers; the SW literal is rewritten at build time by a small inline Vite plugin.

- [ ] **Step 1: Create `version.json` at repo root**

Create `version.json`:
```json
{ "version": "v35" }
```

(We bump from v34 → v35 because this task itself is the first deploy under the new system; previous build was v34.)

- [ ] **Step 2: Replace `src/version.js` with a re-export of the injected define**

Replace the contents of `src/version.js` with:
```js
// Single source of truth: ../version.json (read by vite.config.js)
// and injected as __BUILD_VERSION__ at build time. Consumed in
// Settings → About, JobList header badge, PhotoCapture footer.
export const BUILD_VERSION = __BUILD_VERSION__;
```

- [ ] **Step 3: Update `vite.config.js` to read version.json, define it, and rewrite SW**

Replace the contents of `vite.config.js` with:
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { version: BUILD_VERSION } = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'version.json'), 'utf8')
);

// Rewrites the literal __BUILD_VERSION__ in public/service-worker.js
// to the actual version after Vite copies it into dist/. Runs in the
// closeBundle hook so it sees the final emitted file.
function injectSwVersion() {
  return {
    name: 'inject-sw-version',
    apply: 'build',
    closeBundle() {
      const swPath = resolve(import.meta.dirname, 'dist', 'service-worker.js');
      const src = readFileSync(swPath, 'utf8');
      const out = src.replaceAll('__BUILD_VERSION__', BUILD_VERSION);
      if (out === src) {
        throw new Error(
          'inject-sw-version: __BUILD_VERSION__ placeholder not found in dist/service-worker.js'
        );
      }
      writeFileSync(swPath, out);
    },
  };
}

// `base: './'` keeps everything path-relative so the build works whether
// you serve from `https://user.github.io/repo-name/` (GitHub Pages),
// the root of a custom domain, or even the local file system for testing.
export default defineConfig({
  plugins: [react(), injectSwVersion()],
  base: './',
  define: {
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: {
          'export-libs': ['exceljs', 'jszip'],
        },
      },
    },
  },
  server: {
    host: true,
  },
});
```

- [ ] **Step 4: Update `public/service-worker.js` to use the placeholder**

Edit `public/service-worker.js`, replace lines 1-4:
```js
// e-OIC (Onsite Investigation Checklist) PWA — service worker
// Bump VERSION on each deploy to force clients to fetch fresh assets.
const VERSION = 'v34';
const CACHE = `eoic-${VERSION}`;
```
with:
```js
// e-OIC (Onsite Investigation Checklist) PWA — service worker.
// VERSION is replaced at build time by the inject-sw-version plugin
// in vite.config.js, sourced from version.json at repo root.
const VERSION = '__BUILD_VERSION__';
const CACHE = `eoic-${VERSION}`;
```

- [ ] **Step 5: Sync `package.json` version field**

Edit `package.json` line 4, change:
```json
  "version": "1.1.0",
```
to:
```json
  "version": "0.35.0",
```

(We use semver-shaped `0.35.0` to mirror v35 while keeping npm happy. The `BUILD_VERSION` constant the user sees is still `v35` — `package.json#version` is npm-internal only and was previously stale at 1.1.0.)

- [ ] **Step 6: Build and verify the SW gets the real version**

Run:
```bash
npm run build && grep -c "__BUILD_VERSION__\|VERSION = 'v35'" dist/service-worker.js
```

Expected: `1` (the literal `VERSION = 'v35'` line — placeholder fully replaced).

Also verify the app side:
```bash
grep -c "v35" dist/assets/*.js | grep -v ':0$' | head -3
```

Expected: at least one match (define injection landed in the bundled JS).

- [ ] **Step 7: Run the dev server briefly to confirm nothing exploded**

Run: `npm run dev` for ~5 seconds, then Ctrl-C.

Expected: server starts on a port without errors. Vite must not log a warning about `__BUILD_VERSION__` being undefined (the `define` covers dev too).

- [ ] **Step 8: Commit**

```bash
git add version.json vite.config.js src/version.js public/service-worker.js package.json
git commit -m "build: centralize BUILD_VERSION in version.json

Adds version.json as single source of truth; vite.config.js reads it,
defines __BUILD_VERSION__ for the app, and rewrites the literal in
the emitted service-worker.js at build time. SPEC.md version line
is now outdated by design — link to git log instead."
```

---

## Task 5: Fix JobList and JobView N+1 IDB queries

**Files:**
- Modify: `src/components/JobList.jsx:26-37`
- Modify: `src/components/JobView.jsx:32-51`

Today both components iterate IDs in a `for` loop, awaiting two reads per item sequentially. With 20 jobs, that's 40 serial round-trips. IndexedDB transactions parallelize fine across reads — `Promise.all` cuts wall time by Nx.

- [ ] **Step 1: Replace JobList.jsx `refresh()` with parallel fetch**

Edit `src/components/JobList.jsx`, replace lines 26-37:
```js
  async function refresh() {
    const all = await listJobs();
    setJobs(all);
    const s = {};
    const p = {};
    for (const j of all) {
      s[j.id] = await getJobSizeEstimate(j.id);
      p[j.id] = await getJobPercent(j.id);
    }
    setStats(s);
    setPercents(p);
  }
```
with:
```js
  async function refresh() {
    const all = await listJobs();
    setJobs(all);
    const results = await Promise.all(
      all.map(async (j) => [
        j.id,
        await getJobSizeEstimate(j.id),
        await getJobPercent(j.id),
      ])
    );
    const s = {};
    const p = {};
    for (const [id, size, pct] of results) {
      s[id] = size;
      p[id] = pct;
    }
    setStats(s);
    setPercents(p);
  }
```

- [ ] **Step 2: Replace JobView.jsx `refresh()` per-panel block with parallel fetch**

Edit `src/components/JobView.jsx`, replace lines 32-51:
```js
  async function refresh() {
    const j = await getJob(jobId);
    if (!j) { nav('/'); return; }
    setJob(j);
    const ps = await listPanels(jobId);
    setPanels(ps);
    const s = {};
    const pp = {};
    for (const p of ps) {
      const rows = await listAllRows(p.id);
      const photos = await listPanelPhotos(p.id);
      s[p.id] = { rows: rows.length, photos: photos.length };
      pp[p.id] = (await getPanelProgress(p.id)).percent;
    }
    setStats(s);
    setPanelPercents(pp);
    setAggregate(await getJobAggregateStats(jobId));
    const tasks = await getJobChecklist(jobId);
    setChecklistTotals({ checked: tasks.filter((t) => t.completed).length, total: tasks.length });
  }
```
with:
```js
  async function refresh() {
    const j = await getJob(jobId);
    if (!j) { nav('/'); return; }
    setJob(j);
    const ps = await listPanels(jobId);
    setPanels(ps);
    const perPanel = await Promise.all(
      ps.map(async (p) => {
        const [rows, photos, progress] = await Promise.all([
          listAllRows(p.id),
          listPanelPhotos(p.id),
          getPanelProgress(p.id),
        ]);
        return [p.id, { rows: rows.length, photos: photos.length }, progress.percent];
      })
    );
    const s = {};
    const pp = {};
    for (const [id, sizes, pct] of perPanel) {
      s[id] = sizes;
      pp[id] = pct;
    }
    setStats(s);
    setPanelPercents(pp);
    const [agg, tasks] = await Promise.all([
      getJobAggregateStats(jobId),
      getJobChecklist(jobId),
    ]);
    setAggregate(agg);
    setChecklistTotals({ checked: tasks.filter((t) => t.completed).length, total: tasks.length });
  }
```

- [ ] **Step 3: Run unit tests to make sure nothing here was depended on**

Run: `npm run test:unit`

Expected: pass.

- [ ] **Step 4: Run e2e to confirm UI flows still load**

Run: `npm run test:e2e`

Expected: pass. (The e2e harness exercises export but doesn't directly assert on these refresh paths; it's still a useful smoke that imports of these files don't throw.)

- [ ] **Step 5: Manual sanity in dev — open the JobList, click into a job**

Run: `npm run dev`, open the URL, confirm:
- JobList renders with stats populated (panels/photos counts non-empty for jobs that have them).
- Clicking into a job opens JobView with per-panel rows/photos counts populated.
- Refreshing the window doesn't break the UI.

Then Ctrl-C the dev server.

Expected: same UX as before, faster perceived load with multiple jobs.

- [ ] **Step 6: Commit**

```bash
git add src/components/JobList.jsx src/components/JobView.jsx
git commit -m "perf: parallelize per-job/per-panel IDB fetches with Promise.all

JobList.refresh() and JobView.refresh() were doing N serial IDB reads
in a for-await loop. Now fans out via Promise.all — IDB read txns
parallelize fine. Visible win on mobile with 15+ jobs and the
on-focus refresh listener."
```

---

## Task 6: Stop snapshotting full job for delete-undo toasts

**Files:**
- Modify: `src/db.js` (add 4 raw helpers after `importJSON` block, before `// ======= Photos =======` or end of file)
- Modify: `src/components/JobView.jsx:60-74` (panel-delete handler)
- Modify: `src/components/JobList.jsx:41-51` (job-delete handler)

The current undo path calls `exportJobJSON` (which base64-encodes every photo blob in the job — hundreds of MB for a photo-heavy job) and `importJSON` to undo. The fix: use Blob references directly — capture the rows/notes/photos in memory as IDB returned them, restore as-is. For panel delete, scope the snapshot to that one panel's slice.

- [ ] **Step 1: Add raw snapshot helpers to db.js**

Read the bottom of `src/db.js` to find a clean insertion point — after the `importJSON` function (ends ~line 538). Append:

```js
// ======= Raw snapshots (for undo toasts) =======
// These keep photo blobs as Blob references — no base64 round-trip.
// Snapshots are in-memory only; never serialized to disk. Use them
// for short-lived undo state where the user might restore within
// seconds. For long-term backup, use exportJobJSON / importJSON.

export async function exportPanelRaw(panelId) {
  const db = await getDB();
  const panel = await db.get('panels', panelId);
  if (!panel) throw new Error('Panel not found');
  const [rows, photos, notes] = await Promise.all([
    db.getAllFromIndex('rows', 'panelId', panelId),
    db.getAllFromIndex('photos', 'panelId', panelId),
    db.getAllFromIndex('sheetNotes', 'panelId', panelId),
  ]);
  return { panel, rows, photos, notes };
}

export async function restorePanelRaw(snap) {
  const db = await getDB();
  const tx = db.transaction(['panels', 'rows', 'photos', 'sheetNotes'], 'readwrite');
  await tx.objectStore('panels').put(snap.panel);
  for (const r of snap.rows) await tx.objectStore('rows').put(r);
  for (const p of snap.photos) await tx.objectStore('photos').put(p);
  for (const n of snap.notes) await tx.objectStore('sheetNotes').put(n);
  await tx.done;
}

export async function exportJobRaw(jobId) {
  const db = await getDB();
  const job = await db.get('jobs', jobId);
  if (!job) throw new Error('Job not found');
  const panels = await db.getAllFromIndex('panels', 'jobId', jobId);
  const panelSnaps = await Promise.all(panels.map((p) => exportPanelRaw(p.id)));
  const checklist = await db.get('checklistState', jobId);
  return { job, panelSnaps, checklist: checklist || null };
}

export async function restoreJobRaw(snap) {
  const db = await getDB();
  const tx = db.transaction(
    ['jobs', 'panels', 'rows', 'photos', 'sheetNotes', 'checklistState'],
    'readwrite'
  );
  await tx.objectStore('jobs').put(snap.job);
  for (const ps of snap.panelSnaps) {
    await tx.objectStore('panels').put(ps.panel);
    for (const r of ps.rows) await tx.objectStore('rows').put(r);
    for (const p of ps.photos) await tx.objectStore('photos').put(p);
    for (const n of ps.notes) await tx.objectStore('sheetNotes').put(n);
  }
  if (snap.checklist) await tx.objectStore('checklistState').put(snap.checklist);
  await tx.done;
}
```

- [ ] **Step 2: Add a unit test for the round-trip**

Create `src/lib/rawSnapshot.test.js`:

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

const dbModule = await import('../db.js');
const {
  createJob, createPanel, addRow, listAllRows,
  exportPanelRaw, restorePanelRaw,
  exportJobRaw, restoreJobRaw,
  deletePanel, deleteJob, getJob, listPanels,
} = dbModule;

test('exportPanelRaw + restorePanelRaw round-trips a panel after delete', async () => {
  const job = await createJob({ name: 'T1' });
  const panel = await createPanel({ jobId: job.id, name: 'P1' });
  await addRow({ panelId: panel.id, sheet: 'main', idx: 0, data: { foo: 'bar' } });
  const snap = await exportPanelRaw(panel.id);
  await deletePanel(panel.id);
  assert.equal((await listPanels(job.id)).length, 0);
  await restorePanelRaw(snap);
  const panels = await listPanels(job.id);
  assert.equal(panels.length, 1);
  const rows = await listAllRows(panels[0].id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].data.foo, 'bar');
});

test('exportJobRaw + restoreJobRaw round-trips a whole job after delete', async () => {
  const job = await createJob({ name: 'T2' });
  const panel = await createPanel({ jobId: job.id, name: 'P2' });
  await addRow({ panelId: panel.id, sheet: 'main', idx: 0, data: { x: 1 } });
  const snap = await exportJobRaw(job.id);
  await deleteJob(job.id);
  assert.equal(await getJob(job.id), undefined);
  await restoreJobRaw(snap);
  assert.ok(await getJob(job.id));
  assert.equal((await listPanels(job.id)).length, 1);
});
```

NOTE: this test imports `addRow` from `db.js`. Before writing the test, verify the function name. Run:
```bash
grep -n "^export async function addRow\|^export async function createRow" src/db.js
```

If the function is named `createRow` (or otherwise) instead of `addRow`, update the import and call site in the test accordingly.

- [ ] **Step 3: Run the new test**

Run: `node --test src/lib/rawSnapshot.test.js`

Expected: both subtests pass. If `fake-indexeddb/auto` complains about a missing dep, confirm it's already installed (`npm ls fake-indexeddb` should show `fake-indexeddb@6.x`).

- [ ] **Step 4: Wire `restorePanelRaw` into JobView panel-delete**

Edit `src/components/JobView.jsx`. At the top of the file, update the db import on lines 2-5:
```js
import {
  getJob, listPanels, createPanel, updatePanel, deletePanel, duplicatePanel,
  listAllRows, listPanelPhotos, exportJobJSON, importJSON, updateJob,
} from '../db.js';
```
to:
```js
import {
  getJob, listPanels, createPanel, updatePanel, deletePanel, duplicatePanel,
  listAllRows, listPanelPhotos, exportJobJSON, importJSON, updateJob,
  exportPanelRaw, restorePanelRaw,
} from '../db.js';
```

Then replace the `onDelete` function (lines 60-74):
```js
  async function onDelete(panel) {
    // Snapshot panel via per-job export, then filter to just this panel's data
    // for the undo. Easiest: just snapshot the whole job and re-import the
    // panel-related slices on undo. We'll do the simpler thing — full
    // job snapshot, replace on undo (will atomically restore the panel).
    const snapshot = await exportJobJSON(jobId);
    await deletePanel(panel.id);
    await refresh();
    toast.undoable(`Deleted panel “${panel.name}”`, {
      onUndo: async () => {
        await importJSON(snapshot, { mode: 'replace' });
        await refresh();
      },
    });
  }
```
with:
```js
  async function onDelete(panel) {
    const snapshot = await exportPanelRaw(panel.id);
    await deletePanel(panel.id);
    await refresh();
    toast.undoable(`Deleted panel “${panel.name}”`, {
      onUndo: async () => {
        await restorePanelRaw(snapshot);
        await refresh();
      },
    });
  }
```

- [ ] **Step 5: Wire `exportJobRaw` / `restoreJobRaw` into JobList job-delete**

Edit `src/components/JobList.jsx`. Update line 2:
```js
import { listJobs, createJob, updateJob, deleteJob, getJobSizeEstimate, importJSON, exportJobJSON } from '../db.js';
```
to:
```js
import { listJobs, createJob, updateJob, deleteJob, getJobSizeEstimate, exportJobRaw, restoreJobRaw } from '../db.js';
```

(`importJSON` and `exportJobJSON` are no longer used in this file — remove them.)

Then replace the `onDelete` function (lines 41-51):
```js
  async function onDelete(job) {
    const snapshot = await exportJobJSON(job.id);
    await deleteJob(job.id);
    await refresh();
    toast.undoable(`Deleted "${job.name}"`, {
      onUndo: async () => {
        await importJSON(snapshot, { mode: 'replace' });
        await refresh();
      },
    });
  }
```
with:
```js
  async function onDelete(job) {
    const snapshot = await exportJobRaw(job.id);
    await deleteJob(job.id);
    await refresh();
    toast.undoable(`Deleted "${job.name}"`, {
      onUndo: async () => {
        await restoreJobRaw(snapshot);
        await refresh();
      },
    });
  }
```

- [ ] **Step 6: Verify nothing else in the repo still imports `exportJobJSON` / `importJSON` for delete-undo paths**

Run: `grep -rn "exportJobJSON\|importJSON" src/ --include="*.jsx" --include="*.js" | grep -v db.js`

Expected: only references in `SettingsView.jsx` (legitimate full-backup feature) and the JSON-backup download path in `JobView.jsx:onBackupJob`. No remaining undo-toast references.

- [ ] **Step 7: Run lint, unit tests, and e2e**

Run: `npm run lint && npm run test:unit && npm run test:e2e`

Expected: all three pass. Lint must show no `no-unused-vars` warnings for the import changes you made.

- [ ] **Step 8: Manual sanity in dev**

Run: `npm run dev`. With at least one job that has a panel:
1. Delete a panel from JobView, click the toast Undo before it expires → panel reappears with all rows/photos.
2. Delete a job from JobList, click Undo → job reappears with panels, rows, photos.

Expected: both undo flows restore identical state. Photo blobs render in PhotoCapture (proves Blob references survived round-trip without base64 churn).

Ctrl-C dev server.

- [ ] **Step 9: Commit**

```bash
git add src/db.js src/lib/rawSnapshot.test.js src/components/JobView.jsx src/components/JobList.jsx
git commit -m "perf(undo): use raw blob snapshots instead of base64 export

Panel- and job-delete undo paths previously called exportJobJSON,
which base64-encodes every photo (hundreds of MB for photo-heavy
jobs) just to power a 6-second toast. New exportPanelRaw /
exportJobRaw / restore* helpers keep blobs as Blob references in
memory. Panel delete is also now scoped to the deleted panel
instead of snapshotting the full job."
```

---

## Self-Review Notes

- **Spec coverage:** All 5 fixes from the health review have a task. Top-5 items map: Fix 1 → Task 1; Fix 2 → Tasks 2 & 3; Fix 3 → Task 4; Fix 4 → Task 5; Fix 5 → Task 6.
- **Type/name consistency:** `exportPanelRaw`/`restorePanelRaw`/`exportJobRaw`/`restoreJobRaw` used identically across db.js, components, and the test. Task 6 Step 2 includes a sanity grep to confirm `addRow` is the actual db.js name before the test is committed.
- **Placeholders:** All steps include exact paths, exact code, and exact commands. No "TBD" or "implement appropriate error handling."
- **Independence:** Tasks 1, 2, 3 are fully independent. Task 4 is independent of 1-3 but does touch the workflow file modified by 1 & 2 — since each task commits before the next starts, there's no merge conflict. Task 5 is independent of 1-4. Task 6 depends on Task 2 only insofar as Step 3 uses `node --test` (which already worked before Task 2 wired the npm script).
