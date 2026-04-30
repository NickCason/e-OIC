# Metrics & Checklist Design

**Date:** 2026-04-30
**Status:** Approved (user pre-approved subagent-driven execution)

## Goal

Surface project- and panel-level completion metrics throughout the app, and bring the xlsx Checklist sheet into the app as a first-class UI surface. Engineers in the field should see at a glance how complete each job and panel is, and have a single screen that captures every deliverable for a project (data sheets, backups, drawings, interviews) plus any ad-hoc tasks they add.

## Architecture

A new pure-functions module `src/lib/metrics.js` derives panel percentages, the job's checklist task list, and the job's percentage from existing row/photo data plus a new `checklistState` IndexedDB store. A new `/job/:id/checklist` screen renders the checklist with section grouping, manual/auto/custom task rendering, and immediate-persist toggles. Existing screens (JobList, JobView, PanelView) consume the metrics module to display rings, bars, and updated hero pretitles. The exporter is extended to append custom tasks to the Checklist worksheet and to honor manual checked state.

## Tech Stack

React 18, IndexedDB via `idb`, ExcelJS for xlsx export, lucide-react for icons. No new dependencies.

---

## Data Model

### New IndexedDB store: `checklistState`

- Keyed by `jobId`
- Value shape:
  ```js
  {
    jobId: string,
    manualTasks: { [taskId: string]: boolean },
    customTasks: [
      {
        id: string,        // crypto.randomUUID()
        label: string,
        completed: boolean,
        createdAt: number  // ms epoch
      }
    ]
  }
  ```
- `taskId` for manual tasks is a stable slug of the canonical label (e.g., `plc-program-backup`, `existing-plant-drawings`).
- IndexedDB schema version bumps; migration creates the new store. No changes to existing stores.

### Derived (not stored)

`src/lib/metrics.js` exports:

- `getPanelProgress(panelId) → { percent: 0–100, sheetStatuses: { [sheet]: 'empty'|'partial'|'complete' } }`
  - Reuses existing `listRows(panelId, sheet)` and `listPanelPhotos(panelId)` from `db.js`.
  - Sheet status: `empty` if no rows; `partial` if rows exist but required photos missing; `complete` if rows exist AND (no photo checklist OR all required photos taken). Mirrors today's `PanelView.refreshProgress`.
  - Percent: `average(empty=0, partial=0.5, complete=1)` across the 13 sheets in `SHEET_ORDER`, rounded to nearest integer.
- `getJobChecklist(jobId) → Task[]`
  - Reads `checklistState` for `jobId` (defaulting to `{ manualTasks: {}, customTasks: [] }` if missing).
  - Reads all panels for the job, then all rows across those panels, to determine which sheets have any rows.
  - Returns the merged task list described in "Checklist Tasks" below.
- `getJobPercent(jobId) → 0–100`
  - `round((checked.length / total.length) * 100)` over `getJobChecklist(jobId)`.
- `getJobAggregateStats(jobId) → { panelCount, photoCount, jobPercent }`
  - Convenience wrapper for the JobView hero.

No internal cache. Each call re-reads from IndexedDB. Recomputation is triggered by component mount and by post-mutation refresh hooks already present in the codebase.

---

## Checklist Tasks

Tasks render in this order. Each task has `{ id, section, label, kind: 'auto'|'manual'|'custom', required: bool, completed: bool, locked: bool }`. `locked: true` ⇒ UI shows a lock icon and ignores taps; `locked: false` ⇒ tappable checkbox.

### Section 1 — Backups (manual)

| Task ID | Label |
|---|---|
| `plc-program-backup` | PLC Program Backup |
| `hmi-program-backup` | HMI Program Backup |
| `scada-backup` | SCADA Backup |
| `rsnetworx-backup` | RSNetworx Backup (CNet, DNet) |
| `dh-rio-backup` | DH+/RIO Backup |

### Section 2 — Documentation (manual)

