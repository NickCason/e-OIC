// exporter.ts — produces {jobName}.zip:
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

import type { Workbook, Worksheet, Row as ExcelRow, Style } from 'exceljs';
import type JSZip from 'jszip';
import schemaMap from './schema.json' with { type: 'json' };
import {listPanels, listAllRows, listPanelPhotos, getSheetNotes,
    getChecklistState, slugifyTaskLabel, exportJobJSON,} from './db';
import { applyOverlay, fmtTimestamp, fmtGps } from './photoOverlay';
import { safe, rowLabel, shareSafeFilename } from './lib/paths';
import { isInWrapper, shareViaCapacitor } from './lib/wrapperBridge';
import type { IJob, IPanel, IPhoto, IRow } from './types/job';
import type { ISheetSchema } from './types/xlsx';

type SchemaMap = Record<string, ISheetSchema>;
const SCHEMAS = schemaMap as unknown as SchemaMap;

const SHEET_ORDER: string[] = [
    'Panels', 'Power', 'PLC Racks', 'PLC Slots', 'Fieldbus IO',
    'Network Devices', 'HMIs', 'Ethernet Switches', 'Drive Parameters',
    'Conv. Speeds', 'Safety Circuit', 'Safety Devices', 'Peer to Peer Comms',
];

// Progress callback fired during long phases of buildExport. `phase`
// values: 'loading-libs' | 'loading-template' | 'populating' | 'serializing'
// | 'bundling' | 'compressing' | 'finalizing' | 'done'.
export interface IExportProgress {
    phase: string;
    percent: number;
    detail?: string;
}
export type ExportProgressFn = (p: IExportProgress) => void;

export type ExportMode = 'zip' | 'xlsx-only';

export interface IBuildExportOptions {
    templateUrl?: string;
    onProgress?: ExportProgressFn;
    mode?: ExportMode;
    filename?: string | null;
}

export interface IBuildExportResult {
    blob: Blob;
    filename: string;
    sizeBytes: number;
    shareFile: File | null;
}

// One entry in the Notes appendix collected while populating sheets.
interface INotesAppendixEntry {
    sheet: string;
    panel: string;
    label: string;
    notes: string;
}

// Map<columnHeader, columnIndex> built per-worksheet.
type ColumnIndex = Record<string, number>;

// Map<columnNumber, Style> captured from the template's example row.
type ExampleStyleMap = Record<number, Style>;

// Internal photo-grouping shape used during zip bundling.
interface IPhotoEntry {
    photo: IPhoto;
    level: 'row' | 'panel';
    itemLabel: string;
}

interface IRowInfo {
    sheet: string;
    label: string;
}

function pad3(n: number): string { return String(n).padStart(3, '0'); }

