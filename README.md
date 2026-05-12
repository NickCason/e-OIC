# e-OIC — Onsite Investigation Checklist

**eTechGroup's** mobile PWA for controls/automation field engineers conducting
onsite investigations. Interactively populates the existing
`3_1_Onsite_Investigation_-_Template_v1_1.xlsx` survey workbook and captures
organized, geo-tagged photos. Works offline once installed. Runs in any
modern browser; installs to the home screen on iOS and Android.

> The name comes from the company prefix (**e** for eTechGroup) plus the
> activity acronym (**OIC** for Onsite Investigation Checklist).

## Quick start

```bash
npm install
npm run dev          # dev server on :5173
npm run build        # production build → dist/
npm run preview      # serve dist/ locally
```

## Deploy to GitHub Pages

This repo includes a GitHub Actions workflow that gates CI on every push and
auto-deploys to Pages **only from release branches** (`releases/vX.Y.Z`).

`develop` is the trunk. Pushes to `develop` or any `feature_*/**` branch run
the four gating jobs (`build`, `e2e-export`, `unit-test`, `lint`) but do not
deploy.

**One-time setup:**
1. Push the repo to GitHub.
2. Repo Settings → Pages → **Build and deployment** → **Source: GitHub Actions**.

**To deploy a release:**
1. Bump `version.json` on `develop`.
2. Cut a release branch from `develop`:
   ```bash
   git checkout -b releases/v$(node -p "require('./version.json').version")
   git push -u origin "$(git branch --show-current)"
   ```
3. CI runs the four gates, then the `deploy` job publishes to Pages. The site
   appears at `https://<username>.github.io/<repo-name>/`.

That's it. There's no Apple Developer account, no Play Store, no Xcode involved.

The site uses **relative paths** everywhere (`base: './'` in vite.config.js), so
it works whether served from a sub-path on Pages, a custom domain, or directly
from the file system.

## Architecture

- **React 18** + **Vite** — small bundle, instant HMR
- **IndexedDB** (via `idb`) — local-first storage, all data stays on the device
- **ExcelJS** — preserves the template's exact formatting, headers, and merged cells
- **JSZip** — packages the populated workbook with photos and metadata
- **piexifjs** — writes GPS coordinates into JPEG EXIF metadata
- **Service worker** — works offline once first loaded

The heavy export libs (ExcelJS + JSZip, ~1 MB raw) are **dynamic-imported** —
they're only loaded when the user taps "Build Export". Initial page load
is just **76 KB gzipped**.

## What goes into an export

Tap **Export** on a job → the app builds a `<JobName>.zip` containing:

```
<JobName>.xlsx                            populated workbook (template-faithful)
<JobName>_photo_metadata.csv              GPS, timestamps, file paths for every photo
Photos/<Panel>/<ChecklistItem>/IMG_*.jpg  panel-level shots (Full Panel, Each Door, etc.)
Photos/<Panel>/<Sheet>/<RowLabel>/IMG_*.jpg
                                          row-level shots (one PLC card, one drive, etc.)
```

The xlsx also contains an appended **Notes** sheet with job-level, sheet-level,
and per-row notes you wrote during the survey.

The `Photo Hyperlink` / `Folder Hyperlink` columns in each sheet are
auto-populated with the path to that row's photo folder, so opening the xlsx
on a computer (with the photos folder alongside) lets you click straight to
the corresponding photos.

## Data layout

- **Job** — the top-level container ("Acme Plant – May 2026")
- **Panel** — the working unit (CP2, MCC-A, etc.). All 13 sheets exist for
  every panel.
- **Row** — one entry within a sheet (one drive, one network device, etc.).
  Rows can be reordered, duplicated panels copy their rows.
- **Photos** — attached either to a panel-level checklist item (e.g. "Full Panel")
  or directly to a row.

## Photo handling

When you take a photo, the app:
1. Adds a visible overlay in the bottom-right with project, panel, sheet, and
   timestamp (and GPS, if enabled).
2. Embeds GPS coordinates into the JPEG's EXIF metadata (mapping apps and
   photo viewers can read this).
3. Records the GPS in the sidecar CSV included in the export.
4. Compresses to JPEG quality 0.85 with the long edge capped at 2400px to
   keep file sizes reasonable.

Geolocation is asked once on first launch. Toggle it anytime in Settings.

## Backup & restore

- **Settings → Backup all jobs** — single .json file with everything
  (photos as base64). Can be restored on another device or as a safety copy.
- **Per-job backup** — Job → ⋯ menu → Back up this job. Useful for sharing
  one job to a colleague.

## Updating the template

If the upstream template revs, drop the new .xlsx into `public/template.xlsx`
and regenerate the schema:

```bash
python3 scripts/build-schema.py public/template.xlsx > src/schema.json
```

Bump the service-worker `VERSION` in `public/service-worker.js` so users get
the new template.

## Tech notes

- The IndexedDB schema uses on-version migrations. The current version is 2;
  the v1→v2 migration adds row-level photo support, sheet notes, and a settings
  store, all without disturbing existing data.
- All field saves use a debounce (~400ms text, 500ms notes) to avoid hammering
  the DB on every keystroke.
- Deletes (jobs, panels, rows) snapshot the relevant state and offer 5s undo
  via toast.
