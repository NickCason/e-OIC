import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffJobs } from './jobDiff';
import schemaMapRaw from '../schema.json' with { type: 'json' };
import type {IDiffJobsLocalState, IParsedXlsx, IParsedPanel, IParsedRow, ISheetSchema,} from '../types/xlsx';
import type { IJob, IPanel, IRow, RowData } from '../types/job';

type SchemaMap = Record<string, ISheetSchema | undefined>;
const schemaMap: SchemaMap = schemaMapRaw as unknown as SchemaMap;

const job = (overrides: Partial<IJob> = {}): IJob => ({
    id: 'j1',
    name: 'J',
    client: '',
    location: '',
    notes: '',
    source: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
});

const panel = (overrides: Partial<IPanel> & { id: string; name: string }): IPanel => ({
    jobId: 'j1', createdAt: 0, updatedAt: 0, ...overrides,
});

const localRow = (overrides: Partial<IRow> & { id: string; panelId: string; sheet: string; data: RowData }): IRow => ({
    idx: 0, notes: '', updatedAt: 0, ...overrides,
});

const parsedRow = (overrides: Partial<IParsedRow> & { panelName: string; data: RowData }): IParsedRow => ({
    notes: '', sourceRowIndex: 0, ...overrides,
});

const parsedPanel = (overrides: Partial<IParsedPanel> & { name: string }): IParsedPanel => ({sourceRowIndex: 0, ...overrides,});

const emptyLocal = (): IDiffJobsLocalState => ({
    localJob: job(),
    localPanels: [],
    localRowsBySheet: {},
    localSheetNotes: {},
});

const emptyParsed = (): IParsedXlsx => ({
    jobMeta: {
        name: 'J', client: '', location: '', notes: ''
    },
    panels: [],
    rowsBySheet: {},
    sheetNotes: [],
    warnings: [],
    errors: [],
});

test('clean unchanged: no panels, no rows', () => {
    const d = diffJobs(emptyLocal(), emptyParsed(), schemaMap);
    Object.values(d.sheets).forEach((sheetDiff) => {
        assert.deepEqual(sheetDiff.added, []);
        assert.deepEqual(sheetDiff.removed, []);
        assert.deepEqual(sheetDiff.modified, []);
    });
});

test('added row: xlsx-only row with new label', () => {
    const local = emptyLocal();
    local.localPanels = [panel({ id: 'p1', name: 'PNL-1' })];
    local.localRowsBySheet = { 'PLC Slots': [] };
    const parsed = emptyParsed();
    parsed.panels = [parsedPanel({ name: 'PNL-1', sourceRowIndex: 3 })];
    parsed.rowsBySheet = {
        'PLC Slots': [parsedRow({
            panelName: 'PNL-1',
            data: {
                'Panel Name': 'PNL-1', Slot: 5, 'Part Number': '1756-OW16I'
            },
            sourceRowIndex: 3,
        })],
    };
    const d = diffJobs(local, parsed, schemaMap);
    const sd = d.sheets['PLC Slots']!;
    assert.equal(sd.added.length, 1);
    assert.equal(sd.removed.length, 0);
});

test('removed row: local-only row missing from xlsx', () => {
    const local = emptyLocal();
    local.localPanels = [panel({ id: 'p1', name: 'PNL-1' })];
    local.localRowsBySheet = {
        'PLC Slots': [localRow({
            id: 'r1',
            panelId: 'p1',
            sheet: 'PLC Slots',
            data: {
                'Panel Name': 'PNL-1', Slot: 5, 'Part Number': '1756-OW16I'
            },
        })],
    };
    const parsed = emptyParsed();
    parsed.panels = [parsedPanel({ name: 'PNL-1', sourceRowIndex: 3 })];
    parsed.rowsBySheet = { 'PLC Slots': [] };
    const d = diffJobs(local, parsed, schemaMap);
    const sd = d.sheets['PLC Slots']!;
    assert.equal(sd.added.length, 0);
    assert.equal(sd.removed.length, 1);
});

