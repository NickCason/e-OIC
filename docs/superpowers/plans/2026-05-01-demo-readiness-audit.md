# Demo Readiness Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land all 17 punch-list items from the demo-readiness audit so the SharePoint round-trip path looks like a fundable, real product when leadership taps through it on a phone.

**Architecture:** Pure UI/UX surgery — no new libraries, no new modules, no DB changes. Touches existing components (`JobView`, `JobList`, `SettingsView`, `DiffView`, `PullDialog`, `ExportDialog`, `InstallBanner`, `App`, `PanelView`, `Icon`), the parser (one new optional `onProgress` callback in `xlsxParser.js`), and `styles.css`. Items split cleanly into: copy/text edits, icon-glyph replacements, DiffView surgery, progress-narration callback, skeleton states.

**Tech Stack:** React 18, Vite 5, lucide-react icons, ExcelJS, IndexedDB via `idb`, `node:test` for unit tests. Existing conventions per `docs/superpowers/plans/2026-05-01-sharepoint-roundtrip.md`.

**Spec:** `docs/superpowers/specs/2026-05-01-demo-readiness-audit.md`

---

## File Structure

### Modified files

| Path | Change |
|---|---|
| `src/components/JobView.jsx` | Replace `prompt()` (line 87) with modal; replace unicode glyphs (lines 207–209, 245, 247, 249) with `<Icon>`; trim duplicate toast (line 91); wrap panel name in `<Marquee>` (line 191). |
| `src/components/SettingsView.jsx` | Replace two `confirm()` calls (lines 84, 100) with modals; delete `APP_VERSION` constant (line 12) and footer line (line 232). |
| `src/components/JobList.jsx` | Remove `<span className="build-badge">` from hero pretitle (line 111). |
| `src/components/DiffView.jsx` | Use `rowDisplayLabel` from `src/lib/rowLabel.js`; render sheet-notes section; restack modified rows vertically. |
| `src/components/PullDialog.jsx` | Replace idle copy (lines 105–108); accept and render progress phases instead of bare spinner. |
| `src/components/ExportDialog.jsx` | Add `--energy` directional ribbon to push-diff stage (line 221). |
| `src/components/InstallBanner.jsx` | Replace iOS-modal "Sorry!" sentence (line 63). |
| `src/components/App.jsx` | Replace GeoPrompt jargon line (line 104). |
| `src/components/PanelView.jsx` | Render skeleton instead of `null` on cold load (line 49). |
| `src/components/Icon.jsx` | Add `Copy` from lucide-react and a `copy` registry entry. |
| `src/lib/xlsxParser.js` | `parseChecklistXlsx(arrayBuffer, { onProgress } = {})`: emit progress phases at sheet boundaries. |
| `src/lib/xlsxParser.test.js` | Add a test that `onProgress` is called with expected phases. |
| `src/styles.css` | New `.diff-row--mod` vertical layout; `.diff-sheet-notes` block; `.diff-push-ribbon`; skeleton-shimmer keyframes + `.skeleton-*` classes; `.install-banner-sub` opacity bump. |

### Created files

None.

---

## Conventions

- **Tests:** Pure-JS helpers use `node:test`. Run with `node --test src/lib/<file>.test.js`. UI components are not unit-tested in this project; rely on real-device QA. (Same convention as the SharePoint round-trip plan.)
- **Commits:** Frequent, scoped, conventional prefix (`fix:`, `feat:`, `chore:`, `style:`, `refactor:`, `test:`). Direct-on-main, no PRs.
- **Files:** Always use absolute paths in tool calls. Always `git add` specific files (no `git add .`).
- **Don't bump `BUILD_VERSION` per task.** Bump once at the end of the plan, in the final task, to `v36`.
- **Modal pattern:** Use the existing `modal-bg` / `modal` classes. The Disconnect modal at `JobView.jsx:226–240` is the canonical reference.
- **Lint:** Run `npm run lint` after each task before commit. The existing four warnings (`totalPanels`, `useCallback`, `getJob`, `React`) are out-of-scope parking-lot items per the spec — leave them alone.

---

## Task 1: Replace `prompt()`/`confirm()` on demo path

**Files:**
- Modify: `src/components/JobView.jsx`
- Modify: `src/components/SettingsView.jsx`

The three offending calls are:
- `JobView.jsx:87` — `prompt()` for "Duplicate panel as:".
- `SettingsView.jsx:84` — `confirm()` for "Restore this backup?".
- `SettingsView.jsx:100` — `confirm()` for "Reload the sample job?".

All three become `modal-bg`/`modal` overlays following the JobView Disconnect-modal pattern.

- [ ] **Step 1: Add duplicate-panel modal state to JobView**

In `src/components/JobView.jsx`, add to the `useState` block (around line 31):

```jsx
  const [duplicating, setDuplicating] = useState(null); // panel being duplicated
  const [duplicateName, setDuplicateName] = useState('');
```

- [ ] **Step 2: Replace `onDuplicate` to open the modal**

Replace `JobView.jsx:86-92` (the entire `onDuplicate` function) with:

```jsx
  function onDuplicate(panel) {
    setDuplicating(panel);
    setDuplicateName(`${panel.name} (copy)`);
  }

  async function confirmDuplicate() {
    const newName = duplicateName.trim();
    if (!newName || !duplicating) return;
    const dup = await duplicatePanel(duplicating.id, newName);
    setDuplicating(null);
    setDuplicateName('');
    await refresh();
    toast.show(`Duplicated as “${dup.name}”`);
  }
```

