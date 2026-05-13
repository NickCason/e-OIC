import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IXlsxParseProgress, IParsedRow, IXlsxParserWarning, IParsedXlsx, ISheetSchema } from '../types/xlsx';
import { parseChecklistXlsx } from './xlsxParser';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__');

function readBuf(name: string): ArrayBuffer {
    const buf = fs.readFileSync(path.join(fixturesDir, name));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

test('parses valid-seed.xlsx without errors', async () => {
    const r = await parseChecklistXlsx(readBuf('valid-seed.xlsx'));
    assert.deepEqual(r.errors, []);
    assert.ok(r.warnings.length >= 0);
    assert.ok(typeof r.rowsBySheet === 'object');
});

test('returns invalid-xlsx error on corrupt input', async () => {
    const r = await parseChecklistXlsx(readBuf('corrupt.bin'));
    assert.equal(r.errors.length, 1);
    assert.equal(r.errors[0]?.kind, 'invalid-xlsx');
});

test('returns no-recognized-sheets when nothing matches schema', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('SomethingElse');
    ws.getCell(1, 1).value = 'hi';
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const r = await parseChecklistXlsx(ab);
    assert.ok(r.errors.some((e) => e.kind === 'no-recognized-sheets'));
});

test('warns on unknown sheet (Punchlist)', async () => {
    const r = await parseChecklistXlsx(readBuf('unknown-sheet.xlsx'));
    assert.deepEqual(r.errors, []);
    const w = r.warnings.find((w2) => w2.kind === 'unknown-sheet' && w2.sheetName === 'Punchlist');
    assert.ok(w, 'expected unknown-sheet warning for Punchlist');
});

test('does NOT warn on auxiliary sheets Rev, Checklist, Notes', async () => {
    const r = await parseChecklistXlsx(readBuf('valid-seed.xlsx'));
    const auxiliary = new Set(['Rev', 'Checklist', 'Notes']);
    const hit = r.warnings.find((w) => (
        w.kind === 'unknown-sheet' && w.sheetName != null && auxiliary.has(w.sheetName)
    ));
    assert.equal(hit, undefined);
});

test('parses Panels rows from valid-seed', async () => {
    const r = await parseChecklistXlsx(readBuf('valid-seed.xlsx'));
    const panelsRows = r.rowsBySheet.Panels;
    assert.ok(Array.isArray(panelsRows));
    assert.ok(panelsRows && panelsRows.length > 0, 'expected at least one Panel row');
    const first = panelsRows[0];
    assert.ok(first?.data, 'row should have data');
    assert.ok(
        first && ('Panel Name' in first.data || first.panelName != null),
        'row should reference a panel',
    );
});

test('warns on extra column', async () => {
    const r = await parseChecklistXlsx(readBuf('extra-column.xlsx'));
    const w = r.warnings.find((w2) => (
        w2.kind === 'extra-column' && w2.sheetName === 'Panels' && w2.columnName === 'Cost Estimate'
    ));
    assert.ok(w, 'expected extra-column warning');
});

test('warns on missing column', async () => {
    const r = await parseChecklistXlsx(readBuf('missing-column.xlsx'));
    const w = r.warnings.find((w2) => (
        w2.kind === 'missing-column' && w2.sheetName === 'Power' && w2.columnName === 'Voltage In'
    ));
    assert.ok(w, 'expected missing-column warning');
});

test('skips hyperlink_column in parsed data', async () => {
    const r = await parseChecklistXlsx(readBuf('valid-seed.xlsx'));
    const schemaMap = (await import('../schema.json')).default as unknown as Record<string, ISheetSchema>;
    Object.keys(r.rowsBySheet).forEach((sheetName) => {
        const schema = schemaMap[sheetName];
        if (!schema?.hyperlink_column) return;
        const sheetRows = r.rowsBySheet[sheetName];
        if (!sheetRows) return;
        const hyperlink = schema.hyperlink_column;
        sheetRows.forEach((row) => {
            assert.ok(
                !(hyperlink in row.data),
                `${sheetName} row should not include hyperlink_column "${hyperlink}"`,
            );
        });
    });
});

