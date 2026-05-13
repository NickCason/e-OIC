import React from 'react';
import { fmtTimestamp, fmtGps } from '../photoOverlay';

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
