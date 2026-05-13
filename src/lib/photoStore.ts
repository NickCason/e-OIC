// photoStore.ts — incoming-photo pipeline shared by camera + library paths.
// Downscales to MAX_LONG_EDGE and (optionally) re-injects EXIF GPS into the
// resulting JPEG. Does NOT burn an overlay — that happens at export time.

import { injectExifGPS } from '../photoOverlay';
import type { IPhotoGps } from '../types/job';

const MAX_LONG_EDGE = 2400;
const JPEG_QUALITY = 0.85;

export interface IProcessIncomingPhotoOptions {
    gps?: IPhotoGps | null;
}

export interface IProcessedPhoto {
    blob: Blob;
    width: number;
    height: number;
}

async function loadBitmap(file: File | Blob): Promise<ImageBitmap> {
    try {
        // imageOrientation 'from-image' applies EXIF Orientation so stored pixels
        // are upright; the live overlay anchors bottom-right of the upright image.
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
        throw new Error(
            "This photo format isn't supported in your browser. Try Take Photo, or re-save the image as JPEG before importing.",
        );
    }
}

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((b) => {
            if (b) resolve(b);
            else reject(new Error('Canvas could not encode JPEG.'));
        }, 'image/jpeg', JPEG_QUALITY);
    });
}

async function tryInjectGps(blob: Blob, gps: IPhotoGps): Promise<Blob> {
    try {
        return await injectExifGPS(blob, gps);
    } catch (e) {
        // Don't fail the capture if EXIF write fails — the photo and its
        // sidecar record still carry GPS via the DB row.
        console.warn('EXIF write failed:', e);
        return blob;
    }
}

export async function processIncomingPhoto(
    file: File | Blob,
    { gps = null }: IProcessIncomingPhotoOptions = {},
): Promise<IProcessedPhoto> {
    const bitmap = await loadBitmap(file);
    const scale = Math.min(1, MAX_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not obtain 2D canvas context for photo processing.');
    ctx.drawImage(bitmap, 0, 0, w, h);
    let blob = await canvasToJpegBlob(canvas);
    if (gps) blob = await tryInjectGps(blob, gps);
    return {
        blob,
        width: w,
        height: h,
    };
}
