import React, { useState, useEffect, useMemo, useRef } from 'react';
import { listPhotos, listRowPhotos, addPhoto, deletePhoto } from '../db.js';
import { applyOverlay, fmtTimestamp, fmtGps } from '../photoOverlay.js';
import { maybeGetGps } from '../lib/geolocation.js';
import { toast } from '../lib/toast.js';
import { BUILD_VERSION } from '../version.js';
import Icon from './Icon.jsx';
import Lightbox from './Lightbox.jsx';

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

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [panel.id, sheetName, item, rowId]);

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

  async function handleFiles(fileList) {
    const len = fileList?.length ?? 0;
    if (len === 0) {
      setError('iOS handed back zero files. This usually means the camera/library was cancelled, or a known iOS standalone-PWA bug.');
      return;
    }
    // Snapshot the FileList to a plain array IMMEDIATELY so we don't depend
    // on the live FileList reference (which iOS Safari can invalidate when
    // the input's value is reset asynchronously).
    const files = Array.from(fileList);
    setBusy(true);
    setError(null);
    let savedCount = 0;
    try {
      const gps = await maybeGetGps();
      for (const file of files) {
        const overlayLabel = rowId ? (rowLabelHint || 'Row') : item;
        const lines = [
          `${job.name} • ${panel.name}`,
          `${sheetName} — ${overlayLabel}`,
          fmtTimestamp() + (gps ? `  ${fmtGps(gps)}` : ''),
        ];
        const { blob, width, height } = await applyOverlay(file, lines, gps);
        await addPhoto({
          panelId: panel.id,
          sheet: sheetName,
          item: rowId ? (rowLabelHint || 'row') : item,
          rowId,
          blob,
          mime: 'image/jpeg',
          w: width, h: height,
          gps,
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
            handleFiles(input.files);
            // Defer reset — synchronous clearing has been observed to wipe
            // the FileList before async handleFiles iterates it on iOS.
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
            handleFiles(input.files);
            setTimeout(() => { try { input.value = ''; } catch {} }, 1500);
          }}
        />

        {busy && <div style={{ color: 'var(--text-dim)', marginBottom: 8 }}>Processing…</div>}
        {error && <div style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</div>}

        {photosWithUrls.length === 0 && !busy && (
          <div className="empty" style={{ padding: '20px 0' }}>
            <p>No photos yet for this {rowId ? 'row' : 'item'}.</p>
          </div>
        )}

        {photosWithUrls.length > 0 && (
          <div className="photo-grid">
            {photosWithUrls.map((p, i) => (
              <div
                key={p.id}
                className="photo-tile"
                onClick={() => setLightboxIndex(i)}
              >
                <img src={p.blobUrl} alt="" />
                {p.gps && (
                  <div className="photo-tile-gps">
                    <Icon name="gps" size={10} />
                    <span>{p.gps.lat.toFixed(3)},{p.gps.lng.toFixed(3)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="btn-row" style={{ marginTop: 16, justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'ui-monospace, monospace' }}>{BUILD_VERSION}</span>
          <button onClick={onClose}>Done</button>
        </div>
      </div>
      {lightboxIndex !== null && photosWithUrls[lightboxIndex] && (
        <Lightbox
          photos={photosWithUrls}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
