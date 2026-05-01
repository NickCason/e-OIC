# SharePoint Round-Trip — Design Spec

**Date:** 2026-05-01
**Status:** Approved, ready for implementation
**Workflow:** brainstorming → this spec → writing-plans → subagent-driven-development

## Goal

Add a one-shot-picker xlsx round-trip workflow to e-OIC so field techs can:

1. **Pull** an existing investigation from a SharePoint folder by picking the `.xlsx` (via the OS Files-app picker on iOS, native picker on desktop). The app parses it and creates a new local job populated from the xlsx.
2. **Re-sync** an existing local job from the xlsx (e.g., to pick up edits made in Excel/365 by office staff).
3. **Push** an updated xlsx back to SharePoint, with a diff confirmation step before overwriting.

No Microsoft Graph API. No Azure AD. No native shell. Pure PWA + browser file pickers. SharePoint integration is implicit — the user routes files via the OS-level Files app share sheet / cloud picker.

## Non-Goals

- Programmatic SharePoint browse, auto-overwrite, or background sync.
- Round-tripping photos through the xlsx (photos remain a local-only concept; existing `.backup.json` import covers lossless restore when needed).
- Multi-tab concurrent editing of the same job.
- Conflict detection between "what's currently in SharePoint" and "what was there at pull time" beyond what the diff already shows.

## Architecture

Three new pure-JS modules and one new optional field on the `jobs` IndexedDB store. No new IndexedDB stores. No DB version bump.

### New modules

- **`src/lib/xlsxParser.js`** — pure async function `parseChecklistXlsx(arrayBuffer) → ParsedXlsx`. Reads `.xlsx` via ExcelJS (already a dependency). Maps headers to `schemaMap` columns. Surfaces unknowns as warnings. Parses the Notes appendix sheet to recover row/sheet notes. Has `node:test` unit tests against fixture files.
- **`src/lib/jobDiff.js`** — pure function `diffJobs({ localJob, localPanels, localRowsBySheet, localSheetNotes }, parsedXlsx, schemaMap, options) → JobDiff`. Label-based row matching. Returns a fully structured diff. Pure, fully unit-testable.
- **`src/lib/xlsxRoundTrip.js`** — orchestration helpers (`applyParsedXlsxToNewJob`, `applyResyncToJob`). Take a parsed xlsx + an optional existing job, produce the IndexedDB write set, run it inside a single `idb` transaction.

### Data model

New optional field on existing `jobs` records:

```ts
job.source = {
  kind: 'xlsx',
  filename: 'Acme_Plant_Investigation.xlsx',  // verbatim from picked File.name
  pulledAt: 1714498800000,                    // Date.now() at successful pull/resync/push-overwrite
} | null
```

- Set on **Pull (new job)**.
- Updated on **Re-sync** and **Push (overwrite)** (`pulledAt` → now).
- Untouched on **Push (save as new)**.
- Cleared by an explicit "Disconnect from xlsx" action.
- Survives `exportJobJSON` / `importJSON`.
- Optional field, treated as null when missing on legacy records. **No DB version bump required.**

### UI changes

- **`src/components/JobList.jsx`** — FAB tap opens a new "Pull or New?" modal instead of `JobModal` directly.
- **`src/components/PullOrNewModal.jsx`** *(new)* — small choice modal with two `.modal-list-btn` rows.
- **`src/components/PullDialog.jsx`** *(new)* — picker → parsing → confirm flow for new-job pull.
- **`src/components/ResyncDialog.jsx`** *(new)* — picker → parsing → diff → apply flow for in-job pull.
- **`src/components/DiffView.jsx`** *(new)* — row-level summary diff component, used by Resync and Push.
- **`src/components/ExportDialog.jsx`** — adds a "Push to xlsx" mode alongside the existing "Build Export."
- **`src/components/JobView.jsx`** — adds "Re-sync from xlsx" and "Disconnect from xlsx" entries to the existing options menu.

## Parser (`src/lib/xlsxParser.js`)

### Signature

