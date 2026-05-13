// xlsxRoundTrip.js — orchestrates writing a parsed xlsx into IndexedDB.
//
// Two entry points:
//   applyParsedXlsxToNewJob(parsed, meta)  → creates a fresh job + everything
//   applyResyncToJob(jobId, parsed, diff, decisions) → mutates an existing job
//
// Both run in single idb transactions so a failure leaves no partial state.

import { getDB } from '../db';

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function writeSheetRows(rowsStore, sheetName, rows, panelIdByName, now) {
  const indexInPanel = new Map();
  const putPromises = [];
  for (const r of rows) {
    const panelId = panelIdByName.get(r.panelName);
    if (!panelId) continue; // unknown-panel-reference rows already warned by parser
    const key = `${panelId}|${sheetName}`;
    const idx = indexInPanel.get(key) || 0;
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
  }
  if (putPromises.length > 0) await Promise.all(putPromises);
}

export async function applyParsedXlsxToNewJob(parsed, meta) {
  const db = await getDB();
  const tx = db.transaction(['jobs', 'panels', 'rows', 'sheetNotes'], 'readwrite');

  const now = Date.now();
  const jobId = uid();
  const job = {
    id: jobId,
    name: meta.name,
    client: meta.client || '',
    location: meta.location || '',
    notes: parsed.jobMeta.notes || '',
    source: meta.source || null,
    createdAt: now,
    updatedAt: now,
  };
  const jobsPut = tx.objectStore('jobs').put(job);

  // Panels — by name from parsed.panels
  const panelsStore = tx.objectStore('panels');
  const panelIdByName = new Map();
  const panelPuts = parsed.panels.map((p) => {
    const id = uid();
    panelIdByName.set(p.name, id);
    return panelsStore.put({
      id, jobId, name: p.name,
      createdAt: now, updatedAt: now,
    });
  });
  await Promise.all([jobsPut, ...panelPuts]);

  // Rows — group by panelName, write in xlsx order
  const rowsStore = tx.objectStore('rows');
  for (const sheetName of Object.keys(parsed.rowsBySheet)) {
    await writeSheetRows(rowsStore, sheetName, parsed.rowsBySheet[sheetName], panelIdByName, now);
  }

  // Sheet notes
  const notesStore = tx.objectStore('sheetNotes');
  const notesPuts = [];
  for (const n of parsed.sheetNotes) {
    const panelId = panelIdByName.get(n.panelName);
    if (!panelId) continue;
    notesPuts.push(notesStore.put({
      id: uid(),
      panelId,
      sheet: n.sheetName,
      text: n.text,
      updatedAt: now,
    }));
  }
  if (notesPuts.length > 0) await Promise.all(notesPuts);

  await tx.done;
  return jobId;
}

async function applyRemovedRows(rowsStore, photosStore, removed, removedRowIds, now) {
  const acceptedRemovals = removed.filter((r) => removedRowIds.has(r.id));
  if (acceptedRemovals.length === 0) return;
  // Fan out photo lookups for accepted removals so the tx stays alive.
  const photosLists = await Promise.all(
    acceptedRemovals.map((r) => photosStore.index('rowId').getAll(r.id)),
  );
  const photoPuts = photosLists.flat().map((ph) => {
    ph.rowId = null;
    ph.updatedAt = now;
    return photosStore.put(ph);
  });
  const rowDeletes = acceptedRemovals.map((r) => rowsStore.delete(r.id));
  await Promise.all([...photoPuts, ...rowDeletes]);
}

function applyModifiedRows(rowsStore, modified, now) {
  if (modified.length === 0) return Promise.resolve([]);
  return Promise.all(modified.map((m) => {
    const local = m.local;
    local.data = { ...m.xlsx.data };
    local.notes = m.xlsx.notes || '';
    local.updatedAt = now;
    return rowsStore.put(local);
  }));
}

