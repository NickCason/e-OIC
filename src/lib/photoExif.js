// photoExif.js — read GPS + DateTimeOriginal from a JPEG File using piexifjs.
// Treats parse failures as "no metadata"; never throws to caller.

import piexif from 'piexifjs';

// piexif tag IDs (from the EXIF spec) used here:
//   GPS IFD: 1 GPSLatitudeRef, 2 GPSLatitude, 3 GPSLongitudeRef, 4 GPSLongitude,
//            31 GPSHPositioningError
//   Exif IFD: 36867 DateTimeOriginal

export async function readPhotoExif(file) {
  try {
    const dataUrl = await blobToDataURL(file);
    const exif = piexif.load(dataUrl);
    return {
      gps: parseGpsIfd(exif?.GPS),
      takenAt: parseDateTimeOriginal(exif?.Exif),
    };
  } catch {
    return { gps: null, takenAt: null };
  }
}

export function parseGpsIfd(gpsIfd) {
  if (!gpsIfd) return null;
  const latRef = gpsIfd[1];
  const lat = gpsIfd[2];
  const lngRef = gpsIfd[3];
  const lng = gpsIfd[4];
  if (!latRef || !lat || !lngRef || !lng) return null;
  const latDeg = dmsToDecimal(lat) * (latRef === 'S' ? -1 : 1);
  const lngDeg = dmsToDecimal(lng) * (lngRef === 'W' ? -1 : 1);
  if (!Number.isFinite(latDeg) || !Number.isFinite(lngDeg)) return null;
  const out = { lat: latDeg, lng: lngDeg };
  const accRational = gpsIfd[31];
  if (Array.isArray(accRational) && accRational[1]) {
    const acc = accRational[0] / accRational[1];
    if (Number.isFinite(acc)) out.accuracy = acc;
  }
  return out;
}

export function parseDateTimeOriginal(exifIfd) {
  if (!exifIfd) return null;
  const s = exifIfd[36867];
  if (typeof s !== 'string') return null;
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m.map((x, i) => i === 0 ? x : Number(x));
  if (y < 1970 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const ms = new Date(y, mo - 1, d, h, mi, se).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function dmsToDecimal(rationals) {
  if (!Array.isArray(rationals) || rationals.length < 3) return NaN;
  const [deg, min, sec] = rationals.map(([n, d]) => (d ? n / d : NaN));
  return deg + min / 60 + sec / 3600;
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
