// db.js — IndexedDB persistence (v4)
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

// NOTE: DB_NAME is intentionally NOT renamed when the app was rebranded to
// e-OIC. Renaming the IndexedDB would orphan every job, panel, photo, and
// note already stored on installed devices. The internal name stays.
const DB_NAME = 'onsite-investigation';
const DB_VERSION = 4;

let dbPromise = null;

function initialSchema(db) {
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

function ensurePhotosRowIdIndex(db, tx) {
  if (!db.objectStoreNames.contains('photos')) return;
  const photos = tx.objectStore('photos');
  if (!photos.indexNames.contains('rowId')) {
    photos.createIndex('rowId', 'rowId');
  }
}

function upgradeToV2(db, tx) {
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

function upgradeToV3(db) {
  if (!db.objectStoreNames.contains('checklistState')) {
    db.createObjectStore('checklistState', { keyPath: 'jobId' });
  }
}

function upgradeToV4(db, tx) {
  // v4: photos store now holds *original* (un-overlaid) blobs. Live overlay
  // is rendered in the UI; export bakes at write time. Existing baked photos
  // cannot be recovered to originals, so we wipe the store. Job / panel /
  // row data is untouched.
  if (db.objectStoreNames.contains('photos')) {
    tx.objectStore('photos').clear();
  }
}

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, tx) {
        if (oldVersion < 1) initialSchema(db);
        if (oldVersion < 2) upgradeToV2(db, tx);
        if (oldVersion < 3) upgradeToV3(db);
        if (oldVersion < 4) upgradeToV4(db, tx);
      },
    });
  }
  return dbPromise;
}

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ======= Settings =======
export async function getSetting(key, fallback = null) {
  const db = await getDB();
  const v = await db.get('settings', key);
  return v ? v.value : fallback;
}
export async function setSetting(key, value) {
  const db = await getDB();
  await db.put('settings', { key, value });
}

// ======= Jobs =======
export async function listJobs() {
  const db = await getDB();
  const all = await db.getAll('jobs');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function getJob(id) {
  const db = await getDB();
  return db.get('jobs', id);
}
export async function createJob({ name, client = '', location = '', notes = '', source = null }) {
  const db = await getDB();
  const job = {
    id: uid(),
    name, client, location, notes,
    source,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await db.put('jobs', job);
  return job;
}
export async function updateJob(id, patch) {
  const db = await getDB();
  const job = await db.get('jobs', id);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: Date.now() });
  await db.put('jobs', job);
  return job;
}
export async function deleteJob(id) {
  const db = await getDB();
  const panels = await db.getAllFromIndex('panels', 'jobId', id);
  for (const p of panels) await deletePanel(p.id);
  await db.delete('checklistState', id);
  await db.delete('jobs', id);
}

// ======= Panels =======
export async function listPanels(jobId) {
  const db = await getDB();
  const all = await db.getAllFromIndex('panels', 'jobId', jobId);
  return all.sort((a, b) => a.createdAt - b.createdAt);
}
export async function getPanel(id) {
  const db = await getDB();
  return db.get('panels', id);
}
export async function createPanel({ jobId, name }) {
  const db = await getDB();
  const panel = { id: uid(), jobId, name, createdAt: Date.now(), updatedAt: Date.now() };
  await db.put('panels', panel);
  return panel;
}
export async function updatePanel(id, patch) {
  const db = await getDB();
  const panel = await db.get('panels', id);
  if (!panel) return null;
  Object.assign(panel, patch, { updatedAt: Date.now() });
  await db.put('panels', panel);
  return panel;
}
export async function deletePanel(id) {
  const db = await getDB();
  const rows = await db.getAllFromIndex('rows', 'panelId', id);
  for (const r of rows) await db.delete('rows', r.id);
  const photos = await db.getAllFromIndex('photos', 'panelId', id);
  for (const p of photos) await db.delete('photos', p.id);
  const notes = await db.getAllFromIndex('sheetNotes', 'panelId', id);
  for (const n of notes) await db.delete('sheetNotes', n.id);
  await db.delete('panels', id);
}

