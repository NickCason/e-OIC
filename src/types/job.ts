// Domain types for the e-OIC job/panel/row/photo model. Extracted from the
// shapes that src/db.js, src/lib/xlsxRoundTrip.js, and src/lib/seed.js
// already write to IndexedDB; the JS is the source of truth — these types
// follow the data, not the other way around.

export type RowValue = string | number | boolean | null;

export type RowData = Record<string, RowValue>;

export interface IJobSource {
    kind: 'xlsx';
    filename: string;
    pulledAt: number;
}

export interface IJob {
    id: string;
    name: string;
    client: string;
    location: string;
    notes: string;
    source: IJobSource | null;
    createdAt: number;
    updatedAt: number;
}

export interface IPanel {
    id: string;
    jobId: string;
    name: string;
    createdAt: number;
    updatedAt: number;
}

// rows store keyPath is 'id'; (panelId, sheet) is indexed via 'panelId_sheet'.
// `idx` is the in-sheet ordering within a panel. `data` is a sparse map keyed
// by the schema column header.
export interface IRow {
    id: string;
    panelId: string;
    sheet: string;
    idx: number;
    data: RowData;
    notes: string;
    updatedAt: number;
}

export interface IPhotoGps {
    lat: number;
    lng: number;
    accuracy?: number;
    capturedAt?: number;
}

// rowId is null for panel-level photos (attached to a sheet/item, not a row).
// `item` is the schema item key the photo is attached to (panel-level photos).
export interface IPhoto {
    id: string;
    panelId: string;
    sheet: string;
    item: string;
    rowId: string | null;
    blob: Blob;
    mime: string;
    takenAt: number;
    w: number;
    h: number;
    gps: IPhotoGps | null;
}

export interface ISheetNote {
    id: string;
    panelId: string;
    sheet: string;
    text: string;
    updatedAt: number;
}

// settings store: { key, value } where value is opaque.
export interface ISetting {
    key: string;
    value: unknown;
}

// checklistState store keyed by jobId. manualTasks maps slugified task labels
// to a completion flag. customTasks is an ordered list of user-added tasks.
export interface IChecklistCustomTask {
    id: string;
    label: string;
    completed: boolean;
    createdAt: number;
}

export interface IChecklistState {
    jobId: string;
    manualTasks: Record<string, boolean>;
    customTasks: IChecklistCustomTask[];
}
