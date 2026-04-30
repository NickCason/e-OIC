# Metrics & Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface per-job and per-panel completion percentages throughout the e-OIC PWA, and bring the xlsx Checklist sheet into the app as a first-class screen with auto-derived sheet tasks, manually-checkable artifact tasks, and user-added custom tasks that round-trip into the exported xlsx.

**Architecture:** A new IndexedDB store `checklistState` holds per-job manual-task and custom-task state. A new pure-functions module `src/lib/metrics.js` derives panel percentages, the merged checklist task list, and the job percentage from existing rows/photos plus the new store. New `<PercentRing>` and `<PercentBar>` components are reused across JobList, JobView, PanelView, and a new `<ChecklistView>` mounted at `/job/:id/checklist`. The exporter is extended to honor manual-checked state and to append custom tasks to the existing Checklist worksheet.

**Tech Stack:** React 18, IndexedDB via `idb`, ExcelJS for xlsx export, lucide-react. No new dependencies.

**Testing approach:** The project has no automated test suite. Each task includes a manual smoke test the implementer must perform with `npm run dev` (Vite) on a mobile-width viewport. "Verify the test fails" steps describe what should be broken/missing before the change.

---

## File Map

**Create:**
- `src/lib/metrics.js` — pure derivation functions (no React)
- `src/components/PercentRing.jsx` — reusable SVG ring
- `src/components/PercentBar.jsx` — reusable horizontal bar
- `src/components/ChecklistView.jsx` — full screen at `/job/:id/checklist`
- `src/components/ChecklistTaskRow.jsx` — single task row

**Modify:**
- `src/db.js` — bump DB version to 3, create `checklistState` store, add CRUD helpers, include in backup/restore
- `src/lib/metrics.js` (created above)
- `src/App.jsx` — add `/job/:id/checklist` route
- `src/components/JobList.jsx` — replace monogram tile with `<PercentRing>`, add `% complete` stat tile
- `src/components/JobView.jsx` — update hero pretitle, add Checklist CTA card, replace panel-card chevron with `<PercentRing>`
- `src/components/PanelView.jsx` — update hero pretitle to include panel percent
- `src/exporter.js` — honor manual-checked state via slug lookup, append custom tasks at end of Checklist worksheet
- `src/version.js` — bump `BUILD_VERSION` to `'v19'`
- `public/service-worker.js` — bump `VERSION` to `'v19'`
- `src/styles.css` — add styles for `.percent-ring`, `.percent-bar`, `.checklist-cta`, `.checklist-section`, `.checklist-task-row`, `.checklist-add-input`

---

### Task 1: Bump IndexedDB schema and add `checklistState` store

**Files:**
- Modify: `src/db.js:1-60`

- [ ] **Step 1: Verify current state**

Run: `grep -n "DB_VERSION\|checklistState" /Users/nickcason/DevSpace/Work/e-OIC/src/db.js`
Expected: `DB_VERSION = 2` is the only match — no `checklistState` references.

- [ ] **Step 2: Bump version and add upgrade branch**

Replace the `DB_VERSION` constant and extend the `upgrade` callback. In `src/db.js`:

```js
const DB_VERSION = 3;
```

Add this branch inside the `upgrade(db, oldVersion, newVersion, tx) { ... }` body, after the existing `if (oldVersion < 2) { ... }` block:

```js
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains('checklistState')) {
            db.createObjectStore('checklistState', { keyPath: 'jobId' });
          }
        }
```

- [ ] **Step 3: Smoke test the upgrade**

Run: `cd /Users/nickcason/DevSpace/Work/e-OIC && npm run dev`
Open the local URL in a browser, open DevTools → Application → IndexedDB → `onsite-investigation`, verify the `checklistState` object store exists alongside the existing stores (jobs, panels, rows, photos, sheetNotes, settings). No errors in console.

- [ ] **Step 4: Commit**

```bash
cd /Users/nickcason/DevSpace/Work/e-OIC
git add src/db.js
git commit -m "feat(db): add checklistState store (schema v3)"
```

---

### Task 2: Add `checklistState` CRUD helpers and slug utility to `db.js`

**Files:**
- Modify: `src/db.js` (append a new section near the bottom, before the Backup/Restore section)

- [ ] **Step 1: Add helpers**

Insert this section in `src/db.js` immediately before the `// ======= Backup / Restore =======` comment block:

```js
// ======= Checklist State =======

// Slug used as the stable taskId for manual tasks. Mirrors the canonical
// label list defined in src/lib/metrics.js — keep them in sync.
export function slugifyTaskLabel(label) {
  return String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const DEFAULT_CHECKLIST_STATE = () => ({
  manualTasks: {},
  customTasks: [],
});

export async function getChecklistState(jobId) {
  const db = await getDB();
  const rec = await db.get('checklistState', jobId);
  if (!rec) return { jobId, ...DEFAULT_CHECKLIST_STATE() };
  return {
    jobId,
    manualTasks: rec.manualTasks || {},
    customTasks: Array.isArray(rec.customTasks) ? rec.customTasks : [],
  };
}

export async function setChecklistState(jobId, state) {
  const db = await getDB();
  await db.put('checklistState', {
    jobId,
    manualTasks: state.manualTasks || {},
    customTasks: state.customTasks || [],
  });
}

export async function setManualTaskCompleted(jobId, taskId, completed) {
  const state = await getChecklistState(jobId);
  state.manualTasks = { ...state.manualTasks, [taskId]: !!completed };
  await setChecklistState(jobId, state);
  return state;
}

export async function addCustomTask(jobId, label) {
  const trimmed = String(label || '').trim();
  if (!trimmed) throw new Error('Task label is required');
  const state = await getChecklistState(jobId);
  const task = {
    id: (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    label: trimmed,
    completed: false,
    createdAt: Date.now(),
  };
  state.customTasks = [...state.customTasks, task];
  await setChecklistState(jobId, state);
  return task;
}

export async function renameCustomTask(jobId, taskId, label) {
  const trimmed = String(label || '').trim();
  if (!trimmed) throw new Error('Task label is required');
  const state = await getChecklistState(jobId);
  state.customTasks = state.customTasks.map((t) =>
    t.id === taskId ? { ...t, label: trimmed } : t
  );
  await setChecklistState(jobId, state);
}

export async function setCustomTaskCompleted(jobId, taskId, completed) {
  const state = await getChecklistState(jobId);
  state.customTasks = state.customTasks.map((t) =>
    t.id === taskId ? { ...t, completed: !!completed } : t
  );
  await setChecklistState(jobId, state);
}

export async function deleteCustomTask(jobId, taskId) {
  const state = await getChecklistState(jobId);
  state.customTasks = state.customTasks.filter((t) => t.id !== taskId);
  await setChecklistState(jobId, state);
}
```

- [ ] **Step 2: Wire into job deletion**

Find the existing `deleteJob` function in `src/db.js`. It currently looks like:

```js
export async function deleteJob(id) {
  const db = await getDB();
  const panels = await db.getAllFromIndex('panels', 'jobId', id);
  for (const p of panels) await deletePanel(p.id);
  await db.delete('jobs', id);
}
```

Replace it with:

```js
export async function deleteJob(id) {
  const db = await getDB();
  const panels = await db.getAllFromIndex('panels', 'jobId', id);
  for (const p of panels) await deletePanel(p.id);
  await db.delete('checklistState', id);
  await db.delete('jobs', id);
}
```

- [ ] **Step 3: Smoke test**

In the running dev app, open DevTools console:

```js
const m = await import('/src/db.js');
const t = await m.addCustomTask('seed-job-cooker-line', 'Test custom');
console.log('added:', t);
console.log('state:', await m.getChecklistState('seed-job-cooker-line'));
await m.setCustomTaskCompleted('seed-job-cooker-line', t.id, true);
console.log('after toggle:', await m.getChecklistState('seed-job-cooker-line'));
await m.deleteCustomTask('seed-job-cooker-line', t.id);
console.log('after delete:', await m.getChecklistState('seed-job-cooker-line'));
await m.setManualTaskCompleted('seed-job-cooker-line', 'plc-program-backup', true);
console.log('manual:', await m.getChecklistState('seed-job-cooker-line'));
```

Expected: each call logs the updated state without errors. The seed job is the sample preloaded on first launch.

- [ ] **Step 4: Commit**

```bash
cd /Users/nickcason/DevSpace/Work/e-OIC
git add src/db.js
git commit -m "feat(db): add checklistState CRUD helpers and slug utility"
```

---

### Task 3: Include `checklistState` in backup/restore JSON

**Files:**
- Modify: `src/db.js` (the `exportAllJSON`, `exportJobJSON`, and `importJSON` functions)

