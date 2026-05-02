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
import EtechLoader from './EtechLoader.jsx';
import LoadingPhrases from './LoadingPhrases.jsx';
import { withMinDuration, fadeOutLoader } from '../lib/loaderHold.js';

// iOS standalone-PWA Safari has documented issues with `display: none` file
// inputs not propagating selected files. Off-screen positioning works.
const HIDDEN_INPUT_STYLE = {
  position: 'absolute',
  left: 0, top: 0,
  width: 1, height: 1,
  opacity: 0,
  pointerEvents: 'none',
};

// Capture & manage photos for either:
//   - a panel-level checklist item (rowId === null, item is the checklist label)
//   - a row-level bucket          (rowId is set,    item is null/optional label)

export default function PhotoCapture({
  job, panel, sheetName, item, rowId = null, rowLabelHint = '', onClose,
}) {
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const [error, setError] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);

  async function refresh() {
    if (rowId) {
      setPhotos(await listRowPhotos(rowId));
    } else {
      setPhotos(await listPhotos(panel.id, sheetName, item));
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh is a non-stable inline async fn; adding it would infinite-loop. Intent: run only when photo context IDs change.
  useEffect(() => { refresh(); }, [panel.id, sheetName, item, rowId]);

  // Build blob URLs for the current photo set; revoke on change/unmount.
  const photosWithUrls = useMemo(
    () => photos.map((p) => ({ ...p, blobUrl: URL.createObjectURL(p.blob) })),
    [photos]
  );
  useEffect(() => {
    return () => {
      for (const p of photosWithUrls) {
        try { URL.revokeObjectURL(p.blobUrl); } catch {}
      }
    };
  }, [photosWithUrls]);

  const overlayPhotos = useMemo(() => photosWithUrls.map((p) => ({
    ...p,
    jobName: job.name,
    panelName: panel.name,
    sheetName,
    itemLabel: rowId ? (rowLabelHint || sheetName) : (p.item || item || sheetName),
  })), [photosWithUrls, job.name, panel.name, sheetName, rowId, rowLabelHint, item]);

  async function handleFiles(fileList, source /* 'camera' | 'library' */) {
    const len = fileList?.length ?? 0;
    if (len === 0) {
      setError('iOS handed back zero files. This usually means the camera/library was cancelled, or a known iOS standalone-PWA bug.');
      return;
    }
    const files = Array.from(fileList);
    setBusy(true);
    setIsFading(false);
    setError(null);
    try {
      const work = (async () => {
        // Camera path: device GPS + now. Library path: photo's own EXIF only.
        let cameraGps = null;
        if (source === 'camera') {
          cameraGps = await maybeGetGps();
        }
        let saved = 0;
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
          saved += 1;
          if (navigator.vibrate) navigator.vibrate(20);
        }
        await refresh();
        return saved;
      })();
      const savedCount = await withMinDuration(work, 2200);
      if (savedCount === 0) {
        setError('Photo could not be saved. The file may not be a recognized image format.');
      } else {
        await fadeOutLoader(setIsFading);
      }
    } catch (e) {
      console.error(e);
      setError(e.message || 'Could not save photo');
    } finally {
      setBusy(false);
      setIsFading(false);
    }
  }

  async function onDelete(photo) {
    await deletePhoto(photo.id);
    await refresh();
    toast.show('Photo deleted');
  }

  const title = rowId
    ? `Photos: ${rowLabelHint || sheetName}`
    : item;

  const subtitle = rowId
    ? `${sheetName} · ${panel.name} · row-level`
    : `${sheetName} · ${panel.name}`;

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: -8, marginBottom: 12 }}>
          {subtitle}
        </div>

        <div className="btn-row" style={{ marginBottom: 12 }}>
          <button className="primary" onClick={() => cameraRef.current?.click()} disabled={busy}>
            <Icon name="camera" size={16} strokeWidth={2} /> Take Photo
          </button>
          <button onClick={() => libraryRef.current?.click()} disabled={busy}>
            <Icon name="image" size={16} strokeWidth={2} /> From Library
          </button>
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={HIDDEN_INPUT_STYLE}
          onChange={(e) => {
            const input = e.target;
            handleFiles(input.files, 'camera');
            setTimeout(() => { try { input.value = ''; } catch {} }, 1500);
          }}
        />
        <input
          ref={libraryRef}
          type="file"
          accept="image/*"
          multiple
          style={HIDDEN_INPUT_STYLE}
          onChange={(e) => {
            const input = e.target;
            handleFiles(input.files, 'library');
            setTimeout(() => { try { input.value = ''; } catch {} }, 1500);
          }}
        />

        {busy && (
          <div
            className={`export-progress${isFading ? ' is-fading-out' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-dim)', marginBottom: 8, padding: 0 }}
          >
            <EtechLoader variant="current" size={36} />
            <LoadingPhrases set="photo" className="loading-phrase--inline" />
          </div>
        )}
        {error && <div style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</div>}

        {overlayPhotos.length === 0 && !busy && (
          <div className="empty" style={{ padding: '20px 0' }}>
            <p>No photos yet for this {rowId ? 'row' : 'item'}.</p>
          </div>
        )}

        {overlayPhotos.length > 0 && (
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

        <div className="btn-row" style={{ marginTop: 16, justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'ui-monospace, monospace' }}>{BUILD_VERSION}</span>
          <button onClick={onClose}>Done</button>
        </div>
      </div>
      {lightboxIndex !== null && overlayPhotos[lightboxIndex] && (
        <Lightbox
          photos={overlayPhotos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
