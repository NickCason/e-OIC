// photoOverlay.ts — burns context info into the bottom-right of an image
// using Canvas, and (when GPS is provided) writes EXIF GPS metadata into the
// resulting JPEG.

import piexif from 'piexifjs';
import type { IExifData } from 'piexifjs';
import type { IPhotoGps } from './types/job';

export interface IBakedPhoto {
    blob: Blob;
    width: number;
    height: number;
}

type Rational = [number, number];
type DmsRationals = [Rational, Rational, Rational];
type GpsIfdValue = string | Rational | DmsRationals;
type GpsIfd = Record<number, GpsIfdValue>;

// Cap the long edge to keep file sizes reasonable for typical phone shots.
const MAX_LONG_EDGE = 2400;
const UNSUPPORTED_FORMAT_MESSAGE = "This photo format isn't supported in your browser. Try Take Photo, or re-save the image as JPEG before importing.";

export function blobToDataURL(blob: Blob): Promise<string> {
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

export function dataURLToBlob(dataUrl: string): Blob {
    const [meta, data] = dataUrl.split(',');
    if (meta === undefined || data === undefined) {
        throw new Error('Malformed data URL');
    }
    const mime = /:(.*?);/.exec(meta)?.[1] || 'image/jpeg';
    const bin = atob(data);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
}

export function degToDmsRational(deg: number): DmsRationals {
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

export function formatGpsDate(d: Date): string {
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}:${pad(d.getUTCMonth() + 1)}:${pad(d.getUTCDate())}`;
}

export function buildGpsExif({ lat, lng, accuracy }: IPhotoGps): GpsIfd {
    const out: GpsIfd = {};
    out[piexif.GPSIFD.GPSLatitudeRef] = lat >= 0 ? 'N' : 'S';
    out[piexif.GPSIFD.GPSLatitude] = degToDmsRational(Math.abs(lat));
    out[piexif.GPSIFD.GPSLongitudeRef] = lng >= 0 ? 'E' : 'W';
    out[piexif.GPSIFD.GPSLongitude] = degToDmsRational(Math.abs(lng));
    if (accuracy != null && Number.isFinite(accuracy)) {
        out[piexif.GPSIFD.GPSHPositioningError] = [Math.round(accuracy * 100), 100];
    }
    out[piexif.GPSIFD.GPSDateStamp] = formatGpsDate(new Date());
    return out;
}

// Inject GPS EXIF tags into a JPEG blob using piexifjs.
export async function injectExifGPS(blob: Blob, gps: IPhotoGps): Promise<Blob> {
    const dataUrl = await blobToDataURL(blob);
    const gpsExif = buildGpsExif(gps);
    const exifObj: IExifData = { GPS: gpsExif };
    const exifBytes = piexif.dump(exifObj);
    const newDataUrl = piexif.insert(exifBytes, dataUrl);
    return dataURLToBlob(newDataUrl);
}

function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
): void {
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

function measureMaxLineWidth(ctx: CanvasRenderingContext2D, lines: string[]): number {
    return lines.reduce((max, ln) => Math.max(max, ctx.measureText(ln).width), 0);
}

function drawOverlayLines(
    ctx: CanvasRenderingContext2D,
    lines: string[],
    originX: number,
    originY: number,
    lineHeight: number,
): void {
    ctx.fillStyle = '#ffffff';
    lines.forEach((line, i) => {
        ctx.fillText(line, originX, originY + i * lineHeight);
    });
}

function drawOverlay(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    lines: string[],
): void {
    const fontSize = Math.max(16, Math.round(h * 0.022));
    const padding = Math.round(fontSize * 0.6);
    const lineHeight = Math.round(fontSize * 1.25);
    ctx.font = `600 ${fontSize}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textBaseline = 'top';

    const maxW = measureMaxLineWidth(ctx, lines);

    const boxW = maxW + padding * 2;
    const boxH = lineHeight * lines.length + padding * 2 - (lineHeight - fontSize);
    const x = w - boxW - padding;
    const y = h - boxH - padding;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
    roundRect(ctx, x, y, boxW, boxH, 8);
    ctx.fill();

    drawOverlayLines(ctx, lines, x + padding, y + padding, lineHeight);
}

async function decodeBitmap(file: Blob): Promise<ImageBitmap> {
    try {
        return await createImageBitmap(file);
    } catch {
        throw new Error(UNSUPPORTED_FORMAT_MESSAGE);
    }
}

function composeOverlayCanvas(bitmap: ImageBitmap, lines: string[]): HTMLCanvasElement {
    const scale = Math.min(1, MAX_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to acquire 2D canvas context');
    ctx.drawImage(bitmap, 0, 0, w, h);

    drawOverlay(ctx, w, h, lines);
    return canvas;
}

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Canvas toBlob returned null'));
            },
            'image/jpeg',
            0.85,
        );
    });
}

export async function applyOverlay(
    file: Blob,
    lines: string[],
    gps: IPhotoGps | null = null,
): Promise<IBakedPhoto> {
    const bitmap = await decodeBitmap(file);
    const canvas = composeOverlayCanvas(bitmap, lines);

    let blob = await canvasToJpegBlob(canvas);

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

    return {
        blob,
        width: canvas.width,
        height: canvas.height,
    };
}

export function fmtTimestamp(d: Date = new Date()): string {
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtGps(gps: IPhotoGps | null | undefined): string | null {
    if (!gps) return null;
    const {
        lat,
        lng,
        accuracy,
    } = gps;
    const acc = accuracy != null ? ` ±${Math.round(accuracy)}m` : '';
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}${acc}`;
}
