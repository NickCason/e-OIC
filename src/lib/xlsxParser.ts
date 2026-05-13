// xlsxParser.ts — reads an xlsx workbook into the IParsedXlsx shape consumed
// by jobDiff and the round-trip pipeline. Pure transform over exceljs; no DB
// or DOM access. Tests live in xlsxParser.test.ts.

import type { Worksheet, Row as ExcelRow, Cell, CellValue, CellRichTextValue } from 'exceljs';
import schemaMapJson from '../schema.json';
import type { RowData, RowValue } from '../types/job';
import type { IParsedXlsx, IParsedPanel, IParsedRow, IParsedSheetNote, ISheetSchema, IXlsxParseProgress, IXlsxParserWarning } from '../types/xlsx';

const schemaMap = schemaMapJson as unknown as Record<string, ISheetSchema>;

const AUXILIARY_SHEET_NAMES = new Set(['Rev', 'Checklist', 'Notes']);

interface IHeaderIndexEntry {
    colNumber: number;
    raw: string;
}

type HeaderIndex = Record<string, IHeaderIndexEntry>;

interface IRowNoteAssignment {
    sheetName: string;
    panelName: string;
    label: string;
    text: string;
}

interface IParsedNotesSheet {
    jobNotes: string;
    sheetNotes: IParsedSheetNote[];
    rowNoteAssignments: IRowNoteAssignment[];
}

export interface IParseChecklistXlsxOptions {
    onProgress?: (p: IXlsxParseProgress) => void;
}

function normalize(s: unknown): string {
    if (s == null) return '';
    return String(s).replace(/\s+/g, ' ').trim().toLowerCase();
}

function isRichTextValue(v: object): v is CellRichTextValue {
    return 'richText' in v && Array.isArray((v as CellRichTextValue).richText);
}

function extractFormulaResult(v: { result?: unknown }): RowValue {
    const r = v.result;
    if (r == null) return null;
    if (typeof r === 'string' || typeof r === 'number' || typeof r === 'boolean') return r;
    if (r instanceof Date) return r.toISOString();
    return null;
}

function extractCellValue(cell: Cell): RowValue {
    const v: CellValue = cell.value;
    if (v == null) return null;
    if (typeof v === 'string') return v === '' ? null : v;
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    if (v instanceof Date) return v.toISOString();
    if (typeof v !== 'object') return null;
    if ('result' in v) return extractFormulaResult(v as { result?: unknown });
    if ('text' in v) {
        const t = (v as { text?: unknown }).text;
        return t == null ? null : String(t);
    }
    if (isRichTextValue(v)) {
        return v.richText.map((p) => p.text || '').join('') || null;
    }
    return null;
}

function buildHeaderIndex(ws: Worksheet, headerRow: number): HeaderIndex {
    const row = ws.getRow(headerRow);
    const idx: HeaderIndex = {};
    const colNumbers = Array.from({ length: ws.columnCount }, (_unused, i) => i + 1);
    colNumbers.forEach((c) => {
        const v = row.getCell(c).value;
        const s = (v == null ? '' : String(v)).replace(/\n/g, ' ').trim();
        if (s) idx[normalize(s)] = { colNumber: c, raw: s };
    });
    return idx;
}

function rowIsAllBlank(rowData: RowData): boolean {
    return Object.values(rowData).every((v) => v == null);
}

function buildRowData(
    xlsxRow: ExcelRow,
    schema: ISheetSchema,
    headerIndex: HeaderIndex,
): RowData {
    const data: RowData = {};
    schema.columns.forEach((col) => {
        if (col.header === schema.hyperlink_column) return;
        const h = headerIndex[normalize(col.header)];
        if (!h) return;
        data[col.header] = extractCellValue(xlsxRow.getCell(h.colNumber));
    });
    return data;
}

function pushColumnWarnings(
    ws: Worksheet,
    schema: ISheetSchema,
    headerIndex: HeaderIndex,
    warnings: IXlsxParserWarning[],
): void {
    const schemaHeaderNorms = new Set(schema.columns.map((c) => normalize(c.header)));
    schema.columns.forEach((col) => {
        if (col.header === schema.hyperlink_column) return;
        if (!headerIndex[normalize(col.header)]) {
            warnings.push({
                kind: 'missing-column',
                sheetName: ws.name,
                columnName: col.header,
            });
        }
    });
    Object.keys(headerIndex).forEach((norm) => {
        if (schemaHeaderNorms.has(norm)) return;
        const entry = headerIndex[norm];
        if (!entry) return;
        warnings.push({
            kind: 'extra-column',
            sheetName: ws.name,
            columnName: entry.raw,
        });
    });
}

