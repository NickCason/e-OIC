// Temporary ambient declarations for photoOverlay.js. Plan C Task 8 replaces
// photoOverlay.js with a real .ts file and this shim is deleted.
/* eslint-disable import/prefer-default-export */

import type { IPhotoGps } from './types/job';

export function injectExifGPS(blob: Blob, gps: IPhotoGps): Promise<Blob>;
