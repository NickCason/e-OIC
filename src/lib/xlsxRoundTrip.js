// xlsxRoundTrip.js — orchestrates writing a parsed xlsx into IndexedDB.
//
// Two entry points:
//   applyParsedXlsxToNewJob(parsed, meta)  → creates a fresh job + everything
//   applyResyncToJob(jobId, parsed, diff, decisions) → mutates an existing job
//
// Both run in single idb transactions so a failure leaves no partial state.

import { getDB } from '../db.js';

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

export async function applyResyncToJob(/* jobId, parsed, diff, decisions */) {
  // Implemented in Task 12.
  throw new Error('applyResyncToJob not yet implemented');
}
