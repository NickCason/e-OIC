// exporter.js — produces {jobName}.zip:
//
//   {jobName}.xlsx                              populated workbook (template-faithful)
//   {jobName}_photo_metadata.csv                sidecar with GPS / timestamps for every photo
//   Photos/{Panel}/{Item}/IMG_001.jpg           panel-level photos (Photo Checklist items)
//   Photos/{Panel}/{Sheet}/{RowLabel}/IMG_001.jpg
//                                                row-level photos (per-device)
//
// Heavy libraries (exceljs, jszip) are dynamic-imported so they're not part of
// the initial PWA bundle — they only load when the user taps "Build Export".

import schemaMap from './schema.json';
import {
  listPanels, listAllRows, listPanelPhotos, getSheetNotes, getJob,
} from './db.js';
import { fmtTimestamp, fmtGps } from './photoOverlay.js';
import { safe, rowLabel } from './lib/paths.js';

const SHEET_ORDER = [
  'Panels', 'Power', 'PLC Racks', 'PLC Slots', 'Fieldbus IO',
  'Network Devices', 'HMIs', 'Ethernet Switches', 'Drive Parameters',
  'Conv. Speeds', 'Safety Circuit', 'Safety Devices', 'Peer to Peer Comms',
];

function pad3(n) { return String(n).padStart(3, '0'); }

function findColumnIndex(ws, headerRow, target) {
  const row = ws.getRow(headerRow);
  for (let c = 1; c <= ws.columnCount; c++) {
    const v = row.getCell(c).value;
    const s = (v == null ? '' : String(v)).replace(/\n/g, ' ').trim();
    if (s === target) return c;
  }
  return null;
}

