// exporter.js — produces {jobName}.zip:
//
//   {jobName}.xlsx                              populated workbook (template-faithful)
//   {jobName}.backup.json                       full re-importable backup (Settings → Restore)
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
  getChecklistState, slugifyTaskLabel, exportJobJSON,
} from './db.js';
import { applyOverlay, fmtTimestamp, fmtGps } from './photoOverlay.js';
import { safe, rowLabel, shareSafeFilename } from './lib/paths';
import { isInWrapper, shareViaCapacitor } from './lib/wrapperBridge.js';

const SHEET_ORDER = [
  'Panels', 'Power', 'PLC Racks', 'PLC Slots', 'Fieldbus IO',
  'Network Devices', 'HMIs', 'Ethernet Switches', 'Drive Parameters',
  'Conv. Speeds', 'Safety Circuit', 'Safety Devices', 'Peer to Peer Comms',
];

function pad3(n) { return String(n).padStart(3, '0'); }

// Write the export to OPFS (Origin Private File System) and return a
// File handle backed by it. OPFS is sandboxed per-origin storage but
// the File it produces is real-disk-backed, which is what Android
// Chrome's share-intent IPC needs to grant a content URI. In-memory
// Files (from new File([blob], ...)) get rejected with NotAllowedError
// on Android Chrome 147+ regardless of MIME or payload shape.
//
// Returns null on any failure (OPFS unsupported, quota exhausted, etc.)
// so callers fall back to the in-memory File.
async function materializeForShare(blob, filename) {
  try {
    const root = await navigator.storage?.getDirectory?.();
    if (!root) return null;
    const safeName = shareSafeFilename(filename);
    const handle = await root.getFileHandle(safeName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return await handle.getFile();
  } catch (e) {
    if (typeof console !== 'undefined') {
      console.warn('OPFS materialization for share failed:', e);
    }
    return null;
  }
}

function findColumnIndex(ws, headerRow, target) {
  const row = ws.getRow(headerRow);
  for (let c = 1; c <= ws.columnCount; c++) {
    const v = row.getCell(c).value;
    const s = (v == null ? '' : String(v)).replace(/\n/g, ' ').trim();
    if (s === target) return c;
  }
  return null;
}

// The template uses Microsoft 365's native in-cell checkbox feature, which
// requires real boolean cells (t="b") plus a FeaturePropertyBag part that
// ExcelJS strips on round-trip. The fixZip pass below re-attaches the
// FeaturePropertyBag from the template so the booleans render as live
// interactive checkboxes instead of TRUE/FALSE text.
function coerce(v) {
  if (v === undefined || v === null || v === '') return null;
  if (v === true) return true;
  if (v === false) return false;
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
  mode = 'zip',
  filename: filenameOverride = null,
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

    // Capture the template's example-row cell styles BEFORE we overwrite
    // them. Each new data row beyond the first inherits these so banding,
    // borders, number formats, and the Photo Checklist columns' checkbox
    // xfId all carry through.
    const exampleStyles = {};
    {
      const exampleRow = ws.getRow(schema.first_data_row);
      for (let c = 1; c <= ws.columnCount; c++) {
        const cell = exampleRow.getCell(c);
        if (cell.style) {
          try { exampleStyles[c] = JSON.parse(JSON.stringify(cell.style)); }
          catch { /* ignore non-serializable styles */ }
        }
      }
    }

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

        // Apply example-row styles so banding, borders, and the Photo
        // Checklist's checkbox xfId carry through to new rows.
        for (let c = 1; c <= ws.columnCount; c++) {
          if (exampleStyles[c]) {
            try { r.getCell(c).style = exampleStyles[c]; } catch { /* ignore */ }
          }
        }

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
          cl.getCell(r, 3).value = true;
          continue;
        }
        const slug = slugifyTaskLabel(taskLabel);
        if (manualTasks[slug] === true) {
          cl.getCell(r, 3).value = true;
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
          b.value = true;
          c.value = !!t.completed;
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
  //   4. Drops xl/featurePropertyBag/featurePropertyBag.xml and the
  //      workbook.xml.rels relationship to it. The template uses the new
  //      cell-checkbox feature whose t="b" cells reference a Checkbox bag
  //      via xfComplement extLst entries in styles.xml. Without the
  //      FeaturePropertyBag part, those cells render as plain TRUE/FALSE.
  //      We re-attach the FeaturePropertyBag part and relationship from
  //      the original template so the booleans become live checkboxes.
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

    // Extend each table's `ref` to cover the actual last data row in its
    // sheet. Without this, rows beyond the template's example row sit
    // outside the table and lose banding/totals/auto-extension.
    for (const sheetFile of sheetFiles) {
      const sheetXml = await fixZip.file(sheetFile).async('string');
      const rowMatches = [...sheetXml.matchAll(/<row\s+r="(\d+)"/g)];
      if (rowMatches.length === 0) continue;
      const lastRow = Math.max(...rowMatches.map((m) => parseInt(m[1], 10)));

      const sheetNum = sheetFile.match(/sheet(\d+)\.xml$/)?.[1];
      if (!sheetNum) continue;
      const relsPath = `xl/worksheets/_rels/sheet${sheetNum}.xml.rels`;
      const relsFile = fixZip.file(relsPath);
      if (!relsFile) continue;
      const rels = await relsFile.async('string');
      const tableTargets = [...rels.matchAll(/Target="([^"]*tables\/table\d+\.xml)"/g)]
        .map((m) => m[1].replace(/^\.\.\//, ''));
      for (const t of tableTargets) {
        const tablePath = `xl/${t}`;
        const tableFile = fixZip.file(tablePath);
        if (!tableFile) continue;
        let tableXml = await tableFile.async('string');
        tableXml = tableXml.replace(
          /(<table\b[^>]*?\sref=")([A-Z]+)(\d+):([A-Z]+)(\d+)(")/,
          (m, p1, c1, r1, c2, r2, p2) => {
            const newR2 = Math.max(parseInt(r2, 10), lastRow);
            return `${p1}${c1}${r1}:${c2}${newR2}${p2}`;
          },
        );
        fixZip.file(tablePath, tableXml);
      }
    }

    // Re-attach FeaturePropertyBag from the template so cell-checkboxes work.
    const tmplZip = new JSZip();
    await tmplZip.loadAsync(tmplBuf);
    const fpbPath = 'xl/featurePropertyBag/featurePropertyBag.xml';
    const fpbFile = tmplZip.file(fpbPath);
    if (fpbFile) {
      const fpbXml = await fpbFile.async('uint8array');
      fixZip.file(fpbPath, fpbXml);

      // workbook.xml.rels — add the FeaturePropertyBag relationship if missing.
      const relsPath = 'xl/_rels/workbook.xml.rels';
      const relsFile = fixZip.file(relsPath);
      if (relsFile) {
        let rels = await relsFile.async('string');
        const fpbType = 'http://schemas.microsoft.com/office/2022/11/relationships/FeaturePropertyBag';
        if (!rels.includes(fpbType)) {
          const idMatches = [...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => parseInt(m[1], 10));
          const nextId = (idMatches.length ? Math.max(...idMatches) : 0) + 1;
          const rel = `<Relationship Id="rId${nextId}" Type="${fpbType}" Target="featurePropertyBag/featurePropertyBag.xml"/>`;
          rels = rels.replace('</Relationships>', `${rel}</Relationships>`);
          fixZip.file(relsPath, rels);
        }
      }

      // [Content_Types].xml — add the override for the FeaturePropertyBag part.
      const ctPath = '[Content_Types].xml';
      const ctFile = fixZip.file(ctPath);
      if (ctFile) {
        let ct = await ctFile.async('string');
        const ctType = 'application/vnd.ms-excel.featurepropertybag+xml';
        if (!ct.includes(ctType)) {
          const override = `<Override PartName="/${fpbPath}" ContentType="${ctType}"/>`;
          ct = ct.replace('</Types>', `${override}</Types>`);
          fixZip.file(ctPath, ct);
        }
      }

      // styles.xml — if ExcelJS dropped the xfpb:xfComplement extLst entries
      // from xf rows, restore styles.xml from the template wholesale. This is
      // safe because the exporter never modifies styles, only cell values.
      const stylesPath = 'xl/styles.xml';
      const stylesFile = fixZip.file(stylesPath);
      if (stylesFile) {
        const styles = await stylesFile.async('string');
        if (!styles.includes('xfpb:xfComplement')) {
          const tmplStyles = await tmplZip.file(stylesPath)?.async('uint8array');
          if (tmplStyles) fixZip.file(stylesPath, tmplStyles);
        }
      }

      // Cell → xf reference remap. ExcelJS rewrites every t="b" cell's
      // s="N" attribute to point at a plain xf instead of the
      // checkbox-enabled xf (the one carrying <xfpb:xfComplement>). Without
      // the right xfId, Excel renders TRUE/FALSE text instead of a live
      // checkbox even when the FeaturePropertyBag part is wired up. We
      // resolve which xfIds are checkbox-enabled by parsing the (now
      // restored) styles.xml and pick the first one as the canonical
      // reference for the Checklist sheet's boolean cells.
      const finalStyles = await fixZip.file(stylesPath).async('string');
      const cellXfsMatch = finalStyles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/);
      const checkboxXfIds = [];
      if (cellXfsMatch) {
        const xfRe = /<xf\b[^/]*?(?:\/>|>[\s\S]*?<\/xf>)/g;
        let i = 0;
        let m;
        while ((m = xfRe.exec(cellXfsMatch[1])) !== null) {
          if (m[0].includes('xfpb:xfComplement')) checkboxXfIds.push(i);
          i += 1;
        }
      }
      const checklistXfId = checkboxXfIds[0];
      if (checklistXfId !== undefined) {
        // Find the sheet file that holds the Checklist by parsing
        // workbook.xml + workbook.xml.rels.
        const wbXml = await fixZip.file('xl/workbook.xml').async('string');
        const sheetMatch = wbXml.match(/<sheet[^>]+name="Checklist"[^>]+r:id="(rId\d+)"/);
        const wbRels = await fixZip.file('xl/_rels/workbook.xml.rels').async('string');
        if (sheetMatch) {
          const ridRe = new RegExp(`Id="${sheetMatch[1]}"[^>]+Target="([^"]+)"`);
          const targetMatch = wbRels.match(ridRe);
          if (targetMatch) {
            const checklistPath = `xl/${targetMatch[1].replace(/^\.\//, '')}`;
            let xml = await fixZip.file(checklistPath).async('string');
            xml = xml.replace(/<c\s+([^>]*?)>/g, (m2, attrs) => {
              if (!/\bt="b"/.test(attrs)) return m2;
              const cleaned = attrs.replace(/\s*s="\d+"/g, '');
              return `<c ${cleaned} s="${checklistXfId}">`;
            });
            fixZip.file(checklistPath, xml);
          }
        }
      }
    }

    xlsxBuf = await fixZip.generateAsync({ type: 'arraybuffer' });
  }

  // 'xlsx-only' mode: ship just the xlsx, no zip wrapper, no photos/csv/backup.
  if (mode === 'xlsx-only') {
    onProgress({ phase: 'finalizing', percent: 95 });
    const blob = new Blob([xlsxBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const xlsxFilename = filenameOverride || `${safe(job.name)}.xlsx`;
    const shareFile = await materializeForShare(blob, xlsxFilename);
    onProgress({ phase: 'done', percent: 100 });
    return { blob, filename: xlsxFilename, sizeBytes: blob.size, shareFile };
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
      for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        const ph = entry.photo;
        const ext = (ph.mime || 'image/jpeg').split('/')[1] || 'jpg';
        const fname = `IMG_${pad3(i + 1)}.${ext === 'jpeg' ? 'jpg' : ext}`;
        const overlayLines = [
          `${job.name} • ${panel.name}`,
          `${ph.sheet} — ${entry.itemLabel}`,
          fmtTimestamp(new Date(ph.takenAt)) + (ph.gps ? `  ${fmtGps(ph.gps)}` : ''),
        ];
        const baked = await applyOverlay(ph.blob, overlayLines, ph.gps);
        zip.file(`${folder}/${fname}`, baked.blob);
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
      }
    }
  }

  zip.file(`${jobSafe}_photo_metadata.csv`, csvRows.join('\n'));

  // Re-importable backup. Photos are embedded as base64 so Settings → Restore
  // on another device reconstructs the job without the Photos/ folder.
  onProgress({ phase: 'bundling', percent: 90, detail: 'backup snapshot' });
  const backup = await exportJobJSON(job.id);
  zip.file(`${jobSafe}.backup.json`, JSON.stringify(backup));

  onProgress({ phase: 'compressing', percent: 92 });
  // Generate as ArrayBuffer (not 'blob') and wrap in a single-part Blob.
  // JSZip's 'blob' output is chunked internally; on Android Chrome the
  // share-intent IPC layer rejects chunked blobs with NotAllowedError
  // when navigator.share tries to hand them to the OS share cache.
  // Materializing to a contiguous ArrayBuffer here, before the user
  // ever clicks Share, sidesteps that without spending activation at
  // share time.
  const zipBuffer = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'STORE',
  });
  const zipBlob = new Blob([zipBuffer], { type: 'application/zip' });
  const zipFilename = `${jobSafe}.zip`;
  const shareFile = await materializeForShare(zipBlob, zipFilename);

  onProgress({ phase: 'done', percent: 100 });
  return { blob: zipBlob, filename: zipFilename, sizeBytes: zipBlob.size, shareFile };
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

export async function shareBlob(blob, filename, title, shareFile = null) {
  const safeName = shareSafeFilename(filename);
  const safeTitle = shareSafeFilename(title);
  const mime = safeName.endsWith('.xlsx')
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'application/zip';
  const file = shareFile || new File([blob], safeName, { type: mime });

  // Inside the Android wrapper: bypass Chrome's share allowlist by going
  // through Android's Intent.ACTION_SEND via Capacitor. The web-side
  // canShare() check is irrelevant here — the native share plugin
  // accepts whatever file we hand it.
  if (isInWrapper()) {
    await shareViaCapacitor(file);
    return true;
  }

  // Browser path (desktop, iOS Safari, Android Chrome out of wrapper).
  // Stay synchronous up to the share() call; never call share() twice
  // from one gesture. canShare gating preserves the existing
  // download-fallback path when the browser refuses files.
  if (!navigator.canShare || !navigator.canShare({ files: [file] })) {
    return false;
  }
  const payload = { files: [file] };
  if (safeTitle && safeTitle !== 'unnamed') payload.title = safeTitle;
  await navigator.share(payload);
  return true;
}
