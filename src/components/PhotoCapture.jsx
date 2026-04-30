import React, { useState, useEffect, useRef } from 'react';
import { listPhotos, listRowPhotos, addPhoto, deletePhoto } from '../db.js';
import { applyOverlay, fmtTimestamp, fmtGps } from '../photoOverlay.js';
import { maybeGetGps } from '../lib/geolocation.js';
import { toast } from '../lib/toast.js';

// Capture & manage photos for either:
//   - a panel-level checklist item (rowId === null, item is the checklist label)
//   - a row-level bucket          (rowId is set,    item is null/optional label)

export default function PhotoCapture({
  job, panel, sheetName, item, rowId = null, rowLabelHint = '', onClose,
}) {
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [lightbox, setLightbox] = useState(null);
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

  async function handleFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      // Get a single GPS reading and reuse it for the whole batch.
      const gps = await maybeGetGps();
      for (const file of fileList) {
        if (!file.type.startsWith('image/')) continue;
        const overlayLabel = rowId ? (rowLabelHint || 'Row') : item;
        const lines = [
          `${job.name} • ${panel.name}`,
          `${sheetName} — ${overlayLabel}`,
          fmtTimestamp() + (gps ? `  📍 ${fmtGps(gps)}` : ''),
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
        // Haptic tick on save (if supported)
        if (navigator.vibrate) navigator.vibrate(20);
      }
      await refresh();
    } catch (e) {
      console.error(e);
      setError(e.message || 'Could not save photo');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id) {
    await deletePhoto(id);
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
            📷 Take Photo
          </button>
          <button onClick={() => libraryRef.current?.click()} disabled={busy}>
            🖼 From Library
          </button>
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
        />
        <input
          ref={libraryRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
        />

        {busy && <div style={{ color: 'var(--text-dim)', marginBottom: 8 }}>Processing…</div>}
        {error && <div style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</div>}

        {photos.length === 0 && !busy && (
          <div className="empty" style={{ padding: '20px 0' }}>
            <p>No photos yet for this {rowId ? 'row' : 'item'}.</p>
          </div>
        )}

        {photos.length > 0 && (
          <div className="photo-grid">
            {photos.map((p) => (
              <Tile key={p.id} photo={p} onClick={() => setLightbox(p)} onDelete={() => onDelete(p.id)} />
            ))}
          </div>
        )}

        <div className="btn-row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Done</button>
        </div>
      </div>
      {lightbox && <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

function Tile({ photo, onClick, onDelete }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const u = URL.createObjectURL(photo.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo.id]);
  return (
    <div className="photo-tile" onClick={onClick}>
      {url && <img src={url} alt="" />}
      {photo.gps && <div className="gps">📍</div>}
      <button className="del" onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label="Delete">✕</button>
    </div>
  );
}

function Lightbox({ photo, onClose }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const u = URL.createObjectURL(photo.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo.id]);
  return (
    <div className="lightbox" onClick={onClose}>
      {url && <img src={url} alt="" />}
      <button className="close" onClick={onClose}>✕</button>
      {photo.gps && (
        <div style={{ position: 'absolute', bottom: 16, left: 0, right: 0, textAlign: 'center', color: 'white', fontSize: 12, opacity: 0.8 }}>
          📍 {fmtGps(photo.gps)}
        </div>
      )}
    </div>
  );
}