function coerce(v) {
  if (v === undefined || v === null || v === '') return null;
  if (v === true || v === false) return v;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return null;
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    return v;
  }
  return v;
}

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function buildExport(job, {
  templateUrl = './template.xlsx',
  onProgress = () => {},
} = {}) {
  // Load heavy libs only at export time
  onProgress({ phase: 'loading-libs', percent: 2 });
  const [{ default: ExcelJS }, { default: JSZip }] = await Promise.all([
    import('exceljs'),
    import('jszip'),
  ]);

  // 1. Template
  onProgress({ phase: 'loading-template', percent: 8 });
  const tmplResp = await fetch(templateUrl);
  if (!tmplResp.ok) throw new Error('Could not load template.xlsx');
  const tmplBuf = await tmplResp.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(tmplBuf);

  // 2. Job-level data
  const panels = await listPanels(job.id);

  // 3. Populate sheets
  onProgress({ phase: 'populating', percent: 15 });
  const sheetCount = SHEET_ORDER.length;
  let sheetI = 0;

  // Track row notes per (sheet,panel,rowLabel) to write a "Notes" appendix
  const notesAppendix = []; // { sheet, panel, label, notes }

  for (const sheetName of SHEET_ORDER) {
    sheetI += 1;
    onProgress({
      phase: 'populating',
      percent: 15 + Math.floor((sheetI / sheetCount) * 35),
      detail: sheetName,
    });

    const schema = schemaMap[sheetName];
    if (!schema) continue;
    const ws = wb.getWorksheet(sheetName);
    if (!ws) continue;

    const colIndex = {};
    for (const col of schema.columns) {
      const idx = findColumnIndex(ws, schema.header_row, col.header);
      if (idx) colIndex[col.header] = idx;
    }

    let writeRow = schema.first_data_row;
    let wroteAnything = false;

    for (const panel of panels) {
      const allRows = await listAllRows(panel.id);
      const sheetRows = allRows
        .filter((r) => r.sheet === sheetName)
        .sort((a, b) => a.idx - b.idx);

      // Sheet-level note for (panel, sheet)
      const sheetNote = await getSheetNotes(panel.id, sheetName);
      if (sheetNote) {
        notesAppendix.push({
          sheet: sheetName,
          panel: panel.name,
          label: '(sheet)',
          notes: sheetNote,
        });
      }

      for (const row of sheetRows) {
        const r = ws.getRow(writeRow);
        for (let c = 1; c <= ws.columnCount; c++) r.getCell(c).value = null;

        for (const col of schema.columns) {
          const ci = colIndex[col.header];
          if (!ci) continue;
          if (col.header === schema.hyperlink_column) {
            const folder = `Photos/${safe(panel.name)}/${safe(sheetName)}/${rowLabel(row, schema)}/`;
            r.getCell(ci).value = { text: folder, hyperlink: folder };
          } else {
            r.getCell(ci).value = coerce(row.data?.[col.header]);
          }
        }
        r.commit();

        if (row.notes && row.notes.trim()) {
          notesAppendix.push({
            sheet: sheetName,
            panel: panel.name,
            label: rowLabel(row, schema),
            notes: row.notes.trim(),
          });
        }

        writeRow += 1;
        wroteAnything = true;
      }
    }

    // Clear any leftover example rows that the template had below our data.
    // The template ships with example rows starting at `first_data_row`.
    // Whatever we didn't overwrite needs to be wiped or the user gets fake
    // "Example" entries in their export.
    let clearRow = writeRow;
    let safetyLimit = 30; // don't run forever on weird sheets
    while (safetyLimit-- > 0) {
      const r = ws.getRow(clearRow);
      // Stop when we hit a blank row (no values across the meaningful columns)
      let hasValue = false;
      for (let c = 1; c <= ws.columnCount; c++) {
        const v = r.getCell(c).value;
        if (v !== null && v !== undefined && v !== '') { hasValue = true; break; }
      }
      if (!hasValue) break;
      for (let c = 1; c <= ws.columnCount; c++) r.getCell(c).value = null;
      r.commit();
      clearRow += 1;
    }
  }

  // 4. Update Checklist completion
  try {
    const cl = wb.getWorksheet('Checklist');
    if (cl) {
      const sheetByTask = {
        'Panel Sheet': 'Panels',
        'Power Sheet': 'Power',
        'PLC Racks Sheet': 'PLC Racks',
        'PLC Slots sheet': 'PLC Slots',
        'HMIs Sheet': 'HMIs',
        'Ethernet Switches Sheet': 'Ethernet Switches',
        'Fieldbus IO Sheet': 'Fieldbus IO',
        'Devices Sheet': 'Network Devices',
        'Conv. Speeds Sheet': 'Conv. Speeds',
        'Safety Circuit Sheet': 'Safety Circuit',
        'Safety Devices Sheet': 'Safety Devices',
        'Peer to Peer Comms': 'Peer to Peer Comms',
      };
      const filled = new Set();
      for (const p of panels) {
        const rs = await listAllRows(p.id);
        for (const r of rs) filled.add(r.sheet);
      }
      for (let r = 2; r <= cl.rowCount; r++) {
        const task = cl.getCell(r, 1).value;
        if (!task) continue;
        const sheet = sheetByTask[String(task).trim()];
        if (sheet && filled.has(sheet)) {
          cl.getCell(r, 3).value = true;
        }
      }
    }
  } catch (e) {
    console.warn('Checklist update skipped:', e);
  }

  // 5. Append Notes sheet (job + per-row notes) — added only if we have any
  if (job.notes?.trim() || notesAppendix.length > 0) {
    let notesWs = wb.getWorksheet('Notes');
    if (!notesWs) notesWs = wb.addWorksheet('Notes');
    notesWs.getColumn(1).width = 18;
    notesWs.getColumn(2).width = 18;
    notesWs.getColumn(3).width = 22;
    notesWs.getColumn(4).width = 60;

    let r = 1;
    if (job.notes?.trim()) {
      notesWs.getCell(r, 1).value = 'Job Notes';
      notesWs.getCell(r, 1).font = { bold: true };
      r += 1;
      notesWs.getCell(r, 1).value = job.notes.trim();
      notesWs.getCell(r, 1).alignment = { wrapText: true, vertical: 'top' };
      notesWs.mergeCells(r, 1, r, 4);
      r += 2;
    }
    if (notesAppendix.length > 0) {
      notesWs.getCell(r, 1).value = 'Sheet';
      notesWs.getCell(r, 2).value = 'Panel';
      notesWs.getCell(r, 3).value = 'Row';
      notesWs.getCell(r, 4).value = 'Notes';
      for (let c = 1; c <= 4; c++) notesWs.getCell(r, c).font = { bold: true };
      r += 1;
      for (const n of notesAppendix) {
        notesWs.getCell(r, 1).value = n.sheet;
        notesWs.getCell(r, 2).value = n.panel;
        notesWs.getCell(r, 3).value = n.label;
        notesWs.getCell(r, 4).value = n.notes;
        notesWs.getCell(r, 4).alignment = { wrapText: true, vertical: 'top' };
        r += 1;
      }
    }
  }

  // 6. Serialize
  onProgress({ phase: 'serializing', percent: 55 });
  const xlsxBuf = await wb.xlsx.writeBuffer();

  // 7. Build zip
  onProgress({ phase: 'bundling', percent: 60 });
  const zip = new JSZip();
  const jobSafe = safe(job.name);
  zip.file(`${jobSafe}.xlsx`, xlsxBuf);

  // Photo metadata sidecar CSV
  const csvHeader = [
    'panel', 'sheet', 'item_or_row', 'level', 'filename',
    'taken_at_iso', 'gps_lat', 'gps_lng', 'gps_accuracy_m',
  ].join(',');
  const csvRows = [csvHeader];

  // Build a map of rowId → label for fast lookup, per panel.
  // Then group photos by their target folder and write them in order.
  let writtenPhotos = 0;
  const allPanelPhotos = [];
  for (const panel of panels) {
    const photos = await listPanelPhotos(panel.id);
    allPanelPhotos.push({ panel, photos });
  }
  const grandTotalPhotos = allPanelPhotos.reduce((s, p) => s + p.photos.length, 0);

  for (const { panel, photos } of allPanelPhotos) {
    // Build rowId → (sheet, label) map for this panel
    const rowsForPanel = await listAllRows(panel.id);
    const rowInfo = new Map();
    for (const r of rowsForPanel) {
      const sch = schemaMap[r.sheet];
      rowInfo.set(r.id, { sheet: r.sheet, label: rowLabel(r, sch) });
    }

    // Group photos by destination folder
    const byFolder = new Map();
    for (const ph of photos.sort((a, b) => a.takenAt - b.takenAt)) {
      let folder;
      let level;
      let itemLabel;
      if (ph.rowId && rowInfo.has(ph.rowId)) {
        const ri = rowInfo.get(ph.rowId);
        folder = `Photos/${safe(panel.name)}/${safe(ri.sheet)}/${ri.label}`;
        level = 'row';
        itemLabel = ri.label;
      } else {
        // Panel-level (Photo Checklist) photo
        folder = `Photos/${safe(panel.name)}/${safe(ph.item || ph.sheet)}`;
        level = 'panel';
        itemLabel = ph.item || ph.sheet;
      }
      if (!byFolder.has(folder)) byFolder.set(folder, []);
      byFolder.get(folder).push({ photo: ph, level, itemLabel });
    }

    for (const [folder, list] of byFolder) {
      list.forEach((entry, i) => {
        const ph = entry.photo;
        const ext = (ph.mime || 'image/jpeg').split('/')[1] || 'jpg';
        const fname = `IMG_${pad3(i + 1)}.${ext === 'jpeg' ? 'jpg' : ext}`;
        zip.file(`${folder}/${fname}`, ph.blob);
        csvRows.push([
          panel.name,
          ph.sheet,
          entry.itemLabel,
          entry.level,
          `${folder}/${fname}`,
          new Date(ph.takenAt).toISOString(),
          ph.gps?.lat ?? '',
          ph.gps?.lng ?? '',
          ph.gps?.accuracy ?? '',
        ].map(csvEscape).join(','));

        writtenPhotos += 1;
        if (writtenPhotos % 5 === 0 && grandTotalPhotos > 0) {
          onProgress({
            phase: 'bundling',
            percent: 60 + Math.floor((writtenPhotos / grandTotalPhotos) * 30),
            detail: `${writtenPhotos} / ${grandTotalPhotos} photos`,
          });
        }
      });
    }
  }

  zip.file(`${jobSafe}_photo_metadata.csv`, csvRows.join('\n'));

  onProgress({ phase: 'compressing', percent: 92 });
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'STORE',
  });

  onProgress({ phase: 'done', percent: 100 });
  return { blob: zipBlob, filename: `${jobSafe}.zip`, sizeBytes: zipBlob.size };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function shareBlob(blob, filename, title) {
  const file = new File([blob], filename, { type: blob.type || 'application/zip' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return true;
  }
  return false;
}