async function applyAddedRows(rowsStore, sheetName, added, panelIdByName, now) {
  const candidates = added.filter((xr) => panelIdByName.has(xr.panelName));
  if (candidates.length === 0) return;
  // Fan out the index lookups, then synchronously issue all puts.
  const existingLists = await Promise.all(
    candidates.map((xr) => rowsStore.index('panelId_sheet').getAll([panelIdByName.get(xr.panelName), sheetName])),
  );
  const idxCounter = new Map();
  for (let i = 0; i < candidates.length; i++) {
    const panelId = panelIdByName.get(candidates[i].panelName);
    idxCounter.set(panelId, Math.max(idxCounter.get(panelId) || 0, existingLists[i].length));
  }
  const puts = candidates.map((xr) => {
    const panelId = panelIdByName.get(xr.panelName);
    const idx = idxCounter.get(panelId);
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

async function applySheetNotesAdded(notesStore, added, panelIdByName, now) {
  const puts = [];
  for (const an of added) {
    const panelId = panelIdByName.get(an.panelName);
    if (!panelId) continue;
    puts.push(notesStore.put({ id: uid(), panelId, sheet: an.sheetName, text: an.text, updatedAt: now }));
  }
  if (puts.length > 0) await Promise.all(puts);
}

async function applySheetNotesModified(notesStore, modified, panelIdByName, now) {
  const candidates = modified.filter((mn) => panelIdByName.has(mn.panelName));
  if (candidates.length === 0) return;
  const existings = await Promise.all(
    candidates.map((mn) => notesStore.index('panelId_sheet').get([panelIdByName.get(mn.panelName), mn.sheetName])),
  );
  const puts = existings
    .map((existing, i) => {
      if (!existing) return null;
      existing.text = candidates[i].new;
      existing.updatedAt = now;
      return notesStore.put(existing);
    })
    .filter((p) => p !== null);
  if (puts.length > 0) await Promise.all(puts);
}

async function applySheetNotesRemoved(notesStore, removed, panelIdByName) {
  const candidates = removed.filter((rn) => panelIdByName.has(rn.panelName));
  if (candidates.length === 0) return;
  const existings = await Promise.all(
    candidates.map((rn) => notesStore.index('panelId_sheet').get([panelIdByName.get(rn.panelName), rn.sheetName])),
  );
  const deletes = existings
    .map((existing) => (existing ? notesStore.delete(existing.id) : null))
    .filter((p) => p !== null);
  if (deletes.length > 0) await Promise.all(deletes);
}

export async function applyResyncToJob(jobId, parsed, diff, decisions) {
  // decisions: { removedRowIds: Set<string> } — row IDs the user accepted as removed.
  const db = await getDB();
  const tx = db.transaction(['jobs', 'panels', 'rows', 'sheetNotes', 'photos'], 'readwrite');

  const now = Date.now();
  const job = await tx.objectStore('jobs').get(jobId);
  if (!job) throw new Error('Job not found: ' + jobId);

  // 1. Job-meta updates
  for (const c of diff.jobMeta.changed) {
    if (c.field === 'name') job.name = parsed.jobMeta.name;
    if (c.field === 'notes') job.notes = parsed.jobMeta.notes || '';
  }
  if (job.source) job.source = { ...job.source, pulledAt: now };
  job.updatedAt = now;
  const jobPut = tx.objectStore('jobs').put(job);

  // 2. Panels — add new ones referenced by xlsx
  const panelsStore = tx.objectStore('panels');
  const allPanels = await panelsStore.index('jobId').getAll(jobId);
  const panelIdByName = new Map(allPanels.map((p) => [p.name, p.id]));
  const panelPuts = [];
  for (const xp of diff.panels.added) {
    if (panelIdByName.has(xp.name)) continue;
    const id = uid();
    panelIdByName.set(xp.name, id);
    panelPuts.push(panelsStore.put({ id, jobId, name: xp.name, createdAt: now, updatedAt: now }));
  }
  await Promise.all([jobPut, ...panelPuts]);
  // Removed panels are NOT auto-deleted — too dangerous; the user controls
  // panel deletion explicitly. Their rows still get processed as 'removed'
  // below if the user accepted the row removals.

  // 3. Apply per-sheet row diffs
  const rowsStore = tx.objectStore('rows');
  const photosStore = tx.objectStore('photos');
  const removedRowIds = decisions?.removedRowIds || new Set();

  for (const sheetName of Object.keys(diff.sheets)) {
    const sd = diff.sheets[sheetName];
    await applyRemovedRows(rowsStore, photosStore, sd.removed, removedRowIds, now);
    await applyModifiedRows(rowsStore, sd.modified, now);
    await applyAddedRows(rowsStore, sheetName, sd.added, panelIdByName, now);
  }

  // 4. Sheet notes diff
  const notesStore = tx.objectStore('sheetNotes');
  await applySheetNotesAdded(notesStore, diff.sheetNotes.added, panelIdByName, now);
  await applySheetNotesModified(notesStore, diff.sheetNotes.modified, panelIdByName, now);
  await applySheetNotesRemoved(notesStore, diff.sheetNotes.removed, panelIdByName);

  await tx.done;
  return { ok: true };
}