// Write the export to OPFS (Origin Private File System) and return a
// File handle backed by it. OPFS is sandboxed per-origin storage but
// the File it produces is real-disk-backed, which is what Android
// Chrome's share-intent IPC needs to grant a content URI. In-memory
// Files (from new File([blob], ...)) get rejected with NotAllowedError
// on Android Chrome 147+ regardless of MIME or payload shape.
//
// Returns null on any failure (OPFS unsupported, quota exhausted, etc.)
// so callers fall back to the in-memory File.
async function materializeForShare(blob: Blob, filename: string): Promise<File | null> {
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

function findColumnIndex(ws: Worksheet, headerRow: number, target: string): number | null {
    const row = ws.getRow(headerRow);
    let found: number | null = null;
    for (let c = 1; c <= ws.columnCount && found === null; c += 1) {
        const v = row.getCell(c).value;
        const s = (v == null ? '' : String(v)).replace(/\n/g, ' ').trim();
        if (s === target) found = c;
    }
    return found;
}

// The template uses Microsoft 365's native in-cell checkbox feature, which
// requires real boolean cells (t="b") plus a FeaturePropertyBag part that
// ExcelJS strips on round-trip. The fixZip pass below re-attaches the
// FeaturePropertyBag from the template so the booleans render as live
// interactive checkboxes instead of TRUE/FALSE text.
type CoerceInput = string | number | boolean | null | undefined;
type CoerceOutput = string | number | boolean | null;

function coerce(v: CoerceInput): CoerceOutput {
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

function csvEscape(v: unknown): string {
    if (v == null) return '';
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

// ─── xlsx zip post-processing helpers ────────────────────────────────────────
// ExcelJS round-trips with several quirks that Excel rejects. Each helper
// below transforms one slice of the generated zip in place. They run inside
// the fixZip block at the end of buildExport.

// Strip ExcelJS's "unset" sentinel DPI values (uint32-max). Modern Excel
// rejects horizontalDpi/verticalDpi="4294967295" as out-of-range integers.
function fixDpiSentinels(xml: string): string {
    return xml.replace(/\s+(horizontalDpi|verticalDpi)="4294967295"/g, '');
}

// ExcelJS writes <tableParts> before <legacyDrawing> at the tail of each
// worksheet. OOXML schema (ECMA-376 § 18.3.1) requires legacyDrawing
// (element 31) to precede tableParts (element 37). Excel is strict about
// the order even though openpyxl/ExcelJS/LibreOffice are not.
function reorderTableParts(xml: string): string {
    return xml.replace(
        /(<tableParts(?:[^<]|<(?!\/tableParts>))*<\/tableParts>)(\s*)(<legacyDrawing[^/]*\/>)/,
        '$3$2$1',
    );
}

// ExcelJS rewrites every table's <autoFilter> with explicit <filterColumn
// hiddenButton="1"/> children AND adds totalsRowShown="1" + headerRowCount="0"
// attributes. The combination is contradictory (an autoFilter requires a
// header row) and Excel logs an XmlReaderFatalError on the table records,
// prompting the "needs repair" dialog. Stripping the autoFilter element
// entirely matches what Excel's own auto-repair does.
function repairAutoFilter(xml: string): string {
    return xml.replace(/<autoFilter\b[^>]*(\/>|>[\s\S]*?<\/autoFilter>)/g, '');
}

// Add the FeaturePropertyBag relationship to workbook.xml.rels if missing.
async function addFpbRelationship(zip: JSZip): Promise<void> {
    const relsPath = 'xl/_rels/workbook.xml.rels';
    const relsFile = zip.file(relsPath);
    if (!relsFile) return;
    let rels = await relsFile.async('string');
    const fpbType = 'http://schemas.microsoft.com/office/2022/11/relationships/FeaturePropertyBag';
    if (rels.includes(fpbType)) return;
    const idMatches = [...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => parseInt(m[1] ?? '0', 10));
    const nextId = (idMatches.length ? Math.max(...idMatches) : 0) + 1;
    const rel = `<Relationship Id="rId${nextId}" Type="${fpbType}" Target="featurePropertyBag/featurePropertyBag.xml"/>`;
    rels = rels.replace('</Relationships>', `${rel}</Relationships>`);
    zip.file(relsPath, rels);
}

// Add the FeaturePropertyBag override to [Content_Types].xml if missing.
async function addFpbContentTypeOverride(zip: JSZip, fpbPath: string): Promise<void> {
    const ctPath = '[Content_Types].xml';
    const ctFile = zip.file(ctPath);
    if (!ctFile) return;
    let ct = await ctFile.async('string');
    const ctType = 'application/vnd.ms-excel.featurepropertybag+xml';
    if (ct.includes(ctType)) return;
    const override = `<Override PartName="/${fpbPath}" ContentType="${ctType}"/>`;
    ct = ct.replace('</Types>', `${override}</Types>`);
    zip.file(ctPath, ct);
}

// If ExcelJS dropped the xfpb:xfComplement extLst entries from styles.xml,
// restore styles.xml wholesale from the template. Safe because the
// exporter only mutates cell values, never styles.
async function restoreStylesIfStripped(zip: JSZip, tmplZip: JSZip): Promise<void> {
    const stylesPath = 'xl/styles.xml';
    const stylesFile = zip.file(stylesPath);
    if (!stylesFile) return;
    const styles = await stylesFile.async('string');
    if (styles.includes('xfpb:xfComplement')) return;
    const tmplStyles = await tmplZip.file(stylesPath)?.async('uint8array');
    if (tmplStyles) zip.file(stylesPath, tmplStyles);
}

// Re-attach the FeaturePropertyBag part + relationship + content-type +
// styles from the original template. The template uses Microsoft 365's
// native in-cell checkbox feature; ExcelJS strips this part on round-trip,
// so we copy it back from the source template before generating output.
async function attachFeaturePropertyBag(zip: JSZip, tmplZip: JSZip): Promise<boolean> {
    const fpbPath = 'xl/featurePropertyBag/featurePropertyBag.xml';
    const fpbFile = tmplZip.file(fpbPath);
    if (!fpbFile) return false;
    const fpbXml = await fpbFile.async('uint8array');
    zip.file(fpbPath, fpbXml);
    await addFpbRelationship(zip);
    await addFpbContentTypeOverride(zip, fpbPath);
    await restoreStylesIfStripped(zip, tmplZip);
    return true;
}

// Walk styles.xml's <cellXfs> entries; return indices of xfs that carry
// the xfpb:xfComplement marker (i.e. checkbox-enabled xfs).
function findCheckboxXfIds(stylesXml: string): number[] {
    const cellXfsMatch = stylesXml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/);
    const checkboxXfIds: number[] = [];
    if (!cellXfsMatch) return checkboxXfIds;
    const xfRe = /<xf\b[^/]*?(?:\/>|>[\s\S]*?<\/xf>)/g;
    const body = cellXfsMatch[1] ?? '';
    let i = 0;
    let m = xfRe.exec(body);
    while (m !== null) {
        if (m[0].includes('xfpb:xfComplement')) checkboxXfIds.push(i);
        i += 1;
        m = xfRe.exec(body);
    }
    return checkboxXfIds;
}

// Resolve the worksheet file path for a named sheet via workbook.xml +
// workbook.xml.rels. Returns null if the sheet or its rel target is missing.
async function resolveSheetPath(zip: JSZip, sheetName: string): Promise<string | null> {
    const wbFile = zip.file('xl/workbook.xml');
    const wbRelsFile = zip.file('xl/_rels/workbook.xml.rels');
    if (!wbFile || !wbRelsFile) return null;
    const wbXml = await wbFile.async('string');
    const nameRe = new RegExp(`<sheet[^>]+name="${sheetName}"[^>]+r:id="(rId\\d+)"`);
    const sheetMatch = wbXml.match(nameRe);
    if (!sheetMatch) return null;
    const wbRels = await wbRelsFile.async('string');
    const ridRe = new RegExp(`Id="${sheetMatch[1]}"[^>]+Target="([^"]+)"`);
    const targetMatch = wbRels.match(ridRe);
    if (!targetMatch || !targetMatch[1]) return null;
    return `xl/${targetMatch[1].replace(/^\.\//, '')}`;
}

// Rewrite every t="b" cell's s="N" attribute on the Checklist sheet so it
// points at a checkbox-enabled xfId. ExcelJS rewrites these references on
// round-trip; without the right xfId, Excel renders TRUE/FALSE text
// instead of a live checkbox even when the FPB part is wired up.
async function rewriteCellXfRefs(zip: JSZip): Promise<void> {
    const stylesPath = 'xl/styles.xml';
    const stylesFile = zip.file(stylesPath);
    if (!stylesFile) return;
    const finalStyles = await stylesFile.async('string');
    const checkboxXfIds = findCheckboxXfIds(finalStyles);
    const checklistXfId = checkboxXfIds[0];
    if (checklistXfId === undefined) return;
    const checklistPath = await resolveSheetPath(zip, 'Checklist');
    if (!checklistPath) return;
    const checklistFile = zip.file(checklistPath);
    if (!checklistFile) return;
    const xml = await checklistFile.async('string');
    const rewritten = xml.replace(/<c\s+([^>]*?)>/g, (m2, attrs: string) => {
        if (!/\bt="b"/.test(attrs)) return m2;
        const cleaned = attrs.replace(/\s*s="\d+"/g, '');
        return `<c ${cleaned} s="${checklistXfId}">`;
    });
    zip.file(checklistPath, rewritten);
}

// Capture the template's example-row cell styles BEFORE we overwrite them.
// Each new data row beyond the first inherits these so banding, borders,
// number formats, and the Photo Checklist columns' checkbox xfId all carry
// through. Returns an index { columnNumber: style } map.
// Safely deep-clone one cell's style, returning null if it isn't serializable.
function cloneCellStyle(style: Partial<Style> | undefined): Style | null {
    if (!style) return null;
    try { return JSON.parse(JSON.stringify(style)) as Style; }
    catch { return null; }
}

function captureExampleRowStyles(ws: Worksheet, headerRow: number): ExampleStyleMap {
    const exampleStyles: ExampleStyleMap = {};
    const exampleRow = ws.getRow(headerRow);
    for (let c = 1; c <= ws.columnCount; c += 1) {
        const cloned = cloneCellStyle(exampleRow.getCell(c).style);
        if (cloned) exampleStyles[c] = cloned;
    }
    return exampleStyles;
}

// Best-effort cell-style assignment that swallows the rare ExcelJS internal
// throws when applying a deep-cloned style object. Mutates row.getCell(c) —
// ExcelJS has no immutable style API.
function trySetCellStyle(row: ExcelRow, c: number, style: Style): void {
    try {
        // eslint-disable-next-line no-param-reassign
        row.getCell(c).style = style;
    } catch { /* ignore */ }
}

// Apply captured example styles to a row's cells so new rows inherit
// banding/borders/checkbox xfIds from the template's first data row.
function applyExampleStyles(row: ExcelRow, exampleStyles: ExampleStyleMap, columnCount: number): void {
    for (let c = 1; c <= columnCount; c += 1) {
        const s = exampleStyles[c];
        if (s) trySetCellStyle(row, c, s);
    }
}

// Null out every cell in a row from column 1..columnCount. Cell mutation
// through the row is unavoidable; ExcelJS has no immutable setter API.
function blankRow(row: ExcelRow, columnCount: number): void {
    for (let c = 1; c <= columnCount; c += 1) {
        // eslint-disable-next-line no-param-reassign
        row.getCell(c).value = null;
    }
}

// Mapping of Checklist sheet task labels → workbook sheet names. Used so
// that filling rows in a sheet automatically completes its checklist task.
const CHECKLIST_TASK_TO_SHEET: Record<string, string> = {
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

// Build the set of sheet names that have at least one row across any panel.
async function buildFilledSheetSet(panels: IPanel[]): Promise<Set<string>> {
    const rowsPerPanel = await Promise.all(panels.map((p) => listAllRows(p.id)));
    return new Set(rowsPerPanel.flat().map((r) => r.sheet));
}

// Decide whether one Checklist task row should be marked complete.
function shouldCompleteTask(
    taskLabel: string,
    filled: Set<string>,
    manualTasks: Record<string, boolean>,
): boolean {
    const sheet = CHECKLIST_TASK_TO_SHEET[taskLabel];
    if (sheet && filled.has(sheet)) return true;
    const slug = slugifyTaskLabel(taskLabel);
    return manualTasks[slug] === true;
}

// Walk the Checklist sheet's task rows, marking column C complete when:
//   - the task's mapped sheet has any rows (auto-complete), OR
//   - the user manually marked it complete in-app (manualTasks[slug] === true).
// Returns the last row index touched, used by the custom-tasks appender.
// Mark column C of one Checklist task row complete. ExcelJS cell writes
// mutate through the parent worksheet; there is no immutable cell-write API.
function markChecklistRowComplete(cl: Worksheet, row: number): void {
    // eslint-disable-next-line no-param-reassign
    cl.getCell(row, 3).value = true;
}

// Process one Checklist task row: returns the row index touched (or null
// if the row is blank) and applies completion when the predicate fires.
function processChecklistTaskRow(cl: Worksheet, r: number, filled: Set<string>, manualTasks: Record<string, boolean>,): number | null {
    const taskCell = cl.getCell(r, 1).value;
    if (!taskCell) return null;
    const taskLabel = String(taskCell).trim();
    if (shouldCompleteTask(taskLabel, filled, manualTasks)) {
        markChecklistRowComplete(cl, r);
    }
    return r;
}

function applyChecklistCompletion(
    cl: Worksheet,
    filled: Set<string>,
    manualTasks: Record<string, boolean>,
): number {
    let lastTaskRow = 0;
    for (let r = 2; r <= cl.rowCount; r += 1) {
        const touched = processChecklistTaskRow(cl, r, filled, manualTasks);
        if (touched !== null) lastTaskRow = touched;
    }
    return lastTaskRow;
}

interface IChecklistUpdateResult {
    checklistSheet: Worksheet | null;
    checklistLastTaskRow: number;
}

// Update the Checklist worksheet (auto-mark sheet tasks + manual tasks) and
// return { checklistSheet, checklistLastTaskRow } for the custom-tasks
// appender. Returns nulls when the Checklist sheet is absent or on error.
async function updateChecklistCompletion(wb: Workbook, job: IJob, panels: IPanel[],): Promise<IChecklistUpdateResult> {
    try {
        const cl = wb.getWorksheet('Checklist');
        if (!cl) return { checklistSheet: null, checklistLastTaskRow: 0 };
        const filled = await buildFilledSheetSet(panels);
        const cls = await getChecklistState(job.id);
        const manualTasks = cls.manualTasks || {};
        const checklistLastTaskRow = applyChecklistCompletion(cl, filled, manualTasks);
        return { checklistSheet: cl, checklistLastTaskRow };
    } catch (e) {
        console.warn('Checklist update skipped:', e);
        return { checklistSheet: null, checklistLastTaskRow: 0 };
    }
}

// One Cell from ExcelJS; pulled out so copyChecklistRowStyles doesn't need
// the full Cell import at the top.
type ChecklistCellTrio = readonly [
    ReturnType<Worksheet['getCell']>,
    ReturnType<Worksheet['getCell']>,
    ReturnType<Worksheet['getCell']>,
];

// Copy ABC-column cell styles from a source row onto the given cells. Used
// when appending custom checklist task rows so they match the template's
// look. The whole point is to mutate `.style` on the destination cells;
// ExcelJS has no non-mutating style API.
/* eslint-disable no-param-reassign */
function copyChecklistRowStyles(srcRow: ExcelRow, [a, b, c]: ChecklistCellTrio): void {
    const srcA = srcRow.getCell(1);
    const srcB = srcRow.getCell(2);
    const srcC = srcRow.getCell(3);
    if (srcA.style) a.style = { ...srcA.style };
    if (srcB.style) b.style = { ...srcB.style };
    if (srcC.style) c.style = { ...srcC.style };
}
/* eslint-enable no-param-reassign */

// Append the Notes worksheet to the workbook if there are any notes to
// write. Adds a "Job Notes" block (when job.notes is set) and a tabular
// appendix of per-row/sheet notes.
//
// Note: ExcelJS cell writes (`.value =`, `.font =`, `.alignment =`) mutate
// through the worksheet parameter. There is no immutable-write API, so the
// helpers below disable `no-param-reassign` for that purpose only.
/* eslint-disable no-param-reassign */

// Write the "Job Notes" block at row r; returns the next row to write to.
function writeJobNotesBlock(notesWs: Worksheet, job: IJob, startRow: number): number {
    if (!job.notes?.trim()) return startRow;
    notesWs.getCell(startRow, 1).value = 'Job Notes';
    notesWs.getCell(startRow, 1).font = { bold: true };
    notesWs.getCell(startRow + 1, 1).value = job.notes.trim();
    notesWs.getCell(startRow + 1, 1).alignment = { wrapText: true, vertical: 'top' };
    notesWs.mergeCells(startRow + 1, 1, startRow + 1, 4);
    return startRow + 3;
}

// Write the notes-appendix table (header row + one row per entry) starting at r.
function writeNotesAppendixTable(notesWs: Worksheet, notesAppendix: INotesAppendixEntry[], startRow: number,): void {
    notesWs.getCell(startRow, 1).value = 'Sheet';
    notesWs.getCell(startRow, 2).value = 'Panel';
    notesWs.getCell(startRow, 3).value = 'Row';
    notesWs.getCell(startRow, 4).value = 'Notes';
    for (let c = 1; c <= 4; c += 1) notesWs.getCell(startRow, c).font = { bold: true };
    notesAppendix.forEach((n, idx) => {
        const rr = startRow + 1 + idx;
        notesWs.getCell(rr, 1).value = n.sheet;
        notesWs.getCell(rr, 2).value = n.panel;
        notesWs.getCell(rr, 3).value = n.label;
        notesWs.getCell(rr, 4).value = n.notes;
        notesWs.getCell(rr, 4).alignment = { wrapText: true, vertical: 'top' };
    });
}
/* eslint-enable no-param-reassign */

function appendNotesSheet(wb: Workbook, job: IJob, notesAppendix: INotesAppendixEntry[]): void {
    if (!job.notes?.trim() && notesAppendix.length === 0) return;
    let notesWs = wb.getWorksheet('Notes');
    if (!notesWs) notesWs = wb.addWorksheet('Notes');
    notesWs.getColumn(1).width = 18;
    notesWs.getColumn(2).width = 18;
    notesWs.getColumn(3).width = 22;
    notesWs.getColumn(4).width = 60;

    const nextRow = writeJobNotesBlock(notesWs, job, 1);
    if (notesAppendix.length > 0) writeNotesAppendixTable(notesWs, notesAppendix, nextRow);
}

// Collect the set of row IDs that have at least one photo attached. Used
// during sheet population so rows without photos render their hyperlink
// column as plain text instead of a broken link.
function collectRowsWithPhotos(photosByPanel: Map<string, IPhoto[]>): Set<string> {
    const allPhotos = [...photosByPanel.values()].flat();
    const rowIds = allPhotos
        .map((ph) => ph.rowId)
        .filter((rowId): rowId is string => Boolean(rowId));
    return new Set(rowIds);
}

// Build rowId → { sheet, label } map for one panel, used to decide which
// photo subfolder each per-row photo lives in.
async function buildRowInfoMap(panel: IPanel): Promise<Map<string, IRowInfo>> {
    const rowsForPanel = await listAllRows(panel.id);
    return new Map<string, IRowInfo>(
        rowsForPanel.map((r) => [
            r.id,
            { sheet: r.sheet, label: rowLabel(r, SCHEMAS[r.sheet]) },
        ]),
    );
}

// Decide which folder + level + itemLabel one photo belongs to. Row-level
// photos go under Photos/{Panel}/{Sheet}/{RowLabel}; panel-level (Photo
// Checklist) photos go under Photos/{Panel}/{Item-or-Sheet}.
function resolvePhotoFolder(ph: IPhoto, panel: IPanel, rowInfo: Map<string, IRowInfo>,): { folder: string; level: 'row' | 'panel'; itemLabel: string } {
    if (ph.rowId && rowInfo.has(ph.rowId)) {
        const ri = rowInfo.get(ph.rowId) as IRowInfo;
        return {
            folder: `Photos/${safe(panel.name)}/${safe(ri.sheet)}/${ri.label}`,
            level: 'row',
            itemLabel: ri.label,
        };
    }
    return {
        folder: `Photos/${safe(panel.name)}/${safe(ph.item || ph.sheet)}`,
        level: 'panel',
        itemLabel: ph.item || ph.sheet,
    };
}

// Group a panel's photos by their destination folder, preserving capture-time
// order within each folder. Returns Map<folder, Array<{photo, level, itemLabel}>>.
function groupPhotosByFolder(photos: IPhoto[], panel: IPanel, rowInfo: Map<string, IRowInfo>,): Map<string, IPhotoEntry[]> {
    const byFolder = new Map<string, IPhotoEntry[]>();
    photos.sort((a, b) => a.takenAt - b.takenAt).forEach((ph) => {
        const { folder, level, itemLabel } = resolvePhotoFolder(ph, panel, rowInfo);
        const bucket = byFolder.get(folder) ?? [];
        bucket.push({
            photo: ph, level, itemLabel
        });
        byFolder.set(folder, bucket);
    });
    return byFolder;
}

// Emit progress callbacks every 5 photos. Lifted out of the bundling loop
// so the inner write block stays shallow.
function reportPhotoProgress(onProgress: ExportProgressFn, writtenPhotos: number, grandTotalPhotos: number,): void {
    if (writtenPhotos % 5 !== 0 || grandTotalPhotos <= 0) return;
    onProgress({
        phase: 'bundling',
        percent: 60 + Math.floor((writtenPhotos / grandTotalPhotos) * 30),
        detail: `${writtenPhotos} / ${grandTotalPhotos} photos`,
    });
}

interface IWritePhotoArgs {
    zip: JSZip;
    csvRows: string[];
    folder: string;
    entry: IPhotoEntry;
    index: number;
    job: IJob;
    panel: IPanel;
}

// Bake one photo (overlay + EXIF) into the zip and append a metadata CSV
// row for it. Returns nothing — mutates zip and csvRows.
async function writePhotoToZip({
    zip, csvRows, folder, entry, index, job, panel,
}: IWritePhotoArgs): Promise<void> {
    const ph = entry.photo;
    const ext = (ph.mime || 'image/jpeg').split('/')[1] || 'jpg';
    const fname = `IMG_${pad3(index + 1)}.${ext === 'jpeg' ? 'jpg' : ext}`;
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
}

interface IWritePanelPhotosArgs {
    zip: JSZip;
    csvRows: string[];
    panel: IPanel;
    photos: IPhoto[];
    job: IJob;
    onProgress: ExportProgressFn;
    writtenPhotos: number;
    grandTotalPhotos: number;
}

// Write every photo in one panel into the zip + CSV, then return the
// updated writtenPhotos counter. Reports progress every 5 photos.
async function writePanelPhotos({
    zip, csvRows, panel, photos, job, onProgress,
    writtenPhotos, grandTotalPhotos,
}: IWritePanelPhotosArgs): Promise<number> {
    const rowInfo = await buildRowInfoMap(panel);
    const byFolder = groupPhotosByFolder(photos, panel, rowInfo);
    // Flatten the (folder → entries) map into a single ordered list of
    // (folder, entry, indexWithinFolder) tuples so we can drive the writes
    // through one sequential reducer without nested loops.
    type Task = { folder: string; entry: IPhotoEntry; index: number };
    const tasks: Task[] = [...byFolder].flatMap(
        ([folder, list]) => list.map((entry, index) => ({
            folder, entry, index,
        })),
    );
    let written = writtenPhotos;
    // Photos must be baked + written sequentially: applyOverlay holds an
    // OffscreenCanvas, JSZip mutates a shared file map, and we want progress
    // callbacks fired in capture order. Reduce-with-await keeps it serial
    // without a `for await` loop.
    await tasks.reduce(async (prev, task) => {
        await prev;
        await writePhotoToZip({
            zip, csvRows, folder: task.folder, entry: task.entry, index: task.index, job, panel,
        });
        written += 1;
        reportPhotoProgress(onProgress, written, grandTotalPhotos);
    }, Promise.resolve());
    return written;
}

// Append the job's custom checklist tasks (added via the in-app Checklist
// screen) below the existing tasks, copying styles from the last template
// row so the appended rows match.
async function appendCustomChecklistTasks(
    checklistSheet: Worksheet | null,
    checklistLastTaskRow: number,
    job: IJob,
): Promise<void> {
    try {
        if (!checklistSheet || checklistLastTaskRow <= 0) return;
        const cls = await getChecklistState(job.id);
        const customTasks = cls.customTasks || [];
        if (customTasks.length === 0) return;
        const cl = checklistSheet;
        const styleSrcRow = cl.getRow(checklistLastTaskRow);
        customTasks.forEach((t, i) => {
            if (!t) return;
            const r = checklistLastTaskRow + 1 + i;
            const a = cl.getCell(r, 1);
            const b = cl.getCell(r, 2);
            const c = cl.getCell(r, 3);
            a.value = t.label;
            b.value = true;
            c.value = !!t.completed;
            copyChecklistRowStyles(styleSrcRow, [a, b, c]);
        });
    } catch (e) {
        console.warn('Custom checklist append skipped:', e);
    }
}

// Build the value for a row's Photo/Folder Hyperlink cell.
//   - If the row has photos, return an ExcelJS hyperlink object pointing at
//     IMG_001.jpg (Excel for Mac won't reliably open folder URLs but will
//     open a JPG in Preview, so we target the first photo while keeping
//     the folder path as display text).
//   - If the row has no photos, return the folder path as plain text so
//     the user can see where photos would go without a broken hyperlink.
function buildHyperlinkCellValue(folder: string, hasPhotos: boolean,): string | { text: string; hyperlink: string } {
    if (!hasPhotos) return folder;
    const firstFile = `${folder}IMG_001.jpg`;
    return { text: folder, hyperlink: encodeURI(firstFile) };
}

interface IWriteDataRowArgs {
    ws: Worksheet;
    writeRow: number;
    row: IRow;
    schema: ISheetSchema;
    colIndex: ColumnIndex;
    panel: IPanel;
    sheetName: string;
    rowsWithPhotos: Set<string>;
}

// Write a single column on a worksheet row, dispatching between hyperlink
// cells and plain data cells. Mutates the worksheet via `r.getCell(ci)`.
// ExcelJS has no immutable cell-write API.
/* eslint-disable no-param-reassign */
function writeDataCell(
    r: ExcelRow,
    ci: number,
    col: { header: string },
    {
        row, schema, panel, sheetName, rowsWithPhotos,
    }: Omit<IWriteDataRowArgs, 'ws' | 'writeRow' | 'colIndex'>,
): void {
    if (col.header !== schema.hyperlink_column) {
        r.getCell(ci).value = coerce(row.data?.[col.header] as CoerceInput);
        return;
    }
    const folder = `Photos/${safe(panel.name)}/${safe(sheetName)}/${rowLabel(row, schema)}/`;
    const hasPhotos = rowsWithPhotos.has(row.id);
    try {
        r.getCell(ci).value = buildHyperlinkCellValue(folder, hasPhotos);
    } catch {
        r.getCell(ci).value = folder;
    }
}
/* eslint-enable no-param-reassign */

// Write a single data row to the worksheet at writeRow. Returns nothing
// — mutates the worksheet row in place and commits it.
function writeDataRow(args: IWriteDataRowArgs): void {
    const {
        ws, writeRow, schema, colIndex,
    } = args;
    const r = ws.getRow(writeRow);
    schema.columns.forEach((col) => {
        const ci = colIndex[col.header];
        if (ci) writeDataCell(r, ci, col, args);
    });
    r.commit();
}

// Build a { columnHeader: columnIndex } lookup for the schema's columns
// against the actual worksheet headers. Skips headers that aren't found.
function buildColumnIndexMap(ws: Worksheet, schema: ISheetSchema): ColumnIndex {
    const colIndex: ColumnIndex = {};
    const headerRow = schema.header_row ?? 1;
    schema.columns.forEach((col) => {
        const idx = findColumnIndex(ws, headerRow, col.header);
        if (idx) colIndex[col.header] = idx;
    });
    return colIndex;
}

interface ICollectPanelNotesArgs {
    panel: IPanel;
    sheetName: string;
    schema: ISheetSchema;
    sheetRows: IRow[];
    notesAppendix: INotesAppendixEntry[];
}

// Collect sheet-level + row-level notes for one (panel, sheet) into the
// notesAppendix list. Returns nothing — appends to the passed array.
async function collectPanelNotes({
    panel, sheetName, schema, sheetRows, notesAppendix,
}: ICollectPanelNotesArgs): Promise<void> {
    const sheetNote = await getSheetNotes(panel.id, sheetName);
    if (sheetNote) {
        notesAppendix.push({
            sheet: sheetName, panel: panel.name, label: '(sheet)', notes: sheetNote,
        });
    }
    sheetRows
        .filter((row) => row.notes && row.notes.trim())
        .forEach((row) => {
            notesAppendix.push({
                sheet: sheetName,
                panel: panel.name,
                label: rowLabel(row, schema),
                notes: row.notes.trim(),
            });
        });
}

// Populate one worksheet with all panels' rows for this sheet, replicating
// the template's example-row styling and clearing any leftover example rows
// below. Mutates the worksheet in place and appends to notesAppendix.
interface IPopulateSheetArgs {
    ws: Worksheet;
    sheetName: string;
    schema: ISheetSchema;
    panels: IPanel[];
    rowsWithPhotos: Set<string>;
    notesAppendix: INotesAppendixEntry[];
}

// True if any cell in row 1..columnCount has a non-empty value.
function rowHasAnyValue(row: ExcelRow, columnCount: number): boolean {
    let any = false;
    for (let c = 1; c <= columnCount && !any; c += 1) {
        const v = row.getCell(c).value;
        if (v !== null && v !== undefined && v !== '') any = true;
    }
    return any;
}

// Clear any leftover example rows the template ships below our data.
// The template starts with example rows at `first_data_row`; whatever
// we didn't overwrite needs to be wiped or the user gets fake "Example"
// entries in their export. Stops at the first blank row.
function clearLeftoverExampleRows(ws: Worksheet, startRow: number): void {
    let clearRow = startRow;
    let safetyLimit = 30; // don't run forever on weird sheets
    while (safetyLimit > 0) {
        safetyLimit -= 1;
        const r = ws.getRow(clearRow);
        if (!rowHasAnyValue(r, ws.columnCount)) break;
        blankRow(r, ws.columnCount);
        r.commit();
        clearRow += 1;
    }
}

// Write one panel's rows for this sheet starting at `startWriteRow`. Returns
// the next free writeRow so populateSheet can advance the cursor.
async function writePanelRows({
    ws, panel, sheetName, schema, colIndex, rowsWithPhotos, exampleStyles,
    notesAppendix, startWriteRow,
}: {
    ws: Worksheet;
    panel: IPanel;
    sheetName: string;
    schema: ISheetSchema;
    colIndex: ColumnIndex;
    rowsWithPhotos: Set<string>;
    exampleStyles: ExampleStyleMap;
    notesAppendix: INotesAppendixEntry[];
    startWriteRow: number;
}): Promise<number> {
    const allRows = await listAllRows(panel.id);
    const sheetRows = allRows
        .filter((r) => r.sheet === sheetName)
        .sort((a, b) => a.idx - b.idx);
    await collectPanelNotes({
        panel, sheetName, schema, sheetRows, notesAppendix,
    });
    let writeRow = startWriteRow;
    sheetRows.forEach((row) => {
        const r = ws.getRow(writeRow);
        blankRow(r, ws.columnCount);
        applyExampleStyles(r, exampleStyles, ws.columnCount);
        writeDataRow({
            ws, writeRow, row, schema, colIndex, panel, sheetName, rowsWithPhotos,
        });
        writeRow += 1;
    });
    return writeRow;
}

async function populateSheet({
    ws, sheetName, schema, panels, rowsWithPhotos, notesAppendix,
}: IPopulateSheetArgs): Promise<void> {
    const colIndex = buildColumnIndexMap(ws, schema);
    const firstDataRow = schema.first_data_row ?? ((schema.header_row ?? 1) + 1);
    const exampleStyles = captureExampleRowStyles(ws, firstDataRow);
    // Sequential reduce: each panel's writes depend on the previous panel's
    // final writeRow cursor, so we cannot Promise.all this.
    const finalWriteRow = await panels.reduce<Promise<number>>(async (prev, panel) => {
        const startWriteRow = await prev;
        return writePanelRows({
            ws,
            panel,
            sheetName,
            schema,
            colIndex,
            rowsWithPhotos,
            exampleStyles,
            notesAppendix,
            startWriteRow,
        });
    }, Promise.resolve(firstDataRow));

    clearLeftoverExampleRows(ws, finalWriteRow);
}

// Extend each table's `ref` attribute so it covers the actual last data row
// in the sheet. Without this, rows beyond the template's example row sit
// outside the table and lose banding/totals/auto-extension. Walks the
// sheet's row anchors to find the last row, then rewrites every related
// table.xml's ref. Returns nothing — mutates zip files in place.
// Rewrite one table.xml's `ref` attribute so it extends down to `lastRow`.
async function extendOneTableRef(zip: JSZip, tablePath: string, lastRow: number): Promise<void> {
    const tableFile = zip.file(tablePath);
    if (!tableFile) return;
    const tableXml = await tableFile.async('string');
    const updated = tableXml.replace(
        /(<table\b[^>]*?\sref=")([A-Z]+)(\d+):([A-Z]+)(\d+)(")/,
        (_m, p1, c1, r1, c2, r2, p2) => {
            const newR2 = Math.max(parseInt(r2, 10), lastRow);
            return `${p1}${c1}${r1}:${c2}${newR2}${p2}`;
        },
    );
    zip.file(tablePath, updated);
}

async function extendTableRefsForSheet(zip: JSZip, sheetFile: string): Promise<void> {
    const sheetEntry = zip.file(sheetFile);
    if (!sheetEntry) return;
    const sheetXml = await sheetEntry.async('string');
    const rowMatches = [...sheetXml.matchAll(/<row\s+r="(\d+)"/g)];
    if (rowMatches.length === 0) return;
    const lastRow = Math.max(...rowMatches.map((m) => parseInt(m[1] ?? '0', 10)));

    const sheetNum = sheetFile.match(/sheet(\d+)\.xml$/)?.[1];
    if (!sheetNum) return;
    const relsPath = `xl/worksheets/_rels/sheet${sheetNum}.xml.rels`;
    const relsFile = zip.file(relsPath);
    if (!relsFile) return;
    const rels = await relsFile.async('string');
    const tablePaths = [...rels.matchAll(/Target="([^"]*tables\/table\d+\.xml)"/g)]
        .map((m) => `xl/${(m[1] ?? '').replace(/^\.\.\//, '')}`);
    // Table writes target distinct files; parallel is safe.
    await Promise.all(tablePaths.map((p) => extendOneTableRef(zip, p, lastRow)));
}

export async function buildExport(job: IJob, {
    templateUrl = './template.xlsx',
    onProgress = () => {},
    mode = 'zip',
    filename: filenameOverride = null,
}: IBuildExportOptions = {}): Promise<IBuildExportResult> {
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
    const photosLists = await Promise.all(panels.map((p) => listPanelPhotos(p.id)));
    const photosByPanel = new Map<string, IPhoto[]>(
        panels.map((p, i) => [p.id, photosLists[i] ?? []]),
    );
    const rowsWithPhotos = collectRowsWithPhotos(photosByPanel);

    // 3. Populate sheets
    onProgress({ phase: 'populating', percent: 15 });
    const sheetCount = SHEET_ORDER.length;

    // Track row notes per (sheet,panel,rowLabel) to write a "Notes" appendix
    const notesAppendix: INotesAppendixEntry[] = [];

    // Sequential reduce: each populateSheet call mutates the shared workbook
    // and we need progress callbacks in sheet order.
    await SHEET_ORDER.reduce<Promise<void>>(async (prev, sheetName, idx) => {
        await prev;
        onProgress({
            phase: 'populating',
            percent: 15 + Math.floor(((idx + 1) / sheetCount) * 35),
            detail: sheetName,
        });
        const schema = SCHEMAS[sheetName];
        if (!schema) return;
        const ws = wb.getWorksheet(sheetName);
        if (!ws) return;
        await populateSheet({
            ws, sheetName, schema, panels, rowsWithPhotos, notesAppendix,
        });
    }, Promise.resolve());

    // 4. Update Checklist completion (auto + manual) and append custom tasks
    const { checklistSheet, checklistLastTaskRow } = await updateChecklistCompletion(wb, job, panels);
    await appendCustomChecklistTasks(checklistSheet, checklistLastTaskRow, job);

    // 5. Append Notes sheet (job + per-row notes) — added only if we have any
    appendNotesSheet(wb, job, notesAppendix);

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
        const sheetFiles = Object.keys(fixZip.files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f));
        const tableFiles = Object.keys(fixZip.files).filter((f) => /^xl\/tables\/table\d+\.xml$/.test(f));

        // Each helper rewrites a distinct file inside the zip, so we can run
        // them in parallel. We await each batch separately so a worksheet
        // rewrite is visible to the table-ref extension that follows.
        await Promise.all(sheetFiles.map(async (f) => {
            const entry = fixZip.file(f);
            if (!entry) return;
            const xml = await entry.async('string');
            fixZip.file(f, reorderTableParts(fixDpiSentinels(xml)));
        }));
        await Promise.all(tableFiles.map(async (f) => {
            const entry = fixZip.file(f);
            if (!entry) return;
            const xml = await entry.async('string');
            fixZip.file(f, repairAutoFilter(xml));
        }));

        // Extend each table's `ref` to cover the actual last data row in its
        // sheet. Without this, rows beyond the template's example row sit
        // outside the table and lose banding/totals/auto-extension.
        await Promise.all(sheetFiles.map((sheetFile) => extendTableRefsForSheet(fixZip, sheetFile)));

        // Re-attach FeaturePropertyBag from the template so cell-checkboxes work,
        // then rewrite the Checklist sheet's t="b" cells to reference the
        // checkbox-enabled xfId.
        const tmplZip = new JSZip();
        await tmplZip.loadAsync(tmplBuf);
        const fpbAttached = await attachFeaturePropertyBag(fixZip, tmplZip);
        if (fpbAttached) await rewriteCellXfRefs(fixZip);

        xlsxBuf = await fixZip.generateAsync({ type: 'arraybuffer' });
    }

    // 'xlsx-only' mode: ship just the xlsx, no zip wrapper, no photos/csv/backup.
    if (mode === 'xlsx-only') {
        onProgress({ phase: 'finalizing', percent: 95 });
        const blob = new Blob([xlsxBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const xlsxFilename = filenameOverride || `${safe(job.name)}.xlsx`;
        const shareFile = await materializeForShare(blob, xlsxFilename);
        onProgress({ phase: 'done', percent: 100 });
        return {
            blob, filename: xlsxFilename, sizeBytes: blob.size, shareFile
        };
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
    const csvRows: string[] = [csvHeader];

    // Build a map of rowId → label for fast lookup, per panel.
    // Then group photos by their target folder and write them in order.
    const allPanelPhotos: Array<{ panel: IPanel; photos: IPhoto[] }> = panels.map(
        (panel) => ({ panel, photos: photosByPanel.get(panel.id) || [] }),
    );
    const grandTotalPhotos = allPanelPhotos.reduce((s, p) => s + p.photos.length, 0);

    // Sequential reduce — see writePanelPhotos' note on why baking + writing
    // can't be parallelized.
    await allPanelPhotos.reduce<Promise<number>>(async (prev, { panel, photos }) => {
        const writtenPhotos = await prev;
        return writePanelPhotos({
            zip,
            csvRows,
            panel,
            photos,
            job,
            onProgress,
            writtenPhotos,
            grandTotalPhotos,
        });
    }, Promise.resolve(0));

    zip.file(`${jobSafe}_photo_metadata.csv`, csvRows.join('\n'));

    // Re-importable backup. Photos are embedded as base64 so Settings → Restore
    // on another device reconstructs the job without the Photos/ folder.
    onProgress({
        phase: 'bundling', percent: 90, detail: 'backup snapshot'
    });
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
    return {
        blob: zipBlob, filename: zipFilename, sizeBytes: zipBlob.size, shareFile
    };
}

export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function shareBlob(blob: Blob, filename: string, title: string, shareFile: File | null = null,): Promise<boolean> {
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
    const payload: ShareData = { files: [file] };
    if (safeTitle && safeTitle !== 'unnamed') payload.title = safeTitle;
    await navigator.share(payload);
    return true;
}
