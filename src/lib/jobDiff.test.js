import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffJobs } from './jobDiff.js';
import schemaMap from '../schema.json' with { type: 'json' };

const emptyLocal = () => ({
  localJob: { name: 'J', client: '', location: '', notes: '' },
  localPanels: [],
  localRowsBySheet: {},
  localSheetNotes: {},
});

const emptyParsed = () => ({
  jobMeta: { name: 'J', client: '', location: '', notes: '' },
  panels: [],
  rowsBySheet: {},
  sheetNotes: [],
  warnings: [],
  errors: [],
});

test('clean unchanged: no panels, no rows', () => {
  const d = diffJobs(emptyLocal(), emptyParsed(), schemaMap);
  for (const sheetDiff of Object.values(d.sheets)) {
    assert.deepEqual(sheetDiff.added, []);
    assert.deepEqual(sheetDiff.removed, []);
    assert.deepEqual(sheetDiff.modified, []);
  }
});

test('added row: xlsx-only row with new label', () => {
  const local = emptyLocal();
  local.localPanels = [{ id: 'p1', name: 'PNL-1' }];
  local.localRowsBySheet = { 'PLC Slots': [] };
  const parsed = emptyParsed();
  parsed.panels = [{ name: 'PNL-1', sourceRowIndex: 3 }];
  parsed.rowsBySheet = {
    'PLC Slots': [{ panelName: 'PNL-1', data: { 'Panel Name': 'PNL-1', 'Slot': 5, 'Part Number': '1756-OW16I' }, notes: '', sourceRowIndex: 3 }],
  };
  const d = diffJobs(local, parsed, schemaMap);
  assert.equal(d.sheets['PLC Slots'].added.length, 1);
  assert.equal(d.sheets['PLC Slots'].removed.length, 0);
});

test('removed row: local-only row missing from xlsx', () => {
  const local = emptyLocal();
  local.localPanels = [{ id: 'p1', name: 'PNL-1' }];
  local.localRowsBySheet = {
    'PLC Slots': [{ id: 'r1', panelId: 'p1', sheet: 'PLC Slots', idx: 0, data: { 'Panel Name': 'PNL-1', 'Slot': 5, 'Part Number': '1756-OW16I' }, notes: '' }],
  };
  const parsed = emptyParsed();
  parsed.panels = [{ name: 'PNL-1', sourceRowIndex: 3 }];
  parsed.rowsBySheet = { 'PLC Slots': [] };
  const d = diffJobs(local, parsed, schemaMap);
  assert.equal(d.sheets['PLC Slots'].added.length, 0);
  assert.equal(d.sheets['PLC Slots'].removed.length, 1);
});

test('matched same-label rows produce a modified-or-unchanged pair', () => {
  const local = emptyLocal();
  local.localPanels = [{ id: 'p1', name: 'PNL-1' }];
  local.localRowsBySheet = {
    'PLC Slots': [{ id: 'r1', panelId: 'p1', sheet: 'PLC Slots', idx: 0, data: { 'Panel Name': 'PNL-1', 'Slot': 5, 'Part Number': '1756-OW16I' }, notes: '' }],
  };
  const parsed = emptyParsed();
  parsed.panels = [{ name: 'PNL-1', sourceRowIndex: 3 }];
  parsed.rowsBySheet = {
    'PLC Slots': [{ panelName: 'PNL-1', data: { 'Panel Name': 'PNL-1', 'Slot': 5, 'Part Number': '1756-OW16I' }, notes: '', sourceRowIndex: 3 }],
  };
  const d = diffJobs(local, parsed, schemaMap);
  const totalMatched = d.sheets['PLC Slots'].modified.length + d.sheets['PLC Slots'].unchanged.length;
  assert.equal(totalMatched, 1);
  assert.equal(d.sheets['PLC Slots'].added.length, 0);
  assert.equal(d.sheets['PLC Slots'].removed.length, 0);
});

test('label collision: two locals + three xlsx of same label position-match', () => {
  const local = emptyLocal();
  local.localPanels = [{ id: 'p1', name: 'PNL-1' }];
  local.localRowsBySheet = {
    'PLC Slots': [
      { id: 'r1', panelId: 'p1', sheet: 'PLC Slots', idx: 0, data: { 'Panel Name': 'PNL-1', 'Slot': 5 }, notes: '' },
      { id: 'r2', panelId: 'p1', sheet: 'PLC Slots', idx: 1, data: { 'Panel Name': 'PNL-1', 'Slot': 5 }, notes: '' },
    ],
  };
  const parsed = emptyParsed();
  parsed.panels = [{ name: 'PNL-1', sourceRowIndex: 3 }];
  parsed.rowsBySheet = {
    'PLC Slots': [
      { panelName: 'PNL-1', data: { 'Panel Name': 'PNL-1', 'Slot': 5 }, notes: '', sourceRowIndex: 3 },
      { panelName: 'PNL-1', data: { 'Panel Name': 'PNL-1', 'Slot': 5 }, notes: '', sourceRowIndex: 4 },
      { panelName: 'PNL-1', data: { 'Panel Name': 'PNL-1', 'Slot': 5 }, notes: '', sourceRowIndex: 5 },
    ],
  };
  const d = diffJobs(local, parsed, schemaMap);
  // 2 paired (modified or unchanged), 1 added
  const matched = d.sheets['PLC Slots'].modified.length + d.sheets['PLC Slots'].unchanged.length;
  assert.equal(matched, 2);
  assert.equal(d.sheets['PLC Slots'].added.length, 1);
  assert.ok(d.sheets['PLC Slots'].labelCollisions.includes('Slot 5'));
});
