// xlsxRoundTrip.ts — orchestrates writing a parsed xlsx into IndexedDB.
//
// Two entry points:
//   applyParsedXlsxToNewJob(parsed, meta)  → creates a fresh job + everything
//   applyResyncToJob(jobId, parsed, diff, decisions) → mutates an existing job
//
// Both run in single idb transactions so a failure leaves no partial state.

import type { IDBPObjectStore, IDBPTransaction } from 'idb';

import { getDB } from '../db';
import type { IEoicDBSchema } from '../types/db';
import type {IJob, IJobSource, IPhoto, IRow, ISheetNote,} from '../types/job';
import type {IJobDiff, IParsedRow, IParsedSheetNote, IParsedXlsx, IResyncDecisions, ISheetRowDiff,} from '../types/xlsx';

type NewJobTx = IDBPTransaction<
    IEoicDBSchema,
    Array<'jobs' | 'panels' | 'rows' | 'sheetNotes'>,
    'readwrite'
>;
type ResyncTx = IDBPTransaction<
    IEoicDBSchema,
    Array<'jobs' | 'panels' | 'rows' | 'sheetNotes' | 'photos'>,
    'readwrite'
>;

type RowsStore<TTx extends NewJobTx | ResyncTx> = IDBPObjectStore<
    IEoicDBSchema, ArrayLike<'jobs' | 'panels' | 'rows' | 'sheetNotes' | 'photos'>,
    'rows', TTx['mode']
>;
type SheetNotesStore<TTx extends NewJobTx | ResyncTx> = IDBPObjectStore<
    IEoicDBSchema, ArrayLike<'jobs' | 'panels' | 'rows' | 'sheetNotes' | 'photos'>,
    'sheetNotes', TTx['mode']
>;
type PhotosStore = IDBPObjectStore<
    IEoicDBSchema, ArrayLike<'jobs' | 'panels' | 'rows' | 'sheetNotes' | 'photos'>,
    'photos', 'readwrite'
>;

export interface INewJobMeta {
    name: string;
    client?: string;
    location?: string;
    source?: IJobSource | null;
}

const uid = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function writeSheetRows(
    rowsStore: RowsStore<NewJobTx>,
    sheetName: string,
    rows: IParsedRow[],
    panelIdByName: Map<string, string>,
    now: number,
): Promise<void> {
    const indexInPanel = new Map<string, number>();
    const putPromises: Array<Promise<string>> = [];
    rows.forEach((r) => {
        if (r.panelName == null) return;
        const panelId = panelIdByName.get(r.panelName);
        if (!panelId) return; // unknown-panel-reference rows already warned by parser
        const key = `${panelId}|${sheetName}`;
        const idx = indexInPanel.get(key) ?? 0;
        indexInPanel.set(key, idx + 1);
        putPromises.push(rowsStore.put({
            id: uid(),
            panelId,
            sheet: sheetName,
            idx,
            data: r.data,
            notes: r.notes || '',
            updatedAt: now,
        }));
    });
    if (putPromises.length > 0) await Promise.all(putPromises);
}

export async function applyParsedXlsxToNewJob(
    parsed: IParsedXlsx,
    meta: INewJobMeta,
): Promise<string> {
    const db = await getDB();
    const tx: NewJobTx = db.transaction(['jobs', 'panels', 'rows', 'sheetNotes'], 'readwrite');

    const now = Date.now();
    const jobId = uid();
    const job: IJob = {
        id: jobId,
        name: meta.name,
        client: meta.client || '',
        location: meta.location || '',
        notes: parsed.jobMeta.notes || '',
        source: meta.source ?? null,
        createdAt: now,
        updatedAt: now,
    };
    const jobsPut = tx.objectStore('jobs').put(job);

    // Panels — by name from parsed.panels
    const panelsStore = tx.objectStore('panels');
    const panelIdByName = new Map<string, string>();
    const panelPuts = parsed.panels.map((p) => {
        const id = uid();
        panelIdByName.set(p.name, id);
        return panelsStore.put({
            id,
            jobId,
            name: p.name,
            createdAt: now,
            updatedAt: now,
        });
    });
    await Promise.all([jobsPut, ...panelPuts]);

    // Rows — group by panelName, write in xlsx order.
    // Sequenced per-sheet so indexInPanel counters don't interleave across
    // sheets; each sheet's puts still fan out internally inside writeSheetRows.
    const rowsStore = tx.objectStore('rows');
    const sheetNames = Object.keys(parsed.rowsBySheet);
    await sheetNames.reduce<Promise<void>>(
        (acc, sheetName) => acc.then(() => writeSheetRows(rowsStore, sheetName, parsed.rowsBySheet[sheetName] ?? [], panelIdByName, now,)),
        Promise.resolve(),
    );

    // Sheet notes
    const notesStore = tx.objectStore('sheetNotes');
    const notesPuts: Array<Promise<string>> = [];
    parsed.sheetNotes.forEach((n) => {
        const panelId = panelIdByName.get(n.panelName);
        if (!panelId) return;
        notesPuts.push(notesStore.put({
            id: uid(),
            panelId,
            sheet: n.sheetName,
            text: n.text,
            updatedAt: now,
        }));
    });
    if (notesPuts.length > 0) await Promise.all(notesPuts);

    await tx.done;
    return jobId;
}

