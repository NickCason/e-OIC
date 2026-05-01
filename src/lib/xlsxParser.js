import schemaMap from '../schema.json' with { type: 'json' };

const AUXILIARY_SHEET_NAMES = new Set(['Rev', 'Checklist', 'Notes']);

function normalize(s) {
  if (s == null) return '';
  return String(s).replace(/\s+/g, ' ').trim().toLowerCase();
}

function extractCellValue(cell) {
  const v = cell.value;
  if (v == null) return null;
  if (typeof v === 'string') return v === '' ? null : v;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('result' in v) return v.result == null ? null : v.result;
    if ('text' in v) return v.text == null ? null : String(v.text);
    if ('richText' in v && Array.isArray(v.richText)) {
      return v.richText.map((p) => p.text || '').join('') || null;
    }
  }
  return null;
}

function buildHeaderIndex(ws, headerRow) {
  const idx = {};
  const row = ws.getRow(headerRow);
  for (let c = 1; c <= ws.columnCount; c++) {
    const v = row.getCell(c).value;
    const s = (v == null ? '' : String(v)).replace(/\n/g, ' ').trim();
    if (s) idx[normalize(s)] = { colNumber: c, raw: s };
  }
  return idx;
}

function rowIsAllBlank(rowData) {
  for (const k of Object.keys(rowData)) {
    if (rowData[k] != null) return false;
  }
  return true;
}

function parseSheetRows(ws, schema, warnings) {
  const headerIndex = buildHeaderIndex(ws, schema.header_row);
  const schemaHeaderNorms = new Set(schema.columns.map((c) => normalize(c.header)));

  for (const col of schema.columns) {
    if (col.header === schema.hyperlink_column) continue;
    if (!headerIndex[normalize(col.header)]) {
      warnings.push({ kind: 'missing-column', sheetName: ws.name, columnName: col.header });
    }
  }
  for (const norm of Object.keys(headerIndex)) {
    if (!schemaHeaderNorms.has(norm)) {
      warnings.push({ kind: 'extra-column', sheetName: ws.name, columnName: headerIndex[norm].raw });
    }
  }

  const rows = [];
  let r = schema.first_data_row;
  let consecutiveBlanks = 0;
  while (consecutiveBlanks < 2 && r <= ws.rowCount + 2) {
    const xlsxRow = ws.getRow(r);
    const data = {};
    for (const col of schema.columns) {
      if (col.header === schema.hyperlink_column) continue;
      const h = headerIndex[normalize(col.header)];
      if (!h) continue;
      data[col.header] = extractCellValue(xlsxRow.getCell(h.colNumber));
    }
    if (rowIsAllBlank(data)) {
      consecutiveBlanks += 1;
      r += 1;
      continue;
    }
    consecutiveBlanks = 0;
    const panelName = data['Panel Name'] != null ? String(data['Panel Name']) : null;
    rows.push({ panelName, data, notes: '', sourceRowIndex: r });
    r += 1;
  }
  return rows;
}

function parseNotesSheet(ws) {
  const out = { jobNotes: '', sheetNotes: [], rowNoteAssignments: [] };
  if (!ws) return out;

  let cursor = 1;
  const r1c1 = ws.getCell(1, 1).value;
  if (r1c1 != null && String(r1c1).trim() === 'Job Notes') {
    const r2c1 = ws.getCell(2, 1).value;
    out.jobNotes = r2c1 == null ? '' : String(r2c1).trim();
    cursor = 3;
  }

  let headerR = null;
  for (let r = cursor; r <= ws.rowCount; r++) {
    const a = ws.getCell(r, 1).value;
    const b = ws.getCell(r, 2).value;
    const c = ws.getCell(r, 3).value;
    const d = ws.getCell(r, 4).value;
    if (
      a != null && String(a).trim() === 'Sheet' &&
      b != null && String(b).trim() === 'Panel' &&
      c != null && String(c).trim() === 'Row' &&
      d != null && String(d).trim() === 'Notes'
    ) {
      headerR = r;
      break;
    }
  }
  if (headerR == null) return out;

  for (let r = headerR + 1; r <= ws.rowCount + 1; r++) {
    const sheetCell = ws.getCell(r, 1).value;
    const panelCell = ws.getCell(r, 2).value;
    const labelCell = ws.getCell(r, 3).value;
    const notesCell = ws.getCell(r, 4).value;
    if (sheetCell == null && panelCell == null && labelCell == null && notesCell == null) break;
    const sheetName = sheetCell == null ? '' : String(sheetCell).trim();
    const panelName = panelCell == null ? '' : String(panelCell).trim();
    const label = labelCell == null ? '' : String(labelCell).trim();
    const text = notesCell == null ? '' : String(notesCell).trim();
    if (!text) continue;
    if (label === '(sheet)') {
      out.sheetNotes.push({ panelName, sheetName, text });
    } else {
      out.rowNoteAssignments.push({ sheetName, panelName, label, text });
    }
  }
  return out;
}