function collectDataRows(
    ws: Worksheet,
    schema: ISheetSchema,
    headerIndex: HeaderIndex,
    firstDataRow: number,
): IParsedRow[] {
    const rows: IParsedRow[] = [];
    let r = firstDataRow;
    let consecutiveBlanks = 0;
    while (consecutiveBlanks < 2 && r <= ws.rowCount + 2) {
        const data = buildRowData(ws.getRow(r), schema, headerIndex);
        if (rowIsAllBlank(data)) {
            consecutiveBlanks += 1;
        } else {
            consecutiveBlanks = 0;
            const panelName = data['Panel Name'] != null ? String(data['Panel Name']) : null;
            rows.push({
                panelName,
                data,
                notes: '',
                sourceRowIndex: r,
            });
        }
        r += 1;
    }
    return rows;
}

function parseSheetRows(
    ws: Worksheet,
    schema: ISheetSchema,
    warnings: IXlsxParserWarning[],
): IParsedRow[] {
    const headerRow = schema.header_row ?? 1;
    const firstDataRow = schema.first_data_row ?? headerRow + 1;
    const headerIndex = buildHeaderIndex(ws, headerRow);
    pushColumnWarnings(ws, schema, headerIndex, warnings);
    return collectDataRows(ws, schema, headerIndex, firstDataRow);
}

function countUnknownPanelReferences(
    rows: IParsedRow[],
    knownPanelNames: Set<string>,
): Map<string, number> {
    const counts = new Map<string, number>();
    rows.forEach((row) => {
        if (row.panelName == null) return;
        if (knownPanelNames.has(row.panelName)) return;
        counts.set(row.panelName, (counts.get(row.panelName) || 0) + 1);
    });
    return counts;
}

function extractPanelsFromRows(rows: IParsedRow[]): IParsedPanel[] {
    const panels: IParsedPanel[] = [];
    rows.forEach((row) => {
        const raw = row.data?.['Panel Name'];
        const name = raw != null ? String(raw).trim() : '';
        if (!name) return;
        panels.push({ name, sourceRowIndex: row.sourceRowIndex });
    });
    return panels;
}

function findNotesHeaderRow(ws: Worksheet, startRow: number): number | null {
    let r = startRow;
    while (r <= ws.rowCount) {
        const a = ws.getCell(r, 1).value;
        const b = ws.getCell(r, 2).value;
        const c = ws.getCell(r, 3).value;
        const d = ws.getCell(r, 4).value;
        const isHeader = a != null && String(a).trim() === 'Sheet'
            && b != null && String(b).trim() === 'Panel'
            && c != null && String(c).trim() === 'Row'
            && d != null && String(d).trim() === 'Notes';
        if (isHeader) return r;
        r += 1;
    }
    return null;
}

function readNotesAssignmentRow(
    ws: Worksheet,
    r: number,
    out: IParsedNotesSheet,
): boolean {
    const sheetCell = ws.getCell(r, 1).value;
    const panelCell = ws.getCell(r, 2).value;
    const labelCell = ws.getCell(r, 3).value;
    const notesCell = ws.getCell(r, 4).value;
    if (sheetCell == null && panelCell == null && labelCell == null && notesCell == null) {
        return false;
    }
    const sheetName = sheetCell == null ? '' : String(sheetCell).trim();
    const panelName = panelCell == null ? '' : String(panelCell).trim();
    const label = labelCell == null ? '' : String(labelCell).trim();
    const text = notesCell == null ? '' : String(notesCell).trim();
    if (!text) return true;
    if (label === '(sheet)') {
        out.sheetNotes.push({
            panelName,
            sheetName,
            text,
        });
    } else {
        out.rowNoteAssignments.push({
            sheetName,
            panelName,
            label,
            text,
        });
    }
    return true;
}

function parseNotesSheet(ws: Worksheet | undefined): IParsedNotesSheet {
    const out: IParsedNotesSheet = {
        jobNotes: '',
        sheetNotes: [],
        rowNoteAssignments: [],
    };
    if (!ws) return out;

    let cursor = 1;
    const r1c1 = ws.getCell(1, 1).value;
    if (r1c1 != null && String(r1c1).trim() === 'Job Notes') {
        const r2c1 = ws.getCell(2, 1).value;
        out.jobNotes = r2c1 == null ? '' : String(r2c1).trim();
        cursor = 3;
    }

    const headerR = findNotesHeaderRow(ws, cursor);
    if (headerR == null) return out;

    let r = headerR + 1;
    while (r <= ws.rowCount + 1) {
        const cont = readNotesAssignmentRow(ws, r, out);
        if (!cont) break;
        r += 1;
    }
    return out;
}

function pushUnknownSheetWarnings(
    sheetNames: string[],
    warnings: IXlsxParserWarning[],
): void {
    sheetNames.forEach((name) => {
        if (schemaMap[name]) return;
        if (AUXILIARY_SHEET_NAMES.has(name)) return;
        warnings.push({ kind: 'unknown-sheet', sheetName: name });
    });
}