```ts
parseChecklistXlsx(arrayBuffer: ArrayBuffer) → Promise<ParsedXlsx>

type ParsedXlsx = {
  jobMeta: {
    name: string;          // derived from filename if filename hint provided, else null
    client: string;        // always '' (not round-trippable)
    location: string;      // always '' (not round-trippable)
    notes: string;         // recovered from Notes sheet "Job Notes" section, else ''
  };
  panels: ParsedPanel[];   // distinct panels derived from the Panels sheet
  rowsBySheet: {
    [sheetName: string]: ParsedRow[];
  };
  sheetNotes: ParsedSheetNote[];   // (panel, sheet) → text, recovered from Notes sheet
  warnings: ParseWarning[];
  errors: ParseError[];
};

type ParsedPanel = { name: string; sourceRowIndex: number };

type ParsedRow = {
  panelName: string | null;     // value of "Panel Name" column on this row, if present
  data: Record<string, any>;    // header → cell value, only for known schema columns
  notes: string;                 // recovered from Notes sheet, else ''
  sourceRowIndex: number;
};

type ParsedSheetNote = { panelName: string; sheetName: string; text: string };

type ParseWarning =
  | { kind: 'unknown-sheet'; sheetName: string }
  | { kind: 'missing-sheet'; sheetName: string }
  | { kind: 'extra-column'; sheetName: string; columnName: string }
  | { kind: 'missing-column'; sheetName: string; columnName: string }
  | { kind: 'unknown-panel-reference'; sheetName: string; panelName: string; rowCount: number }
  | { kind: 'notes-row-unmatched'; sheetName: string; panelName: string; label: string };

type ParseError =
  | { kind: 'invalid-xlsx'; message: string }
  | { kind: 'no-recognized-sheets' };
```

### Algorithm

1. **Open with ExcelJS.** `await wb.xlsx.load(arrayBuffer)`. On throw → return `{ errors: [{ kind: 'invalid-xlsx', message }] }`.
2. **Build sheet index.** `wb.worksheets.map(ws => ws.name)`.
3. **Recognize sheets.** A sheet is "recognized" if its name is a key in `schemaMap`. If zero recognized → `errors: [{ kind: 'no-recognized-sheets' }]`. Otherwise proceed.
4. **Parse Panels sheet first** (canonical panel list). Panels sheet's "Panel Name" column gives the authoritative set of panels. Each row produces one `ParsedPanel`. Rows with empty Panel Name get a synthetic name `Unknown panel #N` and a warning (defensive only — exporter never writes one).
5. **Parse other recognized sheets.**
   - Look up `schemaMap[sheetName]`. Use `schema.header_row` to find the header row.
   - Build a `headerIndex: { [normalizedHeader]: colNumber }` where normalization = trim + collapse internal whitespace + lowercase. **Exact-match required.**
   - For each schema column missing from headers → warning `{ kind: 'missing-column', sheetName, columnName }`. Field treated as null in all rows.
   - For each header in xlsx not in schema → warning `{ kind: 'extra-column', sheetName, columnName }`. Skipped.
   - Walk data rows from `schema.first_data_row` until two consecutive empty rows. For each row:
     - Build `data: { [field]: cellValue }` for known columns only.
     - Cell value extraction:
       - text → string (preserve newlines)
       - number → number
       - boolean → boolean (preserves cell-checkbox state)
       - date → ISO string
       - formula → `cell.value.result` (computed value); if no result, `null`
       - hyperlink object → `cell.value.text`
       - null/empty → `null`
     - `panelName` = `data['Panel Name']` if present, else `null`.
     - **Skip the schema's `hyperlink_column`** (e.g., "Folder Hyperlink") — these are export-time only and never round-trip.
     - **Skip the row entirely** if all known columns are null/empty (defensive against trailing example rows the exporter clears).
6. **Parse Notes sheet.**
   - If absent → `sheetNotes: []`, `jobMeta.notes: ''`. No warning.
   - Row 1 col 1 may be the literal string `"Job Notes"`. If so, row 2 col 1 is the merged text → `jobMeta.notes`. Skip past the `"Job Notes"` block.
   - Find the row where col 1 = `"Sheet"`, col 2 = `"Panel"`, col 3 = `"Row"`, col 4 = `"Notes"` (the appendix table header). Walk subsequent rows until an empty row.
   - Each appendix row produces:
     - If `Row` cell = `"(sheet)"` → push to `sheetNotes` as `{ panelName, sheetName, text }`.
     - Else → match-by-label: find the parsed row in `rowsBySheet[sheet]` with matching `panelName` AND matching display label (computed via `rowDisplayLabel`). On match → set that row's `notes`. On no match → warning `{ kind: 'notes-row-unmatched', sheetName, panelName, label }` (note text is dropped).