async function applyRemovedRows(
    rowsStore: RowsStore<ResyncTx>,
    photosStore: PhotosStore,
    removed: IRow[],
    removedRowIds: Set<string>,
    now: number,
): Promise<void> {
    const acceptedRemovals = removed.filter((r) => removedRowIds.has(r.id));
    if (acceptedRemovals.length === 0) return;
    // Fan out photo lookups for accepted removals so the tx stays alive.
    const photosLists = await Promise.all(
        acceptedRemovals.map((r) => photosStore.index('rowId').getAll(r.id)),
    );
    const photoPuts = photosLists.flat().map((ph) => {
        // IPhoto has no updatedAt field, but the legacy JS wrote one through.
        // Preserve that runtime behavior verbatim — exporter doesn't read it
        // and idb structured-clones the extra prop harmlessly.
        const detached: IPhoto & { updatedAt?: number } = {
            ...ph,
            rowId: null,
            updatedAt: now,
        };
        return photosStore.put(detached);
    });
    const rowDeletes = acceptedRemovals.map((r) => rowsStore.delete(r.id));
    await Promise.all([...photoPuts, ...rowDeletes]);
}

function applyModifiedRows(
    rowsStore: RowsStore<ResyncTx>,
    modified: ISheetRowDiff['modified'],
    now: number,
): Promise<string[]> {
    if (modified.length === 0) return Promise.resolve([]);
    return Promise.all(modified.map((m) => {
        const { local } = m;
        local.data = { ...m.xlsx.data };
        local.notes = m.xlsx.notes || '';
        local.updatedAt = now;
        return rowsStore.put(local);
    }));
}

async function applyAddedRows(
    rowsStore: RowsStore<ResyncTx>,
    sheetName: string,
    added: IParsedRow[],
    panelIdByName: Map<string, string>,
    now: number,
): Promise<void> {
    const candidates = added.filter((xr) => xr.panelName != null && panelIdByName.has(xr.panelName));
    if (candidates.length === 0) return;
    // Fan out the index lookups, then synchronously issue all puts.
    const existingLists = await Promise.all(
        candidates.map((xr) => rowsStore
            .index('panelId_sheet')
            .getAll([panelIdByName.get(xr.panelName!)!, sheetName])),
    );
    const idxCounter = new Map<string, number>();
    candidates.forEach((xr, i) => {
        const panelId = panelIdByName.get(xr.panelName!)!;
        idxCounter.set(panelId, Math.max(idxCounter.get(panelId) ?? 0, existingLists[i]!.length));
    });
    const puts = candidates.map((xr) => {
        const panelId = panelIdByName.get(xr.panelName!)!;
        const idx = idxCounter.get(panelId)!;
        idxCounter.set(panelId, idx + 1);
        return rowsStore.put({
            id: uid(),
            panelId,
            sheet: sheetName,
            idx,
            data: { ...xr.data },
            notes: xr.notes || '',
            updatedAt: now,
        });
    });
    await Promise.all(puts);
}

async function applySheetNotesAdded(
    notesStore: SheetNotesStore<ResyncTx>,
    added: IParsedSheetNote[],
    panelIdByName: Map<string, string>,
    now: number,
): Promise<void> {
    const puts: Array<Promise<string>> = [];
    added.forEach((an) => {
        const panelId = panelIdByName.get(an.panelName);
        if (!panelId) return;
        puts.push(notesStore.put({
            id: uid(),
            panelId,
            sheet: an.sheetName,
            text: an.text,
            updatedAt: now,
        }));
    });
    if (puts.length > 0) await Promise.all(puts);
}

