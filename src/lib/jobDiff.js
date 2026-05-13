// jobDiff.js — pure-function diff between a local job's IndexedDB state and
// a parsed xlsx. Used by Re-sync (direction='pull') and Push (direction='push').

import { rowDisplayLabel } from './rowLabel';

function valuesEqual(a, b) {
  // Treat '' / null / undefined as equivalent.
  const na = (a === '' || a === undefined) ? null : a;
  const nb = (b === '' || b === undefined) ? null : b;
  if (na === null && nb === null) return true;
  if (na === null || nb === null) {
    // null ≡ false for booleans
    if (typeof na === 'boolean' && nb === null) return na === false;
    if (typeof nb === 'boolean' && na === null) return nb === false;
    return false;
  }
  if (typeof na === 'boolean' || typeof nb === 'boolean') {
    return Boolean(na) === Boolean(nb);
  }
  if (typeof na === 'number' && typeof nb === 'number') {
    if (Number.isNaN(na) && Number.isNaN(nb)) return true;
    return na === nb;
  }
  // Cross-type numeric equivalence: "60.0" should equal 60 because xlsx
  // round-trips numeric-looking strings as native numbers, and a value-level
  // diff shouldn't flag that as a real change.
  if (
    (typeof na === 'number' && typeof nb === 'string') ||
    (typeof na === 'string' && typeof nb === 'number')
  ) {
    const sa = String(na).trim();
    const sb = String(nb).trim();
    if (sa !== '' && sb !== '' && !Number.isNaN(Number(sa)) && !Number.isNaN(Number(sb))) {
      return Number(sa) === Number(sb);
    }
  }
  return String(na).trim() === String(nb).trim();
}

function compareRowFields(localRow, xlsxRow, sheetName, schemaMap) {
  const schema = schemaMap[sheetName];
  if (!schema) return [];
  const changes = [];
  for (const col of schema.columns) {
    if (col.header === schema.hyperlink_column) continue;
    const oldV = localRow.data?.[col.header] ?? null;
    const newV = xlsxRow.data?.[col.header] ?? null;
    if (!valuesEqual(oldV, newV)) {
      changes.push({ field: col.header, old: oldV, new: newV });
    }
  }
  return changes;
}

function labelOf(rowData, sheetName, schemaMap) {
  return rowDisplayLabel({ data: rowData, idx: 0 }, sheetName, schemaMap[sheetName]);
}

function groupByPanelLabel(rows, sheetName, schemaMap, getData) {
  const groups = new Map();
  for (const r of rows) {
    const data = getData(r);
    const panelName = data?.['Panel Name'] != null ? String(data['Panel Name']) : '';
    const label = labelOf(data, sheetName, schemaMap) || '';
    const key = `${panelName}|${label}`;
    if (!groups.has(key)) groups.set(key, { panelName, label, items: [] });
    groups.get(key).items.push(r);
  }
  return groups;
}

function diffGroupPair(lg, xg, sheetName, schemaMap, sheetDiff) {
  const localItems = lg?.items || [];
  const xlsxItems = xg?.items || [];
  if (localItems.length > 1 || xlsxItems.length > 1) {
    const lbl = (lg || xg).label;
    if (!sheetDiff.labelCollisions.includes(lbl) && lbl !== '') sheetDiff.labelCollisions.push(lbl);
  }
  const pairCount = Math.min(localItems.length, xlsxItems.length);
  const label = (lg || xg).label;
  for (let i = 0; i < pairCount; i++) {
    const local = localItems[i];
    const xlsx = xlsxItems[i];
    const fieldChanges = compareRowFields(local, xlsx, sheetName, schemaMap);
    if (fieldChanges.length === 0) sheetDiff.unchanged.push({ local, xlsx, label });
    else sheetDiff.modified.push({ local, xlsx, label, fieldChanges });
  }
  for (let i = pairCount; i < localItems.length; i++) sheetDiff.removed.push(localItems[i]);
  for (let i = pairCount; i < xlsxItems.length; i++) sheetDiff.added.push(xlsxItems[i]);
}