7. **Sheets in schema but missing from xlsx** → warning `{ kind: 'missing-sheet', sheetName }`. (No rows recovered for that sheet — diff treats as no-change.)
8. **Sheets in xlsx but not in schema** AND not in `['Rev', 'Checklist', 'Notes']` (well-known auxiliary names the exporter writes) → warning `{ kind: 'unknown-sheet', sheetName }`.
9. **Panel-name validation across sheets.** For each non-Panels sheet, group rows by `panelName`. Names not in the Panels sheet's panel list → warning `{ kind: 'unknown-panel-reference', sheetName, panelName, rowCount }`. Those rows are kept in the parsed result; downstream logic decides whether to attach them to a synthetic Unknown panel or drop them.

### Filename hint

`parseChecklistXlsx` does not see the filename. Callers pass `filename` separately when constructing `jobMeta.name`:

```js
function nameFromFilename(filename) {
  return filename.replace(/\.xlsx$/i, '').replace(/[_-]+/g, ' ').trim();
}
```

The Pull confirm dialog pre-fills the name field with this; user can edit before creating the job.

### Out of scope for the parser

- Photo extraction. Embedded images in the xlsx are ignored.
- Cell formatting, comments, conditional formatting, charts.
- ExcelJS `fixZip` artifacts (FeaturePropertyBag, etc.) — irrelevant on read; ExcelJS produces correct cell values regardless.
- Checklist sheet (manual completion state) — round-tripping is YAGNI for v1; users redo the checklist tab if they care.

## Diff Algorithm (`src/lib/jobDiff.js`)

### Signature

```ts
diffJobs(
  localState: { localJob: Job; localPanels: Panel[]; localRowsBySheet: Record<string, Row[]>; localSheetNotes: Record<string, Record<string, string>> },
  parsedXlsx: ParsedXlsx,
  schemaMap: SchemaMap,
  options?: { direction?: 'pull' | 'push' }
) → JobDiff

type JobDiff = {
  jobMeta: { changed: { field: 'name' | 'client' | 'location' | 'notes'; old: string; new: string }[] };
  panels: { added: ParsedPanel[]; removed: Panel[]; matched: { local: Panel; xlsx: ParsedPanel }[] };
  sheets: {
    [sheetName: string]: {
      added: ParsedRow[];
      removed: Row[];
      modified: { local: Row; xlsx: ParsedRow; label: string; fieldChanges: { field: string; old: any; new: any }[] }[];
      unchanged: { local: Row; xlsx: ParsedRow; label: string }[];
      labelCollisions: string[];
    };
  };
  sheetNotes: { added: ParsedSheetNote[]; removed: { panelName: string; sheetName: string; text: string }[]; modified: { panelName: string; sheetName: string; old: string; new: string }[] };
  skippedSheets: string[];      // copied from parsed warnings
  skippedColumns: { sheetName: string; columnName: string }[];
  missingSheets: string[];
};
```

### Row-matching algorithm (per sheet)

1. Compute `label` for every local row using `rowDisplayLabel(row, sheetName, schemaMap[sheetName])`.
2. Compute `label` for every parsed xlsx row the same way (treat `parsedRow.data` like an in-memory `row.data`).
3. Group rows on each side by `(panelName, label)` — panel scoping prevents cross-panel collisions.
4. For each `(panelName, label)` group that appears on both sides:
   - Same count → pair by position. Each pair becomes `modified` or `unchanged` based on field comparison.
   - Different counts → pair by position up to the smaller count; surplus on the larger side becomes `added` or `removed`.
   - If the group has >1 row on either side, push `label` to `labelCollisions[]` for the UI hint.
5. Groups that appear on **only one side** → wholesale `added` or `removed`.
6. **Empty-label rows** (label = `null` or `''`) bucket into a single `(panelName, '')` group per sheet+panel, paired by position.

### Field comparison

For each schema column on both sides:

- **String:** trim both sides. `'' ≡ null ≡ undefined` (treated equal).
- **Number:** strict equality. NaN ≡ NaN treated equal.
- **Boolean:** strict equality. `null ≡ undefined ≡ false` treated equal.
- **Date:** compare ISO strings.

If at least one comparison differs → `modified`. Otherwise → `unchanged`.

The schema's `hyperlink_column` (e.g., "Folder Hyperlink") is excluded from comparison — it's an export-time concern.

### Job-meta diff

Compare `localJob.{name, client, location, notes}` vs `parsedXlsx.jobMeta`. **`client` and `location`** are always `''` on the xlsx side (not round-trippable), so they only appear in `changed[]` if local has a value AND user is doing a Re-sync. To prevent spurious "client cleared" diffs, the diff function treats xlsx-side `client === ''` and xlsx-side `location === ''` as "not present" and excludes those fields from the diff. Only `name` and `notes` round-trip.

