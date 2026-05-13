// db.ts — IndexedDB persistence (v4)
//
// v1 → v2 migrations:
//   - photos.rowId added (null = panel-level, set = row-level)
//   - photos.gps     added ({ lat, lng, accuracy, capturedAt } | null)
//   - rows.notes     existed implicitly via data{}; now treated as first-class field
//   - sheetNotes     new store for (panel, sheet) scratchpads
//   - settings       new key/value store: theme, geolocationConsent, etc.
//
// v2 → v3 migration:
//   - checklistState new store keyed by jobId for in-app Checklist screen
//
// v3 → v4 migration:
//   - photos store cleared (overlays move from baked-in pixels to live render;
//     existing baked photos cannot be reverted to originals).
//
// Job, panel, row, sheetNotes, settings, and checklistState data are
// preserved across all upgrades.

import { openDB } from 'idb';
import type { IDBPDatabase, IDBPTransaction } from 'idb';

import type { IEoicDBSchema } from './types/db';
import { DB_NAME, DB_VERSION } from './types/db';
import type {IJob, IJobSource, IPanel, IRow, IPhoto, IPhotoGps, ISheetNote,
    IChecklistState, IChecklistCustomTask, RowData,} from './types/job';

type EoicDB = IDBPDatabase<IEoicDBSchema>;
type EoicStoreNames = 'jobs' | 'panels' | 'rows' | 'photos' | 'sheetNotes' | 'settings' | 'checklistState';
type UpgradeTx = IDBPTransaction<IEoicDBSchema, ArrayLike<EoicStoreNames>, 'versionchange'>;

let dbPromise: Promise<EoicDB> | null = null;

function initialSchema(db: EoicDB): void {
    db.createObjectStore('jobs', { keyPath: 'id' });

    const panels = db.createObjectStore('panels', { keyPath: 'id' });
    panels.createIndex('jobId', 'jobId');

    const rows = db.createObjectStore('rows', { keyPath: 'id' });
    rows.createIndex('panelId', 'panelId');
    rows.createIndex('panelId_sheet', ['panelId', 'sheet']);

    const photos = db.createObjectStore('photos', { keyPath: 'id' });
    photos.createIndex('panelId', 'panelId');
    photos.createIndex('panelId_sheet_item', ['panelId', 'sheet', 'item']);
}

function ensurePhotosRowIdIndex(db: EoicDB, tx: UpgradeTx): void {
    if (!db.objectStoreNames.contains('photos')) return;
    const photos = tx.objectStore('photos');
    if (!photos.indexNames.contains('rowId')) {
        photos.createIndex('rowId', 'rowId');
    }
}

function upgradeToV2(db: EoicDB, tx: UpgradeTx): void {
    ensurePhotosRowIdIndex(db, tx);
    if (!db.objectStoreNames.contains('sheetNotes')) {
        const sn = db.createObjectStore('sheetNotes', { keyPath: 'id' });
        sn.createIndex('panelId', 'panelId');
        sn.createIndex('panelId_sheet', ['panelId', 'sheet'], { unique: true });
    }
    if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
    }
}

function upgradeToV3(db: EoicDB): void {
    if (!db.objectStoreNames.contains('checklistState')) {
        db.createObjectStore('checklistState', { keyPath: 'jobId' });
    }
}

function upgradeToV4(db: EoicDB, tx: UpgradeTx): void {
    // v4: photos store now holds *original* (un-overlaid) blobs. Live overlay
    // is rendered in the UI; export bakes at write time. Existing baked photos
    // cannot be recovered to originals, so we wipe the store. Job / panel /
    // row data is untouched.
    if (db.objectStoreNames.contains('photos')) {
        tx.objectStore('photos').clear();
    }
}

export function getDB(): Promise<EoicDB> {
    if (!dbPromise) {
        dbPromise = openDB<IEoicDBSchema>(DB_NAME, DB_VERSION, {
            upgrade(db, oldVersion, _newVersion, tx) {
                if (oldVersion < 1) initialSchema(db);
                if (oldVersion < 2) upgradeToV2(db, tx);
                if (oldVersion < 3) upgradeToV3(db);
                if (oldVersion < 4) upgradeToV4(db, tx);
            },
        });
    }
    return dbPromise;
}