export async function duplicatePanel(panelId, newName) {
  const db = await getDB();
  const src = await db.get('panels', panelId);
  if (!src) return null;
  const dst = await createPanel({ jobId: src.jobId, name: newName });
  const rows = await db.getAllFromIndex('rows', 'panelId', panelId);
  for (const r of rows) {
    await db.put('rows', {
      id: uid(),
      panelId: dst.id,
      sheet: r.sheet,
      idx: r.idx,
      data: { ...r.data },
      notes: r.notes || '',
      updatedAt: Date.now(),
    });
  }
  const notes = await db.getAllFromIndex('sheetNotes', 'panelId', panelId);
  for (const n of notes) {
    await db.put('sheetNotes', {
      id: uid(),
      panelId: dst.id,
      sheet: n.sheet,
      text: n.text,
      updatedAt: Date.now(),
    });
  }
  return dst;
}

// ======= Rows =======
export async function listRows(panelId, sheet) {
  const db = await getDB();
  const all = await db.getAllFromIndex('rows', 'panelId_sheet', [panelId, sheet]);
  return all.sort((a, b) => a.idx - b.idx);
}
export async function listAllRows(panelId) {
  const db = await getDB();
  return db.getAllFromIndex('rows', 'panelId', panelId);
}
export async function getRow(id) {
  const db = await getDB();
  return db.get('rows', id);
}
export async function createRow({ panelId, sheet, data = {}, notes = '' }) {
  const db = await getDB();
  const existing = await db.getAllFromIndex('rows', 'panelId_sheet', [panelId, sheet]);
  const row = {
    id: uid(),
    panelId, sheet,
    idx: existing.length,
    data, notes,
    updatedAt: Date.now(),
  };
  await db.put('rows', row);
  return row;
}
export async function updateRow(id, patch) {
  const db = await getDB();
  const row = await db.get('rows', id);
  if (!row) return null;
  if (patch.data) row.data = { ...row.data, ...patch.data };
  if (patch.notes !== undefined) row.notes = patch.notes;
  row.updatedAt = Date.now();
  await db.put('rows', row);
  return row;
}
export async function deleteRow(id) {
  const db = await getDB();
  const photos = await db.getAllFromIndex('photos', 'rowId', id);
  for (const p of photos) await db.delete('photos', p.id);
  await db.delete('rows', id);
}
export async function reorderRow(id, direction) {
  const db = await getDB();
  const row = await db.get('rows', id);
  if (!row) return;
  const siblings = (await db.getAllFromIndex('rows', 'panelId_sheet', [row.panelId, row.sheet]))
    .sort((a, b) => a.idx - b.idx);
  const i = siblings.findIndex((r) => r.id === id);
  const j = i + direction;
  if (j < 0 || j >= siblings.length) return;
  const a = siblings[i], b = siblings[j];
  const tmp = a.idx; a.idx = b.idx; b.idx = tmp;
  await db.put('rows', a);
  await db.put('rows', b);
}

// ======= Sheet-level Notes =======
export async function getSheetNotes(panelId, sheet) {
  const db = await getDB();
  const items = await db.getAllFromIndex('sheetNotes', 'panelId_sheet', [panelId, sheet]);
  return items[0]?.text || '';
}
export async function setSheetNotes(panelId, sheet, text) {
  const db = await getDB();
  const items = await db.getAllFromIndex('sheetNotes', 'panelId_sheet', [panelId, sheet]);
  if (items[0]) {
    items[0].text = text;
    items[0].updatedAt = Date.now();
    await db.put('sheetNotes', items[0]);
  } else {
    await db.put('sheetNotes', {
      id: uid(), panelId, sheet, text, updatedAt: Date.now(),
    });
  }
}

// ======= Photos =======
export async function listPhotos(panelId, sheet, item) {
  const db = await getDB();
  const all = await db.getAllFromIndex('photos', 'panelId_sheet_item', [panelId, sheet, item]);
  return all.filter((p) => !p.rowId).sort((a, b) => a.takenAt - b.takenAt);
}
export async function listRowPhotos(rowId) {
  const db = await getDB();
  const all = await db.getAllFromIndex('photos', 'rowId', rowId);
  return all.sort((a, b) => a.takenAt - b.takenAt);
}
export async function listPanelPhotos(panelId) {
  const db = await getDB();
  return db.getAllFromIndex('photos', 'panelId', panelId);
}
export async function addPhoto({
  panelId, sheet, item, rowId = null,
  blob, mime = 'image/jpeg',
  w, h, gps = null, takenAt = null,
}) {
  const db = await getDB();
  const photo = {
    id: uid(),
    panelId, sheet, item, rowId,
    blob, mime,
    takenAt: takenAt ?? Date.now(),
    w, h,
    gps,
  };
  await db.put('photos', photo);
  return photo;
}
export async function deletePhoto(id) {
  const db = await getDB();
  await db.delete('photos', id);
}