function diffSheetRows(localRows, xlsxRows, sheetName, schemaMap) {
  const localGroups = groupByPanelLabel(localRows, sheetName, schemaMap, (r) => r.data || {});
  const xlsxGroups = groupByPanelLabel(xlsxRows, sheetName, schemaMap, (r) => r.data || {});
  const sheetDiff = { added: [], removed: [], modified: [], unchanged: [], labelCollisions: [] };
  const allKeys = new Set([...localGroups.keys(), ...xlsxGroups.keys()]);
  for (const key of allKeys) {
    diffGroupPair(localGroups.get(key), xlsxGroups.get(key), sheetName, schemaMap, sheetDiff);
  }
  return sheetDiff;
}

export function diffJobs(localState, parsedXlsx, schemaMap, options = {}) {
  const { localJob, localPanels, localRowsBySheet, localSheetNotes } = localState;

  const result = {
    jobMeta: { changed: [] },
    panels: { added: [], removed: [], matched: [] },
    sheets: {},
    sheetNotes: { added: [], removed: [], modified: [] },
    skippedSheets: parsedXlsx.warnings.filter((w) => w.kind === 'unknown-sheet').map((w) => w.sheetName),
    skippedColumns: parsedXlsx.warnings.filter((w) => w.kind === 'extra-column').map((w) => ({ sheetName: w.sheetName, columnName: w.columnName })),
    missingSheets: parsedXlsx.warnings.filter((w) => w.kind === 'missing-sheet').map((w) => w.sheetName),
  };

  // Panels diff
  const localPanelNames = new Set(localPanels.map((p) => p.name));
  const xlsxPanelNames = new Set(parsedXlsx.panels.map((p) => p.name));
  for (const lp of localPanels) {
    if (xlsxPanelNames.has(lp.name)) {
      const xp = parsedXlsx.panels.find((p) => p.name === lp.name);
      result.panels.matched.push({ local: lp, xlsx: xp });
    } else {
      result.panels.removed.push(lp);
    }
  }
  for (const xp of parsedXlsx.panels) {
    if (!localPanelNames.has(xp.name)) result.panels.added.push(xp);
  }

  // Job meta diff. Only `name` and `notes` round-trip via xlsx; client and
  // location are never compared.
  {
    const localMeta = localJob || {};
    const xlsxMeta = parsedXlsx.jobMeta || {};
    for (const field of ['name', 'notes']) {
      const oldV = (localMeta[field] ?? '').toString().trim();
      const newV = (xlsxMeta[field] ?? '').toString().trim();
      if (oldV !== newV) {
        result.jobMeta.changed.push({ field, old: localMeta[field] ?? '', new: xlsxMeta[field] ?? '' });
      }
    }
  }

  // Per-sheet row diff (matching only; field comparison stubbed → all matches go to modified)
  const allSheetNames = new Set([
    ...Object.keys(localRowsBySheet || {}),
    ...Object.keys(parsedXlsx.rowsBySheet || {}),
  ]);
  for (const sheetName of allSheetNames) {
    const localRows = (localRowsBySheet && localRowsBySheet[sheetName]) || [];
    const xlsxRows = (parsedXlsx.rowsBySheet && parsedXlsx.rowsBySheet[sheetName]) || [];
    result.sheets[sheetName] = diffSheetRows(localRows, xlsxRows, sheetName, schemaMap);
  }

  // Sheet notes
  const localKeys = new Set(Object.keys(localSheetNotes || {}).flatMap((panel) =>
    Object.keys(localSheetNotes[panel]).map((sheet) => `${panel}|${sheet}`)));
  const xlsxKeysList = parsedXlsx.sheetNotes.map((n) => `${n.panelName}|${n.sheetName}`);
  const xlsxKeys = new Set(xlsxKeysList);
  for (const k of localKeys) {
    if (!xlsxKeys.has(k)) {
      const [panel, sheet] = k.split('|');
      result.sheetNotes.removed.push({ panelName: panel, sheetName: sheet, text: localSheetNotes[panel][sheet] });
    }
  }
  for (const xn of parsedXlsx.sheetNotes) {
    const k = `${xn.panelName}|${xn.sheetName}`;
    const localText = localSheetNotes?.[xn.panelName]?.[xn.sheetName];
    if (localText == null) result.sheetNotes.added.push(xn);
    else if (String(localText).trim() !== String(xn.text).trim()) {
      result.sheetNotes.modified.push({ panelName: xn.panelName, sheetName: xn.sheetName, old: localText, new: xn.text });
    }
  }

  return result;
}
