// photoOverlay.js — burns context info into the bottom-right of an image
// using Canvas, and (when GPS is provided) writes EXIF GPS metadata into the
// resulting JPEG.

import piexif from 'piexifjs';

export async function applyOverlay(file, lines, gps = null) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (err) {
    throw new Error(
      "This photo format isn't supported in your browser. Try Take Photo, or re-save the image as JPEG before importing."
    );
  }

  // Cap the long edge to keep file sizes reasonable for typical phone shots.
  const MAX = 2400;
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);

  drawOverlay(ctx, w, h, lines);

  let blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.85);
  });

  // If GPS is provided, embed it as EXIF in the JPEG.
  if (gps) {
    try {
      blob = await injectExifGPS(blob, gps);
    } catch (e) {
      // Don't fail the whole capture if EXIF write fails — the user still gets
      // the photo with the visible overlay and the sidecar CSV record.
      console.warn('EXIF write failed:', e);
    }
  }

  return { blob, width: w, height: h };
}

function drawOverlay(ctx, w, h, lines) {
  const fontSize = Math.max(16, Math.round(h * 0.022));
  const padding = Math.round(fontSize * 0.6);
  const lineHeight = Math.round(fontSize * 1.25);
  ctx.font = `600 ${fontSize}px -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textBaseline = 'top';

  let maxW = 0;
  for (const ln of lines) {
    const m = ctx.measureText(ln).width;
    if (m > maxW) maxW = m;
  }

  const boxW = maxW + padding * 2;
  const boxH = lineHeight * lines.length + padding * 2 - (lineHeight - fontSize);
  const x = w - boxW - padding;
  const y = h - boxH - padding;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
  roundRect(ctx, x, y, boxW, boxH, 8);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x + padding, y + padding + i * lineHeight);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Inject GPS EXIF tags into a JPEG blob using piexifjs.
export async function injectExifGPS(blob, gps) {
  const dataUrl = await blobToDataURL(blob);
  const gpsExif = buildGpsExif(gps);
  const exifObj = { 'GPS': gpsExif };
  const exifBytes = piexif.dump(exifObj);
  const newDataUrl = piexif.insert(exifBytes, dataUrl);
  return dataURLToBlob(newDataUrl);
}

export function buildGpsExif({ lat, lng, accuracy }) {
  const out = {};
  out[piexif.GPSIFD.GPSLatitudeRef] = lat >= 0 ? 'N' : 'S';
  out[piexif.GPSIFD.GPSLatitude] = degToDmsRational(Math.abs(lat));
  out[piexif.GPSIFD.GPSLongitudeRef] = lng >= 0 ? 'E' : 'W';
  out[piexif.GPSIFD.GPSLongitude] = degToDmsRational(Math.abs(lng));
  if (accuracy != null && isFinite(accuracy)) {
    out[piexif.GPSIFD.GPSHPositioningError] = [Math.round(accuracy * 100), 100];
  }
  out[piexif.GPSIFD.GPSDateStamp] = formatGpsDate(new Date());
  return out;
}

export function degToDmsRational(deg) {
  const d = Math.floor(deg);
  const minFloat = (deg - d) * 60;
  const m = Math.floor(minFloat);
  const s = (minFloat - m) * 60;
  // piexifjs expects [num, den] arrays for rationals
  return [
    [d, 1],
    [m, 1],
    [Math.round(s * 1000), 1000],
  ];
}

export function formatGpsDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}:${pad(d.getUTCMonth() + 1)}:${pad(d.getUTCDate())}`;
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function dataURLToBlob(dataUrl) {
  const [meta, data] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(meta)?.[1] || 'image/jpeg';
  const bin = atob(data);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function fmtTimestamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtGps(gps) {
  if (!gps) return null;
  const { lat, lng, accuracy } = gps;
  const acc = accuracy != null ? ` ±${Math.round(accuracy)}m` : '';
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}${acc}`;
}
