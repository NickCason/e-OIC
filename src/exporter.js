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

import schemaMap from './schema.json' with { type: 'json' };
import {
  listPanels, listAllRows, listPanelPhotos, getSheetNotes, getJob,
  getChecklistState, slugifyTaskLabel,
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

// Visible Unicode checkbox glyphs — render as actual checkbox shapes in
// every Excel version, which the user prefers over the literal TRUE/FALSE
// text Excel writes for native booleans.
const CHK_ON = '☑'; // ☑
const CHK_OFF = '☐'; // ☐

function coerce(v) {
  if (v === undefined || v === null || v === '') return null;
  if (v === true) return CHK_ON;
  if (v === false) return CHK_OFF;
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

  // Pre-fetch photos so we can:
  //   a) decide whether each row's Photo/Folder Hyperlink cell should be a
  //      live hyperlink (rows with no photos get plain text, no broken click)
  //   b) reuse the result during the bundling phase below
  const photosByPanel = new Map();
  for (const panel of panels) {
    photosByPanel.set(panel.id, await listPanelPhotos(panel.id));
  }
  const rowsWithPhotos = new Set();
  for (const photos of photosByPanel.values()) {
    for (const ph of photos) {
      if (ph.rowId) rowsWithPhotos.add(ph.rowId);
    }
  }

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
            if (rowsWithPhotos.has(row.id)) {
              // Excel for Mac (and the App Sandbox) won't reliably "open" a
              // folder URL via a relative hyperlink — clicks end up no-ops.
              // It WILL reliably open a JPG file in Preview, so target the
              // first photo (we always name the first IMG_001.jpg). Display
              // text remains the folder path so the user can see where the
              // batch lives.
              const firstFile = folder + 'IMG_001.jpg';
              try {
                r.getCell(ci).value = { text: folder, hyperlink: encodeURI(firstFile) };
              } catch (e) {
                r.getCell(ci).value = folder;
              }
            } else {
              // No row-level photos for this row — write plain text so the
              // user can still see where photos would go, but no broken
              // hyperlink to click on.
              r.getCell(ci).value = folder;
            }
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

  // 4. Update Checklist completion (auto + manual) and append custom tasks
  let checklistSheet = null;
  let checklistLastTaskRow = 0;
  try {
    const cl = wb.getWorksheet('Checklist');
    if (cl) {
      checklistSheet = cl;
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
      const cls = await getChecklistState(job.id);
      const manualTasks = cls.manualTasks || {};
      for (let r = 2; r <= cl.rowCount; r++) {
        const taskCell = cl.getCell(r, 1).value;
        if (!taskCell) continue;
        const taskLabel = String(taskCell).trim();
        checklistLastTaskRow = r;
        const sheet = sheetByTask[taskLabel];
        if (sheet && filled.has(sheet)) {
          cl.getCell(r, 3).value = CHK_ON;
          continue;
        }
        const slug = slugifyTaskLabel(taskLabel);
        if (manualTasks[slug] === true) {
          cl.getCell(r, 3).value = CHK_ON;
        }
      }
    }
  } catch (e) {
    console.warn('Checklist update skipped:', e);
  }

  // 4b. Append custom checklist tasks (added via the in-app Checklist screen)
  try {
    if (checklistSheet && checklistLastTaskRow > 0) {
      const cls = await getChecklistState(job.id);
      const customTasks = cls.customTasks || [];
      if (customTasks.length > 0) {
        const cl = checklistSheet;
        const styleSrcRow = cl.getRow(checklistLastTaskRow);
        const srcA = styleSrcRow.getCell(1);
        const srcB = styleSrcRow.getCell(2);
        const srcC = styleSrcRow.getCell(3);
        for (let i = 0; i < customTasks.length; i++) {
          const t = customTasks[i];
          const r = checklistLastTaskRow + 1 + i;
          const a = cl.getCell(r, 1);
          const b = cl.getCell(r, 2);
          const c = cl.getCell(r, 3);
          a.value = t.label;
          b.value = 'Yes';
          c.value = t.completed ? CHK_ON : CHK_OFF;
          // Copy styles so the appended rows match the template's look
          if (srcA.style) a.style = { ...srcA.style };
          if (srcB.style) b.style = { ...srcB.style };
          if (srcC.style) c.style = { ...srcC.style };
        }
      }
    }
  } catch (e) {
    console.warn('Custom checklist append skipped:', e);
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
  let xlsxBuf = await wb.xlsx.writeBuffer();

  // ExcelJS workarounds. When round-tripping a loaded template, ExcelJS:
  //   1. Emits horizontalDpi="4294967295" and verticalDpi="4294967295"
  //      (uint32-max "unset" sentinel) on every <pageSetup>. Modern Excel
  //      rejects these as out-of-range integers.
  //   2. Writes <tableParts> BEFORE <legacyDrawing> at the tail of each
  //      worksheet. OOXML schema (ECMA-376 § 18.3.1) requires legacyDrawing
  //      (element 31) to precede tableParts (element 37). Excel is strict
  //      about the order even though openpyxl/ExcelJS/LibreOffice are not.
  //   3. Rewrites every table's <autoFilter> with explicit <filterColumn
  //      hiddenButton="1"/> children AND adds totalsRowShown="1" +
  //      headerRowCount="0" attributes. The combination is contradictory
  //      (an autoFilter requires a header row) and Excel logs an
  //      XmlReaderFatalError on the table records, prompting the
  //      "needs repair" dialog. Confirmed via Excel's diagnostic log:
  //      `Data.CorruptItems: [{ipti: "List", irt: 106}, {irt: 107}]`.
  //      Stripping the autoFilter element entirely matches what Excel's
  //      own auto-repair does.
  {
    const fixZip = new JSZip();
    await fixZip.loadAsync(xlsxBuf);
    const sheetFiles = Object.keys(fixZip.files).filter((f) =>
      /^xl\/worksheets\/sheet\d+\.xml$/.test(f),
    );
    for (const f of sheetFiles) {
      let xml = await fixZip.file(f).async('string');
      xml = xml.replace(/\s+(horizontalDpi|verticalDpi)="4294967295"/g, '');
      xml = xml.replace(
        /(<tableParts(?:[^<]|<(?!\/tableParts>))*<\/tableParts>)(\s*)(<legacyDrawing[^/]*\/>)/,
        '$3$2$1',
      );
      // Convert every <c ... t="b"><v>1|0</v></c> into a Unicode-checkbox
      // inline-string cell. Catches booleans that came in from the template
      // (e.g. the Checklist sheet's pre-marked cells) so the user sees ☑/☐
      // everywhere instead of TRUE/FALSE text.
      xml = xml.replace(
        /<c([^>]*?)\st="b"([^>]*?)><v>([01])<\/v><\/c>/g,
        (m, before, after, val) => {
          const glyph = val === '1' ? CHK_ON : CHK_OFF;
          return `<c${before} t="inlineStr"${after}><is><t>${glyph}</t></is></c>`;
        },
      );
      fixZip.file(f, xml);
    }
    const tableFiles = Object.keys(fixZip.files).filter((f) =>
      /^xl\/tables\/table\d+\.xml$/.test(f),
    );
    for (const f of tableFiles) {
      let xml = await fixZip.file(f).async('string');
      xml = xml.replace(/<autoFilter\b[^>]*(\/>|>[\s\S]*?<\/autoFilter>)/g, '');
      fixZip.file(f, xml);
    }
    xlsxBuf = await fixZip.generateAsync({ type: 'arraybuffer' });
  }

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
    allPanelPhotos.push({ panel, photos: photosByPanel.get(panel.id) || [] });
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