(Note: the toast no longer says "(rows copied, photos not)" — that's Task 13 (item H). Doing it here keeps the diff small.)

- [ ] **Step 3: Render the duplicate modal**

In `src/components/JobView.jsx`, just before the `confirmingDisconnect && (...)` block (around line 226), insert:

```jsx
      {duplicating && (
        <div className="modal-bg" onClick={() => setDuplicating(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Duplicate panel</h2>
            <div className="field">
              <label>New panel name</label>
              <input
                value={duplicateName}
                onChange={(e) => setDuplicateName(e.target.value)}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') confirmDuplicate(); }}
              />
            </div>
            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={() => setDuplicating(null)}>Cancel</button>
              <button className="primary" onClick={confirmDuplicate} disabled={!duplicateName.trim()}>
                Duplicate
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 4: Add restore + reload-sample modal state to SettingsView**

In `src/components/SettingsView.jsx`, after the existing `useState` block (around line 18), add:

```jsx
  const [pendingRestoreFile, setPendingRestoreFile] = useState(null);
  const [confirmingReloadSample, setConfirmingReloadSample] = useState(false);
```

- [ ] **Step 5: Replace the `confirm()` in `onRestore`**

Replace `src/components/SettingsView.jsx:80-97` (the entire `onRestore` function) with:

```jsx
  function onRestore(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPendingRestoreFile(file);
  }

  async function confirmRestore() {
    const file = pendingRestoreFile;
    setPendingRestoreFile(null);
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const snapshot = JSON.parse(text);
      const stats = await importJSON(snapshot, { mode: 'merge' });
      toast.show(`Restored ${stats.jobs} job(s), ${stats.panels} panels, ${stats.photos} photos`);
    } catch (err) {
      console.error(err);
      toast.error('Restore failed: ' + (err.message || 'invalid backup'));
    } finally {
      setBusy(false);
    }
  }
```

- [ ] **Step 6: Replace the `confirm()` in `onReloadSample`**

Replace `src/components/SettingsView.jsx:99-110` (the entire `onReloadSample` function) with:

```jsx
  function onReloadSample() {
    setConfirmingReloadSample(true);
  }

  async function confirmReloadSample() {
    setConfirmingReloadSample(false);
    setBusy(true);
    try {
      const stats = await reloadSampleJob();
      toast.show(`Sample reloaded: ${stats.jobs} job, ${stats.panels} panels, ${stats.rows} rows`);
    } catch (e) {
      toast.error('Could not load sample: ' + (e.message || e));
    } finally {
      setBusy(false);
    }
  }