export async function parseChecklistXlsx(arrayBuffer, { onProgress } = {}) {
  const emit = (phase, detail) => {
    if (typeof onProgress === 'function') {
      try { onProgress({ phase, detail }); } catch { /* swallow callback errors */ }
    }
  };
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
  emit('loading', `Reading ${Math.round(arrayBuffer.byteLength / 1024)} KB`);
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

  // Parse Panels first so other sheets can validate against panel names.
  if (sheetNames.includes('Panels')) {
    const ws = wb.getWorksheet('Panels');
    const rows = parseSheetRows(ws, schemaMap['Panels'], result.warnings);
    result.rowsBySheet['Panels'] = rows;
    for (const row of rows) {
      const name = row.data?.['Panel Name'] != null ? String(row.data['Panel Name']).trim() : '';
      if (name) {
        result.panels.push({ name, sourceRowIndex: row.sourceRowIndex });
      }
    }
  }
  emit('panels', `Found ${result.panels.length} panel${result.panels.length === 1 ? '' : 's'}`);

  for (const sn of Object.keys(schemaMap)) {
    if (sn === 'Panels') continue;
    if (!sheetNames.includes(sn)) continue;
    const ws = wb.getWorksheet(sn);
    emit('rows', `Reading ${sn}`);
    result.rowsBySheet[sn] = parseSheetRows(ws, schemaMap[sn], result.warnings);
  }

  // Validate panel-name references across non-Panels sheets.
  const knownPanelNames = new Set(result.panels.map((p) => p.name));
  for (const sn of Object.keys(result.rowsBySheet)) {
    if (sn === 'Panels') continue;
    const counts = new Map();
    for (const row of result.rowsBySheet[sn]) {
      if (row.panelName == null) continue;
      if (knownPanelNames.has(row.panelName)) continue;
      counts.set(row.panelName, (counts.get(row.panelName) || 0) + 1);
    }
    for (const [panelName, rowCount] of counts) {
      result.warnings.push({
        kind: 'unknown-panel-reference',
        sheetName: sn,
        panelName,
        rowCount,
      });
    }
  }

  // Notes sheet
  const notesWs = wb.getWorksheet('Notes');
  const notes = parseNotesSheet(notesWs);
  result.jobMeta.notes = notes.jobNotes;
  result.sheetNotes = notes.sheetNotes;

  // Match row-note assignments back to parsed rows by (sheet, panelName, label).
  emit('matching', 'Matching notes to rows');
  const { rowDisplayLabel } = await import('./rowLabel.js');
  for (const assignment of notes.rowNoteAssignments) {
    const rows = result.rowsBySheet[assignment.sheetName];
    if (!rows) {
      result.warnings.push({
        kind: 'notes-row-unmatched',
        sheetName: assignment.sheetName,
        panelName: assignment.panelName,
        label: assignment.label,
      });
      continue;
    }
    const schema = schemaMap[assignment.sheetName];
    const match = rows.find((row) =>
      row.panelName === assignment.panelName &&
      rowDisplayLabel({ data: row.data, idx: 0 }, assignment.sheetName, schema) === assignment.label,
    );
    if (match) {
      match.notes = assignment.text;
    } else {
      result.warnings.push({
        kind: 'notes-row-unmatched',
        sheetName: assignment.sheetName,
        panelName: assignment.panelName,
        label: assignment.label,
      });
    }
  }

  return result;
}
