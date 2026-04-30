# e-OIC — Specification

**App name:** e-OIC
**Long form:** eTechGroup Onsite Investigation Checklist
**Version:** 1.1.0
**Status:** Built and smoke-tested
**Author:** [Your name]
**Last updated:** 2026-04-30

---

## 1. Purpose

**e-OIC** (eTechGroup Onsite Investigation Checklist) is a mobile-first
Progressive Web App for controls/automation field engineers conducting
onsite investigations. The app interactively populates the existing
`3_1_Onsite_Investigation_-_Template_v1_1.xlsx` survey workbook and
captures organized, geo-tagged photos. It runs offline once installed,
needs no app-store submission, and is deployed via GitHub Pages.

The name combines the eTechGroup brand prefix (**e**) with the activity
acronym (**OIC** — Onsite Investigation Checklist).

---

## 2. Goals & Non-Goals

### Goals

- Replace the workflow of "fill out a paper form, take loose photos on the
  phone, then transcribe everything into Excel back at the office" with a
  single integrated capture-and-organize tool.
- Produce a final deliverable that is **identical in structure** to the
  existing Excel template — clients and internal reviewers see no change in
  format, only better-organized data.
- Keep the photo-to-spreadsheet linkage intact: every "Photo Hyperlink" /
  "Folder Hyperlink" cell in the export points to the actual photos folder
  for that row, so a colleague unzipping the export can click through from
  any cell to the relevant images.
- Work fully offline at the job site (cellular service in industrial
  facilities is unreliable).
- Avoid Apple Developer / Google Play accounts, Xcode, code signing, and
  app-store reviews.

### Non-Goals

- This is **not** a multi-user/cloud app. All data is local to the device.
  Sharing is via file export (zip) or backup file (JSON), not via a server.
- Not a real-time collaboration tool. Two engineers on the same job each
  capture independently and merge later via per-job backup import.
- Not a replacement for the Excel template itself — the template defines
  the schema and the deliverable format. The app is the data-entry layer.
- No financial transactions, account creation, or anything that requires
  server-side state.

---

## 3. Target Platform & Distribution

- **Hosting:** GitHub Pages, root deploy. Site lives at
  `https://<username>.github.io/<repo-name>/`. A custom domain can be added
  later without code changes (`base: './'` in vite.config.js makes this work).
- **Deployment:** Auto-deploy on every push to `main` via GitHub Actions
  workflow (`.github/workflows/deploy.yml`). One-time manual setup: enable
  Pages with "Build and deployment → Source: GitHub Actions" in repo settings.
- **Installation on device:** Open the Pages URL in Safari (iOS) or Chrome
  (Android), use "Add to Home Screen". After first load the service worker
  caches everything, so subsequent launches are offline-capable.
- **No app stores. No Xcode. No Apple Developer / Google Play accounts.**

---

## 4. Data Model

### 4.1 Hierarchy

```
Job  (top-level, e.g., "Acme Plant — May 2026")
└── Panel  (working unit, e.g., "CP2", "MCC-A")
    ├── Rows × 13 sheets  (one row = one device/circuit/etc.)
    │   ├── Row notes
    │   └── Row-level photos
    ├── Sheet-level notes (one per (panel, sheet))
    └── Panel-level checklist photos (Full Panel, Each Door, etc.)
```

A **Job** is the deliverable. A **Panel** is the working unit on the floor.
All 13 data sheets in the template (Panels, Power, PLC Racks, PLC Slots,
Fieldbus IO, Network Devices, HMIs, Ethernet Switches, Drive Parameters,
Conv. Speeds, Safety Circuit, Safety Devices, Peer to Peer Comms) exist
under every panel, but most will have zero rows for any given panel —
that's expected.

### 4.2 IndexedDB Stores

All data lives in IndexedDB on the device. There is no server.

