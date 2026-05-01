// xlsxParser.js — read an xlsx exported by e-OIC (or hand-edited variant)
// back into the in-memory shape we use for diffs and IndexedDB writes.
//
// Pure function; no DOM, no IndexedDB. ExcelJS is dynamic-imported so the
// initial PWA bundle stays small.

import schemaMap from '../schema.json' with { type: 'json' };

const AUXILIARY_SHEET_NAMES = new Set(['Rev', 'Checklist', 'Notes']);

export async function parseChecklistXlsx(arrayBuffer) {
  const result = {
    jobMeta: { name: null, client: '', location: '', notes: '' },
    panels: [],
    rowsBySheet: {},
    sheetNotes: [],
    warnings: [],
    errors: [],
  };

  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(arrayBuffer);
  } catch (e) {
    result.errors.push({ kind: 'invalid-xlsx', message: e?.message || 'Could not read xlsx' });
    return result;
  }

  const sheetNames = wb.worksheets.map((ws) => ws.name);
  const recognized = sheetNames.filter((n) => schemaMap[n]);
  if (recognized.length === 0) {
    result.errors.push({ kind: 'no-recognized-sheets' });
    return result;
  }

  for (const name of sheetNames) {
    if (schemaMap[name]) continue;
    if (AUXILIARY_SHEET_NAMES.has(name)) continue;
    result.warnings.push({ kind: 'unknown-sheet', sheetName: name });
  }

  for (const sn of Object.keys(schemaMap)) {
    if (!sheetNames.includes(sn)) {
      result.warnings.push({ kind: 'missing-sheet', sheetName: sn });
    }
    result.rowsBySheet[sn] = [];
  }

  return result;
}
