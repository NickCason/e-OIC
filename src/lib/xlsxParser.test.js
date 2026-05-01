import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChecklistXlsx } from './xlsxParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(__dirname, '__fixtures__');
const readBuf = (name) => {
  const buf = fs.readFileSync(path.join(FIX, name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};

test('parses valid-seed.xlsx without errors', async () => {
  const r = await parseChecklistXlsx(readBuf('valid-seed.xlsx'));
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.length >= 0);
  assert.ok(typeof r.rowsBySheet === 'object');
});

test('returns invalid-xlsx error on corrupt input', async () => {
  const r = await parseChecklistXlsx(readBuf('corrupt.bin'));
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].kind, 'invalid-xlsx');
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
  const w = r.warnings.find((w) => w.kind === 'unknown-sheet' && w.sheetName === 'Punchlist');
  assert.ok(w, 'expected unknown-sheet warning for Punchlist');
});

test('does NOT warn on auxiliary sheets Rev, Checklist, Notes', async () => {
  const r = await parseChecklistXlsx(readBuf('valid-seed.xlsx'));
  assert.equal(
    r.warnings.find((w) => w.kind === 'unknown-sheet' && ['Rev', 'Checklist', 'Notes'].includes(w.sheetName)),
    undefined,
  );
});

test('parses Panels rows from valid-seed', async () => {
  const r = await parseChecklistXlsx(readBuf('valid-seed.xlsx'));
  assert.ok(Array.isArray(r.rowsBySheet['Panels']));
  assert.ok(r.rowsBySheet['Panels'].length > 0, 'expected at least one Panel row');
  const first = r.rowsBySheet['Panels'][0];
  assert.ok(first.data, 'row should have data');
  assert.ok('Panel Name' in first.data || first.panelName != null, 'row should reference a panel');
});

test('warns on extra column', async () => {
  const r = await parseChecklistXlsx(readBuf('extra-column.xlsx'));
  const w = r.warnings.find((w) => w.kind === 'extra-column' && w.sheetName === 'Panels' && w.columnName === 'Cost Estimate');
  assert.ok(w, 'expected extra-column warning');
});

test('warns on missing column', async () => {
  const r = await parseChecklistXlsx(readBuf('missing-column.xlsx'));
  const w = r.warnings.find((w) => w.kind === 'missing-column' && w.sheetName === 'Power' && w.columnName === 'Voltage');
  assert.ok(w, 'expected missing-column warning');
});

test('skips hyperlink_column in parsed data', async () => {
  const r = await parseChecklistXlsx(readBuf('valid-seed.xlsx'));
  for (const sheetName of Object.keys(r.rowsBySheet)) {
    const schema = (await import('../schema.json', { with: { type: 'json' } })).default[sheetName];
    if (!schema?.hyperlink_column) continue;
    for (const row of r.rowsBySheet[sheetName]) {
      assert.ok(!(schema.hyperlink_column in row.data),
        `${sheetName} row should not include hyperlink_column "${schema.hyperlink_column}"`);
    }
  }
});

test('Panels sheet produces panels list', async () => {
  const r = await parseChecklistXlsx(readBuf('valid-seed.xlsx'));
  assert.ok(r.panels.length > 0, 'expected at least one panel');
  for (const p of r.panels) {
    assert.equal(typeof p.name, 'string');
    assert.ok(p.name.length > 0);
  }
});