| Store        | Keyed by                          | Holds                                                    |
| ------------ | --------------------------------- | -------------------------------------------------------- |
| `settings`   | `key`                             | Theme, geolocation consent, generic key/value flags      |
| `jobs`       | `id`                              | Job metadata (name, client, location, job-level notes)   |
| `panels`     | `id` + index `jobId`              | Panel metadata                                            |
| `rows`       | `id` + indexes `panelId`, `panelId_sheet` | One row per record across 13 sheets             |
| `sheetNotes` | `id` + indexes `panelId`, `panelId_sheet` | One note record per (panel, sheet)              |
| `photos`     | `id` + indexes `panelId`, `panelId_sheet_item`, `rowId` | All photo blobs + EXIF metadata    |

Photos are stored as `Blob` objects (binary), not base64. This is roughly
1.4× more space-efficient than base64 in storage and avoids the perf cost
of decoding on render.

### 4.3 Row Schema

Each row is `{ id, panelId, sheet, idx, data, notes, updatedAt }`. The
`data` object is keyed by **column header** (the human-readable string,
not column index), so it survives template column reordering as long as
header text doesn't change.

### 4.4 Photo Schema

`{ id, panelId, sheet, item, rowId?, blob, mime, w, h, takenAt, gps? }`

- `rowId == null` → **panel-level** photo (Photo Checklist item like
  "Full Panel", "Each Door")
- `rowId` set → **row-level** photo (one drive, one PLC card, etc.)
- `gps` is `{ lat, lng, accuracy, capturedAt } | null`

---

## 5. Schema Generation

`scripts/build-schema.py` parses the template once at build time and emits
`src/schema.json`. The schema records, per data sheet:

- `header_row` and `first_data_row` — Network Devices uses 3/4, every
  other sheet uses 2/3 because Network Devices has a description note row at the top
- `columns` — array of `{ index, group, header }` with merged-cell groups
  ("General Data", "Photo Checklist", etc.) flood-filled left-to-right
- `photo_checklist_columns` — the panel-level shot list for that sheet
- `hyperlink_column` — auto-filled at export time
- `primary_key` — hand-picked column header used as both the row picker
  label and the photo folder name (Panel Name / Device Name / Rack Name /
  HMI Name / Circuit Name / Slot / Name as appropriate)
- `row_photos_enabled` — `true` for all 13 data sheets

To support a template revision: drop the new `.xlsx` into `public/template.xlsx`,
re-run `build-schema.py`, bump `VERSION` in `public/service-worker.js`,
push to main.

---

## 6. UI / Navigation

Hash-based router with four routes:

- `#/` — **JobList** — list of jobs with last-edited timestamps, search bar,
  per-job photo/panel counts. Settings cog. FAB to create.
- `#/job/<jobId>` — **JobView** — list of panels under one job. Per-job
  Export and Backup. Edit/duplicate/delete each panel.
- `#/job/<jobId>/panel/<panelId>` — **PanelView** — tab strip across the 13
  sheets with progress dots (empty/partial/complete). Active tab renders
  `SheetForm`.
- `#/settings` — **SettingsView** — theme picker, geolocation toggle,
  full-DB backup/restore, About card.

### 6.1 Tab Progress Dots

For each sheet under the active panel:

- **empty** — no rows yet
- **partial** — at least one row exists; or, on sheets with a Photo
  Checklist, the panel-level shots aren't all captured yet
- **complete** — at least one row AND (no checklist OR all checklist
  items have ≥1 photo)

### 6.2 Row Picker

Each sheet may have multiple rows (one per drive, one per PLC slot, etc.).
The row picker shows a horizontal scrolling pill list. The active pill
gets reorder ↑↓ buttons and a delete ✕. Tapping a pill switches to that
row in the form editor.

### 6.3 Form ↔ Table View

When a sheet has more than one row, a Form/Table toggle appears. Form
view is the default — full data-entry form for the active row. Table
view is read-only and shows the first 10 non-photo, non-hyperlink
columns across all rows for at-a-glance review. Tapping a row in table
view jumps to the form editor.