### Panel diff

Compare panel-name sets between local and xlsx. Panels in xlsx but not local → `added`. Panels in local but not xlsx → `removed`. Panel-name change isn't expressible — that'd surface as one removed + one added.

### Sheet-note diff

Per `(panelName, sheetName)` pair:
- In xlsx, not local → `added`.
- In local, not xlsx → `removed`.
- In both, text differs → `modified`.

### Push direction (semantic flip)

When `options.direction === 'push'`, the diff is computed identically but the UI inverts column labels: `removed` becomes "will be removed in SharePoint" (i.e., locally not present), `added` becomes "will be added to SharePoint." Same data structure; UI presentation differs via `direction` prop.

### Reordering is not a change

Position only matters for within-`(panelName, label)` tie-breaking. A row that moved positions with no field changes is `unchanged`.

### Per-row keep/drop decision (Re-sync only)

`removed[]` rows in the diff each get a per-row keep/drop toggle in the UI. Default = "accept removal" (drop). The apply step honors per-row decisions. `added` and `modified` rows are bulk-accepted (no per-row toggle).

## UI Flows

### 3a. JobList FAB: Pull-or-New modal

Today: FAB tap → opens `JobModal` directly. New behavior: FAB → `<PullOrNewModal>` with two `.modal-list-btn` rows:

```
┌─────────────────────────────────────┐
│  [+]  New investigation             │  (matches existing "+" icon)
│       Start a fresh job             │
├─────────────────────────────────────┤
│  [↓]  Pull from xlsx                │  (download/cloud-down icon)
│       Import an existing checklist  │
└─────────────────────────────────────┘
```

Tap outside dismisses. Reuses existing modal styles.

### 3b. PullDialog (new-job pull)

Stages: `'idle' | 'parsing' | 'confirm' | 'creating' | 'done' | 'error'`.

1. **`idle`:** Visible "Choose file" button + "Cancel". Hidden `<input type="file" accept=".xlsx,.xls">` triggered by button. (Auto-clicking the input on mount is unreliable on iOS.)
2. **`parsing`:** Spinner + "Reading…". On error → `error` stage. On warnings only → `confirm`.
3. **`confirm`:** Filename, parsed counts (`N panels · M rows · K notes`), warnings list (collapsible if >3), editable job-name field (pre-filled with `nameFromFilename(file.name)`), client/location text inputs (blank), buttons: Cancel / Create job.
4. **`creating`:** Spinner. Calls `applyParsedXlsxToNewJob(parsed, { name, client, location })`. Single transaction across `jobs`, `panels`, `rows`, `sheetNotes`. Sets `source = { kind: 'xlsx', filename, pulledAt: Date.now() }`.
5. **`done`:** Toast "Imported from `Acme_Plant.xlsx`." Navigate to the new job.
6. **`error`:** Error message + Retry / Cancel buttons.

### 3c. ResyncDialog (in-job pull)

Reached via the JobView options menu's new "Re-sync from xlsx" item. Stages: `'idle' | 'parsing' | 'diff' | 'applying' | 'done' | 'error'`.

`diff` stage shows the `<DiffView direction="pull" />` component, which presents:

```
Re-sync — Acme_Plant_Investigation.xlsx
────────────────────────────────────────
Job name: Acme Plant — May 2026 → Acme Plant — Apr 2026
Job notes: …diff…
─────────
Panels (3 changes)            ▼
  ~ MCC-0025
      Location: North Pump Room → B-Wing Mech
  + PNL-0042 · West Cooler
  − JB-0011 · Old Junction          [keep local | accept removal]
PLC Slots (1 change)          ▼
  ~ Slot 5 · 1756-OW16I
      Notes: (empty) → Spare for future use
Drive Parameters              ▶  no changes (collapsed)
────────────────────────────────────────
⊘ "Punchlist" sheet skipped
⊘ "Cost Estimate" column skipped in Panels
[Cancel]                       [Apply changes]
```

Apply step:

1. Open a single `idb` transaction across `jobs`, `panels`, `rows`, `sheetNotes`, `photos` (read-only on photos).
2. Update `job.name` / `job.notes` if changed.
3. For each panel `added` → create new panel record.
4. For each panel `removed` → delete the panel **only if** all its rows are in the diff's `removed[]` AND user chose "accept" for all of them; else leave the panel in place (rare edge case).
5. For each sheet:
   - Delete `removed[]` rows where user chose "accept removal." Their photos: detach from row (set `photo.rowId = null` so they become panel-level photos), do not delete the photos themselves.
   - Update `modified[]` rows (overwrite `data` and `notes` from xlsx side; preserve row ID and `idx`).
   - Insert `added[]` rows (new IDs, panel matched by `panelName`, `idx` = current sheet max + position).