- [ ] **Step 1: Update `exportAllJSON`**

In `src/db.js`, replace the body of `exportAllJSON` with:

```js
export async function exportAllJSON() {
  const db = await getDB();
  const jobs = await db.getAll('jobs');
  const panels = await db.getAll('panels');
  const rows = await db.getAll('rows');
  const sheetNotes = await db.getAll('sheetNotes');
  const checklistState = await db.getAll('checklistState');
  const photoRecs = await db.getAll('photos');
  const photos = [];
  for (const p of photoRecs) {
    photos.push({ ...p, blob: await blobToBase64(p.blob) });
  }
  return {
    backupVersion: BACKUP_VERSION,
    exportedAt: Date.now(),
    jobs, panels, rows, sheetNotes, checklistState, photos,
  };
}
```

- [ ] **Step 2: Update `exportJobJSON`**

Replace the body of `exportJobJSON` with:

```js
export async function exportJobJSON(jobId) {
  const db = await getDB();
  const job = await db.get('jobs', jobId);
  if (!job) throw new Error('Job not found');
  const panels = await db.getAllFromIndex('panels', 'jobId', jobId);
  const rowsAll = [];
  const sheetNotesAll = [];
  const photosAll = [];
  for (const p of panels) {
    const r = await db.getAllFromIndex('rows', 'panelId', p.id);
    rowsAll.push(...r);
    const n = await db.getAllFromIndex('sheetNotes', 'panelId', p.id);
    sheetNotesAll.push(...n);
    const ph = await db.getAllFromIndex('photos', 'panelId', p.id);
    for (const photo of ph) {
      photosAll.push({ ...photo, blob: await blobToBase64(photo.blob) });
    }
  }
  const clRec = await db.get('checklistState', jobId);
  const checklistState = clRec ? [clRec] : [];
  return {
    backupVersion: BACKUP_VERSION,
    exportedAt: Date.now(),
    jobs: [job],
    panels,
    rows: rowsAll,
    sheetNotes: sheetNotesAll,
    checklistState,
    photos: photosAll,
  };
}
```

- [ ] **Step 3: Update `importJSON`**

Find the existing `importJSON` function. Update the transaction's store list and add a checklist-restore loop. Replace:

```js
  const tx = db.transaction(['jobs', 'panels', 'rows', 'sheetNotes', 'photos'], 'readwrite');
```

with:

```js
  const tx = db.transaction(
    ['jobs', 'panels', 'rows', 'sheetNotes', 'checklistState', 'photos'],
    'readwrite'
  );
```

Then, immediately after the `for (const n of snapshot.sheetNotes || []) { ... }` loop and before the `for (const photo of snapshot.photos)` loop, insert:

```js
  for (const cl of snapshot.checklistState || []) {
    const existing = await tx.objectStore('checklistState').get(cl.jobId);
    if (!existing || mode === 'replace') await tx.objectStore('checklistState').put(cl);
  }
```

Also update the `replace` branch at the top of `importJSON`. Find:

```js
  if (mode === 'replace') {
    for (const j of snapshot.jobs) {
      const existing = await db.get('jobs', j.id);
      if (existing) await deleteJob(j.id);
    }
  }
```

Leave it as-is — `deleteJob` (updated in Task 2) already deletes the matching `checklistState` record.

- [ ] **Step 4: Smoke test**

In dev app: Settings → Backup → download a backup file, open it in a text editor, confirm the JSON has a top-level `checklistState` array. Then Settings → Restore → load the same file, confirm no errors and any custom tasks/manual checks survive.

- [ ] **Step 5: Commit**

```bash
cd /Users/nickcason/DevSpace/Work/e-OIC
git add src/db.js
git commit -m "feat(db): include checklistState in backup/restore"
```

---

### Task 4: Create `src/lib/metrics.js`

**Files:**
- Create: `src/lib/metrics.js`

- [ ] **Step 1: Write the module**

Create `src/lib/metrics.js`:

```js
// metrics.js — pure derivations for panel/job completion and the merged
// checklist task list. Uses IndexedDB through db.js but never touches React.

import schemaMap from '../schema.json';
import {
  listPanels, listRows, listAllRows, listPanelPhotos, getChecklistState,
  slugifyTaskLabel,
} from '../db.js';

export const SHEET_ORDER = [
  'Panels', 'Power', 'PLC Racks', 'PLC Slots', 'Fieldbus IO',
  'Network Devices', 'HMIs', 'Ethernet Switches', 'Drive Parameters',
  'Conv. Speeds', 'Safety Circuit', 'Safety Devices', 'Peer to Peer Comms',
];

// Canonical Checklist task list. Order here drives UI render order.
// Section keys must be one of: 'Backups', 'Documentation', 'Field Work',
// 'Data Sheets'. Custom tasks are appended at runtime in their own section.
//
// `kind: 'auto'` ⇒ taskId-keyed lookup against the panels' rows
// (auto-completed when ANY panel has rows in `sheet`).
// `kind: 'manual'` ⇒ user toggles via UI; persisted in checklistState.manualTasks.
//
// IDs MUST match `slugifyTaskLabel(label)` so the exporter can recover them
// from the xlsx Checklist sheet without storing IDs in the workbook.
export const CHECKLIST_TEMPLATE = [
  // Backups
  { id: 'plc-program-backup', section: 'Backups', label: 'PLC Program Backup', kind: 'manual' },
  { id: 'hmi-program-backup', section: 'Backups', label: 'HMI Program Backup', kind: 'manual' },
  { id: 'scada-backup', section: 'Backups', label: 'SCADA Backup', kind: 'manual' },
  { id: 'rsnetworx-backup-cnet-dnet', section: 'Backups', label: 'RSNetworx Backup (CNet, DNet)', kind: 'manual' },
  { id: 'dh-rio-backup', section: 'Backups', label: 'DH+/RIO Backup', kind: 'manual' },
  // Documentation
  { id: 'existing-plant-drawings', section: 'Documentation', label: 'Existing Plant Drawings', kind: 'manual' },
  { id: 'existing-network-diagram', section: 'Documentation', label: 'Existing Network Diagram', kind: 'manual' },
  { id: 'process-flow-diagram', section: 'Documentation', label: 'Process Flow Diagram', kind: 'manual' },
  { id: 'io-list', section: 'Documentation', label: 'IO List', kind: 'manual' },
  { id: 'device-list', section: 'Documentation', label: 'Device List', kind: 'manual' },
  // Field Work
  { id: 'process-investigation', section: 'Field Work', label: 'Process Investigation', kind: 'manual' },
  { id: 'operator-interviews', section: 'Field Work', label: 'Operator Interviews', kind: 'manual' },
  // Data Sheets — auto when matched to a SHEET_ORDER entry, manual otherwise
  { id: 'panel-sheet', section: 'Data Sheets', label: 'Panel Sheet', kind: 'auto', sheet: 'Panels' },
  { id: 'power-sheet', section: 'Data Sheets', label: 'Power Sheet', kind: 'auto', sheet: 'Power' },
  { id: 'plc-racks-sheet', section: 'Data Sheets', label: 'PLC Racks Sheet', kind: 'auto', sheet: 'PLC Racks' },
  { id: 'plc-slots-sheet', section: 'Data Sheets', label: 'PLC Slots sheet', kind: 'auto', sheet: 'PLC Slots' },
  { id: 'hmis-sheet', section: 'Data Sheets', label: 'HMIs Sheet', kind: 'auto', sheet: 'HMIs' },
  { id: 'ethernet-switches-sheet', section: 'Data Sheets', label: 'Ethernet Switches Sheet', kind: 'auto', sheet: 'Ethernet Switches' },
  { id: 'switch-ports-sheet', section: 'Data Sheets', label: 'Switch Ports Sheet', kind: 'manual' },
  { id: 'fieldbus-io-sheet', section: 'Data Sheets', label: 'Fieldbus IO Sheet', kind: 'auto', sheet: 'Fieldbus IO' },
  { id: 'devices-sheet', section: 'Data Sheets', label: 'Devices Sheet', kind: 'auto', sheet: 'Network Devices' },
  { id: 'conv-speeds-sheet', section: 'Data Sheets', label: 'Conv. Speeds Sheet', kind: 'auto', sheet: 'Conv. Speeds' },
  { id: 'safety-circuit-sheet', section: 'Data Sheets', label: 'Safety Circuit Sheet', kind: 'auto', sheet: 'Safety Circuit' },
  { id: 'safety-devices-sheet', section: 'Data Sheets', label: 'Safety Devices Sheet', kind: 'auto', sheet: 'Safety Devices' },
  { id: 'peer-to-peer-comms', section: 'Data Sheets', label: 'Peer to Peer Comms', kind: 'auto', sheet: 'Peer to Peer Comms' },
];

export const CHECKLIST_SECTIONS = ['Backups', 'Documentation', 'Field Work', 'Data Sheets', 'Custom'];

// Sheet-status weights for the panel percentage.
const STATUS_WEIGHT = { empty: 0, partial: 0.5, complete: 1 };

function sheetStatusFromRowsPhotos(sheet, rowCount, photoCountForSheet) {
  if (rowCount <= 0) return 'empty';
  const requiredItems = (schemaMap[sheet]?.photo_checklist_columns || []).length;
  if (requiredItems === 0 || photoCountForSheet >= requiredItems) return 'complete';
  return 'partial';
}

export async function getPanelProgress(panelId) {
  const allPhotos = await listPanelPhotos(panelId);
  const sheetStatuses = {};
  let total = 0;
  for (const sheet of SHEET_ORDER) {
    const rows = await listRows(panelId, sheet);
    const sheetPhotos = allPhotos.filter((ph) => ph.sheet === sheet);
    const status = sheetStatusFromRowsPhotos(sheet, rows.length, sheetPhotos.length);
    sheetStatuses[sheet] = status;
    total += STATUS_WEIGHT[status];
  }
  const percent = Math.round((total / SHEET_ORDER.length) * 100);
  return { percent, sheetStatuses };
}

// Returns the merged task list for the job. Auto tasks read panel rows; manual
// tasks read checklistState.manualTasks; custom tasks come from
// checklistState.customTasks.
export async function getJobChecklist(jobId) {
  const state = await getChecklistState(jobId);
  const panels = await listPanels(jobId);
  const filledSheets = new Set();
  for (const p of panels) {
    const rs = await listAllRows(p.id);
    for (const r of rs) filledSheets.add(r.sheet);
  }

  const tasks = CHECKLIST_TEMPLATE.map((t) => {
    if (t.kind === 'auto') {
      const completed = !!t.sheet && filledSheets.has(t.sheet);
      return {
        id: t.id,
        section: t.section,
        label: t.label,
        kind: 'auto',
        sheet: t.sheet,
        required: true,
        completed,
        locked: true,
      };
    }
    return {
      id: t.id,
      section: t.section,
      label: t.label,
      kind: 'manual',
      required: true,
      completed: !!state.manualTasks[t.id],
      locked: false,
    };
  });

  for (const c of state.customTasks) {
    tasks.push({
      id: c.id,
      section: 'Custom',
      label: c.label,
      kind: 'custom',
      required: true,
      completed: !!c.completed,
      locked: false,
      createdAt: c.createdAt,
    });
  }

  return tasks;
}

export async function getJobPercent(jobId) {
  const tasks = await getJobChecklist(jobId);
  if (tasks.length === 0) return 0;
  const checked = tasks.filter((t) => t.completed).length;
  return Math.round((checked / tasks.length) * 100);
}

export async function getJobAggregateStats(jobId) {
  const panels = await listPanels(jobId);
  let photoCount = 0;
  for (const p of panels) {
    const photos = await listPanelPhotos(p.id);
    photoCount += photos.length;
  }
  const jobPercent = await getJobPercent(jobId);
  return { panelCount: panels.length, photoCount, jobPercent };
}

// Helpers for the exporter — exposed so it doesn't have to recompute the
// auto-checked set or the slug logic itself.
export { slugifyTaskLabel };
```

