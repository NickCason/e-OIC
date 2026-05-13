// IndexedDB schema for the e-OIC store. Mirrors src/db.js exactly — store
// names, key paths, and index names all match what openDB() registers there.
// DB_NAME is intentionally still the legacy 'onsite-investigation' name; the
// app was renamed to e-OIC but renaming the DB would orphan installed data.

import type { DBSchema } from 'idb';

import type { IJob, IPanel, IRow, IPhoto, ISheetNote, ISetting, IChecklistState } from './job';

export interface IEoicDBSchema extends DBSchema {
    jobs: {
        key: string;
        value: IJob;
    };
    panels: {
        key: string;
        value: IPanel;
        indexes: { jobId: string };
    };
    rows: {
        key: string;
        value: IRow;
        indexes: {
            panelId: string;
            panelId_sheet: [string, string];
        };
    };
    photos: {
        key: string;
        value: IPhoto;
        indexes: {
            panelId: string;
            panelId_sheet_item: [string, string, string];
            rowId: string;
        };
    };
    sheetNotes: {
        key: string;
        value: ISheetNote;
        indexes: {
            panelId: string;
            panelId_sheet: [string, string];
        };
    };
    settings: {
        key: string;
        value: ISetting;
    };
    checklistState: {
        key: string;
        value: IChecklistState;
    };
}

export const DB_NAME = 'onsite-investigation';
export const DB_VERSION = 4;
