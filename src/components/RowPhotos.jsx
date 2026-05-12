import React, { useState, useEffect, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { listRowPhotos, deletePhoto } from '../db';
import schemaMap from '../schema.json';
import PhotoCapture from './PhotoCapture.jsx';
import Icon from './Icon.jsx';
import Lightbox from './Lightbox.jsx';
import { toast } from '../lib/toast';
import PhotoOverlay from './PhotoOverlay.jsx';
import { rowDisplayLabel } from '../lib/rowLabel';

// Row-level photos: tied to a specific row (one PLC card, one drive, etc.).
// Inside the export these become Photos/{Panel}/{Sheet}/{RowLabel}/IMG_001.jpg.

export default function RowPhotos({ job, panel, sheetName, row, onChange }) {
  const [photos, setPhotos] = useState([]);
  const [open, setOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  async function refresh() {
    setPhotos(await listRowPhotos(row.id));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh is a non-stable inline async fn; adding it would infinite-loop. Intent: run only when row.id changes.
  useEffect(() => { refresh(); }, [row.id]);

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

  const itemLabel = rowDisplayLabel(row, sheetName, schemaMap[sheetName]);
  const overlayPhotos = useMemo(() => photosWithUrls.map((p) => ({
    ...p,
    jobName: job.name,
    panelName: panel.name,
    sheetName,
    itemLabel,
  })), [photosWithUrls, job.name, panel.name, sheetName, itemLabel]);

  function openLightbox(i) {
    if (typeof document !== 'undefined' && document.startViewTransition) {
      document.startViewTransition(() => flushSync(() => setLightboxIndex(i)));
    } else {
      setLightboxIndex(i);
    }
  }
  function closeLightbox() {
    if (typeof document !== 'undefined' && document.startViewTransition) {
      document.startViewTransition(() => flushSync(() => setLightboxIndex(null)));
    } else {
      setLightboxIndex(null);
    }
  }

  async function handleDeletePhoto(p) {
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
      <div className="photo-grid">
        {overlayPhotos.map((p, i) => (
          <div
            key={p.id}
            className="photo-tile"
            style={{ viewTransitionName: lightboxIndex === null ? `photo-${p.id}` : 'none' }}
            onClick={() => openLightbox(i)}
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
        <button
          className="photo-tile photo-tile--add"
          onClick={() => setOpen(true)}
          aria-label="Add photo"
          type="button"
        >
          <Icon name="add" size={22} strokeWidth={1.75} />
        </button>
      </div>
      {open && (
        <PhotoCapture
          job={job}
          panel={panel}
          sheetName={sheetName}
          item={null}
          rowId={row.id}
          rowLabelHint={itemLabel}
          onClose={() => { setOpen(false); refresh(); onChange?.(); }}
        />
      )}
      {lightboxIndex !== null && overlayPhotos[lightboxIndex] && (
        <Lightbox
          photos={overlayPhotos}
          index={lightboxIndex}
          onClose={closeLightbox}
          onDelete={handleDeletePhoto}
        />
      )}
    </div>
  );
}
