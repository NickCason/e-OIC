// seed.js — load the bundled sample job into IndexedDB on first launch.
// Idempotent: uses a settings flag so the import only runs once per device,
// and the seed itself uses stable IDs so a re-import in merge mode is a no-op.

import { getSetting, setSetting, importJSON } from '../db';

const FLAG = 'sampleSeeded';

async function fetchSeed() {
  const resp = await fetch('./seed.json');
  if (!resp.ok) throw new Error(`seed.json ${resp.status}`);
  return resp.json();
}

export async function maybeSeedSampleJob() {
  if (await getSetting(FLAG)) return false;
  try {
    const snapshot = await fetchSeed();
    await importJSON(snapshot, { mode: 'merge' });
    await setSetting(FLAG, true);
    return true;
  } catch (e) {
    console.warn('[seed] could not load sample job:', e);
    return false;
  }
}

export async function reloadSampleJob() {
  const snapshot = await fetchSeed();
  // 'replace' so re-loading wipes the user's edits to the sample and
  // restores it to the canonical state. Other (non-sample) jobs are
  // untouched because importJSON.replace only deletes jobs whose IDs
  // appear in the snapshot.
  const stats = await importJSON(snapshot, { mode: 'replace' });
  await setSetting(FLAG, true);
  return stats;
}