const uid = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ======= Settings =======
export async function getSetting<T = unknown>(key: string, fallback: T | null = null): Promise<T | null> {
    const db = await getDB();
    const v = await db.get('settings', key);
    return v ? (v.value as T) : fallback;
}
export async function setSetting(key: string, value: unknown): Promise<void> {
    const db = await getDB();
    await db.put('settings', { key, value });
}

// ======= Jobs =======
export async function listJobs(): Promise<IJob[]> {
    const db = await getDB();
    const all = await db.getAll('jobs');
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function getJob(id: string): Promise<IJob | undefined> {
    const db = await getDB();
    return db.get('jobs', id);
}

export interface ICreateJobInput {
    name: string;
    client?: string;
    location?: string;
    notes?: string;
    source?: IJobSource | null;
}
export async function createJob({
    name,
    client = '',
    location = '',
    notes = '',
    source = null,
}: ICreateJobInput): Promise<IJob> {
    const db = await getDB();
    const job: IJob = {
        id: uid(),
        name,
        client,
        location,
        notes,
        source,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
    await db.put('jobs', job);
    return job;
}
export async function updateJob(id: string, patch: Partial<IJob>): Promise<IJob | null> {
    const db = await getDB();
    const job = await db.get('jobs', id);
    if (!job) return null;
    Object.assign(job, patch, { updatedAt: Date.now() });
    await db.put('jobs', job);
    return job;
}
export async function deleteJob(id: string): Promise<void> {
    const db = await getDB();
    const panels = await db.getAllFromIndex('panels', 'jobId', id);
    // deletePanel is defined below in the panels section; the source is
    // organised by entity so referencing forward is intentional.
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    await Promise.all(panels.map((p) => deletePanel(p.id)));
    await db.delete('checklistState', id);
    await db.delete('jobs', id);
}

// ======= Panels =======
export async function listPanels(jobId: string): Promise<IPanel[]> {
    const db = await getDB();
    const all = await db.getAllFromIndex('panels', 'jobId', jobId);
    return all.sort((a, b) => a.createdAt - b.createdAt);
}
export async function getPanel(id: string): Promise<IPanel | undefined> {
    const db = await getDB();
    return db.get('panels', id);
}

export interface ICreatePanelInput {
    jobId: string;
    name: string;
}
export async function createPanel({ jobId, name }: ICreatePanelInput): Promise<IPanel> {
    const db = await getDB();
    const panel: IPanel = {
        id: uid(),
        jobId,
        name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
    await db.put('panels', panel);
    return panel;
}
export async function updatePanel(id: string, patch: Partial<IPanel>): Promise<IPanel | null> {
    const db = await getDB();
    const panel = await db.get('panels', id);
    if (!panel) return null;
    Object.assign(panel, patch, { updatedAt: Date.now() });
    await db.put('panels', panel);
    return panel;
}
export async function deletePanel(id: string): Promise<void> {
    const db = await getDB();
    const [rows, photos, notes] = await Promise.all([
        db.getAllFromIndex('rows', 'panelId', id),
        db.getAllFromIndex('photos', 'panelId', id),
        db.getAllFromIndex('sheetNotes', 'panelId', id),
    ]);
    await Promise.all([
        ...rows.map((r) => db.delete('rows', r.id)),
        ...photos.map((p) => db.delete('photos', p.id)),
        ...notes.map((n) => db.delete('sheetNotes', n.id)),
    ]);
    await db.delete('panels', id);
}

export async function duplicatePanel(panelId: string, newName: string): Promise<IPanel | null> {
    const db = await getDB();
    const src = await db.get('panels', panelId);
    if (!src) return null;
    const dst = await createPanel({ jobId: src.jobId, name: newName });
    const [rows, notes] = await Promise.all([
        db.getAllFromIndex('rows', 'panelId', panelId),
        db.getAllFromIndex('sheetNotes', 'panelId', panelId),
    ]);
    await Promise.all(rows.map((r) => db.put('rows', {
        id: uid(),
        panelId: dst.id,
        sheet: r.sheet,
        idx: r.idx,
        data: { ...r.data },
        notes: r.notes || '',
        updatedAt: Date.now(),
    })));
    await Promise.all(notes.map((n) => db.put('sheetNotes', {
        id: uid(),
        panelId: dst.id,
        sheet: n.sheet,
        text: n.text,
        updatedAt: Date.now(),
    })));
    return dst;
}

// ======= Rows =======
export async function listRows(panelId: string, sheet: string): Promise<IRow[]> {
    const db = await getDB();
    const all = await db.getAllFromIndex('rows', 'panelId_sheet', [panelId, sheet]);
    return all.sort((a, b) => a.idx - b.idx);
}
export async function listAllRows(panelId: string): Promise<IRow[]> {
    const db = await getDB();
    return db.getAllFromIndex('rows', 'panelId', panelId);
}
export async function getRow(id: string): Promise<IRow | undefined> {
    const db = await getDB();
    return db.get('rows', id);
}

export interface ICreateRowInput {
    panelId: string;
    sheet: string;
    data?: RowData;
    notes?: string;
}
export async function createRow({
    panelId,
    sheet,
    data = {},
    notes = '',
}: ICreateRowInput): Promise<IRow> {
    const db = await getDB();
    const existing = await db.getAllFromIndex('rows', 'panelId_sheet', [panelId, sheet]);
    const row: IRow = {
        id: uid(),
        panelId,
        sheet,
        idx: existing.length,
        data,
        notes,
        updatedAt: Date.now(),
    };
    await db.put('rows', row);
    return row;
}

export interface IUpdateRowPatch {
    data?: RowData;
    notes?: string;
}
export async function updateRow(id: string, patch: IUpdateRowPatch): Promise<IRow | null> {
    const db = await getDB();
    const row = await db.get('rows', id);
    if (!row) return null;
    if (patch.data) row.data = { ...row.data, ...patch.data };
    if (patch.notes !== undefined) row.notes = patch.notes;
    row.updatedAt = Date.now();
    await db.put('rows', row);
    return row;
}
export async function deleteRow(id: string): Promise<void> {
    const db = await getDB();
    const photos = await db.getAllFromIndex('photos', 'rowId', id);
    await Promise.all(photos.map((p) => db.delete('photos', p.id)));
    await db.delete('rows', id);
}
export async function reorderRow(id: string, direction: number): Promise<void> {
    const db = await getDB();
    const row = await db.get('rows', id);
    if (!row) return;
    const siblings = (await db.getAllFromIndex('rows', 'panelId_sheet', [row.panelId, row.sheet]))
        .sort((x, y) => x.idx - y.idx);
    const i = siblings.findIndex((r) => r.id === id);
    const j = i + direction;
    if (j < 0 || j >= siblings.length) return;
    const a = siblings[i];
    const b = siblings[j];
    if (!a || !b) return;
    const tmp = a.idx;
    a.idx = b.idx;
    b.idx = tmp;
    await db.put('rows', a);
    await db.put('rows', b);
}

// ======= Sheet-level Notes =======
export async function getSheetNotes(panelId: string, sheet: string): Promise<string> {
    const db = await getDB();
    const items = await db.getAllFromIndex('sheetNotes', 'panelId_sheet', [panelId, sheet]);
    return items[0]?.text || '';
}
export async function setSheetNotes(panelId: string, sheet: string, text: string): Promise<void> {
    const db = await getDB();
    const items = await db.getAllFromIndex('sheetNotes', 'panelId_sheet', [panelId, sheet]);
    const first = items[0];
    if (first) {
        first.text = text;
        first.updatedAt = Date.now();
        await db.put('sheetNotes', first);
    } else {
        await db.put('sheetNotes', {
            id: uid(),
            panelId,
            sheet,
            text,
            updatedAt: Date.now(),
        });
    }
}

// ======= Photos =======
export async function listPhotos(panelId: string, sheet: string, item: string): Promise<IPhoto[]> {
    const db = await getDB();
    const all = await db.getAllFromIndex('photos', 'panelId_sheet_item', [panelId, sheet, item]);
    return all.filter((p) => !p.rowId).sort((a, b) => a.takenAt - b.takenAt);
}
export async function listRowPhotos(rowId: string): Promise<IPhoto[]> {
    const db = await getDB();
    const all = await db.getAllFromIndex('photos', 'rowId', rowId);
    return all.sort((a, b) => a.takenAt - b.takenAt);
}
export async function listPanelPhotos(panelId: string): Promise<IPhoto[]> {
    const db = await getDB();
    return db.getAllFromIndex('photos', 'panelId', panelId);
}

export interface IAddPhotoInput {
    panelId: string;
    sheet: string;
    item: string;
    rowId?: string | null;
    blob: Blob;
    mime?: string;
    w: number;
    h: number;
    gps?: IPhotoGps | null;
    takenAt?: number | null;
}
export async function addPhoto({
    panelId,
    sheet,
    item,
    rowId = null,
    blob,
    mime = 'image/jpeg',
    w,
    h,
    gps = null,
    takenAt = null,
}: IAddPhotoInput): Promise<IPhoto> {
    const db = await getDB();
    const photo: IPhoto = {
        id: uid(),
        panelId,
        sheet,
        item,
        rowId,
        blob,
        mime,
        takenAt: takenAt ?? Date.now(),
        w,
        h,
        gps,
    };
    await db.put('photos', photo);
    return photo;
}
export async function deletePhoto(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('photos', id);
}

// ======= Estimates =======
export interface IJobSizeEstimate {
    panels: number;
    rows: number;
    photos: number;
    bytes: number;
}
export async function getJobSizeEstimate(jobId: string): Promise<IJobSizeEstimate> {
    const db = await getDB();
    const panels = await db.getAllFromIndex('panels', 'jobId', jobId);
    const perPanel = await Promise.all(panels.map(async (p) => {
        const [photos, rows] = await Promise.all([
            db.getAllFromIndex('photos', 'panelId', p.id),
            db.getAllFromIndex('rows', 'panelId', p.id),
        ]);
        const bytes = photos.reduce((sum, ph) => sum + (ph.blob?.size || 0), 0);
        return {
            photoCount: photos.length, byteCount: bytes, rowCount: rows.length
        };
    }));
    const photoCount = perPanel.reduce((s, x) => s + x.photoCount, 0);
    const byteCount = perPanel.reduce((s, x) => s + x.byteCount, 0);
    const rowCount = perPanel.reduce((s, x) => s + x.rowCount, 0);
    return {
        panels: panels.length, rows: rowCount, photos: photoCount, bytes: byteCount,
    };
}

// ======= Checklist State =======

// Slug used as the stable taskId for manual tasks. Mirrors the canonical
// label list defined in src/lib/metrics.ts — keep them in sync.
export function slugifyTaskLabel(label: string): string {
    return String(label || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

const DEFAULT_CHECKLIST_STATE = (): { manualTasks: Record<string, boolean>; customTasks: IChecklistCustomTask[] } => ({
    manualTasks: {},
    customTasks: [],
});

export async function getChecklistState(jobId: string): Promise<IChecklistState> {
    const db = await getDB();
    const rec = await db.get('checklistState', jobId);
    if (!rec) return { jobId, ...DEFAULT_CHECKLIST_STATE() };
    return {
        jobId,
        manualTasks: rec.manualTasks || {},
        customTasks: Array.isArray(rec.customTasks) ? rec.customTasks : [],
    };
}

export async function setChecklistState(
    jobId: string,
    state: Pick<IChecklistState, 'manualTasks' | 'customTasks'>,
): Promise<void> {
    const db = await getDB();
    await db.put('checklistState', {
        jobId,
        manualTasks: state.manualTasks || {},
        customTasks: state.customTasks || [],
    });
}

export async function setManualTaskCompleted(
    jobId: string,
    taskId: string,
    completed: boolean,
): Promise<IChecklistState> {
    const state = await getChecklistState(jobId);
    state.manualTasks = { ...state.manualTasks, [taskId]: !!completed };
    await setChecklistState(jobId, state);
    return state;
}

export async function addCustomTask(jobId: string, label: string): Promise<IChecklistCustomTask> {
    const trimmed = String(label || '').trim();
    if (!trimmed) throw new Error('Task label is required');
    const state = await getChecklistState(jobId);
    const task: IChecklistCustomTask = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        label: trimmed,
        completed: false,
        createdAt: Date.now(),
    };
    state.customTasks = [...state.customTasks, task];
    await setChecklistState(jobId, state);
    return task;
}

export async function renameCustomTask(jobId: string, taskId: string, label: string): Promise<void> {
    const trimmed = String(label || '').trim();
    if (!trimmed) throw new Error('Task label is required');
    const state = await getChecklistState(jobId);
    state.customTasks = state.customTasks.map((t) => (
        t.id === taskId ? { ...t, label: trimmed } : t
    ));
    await setChecklistState(jobId, state);
}

export async function setCustomTaskCompleted(
    jobId: string,
    taskId: string,
    completed: boolean,
): Promise<void> {
    const state = await getChecklistState(jobId);
    state.customTasks = state.customTasks.map((t) => (
        t.id === taskId ? { ...t, completed: !!completed } : t
    ));
    await setChecklistState(jobId, state);
}

export async function deleteCustomTask(jobId: string, taskId: string): Promise<void> {
    const state = await getChecklistState(jobId);
    state.customTasks = state.customTasks.filter((t) => t.id !== taskId);
    await setChecklistState(jobId, state);
}

// ======= Backup / Restore =======
async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = (): void => {
            const s = r.result;
            if (typeof s !== 'string') {
                resolve('');
                return;
            }
            const i = s.indexOf(',');
            resolve(i >= 0 ? s.slice(i + 1) : s);
        };
        r.onerror = (): void => reject(r.error);
        r.readAsDataURL(blob);
    });
}

function base64ToBlob(b64: string, mime: string = 'image/jpeg'): Blob {
    const bin = atob(b64);
    const arr = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return new Blob([arr], { type: mime });
}

const BACKUP_VERSION = 1;

// Serialized photo: same as IPhoto except blob has been base64-encoded.
export interface ISerializedPhoto extends Omit<IPhoto, 'blob'> {
    blob: string;
}

export interface IBackupSnapshot {
    backupVersion: number;
    exportedAt: number;
    jobs: IJob[];
    panels: IPanel[];
    rows: IRow[];
    sheetNotes: ISheetNote[];
    checklistState: IChecklistState[];
    photos: ISerializedPhoto[];
}

export async function exportAllJSON(): Promise<IBackupSnapshot> {
    const db = await getDB();
    const jobs = await db.getAll('jobs');
    const panels = await db.getAll('panels');
    const rows = await db.getAll('rows');
    const sheetNotes = await db.getAll('sheetNotes');
    const checklistState = await db.getAll('checklistState');
    const photoRecs = await db.getAll('photos');
    const photos: ISerializedPhoto[] = await Promise.all(
        photoRecs.map(async (p) => ({ ...p, blob: await blobToBase64(p.blob) })),
    );
    return {
        backupVersion: BACKUP_VERSION,
        exportedAt: Date.now(),
        jobs,
        panels,
        rows,
        sheetNotes,
        checklistState,
        photos,
    };
}

export async function exportJobJSON(jobId: string): Promise<IBackupSnapshot> {
    const db = await getDB();
    const job = await db.get('jobs', jobId);
    if (!job) throw new Error('Job not found');
    const panels = await db.getAllFromIndex('panels', 'jobId', jobId);
    const perPanel = await Promise.all(panels.map(async (p) => {
        const [r, n, ph] = await Promise.all([
            db.getAllFromIndex('rows', 'panelId', p.id),
            db.getAllFromIndex('sheetNotes', 'panelId', p.id),
            db.getAllFromIndex('photos', 'panelId', p.id),
        ]);
        const serializedPhotos = await Promise.all(
            ph.map(async (photo) => ({ ...photo, blob: await blobToBase64(photo.blob) })),
        );
        return {
            rows: r, notes: n, photos: serializedPhotos
        };
    }));
    const rowsAll: IRow[] = perPanel.flatMap((x) => x.rows);
    const sheetNotesAll: ISheetNote[] = perPanel.flatMap((x) => x.notes);
    const photosAll: ISerializedPhoto[] = perPanel.flatMap((x) => x.photos);
    const clRec = await db.get('checklistState', jobId);
    const checklistState: IChecklistState[] = clRec ? [clRec] : [];
    return {
        backupVersion: BACKUP_VERSION,
        exportedAt: Date.now(),
        jobs: [job],
        panels,
        rows: rowsAll,
        sheetNotes: sheetNotesAll,
        checklistState,
        photos: photosAll,
    };
}

async function deleteExistingJobs(db: EoicDB, jobs: IJob[]): Promise<void> {
    await Promise.all(jobs.map(async (j) => {
        const existing = await db.get('jobs', j.id);
        if (existing) await deleteJob(j.id);
    }));
}

export type ImportMode = 'merge' | 'replace';

export interface IImportStats {
    jobs: number;
    panels: number;
    rows: number;
    photos: number;
}

type ImportTx = IDBPTransaction<
    IEoicDBSchema,
    Array<'jobs' | 'panels' | 'rows' | 'sheetNotes' | 'checklistState' | 'photos'>,
    'readwrite'
>;

// Issues all the "get; if missing or replace then put" requests against the
// same IDB transaction. Returning a single Promise.all keeps every request
// in flight on `tx` without inserting non-IDB microtasks — that would
// auto-commit the tx mid-flight. See restoreJobRaw for the same invariant.
async function putAllIfMissingOrReplace<
    Name extends 'jobs' | 'panels' | 'rows' | 'sheetNotes' | 'checklistState' | 'photos',
>(
    tx: ImportTx,
    store: Name,
    items: ReadonlyArray<IEoicDBSchema[Name]['value']>,
    keyOf: (item: IEoicDBSchema[Name]['value']) => string,
    mode: ImportMode,
    mapValue: (item: IEoicDBSchema[Name]['value']) => IEoicDBSchema[Name]['value'] = (x) => x,
): Promise<void> {
    if (items.length === 0) return;
    const objectStore = tx.objectStore(store);
    // Fan out all gets synchronously so they share the same idb microtask
    // realm; awaiting them serially (or interleaving each get/put inside a
    // separate async closure) can let the tx auto-commit between requests.
    const existingResults = await Promise.all(
        items.map((item) => objectStore.get(keyOf(item))),
    );
    // Synchronously issue every needed put before any await — keeps the tx
    // alive across them. Matches the invariant used in restoreJobRaw /
    // restorePanelRaw.
    const putPromises = items
        .map((item, i) => (
            !existingResults[i] || mode === 'replace'
                ? objectStore.put(mapValue(item))
                : null
        ))
        .filter((p): p is ReturnType<typeof objectStore.put> => p !== null);
    if (putPromises.length > 0) {
        await Promise.all(putPromises);
    }
}

export async function importJSON(
    snapshot: IBackupSnapshot,
    { mode = 'merge' }: { mode?: ImportMode } = {},
): Promise<IImportStats> {
    if (!snapshot || snapshot.backupVersion !== BACKUP_VERSION) {
        throw new Error('Backup file format is not compatible with this app version.');
    }
    const db = await getDB();

    if (mode === 'replace') {
        await deleteExistingJobs(db, snapshot.jobs);
    }

    const tx: ImportTx = db.transaction(
        ['jobs', 'panels', 'rows', 'sheetNotes', 'checklistState', 'photos'],
        'readwrite',
    );
    await Promise.all([
        putAllIfMissingOrReplace(tx, 'jobs', snapshot.jobs, (j) => j.id, mode),
        putAllIfMissingOrReplace(tx, 'panels', snapshot.panels, (p) => p.id, mode),
        putAllIfMissingOrReplace(tx, 'rows', snapshot.rows, (r) => r.id, mode),
        putAllIfMissingOrReplace(
            tx,
            'sheetNotes',
            snapshot.sheetNotes || [],
            (n) => n.id,
            mode,
        ),
        putAllIfMissingOrReplace(
            tx,
            'checklistState',
            snapshot.checklistState || [],
            (cl) => cl.jobId,
            mode,
        ),
        putAllIfMissingOrReplace(
            tx,
            'photos',
            snapshot.photos.map((photo): IPhoto => ({
                ...photo,
                blob: base64ToBlob(photo.blob, photo.mime || 'image/jpeg'),
            })),
            (p) => p.id,
            mode,
        ),
    ]);
    await tx.done;
    return {
        jobs: snapshot.jobs.length,
        panels: snapshot.panels.length,
        rows: snapshot.rows.length,
        photos: snapshot.photos.length,
    };
}

// ======= Raw snapshots (for undo toasts) =======
// These keep photo blobs as Blob references — no base64 round-trip.
// Snapshots are in-memory only; never serialized to disk. Use them
// for short-lived undo state where the user might restore within
// seconds. For long-term backup, use exportJobJSON / importJSON.

export interface IPanelRawSnapshot {
    panel: IPanel;
    rows: IRow[];
    photos: IPhoto[];
    notes: ISheetNote[];
}

export interface IJobRawSnapshot {
    job: IJob;
    panelSnaps: IPanelRawSnapshot[];
    checklist: IChecklistState | null;
}

export async function exportPanelRaw(panelId: string): Promise<IPanelRawSnapshot> {
    const db = await getDB();
    const panel = await db.get('panels', panelId);
    if (!panel) throw new Error('Panel not found');
    const [rows, photos, notes] = await Promise.all([
        db.getAllFromIndex('rows', 'panelId', panelId),
        db.getAllFromIndex('photos', 'panelId', panelId),
        db.getAllFromIndex('sheetNotes', 'panelId', panelId),
    ]);
    return {
        panel, rows, photos, notes
    };
}

export async function restorePanelRaw(snap: IPanelRawSnapshot): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(['panels', 'rows', 'photos', 'sheetNotes'], 'readwrite');
    // All puts are kicked off synchronously against `tx` so no non-IDB
    // microtask can interleave and auto-commit the transaction before
    // tx.done resolves.
    await Promise.all([
        tx.objectStore('panels').put(snap.panel),
        ...snap.rows.map((r) => tx.objectStore('rows').put(r)),
        ...snap.photos.map((p) => tx.objectStore('photos').put(p)),
        ...snap.notes.map((n) => tx.objectStore('sheetNotes').put(n)),
    ]);
    await tx.done;
}