- [ ] **Step 2: Smoke test in browser console**

```js
const m = await import('/src/lib/metrics.js');
console.log(await m.getPanelProgress('seed-panel-mcc-plc-1'));
console.log(await m.getJobChecklist('seed-job-cooker-line'));
console.log('job %:', await m.getJobPercent('seed-job-cooker-line'));
console.log(await m.getJobAggregateStats('seed-job-cooker-line'));
```

Expected: panel progress percent 0–100, sheetStatuses for all 13 sheets. Job checklist returns ~25 tasks, with auto tasks reflecting the seed job's sheets.

- [ ] **Step 3: Commit**

```bash
cd /Users/nickcason/DevSpace/Work/e-OIC
git add src/lib/metrics.js
git commit -m "feat(metrics): add panel + job completion derivations"
```

---

### Task 5: Create `<PercentRing>` component

**Files:**
- Create: `src/components/PercentRing.jsx`

- [ ] **Step 1: Write the component**

Create `src/components/PercentRing.jsx`:

```jsx
import React from 'react';

// Reusable SVG percentage ring. Honors prefers-reduced-motion (no transition).
//
// Props:
//   percent      0..100 (clamped)
//   size         px (outer diameter)
//   stroke       px (arc thickness)
//   trackColor   CSS color for the unfilled track (defaults to var(--bg-3))
//   arcColor     CSS color for the filled arc (defaults to var(--accent))
//   accentColor  CSS color used when percent === 100 (defaults to var(--energy))
//   children     centered content (e.g. monogram letters or "%" text)
//   className    extra class on the root <div>
//   ariaLabel    a11y label for screen readers
export default function PercentRing({
  percent = 0,
  size = 56,
  stroke = 5,
  trackColor = 'var(--bg-3)',
  arcColor = 'var(--accent)',
  accentColor = 'var(--energy)',
  children,
  className = '',
  ariaLabel,
}) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);
  const reduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const stroked = pct === 100 ? accentColor : arcColor;
  return (
    <div
      className={`percent-ring ${className}`.trim()}
      style={{ width: size, height: size }}
      role="img"
      aria-label={ariaLabel || `${pct} percent complete`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={stroked}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={reduced ? undefined : { transition: 'stroke-dashoffset 280ms ease, stroke 200ms ease' }}
        />
      </svg>
      {children != null && <div className="percent-ring__center">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Add styles**

Append to `src/styles.css` (in the components section, near other reusable component styles like `.tabs` or `.search-wrap`):

```css
.percent-ring {
  position: relative;
  display: inline-block;
  flex-shrink: 0;
}
.percent-ring svg { display: block; }
.percent-ring__center {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--text-strong);
  pointer-events: none;
  text-align: center;
  line-height: 1;
}
```

- [ ] **Step 3: Visual smoke test**

Temporarily import and render in `JobList.jsx` near the top of `<main>`:

```jsx
<PercentRing percent={42} size={56} stroke={5}>AB</PercentRing>
<PercentRing percent={100} size={56} stroke={5}>100</PercentRing>
```

Run `npm run dev`, confirm both render — one with navy arc and "AB" monogram, one with red-orange arc (energy color) and "100" text. Then revert the temporary insertion.

- [ ] **Step 4: Commit**

```bash
cd /Users/nickcason/DevSpace/Work/e-OIC
git add src/components/PercentRing.jsx src/styles.css
git commit -m "feat(ui): add reusable PercentRing component"
```

---

### Task 6: Create `<PercentBar>` component

**Files:**
- Create: `src/components/PercentBar.jsx`

- [ ] **Step 1: Write the component**

Create `src/components/PercentBar.jsx`:

```jsx
import React from 'react';