test('matched same-label rows produce a modified-or-unchanged pair', () => {
    const local = emptyLocal();
    local.localPanels = [panel({ id: 'p1', name: 'PNL-1' })];
    local.localRowsBySheet = {
        'PLC Slots': [localRow({
            id: 'r1',
            panelId: 'p1',
            sheet: 'PLC Slots',
            data: {
                'Panel Name': 'PNL-1', Slot: 5, 'Part Number': '1756-OW16I'
            },
        })],
    };
    const parsed = emptyParsed();
    parsed.panels = [parsedPanel({ name: 'PNL-1', sourceRowIndex: 3 })];
    parsed.rowsBySheet = {
        'PLC Slots': [parsedRow({
            panelName: 'PNL-1',
            data: {
                'Panel Name': 'PNL-1', Slot: 5, 'Part Number': '1756-OW16I'
            },
            sourceRowIndex: 3,
        })],
    };
    const d = diffJobs(local, parsed, schemaMap);
    const sd = d.sheets['PLC Slots']!;
    const totalMatched = sd.modified.length + sd.unchanged.length;
    assert.equal(totalMatched, 1);
    assert.equal(sd.added.length, 0);
    assert.equal(sd.removed.length, 0);
});

test('label collision: two locals + three xlsx of same label position-match', () => {
    const local = emptyLocal();
    local.localPanels = [panel({ id: 'p1', name: 'PNL-1' })];
    local.localRowsBySheet = {
        'PLC Slots': [
            localRow({
                id: 'r1',
                panelId: 'p1',
                sheet: 'PLC Slots',
                idx: 0,
                data: { 'Panel Name': 'PNL-1', Slot: 5 },
            }),
            localRow({
                id: 'r2',
                panelId: 'p1',
                sheet: 'PLC Slots',
                idx: 1,
                data: { 'Panel Name': 'PNL-1', Slot: 5 },
            }),
        ],
    };
    const parsed = emptyParsed();
    parsed.panels = [parsedPanel({ name: 'PNL-1', sourceRowIndex: 3 })];
    parsed.rowsBySheet = {
        'PLC Slots': [
            parsedRow({
                panelName: 'PNL-1', data: { 'Panel Name': 'PNL-1', Slot: 5 }, sourceRowIndex: 3
            }),
            parsedRow({
                panelName: 'PNL-1', data: { 'Panel Name': 'PNL-1', Slot: 5 }, sourceRowIndex: 4
            }),
            parsedRow({
                panelName: 'PNL-1', data: { 'Panel Name': 'PNL-1', Slot: 5 }, sourceRowIndex: 5
            }),
        ],
    };
    const d = diffJobs(local, parsed, schemaMap);
    const sd = d.sheets['PLC Slots']!;
    const matched = sd.modified.length + sd.unchanged.length;
    assert.equal(matched, 2);
    assert.equal(sd.added.length, 1);
    assert.ok(sd.labelCollisions.includes('Slot 5'));
});

test('paired rows with identical fields → unchanged', () => {
    const local = emptyLocal();
    local.localPanels = [panel({ id: 'p1', name: 'PNL-1' })];
    local.localRowsBySheet = {
        'PLC Slots': [localRow({
            id: 'r1',
            panelId: 'p1',
            sheet: 'PLC Slots',
            data: {
                'Panel Name': 'PNL-1', Slot: 5, 'Part Number': '1756-OW16I'
            },
        })],
    };
    const parsed = emptyParsed();
    parsed.panels = [parsedPanel({ name: 'PNL-1', sourceRowIndex: 3 })];
    parsed.rowsBySheet = {
        'PLC Slots': [parsedRow({
            panelName: 'PNL-1',
            data: {
                'Panel Name': 'PNL-1', Slot: 5, 'Part Number': '1756-OW16I'
            },
            sourceRowIndex: 3,
        })],
    };
    const d = diffJobs(local, parsed, schemaMap);
    const sd = d.sheets['PLC Slots']!;
    assert.equal(sd.unchanged.length, 1);
    assert.equal(sd.modified.length, 0);
});

test('paired rows differing in one field → modified with fieldChanges', () => {
    // Use Power sheet — its label is just "Device Name", so mutating any other
    // field keeps the rows paired by label.
    const local = emptyLocal();
    local.localPanels = [panel({ id: 'p1', name: 'PNL-1' })];
    local.localRowsBySheet = {
        Power: [localRow({
            id: 'r1',
            panelId: 'p1',
            sheet: 'Power',
            data: {
                'Panel Name': 'PNL-1', 'Device Name': 'PS-1', 'Voltage Out': '24'
            },
        })],
    };
    const parsed = emptyParsed();
    parsed.panels = [parsedPanel({ name: 'PNL-1', sourceRowIndex: 3 })];
    parsed.rowsBySheet = {
        Power: [parsedRow({
            panelName: 'PNL-1',
            data: {
                'Panel Name': 'PNL-1', 'Device Name': 'PS-1', 'Voltage Out': '12'
            },
            sourceRowIndex: 3,
        })],
    };
    const d = diffJobs(local, parsed, schemaMap);
    const sd = d.sheets.Power!;
    assert.equal(sd.modified.length, 1);
    assert.equal(sd.unchanged.length, 0);
    const fc = sd.modified[0]!.fieldChanges;
    assert.equal(fc.length, 1);
    assert.equal(fc[0]!.field, 'Voltage Out');
    assert.equal(fc[0]!.old, '24');
    assert.equal(fc[0]!.new, '12');
});