```

- [ ] **Step 7: Render both Settings modals**

Just before the closing `</main>` tag in `SettingsView.jsx` (around line 234), insert:

```jsx
        {pendingRestoreFile && (
          <div className="modal-bg" onClick={() => setPendingRestoreFile(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2 className="modal-title">Restore this backup?</h2>
              <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                <strong>Merge mode:</strong> existing jobs are kept; new ones are added.
                If you want to overwrite duplicates, cancel and use “Replace” via the menu (advanced).
              </p>
              <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                <button className="ghost" onClick={() => setPendingRestoreFile(null)}>Cancel</button>
                <button className="primary" onClick={confirmRestore}>Restore</button>
              </div>
            </div>
          </div>
        )}

        {confirmingReloadSample && (
          <div className="modal-bg" onClick={() => setConfirmingReloadSample(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2 className="modal-title">Reload the sample job?</h2>
              <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                Any local edits to the sample will be overwritten. Other jobs are untouched.
              </p>
              <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                <button className="ghost" onClick={() => setConfirmingReloadSample(false)}>Cancel</button>
                <button className="primary" onClick={confirmReloadSample}>Reload sample</button>
              </div>
            </div>
          </div>
        )}
```

- [ ] **Step 8: Verify lint + manual sanity**

Run: `npm run lint`
Expected: PASS with the four pre-existing warnings only (no new ones).

Run: `npm run dev` and on the demo path: tap a panel duplicate icon → modal appears, shows pre-filled name, Enter confirms, toast says `Duplicated as "X"` (no apology). Settings → Reload sample → modal appears, Reload confirms. Settings → Import backup → file picker → modal appears, Restore confirms.

- [ ] **Step 9: Commit**

```bash
git add src/components/JobView.jsx src/components/SettingsView.jsx
git commit -m "fix: replace prompt()/confirm() on demo path with in-app modals"
```

---

## Task 2: Kill stale `APP_VERSION = '1.1.0'` in SettingsView

**Files:**
- Modify: `src/components/SettingsView.jsx`

The footer renders both `BUILD_VERSION` (correct) and the leftover `APP_VERSION` constant. Delete both.

- [ ] **Step 1: Delete the constant**

Remove `src/components/SettingsView.jsx:12` (the `const APP_VERSION = '1.1.0';` line).

- [ ] **Step 2: Delete the footer line**

Remove `src/components/SettingsView.jsx:232` (the `<div className="settings-footer-sub">v{APP_VERSION}</div>` line). Footer should now read only:

```jsx
        <footer className="settings-footer">
          <div className="settings-footer-mark" aria-hidden="true" />
          <div className="settings-footer-text">
            <strong>e-OIC</strong> · {BUILD_VERSION}
          </div>
          <div className="settings-footer-sub">An E Tech Group field tool.</div>
        </footer>
```

- [ ] **Step 3: Verify lint passes**

Run: `npm run lint`
Expected: PASS (no `APP_VERSION is not defined` error).

- [ ] **Step 4: Commit**

```bash
git add src/components/SettingsView.jsx
git commit -m "chore: drop stale APP_VERSION constant from Settings footer"
```

---

## Task 3: Replace panel-row + menu unicode glyphs with `<Icon>`

**Files:**
- Modify: `src/components/Icon.jsx`
- Modify: `src/components/JobView.jsx`

The icon registry doesn't currently have `copy` — `lucide-react` exports `Copy`. Add it once and reuse.

- [ ] **Step 1: Register `copy` icon**

In `src/components/Icon.jsx`, add `Copy` to the lucide imports (alphabetical with the existing list):

```jsx
import {
  ChevronLeft,
  ChevronDown,
  Plus,
  Settings,
  Search,
  Camera,
  Image,
  ImageOff,
  MapPin,
  ArrowRight,
  ArrowDown,
  Check,
  Trash2,
  Download,
  Link as LinkIcon,
  LayoutGrid,
  X,
  MoreHorizontal,
  Edit3,
  Sun,
  Moon,
  Monitor,
  AlertCircle,
  ChevronRight,
  RefreshCw,
  Copy,
  Unlink,
} from 'lucide-react';
```

Add to the `ICONS` map:

```jsx
  copy: Copy,
  unlink: Unlink,
```

(`unlink` covers the `⛓` Disconnect-from-xlsx menu item glyph.)

- [ ] **Step 2: Replace panel-row glyphs**

In `src/components/JobView.jsx`, replace lines 207–209 (the three `<button>`s in `<div className="actions">`) with:

```jsx
              <div className="actions">
                <button className="ghost icon-btn" onClick={(e) => { e.stopPropagation(); setEditing(p); }} aria-label="Edit">
                  <Icon name="edit" size={16} />
                </button>
                <button className="ghost icon-btn" onClick={(e) => { e.stopPropagation(); onDuplicate(p); }} aria-label="Duplicate">
                  <Icon name="copy" size={16} />
                </button>
                <button className="ghost danger icon-btn" onClick={(e) => { e.stopPropagation(); onDelete(p); }} aria-label="Delete">
                  <Icon name="trash" size={16} />
                </button>
              </div>
```

- [ ] **Step 3: Replace menu glyphs**

In `src/components/JobView.jsx`, replace lines 245, 247, 249 (the four `modal-list-btn`s in the menu — note the conditional one too) with:

```jsx
            <button className="modal-list-btn" onClick={() => { setMenuOpen(false); onBackupJob(); }}>
              <Icon name="download" size={16} /><span style={{ marginLeft: 8 }}>Back up this job</span>
            </button>
            <button className="modal-list-btn" onClick={() => { setMenuOpen(false); setEditing({ ...job, _isJob: true }); }}>
              <Icon name="edit" size={16} /><span style={{ marginLeft: 8 }}>Edit job details</span>
            </button>
            <button className="modal-list-btn" onClick={() => { setMenuOpen(false); setResyncing(true); }}>
              <Icon name="refresh" size={16} /><span style={{ marginLeft: 8 }}>Re-sync from xlsx</span>
            </button>
            {job.source && (
              <button className="modal-list-btn" onClick={() => { setMenuOpen(false); setConfirmingDisconnect(true); }}>
                <Icon name="unlink" size={16} /><span style={{ marginLeft: 8 }}>Disconnect from xlsx</span>
              </button>
            )}
```

- [ ] **Step 4: Verify lint + visual check**

Run: `npm run lint`
Expected: PASS.

Run: `npm run dev` and confirm: panel rows show clean Lucide pencil/copy/trash icons (no emoji); JobView ⋯ menu shows download/edit/refresh/unlink icons with proper spacing.

- [ ] **Step 5: Commit**

```bash
git add src/components/Icon.jsx src/components/JobView.jsx
git commit -m "fix: replace JobView unicode glyphs with Lucide icons"
```

---

## Task 4: DiffView labels — use `rowDisplayLabel` everywhere

**Files:**
- Modify: `src/components/DiffView.jsx`

The current `labelOrFallback` uses ad-hoc `Object.keys(data).find(...)` debug logic and `(?)` placeholders. The canonical label util at `src/lib/rowLabel.js:35` (`rowDisplayLabel(row, sheetName, schema)`) already handles every sheet. Plumb schemaMap through and call it. For rows where `rowDisplayLabel` returns the generic `Row N+1` fallback, prefix with `<sheetName> · ` per spec.

- [ ] **Step 1: Import `rowDisplayLabel` and `schemaMap`**

In `src/components/DiffView.jsx`, replace the imports (line 1–2) with:

```jsx
import React, { useState } from 'react';
import Icon from './Icon.jsx';
import { rowDisplayLabel } from '../lib/rowLabel.js';
import schemaMap from '../schema.json' with { type: 'json' };
```

- [ ] **Step 2: Replace `labelOrFallback`**

Replace `src/components/DiffView.jsx:149-154` (the entire `labelOrFallback` function) with:

```jsx
function labelOrFallback(r, sheetName, _sd, _kind, i) {
  const schema = schemaMap[sheetName];
  const label = rowDisplayLabel(r, sheetName, schema);
  // rowDisplayLabel returns "Row N" as last-resort generic. In a diff
  // context that's ambiguous across sheets, so qualify it.
  if (/^Row \d+$/.test(label)) return `${sheetName} · row ${i + 1}`;
  return label;
}
```

- [ ] **Step 3: Update `modified` row label call site**

In `src/components/DiffView.jsx:69-70`, replace:

```jsx
                    <span className="diff-mark">~</span> {m.label || '(unlabeled)'}
```

with:

```jsx
                    <span className="diff-mark">~</span> {m.label || labelOrFallback(m.row || { data: {} }, sheetName, sd, 'mod', i)}
```

(Note: `jobDiff.js` populates `m.label` on modified rows; the fallback is defensive.)

- [ ] **Step 4: Grep for `(?)` to confirm no placeholders remain**

Run: `grep -n "(?)" /Users/nickcason/DevSpace/Work/e-OIC/src/components/DiffView.jsx`
Expected: no matches.

- [ ] **Step 5: Verify diff view in dev**

Run: `npm run dev`. From the demo path: tap a job → ⋯ → Re-sync from xlsx → pick a modified xlsx → confirm DiffView shows real row labels (e.g., panel names, device names) instead of `(?)`. For rows on sheets where the canonical label is empty, expect `<SheetName> · row N`.

- [ ] **Step 6: Run unit tests to make sure rowLabel didn't regress**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/DiffView.jsx
git commit -m "fix: DiffView uses canonical rowDisplayLabel; no more (?) placeholders"
```

---

## Task 5: DiffView modified-row vertical layout

**Files:**
- Modify: `src/components/DiffView.jsx`
- Modify: `src/styles.css`

`DiffView.jsx:71-78` renders each `m.fieldChanges` as `field: old → new` inline. Long values wrap mid-arrow on phone. Restack into a 2-row grid: red strike-through old above, green bold new below, with the field label as a small dim header.

- [ ] **Step 1: Update modified-row markup**

In `src/components/DiffView.jsx`, replace lines 71–78 (the `m.fieldChanges.map(...)` block) with:

```jsx
                    {m.fieldChanges.map((fc, j) => (
                      <div key={j} className="diff-field-change diff-field-change--stacked">
                        <div className="diff-field-name">{fc.field}</div>
                        <div className="diff-field-old">{String(fc.old ?? '(empty)')}</div>
                        <div className="diff-field-new">{String(fc.new ?? '(empty)')}</div>
                      </div>
                    ))}
```

- [ ] **Step 2: Add CSS for stacked field changes**

In `src/styles.css`, replace the existing `.diff-field-change` rule (line 1744) and add new rules below it:

```css
.diff-field-change { padding-left: 18px; color: var(--text-dim); font-size: 12px; }
.diff-field-change--stacked {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2px;
  padding: 4px 0 4px 18px;
  margin-bottom: 4px;
}
.diff-field-name {
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-dim);
  font-weight: 600;
}
.diff-field-old {
  font-size: 13px;
  color: var(--accent-del, #b14848);
  text-decoration: line-through;
  text-decoration-thickness: 1px;
  opacity: 0.85;
  word-break: break-word;
}
.diff-field-new {
  font-size: 13px;
  color: var(--accent-add, #2e8a4f);
  font-weight: 600;
  word-break: break-word;
}
```

- [ ] **Step 3: Verify in dev on a narrow viewport**

Run: `npm run dev`. Open the diff view (Re-sync) with a long modified value (e.g., a notes field). In Chrome DevTools, set viewport to 375px (iPhone SE). Confirm the old value strikes through cleanly, the new value sits below in green bold, neither wraps mid-arrow.

- [ ] **Step 4: Commit**

```bash
git add src/components/DiffView.jsx src/styles.css
git commit -m "fix: DiffView modified rows stack old/new vertically for narrow viewports"
```

---

## Task 6: DiffView renders sheet-note changes (item A)

**Files:**
- Modify: `src/components/DiffView.jsx`
- Modify: `src/styles.css`

`countChanges` (line 142) already counts `diff.sheetNotes.added/removed/modified`, but the render path has no `sheetNotes` block — silent change today. Add a "Sheet notes" section after Panels.

- [ ] **Step 1: Add sheet-notes render block**

In `src/components/DiffView.jsx`, immediately after the Panels block (between the closing `)}` of the Panels section and the `Object.entries(diff.sheets).map(...)` block, around line 45), insert:

```jsx
      {(diff.sheetNotes.added.length > 0 || diff.sheetNotes.removed.length > 0 || diff.sheetNotes.modified.length > 0) && (
        <div className="diff-section diff-section--notes">
          <div className="diff-section-title">Sheet notes</div>
          {diff.sheetNotes.added.map((n, i) => (
            <div key={`sna${i}`} className="diff-row diff-row--add">
              <span className="diff-mark">+</span>
              <span className="diff-label">{n.panelName} · {n.sheetName}: </span>
              <span className="diff-new">{String(n.text || '(empty)')}</span>
            </div>
          ))}
          {diff.sheetNotes.removed.map((n, i) => (
            <div key={`snr${i}`} className="diff-row diff-row--del">
              <span className="diff-mark">−</span>
              <span className="diff-label">{n.panelName} · {n.sheetName}: </span>
              <span className="diff-old">{String(n.text || '(empty)')}</span>
            </div>
          ))}
          {diff.sheetNotes.modified.map((n, i) => (
            <div key={`snm${i}`} className="diff-row diff-row--mod">
              <span className="diff-mark">~</span>
              <span className="diff-label">{n.panelName} · {n.sheetName}</span>
              <div className="diff-field-change diff-field-change--stacked">
                <div className="diff-field-old">{String(n.old ?? '(empty)')}</div>
                <div className="diff-field-new">{String(n.new ?? '(empty)')}</div>
              </div>
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 2: Verify shape of `diff.sheetNotes` matches**

Run: `grep -n "sheetNotes" /Users/nickcason/DevSpace/Work/e-OIC/src/lib/jobDiff.js`
Read the matching lines to confirm field names (`added`, `removed`, `modified`, with each entry having `panelName`, `sheetName`, `text`/`old`/`new`). If the actual shape differs, adjust the markup in Step 1 to match — do NOT invent fields.

- [ ] **Step 3: Verify in dev**

Run: `npm run dev`. In the seeded sample job, edit a sheet-note in one panel, export to xlsx, modify the note in the xlsx, re-sync — confirm the "Sheet notes" section appears with the expected change.

- [ ] **Step 4: Commit**

```bash
git add src/components/DiffView.jsx
git commit -m "feat: DiffView renders sheet-note changes (Pull/Resync/Push)"
```

---

## Task 7: PullDialog progress narration (item B)

**Files:**
- Modify: `src/lib/xlsxParser.js`
- Modify: `src/lib/xlsxParser.test.js`
- Modify: `src/components/PullDialog.jsx`

The parser becomes `parseChecklistXlsx(arrayBuffer, { onProgress } = {})`. It calls `onProgress({ phase, detail })` at sheet boundaries. PullDialog passes a callback that updates a state setter; the spinner gets a live caption.

- [ ] **Step 1: Write the failing parser test**

In `src/lib/xlsxParser.test.js`, append a new test:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseChecklistXlsx } from './xlsxParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('parseChecklistXlsx emits progress phases', async () => {
  const buf = await readFile(path.join(__dirname, '__fixtures__/valid-seed.xlsx'));
  const phases = [];
  await parseChecklistXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), {
    onProgress: (p) => phases.push(p.phase),
  });
  assert.ok(phases.includes('loading'), `expected 'loading', got ${phases.join(',')}`);
  assert.ok(phases.includes('panels'), `expected 'panels', got ${phases.join(',')}`);
  assert.ok(phases.includes('rows'), `expected 'rows', got ${phases.join(',')}`);
  assert.ok(phases.includes('matching'), `expected 'matching', got ${phases.join(',')}`);
});
```

(If `xlsxParser.test.js` already imports `test`/`assert`, reuse those imports — duplicate `import` statements at the top will error.)

- [ ] **Step 2: Run the test to confirm it fails**

Run: `node --test src/lib/xlsxParser.test.js`
Expected: FAIL — the test runs but `phases` is empty (parser doesn't emit anything yet).

- [ ] **Step 3: Add `onProgress` to the parser**

In `src/lib/xlsxParser.js`, change the function signature on line 135 from:

```js
export async function parseChecklistXlsx(arrayBuffer) {
```

to:

```js
export async function parseChecklistXlsx(arrayBuffer, { onProgress } = {}) {
  const emit = (phase, detail) => {
    if (typeof onProgress === 'function') {
      try { onProgress({ phase, detail }); } catch { /* swallow callback errors */ }
    }
  };
```

Then add `emit(...)` calls at these points:

- Just before `await wb.xlsx.load(arrayBuffer);` (around line 148):
  ```js
  emit('loading', `Reading ${Math.round(arrayBuffer.byteLength / 1024)} KB`);
  ```
- After the Panels parse, replacing line 184 area, just after `result.panels.push(...)` finishes (after the closing `}` of the Panels-parse `for` loop at line 183):
  ```js
  emit('panels', `Found ${result.panels.length} panel${result.panels.length === 1 ? '' : 's'}`);
  ```
- Inside the non-Panels sheet loop (around line 186), replace the body so each iteration emits before parsing:
  ```js
  for (const sn of Object.keys(schemaMap)) {
    if (sn === 'Panels') continue;
    if (!sheetNames.includes(sn)) continue;
    const ws = wb.getWorksheet(sn);
    emit('rows', `Reading ${sn}`);
    result.rowsBySheet[sn] = parseSheetRows(ws, schemaMap[sn], result.warnings);
  }
  ```
- Just before the notes-row matching block (around line 220, before `const { rowDisplayLabel } = await import('./rowLabel.js');`):
  ```js
  emit('matching', 'Matching notes to rows');
  ```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test src/lib/xlsxParser.test.js`
Expected: PASS — all four phase assertions hold.

- [ ] **Step 5: Wire PullDialog progress UI**

In `src/components/PullDialog.jsx`, add a state hook just below the existing ones (around line 23):

```jsx
  const [progress, setProgress] = useState({ phase: 'loading', detail: '' });
```

Replace the call site at line 46 from:

```jsx
      const r = await parseChecklistXlsx(buf);
```

to:

```jsx
      const r = await parseChecklistXlsx(buf, { onProgress: setProgress });
```

Replace the `parsing` stage block (lines 118–123) with:

```jsx
        {stage === 'parsing' && (
          <div className="export-progress">
            <div className="export-spinner" />
            <div className="export-progress-text">{progressLabel(progress, filename)}</div>
          </div>
        )}
```

And add a helper at the bottom of the file (after `formatWarning`):

```jsx
function progressLabel(p, filename) {
  switch (p.phase) {
    case 'loading': return `Reading ${filename}…`;
    case 'panels':  return `${p.detail}…`;
    case 'rows':    return `${p.detail}…`;
    case 'matching': return `Matching to schema…`;
    default: return `Reading ${filename}…`;
  }
}
```

- [ ] **Step 6: Verify in dev with the real plant xlsx**

Run: `npm run dev`. Pull the seeded xlsx (or any real one). Confirm the spinner caption transitions through `Reading <file>…` → `Found N panels…` → `Reading <sheet>…` (multiple) → `Matching to schema…`. On a real plant xlsx (~2–3s parse) the user should see at least 2–3 distinct labels.

- [ ] **Step 7: Commit**

```bash
git add src/lib/xlsxParser.js src/lib/xlsxParser.test.js src/components/PullDialog.jsx
git commit -m "feat: PullDialog narrates parse progress at sheet boundaries"
```

---

## Task 8: PullDialog idle copy rewrite (item C)

**Files:**
- Modify: `src/components/PullDialog.jsx`

- [ ] **Step 1: Replace the idle copy**

In `src/components/PullDialog.jsx`, replace lines 105–108 (the `<p>` inside the `stage === 'idle'` block) with:

```jsx
            <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
              Bring an existing investigation in from SharePoint. We&apos;ll read
              the panels, rows, and notes — your data lives in the app, ready to
              update in the field.
            </p>
```

- [ ] **Step 2: Verify in dev**

Run: `npm run dev`. From JobList → FAB → Pull from xlsx → modal opens. Confirm idle copy reads exactly the new sentence, no orphaned punctuation.

- [ ] **Step 3: Commit**

```bash
git add src/components/PullDialog.jsx
git commit -m "fix: PullDialog idle copy aimed at the SharePoint moneyshot"
```

---

## Task 9: ExportDialog push — directional ribbon (item D)

**Files:**
- Modify: `src/components/ExportDialog.jsx`
- Modify: `src/styles.css`

`ExportDialog.jsx:221` already has a `<div className="export-summary"><strong>Pushing to {targetFilename}</strong></div>` line, but it reads as a generic header. Replace with a colored ribbon in `--energy` so the push direction is unmistakable.

- [ ] **Step 1: Replace the push-diff header**

In `src/components/ExportDialog.jsx`, replace lines 220–222 (the `<div className="export-summary">…</div>` plus `<DiffView .../>`) with:

```jsx
            <div className="diff-push-ribbon">
              <Icon name="arrowRight" size={14} />
              <span>Pushing to <strong>{targetFilename}</strong></span>
            </div>
            <DiffView diff={targetDiff} direction="push" />
```

- [ ] **Step 2: Add ribbon CSS**

In `src/styles.css`, append (next to the other DiffView rules, around line 1751):

```css
.diff-push-ribbon {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin: var(--sp-2) 0;
  background: var(--energy);
  color: #fff;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.01em;
}
.diff-push-ribbon strong { font-weight: 700; }
```

- [ ] **Step 3: Verify in dev**

Run: `npm run dev`. Export a connected job (one with `job.source.filename`) → "Pick target file" → after diff parses, confirm an amber ribbon shows with the right-arrow icon and the target filename. Side-by-side comparison: a Pull diff has no ribbon; only Push does.

- [ ] **Step 4: Commit**

```bash
git add src/components/ExportDialog.jsx src/styles.css
git commit -m "feat: directional Pushing-to ribbon on ExportDialog push diff"
```

---

## Task 10: Remove JobList build-version badge from hero pretitle (item E)

**Files:**
- Modify: `src/components/JobList.jsx`

The `<span className="build-badge">` inside the hero pretitle (line 111) reads as `[debug: v35]`. Settings already shows `BUILD_VERSION` correctly. Remove from JobList.

- [ ] **Step 1: Remove the badge from the pretitle**

In `src/components/JobList.jsx`, replace lines 107–112 (the entire `<div className="hero-pretitle">…</div>` block) with:

```jsx
          <div className="hero-pretitle">
            {jobs.length === 0
              ? 'NO JOBS YET'
              : `${jobs.length} ${jobs.length === 1 ? 'INVESTIGATION' : 'INVESTIGATIONS'}`}
          </div>
```

- [ ] **Step 2: Drop the now-unused `BUILD_VERSION` import**

In `src/components/JobList.jsx`, remove line 7:

```jsx
import { BUILD_VERSION } from '../version.js';
```

- [ ] **Step 3: Verify lint + look**

Run: `npm run lint`
Expected: PASS (no `'BUILD_VERSION' is defined but never used` warning).

Run: `npm run dev`. JobList hero reads cleanly: `3 INVESTIGATIONS` (no debug badge).

- [ ] **Step 4: Commit**

```bash
git add src/components/JobList.jsx
git commit -m "fix: drop debug-feeling build badge from JobList hero"
```

---

## Task 11: Skeleton states for JobView + PanelView first paint (item F)

**Files:**
- Modify: `src/components/JobView.jsx`
- Modify: `src/components/PanelView.jsx`
- Modify: `src/styles.css`

Both views currently `return null` on cold IDB read, producing 200–300ms blank flashes. Render the AppBar in placeholder mode + 3 ghost rows.

- [ ] **Step 1: Add skeleton CSS**

In `src/styles.css`, append at the bottom:

```css
/* Skeleton placeholders (cold IDB read) */
@keyframes skeleton-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}
.skeleton-shimmer {
  background: linear-gradient(
    90deg,
    var(--bg-3) 0%,
    var(--surface-alt) 50%,
    var(--bg-3) 100%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
  border-radius: 6px;
}
.skeleton-row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  margin-bottom: var(--sp-2);
}
.skeleton-bar { height: 12px; }
.skeleton-bar--title { width: 55%; height: 14px; margin-bottom: 6px; }
.skeleton-bar--sub   { width: 35%; height: 11px; }
.skeleton-circle     { width: 36px; height: 36px; border-radius: 999px; flex: 0 0 auto; }
.skeleton-grow       { flex: 1; min-width: 0; }
@media (prefers-reduced-motion: reduce) {
  .skeleton-shimmer { animation: none; background: var(--bg-3); }
}
```

- [ ] **Step 2: Replace JobView's `return null` with a skeleton**

In `src/components/JobView.jsx`, replace line 117 (`if (!job) return null;`) with:

```jsx
  if (!job) {
    return (
      <>
        <AppBar onBack={() => nav('/')} wordmark="" />
        <main>
          <div className="hero">
            <div className="skeleton-bar skeleton-bar--sub skeleton-shimmer" />
            <div className="skeleton-bar skeleton-shimmer" style={{ width: '60%', height: 28, marginTop: 8 }} />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton-row">
              <div className="skeleton-grow">
                <div className="skeleton-bar skeleton-bar--title skeleton-shimmer" />
                <div className="skeleton-bar skeleton-bar--sub skeleton-shimmer" />
              </div>
              <div className="skeleton-circle skeleton-shimmer" />
            </div>
          ))}
        </main>
      </>
    );
  }
```

- [ ] **Step 3: Replace PanelView's `return null` with a skeleton**

In `src/components/PanelView.jsx`, replace line 49 (`if (!job || !panel) return null;`) with:

```jsx
  if (!job || !panel) {
    return (
      <>
        <AppBar onBack={() => nav(`/job/${jobId}`)} wordmark="" />
        <main>
          <div className="hero">
            <div className="skeleton-bar skeleton-bar--sub skeleton-shimmer" />
            <div className="skeleton-bar skeleton-shimmer" style={{ width: '50%', height: 28, marginTop: 8 }} />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton-row">
              <div className="skeleton-grow">
                <div className="skeleton-bar skeleton-bar--title skeleton-shimmer" />
                <div className="skeleton-bar skeleton-bar--sub skeleton-shimmer" />
              </div>
            </div>
          ))}
        </main>
      </>
    );
  }
