// Types for the parsed-xlsx pipeline (parser → diff → round-trip).
// Extracted from src/lib/xlsxParser.js, src/lib/jobDiff.js, and
// src/lib/xlsxRoundTrip.js. The parser writes a single result object whose
// shape these interfaces describe; jobDiff consumes that shape directly.

import type { IJob, IPanel, IRow, RowData } from './job';

// ===== Schema (src/schema.json) =====
//
// Minimal shape consumed by the rest of the codebase. The JSON has more
// fields (sheet_name, header_row, first_data_row, groups), but the only
// surface used today is the per-column header. Plan C/D fills out as needed.

export interface ISheetSchemaColumn {
    index: number;
    group: string;
    header: string;
}

export interface ISheetSchema {
    sheet_name?: string;
    header_row?: number;
    first_data_row?: number;
    columns: ISheetSchemaColumn[];
    photo_checklist_columns?: string[];
    hyperlink_column?: string;
    primary_key?: string;
    row_photos_enabled?: boolean;
}

// ===== Parser output =====

export interface IParsedJobMeta {
    /** null when the Panels sheet has no 'Job Name' cell. Consumers must
     *  coalesce: `parsed.jobMeta.name ?? existingJob.name`. */
    name: string | null;
    client: string;
    location: string;
    notes: string;
}

export interface IParsedPanel {
    name: string;
    sourceRowIndex: number;
}

// One parsed-xlsx row. panelName is the value of the 'Panel Name' cell (or
// null if absent). data is keyed by schema column header. notes is populated
// later by the Notes-sheet matching pass.
export interface IParsedRow {
    panelName: string | null;
    data: RowData;
    notes: string;
    sourceRowIndex: number;
}

export interface IParsedSheetNote {
    panelName: string;
    sheetName: string;
    text: string;
}

export type XlsxParserErrorKind = 'invalid-xlsx' | 'no-recognized-sheets';

export interface IXlsxParserError {
    kind: XlsxParserErrorKind;
    message?: string;
}

export type XlsxParserWarningKind =
    | 'missing-column'
    | 'extra-column'
    | 'unknown-sheet'
    | 'missing-sheet'
    | 'unknown-panel-reference'
    | 'notes-row-unmatched';

// Warning shape is permissive on purpose: different `kind`s populate
// different fields (column, row, panel, etc.) and the parser doesn't yet
// discriminate by kind. Keep optionals explicit so consumers can read
// whichever fields the kind implies.
export interface IXlsxParserWarning {
    kind: XlsxParserWarningKind;
    sheetName?: string;
    columnName?: string;
    panelName?: string;
    label?: string;
    rowCount?: number;
}

export interface IParsedXlsx {
    jobMeta: IParsedJobMeta;
    panels: IParsedPanel[];
    rowsBySheet: Record<string, IParsedRow[]>;
    sheetNotes: IParsedSheetNote[];
    warnings: IXlsxParserWarning[];
    errors: IXlsxParserError[];
}

export interface IXlsxParseProgress {
    phase: 'loading' | 'panels' | 'rows' | 'matching';
    detail: string;
}

// ===== Diff output (jobDiff.js) =====

export interface IJobMetaFieldChange {
    field: 'name' | 'notes';
    old: string;
    new: string;
}

export interface IJobMetaDiff {
    changed: IJobMetaFieldChange[];
}

export interface IPanelMatch {
    local: { id: string; name: string };
    xlsx: IParsedPanel;
}

export interface IPanelsDiff {
    added: IParsedPanel[];
    removed: Array<{ id: string; name: string }>;
    matched: IPanelMatch[];
}

// Values flowing through jobDiff may be anything that round-tripped through
// xlsx (number, string, boolean, null) plus possibly undefined when read off
// a sparse data map. Keep this loose.
export type DiffCellValue = string | number | boolean | null | undefined;

export interface IRowFieldChange {
    field: string;
    old: DiffCellValue;
    new: DiffCellValue;
}

export interface ISheetRowDiff {
    added: IParsedRow[];
    removed: IRow[];
    modified: Array<{
        local: IRow;
        xlsx: IParsedRow;
        label: string;
        fieldChanges: IRowFieldChange[];
    }>;
    unchanged: Array<{
        local: IRow;
        xlsx: IParsedRow;
        label: string;
    }>;
    labelCollisions: string[];
}

export interface ISheetNoteDiff {
    added: IParsedSheetNote[];
    removed: Array<{ panelName: string; sheetName: string; text: string }>;
    modified: Array<{
        panelName: string;
        sheetName: string;
        old: string;
        new: string;
    }>;
}

export interface IJobDiff {
    jobMeta: IJobMetaDiff;
    panels: IPanelsDiff;
    sheets: Record<string, ISheetRowDiff>;
    sheetNotes: ISheetNoteDiff;
    skippedSheets: Array<string | undefined>;
    skippedColumns: Array<{ sheetName: string | undefined; columnName: string | undefined }>;
    missingSheets: Array<string | undefined>;
}

export interface IDiffJobsLocalState {
    localJob: IJob | null;
    localPanels: IPanel[];
    localRowsBySheet: Record<string, IRow[]>;
    localSheetNotes: Record<string, Record<string, string>>;
}

// ===== Re-sync decisions (xlsxRoundTrip.applyResyncToJob) =====

export interface IResyncDecisions {
    removedRowIds: Set<string>;
}
