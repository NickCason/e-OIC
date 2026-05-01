# Live Photo Overlays + Library EXIF — Design

**Date:** 2026-04-30
**Status:** Draft
**Target version:** v28

## Problem

Two related issues with photo overlays in e-OIC:

1. **Overlays are stale.** The bottom-right info box (`{job} • {panel}`, `{sheet} — {item}`, timestamp, GPS) is burned into the JPEG pixels at capture time. If the user later renames the panel or job, every existing photo still shows the old name. There is no way to refresh.
2. **Library imports use the wrong metadata.** Photos imported from the device library run through the same path as a fresh camera capture: the overlay timestamp is *now*, and the GPS is the device's *current* location. The photo's own EXIF (capture time, original GPS) is ignored.

## Goal

Make the overlay reflect the current state of the survey, and make library-imported photos faithful to their own EXIF.

## Non-goals

- Editing or repositioning the overlay box.
- HEIC support beyond what the browser already provides.
- Migrating existing baked photos — see Wipe section.
- Manual override of EXIF values.

## Approach

Stop baking the overlay into stored pixels. Store the *original* image (downscaled, EXIF preserved). Render the overlay live as an HTML/CSS layer over `<img>`. Bake the overlay into JPEGs only at export time, using current panel/job names.

For library imports, read EXIF before processing and use the photo's own GPS and `DateTimeOriginal` instead of device-current values.

### 1. Storage shift