```

- [ ] **Step 4: Verify in dev**

Run: `npm run dev`. Cold-load `/job/<id>` and `/job/<id>/panel/<id>` (hard-refresh). Confirm: AppBar appears immediately, three shimmering rows fill the viewport during IDB load, replaced by real content within ~300ms. No jarring blank flash.

- [ ] **Step 5: Commit**

```bash
git add src/components/JobView.jsx src/components/PanelView.jsx src/styles.css
git commit -m "feat: skeleton loading states for JobView + PanelView cold paint"
```

---

## Task 12: JobView panel names use `<Marquee>` (item G)

**Files:**
- Modify: `src/components/JobView.jsx`

`JobView.jsx:191` renders `<div className="title">{p.name}</div>` plain. JobList wraps job names in `<Marquee>` (`JobList.jsx:172`). Match the behavior so long panel names scroll.

- [ ] **Step 1: Import Marquee**

In `src/components/JobView.jsx`, add to the imports near line 17:

```jsx
import Marquee from './Marquee.jsx';
```

- [ ] **Step 2: Wrap the panel name**

Replace `JobView.jsx:191` from:

```jsx
                <div className="title">{p.name}</div>
```

to:

```jsx
                <div className="title"><Marquee>{p.name}</Marquee></div>
```

- [ ] **Step 3: Verify in dev**

Run: `npm run dev`. Add a panel named `MCC-101 — Process Building West Wing` and confirm the title scrolls smoothly within the row, matching the JobList behavior.

- [ ] **Step 4: Commit**

```bash
git add src/components/JobView.jsx
git commit -m "fix: JobView panel names marquee like JobList job names"
```

---

## Task 13: Trim the duplicate-panel apology toast (item H)

**Files:**
- Modify: `src/components/JobView.jsx`

The toast "Duplicated as "X" (rows copied, photos not)" reads as a developer apology. Keep just `Duplicated as "X"`. Per the spec, NOT implementing photo copy.

- [ ] **Step 1: Confirm Task 1 already trimmed the toast**

If Task 1 was applied, the toast in `confirmDuplicate` should already read `Duplicated as "X"` without the parenthetical. Verify with:

Run: `grep -n "rows copied, photos not" /Users/nickcason/DevSpace/Work/e-OIC/src/components/JobView.jsx`
Expected: no matches.

If the parenthetical IS still there (Task 1 was implemented differently), trim it now: in `JobView.jsx`, find the line `toast.show(\`Duplicated as "${...}" (rows copied, photos not)\`);` and replace with `toast.show(\`Duplicated as "${dup.name}"\`);`.

- [ ] **Step 2: Commit (only if Step 1 needed an edit)**

If Step 1 made no changes, skip this commit; this task is already covered by Task 1.

```bash
git add src/components/JobView.jsx
git commit -m "fix: trim duplicate-panel toast apology"
```

---

## Task 14: InstallBanner iOS modal — drop the "Sorry!" (item I)

**Files:**
- Modify: `src/components/InstallBanner.jsx`

- [ ] **Step 1: Replace the apology line**

In `src/components/InstallBanner.jsx`, replace lines 62–64 (the `<div className="install-ios-note">…</div>`) with:

```jsx
            <div className="install-ios-note">
              On iPhone, installs happen from the Share sheet — three quick taps and you&apos;re done.
            </div>
```

- [ ] **Step 2: Verify in dev (Safari iOS or DevTools iOS UA)**

In Chrome DevTools → Device Mode → iPhone, set UA to iOS Safari. Trigger the InstallBanner → tap Install → confirm modal copy reads the new sentence, no "Sorry!".

- [ ] **Step 3: Commit**

```bash
git add src/components/InstallBanner.jsx
git commit -m "fix: InstallBanner iOS modal copy — confident, not apologetic"
```

---

## Task 15: InstallBanner sub-text contrast on amber (item J)

**Files:**
- Modify: `src/styles.css`

`.install-banner-sub` at line 1757 has `opacity: 0.9` on a `--energy` (amber) background. Borderline outdoors. Bump to 0.95.

- [ ] **Step 1: Bump opacity**

In `src/styles.css`, replace line 1757:

```css
.install-banner-sub { font-size: 12px; opacity: 0.9; line-height: 1.35; margin-top: 2px; }
```

with:

```css
.install-banner-sub { font-size: 12px; opacity: 0.95; line-height: 1.35; margin-top: 2px; }
```

- [ ] **Step 2: Verify**

Run: `npm run dev`. Trigger InstallBanner; sub-text is more legible against amber. Visual sanity only.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "style: bump InstallBanner sub-text opacity for outdoor legibility"
```

---

## Task 16: GeoPrompt copy — drop the jargon (item K)

**Files:**
- Modify: `src/components/App.jsx`

- [ ] **Step 1: Replace the jargon line**

In `src/components/App.jsx`, replace line 104:

```jsx
          <li>The JPEG&apos;s EXIF metadata (visible to mapping apps)</li>
```

with:

```jsx
          <li>The JPEG&apos;s EXIF metadata (embedded into the photo file itself)</li>
```

- [ ] **Step 2: Verify in dev**

Run: `npm run dev`. Clear `localStorage`/IDB to retrigger first-run GeoPrompt, or trigger via incognito. Confirm bullet 2 reads the new copy.

- [ ] **Step 3: Commit**

```bash
git add src/components/App.jsx
git commit -m "fix: GeoPrompt drops 'visible to mapping apps' jargon"
```

---

## Task 17: PanelModal helper — drop "13 sheets" jargon + bump version (item L)

**Files:**
- Modify: `src/components/JobView.jsx`
- Modify: `src/version.json`
- Modify: `public/service-worker.js`

Final task — also bumps `BUILD_VERSION` to `v36` so the demo build is identifiable.

- [ ] **Step 1: Replace the helper text**

In `src/components/JobView.jsx`, replace lines 290–294 (the `{!panel && (<p>…</p>)}` block inside `PanelModal`) with:

```jsx
        {!panel && (
          <p style={{ color: 'var(--text-dim)', marginTop: 0, fontSize: 13 }}>
            One panel per cabinet. Photos and notes live inside.
          </p>
        )}
```

- [ ] **Step 2: Bump version.json**

Run: `cat /Users/nickcason/DevSpace/Work/e-OIC/version.json`

Update the `"version"` field (or whatever key is present — typically `"version": "v35"`) to `"v36"`. Use the Edit tool with the exact current value.

- [ ] **Step 3: Bump service-worker version**

Run: `grep -n "VERSION" /Users/nickcason/DevSpace/Work/e-OIC/public/service-worker.js`

Update the matching `const VERSION = 'v35';` line to `const VERSION = 'v36';`.

- [ ] **Step 4: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: lint PASS (only pre-existing warnings), build PASS, output in `dist/`.

- [ ] **Step 5: Verify in dev**

Run: `npm run dev`. From JobView → FAB → "New Panel" → confirm helper reads `One panel per cabinet. Photos and notes live inside.` Settings footer reads `e-OIC · v36`.

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: PASS for all unit and e2e tests.

- [ ] **Step 7: Commit**

```bash
git add src/components/JobView.jsx src/version.json public/service-worker.js
git commit -m "chore: PanelModal helper copy + bump to v36 for demo build"
```

---

## Self-review checklist (run after Task 17)

- [ ] Demo path manual run-through (steps 1–8 of the demo journey in the spec) on a phone or DevTools 375px viewport.
- [ ] No `prompt(` or `confirm(` left in the demo path: `grep -n "prompt(\|confirm(" src/components/JobView.jsx src/components/SettingsView.jsx` returns no demo-path matches.
- [ ] No `(?)` literal in DiffView fallback: `grep -n "(?)" src/components/DiffView.jsx` returns no matches.
- [ ] No raw `✎ ⧉ ✕ ⬇ ↻ ⛓` glyphs in JobView: `grep -nP "[✎⧉✕⬇↻⛓]" src/components/JobView.jsx` returns no matches.
- [ ] No `APP_VERSION` references: `grep -rn "APP_VERSION" src/` returns no matches.
- [ ] All 17 spec items have a corresponding committed task (1, 2, 3, 4, 5, A, B, C, D, E, F, G, H, I, J, K, L → Tasks 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17).
- [ ] `npm run lint && npm test && npm run build` all PASS.
