# Live Photo Overlays + Library EXIF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop baking metadata overlays into stored photo pixels; render overlay live in the UI, bake at export. Library imports use the photo's EXIF GPS + DateTimeOriginal instead of device-current values.

**Architecture:** Store the *original* image (downscaled to 2400 long-edge) in IndexedDB. Render the overlay box as a CSS layer over `<img>` in app UI. At export, run the existing `applyOverlay()` on the stored original using current panel/job names. Library imports parse EXIF up front; camera shots keep current behavior.

**Tech Stack:** React 18, Vite 5, IndexedDB (idb), `piexifjs` (already a dependency), Node built-in `node:test` for unit tests, `fake-indexeddb` already used by e2e.

---

## File Structure

**New files:**
- `src/lib/photoExif.js` — read GPS + DateTimeOriginal from a `File`/`Blob`
- `src/lib/photoExif.test.js` — unit tests for the parser
- `src/lib/photoStore.js` — `processIncomingPhoto(file, { gps })`: canvas downscale + optional EXIF GPS inject
- `src/components/PhotoOverlay.jsx` — `<img>` with absolute-positioned overlay div

**Modified files:**
- `src/photoOverlay.js` — export `injectExifGPS`, `blobToDataURL`, `dataURLToBlob` so `photoStore.js` can reuse them. `applyOverlay` retained for the exporter path.
- `src/db.js` — `DB_VERSION` 3 → 4; on upgrade, clear `photos` store
- `src/components/PhotoCapture.jsx` — split camera/library handling, use `processIncomingPhoto` and `readPhotoExif`, wrap grid `<img>` in `<PhotoOverlay>`
- `src/components/Lightbox.jsx` — wrap focused `<img>` in `<PhotoOverlay>`, accept overlay context fields per photo; remove redundant `lightbox-gps` chip (overlay shows GPS)
- `src/components/RowPhotos.jsx` — wrap thumb `<img>` in `<PhotoOverlay>`; pass overlay props through to `Lightbox`
- `src/exporter.js` — bake overlay into each photo blob just before `zip.file(...)` writes it
- `src/styles.css` — `.photo-overlay-wrap`, `.photo-overlay` rules
- `src/version.js`, `public/service-worker.js` — bump to `v28` in lockstep

**Note on PhotoChecklist.jsx:** the spec mentioned this file as a consumer, but `PhotoChecklist.jsx` currently renders only counts (no thumbs), so no overlay wrap is needed there. Skip it.

---

## Task 1: EXIF reader helper (`photoExif.js`) with tests

**Files:**
- Create: `src/lib/photoExif.js`
- Create: `src/lib/photoExif.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/photoExif.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGpsIfd, parseDateTimeOriginal } from './photoExif.js';

test('parseGpsIfd: north + east DMS rationals', () => {
  // 38°53'52.5"N, 77°02'11.0"W → not the input here; this is N/E
  const gpsIfd = {
    1: 'N',                                      // GPSLatitudeRef
    2: [[38, 1], [53, 1], [52500, 1000]],        // GPSLatitude  38°53'52.5"
    3: 'E',                                      // GPSLongitudeRef
    4: [[77, 1], [2, 1], [11000, 1000]],         // GPSLongitude 77°02'11"
  };
  const out = parseGpsIfd(gpsIfd);
  assert.ok(out);
  assert.ok(Math.abs(out.lat - 38.89791666666667) < 1e-6);
  assert.ok(Math.abs(out.lng - 77.03638888888889) < 1e-6);
});

test('parseGpsIfd: south + west are negated', () => {
  const gpsIfd = {
    1: 'S',
    2: [[34, 1], [0, 1], [0, 1]],
    3: 'W',
    4: [[58, 1], [30, 1], [0, 1]],
  };
  const out = parseGpsIfd(gpsIfd);
  assert.ok(out.lat < 0);
  assert.ok(out.lng < 0);
  assert.ok(Math.abs(out.lat + 34) < 1e-6);
  assert.ok(Math.abs(out.lng + 58.5) < 1e-6);
});

test('parseGpsIfd: missing required tags returns null', () => {
  assert.equal(parseGpsIfd({}), null);
  assert.equal(parseGpsIfd({ 1: 'N' }), null);
  assert.equal(parseGpsIfd(null), null);
  assert.equal(parseGpsIfd(undefined), null);
});

test('parseGpsIfd: includes accuracy when GPSHPositioningError present', () => {
  const gpsIfd = {
    1: 'N', 2: [[10, 1], [0, 1], [0, 1]],
    3: 'E', 4: [[20, 1], [0, 1], [0, 1]],
    31: [500, 100],  // GPSHPositioningError = 5.0 m
  };
  const out = parseGpsIfd(gpsIfd);
  assert.equal(out.accuracy, 5);
});

test('parseDateTimeOriginal: valid EXIF string → epoch ms', () => {
  // "2024:06:15 14:30:45" parsed as local time
  const ms = parseDateTimeOriginal({ 36867: '2024:06:15 14:30:45' });
  const d = new Date(ms);
  assert.equal(d.getFullYear(), 2024);
  assert.equal(d.getMonth(), 5);  // June (0-indexed)
  assert.equal(d.getDate(), 15);
  assert.equal(d.getHours(), 14);
  assert.equal(d.getMinutes(), 30);
  assert.equal(d.getSeconds(), 45);
});

test('parseDateTimeOriginal: missing tag returns null', () => {
  assert.equal(parseDateTimeOriginal({}), null);
  assert.equal(parseDateTimeOriginal(null), null);
});

test('parseDateTimeOriginal: malformed string returns null', () => {
  assert.equal(parseDateTimeOriginal({ 36867: 'not a date' }), null);
  assert.equal(parseDateTimeOriginal({ 36867: '0000:00:00 00:00:00' }), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/lib/photoExif.test.js`

