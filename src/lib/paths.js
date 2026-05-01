// paths.js — shared helpers for computing photo folder paths.
// Used by exporter.js (writes the cell hyperlink) and by the row editor
// (renders a preview of the same path so the user knows where the photos
// will land in the exported zip).

import { rowDisplayLabel } from './rowLabel.js';

export function safe(name) {
  return String(name || 'unnamed').replace(/[\\/:*?"<>|]/g, '_').trim();
}

// Folder label for a row's photos. Mirrors the in-app row pill via
// rowDisplayLabel, then sanitizes for the filesystem.
export function rowLabel(row, schema) {
  return safe(rowDisplayLabel(row, row.sheet, schema));
}

export function rowPhotoFolder(panelName, sheetName, row, schema) {
  return `Photos/${safe(panelName)}/${safe(sheetName)}/${rowLabel(row, schema)}/`;
}