function pushMissingSheetWarnings(
    sheetNames: string[],
    warnings: IXlsxParserWarning[],
): void {
    Object.keys(schemaMap).forEach((sn) => {
        if (sheetNames.includes(sn)) return;
        warnings.push({ kind: 'missing-sheet', sheetName: sn });
    });
}

function buildEmptySheetSlots(): Record<string, IParsedRow[]> {
    const out: Record<string, IParsedRow[]> = {};
    Object.keys(schemaMap).forEach((sn) => {
        out[sn] = [];
    });
    return out;
}

async function matchRowNoteAssignment(
    assignment: IRowNoteAssignment,
    rowsBySheet: Record<string, IParsedRow[]>,
    warnings: IXlsxParserWarning[],
    rowDisplayLabel: typeof import('./rowLabel').rowDisplayLabel,
): Promise<void> {
    const rows = rowsBySheet[assignment.sheetName];
    if (!rows) {
        warnings.push({
            kind: 'notes-row-unmatched',
            sheetName: assignment.sheetName,
            panelName: assignment.panelName,
            label: assignment.label,
        });
        return;
    }
    const schema = schemaMap[assignment.sheetName];
    const match = rows.find((row) => (
        row.panelName === assignment.panelName
        && rowDisplayLabel({ data: row.data, idx: 0 }, assignment.sheetName, schema) === assignment.label
    ));
    if (match) {
        match.notes = assignment.text;
    } else {
        warnings.push({
            kind: 'notes-row-unmatched',
            sheetName: assignment.sheetName,
            panelName: assignment.panelName,
            label: assignment.label,
        });
    }
}

export async function parseChecklistXlsx(
    arrayBuffer: ArrayBuffer,
    { onProgress }: IParseChecklistXlsxOptions = {},
): Promise<IParsedXlsx> {
    const emit = (phase: IXlsxParseProgress['phase'], detail: string): void => {
        if (typeof onProgress === 'function') {
            try { onProgress({ phase, detail }); } catch { /* swallow callback errors */ }
        }
    };
    const result: IParsedXlsx = {
        jobMeta: {
            name: null,
            client: '',
            location: '',
            notes: '',
        },
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
        const message = e instanceof Error ? e.message : 'Could not read xlsx';
        result.errors.push({ kind: 'invalid-xlsx', message });
        return result;
    }

    const sheetNames = wb.worksheets.map((ws) => ws.name);
    const recognized = sheetNames.filter((n) => schemaMap[n]);
    if (recognized.length === 0) {
        result.errors.push({ kind: 'no-recognized-sheets' });
        return result;
    }

    pushUnknownSheetWarnings(sheetNames, result.warnings);
    pushMissingSheetWarnings(sheetNames, result.warnings);
    result.rowsBySheet = buildEmptySheetSlots();

    // Parse Panels first so other sheets can validate against panel names.
    if (sheetNames.includes('Panels')) {
        const ws = wb.getWorksheet('Panels');
        const panelsSchema = schemaMap.Panels;
        if (ws && panelsSchema) {
            const rows = parseSheetRows(ws, panelsSchema, result.warnings);
            result.rowsBySheet.Panels = rows;
            result.panels.push(...extractPanelsFromRows(rows));
        }
    }
    emit('panels', `Found ${result.panels.length} panel${result.panels.length === 1 ? '' : 's'}`);

    Object.keys(schemaMap)
        .filter((sn) => sn !== 'Panels' && sheetNames.includes(sn))
        .forEach((sn) => {
            const ws = wb.getWorksheet(sn);
            const sheetSchema = schemaMap[sn];
            if (!ws || !sheetSchema) return;
            emit('rows', `Reading ${sn}`);
            result.rowsBySheet[sn] = parseSheetRows(ws, sheetSchema, result.warnings);
        });

    // Validate panel-name references across non-Panels sheets.
    const knownPanelNames = new Set(result.panels.map((p) => p.name));
    Object.keys(result.rowsBySheet)
        .filter((sn) => sn !== 'Panels')
        .forEach((sn) => {
            const sheetRows = result.rowsBySheet[sn];
            if (!sheetRows) return;
            const counts = countUnknownPanelReferences(sheetRows, knownPanelNames);
            counts.forEach((rowCount, panelName) => {
                result.warnings.push({
                    kind: 'unknown-panel-reference',
                    sheetName: sn,
                    panelName,
                    rowCount,
                });
            });
        });

    // Notes sheet
    const notesWs = wb.getWorksheet('Notes');
    const notes = parseNotesSheet(notesWs);
    result.jobMeta.notes = notes.jobNotes;
    result.sheetNotes = notes.sheetNotes;

    // Match row-note assignments back to parsed rows by (sheet, panelName, label).
    emit('matching', 'Matching notes to rows');
    const { rowDisplayLabel } = await import('./rowLabel');
    await Promise.all(notes.rowNoteAssignments.map((assignment) => (
        matchRowNoteAssignment(assignment, result.rowsBySheet, result.warnings, rowDisplayLabel)
    )));

    return result;
}
