// paths.ts — shared helpers for computing photo folder paths.
// Used by exporter.js (writes the cell hyperlink) and by the row editor
// (renders a preview of the same path so the user knows where the photos
// will land in the exported zip).

import { rowDisplayLabel } from './rowLabel';
import type { IRow } from '../types/job';
import type { ISheetSchema } from '../types/xlsx';

export function safe(name: unknown): string {
    return String(name || 'unnamed').replace(/[\\/:*?"<>|]/g, '_').trim();
}

// Folder label for a row's photos. Mirrors the in-app row pill via
// rowDisplayLabel, then sanitizes for the filesystem.
export function rowLabel(row: IRow, schema: ISheetSchema | null | undefined): string {
    return safe(rowDisplayLabel(row, row.sheet, schema));
}

export function rowPhotoFolder(
    panelName: string,
    sheetName: string,
    row: IRow,
    schema: ISheetSchema | null | undefined,
): string {
    return `Photos/${safe(panelName)}/${safe(sheetName)}/${rowLabel(row, schema)}/`;
}

// Aggressive ASCII-safe filename for OS share intents.
//
// Android Chrome's navigator.share routes files through MediaStore via a
// content:// URI, and the MediaStore filename validator rejects Unicode
// em-dashes/en-dashes, smart quotes, and other non-ASCII punctuation,
// surfacing as NotAllowedError ("Permission denied") to the page. iOS
// Safari is more permissive but still has edge cases. We sanitize once,
// at share time, so the file inside the zip and the in-app job name stay
// fully Unicode while the OUTER share filename is safe.
export function shareSafeFilename(name: unknown): string {
    return String(name || 'unnamed')
        .replace(/[—–]/g, '-') // em/en dash → hyphen
        .replace(/[‘’ʼ]/g, "'") // smart single quotes → straight
        .replace(/[“”]/g, '"') // smart double quotes → straight
        .normalize('NFKD') // decompose accented chars
        .replace(/[̀-ͯ]/g, '') // strip combining diacritics
        .replace(/[\\/:*?"<>|]/g, '_') // Windows-reserved chars
        .replace(/[^\x20-\x7E]/g, '') // strip remaining non-ASCII
        .replace(/\s+/g, ' ') // collapse whitespace runs
        .trim()
        || 'unnamed';
}
