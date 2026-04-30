import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

// Themed photo lightbox.
//
// Props:
//   photos: [{ id, blobUrl, gps?: { lat, lng } }]
//   index: number — which photo to show first
//   onClose: () => void
//   onDelete?: (photo) => void  — when present, shows a trash button

export default function Lightbox({ photos, index: initialIndex, onClose, onDelete }) {
  const [idx, setIdx] = useState(initialIndex || 0);
  const startX = useRef(null);
  const startY = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(photos.length - 1, i + 1));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photos.length, onClose]);

  if (!photos.length) return null;
  const cur = photos[idx];

  function onTouchStart(e) {
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
  }
  function onTouchEnd(e) {
    if (startX.current == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    if (Math.abs(dy) > Math.abs(dx) * 1.5 && dy > 80) {
      onClose();
    } else if (dx > 60) {
      setIdx((i) => Math.max(0, i - 1));
    } else if (dx < -60) {
      setIdx((i) => Math.min(photos.length - 1, i + 1));
    }
    startX.current = null;
    startY.current = null;
  }

  return (
    <div
      className="lightbox"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <img
        src={cur.blobUrl}
        alt=""
        onClick={(e) => e.stopPropagation()}
      />

      <button
        className="lightbox-btn lightbox-close"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close"
        type="button"
      >
        <Icon name="close" size={20} strokeWidth={2} />
      </button>

      {cur.gps && (
        <div
          className="lightbox-gps"
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="gps" size={14} />
          <span>
            {cur.gps.lat.toFixed(5)}, {cur.gps.lng.toFixed(5)}
          </span>
        </div>
      )}

      {onDelete && (
        <button
          className="lightbox-btn lightbox-delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(cur);
            if (photos.length === 1) onClose();
            else setIdx((i) => Math.min(i, photos.length - 2));
          }}
          aria-label="Delete photo"
          type="button"
        >
          <Icon name="trash" size={18} strokeWidth={2} />
        </button>
      )}

      {photos.length > 1 && (
        <div
          className="lightbox-counter"
          onClick={(e) => e.stopPropagation()}
        >
          {idx + 1} / {photos.length}
        </div>
      )}
    </div>
  );
}
