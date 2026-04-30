// paths.js — shared helpers for computing photo folder paths.
// Used by exporter.js (writes the cell hyperlink) and by the row editor
// (renders a preview of the same path so the user knows where the photos
// will land in the exported zip).

export function safe(name) {
  return String(name || 'unnamed').replace(/[\\/:*?"<>|]/g, '_').trim();
}

function pad3(n) { return String(n).padStart(3, '0'); }

// Pick a meaningful folder label for a row's photos: prefer "Device Name",
// "Panel Name", or another *Name field; fall back to "Row N".
export function rowLabel(row, schema) {
  const preferred = ['Device Name', 'Panel Name', 'Tag/Component Name', 'Address'];
  for (const p of preferred) {
    const v = row.data?.[p];
    if (v) return safe(v);
  }
  for (const col of schema.columns) {
    if (/name/i.test(col.header) && !/hyperlink/i.test(col.header)) {
      const v = row.data?.[col.header];
      if (v) return safe(v);
    }
  }
  return `Row${pad3((row.idx ?? 0) + 1)}`;
}

export function rowPhotoFolder(panelName, sheetName, row, schema) {
  return `Photos/${safe(panelName)}/${safe(sheetName)}/${rowLabel(row, schema)}/`;
}