`photos.blob` becomes the *original* (downscaled to 2400 long-edge for parity with today's storage budget), with no burned overlay. The schema fields remain compatible (`takenAt`, `gps`, `w`, `h`, `mime`), but their semantics tighten:

- `takenAt`: epoch ms. For camera shots: `Date.now()` (unchanged). For library imports: EXIF `DateTimeOriginal` if present, else `file.lastModified`, else `Date.now()`.
- `gps`: `{ lat, lng, accuracy? } | null`. For camera shots: `maybeGetGps()` (unchanged). For library imports: parsed from EXIF GPS tags if present, else `null`. **Library imports never call `maybeGetGps()`.**

Existing photos in IndexedDB are wiped on schema upgrade (see below).

### 2. New helper: `src/lib/photoExif.js`

```js
import piexif from 'piexifjs';

export async function readPhotoExif(file) {
  try {
    const dataUrl = await blobToDataURL(file);
    const exif = piexif.load(dataUrl);
    return {
      gps: parseGps(exif.GPS),
      takenAt: parseDateTimeOriginal(exif.Exif),
    };
  } catch {
    return { gps: null, takenAt: null };
  }
}
```

- `parseGps(gpsIfd)`: reads `GPSLatitude`/`GPSLatitudeRef`/`GPSLongitude`/`GPSLongitudeRef`, converts DMS-rational to decimal degrees, applies N/S/E/W sign. Reads `GPSHPositioningError` into `accuracy` when present. Returns `null` if any required tag is missing.
- `parseDateTimeOriginal(exifIfd)`: reads `DateTimeOriginal` (`"YYYY:MM:DD HH:MM:SS"` local-time string per EXIF spec). Returns epoch ms, or `null` on parse failure.

Treats parse failures as "no metadata" — never throws.

### 3. New component: `src/components/PhotoOverlay.jsx`

Wraps an `<img>` with a positioned overlay computed from props:

```jsx
export default function PhotoOverlay({
  src, alt, jobName, panelName, sheetName, itemLabel, takenAt, gps, ...imgProps
}) {
  return (
    <div className="photo-overlay-wrap">
      <img src={src} alt={alt} {...imgProps} />
      <div className="photo-overlay">
        <div>{jobName} • {panelName}</div>
        <div>{sheetName} — {itemLabel}</div>
        <div>{fmtTimestamp(new Date(takenAt))}{gps ? `  ${fmtGps(gps)}` : ''}</div>
      </div>
    </div>
  );
}
```

CSS (in `src/styles.css`):

```css
.photo-overlay-wrap { position: relative; display: block; line-height: 0; }
.photo-overlay-wrap img { display: block; width: 100%; height: 100%; object-fit: cover; }
.photo-overlay {
  position: absolute;
  right: 6%;
  bottom: 6%;
  max-width: 88%;
  padding: 0.6em 0.9em;
  background: rgba(0, 0, 0, 0.62);
  color: #fff;
  font: 600 clamp(10px, 2.6cqw, 16px)/1.25 -apple-system, "Segoe UI", Roboto, sans-serif;
  border-radius: 8px;
  white-space: nowrap;
  pointer-events: none;
}
.photo-overlay-wrap { container-type: inline-size; }
.photo-overlay > div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
```

`container-type: inline-size` plus `cqw` units make the overlay font scale with the wrapper width, so thumbnails get small text and the lightbox gets large text — matching the proportional behavior of today's canvas-baked overlay.

### 4. Capture flow rewrite

`src/components/PhotoCapture.jsx` `handleFiles()` splits into two paths via a new arg:

```js
async function handleFiles(fileList, source /* 'camera' | 'library' */) {
```

- **Camera path:**
  - `gps = await maybeGetGps()`
  - `takenAt = Date.now()`
  - downscale via canvas to MAX=2400, JPEG q=0.85
  - if `gps`, inject EXIF GPS via existing `injectExifGPS` (lifted out of `photoOverlay.js`)
  - store `{ blob, w, h, gps, takenAt, ... }`

- **Library path** (per file):
  - `{ gps: exifGps, takenAt: exifTime } = await readPhotoExif(file)`
  - `gps = exifGps` (no fallback to device GPS)
  - `takenAt = exifTime ?? file.lastModified ?? Date.now()`
  - downscale to 2400, JPEG q=0.85
  - if `gps`, inject EXIF GPS into the downscaled blob
  - store

The two callsites in JSX (`cameraRef` `onChange` and `libraryRef` `onChange`) pass their respective `source`.

`applyOverlay()` is **no longer called from the capture path.** It stays in `photoOverlay.js` for the exporter to use. The downscale + EXIF-inject helpers move into a new `src/lib/photoStore.js` module shared by both paths:

```js
// src/lib/photoStore.js
export async function processIncomingPhoto(file, { gps }) {
  // canvas downscale to MAX=2400, JPEG q=0.85, optionally inject EXIF GPS
  // returns { blob, width, height }
}
```

### 5. Live overlay consumers

Replace each `<img>` that shows a stored photo with `<PhotoOverlay>`:

- `PhotoCapture.jsx` photo grid tiles (line ~179)
- `Lightbox.jsx` focused image
- `RowPhotos.jsx` thumbnails
- `PhotoChecklist.jsx` thumbnails

Each consumer already has `job`, `panel`, `sheetName`, and an item label in scope (or computed from a row). The label rule matches today's overlay:

```js
const itemLabel = photo.rowId ? rowLabelFor(photo.rowId) : (photo.item || photo.sheet);
```

`RowPhotos.jsx` and `PhotoChecklist.jsx` already know their row/item context. `Lightbox.jsx` is currently context-free — it accepts a `photos` array of `{ blob, blobUrl, ... }`. We extend the array shape to include `{ jobName, panelName, sheetName, itemLabel, takenAt, gps }` per photo (parents already have these), so `Lightbox` stays a dumb renderer.

### 6. Export bake

`src/exporter.js` line ~597 currently writes the stored blob directly:

```js
zip.file(`${folder}/${fname}`, ph.blob);
```

Replace with a bake step:

```js
const lines = [
  `${job.name} • ${panel.name}`,
  `${ph.sheet} — ${entry.itemLabel}`,
  fmtTimestamp(new Date(ph.takenAt)) + (ph.gps ? `  ${fmtGps(ph.gps)}` : ''),
];
const baked = await applyOverlay(ph.blob, lines, ph.gps);
zip.file(`${folder}/${fname}`, baked.blob);
```

`applyOverlay` is idempotent against an un-baked source (the source no longer has burned text). The lines use *current* `job.name` and `panel.name` straight from the in-memory job/panel objects already loaded for the export.

The CSV sidecar (line ~598) is unchanged — it already reflects current names and stored EXIF.

### 7. Schema bump + wipe

`src/db.js`:

```js
const DB_VERSION = 4;
// ...
if (oldVersion < 4) {
  if (db.objectStoreNames.contains('photos')) {
    tx.objectStore('photos').clear();
  }
}
```

Existing baked-overlay photos are deleted on first open after upgrade. No toast — the v-bump is the user's signal. Indexes survive the `clear()` (only rows are removed).

### 8. Backup compatibility

`exportJobJSON` / `importJobJSON` (the `.backup.json` round-trip) remain compatible: the photo blob is just bytes in base64. After this change, those bytes are originals, not baked. On restore they render with live overlay automatically — same as freshly imported library photos. No version field bump needed in the backup format.

## Edge cases

- **EXIF missing on library import.** `gps: null`, `takenAt: file.lastModified ?? Date.now()`. Overlay omits the GPS suffix; same visual as a camera shot with no location permission.
- **Photo with EXIF Orientation flag** (e.g., portrait shot from another phone). `createImageBitmap(file, { imageOrientation: 'from-image' })` respects it; pixels are stored upright. Overlay always anchors bottom-right relative to the upright image.
- **HEIC files.** If `createImageBitmap` rejects, the existing "format isn't supported" error message fires — unchanged.
- **Renaming a panel/job mid-session.** Live render. No DB write. No migration step. Lightbox already open: closing/reopening reflects the new name; if the rename happens with the lightbox open, the parent re-renders and props flow through (today's React tree handles this).
- **Photo array order.** `Lightbox` keys by `photo.id`; reordering is unaffected.
- **Long panel/job names.** Overlay text is `nowrap` with `text-overflow: ellipsis` per line, so it never wraps onto more than three lines and never extends past the wrap. Today's canvas overlay measures and grows the box; the live overlay caps at `max-width: 88%` of the image and ellipsizes. Acceptable trade-off — burned export still measures and grows.
- **Wipe blast radius.** The `photos` store clear runs once. Job/panel/row data is untouched. Users who care about retention should export before upgrading; the v-bump and the project pattern (direct-on-main, daily ships) make this acceptable.

## Testing

Real-device QA — Vitest covers the helpers (EXIF parser, `processIncomingPhoto`), but UI behavior is verified by hand on the installed PWA.

Unit tests:
- `src/lib/photoExif.test.js`: parses GPS DMS → decimal correctly for N/S/E/W; returns `null` for missing tags; parses `DateTimeOriginal` to epoch ms; returns `null` on bad input.
- `src/lib/photoStore.test.js`: `processIncomingPhoto` downscales, returns canvas dimensions, optionally injects GPS.

Real-device QA:
- Take a camera photo → overlay shows current panel/job names, timestamp ≈ now, device GPS if available.
- Rename the panel → overlay text on every existing photo updates immediately in grid + lightbox.
- Import a library photo with EXIF GPS + DateTimeOriginal → overlay shows photo's *original* date and *original* GPS (verify against the photo's known shoot location).
- Import a library photo without EXIF (e.g., a screenshot) → overlay omits GPS line suffix; timestamp uses `lastModified`.
- Export the job → open the produced xlsx; confirm embedded JPEG overlays show *current* panel name, the photo's own timestamp/GPS, and a measured (non-ellipsized) overlay box.

CI artifact:
- The existing `npm run test:e2e` sample-export pipeline produces an xlsx artifact. Inspect a baked photo cell in that artifact for the post-bake overlay.

## Rollout

- Bump `src/version.js` `BUILD_VERSION` and `public/service-worker.js` `VERSION` to `v28` in lockstep.
- Push to `main`. GitHub Actions auto-deploys to Pages.
- No feature flag. The schema wipe is the breaking change; new behavior is monotonic for new photos.

## Risk

Moderate.

- **One-time photo loss** on every existing install. Mitigated by user awareness of the v-bump cadence; export-before-upgrade is the documented escape hatch.
- **Live overlay vs. baked overlay visual drift.** Live uses CSS `cqw` units; baked uses canvas measureText. We accept small differences in font hinting; the rounded-rect size differs (CSS caps, canvas grows) but the content is identical. The export remains the canonical artifact.
- **EXIF parse failures.** Caught and treated as "no metadata"; never throws to the user.
- **Wipe affecting backup recovery.** `.backup.json` re-import after upgrade still works (it writes via `addPhoto`, which goes into the post-wipe store). Users with v27 photos who export-before-upgrade can re-import and get live overlays on top.

## Files touched

- **New**
  - `src/lib/photoExif.js` — EXIF read helper
  - `src/lib/photoStore.js` — downscale + EXIF-inject helper (extracted from `photoOverlay.js`)
  - `src/components/PhotoOverlay.jsx` — live overlay wrapper
  - `src/lib/photoExif.test.js`, `src/lib/photoStore.test.js` — unit tests
- **Modified**
  - `src/db.js` — `DB_VERSION` 3 → 4, wipe `photos` store
  - `src/components/PhotoCapture.jsx` — split capture/library paths, use `processIncomingPhoto`, render `<PhotoOverlay>` in grid
  - `src/components/Lightbox.jsx` — render `<PhotoOverlay>` over focused image
  - `src/components/RowPhotos.jsx` — render `<PhotoOverlay>` per thumb
  - `src/components/PhotoChecklist.jsx` — render `<PhotoOverlay>` per thumb
  - `src/exporter.js` — bake overlay at embed time using current names
  - `src/photoOverlay.js` — `injectExifGPS` and helpers exported for `photoStore.js`; `applyOverlay` retained for exporter
  - `src/styles.css` — `.photo-overlay-wrap`, `.photo-overlay` rules
  - `src/version.js`, `public/service-worker.js` — v28 bump