export async function exportJobRaw(jobId: string): Promise<IJobRawSnapshot> {
    const db = await getDB();
    const job = await db.get('jobs', jobId);
    if (!job) throw new Error('Job not found');
    const panels = await db.getAllFromIndex('panels', 'jobId', jobId);
    const panelSnaps = await Promise.all(panels.map((p) => exportPanelRaw(p.id)));
    const checklist = await db.get('checklistState', jobId);
    return {
        job, panelSnaps, checklist: checklist || null
    };
}

export async function restoreJobRaw(snap: IJobRawSnapshot): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(
        ['jobs', 'panels', 'rows', 'photos', 'sheetNotes', 'checklistState'],
        'readwrite',
    );
    // All puts are issued synchronously against `tx` so the transaction
    // stays open: IDB requests resolve from a success event without
    // interleaving any non-IDB microtask that would auto-commit it.
    const panelPuts = snap.panelSnaps.flatMap((ps) => [
        tx.objectStore('panels').put(ps.panel),
        ...ps.rows.map((r) => tx.objectStore('rows').put(r)),
        ...ps.photos.map((p) => tx.objectStore('photos').put(p)),
        ...ps.notes.map((n) => tx.objectStore('sheetNotes').put(n)),
    ]);
    const tail: Array<Promise<unknown>> = [tx.objectStore('jobs').put(snap.job), ...panelPuts];
    if (snap.checklist) tail.push(tx.objectStore('checklistState').put(snap.checklist));
    await Promise.all(tail);
    await tx.done;
}
