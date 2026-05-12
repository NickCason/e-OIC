// xlsxRoundTrip.js — orchestrates writing a parsed xlsx into IndexedDB.
//
// Two entry points:
//   applyParsedXlsxToNewJob(parsed, meta)  → creates a fresh job + everything
//   applyResyncToJob(jobId, parsed, diff, decisions) → mutates an existing job
//
// Both run in single idb transactions so a failure leaves no partial state.

import { getDB } from '../db';

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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
  await tx.objectStore('jobs').put(job);

  // Panels — by name from parsed.panels
  const panelIdByName = new Map();
  for (const p of parsed.panels) {
    const id = uid();
    panelIdByName.set(p.name, id);
    await tx.objectStore('panels').put({
      id, jobId, name: p.name,
      createdAt: now, updatedAt: now,
    });
  }

  // Rows — group by panelName, write in xlsx order
  const rowsStore = tx.objectStore('rows');
  for (const sheetName of Object.keys(parsed.rowsBySheet)) {
    const rows = parsed.rowsBySheet[sheetName];
    const indexInPanel = new Map();
    for (const r of rows) {
      const panelId = panelIdByName.get(r.panelName);
      if (!panelId) continue; // unknown-panel-reference rows already warned by parser
      const key = `${panelId}|${sheetName}`;
      const idx = indexInPanel.get(key) || 0;
      indexInPanel.set(key, idx + 1);
      await rowsStore.put({
        id: uid(),
        panelId,
        sheet: sheetName,
        idx,
        data: r.data,
        notes: r.notes || '',
        updatedAt: now,
      });
    }
  }

  // Sheet notes
  const notesStore = tx.objectStore('sheetNotes');
  for (const n of parsed.sheetNotes) {
    const panelId = panelIdByName.get(n.panelName);
    if (!panelId) continue;
    await notesStore.put({
      id: uid(),
      panelId,
      sheet: n.sheetName,
      text: n.text,
      updatedAt: now,
    });
  }

  await tx.done;
  return jobId;
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
  await tx.objectStore('jobs').put(job);

  // 2. Panels — add new ones referenced by xlsx
  const panelsStore = tx.objectStore('panels');
  const allPanels = await panelsStore.index('jobId').getAll(jobId);
  const panelIdByName = new Map(allPanels.map((p) => [p.name, p.id]));
  for (const xp of diff.panels.added) {
    if (panelIdByName.has(xp.name)) continue;
    const id = uid();
    panelIdByName.set(xp.name, id);
    await panelsStore.put({ id, jobId, name: xp.name, createdAt: now, updatedAt: now });
  }
  // Removed panels are NOT auto-deleted — too dangerous; the user controls
  // panel deletion explicitly. Their rows still get processed as 'removed'
  // below if the user accepted the row removals.

  // 3. Apply per-sheet row diffs
  const rowsStore = tx.objectStore('rows');
  const photosStore = tx.objectStore('photos');
  const removedRowIds = decisions?.removedRowIds || new Set();

  for (const sheetName of Object.keys(diff.sheets)) {
    const sd = diff.sheets[sheetName];

    // 3a. Removed rows the user accepted: detach photos, delete row.
    for (const localRow of sd.removed) {
      if (!removedRowIds.has(localRow.id)) continue; // user kept it
      const photos = await photosStore.index('rowId').getAll(localRow.id);
      for (const ph of photos) {
        ph.rowId = null;
        ph.updatedAt = now;
        await photosStore.put(ph);
      }
      await rowsStore.delete(localRow.id);
    }

    // 3b. Modified rows: overwrite data and notes; preserve id and idx.
    for (const m of sd.modified) {
      const local = m.local;
      local.data = { ...m.xlsx.data };
      local.notes = m.xlsx.notes || '';
      local.updatedAt = now;
      await rowsStore.put(local);
    }

    // 3c. Added rows: create new with idx after current max in (panel, sheet).
    for (const xr of sd.added) {
      const panelId = panelIdByName.get(xr.panelName);
      if (!panelId) continue;
      const existing = await rowsStore.index('panelId_sheet').getAll([panelId, sheetName]);
      const idx = existing.length;
      await rowsStore.put({
        id: uid(),
        panelId,
        sheet: sheetName,
        idx,
        data: { ...xr.data },
        notes: xr.notes || '',
        updatedAt: now,
      });
    }
  }

  // 4. Sheet notes diff
  const notesStore = tx.objectStore('sheetNotes');
  for (const an of diff.sheetNotes.added) {
    const panelId = panelIdByName.get(an.panelName);
    if (!panelId) continue;
    await notesStore.put({ id: uid(), panelId, sheet: an.sheetName, text: an.text, updatedAt: now });
  }
  for (const mn of diff.sheetNotes.modified) {
    const panelId = panelIdByName.get(mn.panelName);
    if (!panelId) continue;
    const existing = await notesStore.index('panelId_sheet').get([panelId, mn.sheetName]);
    if (existing) {
      existing.text = mn.new;
      existing.updatedAt = now;
      await notesStore.put(existing);
    }
  }
  for (const rn of diff.sheetNotes.removed) {
    const panelId = panelIdByName.get(rn.panelName);
    if (!panelId) continue;
    const existing = await notesStore.index('panelId_sheet').get([panelId, rn.sheetName]);
    if (existing) await notesStore.delete(existing.id);
  }

  await tx.done;
  return { ok: true };
}