6. For each sheet-note diff, write the new text or delete.
7. Update `source.pulledAt = Date.now()`.

If transaction throws → `error` stage with retry; no partial writes.

### 3d. ExportDialog: Push mode

The existing component grows a small mode toggle at the top of the `config` stage:

```
[ Build Export (zip) ◯ ]  [ Push to xlsx ● ]
```

When `Push to xlsx` is selected:

- If `job.source` exists: shows the filename hint + two buttons:
  ```
  You pulled this from "Acme_Plant_Investigation.xlsx" on Apr 28.
  To overwrite, pick that file. Otherwise, save new.
  [Pick target file]   [Save as new]
  ```
- If `job.source` is null: only `[Save as new]`.

**Pick target file** path:

1. File picker → `parsing` → `diff` (DiffView with `direction="push"`). User confirms.
2. Run `buildExport(job, { mode: 'xlsx-only' })` (new option that omits photos, backup.json, csv).
3. `downloadBlob` / `shareBlob` flow as today. User routes to OneDrive themselves.
4. On success, set `source.filename = pickedFile.name; source.pulledAt = Date.now()`.

**Save as new** path: skip diff. Run `buildExport(job, { mode: 'xlsx-only' })`. Suggested filename: `source.filename` if present, else `safe(job.name) + '.xlsx'`. Do not modify `source`.

### 3e. JobView options menu additions

Two new entries:
- **Re-sync from xlsx** (always visible) → opens `ResyncDialog`.
- **Disconnect from xlsx** (visible only if `job.source != null`) → confirm dialog, sets `source = null`.

### 3f. `buildExport` adds `mode` option

```ts
buildExport(job, { mode: 'zip' | 'xlsx-only', onProgress, ... })
```

`mode: 'zip'` (default) is today's behavior. `mode: 'xlsx-only'` returns `{ blob, filename, sizeBytes }` where `blob` is just the xlsx (no zip wrap, no photos, no csv, no backup.json). `filename` = caller-supplied or default sanitized job name + `.xlsx`.

## Error Handling

| Failure | Where | Behavior |
|---|---|---|
| User cancels picker | All flows | No-op, dialog stays |
| Picker returns >1 file | All flows | Take first, ignore rest |
| File ext / type mismatch | All flows | Reject with toast: "This isn't an .xlsx file. Pick a .xlsx exported from e-OIC or compatible." |
| File > 50 MB | All flows | Reject with toast: "File looks too large to be a checklist (>50 MB). Pick the right file?" |
| ExcelJS throws on load | Parser | Return `errors: [invalid-xlsx]` → dialog shows "Couldn't read this file…" + retry |
| Zero recognized sheets | Parser | Return `errors: [no-recognized-sheets]` → dialog shows "Doesn't look like an e-OIC checklist…" + retry |
| Parser warnings | Parser | Always non-blocking; surfaced in confirm/diff stage |
| `applyResync` transaction abort | Resync | Toast + error stage with retry; no partial writes |
| Photo orphaned during Resync | Resync apply | Photo's `rowId` set to null (becomes panel-level); count surfaced in success toast |
| `buildExport` throws in push | ExportDialog | Existing error stage handles |
| Diff against target file fails | Push | Fall back to "Save as new" with toast: "Couldn't read target file. Saving as new instead." |
| `shareBlob` rejects | Push | Existing fallback chain handles |

### iOS-specific quirks (call out for QA)

- iOS Files-app may copy cloud files to a temp path before returning the File. Invisible to us; we just store `file.name`.
- OneDrive offline-only files trigger a brief on-demand download before parsing; spinner covers it.
- `accept=".xlsx"` is sometimes ignored by the iOS Files picker for cloud providers. Defensive ext-check after pick rejects mismatches early.

## Testing

### Unit tests (`node:test`, no new dep)

**`src/lib/xlsxParser.test.js`** — fixtures in `src/lib/__fixtures__/`:

