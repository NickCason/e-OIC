import React, { useState, useEffect, useRef } from 'react';
import { listPhotos, listRowPhotos, addPhoto, deletePhoto } from '../db.js';
import { applyOverlay, fmtTimestamp, fmtGps } from '../photoOverlay.js';
import { maybeGetGps } from '../lib/geolocation.js';
import { toast } from '../lib/toast.js';
import { BUILD_VERSION } from '../version.js';

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
  const [lightbox, setLightbox] = useState(null);
  const [debug, setDebug] = useState([]);
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);

  function logDebug(msg) {
    const stamp = new Date().toLocaleTimeString();
    setDebug((d) => [...d.slice(-7), `${stamp} ${msg}`]);
  }

  async function refresh() {
    if (rowId) {
      setPhotos(await listRowPhotos(rowId));
    } else {
      setPhotos(await listPhotos(panel.id, sheetName, item));
    }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [panel.id, sheetName, item, rowId]);

  async function handleFiles(fileList) {
    const len = fileList?.length ?? 0;
    logDebug(`onChange: ${len} file(s)`);
    if (len === 0) {
      setError('iOS handed back zero files. This usually means the camera/library was cancelled, or a known iOS standalone-PWA bug.');
      return;
    }
    // Snapshot the FileList to a plain array IMMEDIATELY so we don't depend
    // on the live FileList reference (which iOS Safari can invalidate when
    // the input's value is reset asynchronously).
    const files = Array.from(fileList);
    for (const f of files) {
      logDebug(`  ${f.name || '(no name)'} type="${f.type || ''}" ${f.size}b`);
    }
    setBusy(true);
    setError(null);
    let savedCount = 0;
    try {
      const gps = await maybeGetGps();
      logDebug(gps ? `gps ok ±${Math.round(gps.accuracy)}m` : 'gps null');
      for (const file of files) {
        const overlayLabel = rowId ? (rowLabelHint || 'Row') : item;
        const lines = [
          `${job.name} • ${panel.name}`,
          `${sheetName} — ${overlayLabel}`,
          fmtTimestamp() + (gps ? `  📍 ${fmtGps(gps)}` : ''),
        ];
        logDebug(`overlay: ${file.name || '(no name)'}`);
        const { blob, width, height } = await applyOverlay(file, lines, gps);
        logDebug(`saved: ${width}x${height} ${blob?.size || 0}b`);
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
      logDebug(`done: ${savedCount}/${files.length} saved`);
      if (savedCount === 0) {
        setError('Photo could not be saved. The file may not be a recognized image format.');
      }
    } catch (e) {
      console.error(e);
      logDebug(`error: ${e.message || e}`);
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

        {debug.length > 0 && (
          <pre className="debug-strip">
            {debug.join('\n')}
          </pre>
        )}

        <div className="btn-row" style={{ marginTop: 16, justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'ui-monospace, monospace' }}>{BUILD_VERSION}</span>
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