| Task ID | Label |
|---|---|
| `existing-plant-drawings` | Existing Plant Drawings |
| `existing-network-diagram` | Existing Network Diagram |
| `process-flow-diagram` | Process Flow Diagram |
| `io-list` | IO List |
| `device-list` | Device List |

### Section 3 — Field Work (manual)

| Task ID | Label |
|---|---|
| `process-investigation` | Process Investigation |
| `operator-interviews` | Operator Interviews |

### Section 4 — Data Sheets

Auto kind unless noted. `completed = true` when ANY panel for the job has at least one row in the matching sheet (matches today's exporter behavior in `exporter.js:217-251`).

| Task ID | Label | Maps to sheet | Kind |
|---|---|---|---|
| `panel-sheet` | Panel Sheet | Panels | auto |
| `power-sheet` | Power Sheet | Power | auto |
| `plc-racks-sheet` | PLC Racks Sheet | PLC Racks | auto |
| `plc-slots-sheet` | PLC Slots sheet | PLC Slots | auto |
| `hmis-sheet` | HMIs Sheet | HMIs | auto |
| `ethernet-switches-sheet` | Ethernet Switches Sheet | Ethernet Switches | auto |
| `switch-ports-sheet` | Switch Ports Sheet | *(no matching sheet)* | manual |
| `fieldbus-io-sheet` | Fieldbus IO Sheet | Fieldbus IO | auto |
| `devices-sheet` | Devices Sheet | Network Devices | auto |
| `conv-speeds-sheet` | Conv. Speeds Sheet | Conv. Speeds | auto |
| `safety-circuit-sheet` | Safety Circuit Sheet | Safety Circuit | auto |
| `safety-devices-sheet` | Safety Devices Sheet | Safety Devices | auto |
| `peer-to-peer-comms` | Peer to Peer Comms | Peer to Peer Comms | auto |

### Section 5 — Custom (renders only if user has added any)

User-added tasks. Each has a UUID `id`, label, completed, createdAt. Sorted by `createdAt` ascending (no manual reorder).

---

## UI

### Job card on JobList

- The existing monogram tile is replaced by a **percentage ring**.
  - Diameter: 56px. Stroke: 5px.
  - Track color: `--bg-3`. Arc color: `--accent`. At 100%, arc switches to `--energy` (red-orange brand accent).
  - Center: monogram letters (existing initials, `--fs-label`, `--text-strong`).
- Stat-tile row gains a fourth tile labeled **"% complete"** showing the job's checklist percent.
- All other card chrome unchanged.

### JobView (panels-list screen)

- **Hero pretitle** updates from `JOB · N PANELS` to:
  > `JOB · {percent}% COMPLETE · {N} PANELS · {photoCount} PHOTOS`
- **New Checklist CTA card** between the hero and the panels list:
  - Title: `Checklist`
  - Subtitle: `{checked} / {total} · {percent}%`
  - Horizontal progress bar fill below subtitle (`--accent` on `--bg-3`, 4px tall, full card width)
  - Tapping navigates to `/job/:id/checklist`
- **Each panel card** gains a percentage ring on the right side (32px diameter, 3px stroke), centered % number inside, replacing the existing chevron/`arrowRight` indicator. Card remains tappable; ring is non-interactive.

### PanelView (sheet-tabs screen)

- **Hero pretitle** updates from `PANEL · 4 OF 13 SHEETS` to:
  > `PANEL · {percent}% COMPLETE · {idx+1} OF 13 SHEETS`
- Sheet tabs unchanged — existing `empty/partial/complete` dots stay.

### Checklist screen — `/job/:id/checklist`

- **AppBar:** Back arrow returns to JobView. Wordmark = job name. Crumb = "Checklist".
- **Hero:**
  - Pretitle: `JOB CHECKLIST`
  - Title: `{percent}% complete`
  - Subtitle: `{checked} of {total} tasks`
  - Horizontal progress bar (8px tall, full hero width, `--accent` on `--bg-3`)
- **Sections** (rendered as visually grouped cards, in the order Backups → Documentation → Field Work → Data Sheets → Custom):
  - Section header: `{section label}` + `{checked}/{total}` count, slab font.
  - Each task row:
    - `[checkbox or lock icon]  {label}`
    - Auto tasks: lock icon (Icon `info` or `check` rendered with `--text-dim`) instead of checkbox; small caption "Auto-checked when sheet has rows" when locked-and-unchecked, or "Auto-checked from {sheet} sheet" when checked. Row is non-interactive.
    - Manual + custom tasks: interactive checkbox with `--accent` fill when checked. Tap toggles state, persists immediately, ring/bar animates.
    - Custom task rows include an inline `…` overflow icon → opens small menu (Rename / Delete).
- **Custom section:**
  - Header reads `Custom · {checked}/{total}` (or just `Custom` if empty).
  - If non-empty, list rendered, then "+ Add task" button at the bottom of the section.
  - If empty, the section header is hidden and a single full-width "+ Add task" CTA appears at the bottom of the screen.
  - "Add task" opens an inline input row (not a modal) with placeholder "Task name". Confirming via Enter or a checkmark button creates the task and persists. Empty/whitespace label disables confirm.
- **Rename/Delete custom task:**
  - Rename: replaces the row label with an inline input. Enter confirms; Esc/blur cancels (if blank, cancel).
  - Delete: prompts a confirm toast via existing `ToastHost` — "Delete task? · Undo (4s)". On undo, the task is restored.
- **No save bar.** Every mutation persists immediately on toggle/edit.

---

## Routing

- Add new route: `/job/:id/checklist` → `<ChecklistView jobId={id} />`.
- Route lives in the existing hash-based router in `App.jsx`.
- No deep-link state for the inline rename input (transient UI state only).

---

## Components

### New components

- `src/components/ChecklistView.jsx` — full screen at `/job/:id/checklist`. Owns the hero, section list, add-task input, and toast wiring.
- `src/components/ChecklistTaskRow.jsx` — single row. Handles auto/manual/custom rendering, the checkbox/lock visual, the overflow menu for custom tasks, and the rename input.
- `src/components/PercentRing.jsx` — reusable SVG ring. Props: `percent` (0–100), `size` (px), `stroke` (px), `trackColor`, `arcColor`, `children` (centered content like monogram or % number). Honors `prefers-reduced-motion` (no arc-fill animation when reduced).
- `src/components/PercentBar.jsx` — reusable horizontal bar. Props: `percent`, `height`, `trackColor`, `fillColor`. Honors `prefers-reduced-motion`.

### Modified components

- `src/components/JobList.jsx` — swap monogram tile for `<PercentRing>` with monogram inside; add `% complete` stat tile; fetch job percents on mount.
- `src/components/JobView.jsx` — hero pretitle update; add Checklist CTA card; panel cards swap chevron for `<PercentRing>` (small variant).
- `src/components/PanelView.jsx` — hero pretitle includes percent.
- `src/App.jsx` — add `/job/:id/checklist` route mapping to `ChecklistView`.
- `src/db.js` — bump schema version; create `checklistState` store; add `getChecklistState(jobId)`, `setChecklistState(jobId, state)`, `addCustomTask(jobId, label)`, `renameCustomTask(jobId, taskId, label)`, `deleteCustomTask(jobId, taskId)`, `setManualTaskCompleted(jobId, taskId, completed)`, `setCustomTaskCompleted(jobId, taskId, completed)` helpers.
- `src/exporter.js` — extend the existing Checklist update block (`exporter.js:217-251`) to consult `checklistState` for manual tasks, then append custom-task rows after the last template task row, copying styles from the row immediately above.

### New module (non-component)

- `src/lib/metrics.js` — pure functions described in "Derived" above. Imports from `db.js` only. No React.

---

## Persistence & Mutation Flow

- Toggling manual or custom task: row's `onChange` calls `setManualTaskCompleted` / `setCustomTaskCompleted` → IndexedDB write → component refetches `getJobChecklist(jobId)` and `getJobPercent(jobId)` → re-renders. No debounce.
- Add custom task: confirm in inline input → `addCustomTask(jobId, label)` returns the new task → component refetches.
- Rename custom task: confirm in inline rename input → `renameCustomTask(jobId, taskId, label)` → refetch.
- Delete custom task: tap Delete in overflow → optimistic remove from local state + show ToastHost "Delete task? · Undo". On confirm-timeout (4s) call `deleteCustomTask(jobId, taskId)`. On undo, restore local state, no DB write.
- JobList: refetch all job percents on mount and after import/delete/seed-reload (existing hooks).
- JobView: refetch panel percents + job percent on mount and on focus (window `focus` event listener — added to JobView).
- PanelView: refetch on mount and after each row save (existing `refreshProgress` extended to also recompute the percent for the hero pretitle).

---

## Exporter Changes

In `src/exporter.js`, extend the existing Checklist update block:

1. **Manual task auto-check (existing block, extended):** After the existing `sheetByTask` lookup loop, also walk the Checklist worksheet's Task column and consult `checklistState.manualTasks` (loaded once at the top of `buildExport`). If `manualTasks[slugOf(taskLabel)] === true`, write `CHK_ON` to the Completed column.
2. **Custom task append (new):** Find the last row in the Checklist worksheet that has a non-empty Task cell (column A). For each `customTasks[i]`:
   - Write to row `lastRow + 1 + i`:
     - Column A (Task): `task.label`
     - Column B (Required): `"Yes"`
     - Column C (Completed): `task.completed ? CHK_ON : CHK_OFF`
   - Copy cell styles from `lastRow` for columns A–C so formatting matches existing rows.

No new sheets, no new columns, no schema.json changes.

---

## Testing

- Manual smoke test on mobile-width viewport: create a job, add a panel, fill some rows in some sheets, observe the panel ring update, the job ring update, the hero pretitles update.
- Manual: open Checklist screen, toggle manual tasks, observe percent update, add a custom task, rename it, delete it (test undo). Reload the app, verify state persists.
- Manual: export the job as xlsx. Open in Excel/LibreOffice. Verify Checklist sheet's Completed column shows the auto-checked sheets, the manually-checked tasks, and any custom tasks appear at the bottom with correct checkbox state.
- Manual: import a backup JSON missing the `checklistState` key — should load cleanly with no checklist state (all manual tasks unchecked, no custom tasks).
- Manual: prefers-reduced-motion enabled — rings/bars should snap to value, not animate.

No automated test infrastructure exists in this project; manual verification is the standard.

---

## Edge Cases

- Job with zero panels: `getPanelProgress` returns `{ percent: 0, sheetStatuses: {} }` for nothing; `getJobChecklist` returns auto tasks all unchecked; `getJobPercent` reflects only manual + custom checks. JobList ring shows the small percent. JobView panels-list is empty; hero pretitle reads `JOB · {percent}% COMPLETE · 0 PANELS · 0 PHOTOS`.
- Custom task with empty/whitespace label: "Add task" / "Save rename" disabled until the label has at least one non-whitespace character.
- Backup/restore JSON shape gains a top-level `checklistState` map keyed by jobId. Old backups missing this key load with `{}`. New backups including it restore manual + custom state.
- Auto task whose sheet was deleted from the schema or template: `getJobChecklist` skips it (no row maps to a missing sheet). Defensive — not expected in practice.
- Rapid toggle: every toggle persists; if the user mashes the checkbox, every state lands in the DB. No debounce needed because writes are tiny.
- Visiting Checklist screen for a job with no `checklistState` row yet: lazily initialized on first read (returns the default shape; no write until first mutation).

---

## Out of Scope

- Per-task notes (rejected — keeping it simple).
- Manual override of auto tasks (rejected — auto stays read-only).
- Per-section custom tasks (rejected — Custom is one section).
- Drag-to-reorder custom tasks (rejected — sorted by createdAt).
- Per-panel checklist (rejected — Checklist is job-level only).
- Sheet-tab rings inside PanelView (rejected — existing dots are sufficient).
