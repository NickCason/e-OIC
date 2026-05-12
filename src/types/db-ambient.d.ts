// Temporary ambient declarations for src/db.js while Plan C converts the
// leaf utility libs (Task 3) before db.js itself (Task 4). Once db.js
// becomes db.ts in Task 4, this file is deleted and consumers import the
// real signatures directly.
//
// Only the surface actually consumed by the Task 3 utility files
// (theme.ts, geolocation.ts, metrics.ts) is declared. Everything else
// stays untyped here — Task 4 introduces the real types.

declare module '*/db' {
    type RowValue = string | number | boolean | null;
    type RowData = Record<string, RowValue>;

    interface IJobSource {
        kind: 'xlsx';
        filename: string;
        pulledAt: number;
    }
    interface IJob {
        id: string;
        name: string;
        client: string;
        location: string;
        notes: string;
        source: IJobSource | null;
        createdAt: number;
        updatedAt: number;
    }
    interface IPanel {
        id: string;
        jobId: string;
        name: string;
        createdAt: number;
        updatedAt: number;
    }
    interface IRow {
        id: string;
        panelId: string;
        sheet: string;
        idx: number;
        data: RowData;
        notes: string;
        updatedAt: number;
    }
    interface IPhotoGps {
        lat: number;
        lng: number;
        accuracy?: number;
        capturedAt?: number;
    }
    interface IPhoto {
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
    interface IChecklistCustomTask {
        id: string;
        label: string;
        completed: boolean;
        createdAt: number;
    }
    interface IChecklistState {
        jobId: string;
        manualTasks: Record<string, boolean>;
        customTasks: IChecklistCustomTask[];
    }

    export function getSetting<T = unknown>(key: string, fallback?: T | null): Promise<T | null>;
    export function setSetting(key: string, value: unknown): Promise<void>;

    export function listJobs(): Promise<IJob[]>;
    export function listPanels(jobId: string): Promise<IPanel[]>;
    export function listRows(panelId: string, sheet: string): Promise<IRow[]>;
    export function listAllRows(panelId: string): Promise<IRow[]>;
    export function listPanelPhotos(panelId: string): Promise<IPhoto[]>;

    export function getChecklistState(jobId: string): Promise<IChecklistState>;
    export function slugifyTaskLabel(label: string): string;
}