Expected: FAIL with `Cannot find module './photoExif.js'` (file doesn't exist yet).

- [ ] **Step 3: Implement `photoExif.js`**

Create `src/lib/photoExif.js`:

```js
// photoExif.js — read GPS + DateTimeOriginal from a JPEG File using piexifjs.
// Treats parse failures as "no metadata"; never throws to caller.

import piexif from 'piexifjs';

// piexif tag IDs (from the EXIF spec) used here:
//   GPS IFD: 1 GPSLatitudeRef, 2 GPSLatitude, 3 GPSLongitudeRef, 4 GPSLongitude,
//            31 GPSHPositioningError
//   Exif IFD: 36867 DateTimeOriginal

export async function readPhotoExif(file) {
  try {
    const dataUrl = await blobToDataURL(file);
    const exif = piexif.load(dataUrl);
    return {
      gps: parseGpsIfd(exif?.GPS),
      takenAt: parseDateTimeOriginal(exif?.Exif),
    };
  } catch {
    return { gps: null, takenAt: null };
  }
}

export function parseGpsIfd(gpsIfd) {
  if (!gpsIfd) return null;
  const latRef = gpsIfd[1];
  const lat = gpsIfd[2];
  const lngRef = gpsIfd[3];
  const lng = gpsIfd[4];
  if (!latRef || !lat || !lngRef || !lng) return null;
  const latDeg = dmsToDecimal(lat) * (latRef === 'S' ? -1 : 1);
  const lngDeg = dmsToDecimal(lng) * (lngRef === 'W' ? -1 : 1);
  if (!Number.isFinite(latDeg) || !Number.isFinite(lngDeg)) return null;
  const out = { lat: latDeg, lng: lngDeg };
  const accRational = gpsIfd[31];
  if (Array.isArray(accRational) && accRational[1]) {
    const acc = accRational[0] / accRational[1];
    if (Number.isFinite(acc)) out.accuracy = acc;
  }
  return out;
}

export function parseDateTimeOriginal(exifIfd) {
  if (!exifIfd) return null;
  const s = exifIfd[36867];
  if (typeof s !== 'string') return null;
  // EXIF format: "YYYY:MM:DD HH:MM:SS" — local time per spec.
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m.map((x, i) => i === 0 ? x : Number(x));
  if (y < 1970 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const ms = new Date(y, mo - 1, d, h, mi, se).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function dmsToDecimal(rationals) {
  if (!Array.isArray(rationals) || rationals.length < 3) return NaN;
  const [deg, min, sec] = rationals.map(([n, d]) => (d ? n / d : NaN));
  return deg + min / 60 + sec / 3600;
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/lib/photoExif.test.js`

Expected: all 7 tests pass, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/photoExif.js src/lib/photoExif.test.js
git commit -m "feat(photos): add EXIF reader (GPS + DateTimeOriginal)"
```

---

## Task 2: Photo store helper (`photoStore.js`)

**Files:**
- Create: `src/lib/photoStore.js`
- Modify: `src/photoOverlay.js` (export internals)

- [ ] **Step 1: Export reusable helpers from `photoOverlay.js`**

Edit `src/photoOverlay.js` to convert these existing internal functions to named exports (keep them unchanged in body):

```js
// Change `async function injectExifGPS(blob, gps)` to:
export async function injectExifGPS(blob, gps) {
  // ... existing body ...
}
```

Also export `blobToDataURL`, `dataURLToBlob`, `buildGpsExif`, `degToDmsRational`, `formatGpsDate` by prepending `export ` to each `function` declaration in `src/photoOverlay.js`. The existing `applyOverlay`, `fmtTimestamp`, `fmtGps` exports stay as they are.

- [ ] **Step 2: Create `photoStore.js`**

Create `src/lib/photoStore.js`:

```js
// photoStore.js — incoming-photo pipeline shared by camera + library paths.
// Downscales to MAX_LONG_EDGE and (optionally) re-injects EXIF GPS into the
// resulting JPEG. Does NOT burn an overlay — that happens at export time.

import { injectExifGPS } from '../photoOverlay.js';

const MAX_LONG_EDGE = 2400;
const JPEG_QUALITY = 0.85;

export async function processIncomingPhoto(file, { gps = null } = {}) {
  let bitmap;
  try {
    // imageOrientation 'from-image' applies EXIF Orientation so stored pixels
    // are upright; the live overlay anchors bottom-right of the upright image.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(
      "This photo format isn't supported in your browser. Try Take Photo, or re-save the image as JPEG before importing."
    );
  }
  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  let blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
  });
  if (gps) {
    try {
      blob = await injectExifGPS(blob, gps);
    } catch (e) {
      // Don't fail the capture if EXIF write fails — the photo and its
      // sidecar record still carry GPS via the DB row.
      console.warn('EXIF write failed:', e);
    }
  }
  return { blob, width: w, height: h };
}
```

- [ ] **Step 3: Verify build still passes**

Run: `npm run build`

Expected: build completes successfully with no errors. Vite tree-shakes unused exports, so adding `export` to internal helpers does not bloat the bundle.

- [ ] **Step 4: Commit**

```bash
git add src/photoOverlay.js src/lib/photoStore.js
git commit -m "feat(photos): extract photoStore.processIncomingPhoto helper"
```

---

## Task 3: `PhotoOverlay` component + CSS

**Files:**
- Create: `src/components/PhotoOverlay.jsx`
- Modify: `src/styles.css` (append rules)

- [ ] **Step 1: Create the component**

Create `src/components/PhotoOverlay.jsx`:

```jsx
import React from 'react';
import { fmtTimestamp, fmtGps } from '../photoOverlay.js';