- `valid-seed.xlsx` — clean export of seed job (generated once via `scripts/gen-fixtures.mjs`)
- `extra-column.xlsx` — Panels has an added "Cost Estimate" column
- `missing-column.xlsx` — Power is missing "Voltage"
- `unknown-sheet.xlsx` — extra "Punchlist" tab
- `cell-checkbox-states.xlsx` — boolean column with mix of true/false/null
- `corrupt.bin` — random bytes with `.xlsx` extension

Tests assert:
- Warning shape and counts
- Recovered row counts per sheet
- Recovered field values match seed
- Cell-checkbox booleans preserved
- Notes-sheet recovery: job-notes + per-row notes + per-(panel,sheet) notes
- Structure-rejection on corrupt input

**`src/lib/jobDiff.test.js`** — pure data-in-data-out:

- Clean unchanged job (zero changes)
- Single field change in one row
- Added / removed / modified row in same sheet
- Identical-label collision (two `Slot 5` locally, three in xlsx)
- Empty-label rows paired by position
- Job-meta `name`/`notes` change (not `client`/`location`)
- Panel added / removed
- Sheet-note added / removed / modified
- Skipped sheets/columns flow through correctly
- `direction: 'push'` flag flips semantics

### E2E (extend `scripts/e2e-test.mjs`)

After the existing export step, add:

1. **Round-trip:** parse the just-exported xlsx → assert recovered job equals seed (modulo photos and IDs).
2. **Resync no-op:** diff seed job vs parsed-just-exported → assert zero changes across all sheets.
3. **Resync with edit:** mutate one cell in the parsed result → diff → assert exactly one `modified` row with expected `fieldChanges`.

E2E continues to attach the exported xlsx to GitHub Actions' `sample-export` artifact for inspection.

### Manual QA (real devices)

Document this checklist in the spec for use during ship verification:

- iPad Safari, Files-app → OneDrive: Pull from FAB completes; row count matches xlsx.
- iPad Safari: Re-sync inside an existing job that has photos. Photos labeled to matching xlsx rows stay attached; orphans detach to panel-level.
- iPad Safari: Push to xlsx with overwrite. Diff renders correctly. File downloads. Files-app save → OneDrive → SharePoint copy updates.
- Desktop Chrome: same three flows.
- Hand-edit an exported xlsx in Excel (add a row, change a value, mark a checkbox) → re-sync → diff shows exactly those edits.
- Pull a non-xlsx file (e.g., a PDF) → friendly error.
- Pull the wrong xlsx (e.g., quarterly budget) → "doesn't look like an e-OIC checklist."
- Disconnect from xlsx → push goes to Save-as-new only.

## Version

This ships as **v32**. Bump both `src/version.js` BUILD_VERSION and `public/service-worker.js` VERSION in lockstep per project convention.

## File Map

```
NEW
  src/lib/xlsxParser.js
  src/lib/xlsxParser.test.js
  src/lib/__fixtures__/                  (committed; CI runs unit tests against them)
  src/lib/jobDiff.js
  src/lib/jobDiff.test.js
  src/lib/xlsxRoundTrip.js
  src/components/PullOrNewModal.jsx
  src/components/PullDialog.jsx
  src/components/ResyncDialog.jsx
  src/components/DiffView.jsx
  scripts/gen-fixtures.mjs               (one-shot generator, run once + commit fixtures)

MODIFIED
  src/components/JobList.jsx             (FAB → PullOrNewModal)
  src/components/JobView.jsx             (options menu: Re-sync, Disconnect)
  src/components/ExportDialog.jsx        (push mode + diff confirm)
  src/exporter.js                        (buildExport accepts mode: 'xlsx-only')
  src/db.js                              (createJob accepts source; updateJob already passes through)
  src/styles.css                         (DiffView styling, mode toggle in ExportDialog)
  scripts/e2e-test.mjs                   (round-trip assertions)
  src/version.js                         (BUILD_VERSION → 'v32')
  public/service-worker.js               (VERSION → 'v32')
```

## Risks and Mitigations

- **Parser drift from exporter format.** If exporter changes, parser breaks silently. Mitigation: round-trip e2e assertion catches divergence in CI on every push.
- **iOS Files-app picker quirks.** Mitigation: defensive ext check, friendly errors, manual QA list explicitly covers iOS Safari.
- **Label collisions from `rowDisplayLabel`.** Mitigation: `labelCollisions[]` surfaced in diff UI; documented edge case.
- **Photos detaching during Re-sync row deletion.** Mitigation: photos never deleted by Re-sync; orphans become panel-level (visible in panel photo grid).
- **`applyResync` transaction scope.** All writes in a single `idb` transaction; throw → no partial state.
