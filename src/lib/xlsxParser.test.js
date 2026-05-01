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