// Live overlay rendered on top of an <img>. The overlay text is derived
// purely from props — renaming a panel/job re-renders consumers and the
// overlay updates with no DB writes.
//
// Props:
//   src, alt: forwarded to <img>
//   jobName, panelName, sheetName, itemLabel: overlay text fields
//   takenAt: epoch ms
//   gps: { lat, lng, accuracy? } | null
//   imgClassName, wrapClassName: optional classNames passed through
//   onClick: handler attached to the wrapper
//   onImgClick: handler attached to <img> (use to stopPropagation in lightbox)

export default function PhotoOverlay({
  src,
  alt = '',
  jobName,
  panelName,
  sheetName,
  itemLabel,
  takenAt,
  gps,
  imgClassName,
  wrapClassName,
  onClick,
  onImgClick,
}) {
  const dateStr = takenAt ? fmtTimestamp(new Date(takenAt)) : '';
  const gpsStr = gps ? `  ${fmtGps(gps)}` : '';
  const cls = `photo-overlay-wrap${wrapClassName ? ` ${wrapClassName}` : ''}`;
  return (
    <div className={cls} onClick={onClick}>
      <img src={src} alt={alt} className={imgClassName} onClick={onImgClick} />
      <div className="photo-overlay" aria-hidden="true">
        <div>{jobName} • {panelName}</div>
        <div>{sheetName} — {itemLabel}</div>
        <div>{dateStr}{gpsStr}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Append CSS rules to `src/styles.css`**

Append to the end of `src/styles.css`:

```css
/* Live photo overlay (replaces canvas-burned overlay for in-app display) */
.photo-overlay-wrap {
  position: relative;
  display: block;
  line-height: 0;
  container-type: inline-size;
}
.photo-overlay-wrap img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.photo-overlay {
  position: absolute;
  right: 4%;
  bottom: 4%;
  max-width: 92%;
  padding: 0.55em 0.85em;
  background: rgba(0, 0, 0, 0.62);
  color: #fff;
  font: 600 clamp(9px, 2.6cqw, 18px)/1.25 -apple-system, "Segoe UI", Roboto, sans-serif;
  border-radius: 8px;
  pointer-events: none;
  text-align: left;
}
.photo-overlay > div {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lightbox .photo-overlay-wrap {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lightbox .photo-overlay-wrap img {
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/PhotoOverlay.jsx src/styles.css
git commit -m "feat(photos): add PhotoOverlay component (live overlay)"
```

---

## Task 4: DB schema bump (v3 → v4) wipes `photos` store

**Files:**
- Modify: `src/db.js`

- [ ] **Step 1: Bump version and add wipe block**

In `src/db.js`, change `const DB_VERSION = 3;` to:

```js
const DB_VERSION = 4;
```

Inside the `upgrade(db, oldVersion, newVersion, tx)` callback, after the existing `if (oldVersion < 3)` block, add:

```js
if (oldVersion < 4) {
  // v4: photos store now holds *original* (un-overlaid) blobs. Live overlay
  // is rendered in the UI; export bakes at write time. Existing baked
  // photos cannot be recovered to originals, so we wipe the store. Job /
  // panel / row data is untouched.
  if (db.objectStoreNames.contains('photos')) {
    tx.objectStore('photos').clear();
  }
}
```

Also update the file header comment block to mention v4 alongside the existing v1→v2 migration notes:

```js
//   v3 → v4 migration:
//     - photos store cleared (overlays move from baked-in pixels to live
//       render; existing baked photos cannot be reverted to originals)
```

- [ ] **Step 2: Verify e2e still passes (seed flow does not depend on photos)**

Run: `npm run test:e2e`

Expected: e2e completes successfully (the seed has no photos, so the wipe is a no-op against a fresh fake-indexeddb).

- [ ] **Step 3: Commit**

```bash
git add src/db.js
git commit -m "feat(db): v4 schema — wipe photos store for live-overlay refactor"
```

---

## Task 5: Capture flow split (camera vs library) using `processIncomingPhoto` + EXIF

**Files:**
- Modify: `src/components/PhotoCapture.jsx`

- [ ] **Step 1: Update imports**

In `src/components/PhotoCapture.jsx`, replace the existing imports block at the top (lines 1–8) with:

```jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { listPhotos, listRowPhotos, addPhoto, deletePhoto } from '../db.js';
import { processIncomingPhoto } from '../lib/photoStore.js';
import { readPhotoExif } from '../lib/photoExif.js';
import { maybeGetGps } from '../lib/geolocation.js';
import { toast } from '../lib/toast.js';
import { BUILD_VERSION } from '../version.js';
import Icon from './Icon.jsx';
import Lightbox from './Lightbox.jsx';
import PhotoOverlay from './PhotoOverlay.jsx';
```

(Removes `applyOverlay, fmtTimestamp, fmtGps` from the `photoOverlay.js` import; those are now consumed via `PhotoOverlay`. Adds `processIncomingPhoto`, `readPhotoExif`, `PhotoOverlay`.)

- [ ] **Step 2: Replace `handleFiles` with branched camera/library logic**

Replace the entire `async function handleFiles(fileList) { ... }` body (currently lines ~57–103) with:

```jsx
async function handleFiles(fileList, source /* 'camera' | 'library' */) {
  const len = fileList?.length ?? 0;
  if (len === 0) {
    setError('iOS handed back zero files. This usually means the camera/library was cancelled, or a known iOS standalone-PWA bug.');
    return;
  }
  const files = Array.from(fileList);
  setBusy(true);
  setError(null);
  let savedCount = 0;
  try {
    // Camera path: device GPS + now. Library path: photo's own EXIF only.
    let cameraGps = null;
    if (source === 'camera') {
      cameraGps = await maybeGetGps();
    }
    for (const file of files) {
      let gps;
      let takenAt;
      if (source === 'camera') {
        gps = cameraGps;
        takenAt = Date.now();
      } else {
        const exif = await readPhotoExif(file);
        gps = exif.gps;
        takenAt = exif.takenAt ?? file.lastModified ?? Date.now();
      }
      const { blob, width, height } = await processIncomingPhoto(file, { gps });
      await addPhoto({
        panelId: panel.id,
        sheet: sheetName,
        item: rowId ? (rowLabelHint || 'row') : item,
        rowId,
        blob,
        mime: 'image/jpeg',
        w: width, h: height,
        gps,
        takenAt,
      });
      savedCount += 1;
      if (navigator.vibrate) navigator.vibrate(20);
    }
    await refresh();
    if (savedCount === 0) {
      setError('Photo could not be saved. The file may not be a recognized image format.');
    }
  } catch (e) {
    console.error(e);
    setError(e.message || 'Could not save photo');
  } finally {
    setBusy(false);
  }
}
```

- [ ] **Step 3: Pass `source` from each input's `onChange`**

Find the two `<input>` `onChange` handlers in the JSX (currently lines ~141 and ~155). Update each to pass the source:

Camera input:
```jsx
onChange={(e) => {
  const input = e.target;
  handleFiles(input.files, 'camera');
  setTimeout(() => { try { input.value = ''; } catch {} }, 1500);
}}
```

Library input:
```jsx
onChange={(e) => {
  const input = e.target;
  handleFiles(input.files, 'library');
  setTimeout(() => { try { input.value = ''; } catch {} }, 1500);
}}
```

- [ ] **Step 4: Update `addPhoto` in `src/db.js` to accept `takenAt`**

In `src/db.js`, the existing `addPhoto` signature ignores any caller-supplied `takenAt` and forces `Date.now()`. Update the destructured arg list and assignment:

```js
export async function addPhoto({
  panelId, sheet, item, rowId = null,
  blob, mime = 'image/jpeg',
  w, h, gps = null, takenAt = null,
}) {
  const db = await getDB();
  const photo = {
    id: uid(),
    panelId, sheet, item, rowId,
    blob, mime,
    takenAt: takenAt ?? Date.now(),
    w, h,
    gps,
  };
  await db.put('photos', photo);
  return photo;
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/PhotoCapture.jsx src/db.js
git commit -m "feat(photos): split camera/library capture, use EXIF for library imports"
```

---

## Task 6: Wire `PhotoOverlay` into grid, RowPhotos, Lightbox

**Files:**
- Modify: `src/components/PhotoCapture.jsx` (grid)
- Modify: `src/components/RowPhotos.jsx` (thumbs + Lightbox handoff)
- Modify: `src/components/Lightbox.jsx` (focused image)

### 6a — PhotoCapture grid

- [ ] **Step 1: Compute the per-photo overlay context once**

In `src/components/PhotoCapture.jsx`, immediately after the existing `const photosWithUrls = useMemo(...)` block, add a `useMemo` that augments each photo with the overlay fields:

```jsx
const overlayPhotos = useMemo(() => photosWithUrls.map((p) => ({
  ...p,
  jobName: job.name,
  panelName: panel.name,
  sheetName,
  itemLabel: rowId ? (rowLabelHint || sheetName) : (p.item || item || sheetName),
})), [photosWithUrls, job.name, panel.name, sheetName, rowId, rowLabelHint, item]);
```

- [ ] **Step 2: Replace the photo grid `<img>` with `<PhotoOverlay>`**

Find the `.photo-grid` block (currently lines ~171–189). Replace the inner `.photo-tile` rendering with:

```jsx
{photosWithUrls.length > 0 && (
  <div className="photo-grid">
    {overlayPhotos.map((p, i) => (
      <div
        key={p.id}
        className="photo-tile"
        onClick={() => setLightboxIndex(i)}
      >
        <PhotoOverlay
          src={p.blobUrl}
          jobName={p.jobName}
          panelName={p.panelName}
          sheetName={p.sheetName}
          itemLabel={p.itemLabel}
          takenAt={p.takenAt}
          gps={p.gps}
        />
      </div>
    ))}
  </div>
)}
```

The existing `.photo-tile-gps` chip is removed (the overlay now shows GPS directly).

- [ ] **Step 3: Pass `overlayPhotos` to Lightbox**

Find the `<Lightbox photos={photosWithUrls} ...>` usage (currently around line 197). Change `photos={photosWithUrls}` to `photos={overlayPhotos}`.

### 6b — RowPhotos

- [ ] **Step 4: Update RowPhotos imports**

In `src/components/RowPhotos.jsx`, add the import:

```jsx
import PhotoOverlay from './PhotoOverlay.jsx';
```

- [ ] **Step 5: Compute overlay context and replace thumbs**

Before the `return (` in `RowPhotos.jsx`, add:

```jsx
const itemLabel = row.data?.['Device Name'] || row.data?.['Panel Name'] || `Row ${row.idx + 1}`;
const overlayPhotos = useMemo(() => photosWithUrls.map((p) => ({
  ...p,
  jobName: job.name,
  panelName: panel.name,
  sheetName,
  itemLabel,
})), [photosWithUrls, job.name, panel.name, sheetName, itemLabel]);
```

Replace the existing `photosWithUrls.map(...)` block in the JSX (currently lines ~47–61) with:

```jsx
{overlayPhotos.map((p, i) => (
  <div
    key={p.id}
    className="photo-tile"
    onClick={() => setLightboxIndex(i)}
  >
    <PhotoOverlay
      src={p.blobUrl}
      jobName={p.jobName}
      panelName={p.panelName}
      sheetName={p.sheetName}
      itemLabel={p.itemLabel}
      takenAt={p.takenAt}
      gps={p.gps}
    />
  </div>
))}
```

The `.photo-tile-gps` chip in `RowPhotos` is removed.

- [ ] **Step 6: Pass `overlayPhotos` to Lightbox**

Change the `<Lightbox photos={photosWithUrls} ...>` call to `<Lightbox photos={overlayPhotos} ...>`.

### 6c — Lightbox

- [ ] **Step 7: Update Lightbox imports**

In `src/components/Lightbox.jsx`, add:

```jsx
import PhotoOverlay from './PhotoOverlay.jsx';
```

- [ ] **Step 8: Replace `<img>` with `<PhotoOverlay>` and remove duplicate GPS chip**

Replace the `<img src={cur.blobUrl} ... />` block (lines ~58–62) with:

```jsx
<PhotoOverlay
  src={cur.blobUrl}
  jobName={cur.jobName}
  panelName={cur.panelName}
  sheetName={cur.sheetName}
  itemLabel={cur.itemLabel}
  takenAt={cur.takenAt}
  gps={cur.gps}
  onImgClick={(e) => e.stopPropagation()}
/>
```

Delete the `{cur.gps && (<div className="lightbox-gps">...)` block (lines ~73–83) — the live overlay now displays GPS along with the rest of the metadata.

Also update the JSDoc at the top of the file to document the new optional fields:

```jsx
// Props:
//   photos: [{ id, blobUrl, gps?, takenAt, jobName, panelName, sheetName, itemLabel }]
//   index: number — which photo to show first
//   onClose: () => void
//   onDelete?: (photo) => void  — when present, shows a trash button
```

- [ ] **Step 9: Verify build**

Run: `npm run build`

Expected: build succeeds, no missing-prop warnings.

- [ ] **Step 10: Commit**

```bash
git add src/components/PhotoCapture.jsx src/components/RowPhotos.jsx src/components/Lightbox.jsx
git commit -m "feat(photos): live overlay in grid, row thumbs, and lightbox"
```

---

## Task 7: Bake overlay at export time

**Files:**
- Modify: `src/exporter.js`

- [ ] **Step 1: Replace direct `zip.file(...)` write with bake-then-write**

In `src/exporter.js`, find the inner photo-write loop (currently around lines 593–608, inside `for (const [folder, list] of byFolder)`). The existing line:

```js
zip.file(`${folder}/${fname}`, ph.blob);
```

Replace with:

```js
const overlayLines = [
  `${job.name} • ${panel.name}`,
  `${ph.sheet} — ${entry.itemLabel}`,
  fmtTimestamp(new Date(ph.takenAt)) + (ph.gps ? `  ${fmtGps(ph.gps)}` : ''),
];
const baked = await applyOverlay(ph.blob, overlayLines, ph.gps);
zip.file(`${folder}/${fname}`, baked.blob);
```

The enclosing `list.forEach((entry, i) => { ... })` needs to be `await`-aware. Convert it to a `for` loop:

Replace:

```js
list.forEach((entry, i) => {
  const ph = entry.photo;
  // ... existing body up to `writtenPhotos += 1` and the progress block ...
});
```

With:

```js
for (let i = 0; i < list.length; i++) {
  const entry = list[i];
  const ph = entry.photo;
  const ext = (ph.mime || 'image/jpeg').split('/')[1] || 'jpg';
  const fname = `IMG_${pad3(i + 1)}.${ext === 'jpeg' ? 'jpg' : ext}`;
  const overlayLines = [
    `${job.name} • ${panel.name}`,
    `${ph.sheet} — ${entry.itemLabel}`,
    fmtTimestamp(new Date(ph.takenAt)) + (ph.gps ? `  ${fmtGps(ph.gps)}` : ''),
  ];
  const baked = await applyOverlay(ph.blob, overlayLines, ph.gps);
  zip.file(`${folder}/${fname}`, baked.blob);
  csvRows.push([
    panel.name,
    ph.sheet,
    entry.itemLabel,
    entry.level,
    `${folder}/${fname}`,
    new Date(ph.takenAt).toISOString(),
    ph.gps?.lat ?? '',
    ph.gps?.lng ?? '',
    ph.gps?.accuracy ?? '',
  ].map(csvEscape).join(','));

  writtenPhotos += 1;
  if (writtenPhotos % 5 === 0 && grandTotalPhotos > 0) {
    onProgress({
      phase: 'bundling',
      percent: 60 + Math.floor((writtenPhotos / grandTotalPhotos) * 30),
      detail: `${writtenPhotos} / ${grandTotalPhotos} photos`,
    });
  }
}
```

(The body is identical to the prior `list.forEach` body except the `for` loop allows `await applyOverlay`.)

- [ ] **Step 2: Verify e2e still passes**

Run: `npm run test:e2e`

Expected: e2e succeeds. The seed has no photos, so the bake path is exercised only by future real-device tests, but the loop must still parse and run without errors.

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/exporter.js
git commit -m "feat(export): bake overlay onto photos at xlsx-build time"
```

---

## Task 8: Version bump v28

**Files:**
- Modify: `src/version.js`
- Modify: `public/service-worker.js`

- [ ] **Step 1: Bump `BUILD_VERSION`**

In `src/version.js`, change:

```js
export const BUILD_VERSION = 'v27';
```

To:

```js
export const BUILD_VERSION = 'v28';
```

- [ ] **Step 2: Bump service worker `VERSION`**

In `public/service-worker.js`, change:

```js
const VERSION = 'v27';
```

To:

```js
const VERSION = 'v28';
```

- [ ] **Step 3: Verify build + e2e**

Run: `npm run build && npm run test:e2e`

Expected: both succeed.

- [ ] **Step 4: Commit and push**

```bash
git add src/version.js public/service-worker.js
git commit -m "chore(release): v28 — live photo overlays + library EXIF"
git push origin main
```

GitHub Actions auto-deploys to Pages and uploads a sample-export artifact (30-day retention) from `npm run test:e2e`.

---

## Self-Review (controller, before dispatching)

**Spec coverage:**
- Live overlay rendering — Task 3 (component), Task 6 (wiring)
- Library EXIF use — Task 1 (parser), Task 5 (capture branch)
- Storage shift to originals — Task 2 (`processIncomingPhoto`), Task 5 (no-bake capture)
- DB wipe on upgrade — Task 4
- Export bake — Task 7
- Version bump + rollout — Task 8

**Type consistency:**
- `processIncomingPhoto(file, { gps })` returns `{ blob, width, height }` — used identically in Task 5.
- `readPhotoExif(file)` returns `{ gps, takenAt }` — used identically in Task 5.
- `PhotoOverlay` props (`jobName, panelName, sheetName, itemLabel, takenAt, gps, src, ...`) — used identically in Task 6 a/b/c.
- `addPhoto({ ..., takenAt })` — fallback to `Date.now()` preserves Task 5 camera-path behavior.

**Notes for executors:**
- Run `npm run build` after each task that touches JS/JSX to catch import or syntax errors early.
- The e2e test (`npm run test:e2e`) does not include photos in its seed, so it cannot verify the overlay bake end-to-end. Real-device QA is required after deploy. That is explicitly accepted in the spec.
- Direct-on-main workflow per project memory: subagents commit and push without asking. Push happens in Task 8.