async function applySheetNotesModified(
    notesStore: SheetNotesStore<ResyncTx>,
    modified: IJobDiff['sheetNotes']['modified'],
    panelIdByName: Map<string, string>,
    now: number,
): Promise<void> {
    const candidates = modified.filter((mn) => panelIdByName.has(mn.panelName));
    if (candidates.length === 0) return;
    const existings = await Promise.all(
        candidates.map((mn) => notesStore
            .index('panelId_sheet')
            .get([panelIdByName.get(mn.panelName)!, mn.sheetName])),
    );
    const puts: Array<Promise<string>> = [];
    existings.forEach((existing, i) => {
        if (!existing) return;
        const updated: ISheetNote = {
            ...existing,
            text: candidates[i]!.new,
            updatedAt: now,
        };
        puts.push(notesStore.put(updated));
    });
    if (puts.length > 0) await Promise.all(puts);
}

async function applySheetNotesRemoved(
    notesStore: SheetNotesStore<ResyncTx>,
    removed: IJobDiff['sheetNotes']['removed'],
    panelIdByName: Map<string, string>,
): Promise<void> {
    const candidates = removed.filter((rn) => panelIdByName.has(rn.panelName));
    if (candidates.length === 0) return;
    const existings = await Promise.all(
        candidates.map((rn) => notesStore
            .index('panelId_sheet')
            .get([panelIdByName.get(rn.panelName)!, rn.sheetName])),
    );
    const deletes: Array<Promise<void>> = [];
    existings.forEach((existing) => {
        if (existing) deletes.push(notesStore.delete(existing.id));
    });
    if (deletes.length > 0) await Promise.all(deletes);
}

export async function applyResyncToJob(
    jobId: string,
    parsed: IParsedXlsx,
    diff: IJobDiff,
    decisions: IResyncDecisions | null | undefined,
): Promise<{ ok: true }> {
    const db = await getDB();
    const tx: ResyncTx = db.transaction(
        ['jobs', 'panels', 'rows', 'sheetNotes', 'photos'],
        'readwrite',
    );

    const now = Date.now();
    const job = await tx.objectStore('jobs').get(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    // 1. Job-meta updates
    diff.jobMeta.changed.forEach((c) => {
        if (c.field === 'name' && parsed.jobMeta.name != null) job.name = parsed.jobMeta.name;
        if (c.field === 'notes') job.notes = parsed.jobMeta.notes || '';
    });
    if (job.source) job.source = { ...job.source, pulledAt: now };
    job.updatedAt = now;
    const jobPut = tx.objectStore('jobs').put(job);

    // 2. Panels — add new ones referenced by xlsx
    const panelsStore = tx.objectStore('panels');
    const allPanels = await panelsStore.index('jobId').getAll(jobId);
    const panelIdByName = new Map<string, string>(allPanels.map((p) => [p.name, p.id]));
    const panelPuts: Array<Promise<string>> = [];
    diff.panels.added.forEach((xp) => {
        if (panelIdByName.has(xp.name)) return;
        const id = uid();
        panelIdByName.set(xp.name, id);
        panelPuts.push(panelsStore.put({
            id, jobId, name: xp.name, createdAt: now, updatedAt: now,
        }));
    });
    await Promise.all([jobPut, ...panelPuts]);
    // Removed panels are NOT auto-deleted — too dangerous; the user controls
    // panel deletion explicitly. Their rows still get processed as 'removed'
    // below if the user accepted the row removals.

    // 3. Apply per-sheet row diffs
    const rowsStore = tx.objectStore('rows');
    const photosStore = tx.objectStore('photos');
    const removedRowIds: Set<string> = decisions?.removedRowIds ?? new Set<string>();

    // Sheets are processed sequentially so the tx stays focused on one
    // (panel, sheet) idx-counter universe at a time.
    const sheetNames = Object.keys(diff.sheets);
    await sheetNames.reduce<Promise<void>>(
        (acc, sheetName) => acc.then(async () => {
            const sd = diff.sheets[sheetName]!;
            await applyRemovedRows(rowsStore, photosStore, sd.removed, removedRowIds, now);
            await applyModifiedRows(rowsStore, sd.modified, now);
            await applyAddedRows(rowsStore, sheetName, sd.added, panelIdByName, now);
        }),
        Promise.resolve(),
    );

    // 4. Sheet notes diff
    const notesStore = tx.objectStore('sheetNotes');
    await applySheetNotesAdded(notesStore, diff.sheetNotes.added, panelIdByName, now);
    await applySheetNotesModified(notesStore, diff.sheetNotes.modified, panelIdByName, now);
    await applySheetNotesRemoved(notesStore, diff.sheetNotes.removed, panelIdByName);

    await tx.done;
    return { ok: true };
}
