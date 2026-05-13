// photoExif.ts — read GPS + DateTimeOriginal from a JPEG File using piexifjs.
// Treats parse failures as "no metadata"; never throws to caller.

import piexif from 'piexifjs';
import type { IExifData } from 'piexifjs';
import type { IPhotoGps } from '../types/job';

// piexif tag IDs (from the EXIF spec) used here:
//   GPS IFD: 1 GPSLatitudeRef, 2 GPSLatitude, 3 GPSLongitudeRef, 4 GPSLongitude,
//            31 GPSHPositioningError
//   Exif IFD: 36867 DateTimeOriginal

export interface IPhotoExif {
    gps: IPhotoGps | null;
    takenAt: number | null;
}

type IExifIfd = NonNullable<IExifData['Exif']>;
type IGpsIfd = NonNullable<IExifData['GPS']>;

type Rational = [number, number];
type DmsRationals = [Rational, Rational, Rational];

function blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
            const { result } = r;
            if (typeof result === 'string') resolve(result);
            else reject(new Error('FileReader did not return a string'));
        };
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
    });
}

function isRational(v: unknown): v is Rational {
    return Array.isArray(v) && v.length >= 2 && typeof v[0] === 'number' && typeof v[1] === 'number';
}

function isDmsRationals(v: unknown): v is DmsRationals {
    return Array.isArray(v) && v.length >= 3 && isRational(v[0]) && isRational(v[1]) && isRational(v[2]);
}

function rationalToFloat(r: Rational): number {
    return r[1] ? r[0] / r[1] : NaN;
}

function dmsToDecimal(rationals: DmsRationals): number {
    const [degR, minR, secR] = rationals;
    return rationalToFloat(degR) + rationalToFloat(minR) / 60 + rationalToFloat(secR) / 3600;
}

function extractAccuracy(accRational: unknown): number | null {
    if (!isRational(accRational)) return null;
    const denom = accRational[1];
    if (!denom) return null;
    const acc = accRational[0] / denom;
    return Number.isFinite(acc) ? acc : null;
}

export function parseGpsIfd(gpsIfd: IGpsIfd | null | undefined): IPhotoGps | null {
    if (!gpsIfd) return null;
    const latRef = gpsIfd[1];
    const lat = gpsIfd[2];
    const lngRef = gpsIfd[3];
    const lng = gpsIfd[4];
    if (!latRef || !lat || !lngRef || !lng) return null;
    if (typeof latRef !== 'string' || typeof lngRef !== 'string') return null;
    if (!isDmsRationals(lat) || !isDmsRationals(lng)) return null;
    const latDeg = dmsToDecimal(lat) * (latRef === 'S' ? -1 : 1);
    const lngDeg = dmsToDecimal(lng) * (lngRef === 'W' ? -1 : 1);
    if (!Number.isFinite(latDeg) || !Number.isFinite(lngDeg)) return null;
    const out: IPhotoGps = { lat: latDeg, lng: lngDeg };
    const acc = extractAccuracy(gpsIfd[31]);
    if (acc !== null) out.accuracy = acc;
    return out;
}

export function parseDateTimeOriginal(exifIfd: IExifIfd | null | undefined): number | null {
    if (!exifIfd) return null;
    const s = exifIfd[36867];
    if (typeof s !== 'string') return null;
    const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const h = Number(m[4]);
    const mi = Number(m[5]);
    const se = Number(m[6]);
    if (y < 1970 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const ms = new Date(y, mo - 1, d, h, mi, se).getTime();
    return Number.isFinite(ms) ? ms : null;
}

export async function readPhotoExif(file: File | Blob): Promise<IPhotoExif> {
    try {
        const dataUrl = await blobToDataURL(file);
        const exif = piexif.load(dataUrl);
        return {
            gps: parseGpsIfd(exif?.GPS ?? null),
            takenAt: parseDateTimeOriginal(exif?.Exif ?? null),
        };
    } catch {
        return { gps: null, takenAt: null };
    }
}
