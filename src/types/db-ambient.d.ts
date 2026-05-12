// Temporary ambient declarations for src/db.js while Plan C converts the
// leaf utility libs (Task 3) before db.js itself (Task 4). Once db.js
// becomes db.ts in Task 4, this file is deleted and consumers import the
// real signatures directly.
//
// Only the surface actually consumed by the Task 3 utility files
// (theme.ts, geolocation.ts, metrics.ts) is declared. Everything else
// stays untyped here — Task 4 introduces the real types.

declare module '*/db' {
    import type {
        IJob, IPanel, IRow, IPhoto, ISheetNote, IChecklistState, RowData,
    } from './job';

    export function getSetting<T = unknown>(key: string, fallback?: T | null): Promise<T | null>;
    export function setSetting(key: string, value: unknown): Promise<void>;

    export function listJobs(): Promise<IJob[]>;
    export function listPanels(jobId: string): Promise<IPanel[]>;
    export function listRows(panelId: string, sheet: string): Promise<IRow[]>;
    export function listAllRows(panelId: string): Promise<IRow[]>;
    export function listPanelPhotos(panelId: string): Promise<IPhoto[]>;

    export function getChecklistState(jobId: string): Promise<IChecklistState>;
    export function slugifyTaskLabel(label: string): string;

    // Catch-all for utilities that don't need precise types here. Plan C
    // Task 4 replaces this whole file with the real db.ts module surface.
    const _default: Record<string, unknown>;
    export default _default;
}