### 6.4 Field Behaviors

- **Text fields** debounce-save 400 ms after the last keystroke. No
  manual "Save" button.
- **Long-text fields** (description / notes) render as `<textarea>`.
- **Numeric-looking fields** (volts/amps/HP/Hz/etc., detected by regex on
  the header) use `inputMode="decimal"` to surface the numeric keypad
  on mobile.
- **Boolean-looking fields** (`Completed`/`Complete`/`Uploaded`/`Backup`
  endings) render as checkboxes.
- **Hyperlink columns** are read-only at edit time and display a preview
  of the path that will be written at export.

### 6.5 Notes (three levels)

- **Job-level** — set in the New Job / Edit Job modal. Appears at the top
  of the appended Notes sheet in the export.
- **Sheet-level** — collapsible accordion at the top of every SheetForm.
  One per (panel, sheet). Debounced save at 500 ms.
- **Row-level** — collapsible group at the bottom of the row editor.
  One per row.

All three are aggregated into the export's appended **Notes** worksheet
with columns: Sheet | Panel | Row | Notes. The job-level note sits in
its own block above the table.

---

## 7. Photo Capture

### 7.1 Two Capture Surfaces

- **Panel-level Photo Checklist** — opened from the Photo Checklist group
  on sheets like Panels, Power, PLC Racks. Each checklist item (Full Panel,
  Each Door, Wiring Detail, etc.) gets its own bucket. `rowId === null`.
- **Row-level Photos** — opened from the "📷 Photos for this row" group at
  the bottom of every row editor. `rowId === <the row's id>`.

### 7.2 Capture Flow

Tapping a checklist item or "Capture for this row" opens the PhotoCapture
modal which provides two buttons:

- **Take Photo** — `<input type="file" capture="environment">` opens the
  camera directly.
- **From Library** — multi-select; each selected file is processed in
  sequence sharing one GPS reading (taken once at the start of the batch
  to avoid spamming the location service).

### 7.3 Per-Photo Processing Pipeline

For each captured/selected file:

1. Decode via `createImageBitmap` (supports HEIC on iOS where the OS
   handles transcoding).
2. Resize to long-edge ≤ 2400 px on a 2D canvas.
3. Burn an overlay rectangle into the bottom-right with three lines:
   - `<JobName> · <PanelName>`
   - `<SheetName> — <ItemOrRowLabel>`
   - `YYYY-MM-DD HH:MM` plus `📍 lat, lng ±Nm` if GPS is available.
4. `canvas.toBlob('image/jpeg', 0.85)` → JPEG blob.
5. If GPS is available, splice EXIF GPS tags (`GPSLatitude`,
   `GPSLongitude`, `GPSHPositioningError`, `GPSDateStamp`) into the JPEG
   using `piexifjs`. EXIF write failures are logged and skipped — the
   user still gets the photo with the visible overlay and the sidecar
   CSV record.
6. `addPhoto` to IndexedDB.
7. 20 ms haptic vibrate on save (where supported).

### 7.4 Geolocation Policy

- On first app launch, a **GeoPrompt** modal explains the three places
  GPS will be used (overlay, EXIF, sidecar CSV) and offers Enable / Not Now.
- The user's choice is persisted in `settings.geolocationConsent` as
  `'granted'` or `'denied'`. The prompt never appears again.
- Settings has a toggle that re-enables (re-triggers the OS permission
  request) or disables.
- During capture, `maybeGetGps()` only attempts a fix if consent is
  `'granted'`. Cached fixes from within the last 30 s may be reused;
  high-accuracy fix has an 8 s timeout.
- If the user blocked location at the OS level, Settings shows a hint
  to re-enable it via the phone's Settings → app permissions.

---

## 8. Export

### 8.1 Trigger

Job → **Export** button. Disabled when the job has zero panels.
Opens the ExportDialog with a progress bar and per-phase status.

### 8.2 Output Structure

A single zip named `<JobName>.zip` containing:

```
<JobName>.xlsx                              populated workbook (template-faithful)
<JobName>_photo_metadata.csv                photo sidecar with GPS / timestamps
Photos/<Panel>/<ChecklistItem>/IMG_001.jpg  panel-level shots
Photos/<Panel>/<Sheet>/<RowLabel>/IMG_001.jpg
                                            row-level shots
```

### 8.3 Workbook Population (in order)

1. Load `public/template.xlsx` (preserves all template formatting,
   headers, merged cells, colors, borders).
2. For each of the 13 data sheets, in `SHEET_ORDER`:
   - Map every column header in the schema to its actual column index in
     the loaded worksheet (re-resolved per export, so column reorders in
     the template don't break the exporter).
   - Walk the panels in creation order. For each panel, walk that panel's
     rows for the current sheet (sorted by `idx`).
   - Write each row's `data` into the matching cells. The hyperlink
     column gets `Photos/<Panel>/<Sheet>/<RowLabel>/` (or, on the Panels
     sheet, `Photos/<Panel>/Panels/<PanelName>/`).
   - Append a record to `notesAppendix` for every row note and every
     sheet-level note encountered.
3. Walk leftover rows below the last write position and clear any cells
   that still hold template example data. This is needed because
   `PLC Slots` ships with **four** example rows, not one.
4. Update the **Checklist** sheet: tick `Completed` (column C) for every
   "X Sheet" / "Devices Sheet" / "PLC Slots sheet" row whose corresponding
   data sheet has at least one row of real data in the export.
5. Append a **Notes** worksheet (created if missing) with:
   - Job-level notes block at the top
   - Header row: Sheet | Panel | Row | Notes
   - One row per `notesAppendix` entry, with `(sheet)` as the Row column
     for sheet-level notes

### 8.4 Photo Bundling

- Each photo is grouped into its destination folder. Panel-level photos
  go to `Photos/<Panel>/<Item>/`; row-level photos use the row's primary-key
  value as the folder name (Device Name / Rack Name / Slot / etc.) under
  `Photos/<Panel>/<Sheet>/`.
- Files within a folder are named `IMG_001.jpg`, `IMG_002.jpg`, … in
  capture order.
- The sidecar CSV records: panel | sheet | item_or_row | level | filename
  | taken_at_iso | gps_lat | gps_lng | gps_accuracy_m

### 8.5 Compression Mode

Zip is built with `compression: 'STORE'`, not DEFLATE. JPEGs are already
compressed; running them through DEFLATE costs CPU time on the phone for
no size benefit. The xlsx and CSV are tiny enough that the loss on
those is negligible.

### 8.6 Delivery to User

When build completes, two buttons appear:

- **Download** — saves the zip via `<a download>` to the device.
- **Share / Email / Cloud** — uses the Web Share API with files. On iOS
  and modern Android this opens the native share sheet, letting the user
  pick Mail, Drive, OneDrive, Dropbox, SharePoint, AirDrop, etc. directly.
  On platforms that don't support file sharing it falls back to download.

### 8.7 Progress Reporting

The exporter reports progress through a callback at five phases:

| Phase             | %     | Detail                                |
| ----------------- | ----- | ------------------------------------- |
| loading-libs      | 2     | Dynamic-importing exceljs + jszip      |
| loading-template  | 8     | Fetching `template.xlsx`               |
| populating        | 15–50 | "<sheet name>" being processed         |
| serializing       | 55    | `wb.xlsx.writeBuffer()`                |
| bundling          | 60–90 | "N / M photos" being added to the zip  |
| compressing       | 92    | Generating final blob                  |
| done              | 100   | Result ready                           |

Friendly errors:
- Out-of-memory → "Try exporting fewer panels at a time, or close other browser tabs"
- Template fetch failure → "The app may need to be reopened to refresh its cache"

---

## 9. Backup & Restore

### 9.1 Two Scopes

- **Full database backup** — Settings → ⬇ Backup all jobs. One JSON file
  with everything. Restore to a new device or use as a safety copy.
- **Per-job backup** — Job → ⋯ menu → Back up this job. Useful for
  handing one job to a colleague without exposing the rest of the database.

### 9.2 File Format

```json
{
  "backupVersion": 1,
  "exportedAt": 1714500000000,
  "jobs": [...],
  "panels": [...],
  "rows": [...],
  "sheetNotes": [...],
  "photos": [
    { "id": "...", "panelId": "...", "blob": "<base64>", "mime": "image/jpeg", ... }
  ]
}
```

Photos are base64-encoded inline, which inflates the file by roughly 1.4×
versus the raw bytes. In exchange the backup is a single self-contained
file that can be emailed, dropped into Drive, etc., without an
accompanying photo folder.

### 9.3 Restore Modes

- **Merge (default)** — only inserts records whose IDs aren't already in
  the local database. Existing data is untouched. Used by Settings → Restore.
- **Replace** — for any job in the import, delete that job (and all its
  cascading children) first, then insert. Used internally by the
  delete-with-undo flow.

---

## 10. Settings & Customization

### 10.1 Theme

Auto / Light / Dark. Auto follows the OS via `prefers-color-scheme` and
listens for changes. The chosen value is persisted in
`settings.theme`. Theme is applied as a `data-theme` attribute on `<html>`,
backed by CSS custom properties for every color.

### 10.2 Location Tagging

A single checkbox toggles geolocation consent. Status text underneath
shows the current state. If the OS-level permission was blocked
(consent === `'denied'`), a hint explains how to re-enable.

### 10.3 Backup / Restore

See section 9.

### 10.4 About

Static block showing version, storage location ("IndexedDB · local to
this device"), and offline status ("Yes (after first load)").

---

## 11. Reliability Patterns

- **Debounced save** on every text field (400 ms) and every notes field
  (500 ms). No manual save button anywhere.
- **Undo via toast** for delete actions on jobs, panels, and rows. The
  delete handler snapshots the relevant scope via `exportJobJSON` before
  calling `delete*`, then if the user taps Undo within 5 s, it
  re-imports the snapshot in `replace` mode.
- **Auto-clear example rows** in the export. The template ships with
  example data on data rows; if the app didn't aggressively clear it,
  exports would mix real and fake records.
- **Dynamic import** of ExcelJS + JSZip via `manualChunks` in
  vite.config.js — these libs (~300 KB gzipped) are only fetched when
  the user taps Export, not on initial PWA install.
- **Service worker** precaches `index.html`, `manifest.webmanifest`,
  `template.xlsx`, and assets, then serves them offline. `VERSION = 'v8'`
  bust on each deploy forces clients to fetch fresh.

---

## 12. Build & Deployment

### 12.1 Local Development

```bash
npm install
npm run dev          # Vite dev server on :5173
npm run build        # Production build → dist/
npm run preview      # Serve dist/ for local QA
```

### 12.2 GitHub Pages Deploy

The repo includes `.github/workflows/deploy.yml`. On push to main:

1. `actions/checkout`
2. `actions/setup-node` (Node 20, with npm cache)
3. `npm ci`
4. `npm run build`
5. `actions/upload-pages-artifact` from `./dist`
6. `actions/deploy-pages`

**One-time manual step:** Repo Settings → Pages → "Build and deployment
→ Source: GitHub Actions". After that, every push to main deploys.

### 12.3 Bundle Sizes

| Chunk                       | Min      | Gzipped  |
| --------------------------- | -------- | -------- |
| `index.html`                | 1.0 KB   | 0.5 KB   |
| `assets/index-*.css`        | 8.9 KB   | 2.4 KB   |
| `assets/index-*.js` (main)  | 252 KB   | **76 KB** |
| `assets/export-libs-*.js`   | 1,036 KB | 301 KB   |

The 301 KB `export-libs` chunk only loads when the user taps Export.
Initial PWA install is **76 KB gzipped**.

---

## 13. Tech Stack

| Layer          | Choice                                     | Why                                                 |
| -------------- | ------------------------------------------ | --------------------------------------------------- |
| Framework      | React 18 + Vite                            | Small bundle, fast HMR, ecosystem                   |
| Storage        | IndexedDB via `idb`                        | Local, async, supports Blob storage for photos      |
| Spreadsheet    | ExcelJS                                    | Preserves template formatting (SheetJS doesn't)     |
| Zip            | JSZip                                      | Browser zip writer; STORE mode for JPEGs            |
| EXIF           | piexifjs                                   | Mature, no dependencies, minimal code               |
| Icons          | Inline emoji + custom SVG                  | No icon font, no external requests                  |
| Service worker | Hand-rolled (no Workbox)                   | Tiny; total SW logic is ~30 lines                   |
| Routing        | Hash-based (no router library)             | One-page app, four routes; library would be overkill |

---

## 14. Verified Behavior

A Node-based smoke test (`smoke.mjs`) was used during development to
exercise the exporter end-to-end against a hand-built fixture and
re-open the resulting xlsx with `openpyxl` for assertions. Verified:

1. Spreadsheet populated correctly across multiple sheets (Panels, PLC
   Slots, Drive Parameters tested).
2. Hyperlink columns auto-filled with the correct folder paths.
3. Notes worksheet built correctly with job, sheet, and row notes
   aggregated.
4. Photos placed in the correct folder structure for both panel-level
   and row-level capture.
5. Photo metadata CSV correctly emits GPS coordinates when present and
   blank when absent.
6. PLC Slots' four example rows fully cleared.
7. Sheets with no real data (e.g., Power) have their example row cleared.
8. Checklist completion correctly ticks boxes for sheets that received data.
9. Network Devices `first_data_row=4` correctly handled (its example row
   sits at row 4, not row 3).

---

## 15. Known Issues

### 15.1 No data-validation dropdowns

The template has no native data-validation cells (verified by parsing
with openpyxl), so there's nothing to extract automatically. Fields
like "Phase" or "Communication Protocol" that have natural enum values
are currently free-text inputs. **Workaround:** users can type the
expected values; nothing rejects bad input.

### 15.2 Duplicate Panel does not copy photos

`duplicatePanel` copies rows + sheet notes but not photos. This is
intentional (photos are large and almost always panel-specific), but
some users might expect a full deep copy.

### 15.3 Backup file size grows quickly

A full-DB backup with hundreds of photos can produce a 100+ MB JSON
file because photos are base64-inlined. Loading such a file into the
restore tool can be slow on low-RAM phones. **Workaround:** use the
zip exports as the effective backup once a job is finalized, and only
keep small-job JSON backups for active work.

### 15.4 Web Share API support varies

On older Android browsers and Safari < 15, the share sheet may not
accept file payloads. The app falls back to a download in that case,
but the user has to manually attach the file in Mail / Drive / etc.

### 15.5 No conflict resolution on backup restore

Merge mode skips records whose IDs already exist; replace mode
deletes and overwrites. There's no per-record diff/merge UI. **Workaround:**
if two devices edited the same job independently, the second restore
won't see the first's edits.

### 15.6 Service worker cache must be busted manually

When the template revs or a UI bug fix ships, `VERSION` in
`public/service-worker.js` must be bumped manually. Forgetting this
means installed clients keep serving the old version until they
hard-refresh.

### 15.7 EXIF write may strip orientation

The capture pipeline draws the image to a canvas (which honors
orientation EXIF and bakes it into pixels), then re-encodes to JPEG.
The new JPEG has no orientation tag. This is correct — pixels are
already upright — but some photo viewers expect an orientation tag and
may misrender if their auto-rotate logic triggers.

### 15.8 No batch / multi-row paste

Each row must be created and filled individually. There's no
spreadsheet-style paste or import-from-CSV.

### 15.9 No multi-job export

Each job exports separately. To deliver three jobs to the same
client, the user has to export three times.

### 15.10 Photos store can grow unbounded

There's no automatic compaction or "delete photos older than X". A
user who never deletes a job will eventually fill the device's
IndexedDB quota (typically 50 % of free disk on phones, but
browser-dependent).

---

## 16. Feature Backlog

### 16.1 Short-list (likely valuable)

- **Per-row "duplicate" button.** "I have ten identical drives" is a
  common scenario; cloning a row's data with a fresh primary key would
  save a lot of typing.
- **Field-level dropdowns from a config.** Add a `enumColumns` block to
  schema.json (hand-curated for now) so Phase / Voltage / Protocol /
  Safety Rating fields show pickers instead of text inputs.
- **Quick-photo from row pill.** Long-press a row pill in the row picker
  to jump straight to its photos without opening the form first.
- **Bulk delete photos.** Select multiple thumbnails in the photo grid
  and delete them at once.
- **Job templates.** "Start from template" — pre-create N panels of
  type A, M panels of type B, with empty rows ready to fill. Saves
  setup time on big standardized installations.
- **Voice notes.** A microphone button in the row notes field that
  records a short audio clip and inlines a transcript via the Web
  Speech API. Handy when hands are busy.

### 16.2 Medium-effort

- **Annotated photos.** Tap-to-circle / arrow markup on a captured
  photo before save. Rendered into the canvas overlay.
- **Field validation.** Required-field flags per column (from a config),
  with the row pill showing a yellow dot if any required field is empty.
- **Export PDF report.** A formatted summary PDF generated from the
  same data, suitable for client deliverables that don't need the
  raw spreadsheet.
- **Drawing reference picker.** Some sheets have a "Drawing Reference"
  column. If the user uploads PDF drawings to the job, that field could
  become a picker that links back into the drawings.
- **Recent values / autocomplete.** Suggest recent entries for fields
  like "Area" and "Communication Protocol" based on what's been typed
  on prior rows in the same job.

### 16.3 Stretch

- **Two-way sync to OneDrive / Google Drive.** Per-job push that uses
  the user's already-authorized cloud rather than a custom backend.
  Conflict resolution would need design work.
- **Multi-engineer merge.** When two engineers covered different
  panels in the same job, allow merging their JSON exports into a single
  job with namespace handling for any colliding panel names.
- **Live collaboration.** Likely a non-goal for this app's deployment
  model, but doable on top of a dedicated backend if the use case
  arises.
- **Air-gapped client deployment.** Bundle the SPA into an Electron or
  Tauri shell for clients who can't host on Pages and don't want their
  field tablets hitting `*.github.io`.
- **Mass-import from prior Excel.** Read an existing populated
  template back in to seed the database, useful for migrating in-progress
  jobs that started in the spreadsheet.

---

## 17. Open Questions / Decisions Deferred

- **Auto-deploy on every push to main, or stage to a `pages-staging`
  branch first?** Currently set up as auto-deploy on main.
- **Service-worker update strategy.** Currently uses `skipWaiting()`
  on install + bumped `VERSION`, so the new SW takes over on next page
  load. A more conservative model would be to wait for all tabs to close.
- **Photo retention policy.** Currently photos live forever unless
  explicitly deleted. Some teams will want auto-prune of completed-and-
  exported jobs.
- **Cloud backup defaults.** Settings could remember "last used cloud
  share target" and one-tap re-share, but that's significant UX work.

---

## 18. Out-of-Scope (explicitly)

- User accounts, authentication, permissions
- Multi-tenant data isolation
- Server-side databases, APIs, or cloud functions
- Real-time multi-user editing
- Machine learning on captured photos (auto-classifying part numbers,
  reading nameplates, etc.)
- Native iOS or Android apps (no app stores in deployment plan)
- Localization / i18n (English only)
- Accessibility audit (basic a11y attributes are present; no formal WCAG audit)

---