// ======= Estimates =======
export async function getJobSizeEstimate(jobId) {
  const db = await getDB();
  const panels = await db.getAllFromIndex('panels', 'jobId', jobId);
  let photoCount = 0, byteCount = 0, rowCount = 0;
  for (const p of panels) {
    const photos = await db.getAllFromIndex('photos', 'panelId', p.id);
    photoCount += photos.length;
    for (const ph of photos) byteCount += (ph.blob?.size || 0);
    const rows = await db.getAllFromIndex('rows', 'panelId', p.id);
    rowCount += rows.length;
  }
  return { panels: panels.length, rows: rowCount, photos: photoCount, bytes: byteCount };
}

// ======= Checklist State =======

// Slug used as the stable taskId for manual tasks. Mirrors the canonical
// label list defined in src/lib/metrics.js — keep them in sync.
export function slugifyTaskLabel(label) {
  return String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const DEFAULT_CHECKLIST_STATE = () => ({
  manualTasks: {},
  customTasks: [],
});

export async function getChecklistState(jobId) {
  const db = await getDB();
  const rec = await db.get('checklistState', jobId);
  if (!rec) return { jobId, ...DEFAULT_CHECKLIST_STATE() };
  return {
    jobId,
    manualTasks: rec.manualTasks || {},
    customTasks: Array.isArray(rec.customTasks) ? rec.customTasks : [],
  };
}

export async function setChecklistState(jobId, state) {
  const db = await getDB();
  await db.put('checklistState', {
    jobId,
    manualTasks: state.manualTasks || {},
    customTasks: state.customTasks || [],
  });
}

export async function setManualTaskCompleted(jobId, taskId, completed) {
  const state = await getChecklistState(jobId);
  state.manualTasks = { ...state.manualTasks, [taskId]: !!completed };
  await setChecklistState(jobId, state);
  return state;
}

export async function addCustomTask(jobId, label) {
  const trimmed = String(label || '').trim();
  if (!trimmed) throw new Error('Task label is required');
  const state = await getChecklistState(jobId);
  const task = {
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

export async function renameCustomTask(jobId, taskId, label) {
  const trimmed = String(label || '').trim();
  if (!trimmed) throw new Error('Task label is required');
  const state = await getChecklistState(jobId);
  state.customTasks = state.customTasks.map((t) =>
    t.id === taskId ? { ...t, label: trimmed } : t
  );
  await setChecklistState(jobId, state);
}

export async function setCustomTaskCompleted(jobId, taskId, completed) {
  const state = await getChecklistState(jobId);
  state.customTasks = state.customTasks.map((t) =>
    t.id === taskId ? { ...t, completed: !!completed } : t
  );
  await setChecklistState(jobId, state);
}

export async function deleteCustomTask(jobId, taskId) {
  const state = await getChecklistState(jobId);
  state.customTasks = state.customTasks.filter((t) => t.id !== taskId);
  await setChecklistState(jobId, state);
}

// ======= Backup / Restore =======
async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = r.result;
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(b64, mime = 'image/jpeg') {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

const BACKUP_VERSION = 1;

export async function exportAllJSON() {
  const db = await getDB();
  const jobs = await db.getAll('jobs');
  const panels = await db.getAll('panels');
  const rows = await db.getAll('rows');
  const sheetNotes = await db.getAll('sheetNotes');
  const checklistState = await db.getAll('checklistState');
  const photoRecs = await db.getAll('photos');
  const photos = [];
  for (const p of photoRecs) {
    photos.push({ ...p, blob: await blobToBase64(p.blob) });
  }
  return {
    backupVersion: BACKUP_VERSION,
    exportedAt: Date.now(),
    jobs, panels, rows, sheetNotes, checklistState, photos,
  };
}

export async function exportJobJSON(jobId) {
  const db = await getDB();
  const job = await db.get('jobs', jobId);
  if (!job) throw new Error('Job not found');
  const panels = await db.getAllFromIndex('panels', 'jobId', jobId);
  const rowsAll = [];
  const sheetNotesAll = [];
  const photosAll = [];
  for (const p of panels) {
    const r = await db.getAllFromIndex('rows', 'panelId', p.id);
    rowsAll.push(...r);
    const n = await db.getAllFromIndex('sheetNotes', 'panelId', p.id);
    sheetNotesAll.push(...n);
    const ph = await db.getAllFromIndex('photos', 'panelId', p.id);
    for (const photo of ph) {
      photosAll.push({ ...photo, blob: await blobToBase64(photo.blob) });
    }
  }
  const clRec = await db.get('checklistState', jobId);
  const checklistState = clRec ? [clRec] : [];
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

async function deleteExistingJobs(db, jobs) {
  for (const j of jobs) {
    const existing = await db.get('jobs', j.id);
    if (existing) await deleteJob(j.id);
  }
}

export async function importJSON(snapshot, { mode = 'merge' } = {}) {
  if (!snapshot || snapshot.backupVersion !== BACKUP_VERSION) {
    throw new Error('Backup file format is not compatible with this app version.');
  }
  const db = await getDB();

  if (mode === 'replace') {
    await deleteExistingJobs(db, snapshot.jobs);
  }

  const tx = db.transaction(
    ['jobs', 'panels', 'rows', 'sheetNotes', 'checklistState', 'photos'],
    'readwrite'
  );
  for (const j of snapshot.jobs) {
    const existing = await tx.objectStore('jobs').get(j.id);
    if (!existing || mode === 'replace') await tx.objectStore('jobs').put(j);
  }
  for (const p of snapshot.panels) {
    const existing = await tx.objectStore('panels').get(p.id);
    if (!existing || mode === 'replace') await tx.objectStore('panels').put(p);
  }
  for (const r of snapshot.rows) {
    const existing = await tx.objectStore('rows').get(r.id);
    if (!existing || mode === 'replace') await tx.objectStore('rows').put(r);
  }
  for (const n of snapshot.sheetNotes || []) {
    const existing = await tx.objectStore('sheetNotes').get(n.id);
    if (!existing || mode === 'replace') await tx.objectStore('sheetNotes').put(n);
  }
  for (const cl of snapshot.checklistState || []) {
    const existing = await tx.objectStore('checklistState').get(cl.jobId);
    if (!existing || mode === 'replace') await tx.objectStore('checklistState').put(cl);
  }
  for (const photo of snapshot.photos) {
    const existing = await tx.objectStore('photos').get(photo.id);
    if (!existing || mode === 'replace') {
      const reconstructed = { ...photo, blob: base64ToBlob(photo.blob, photo.mime || 'image/jpeg') };
      await tx.objectStore('photos').put(reconstructed);
    }
  }
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

export async function exportPanelRaw(panelId) {
  const db = await getDB();
  const panel = await db.get('panels', panelId);
  if (!panel) throw new Error('Panel not found');
  const [rows, photos, notes] = await Promise.all([
    db.getAllFromIndex('rows', 'panelId', panelId),
    db.getAllFromIndex('photos', 'panelId', panelId),
    db.getAllFromIndex('sheetNotes', 'panelId', panelId),
  ]);
  return { panel, rows, photos, notes };
}

export async function restorePanelRaw(snap) {
  const db = await getDB();
  const tx = db.transaction(['panels', 'rows', 'photos', 'sheetNotes'], 'readwrite');
  await tx.objectStore('panels').put(snap.panel);
  for (const r of snap.rows) await tx.objectStore('rows').put(r);
  for (const p of snap.photos) await tx.objectStore('photos').put(p);
  for (const n of snap.notes) await tx.objectStore('sheetNotes').put(n);
  await tx.done;
}

export async function exportJobRaw(jobId) {
  const db = await getDB();
  const job = await db.get('jobs', jobId);
  if (!job) throw new Error('Job not found');
  const panels = await db.getAllFromIndex('panels', 'jobId', jobId);
  const panelSnaps = await Promise.all(panels.map((p) => exportPanelRaw(p.id)));
  const checklist = await db.get('checklistState', jobId);
  return { job, panelSnaps, checklist: checklist || null };
}

export async function restoreJobRaw(snap) {
  const db = await getDB();
  const tx = db.transaction(
    ['jobs', 'panels', 'rows', 'photos', 'sheetNotes', 'checklistState'],
    'readwrite'
  );
  // Each await below resolves from an IDB success event; the transaction
  // stays open as long as IDB requests are in flight. Do not insert
  // non-IDB awaits inside these loops — that would auto-commit the tx.
  await tx.objectStore('jobs').put(snap.job);
  for (const ps of snap.panelSnaps) {
    await tx.objectStore('panels').put(ps.panel);
    for (const r of ps.rows) await tx.objectStore('rows').put(r);
    for (const p of ps.photos) await tx.objectStore('photos').put(p);
    for (const n of ps.notes) await tx.objectStore('sheetNotes').put(n);
  }
  if (snap.checklist) await tx.objectStore('checklistState').put(snap.checklist);
  await tx.done;
}