// Reusable horizontal percentage bar. Honors prefers-reduced-motion.
//
// Props:
//   percent      0..100 (clamped)
//   height       px
//   trackColor   CSS color for the unfilled track (defaults to var(--bg-3))
//   fillColor    CSS color for the fill (defaults to var(--accent))
//   accentColor  CSS color used when percent === 100 (defaults to var(--energy))
//   className    extra class on the root <div>
//   ariaLabel    a11y label for screen readers
export default function PercentBar({
  percent = 0,
  height = 6,
  trackColor = 'var(--bg-3)',
  fillColor = 'var(--accent)',
  accentColor = 'var(--energy)',
  className = '',
  ariaLabel,
}) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const reduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return (
    <div
      className={`percent-bar ${className}`.trim()}
      style={{ background: trackColor, height, borderRadius: height }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={ariaLabel || `${pct} percent complete`}
    >
      <div
        className="percent-bar__fill"
        style={{
          width: `${pct}%`,
          height: '100%',
          background: pct === 100 ? accentColor : fillColor,
          borderRadius: height,
          transition: reduced ? undefined : 'width 280ms ease, background 200ms ease',
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add styles**

Append to `src/styles.css`:

```css
.percent-bar {
  width: 100%;
  overflow: hidden;
}
.percent-bar__fill {
  display: block;
}
```

- [ ] **Step 3: Visual smoke test**

Temporarily render in `JobList.jsx` near the top of `<main>`:

```jsx
<PercentBar percent={62} height={6} />
<PercentBar percent={100} height={8} />
```

Confirm both render correctly — first navy fill at 62% width, second energy-color fill full width. Revert.

- [ ] **Step 4: Commit**

```bash
cd /Users/nickcason/DevSpace/Work/e-OIC
git add src/components/PercentBar.jsx src/styles.css
git commit -m "feat(ui): add reusable PercentBar component"
```

---

### Task 7: Update `JobList.jsx` — replace monogram tile with PercentRing, add `% complete` stat tile

**Files:**
- Modify: `src/components/JobList.jsx`

- [ ] **Step 1: Add imports**

In `src/components/JobList.jsx`, change the imports section to add the metrics module and PercentRing. Replace:

```js
import { listJobs, createJob, updateJob, deleteJob, getJobSizeEstimate, importJSON, exportJobJSON } from '../db.js';
```

with:

```js
import { listJobs, createJob, updateJob, deleteJob, getJobSizeEstimate, importJSON, exportJobJSON } from '../db.js';
import { getJobPercent } from '../lib/metrics.js';
import PercentRing from './PercentRing.jsx';
```

- [ ] **Step 2: Track per-job percent in component state**

Replace the `refresh` function in `JobList.jsx` with:

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

Add state: just below `const [stats, setStats] = useState({});`, insert:

```js
  const [percents, setPercents] = useState({});
```

- [ ] **Step 3: Add `% complete` stat tile**

Find the existing stat-row block:

```jsx
            <div className="stat-row">
              <div className="stat-tile">
                <div className="stat-label">Active</div>
                <div className="stat-val">{totals.inProgress}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Panels</div>
                <div className="stat-val">{totals.panels}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Photos</div>
                <div className="stat-val">{totals.photos}</div>
              </div>
            </div>
```

Compute the average percent across jobs in `totals` — modify the `useMemo` for `totals`:

```js
  const totals = useMemo(() => {
    let panels = 0, photos = 0, inProgress = 0, percentSum = 0, percentCount = 0;
    for (const j of jobs) {
      const s = stats[j.id];
      if (s) {
        panels += s.panels || 0;
        photos += s.photos || 0;
        if ((s.panels || 0) > 0) inProgress += 1;
      }
      if (percents[j.id] != null) {
        percentSum += percents[j.id];
        percentCount += 1;
      }
    }
    const avgPercent = percentCount > 0 ? Math.round(percentSum / percentCount) : 0;
    return { panels, photos, inProgress, total: jobs.length, avgPercent };
  }, [jobs, stats, percents]);
```

Replace the stat-row block with one that has four tiles:

```jsx
            <div className="stat-row stat-row--four">
              <div className="stat-tile">
                <div className="stat-label">Active</div>
                <div className="stat-val">{totals.inProgress}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Panels</div>
                <div className="stat-val">{totals.panels}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Photos</div>
                <div className="stat-val">{totals.photos}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">% Complete</div>
                <div className="stat-val">{totals.avgPercent}%</div>
              </div>
            </div>
```

- [ ] **Step 4: Replace monogram tile with PercentRing**

Find the job-card render block. The current `<div className="job-monogram">{monogram(j.name)}</div>` line should be replaced with:

```jsx
              <PercentRing
                percent={percents[j.id] ?? 0}
                size={56}
                stroke={5}
                className="job-monogram-ring"
                ariaLabel={`${percents[j.id] ?? 0}% complete`}
              >
                {monogram(j.name)}
              </PercentRing>
```

- [ ] **Step 5: Add CSS for the ring placement and four-tile row**

Append to `src/styles.css`:

```css
.job-monogram-ring {
  margin-right: var(--sp-3);
}
.job-monogram-ring .percent-ring__center {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 16px;
  color: var(--text-strong);
}
.stat-row--four { grid-template-columns: repeat(4, 1fr); }
.stat-row--four .stat-val { font-size: 22px; }
```

If `.stat-row` is currently using flex (search styles for the existing definition), augment instead — find the existing `.stat-row` rule. If it uses `display: grid; grid-template-columns: repeat(3, 1fr);`, the new four-tile rule overrides correctly. If it uses flex, replace `.stat-row--four` with:

```css
.stat-row--four .stat-tile { flex: 1 1 0; }
```

(Run `grep -n "\.stat-row" /Users/nickcason/DevSpace/Work/e-OIC/src/styles.css` to confirm the existing layout before deciding.)

- [ ] **Step 6: Smoke test**

Run `npm run dev`. On the Jobs screen with the seed job present:
- Each job card shows the monogram letters inside a navy ring (or empty ring if percent is 0).
- The four-tile stat row shows Active / Panels / Photos / % Complete.
- Tapping into a job and back updates the ring on return (job list re-mounts).

- [ ] **Step 7: Commit**

```bash
cd /Users/nickcason/DevSpace/Work/e-OIC
git add src/components/JobList.jsx src/styles.css
git commit -m "feat(joblist): show job percentage ring and % complete tile"
```

---

### Task 8: Update `JobView.jsx` — hero pretitle, Checklist CTA card, panel-card percent ring

**Files:**
- Modify: `src/components/JobView.jsx`

- [ ] **Step 1: Add imports**

Replace the import block at the top of `JobView.jsx`. The imports should look like:

```jsx
import React, { useState, useEffect } from 'react';
import {
  getJob, listPanels, createPanel, updatePanel, deletePanel, duplicatePanel,
  listAllRows, listPanelPhotos, exportJobJSON, importJSON, updateJob,
} from '../db.js';
import { getPanelProgress, getJobAggregateStats } from '../lib/metrics.js';
import { nav } from '../App.jsx';
import { toast } from '../lib/toast.js';
import ExportDialog from './ExportDialog.jsx';
import { fmtRelative } from './JobList.jsx';
import AppBar from './AppBar.jsx';
import Icon from './Icon.jsx';
import EmptyState from './EmptyState.jsx';
import PercentRing from './PercentRing.jsx';
import PercentBar from './PercentBar.jsx';
```

- [ ] **Step 2: Track per-panel and aggregate state**

Inside the component, just after `const [stats, setStats] = useState({});`, add:

```jsx
  const [panelPercents, setPanelPercents] = useState({});
  const [aggregate, setAggregate] = useState({ panelCount: 0, photoCount: 0, jobPercent: 0 });
  const [checklistTotals, setChecklistTotals] = useState({ checked: 0, total: 0 });
```

Also import `getJobChecklist` — change the metrics import to:

```jsx
import { getPanelProgress, getJobAggregateStats, getJobChecklist } from '../lib/metrics.js';
```

- [ ] **Step 3: Compute metrics in `refresh`**

Replace the existing `refresh` function with:

```jsx
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

- [ ] **Step 4: Refresh on window focus**

Just below the existing `useEffect(() => { refresh(); }, [jobId]);`, add:

```jsx
  useEffect(() => {
    const onFocus = () => { refresh(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [jobId]);
```

- [ ] **Step 5: Update hero pretitle**

Replace the existing hero-pretitle block:

```jsx
          <div className="hero-pretitle">
            {totalPanels > 0
              ? `JOB · ${totalPanels} PANEL${totalPanels === 1 ? '' : 'S'}`
              : 'JOB'}
          </div>
```

with:

```jsx
          <div className="hero-pretitle">
            {`JOB · ${aggregate.jobPercent}% COMPLETE · ${aggregate.panelCount} PANEL${aggregate.panelCount === 1 ? '' : 'S'} · ${aggregate.photoCount} PHOTO${aggregate.photoCount === 1 ? '' : 'S'}`}
          </div>
```

- [ ] **Step 6: Add the Checklist CTA card**

Just below the hero `</div>` closing tag and above the `{panels.length === 0 && (` empty state, insert:

```jsx
        <button
          type="button"
          className="checklist-cta"
          onClick={() => nav(`/job/${jobId}/checklist`)}
        >
          <div className="checklist-cta__top">
            <span className="checklist-cta__title">Checklist</span>
            <span className="checklist-cta__count">
              {checklistTotals.checked} / {checklistTotals.total} · {aggregate.jobPercent}%
            </span>
          </div>
          <PercentBar
            percent={aggregate.jobPercent}
            height={6}
            ariaLabel={`Checklist ${aggregate.jobPercent}% complete`}
          />
        </button>
```

- [ ] **Step 7: Replace panel-card chevron with PercentRing**

Find the panel render block:

```jsx
            <div key={p.id} className="list-item" onClick={() => nav(`/job/${jobId}/panel/${p.id}`)}>
              <div className="grow">
                <div className="title">{p.name}</div>
                <div className="subtitle">
                  {s.rows} row{s.rows !== 1 ? 's' : ''} · {s.photos} photo{s.photos !== 1 ? 's' : ''}
                  {p.updatedAt && <> · {fmtRelative(p.updatedAt)}</>}
                </div>
              </div>
              <div className="actions">
                <button className="ghost icon-btn" onClick={(e) => { e.stopPropagation(); setEditing(p); }} aria-label="Edit">✎</button>
                <button className="ghost icon-btn" onClick={(e) => { e.stopPropagation(); onDuplicate(p); }} aria-label="Duplicate">⧉</button>
                <button className="ghost danger icon-btn" onClick={(e) => { e.stopPropagation(); onDelete(p); }} aria-label="Delete">✕</button>
              </div>
            </div>
```

Replace it with a version that includes a small ring before the actions. The complete replacement:

```jsx
            <div key={p.id} className="list-item" onClick={() => nav(`/job/${jobId}/panel/${p.id}`)}>
              <div className="grow">
                <div className="title">{p.name}</div>
                <div className="subtitle">
                  {s.rows} row{s.rows !== 1 ? 's' : ''} · {s.photos} photo{s.photos !== 1 ? 's' : ''}
                  {p.updatedAt && <> · {fmtRelative(p.updatedAt)}</>}
                </div>
              </div>
              <PercentRing
                percent={panelPercents[p.id] ?? 0}
                size={36}
                stroke={3}
                className="panel-row-ring"
                ariaLabel={`${panelPercents[p.id] ?? 0}% complete`}
              >
                <span className="panel-row-ring__pct">{panelPercents[p.id] ?? 0}</span>
              </PercentRing>
              <div className="actions">
                <button className="ghost icon-btn" onClick={(e) => { e.stopPropagation(); setEditing(p); }} aria-label="Edit">✎</button>
                <button className="ghost icon-btn" onClick={(e) => { e.stopPropagation(); onDuplicate(p); }} aria-label="Duplicate">⧉</button>
                <button className="ghost danger icon-btn" onClick={(e) => { e.stopPropagation(); onDelete(p); }} aria-label="Delete">✕</button>
              </div>
            </div>
```

- [ ] **Step 8: Add styles for CTA card and panel-row ring**

Append to `src/styles.css`:

```css
.checklist-cta {
  display: block;
  width: 100%;
  text-align: left;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: var(--sp-3) var(--sp-3);
  margin: 0 var(--sp-3) var(--sp-3) var(--sp-3);
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.checklist-cta:active { transform: scale(0.998); }
.checklist-cta__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--sp-2);
}
.checklist-cta__title {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--text-strong);
  font-size: 16px;
}
.checklist-cta__count {
  color: var(--text-dim);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.panel-row-ring { margin-right: var(--sp-2); }
.panel-row-ring__pct {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-strong);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 9: Smoke test**

Run `npm run dev`. With the seed job:
- JobView hero pretitle reads `JOB · NN% COMPLETE · 3 PANELS · NN PHOTOS`
- Checklist CTA card appears between hero and panels list with a percentage bar
- Each panel card has a small ring on the right showing its percent
- Tapping the Checklist CTA navigates to `#/job/<id>/checklist` (target screen doesn't exist yet — that's Task 11. For now, the URL will change but the route falls through to JobList; that's expected.)

- [ ] **Step 10: Commit**

```bash
cd /Users/nickcason/DevSpace/Work/e-OIC
git add src/components/JobView.jsx src/styles.css
git commit -m "feat(jobview): add hero %, Checklist CTA, panel-card rings"
```

---

### Task 9: Update `PanelView.jsx` — hero pretitle includes panel percent

**Files:**
- Modify: `src/components/PanelView.jsx`

- [ ] **Step 1: Compute percent in `refreshProgress`**

Replace the existing `refreshProgress` function in `PanelView.jsx`. The new version uses `getPanelProgress` from metrics:

```jsx
  async function refreshProgress() {
    const { percent, sheetStatuses } = await getPanelProgress(panelId);
    setProgress(sheetStatuses);
    setPanelPercent(percent);
  }
```

Add the import at the top:

```jsx
import { getPanelProgress } from '../lib/metrics.js';
```

Add new state after `const [progress, setProgress] = useState({});`:

```jsx
  const [panelPercent, setPanelPercent] = useState(0);
```

- [ ] **Step 2: Update hero pretitle**

Replace:

```jsx
          <div className="hero-pretitle">
            {idx >= 0 ? `PANEL · ${idx + 1} OF ${total} SHEETS` : 'PANEL'}
          </div>
```

with:

```jsx
          <div className="hero-pretitle">
            {idx >= 0
              ? `PANEL · ${panelPercent}% COMPLETE · ${idx + 1} OF ${total} SHEETS`
              : 'PANEL'}
          </div>
```

- [ ] **Step 3: Remove now-unused imports**

Since `refreshProgress` no longer reads `listRows`, `listPanelPhotos`, or `schemaMap` directly, prune the imports. Update the imports block in `PanelView.jsx` to:

```jsx
import React, { useState, useEffect } from 'react';
import { getJob, getPanel } from '../db.js';
import { getPanelProgress } from '../lib/metrics.js';
import { nav } from '../App.jsx';
import SheetForm from './SheetForm.jsx';
import AppBar from './AppBar.jsx';
import Icon from './Icon.jsx';
import SheetPicker from './SheetPicker.jsx';
```

The `SHEET_ORDER` constant can stay in `PanelView.jsx` since it controls the tab render order (or be re-imported from metrics — keep local for now to minimize blast radius).

- [ ] **Step 4: Smoke test**

Run `npm run dev`. Open a panel:
- Hero reads `PANEL · NN% COMPLETE · X OF 13 SHEETS`
- Tab dots still render correctly (empty/partial/complete colors unchanged)
- Adding rows on a sheet updates the percent on the next blur (existing `onChange={refreshProgress}` already wired)

- [ ] **Step 5: Commit**

```bash
cd /Users/nickcason/DevSpace/Work/e-OIC
git add src/components/PanelView.jsx
git commit -m "feat(panelview): show panel % in hero pretitle"
```

---

### Task 10: Add `/job/:id/checklist` route in `App.jsx`

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Update `parseHash`**

Replace the existing `parseHash` function in `src/App.jsx` with:

```jsx
function parseHash() {
  const h = window.location.hash.replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'jobs' };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'job' && parts[1] && parts[2] === 'panel' && parts[3]) {
    return { name: 'panel', jobId: parts[1], panelId: parts[3] };
  }
  if (parts[0] === 'job' && parts[1] && parts[2] === 'checklist') {
    return { name: 'checklist', jobId: parts[1] };
  }
  if (parts[0] === 'job' && parts[1]) {
    return { name: 'job', jobId: parts[1] };
  }
  return { name: 'jobs' };
}
```

- [ ] **Step 2: Add route mount and import**

In `src/App.jsx`, add the import near the existing component imports:

```jsx
import ChecklistView from './components/ChecklistView.jsx';
```

Add the route to the JSX in the `App` component, right after the `panel` route line:

```jsx
      {route.name === 'checklist' && <ChecklistView jobId={route.jobId} />}
```

The route block now reads:

```jsx
      {route.name === 'jobs' && <JobList />}
      {route.name === 'job' && <JobView jobId={route.jobId} />}
      {route.name === 'panel' && <PanelView jobId={route.jobId} panelId={route.panelId} />}
      {route.name === 'checklist' && <ChecklistView jobId={route.jobId} />}
      {route.name === 'settings' && <SettingsView />}
```

The `ChecklistView` component doesn't exist yet — the next task creates it.

- [ ] **Step 3: Commit**

```bash
cd /Users/nickcason/DevSpace/Work/e-OIC
git add src/App.jsx
git commit -m "feat(routes): add /job/:id/checklist route"
```

---

### Task 11: Create `<ChecklistTaskRow>` component

**Files:**
- Create: `src/components/ChecklistTaskRow.jsx`

- [ ] **Step 1: Write the component**

Create `src/components/ChecklistTaskRow.jsx`:

```jsx
import React, { useState, useRef, useEffect } from 'react';
import Icon from './Icon.jsx';

// One row in the Checklist screen. Renders auto, manual, or custom tasks.
//
// Props:
//   task          { id, kind, label, completed, locked, sheet?, section }
//   onToggle()    fires when a manual/custom task is toggled
//   onRename(label)  custom only — fires after rename confirm
//   onDelete()    custom only — fires when user picks Delete
export default function ChecklistTaskRow({ task, onToggle, onRename, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(task.label);
  const inputRef = useRef(null);

  useEffect(() => {
    if (renaming) {
      setDraft(task.label);
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [renaming, task.label]);

  function commitRename() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setRenaming(false);
      setDraft(task.label);
      return;
    }
    if (trimmed !== task.label) onRename(trimmed);
    setRenaming(false);
  }

  function cancelRename() {
    setRenaming(false);
    setDraft(task.label);
  }

  if (renaming) {
    return (
      <div className="checklist-task-row checklist-task-row--editing">
        <input
          ref={inputRef}
          className="checklist-rename-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            else if (e.key === 'Escape') cancelRename();
          }}
          onBlur={commitRename}
          aria-label="Rename task"
        />
      </div>
    );
  }

  const checked = !!task.completed;
  const locked = !!task.locked;
  const isCustom = task.kind === 'custom';

  return (
    <div className={`checklist-task-row ${checked ? 'is-checked' : ''} ${locked ? 'is-locked' : ''}`}>
      <button
        type="button"
        className="checklist-task-row__check"
        onClick={() => { if (!locked) onToggle(); }}
        aria-pressed={checked}
        aria-label={`${checked ? 'Uncheck' : 'Check'} ${task.label}`}
        disabled={locked}
      >
        {locked
          ? <Icon name="check" size={14} className={checked ? 'is-on' : 'is-off'} />
          : (checked ? <Icon name="check" size={16} /> : <span className="checklist-empty-box" />)}
      </button>
      <div className="checklist-task-row__main">
        <div className="checklist-task-row__label">{task.label}</div>
        {locked && (
          <div className="checklist-task-row__caption">
            {checked
              ? `Auto-checked from ${task.sheet || 'sheet'} sheet`
              : `Auto-checks when ${task.sheet || 'this'} sheet has rows`}
          </div>
        )}
      </div>
      {isCustom && (
        <div className="checklist-task-row__actions">
          <button
            type="button"
            className="icon-btn ghost"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Task actions"
          >
            <Icon name="more" size={16} />
          </button>
          {menuOpen && (
            <div className="checklist-task-menu" onMouseLeave={() => setMenuOpen(false)}>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); setRenaming(true); }}
              >
                Rename
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => { setMenuOpen(false); onDelete(); }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add styles**

Append to `src/styles.css`:

```css
.checklist-task-row {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border-bottom: 1px solid var(--border);
  background: var(--bg-2);
}
.checklist-task-row:last-child { border-bottom: none; }
.checklist-task-row__check {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
  color: var(--accent);
}
.checklist-task-row__check:disabled { cursor: default; color: var(--text-dim); }
.checklist-empty-box {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 1.5px solid var(--text-dim);
  border-radius: 4px;
  background: var(--bg-2);
}
.checklist-task-row.is-checked .checklist-empty-box {
  border-color: var(--accent);
  background: var(--accent);
}
.checklist-task-row__main { flex: 1 1 auto; min-width: 0; }
.checklist-task-row__label {
  color: var(--text-strong);
  font-size: 15px;
  line-height: 1.4;
}
.checklist-task-row.is-checked .checklist-task-row__label {
  color: var(--text-dim);
  text-decoration: line-through;
}
.checklist-task-row.is-locked .checklist-task-row__label { color: var(--text); }
.checklist-task-row__caption {
  color: var(--text-dim);
  font-size: 12px;
  margin-top: 2px;
}
.checklist-task-row__actions {
  position: relative;
  flex-shrink: 0;
}
.checklist-task-menu {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 5;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: 0 6px 18px rgba(0,0,0,0.12);
  padding: 4px 0;
  min-width: 120px;
}
.checklist-task-menu button {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: 8px 12px;
  font: inherit;
  color: var(--text);
  cursor: pointer;
}
.checklist-task-menu button:hover { background: var(--bg-3); }
.checklist-task-menu button.danger { color: var(--danger); }
.checklist-rename-input {
  flex: 1;
  background: var(--bg-2);
  border: 1px solid var(--accent);
  border-radius: var(--r-sm);
  padding: 8px 10px;
  font: inherit;
  color: var(--text);
}
```

- [ ] **Step 3: Commit (component is consumed in next task)**

```bash
cd /Users/nickcason/DevSpace/Work/e-OIC
git add src/components/ChecklistTaskRow.jsx src/styles.css
git commit -m "feat(ui): add ChecklistTaskRow component"
```

---

### Task 12: Create `<ChecklistView>` screen

**Files:**
- Create: `src/components/ChecklistView.jsx`

- [ ] **Step 1: Write the component**

Create `src/components/ChecklistView.jsx`:

```jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  getJob, setManualTaskCompleted, addCustomTask, renameCustomTask,
  setCustomTaskCompleted, deleteCustomTask, getChecklistState, setChecklistState,
} from '../db.js';
import { getJobChecklist, getJobPercent, CHECKLIST_SECTIONS } from '../lib/metrics.js';
import { nav } from '../App.jsx';
import { toast } from '../lib/toast.js';
import AppBar from './AppBar.jsx';
import PercentBar from './PercentBar.jsx';
import ChecklistTaskRow from './ChecklistTaskRow.jsx';
import Icon from './Icon.jsx';

export default function ChecklistView({ jobId }) {
  const [job, setJob] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [percent, setPercent] = useState(0);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const addInputRef = useRef(null);

  async function refresh() {
    const j = await getJob(jobId);
    if (!j) { nav('/'); return; }
    setJob(j);
    setTasks(await getJobChecklist(jobId));
    setPercent(await getJobPercent(jobId));
  }

  useEffect(() => { refresh(); }, [jobId]);

  useEffect(() => {
    if (adding) setTimeout(() => addInputRef.current?.focus(), 0);
  }, [adding]);

  async function onToggleManual(taskId, current) {
    await setManualTaskCompleted(jobId, taskId, !current);
    refresh();
  }

  async function onToggleCustom(taskId, current) {
    await setCustomTaskCompleted(jobId, taskId, !current);
    refresh();
  }

  async function onAddCustom() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    await addCustomTask(jobId, trimmed);
    setDraft('');
    setAdding(false);
    refresh();
  }

  async function onRenameCustom(taskId, label) {
    await renameCustomTask(jobId, taskId, label);
    refresh();
  }

  async function onDeleteCustom(taskId, label) {
    // Optimistic delete with undo. Snapshot the entire state so undo restores
    // exactly, including the createdAt timestamp.
    const stateBefore = await getChecklistState(jobId);
    await deleteCustomTask(jobId, taskId);
    refresh();
    toast.undoable(`Deleted "${label}"`, {
      onUndo: async () => {
        await setChecklistState(jobId, stateBefore);
        refresh();
      },
    });
  }

  if (!job) return null;

  const tasksBySection = {};
  for (const s of CHECKLIST_SECTIONS) tasksBySection[s] = [];
  for (const t of tasks) {
    if (tasksBySection[t.section]) tasksBySection[t.section].push(t);
  }

  const totalChecked = tasks.filter((t) => t.completed).length;
  const total = tasks.length;
  const customTasks = tasksBySection['Custom'] || [];

  return (
    <>
      <AppBar
        onBack={() => nav(`/job/${jobId}`)}
        wordmark={job.name || 'e-OIC'}
        crumb="Checklist"
      />
      <main>
        <div className="hero">
          <div className="hero-pretitle">JOB CHECKLIST</div>
          <h1 className="hero-title">{percent}% complete</h1>
          <div className="hero-sub">{totalChecked} of {total} tasks</div>
          <div className="hero-bar">
            <PercentBar percent={percent} height={8} ariaLabel={`${percent}% complete`} />
          </div>
        </div>

        {CHECKLIST_SECTIONS.map((section) => {
          const list = tasksBySection[section] || [];
          if (section === 'Custom' && list.length === 0) return null;
          const checked = list.filter((t) => t.completed).length;
          return (
            <section key={section} className="checklist-section">
              <header className="checklist-section__header">
                <span className="checklist-section__label">{section}</span>
                <span className="checklist-section__count">{checked}/{list.length}</span>
              </header>
              <div className="checklist-section__rows">
                {list.map((t) => (
                  <ChecklistTaskRow
                    key={t.id}
                    task={t}
                    onToggle={() =>
                      t.kind === 'custom'
                        ? onToggleCustom(t.id, t.completed)
                        : onToggleManual(t.id, t.completed)
                    }
                    onRename={(label) => onRenameCustom(t.id, label)}
                    onDelete={() => onDeleteCustom(t.id, t.label)}
                  />
                ))}
                {section === 'Custom' && (
                  <AddTaskRow
                    adding={adding}
                    draft={draft}
                    setDraft={setDraft}
                    onAdd={onAddCustom}
                    onCancel={() => { setAdding(false); setDraft(''); }}
                    onStart={() => setAdding(true)}
                    inputRef={addInputRef}
                  />
                )}
              </div>
            </section>
          );
        })}

        {customTasks.length === 0 && (
          <div className="checklist-add-empty">
            <AddTaskRow
              adding={adding}
              draft={draft}
              setDraft={setDraft}
              onAdd={onAddCustom}
              onCancel={() => { setAdding(false); setDraft(''); }}
              onStart={() => setAdding(true)}
              inputRef={addInputRef}
            />
          </div>
        )}
      </main>
    </>
  );
}

function AddTaskRow({ adding, draft, setDraft, onAdd, onCancel, onStart, inputRef }) {
  if (!adding) {
    return (
      <button
        type="button"
        className="checklist-add-btn"
        onClick={onStart}
      >
        <Icon name="add" size={16} /> Add task
      </button>
    );
  }
  const trimmed = draft.trim();
  return (
    <div className="checklist-add-input">
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && trimmed) onAdd();
          else if (e.key === 'Escape') onCancel();
        }}
        placeholder="Task name"
        aria-label="New task name"
      />
      <button
        type="button"
        className="primary"
        onClick={onAdd}
        disabled={!trimmed}
      >
        Add
      </button>
      <button
        type="button"
        className="ghost"
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add styles**

Append to `src/styles.css`:

```css
.checklist-section {
  margin: 0 var(--sp-3) var(--sp-4) var(--sp-3);
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
}
.checklist-section__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-3);
  border-bottom: 1px solid var(--border);
}
.checklist-section__label {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--text-strong);
  font-size: 14px;
  letter-spacing: 0.02em;
}
.checklist-section__count {
  color: var(--text-dim);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.checklist-section__rows { display: flex; flex-direction: column; }
.checklist-add-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  background: transparent;
  color: var(--accent);
  border: none;
  padding: var(--sp-3);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}
.checklist-add-btn:hover { background: var(--bg-3); }
.checklist-add-input {
  display: flex;
  gap: var(--sp-2);
  padding: var(--sp-3);
  align-items: center;
}
.checklist-add-input input {
  flex: 1;
  background: var(--bg-2);
  border: 1px solid var(--accent);
  border-radius: var(--r-sm);
  padding: 8px 10px;
  font: inherit;
  color: var(--text);
}
.checklist-add-empty {
  margin: 0 var(--sp-3) var(--sp-4) var(--sp-3);
  background: var(--bg-2);
  border: 1px dashed var(--border);
  border-radius: var(--r-md);
}
.hero-bar { margin-top: var(--sp-3); padding: 0 var(--sp-3); }
.hero-sub {
  color: var(--text-dim);
  font-size: 13px;
  margin-top: var(--sp-1);
}
```

If `.hero-sub` already exists with a different rule (search styles for it first via `grep -n "\.hero-sub" src/styles.css`), keep the existing rule and add only the new selectors.

- [ ] **Step 3: Smoke test**

Run `npm run dev`. With seed job:
- Navigate to a job → Checklist CTA → opens checklist screen
- Hero shows percent, "X of Y tasks", and progress bar
- Sections render: Backups, Documentation, Field Work, Data Sheets — Custom section hidden if empty
- "+ Add task" CTA visible at bottom of screen when Custom is empty
- Tap "+ Add task" → input row appears → typing + Enter creates a task
- Custom section appears with the new task; "+ Add task" now lives at the bottom of the Custom section
- Tap a manual task checkbox → toggles, percent updates immediately
- Tap an auto task checkbox → no effect (locked indicator visible)
- Custom task `…` → Rename inline; Delete with undo toast (4s window in `ToastHost`)
- Reload the page → state persists

- [ ] **Step 4: Commit**

```bash
cd /Users/nickcason/DevSpace/Work/e-OIC
git add src/components/ChecklistView.jsx src/styles.css
git commit -m "feat(ui): add ChecklistView screen with sections and custom tasks"
```

---

### Task 13: Exporter — honor manual-checked state via slug lookup

**Files:**
- Modify: `src/exporter.js:217-251`

- [ ] **Step 1: Import slug helper and state loader**

Update the imports at the top of `src/exporter.js`. Replace:

```js
import {
  listPanels, listAllRows, listPanelPhotos, getSheetNotes, getJob,
} from './db.js';
```

with:

```js
import {
  listPanels, listAllRows, listPanelPhotos, getSheetNotes, getJob,
  getChecklistState, slugifyTaskLabel,
} from './db.js';
```

- [ ] **Step 2: Replace the Checklist update block**

Find the existing block (currently at `src/exporter.js:217-251`):

```js
  // 4. Update Checklist completion
  try {
    const cl = wb.getWorksheet('Checklist');
    if (cl) {
      const sheetByTask = {
        'Panel Sheet': 'Panels',
        'Power Sheet': 'Power',
        'PLC Racks Sheet': 'PLC Racks',
        'PLC Slots sheet': 'PLC Slots',
        'HMIs Sheet': 'HMIs',
        'Ethernet Switches Sheet': 'Ethernet Switches',
        'Fieldbus IO Sheet': 'Fieldbus IO',
        'Devices Sheet': 'Network Devices',
        'Conv. Speeds Sheet': 'Conv. Speeds',
        'Safety Circuit Sheet': 'Safety Circuit',
        'Safety Devices Sheet': 'Safety Devices',
        'Peer to Peer Comms': 'Peer to Peer Comms',
      };
      const filled = new Set();
      for (const p of panels) {
        const rs = await listAllRows(p.id);
        for (const r of rs) filled.add(r.sheet);
      }
      for (let r = 2; r <= cl.rowCount; r++) {
        const task = cl.getCell(r, 1).value;
        if (!task) continue;
        const sheet = sheetByTask[String(task).trim()];
        if (sheet && filled.has(sheet)) {
          cl.getCell(r, 3).value = CHK_ON;
        }
      }
    }
  } catch (e) {
    console.warn('Checklist update skipped:', e);
  }
```

Replace with:

```js
  // 4. Update Checklist completion (auto + manual) and append custom tasks
  let checklistSheet = null;
  let checklistLastTaskRow = 0;
  try {
    const cl = wb.getWorksheet('Checklist');
    if (cl) {
      checklistSheet = cl;
      const sheetByTask = {
        'Panel Sheet': 'Panels',
        'Power Sheet': 'Power',
        'PLC Racks Sheet': 'PLC Racks',
        'PLC Slots sheet': 'PLC Slots',
        'HMIs Sheet': 'HMIs',
        'Ethernet Switches Sheet': 'Ethernet Switches',
        'Fieldbus IO Sheet': 'Fieldbus IO',
        'Devices Sheet': 'Network Devices',
        'Conv. Speeds Sheet': 'Conv. Speeds',
        'Safety Circuit Sheet': 'Safety Circuit',
        'Safety Devices Sheet': 'Safety Devices',
        'Peer to Peer Comms': 'Peer to Peer Comms',
      };
      const filled = new Set();
      for (const p of panels) {
        const rs = await listAllRows(p.id);
        for (const r of rs) filled.add(r.sheet);
      }
      const cls = await getChecklistState(job.id);
      const manualTasks = cls.manualTasks || {};
      for (let r = 2; r <= cl.rowCount; r++) {
        const taskCell = cl.getCell(r, 1).value;
        if (!taskCell) continue;
        const taskLabel = String(taskCell).trim();
        checklistLastTaskRow = r;
        const sheet = sheetByTask[taskLabel];
        if (sheet && filled.has(sheet)) {
          cl.getCell(r, 3).value = CHK_ON;
          continue;
        }
        const slug = slugifyTaskLabel(taskLabel);
        if (manualTasks[slug] === true) {
          cl.getCell(r, 3).value = CHK_ON;
        }
      }
    }
  } catch (e) {
    console.warn('Checklist update skipped:', e);
  }
```

(The next task — Task 14 — extends this same block to append custom tasks.)

- [ ] **Step 3: Smoke test**

In the running dev app: open a job's Checklist screen, manually check "PLC Program Backup" and "Existing Plant Drawings". Then export the job (download the xlsx). Open the xlsx in Excel/LibreOffice → Checklist sheet → confirm both tasks have ☑ in the Completed column. Auto tasks for sheets that have rows should also be ☑.

- [ ] **Step 4: Commit**

```bash
cd /Users/nickcason/DevSpace/Work/e-OIC
git add src/exporter.js
git commit -m "feat(export): write manual checklist state to Checklist worksheet"
```

---

### Task 14: Exporter — append custom tasks to Checklist worksheet

**Files:**
- Modify: `src/exporter.js` (extend the Task 13 block)

- [ ] **Step 1: Append custom tasks**

Immediately after the closing `} catch (e) { console.warn('Checklist update skipped:', e); }` from Task 13, but before the `// 5. Append Notes sheet` comment, insert:

```js
  // 4b. Append custom checklist tasks (added via the in-app Checklist screen)
  try {
    if (checklistSheet && checklistLastTaskRow > 0) {
      const cls = await getChecklistState(job.id);
      const customTasks = cls.customTasks || [];
      if (customTasks.length > 0) {
        const cl = checklistSheet;
        const styleSrcRow = cl.getRow(checklistLastTaskRow);
        const srcA = styleSrcRow.getCell(1);
        const srcB = styleSrcRow.getCell(2);
        const srcC = styleSrcRow.getCell(3);
        for (let i = 0; i < customTasks.length; i++) {
          const t = customTasks[i];
          const r = checklistLastTaskRow + 1 + i;
          const a = cl.getCell(r, 1);
          const b = cl.getCell(r, 2);
          const c = cl.getCell(r, 3);
          a.value = t.label;
          b.value = 'Yes';
          c.value = t.completed ? CHK_ON : CHK_OFF;
          // Copy styles so the appended rows match the template's look
          if (srcA.style) a.style = { ...srcA.style };
          if (srcB.style) b.style = { ...srcB.style };
          if (srcC.style) c.style = { ...srcC.style };
        }
      }
    }
  } catch (e) {
    console.warn('Custom checklist append skipped:', e);
  }
```

- [ ] **Step 2: Smoke test**

In the dev app: add two custom tasks ("Verify panel grounding" and "Photograph nameplates" — check the second). Export the job. Open the xlsx → Checklist sheet → confirm both custom tasks appear at the bottom of the Task list, both have "Yes" in Required, the second is ☑ and the first is ☐. Visual styling should match the template's existing rows.

- [ ] **Step 3: Commit**

```bash
cd /Users/nickcason/DevSpace/Work/e-OIC
git add src/exporter.js
git commit -m "feat(export): append custom checklist tasks to Checklist worksheet"
```

---

### Task 15: Bump version and refresh service worker cache

**Files:**
- Modify: `src/version.js`
- Modify: `public/service-worker.js`

- [ ] **Step 1: Update `src/version.js`**

Replace the file content with:

```js
// Build-time marker so we can tell which deployed version is actually
// running on a given client. Bump this in lockstep with VERSION in
// public/service-worker.js. The PWA shows this in Settings -> About and
// in the PhotoCapture modal footer.
export const BUILD_VERSION = 'v19';
```

- [ ] **Step 2: Update `public/service-worker.js`**

Find the line `const VERSION = 'v18';` near the top and replace with:

```js
const VERSION = 'v19';
```

- [ ] **Step 3: Smoke test**

In the dev app, bottom-right of the Jobs screen hero pretitle should now show the `v19` build badge. Open Settings — about section should also reflect v19.

- [ ] **Step 4: Commit**

```bash
cd /Users/nickcason/DevSpace/Work/e-OIC
git add src/version.js public/service-worker.js
git commit -m "chore: bump build to v19 (metrics + checklist)"
```

---

### Task 16: Manual end-to-end smoke test

**Files:** none (verification only)

- [ ] **Step 1: Fresh-state walkthrough**

Stop dev server. Open browser DevTools → Application → Storage → Clear site data. Restart `npm run dev`, hard reload.

Walkthrough:
1. Sample seed job appears in JobList. Each job card has a navy ring with monogram letters; the four-tile stat row reads Active / Panels / Photos / % Complete.
2. Open the seed job. Hero pretitle reads `JOB · NN% COMPLETE · 3 PANELS · NN PHOTOS`. The Checklist CTA card sits below the hero with the percent bar; tapping navigates to the Checklist screen.
3. On the Checklist screen: hero shows the percent number large; sections render (Backups, Documentation, Field Work, Data Sheets); auto tasks for sheets the seed job populates are ☑; the Custom section is hidden.
4. Tap a manual task (e.g. PLC Program Backup) — checkbox flips on, hero percent updates without reload.
5. Tap "+ Add task" at the bottom of the screen. Type "Verify grounding" → Enter → custom task appears in a new Custom section.
6. Toggle the custom task — percent updates.
7. `…` on the custom task → Rename → change to "Verify grounding & bonding" → Enter — label updates.
8. `…` → Delete → confirmation toast with Undo. Wait 4s — task is gone permanently. Re-add and Delete again, but tap Undo within 4s — task returns.
9. Back to JobView. Confirm panel cards on the right show small percent rings with the percent number; tap into a panel.
10. PanelView hero pretitle reads `PANEL · NN% COMPLETE · X OF 13 SHEETS`. Add a row in an empty sheet; navigate back to JobView; the panel's ring should reflect the increase.
11. Settings → Backup. Open the JSON in a text editor. Confirm `checklistState` array exists with the seed job's manual + custom state.
12. Build & download the xlsx export. Open in Excel/LibreOffice → Checklist sheet → confirm:
    - Sheet-fill rows for sheets with data are ☑
    - Manually-checked tasks (PLC Program Backup) are ☑
    - Custom tasks appear at the bottom with correct ☑/☐ state and "Yes" Required

- [ ] **Step 2: Reduced-motion check**

Enable `prefers-reduced-motion` (in macOS: System Settings → Accessibility → Display → Reduce motion; in DevTools: Rendering tab → Emulate CSS media feature `prefers-reduced-motion: reduce`). Reload — rings and bars should snap to value with no transition.

- [ ] **Step 3: Empty job edge case**

Create a brand-new job with no panels. JobView pretitle should read `JOB · 0% COMPLETE · 0 PANELS · 0 PHOTOS`. Checklist CTA should still appear. Open Checklist — auto tasks all ☐, manual tasks all ☐, no custom tasks. Add and check a custom task — percent should update.

- [ ] **Step 4: Commit any test fixes uncovered**

If any issue surfaces during the walkthrough, fix it inline and commit with a descriptive message before moving on.

---

### Task 17: Build, deploy, and verify on GitHub Pages

**Files:** none (CI/CD operation)

- [ ] **Step 1: Run a production build locally**

```bash
cd /Users/nickcason/DevSpace/Work/e-OIC
npm run build
```

Expected: build completes with no errors. The `dist/` directory contains the built bundle.

- [ ] **Step 2: Push to main**

```bash
cd /Users/nickcason/DevSpace/Work/e-OIC
git push origin main
```

The existing GitHub Actions workflow handles the GitHub Pages deploy.

- [ ] **Step 3: Verify deploy**

Watch the Actions run via `gh run watch` (or the GitHub web UI). Once green, hard-reload the deployed PWA URL. Confirm:
- Build badge in JobList hero shows `v19`
- An UpdatePill appears (or the page auto-reloads via the existing SW update detection) for installed PWA users
- Job cards have rings, Checklist CTA appears, Checklist screen works

- [ ] **Step 4: Final report**

Once verified live, the run is complete. The plan's deployment goal is met.

---

## Plan self-review

**1. Spec coverage:**
- ✅ Data model (`checklistState` store + slug + CRUD): Tasks 1, 2
- ✅ Backup/restore round-trip: Task 3
- ✅ `metrics.js` derivations (panel %, job checklist, job %, aggregate stats): Task 4
- ✅ `<PercentRing>` component: Task 5
- ✅ `<PercentBar>` component: Task 6
- ✅ JobList: ring + % stat tile: Task 7
- ✅ JobView: hero pretitle + Checklist CTA + panel-card rings + focus refresh: Task 8
- ✅ PanelView: hero pretitle: Task 9
- ✅ Routing: Task 10
- ✅ `<ChecklistTaskRow>`: Task 11
- ✅ `<ChecklistView>` with sections, add/rename/delete custom, undo, persistence: Task 12
- ✅ Exporter manual + custom: Tasks 13, 14
- ✅ Version bump: Task 15
- ✅ E2E smoke + edge cases: Task 16
- ✅ Deploy: Task 17

**2. Placeholder scan:** No "TBD"/"TODO"/"add validation"/"similar to" — every code step contains the actual code or precise replacement.

**3. Type consistency:**
- `slugifyTaskLabel` defined in Task 2 and consumed in Tasks 4 and 13. Same signature.
- `CHECKLIST_TEMPLATE` IDs in Task 4 are slug-of-label (verified by inspection: `'plc-program-backup' === slugify('PLC Program Backup')`).
- `getChecklistState` / `setChecklistState` / `addCustomTask` / `renameCustomTask` / `setCustomTaskCompleted` / `deleteCustomTask` / `setManualTaskCompleted` defined in Task 2, consumed identically in Tasks 12 and 13/14.
- `getPanelProgress` returns `{ percent, sheetStatuses }` in Task 4; consumed identically in Tasks 8 and 9.
- `getJobChecklist` returns task objects with `{ id, section, label, kind, required, completed, locked, sheet?, createdAt? }` in Task 4; consumed identically in Tasks 8 and 12.
- `<PercentRing>` props and `<PercentBar>` props consistent across Tasks 5, 6, 7, 8, 12.

No issues found.