test('Panels sheet produces panels list', async () => {
    const r = await parseChecklistXlsx(readBuf('valid-seed.xlsx'));
    assert.ok(r.panels.length > 0, 'expected at least one panel');
    r.panels.forEach((p) => {
        assert.equal(typeof p.name, 'string');
        assert.ok(p.name.length > 0);
    });
});

test('preserves cell-checkbox boolean values from PLC Slots', async () => {
    const r = await parseChecklistXlsx(readBuf('cell-checkbox-states.xlsx'));
    const slots: IParsedRow[] | undefined = r.rowsBySheet['PLC Slots'];
    assert.ok(slots && slots.length >= 1, 'expected at least one PLC Slot row');
    const rowHasBool = (row: IParsedRow): boolean => (
        Object.values(row.data).some((v) => typeof v === 'boolean')
    );
    const foundBool = (slots ?? []).some(rowHasBool);
    assert.ok(foundBool, 'expected at least one boolean cell value in PLC Slots');
});

test('recovers job notes, row notes, and sheet notes from Notes sheet', async () => {
    const r = await parseChecklistXlsx(readBuf('valid-seed.xlsx'));
    // Seed has job notes — should be recovered.
    assert.equal(typeof r.jobMeta.notes, 'string');
    // At least one of: job notes, sheet notes, or row.notes should be non-empty.
    const anyNotes = r.jobMeta.notes.length > 0
        || r.sheetNotes.length > 0
        || Object.values(r.rowsBySheet).some((rows) => (
            rows.some((row) => row.notes && row.notes.length > 0)
        ));
    assert.ok(anyNotes, 'expected some notes recovered from valid-seed.xlsx');
});

test('parser does not throw when Notes sheet is absent', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Panels');
    ws.getCell(2, 1).value = 'Panel Name';
    ws.getCell(3, 1).value = 'P1';
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const r = await parseChecklistXlsx(ab);
    assert.equal(r.jobMeta.notes, '');
    assert.deepEqual(r.sheetNotes, []);
});

test('warns on unknown panel reference', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    // Panels sheet with one panel
    const panels = wb.addWorksheet('Panels');
    panels.getCell(2, 1).value = 'Folder Hyperlink';
    panels.getCell(2, 2).value = 'Area';
    panels.getCell(2, 3).value = 'Panel Name';
    panels.getCell(3, 3).value = 'Real-Panel';
    // Power sheet with a row referencing an unknown panel
    const power = wb.addWorksheet('Power');
    power.getCell(2, 1).value = 'Folder Hyperlink';
    power.getCell(2, 2).value = 'Panel Name';
    power.getCell(2, 3).value = 'Device Name';
    power.getCell(3, 2).value = 'Ghost-Panel';
    power.getCell(3, 3).value = 'Some Device';
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const r: IParsedXlsx = await parseChecklistXlsx(ab);
    const w: IXlsxParserWarning | undefined = r.warnings.find((w2) => (
        w2.kind === 'unknown-panel-reference'
        && w2.sheetName === 'Power'
        && w2.panelName === 'Ghost-Panel'
    ));
    assert.ok(w, 'expected unknown-panel-reference warning');
    assert.equal(w?.rowCount, 1);
});

test('parseChecklistXlsx emits progress phases', async () => {
    const phases: Array<IXlsxParseProgress['phase']> = [];
    await parseChecklistXlsx(readBuf('valid-seed.xlsx'), { onProgress: (p) => phases.push(p.phase) });
    assert.ok(phases.includes('loading'), `expected 'loading', got ${phases.join(',')}`);
    assert.ok(phases.includes('panels'), `expected 'panels', got ${phases.join(',')}`);
    assert.ok(phases.includes('rows'), `expected 'rows', got ${phases.join(',')}`);
    assert.ok(phases.includes('matching'), `expected 'matching', got ${phases.join(',')}`);
    assert.equal(phases[0], 'loading', `'loading' must be first, got ${phases[0]}`);
    assert.equal(
        phases[phases.length - 1],
        'matching',
        `'matching' must be last, got ${phases[phases.length - 1]}`,
    );
    const rowsCount = phases.filter((p) => p === 'rows').length;
    assert.ok(rowsCount >= 1, `expected at least one 'rows' event, got ${rowsCount}`);
});
