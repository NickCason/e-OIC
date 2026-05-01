// scripts/gen-fixtures.mjs
//
// One-shot fixture generator for src/lib/xlsxParser.test.js.
// Runs the existing exporter against public/seed.json (matches e2e-test.mjs
// shape), writes the clean xlsx, then derives mutated variants for the
// parser's warning/error paths.
//
// Run: node scripts/gen-fixtures.mjs
// Commit the resulting files in src/lib/__fixtures__/.

import 'fake-indexeddb/auto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FIX_DIR = path.join(ROOT, 'src', 'lib', '__fixtures__');
fs.mkdirSync(FIX_DIR, { recursive: true });

globalThis.fetch = async (url) => {
  const p = url.startsWith('./')
    ? path.join(ROOT, 'public', url.slice(2))
    : path.join(ROOT, 'public', url);
  const buf = fs.readFileSync(p);
  return {
    ok: true, status: 200,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    json: async () => JSON.parse(buf.toString('utf8')),
    text: async () => buf.toString('utf8'),
  };
};

const { importJSON, getJob } = await import('../src/db.js');
const { buildExport } = await import('../src/exporter.js');

console.log('[gen] importing seed…');
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'seed.json'), 'utf8'));
await importJSON(seed, { mode: 'replace' });
const job = await getJob(seed.jobs[0].id);

console.log('[gen] running buildExport()…');
const result = await buildExport(job, { templateUrl: './template.xlsx', onProgress: () => {} });

// The exporter currently produces a zip. Extract its inner xlsx.
const { default: JSZip } = await import('jszip');
const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
const xlsxName = Object.keys(zip.files).find((f) => f.endsWith('.xlsx'));
if (!xlsxName) throw new Error('no xlsx inside export zip');
const cleanBuf = await zip.file(xlsxName).async('nodebuffer');

const writeXlsx = (name, buf) => {
  const p = path.join(FIX_DIR, name);
  fs.writeFileSync(p, buf);
  console.log('[gen] wrote', path.relative(ROOT, p), `(${buf.length} bytes)`);
};

writeXlsx('valid-seed.xlsx', cleanBuf);

const { default: ExcelJS } = await import('exceljs');

async function load(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}
async function save(wb) {
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

// extra-column: add a "Cost Estimate" column to Panels' header row, leave data blank.
{
  const wb = await load(cleanBuf);
  const ws = wb.getWorksheet('Panels');
  const lastCol = ws.columnCount + 1;
  ws.getCell(2, lastCol).value = 'Cost Estimate';
  writeXlsx('extra-column.xlsx', await save(wb));
}

// missing-column: clear the "Voltage In" header in Power.
{
  const wb = await load(cleanBuf);
  const ws = wb.getWorksheet('Power');
  let cleared = false;
  for (let c = 1; c <= ws.columnCount; c++) {
    const cellVal = ws.getCell(2, c).value;
    if (cellVal != null && String(cellVal).trim() === 'Voltage In') {
      ws.getCell(2, c).value = null;
      cleared = true;
      break;
    }
  }
  if (!cleared) throw new Error('missing-column fixture: "Voltage In" header not found in Power');
  writeXlsx('missing-column.xlsx', await save(wb));
}

// unknown-sheet: add a "Punchlist" sheet with arbitrary content.
{
  const wb = await load(cleanBuf);
  const ws = wb.addWorksheet('Punchlist');
  ws.getCell(1, 1).value = 'Item';
  ws.getCell(1, 2).value = 'Status';
  ws.getCell(2, 1).value = 'Verify torque';
  ws.getCell(2, 2).value = 'open';
  writeXlsx('unknown-sheet.xlsx', await save(wb));
}

// cell-checkbox-states: set three different cell-checkbox values in PLC Slots.
{
  const wb = await load(cleanBuf);
  const ws = wb.getWorksheet('PLC Slots');
  let boolCol = null;
  for (let c = 1; c <= ws.columnCount; c++) {
    const v = ws.getCell(3, c).value;
    if (typeof v === 'boolean') { boolCol = c; break; }
  }
  if (boolCol) {
    ws.getCell(3, boolCol).value = true;
    if (ws.rowCount >= 4) ws.getCell(4, boolCol).value = false;
    if (ws.rowCount >= 5) ws.getCell(5, boolCol).value = null;
  }
  writeXlsx('cell-checkbox-states.xlsx', await save(wb));
}

// corrupt: random bytes
{
  const buf = Buffer.alloc(1024);
  for (let i = 0; i < buf.length; i++) buf[i] = (i * 73 + 11) & 0xff;
  fs.writeFileSync(path.join(FIX_DIR, 'corrupt.bin'), buf);
  console.log('[gen] wrote corrupt.bin (1024 bytes)');
}

console.log('[gen] done.');