test('"" ≡ null ≡ undefined for string equality', () => {
    const local = emptyLocal();
    local.localPanels = [panel({ id: 'p1', name: 'PNL-1' })];
    local.localRowsBySheet = {
        'PLC Slots': [localRow({
            id: 'r1',
            panelId: 'p1',
            sheet: 'PLC Slots',
            data: {
                'Panel Name': 'PNL-1', Slot: 5, Notes: ''
            },
        })],
    };
    const parsed = emptyParsed();
    parsed.panels = [parsedPanel({ name: 'PNL-1', sourceRowIndex: 3 })];
    parsed.rowsBySheet = {
        'PLC Slots': [parsedRow({
            panelName: 'PNL-1',
            data: {
                'Panel Name': 'PNL-1', Slot: 5, Notes: null
            },
            sourceRowIndex: 3,
        })],
    };
    const d = diffJobs(local, parsed, schemaMap);
    assert.equal(d.sheets['PLC Slots']!.unchanged.length, 1);
});

test('hyperlink_column is excluded from field comparison', () => {
    const local = emptyLocal();
    local.localPanels = [panel({ id: 'p1', name: 'PNL-1' })];
    local.localRowsBySheet = {
        Panels: [localRow({
            id: 'r1',
            panelId: 'p1',
            sheet: 'Panels',
            data: { 'Panel Name': 'PNL-1', 'Folder Hyperlink': 'old-path' },
        })],
    };
    const parsed = emptyParsed();
    parsed.panels = [parsedPanel({ name: 'PNL-1', sourceRowIndex: 3 })];
    parsed.rowsBySheet = {
        Panels: [parsedRow({
            panelName: 'PNL-1',
            data: { 'Panel Name': 'PNL-1', 'Folder Hyperlink': 'new-path' },
            sourceRowIndex: 3,
        })],
    };
    const d = diffJobs(local, parsed, schemaMap);
    const sd = d.sheets.Panels!;
    assert.equal(sd.modified.length, 0);
    assert.equal(sd.unchanged.length, 1);
});

test('job-meta name change surfaces in jobMeta.changed', () => {
    const local = emptyLocal();
    local.localJob = job({ name: 'Old Name' });
    const parsed = emptyParsed();
    parsed.jobMeta = {
        name: 'New Name', client: '', location: '', notes: ''
    };
    const d = diffJobs(local, parsed, schemaMap);
    const c = d.jobMeta.changed.find((x) => x.field === 'name');
    assert.ok(c);
    assert.equal(c.old, 'Old Name');
    assert.equal(c.new, 'New Name');
});

test('job-meta notes change surfaces', () => {
    const local = emptyLocal();
    local.localJob = job({ notes: 'old' });
    const parsed = emptyParsed();
    parsed.jobMeta = {
        name: 'J', client: '', location: '', notes: 'new'
    };
    const d = diffJobs(local, parsed, schemaMap);
    const c = d.jobMeta.changed.find((x) => x.field === 'notes');
    assert.ok(c);
});

test('job-meta client and location are NEVER diffed', () => {
    const local = emptyLocal();
    local.localJob = job({ client: 'Acme', location: 'Plant 3' });
    const parsed = emptyParsed();
    parsed.jobMeta = {
        name: 'J', client: '', location: '', notes: ''
    };
    const d = diffJobs(local, parsed, schemaMap);
    assert.equal(d.jobMeta.changed.find((c) => (c.field as string) === 'client'), undefined);
    assert.equal(d.jobMeta.changed.find((c) => (c.field as string) === 'location'), undefined);
});

test('direction option does not affect data structure', () => {
    const dPull = diffJobs(emptyLocal(), emptyParsed(), schemaMap, { direction: 'pull' });
    const dPush = diffJobs(emptyLocal(), emptyParsed(), schemaMap, { direction: 'push' });
    assert.deepEqual(dPull.sheets, dPush.sheets);
    assert.deepEqual(dPull.panels, dPush.panels);
});
