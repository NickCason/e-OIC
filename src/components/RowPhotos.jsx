import React, { useState, useEffect } from 'react';
import { listRowPhotos, deletePhoto } from '../db.js';
import { fmtGps } from '../photoOverlay.js';
import PhotoCapture from './PhotoCapture.jsx';
import { toast } from '../lib/toast.js';

// Row-level photos: tied to a specific row (one PLC card, one drive, etc.).
// Inside the export these become Photos/{Panel}/{Sheet}/{RowLabel}/IMG_001.jpg.

export default function RowPhotos({ job, panel, sheetName, row, onChange }) {
  const [photos, setPhotos] = useState([]);
  const [open, setOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  async function refresh() {
    setPhotos(await listRowPhotos(row.id));
  }

  useEffect(() => { refresh(); }, [row.id]);

  async function onDelete(p) {
    await deletePhoto(p.id);
    await refresh();
    onChange?.();
    toast.show('Photo deleted');
  }

  return (
    <div>
      <div style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 10 }}>
        Photos attached directly to this row (not the panel).
      </div>
      <button className="primary" onClick={() => setOpen(true)} style={{ marginBottom: 10 }}>
        📷 Capture for this row
      </button>
      {photos.length > 0 && (
        <div className="photo-grid">
          {photos.map((p) => (
            <RowTile key={p.id} photo={p} onClick={() => setLightbox(p)} onDelete={() => onDelete(p)} />
          ))}
        </div>
      )}
      {open && (
        <PhotoCapture
          job={job}
          panel={panel}
          sheetName={sheetName}
          item={null}
          rowId={row.id}
          rowLabelHint={row.data?.['Device Name'] || row.data?.['Panel Name'] || `Row ${row.idx + 1}`}
          onClose={() => { setOpen(false); refresh(); onChange?.(); }}
        />
      )}
      {lightbox && <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

function RowTile({ photo, onClick, onDelete }) {
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
