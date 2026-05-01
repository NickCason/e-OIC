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
