# SharePoint xlsx Round-Trip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-shot-picker xlsx round-trip workflow so techs can Pull, Re-sync, and Push e-OIC investigations through SharePoint via the OS Files-app picker.

**Architecture:** Three new pure-JS modules (`xlsxParser`, `jobDiff`, `xlsxRoundTrip`) handle the data side. Four new React components (`PullOrNewModal`, `PullDialog`, `DiffView`, `ResyncDialog`) wire it into the existing UI. `ExportDialog` grows a "push" mode. No new IndexedDB store; one optional `source` field on `jobs`. No DB version bump. No new dependencies — ExcelJS, JSZip, idb, and React are already in the bundle.

**Tech Stack:** React 18, Vite 5, IndexedDB via `idb`, ExcelJS, `node:test` for unit tests, `fake-indexeddb` for e2e.

**Spec:** `docs/superpowers/specs/2026-05-01-sharepoint-roundtrip-design.md`

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `src/lib/xlsxParser.js` | `parseChecklistXlsx(arrayBuffer) → { jobMeta, panels, rowsBySheet, sheetNotes, warnings, errors }`. Pure async function. |
| `src/lib/xlsxParser.test.js` | `node:test` suite for the parser. |
| `src/lib/jobDiff.js` | `diffJobs(localState, parsedXlsx, schemaMap, options) → JobDiff`. Pure function. |
| `src/lib/jobDiff.test.js` | `node:test` suite for the diff. |
| `src/lib/xlsxRoundTrip.js` | `applyParsedXlsxToNewJob(parsed, meta) → newJobId` and `applyResyncToJob(jobId, parsed, diff, decisions) → result`. Atomic via `idb` transactions. |
| `src/lib/__fixtures__/valid-seed.xlsx` | Clean export of seed job (committed binary). |
| `src/lib/__fixtures__/extra-column.xlsx` | Variant: extra "Cost Estimate" column on Panels. |
| `src/lib/__fixtures__/missing-column.xlsx` | Variant: missing "Voltage" column on Power. |
| `src/lib/__fixtures__/unknown-sheet.xlsx` | Variant: extra "Punchlist" sheet. |
| `src/lib/__fixtures__/cell-checkbox-states.xlsx` | Variant: mix of true/false/null in a Photo Checklist boolean column. |
| `src/lib/__fixtures__/corrupt.bin` | Random bytes named `.xlsx` for error path. |
| `scripts/gen-fixtures.mjs` | One-shot generator that exports the seed and writes the variants. Run once, output committed. |
| `src/components/PullOrNewModal.jsx` | Small choice modal opened by the FAB. |
| `src/components/PullDialog.jsx` | Picker → parse → confirm → create flow. |
| `src/components/DiffView.jsx` | Row-level summary diff component. |
| `src/components/ResyncDialog.jsx` | Picker → parse → diff → apply flow. |

### Modified files

| Path | Change |
|---|---|
| `src/components/JobList.jsx` | FAB tap opens `PullOrNewModal` instead of `JobModal`. |
| `src/components/JobView.jsx` | Adds "Re-sync from xlsx" and "Disconnect from xlsx" entries to the options menu. |
| `src/components/ExportDialog.jsx` | Adds a "Push to xlsx" mode with diff confirm. |
| `src/exporter.js` | `buildExport(job, { mode })` accepts `mode: 'zip' \| 'xlsx-only'`. |
| `src/db.js` | `createJob` accepts an optional `source` field. |
| `src/styles.css` | DiffView and mode-toggle styles. |
| `scripts/e2e-test.mjs` | Adds round-trip + resync assertions after the existing export step. |
| `src/version.js` | `BUILD_VERSION = 'v32'`. |
| `public/service-worker.js` | `VERSION = 'v32'`. |

---

## Conventions

- **Tests:** Pure-JS helpers use `node:test`. Run with `node --test src/lib/<file>.test.js`. UI components are not unit-tested in this project; rely on real-device QA.
- **Commits:** Frequent, scoped, conventional prefix (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`). Direct-on-main, no PRs (project preference).
- **Files:** Always use absolute paths in tool calls. Always `git add` specific files (no `git add .`).
- **Schema:** `src/schema.json` is the single source of truth for sheet/column names. Use `import schemaMap from '../schema.json' with { type: 'json' }`.
- **Photos on Resync:** Never deleted. If their owning row is removed, their `rowId` is set to `null` so they become panel-level (visible in panel photo grid).
- **Don't bump DB_VERSION.** The new `job.source` field is optional and read-back-as-undefined-safe.

---

## Task 1: Fixture generator script + committed fixtures

**Files:**
- Create: `scripts/gen-fixtures.mjs`
- Create: `src/lib/__fixtures__/valid-seed.xlsx` (committed binary)
- Create: `src/lib/__fixtures__/extra-column.xlsx`
- Create: `src/lib/__fixtures__/missing-column.xlsx`
- Create: `src/lib/__fixtures__/unknown-sheet.xlsx`
- Create: `src/lib/__fixtures__/cell-checkbox-states.xlsx`
- Create: `src/lib/__fixtures__/corrupt.bin`

The fixture generator runs the existing exporter against `public/seed.json` (the same path `scripts/e2e-test.mjs` uses), writes `valid-seed.xlsx`, then mutates copies of it via JSZip+ExcelJS to produce the variants. Run once, commit the output, leave the script in repo for regeneration.

- [ ] **Step 1: Create the generator script**

`scripts/gen-fixtures.mjs`:

```js
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

// missing-column: clear the "Voltage" header in Power. (Power's first data
// row is 3; header_row is 2.)
{
  const wb = await load(cleanBuf);
  const ws = wb.getWorksheet('Power');
  for (let c = 1; c <= ws.columnCount; c++) {
    if (String(ws.getCell(2, c).value).trim() === 'Voltage') {
      ws.getCell(2, c).value = null;
      break;
    }
  }
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
// PLC Slots header_row=2, first_data_row=3. The Photo Checklist column header
// (per template) is "Photo / Folder Hyperlink"; the boolean columns under
// "Photo Checklist" group are the ones we want. We pick the first boolean
// column we find by writing true/false/null into rows 3/4/5 of column 24.
{
  const wb = await load(cleanBuf);
  const ws = wb.getWorksheet('PLC Slots');
  // Find first column whose row-3 value is a boolean — that's a checkbox col.
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
```

- [ ] **Step 2: Run the generator**

```bash
cd /Users/nickcason/DevSpace/Work/e-OIC
node scripts/gen-fixtures.mjs
```

Expected output: lines like `[gen] wrote src/lib/__fixtures__/valid-seed.xlsx (NNN bytes)` for each fixture, ending with `[gen] done.`

- [ ] **Step 3: Sanity-check the fixtures**

```bash
ls -la src/lib/__fixtures__/
```

Expected: 6 files. Sizes roughly: valid-seed (~80–200 KB), three variants similar, corrupt.bin = 1024 bytes.

- [ ] **Step 4: Commit**

```bash
git add scripts/gen-fixtures.mjs src/lib/__fixtures__/
git commit -m "chore(test): add xlsx fixture generator and committed fixtures"
```

---

## Task 2: Parser — open file, recognize sheets, structure-rejecting errors

**Files:**
- Create: `src/lib/xlsxParser.js`
- Create: `src/lib/xlsxParser.test.js`

This task ships a parser that opens an xlsx, recognizes which sheets are in `schemaMap`, and returns a `{ jobMeta, panels, rowsBySheet, sheetNotes, warnings, errors }` object — but only fills `errors` and `warnings` for now. Row parsing is added in Task 3.

- [ ] **Step 1: Write the failing tests**

`src/lib/xlsxParser.test.js`:

```js
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
  // Build a tiny xlsx in-memory with one sheet whose name isn't in schema.
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
```

- [ ] **Step 2: Run tests and confirm failure**

```bash
node --test src/lib/xlsxParser.test.js
```

Expected: FAIL — module not found, since `xlsxParser.js` doesn't exist yet.

- [ ] **Step 3: Implement the parser scaffolding**

`src/lib/xlsxParser.js`:

```js
// xlsxParser.js — read an xlsx exported by e-OIC (or hand-edited variant)
// back into the in-memory shape we use for diffs and IndexedDB writes.
//
// Pure function; no DOM, no IndexedDB. ExcelJS is dynamic-imported so the
// initial PWA bundle stays small.

import schemaMap from '../schema.json' with { type: 'json' };

const AUXILIARY_SHEET_NAMES = new Set(['Rev', 'Checklist', 'Notes']);

export async function parseChecklistXlsx(arrayBuffer) {
  const result = {
    jobMeta: { name: null, client: '', location: '', notes: '' },
    panels: [],
    rowsBySheet: {},
    sheetNotes: [],
    warnings: [],
    errors: [],
  };

  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(arrayBuffer);
  } catch (e) {
    result.errors.push({ kind: 'invalid-xlsx', message: e?.message || 'Could not read xlsx' });
    return result;
  }

  const sheetNames = wb.worksheets.map((ws) => ws.name);
  const recognized = sheetNames.filter((n) => schemaMap[n]);
  if (recognized.length === 0) {
    result.errors.push({ kind: 'no-recognized-sheets' });
    return result;
  }

  for (const name of sheetNames) {
    if (schemaMap[name]) continue;
    if (AUXILIARY_SHEET_NAMES.has(name)) continue;
    result.warnings.push({ kind: 'unknown-sheet', sheetName: name });
  }

  for (const sn of Object.keys(schemaMap)) {
    if (!sheetNames.includes(sn)) {
      result.warnings.push({ kind: 'missing-sheet', sheetName: sn });
    }
    result.rowsBySheet[sn] = [];
  }

  return result;
}
```

- [ ] **Step 4: Run tests and confirm passing**

```bash
node --test src/lib/xlsxParser.test.js
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/xlsxParser.js src/lib/xlsxParser.test.js
git commit -m "feat(parser): xlsxParser scaffolding — sheet recognition + structure errors"
```

---

## Task 3: Parser — header mapping and data row walking

**Files:**
- Modify: `src/lib/xlsxParser.js`
- Modify: `src/lib/xlsxParser.test.js`

Walk each recognized sheet's data rows top-to-bottom from `schema.first_data_row` until two consecutive empty rows. For each row, build `data: { [field]: cellValue }` for known schema columns only. Surface `extra-column` and `missing-column` warnings. Skip the schema's `hyperlink_column` (it's export-time only). Skip rows where all known columns are null.

- [ ] **Step 1: Add tests for row parsing**

Append to `src/lib/xlsxParser.test.js`:

```js
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
```

- [ ] **Step 2: Run tests and confirm new ones fail**

```bash
node --test src/lib/xlsxParser.test.js
```

Expected: prior 5 still pass; the 5 new tests fail (rows are empty arrays, panels is empty).

- [ ] **Step 3: Implement row walking**

Replace the body of `src/lib/xlsxParser.js`'s `parseChecklistXlsx` function. The full file becomes:

```js
import schemaMap from '../schema.json' with { type: 'json' };

const AUXILIARY_SHEET_NAMES = new Set(['Rev', 'Checklist', 'Notes']);

function normalize(s) {
  if (s == null) return '';
  return String(s).replace(/\s+/g, ' ').trim().toLowerCase();
}

function extractCellValue(cell) {
  const v = cell.value;
  if (v == null) return null;
  if (typeof v === 'string') return v === '' ? null : v;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('result' in v) return v.result == null ? null : v.result;
    if ('text' in v) return v.text == null ? null : String(v.text);
    if ('richText' in v && Array.isArray(v.richText)) {
      return v.richText.map((p) => p.text || '').join('') || null;
    }
  }
  return null;
}

function buildHeaderIndex(ws, headerRow) {
  const idx = {};
  const row = ws.getRow(headerRow);
  for (let c = 1; c <= ws.columnCount; c++) {
    const v = row.getCell(c).value;
    const s = (v == null ? '' : String(v)).replace(/\n/g, ' ').trim();
    if (s) idx[normalize(s)] = { colNumber: c, raw: s };
  }
  return idx;
}

function rowIsAllBlank(rowData) {
  for (const k of Object.keys(rowData)) {
    if (rowData[k] != null) return false;
  }
  return true;
}

function parseSheetRows(ws, schema, warnings) {
  const headerIndex = buildHeaderIndex(ws, schema.header_row);
  const schemaHeaderNorms = new Set(schema.columns.map((c) => normalize(c.header)));

  for (const col of schema.columns) {
    if (col.header === schema.hyperlink_column) continue;
    if (!headerIndex[normalize(col.header)]) {
      warnings.push({ kind: 'missing-column', sheetName: ws.name, columnName: col.header });
    }
  }
  for (const norm of Object.keys(headerIndex)) {
    if (!schemaHeaderNorms.has(norm)) {
      warnings.push({ kind: 'extra-column', sheetName: ws.name, columnName: headerIndex[norm].raw });
    }
  }

  const rows = [];
  let r = schema.first_data_row;
  let consecutiveBlanks = 0;
  while (consecutiveBlanks < 2 && r <= ws.rowCount + 2) {
    const xlsxRow = ws.getRow(r);
    const data = {};
    for (const col of schema.columns) {
      if (col.header === schema.hyperlink_column) continue;
      const h = headerIndex[normalize(col.header)];
      if (!h) continue;
      data[col.header] = extractCellValue(xlsxRow.getCell(h.colNumber));
    }
    if (rowIsAllBlank(data)) {
      consecutiveBlanks += 1;
      r += 1;
      continue;
    }
    consecutiveBlanks = 0;
    const panelName = data['Panel Name'] != null ? String(data['Panel Name']) : null;
    rows.push({ panelName, data, notes: '', sourceRowIndex: r });
    r += 1;
  }
  return rows;
}

export async function parseChecklistXlsx(arrayBuffer) {
  const result = {
    jobMeta: { name: null, client: '', location: '', notes: '' },
    panels: [],
    rowsBySheet: {},
    sheetNotes: [],
    warnings: [],
    errors: [],
  };

  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(arrayBuffer);
  } catch (e) {
    result.errors.push({ kind: 'invalid-xlsx', message: e?.message || 'Could not read xlsx' });
    return result;
  }

  const sheetNames = wb.worksheets.map((ws) => ws.name);
  const recognized = sheetNames.filter((n) => schemaMap[n]);
  if (recognized.length === 0) {
    result.errors.push({ kind: 'no-recognized-sheets' });
    return result;
  }

  for (const name of sheetNames) {
    if (schemaMap[name]) continue;
    if (AUXILIARY_SHEET_NAMES.has(name)) continue;
    result.warnings.push({ kind: 'unknown-sheet', sheetName: name });
  }
  for (const sn of Object.keys(schemaMap)) {
    if (!sheetNames.includes(sn)) {
      result.warnings.push({ kind: 'missing-sheet', sheetName: sn });
    }
    result.rowsBySheet[sn] = [];
  }

  // Parse Panels first so other sheets can validate against panel names.
  if (sheetNames.includes('Panels')) {
    const ws = wb.getWorksheet('Panels');
    const rows = parseSheetRows(ws, schemaMap['Panels'], result.warnings);
    result.rowsBySheet['Panels'] = rows;
    for (const row of rows) {
      const name = row.data?.['Panel Name'] != null ? String(row.data['Panel Name']).trim() : '';
      if (name) {
        result.panels.push({ name, sourceRowIndex: row.sourceRowIndex });
      }
    }
  }

  for (const sn of Object.keys(schemaMap)) {
    if (sn === 'Panels') continue;
    if (!sheetNames.includes(sn)) continue;
    const ws = wb.getWorksheet(sn);
    result.rowsBySheet[sn] = parseSheetRows(ws, schemaMap[sn], result.warnings);
  }

  return result;
}
```

- [ ] **Step 4: Run tests, confirm all pass**

```bash
node --test src/lib/xlsxParser.test.js
```

Expected: 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/xlsxParser.js src/lib/xlsxParser.test.js
git commit -m "feat(parser): walk header-mapped data rows with extra/missing-column warnings"
```

---

## Task 4: Parser — cell-checkbox boolean preservation test

**Files:**
- Modify: `src/lib/xlsxParser.test.js`

The cell-value extraction in Task 3 already handles booleans correctly via `extractCellValue`. This task adds a test to lock that behavior in (regression guard for the v22 cell-checkbox feature).

- [ ] **Step 1: Add test**

Append to `src/lib/xlsxParser.test.js`:

```js
test('preserves cell-checkbox boolean values from PLC Slots', async () => {
  const r = await parseChecklistXlsx(readBuf('cell-checkbox-states.xlsx'));
  const slots = r.rowsBySheet['PLC Slots'];
  assert.ok(slots.length >= 1, 'expected at least one PLC Slot row');
  // The fixture set boolean true/false/null in rows 3/4/5 of the first
  // boolean column. The parser doesn't know which schema column that maps
  // to, but at least one row should carry a literal boolean value (not a
  // string).
  let foundBool = false;
  for (const row of slots) {
    for (const v of Object.values(row.data)) {
      if (typeof v === 'boolean') { foundBool = true; break; }
    }
    if (foundBool) break;
  }
  assert.ok(foundBool, 'expected at least one boolean cell value in PLC Slots');
});
```

- [ ] **Step 2: Run, confirm pass**

```bash
node --test src/lib/xlsxParser.test.js
```

Expected: 11 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/xlsxParser.test.js
git commit -m "test(parser): regression guard for cell-checkbox boolean preservation"
```

---

## Task 5: Parser — Notes sheet recovery (job + row + sheet notes)

**Files:**
- Modify: `src/lib/xlsxParser.js`
- Modify: `src/lib/xlsxParser.test.js`

The exporter writes a "Notes" sheet (when the job has any notes) with this layout:
- Row 1 col 1: literal `"Job Notes"` (bold) — only if job has notes
- Row 2 col 1: merged cell with the actual job notes text
- (Blank row)
- A header row: col 1 `"Sheet"`, col 2 `"Panel"`, col 3 `"Row"`, col 4 `"Notes"`
- Subsequent rows: appendix entries. `"(sheet)"` in the Row column means it's a sheet-level note for that (panel, sheet); else it's a row note matched by display label.

The parser needs to recover all three flavors and attach row notes back to their rows.

- [ ] **Step 1: Add tests**

Append to `src/lib/xlsxParser.test.js`:

```js
test('recovers job notes, row notes, and sheet notes from Notes sheet', async () => {
  const r = await parseChecklistXlsx(readBuf('valid-seed.xlsx'));
  // Seed has job notes — should be recovered.
  assert.equal(typeof r.jobMeta.notes, 'string');
  // At least one of: job notes, sheet notes, or row.notes should be non-empty.
  const anyNotes =
    r.jobMeta.notes.length > 0 ||
    r.sheetNotes.length > 0 ||
    Object.values(r.rowsBySheet).some((rows) => rows.some((row) => row.notes && row.notes.length > 0));
  assert.ok(anyNotes, 'expected some notes recovered from valid-seed.xlsx');
});

test('parser does not throw when Notes sheet is absent', async () => {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  // Add a recognized sheet so we don't trip no-recognized-sheets
  const ws = wb.addWorksheet('Panels');
  ws.getCell(2, 1).value = 'Panel Name';
  ws.getCell(3, 1).value = 'P1';
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const r = await parseChecklistXlsx(ab);
  assert.equal(r.jobMeta.notes, '');
  assert.deepEqual(r.sheetNotes, []);
});
```

- [ ] **Step 2: Run, confirm new tests fail**

```bash
node --test src/lib/xlsxParser.test.js
```

Expected: Notes-recovery test fails; absent-Notes test may pass already.

- [ ] **Step 3: Implement Notes sheet parsing**

Add this helper to `src/lib/xlsxParser.js` (near `parseSheetRows`):

```js
function parseNotesSheet(ws, rowsBySheet, warnings) {
  const out = { jobNotes: '', sheetNotes: [], rowNoteAssignments: [] };
  if (!ws) return out;

  // Job Notes: row 1 col 1 == "Job Notes", row 2 col 1 is the merged text.
  let cursor = 1;
  const r1c1 = ws.getCell(1, 1).value;
  if (r1c1 != null && String(r1c1).trim() === 'Job Notes') {
    const r2c1 = ws.getCell(2, 1).value;
    out.jobNotes = r2c1 == null ? '' : String(r2c1).trim();
    cursor = 3;
  }

  // Find appendix header row: (Sheet, Panel, Row, Notes).
  let headerR = null;
  for (let r = cursor; r <= ws.rowCount; r++) {
    const a = ws.getCell(r, 1).value;
    const b = ws.getCell(r, 2).value;
    const c = ws.getCell(r, 3).value;
    const d = ws.getCell(r, 4).value;
    if (
      a != null && String(a).trim() === 'Sheet' &&
      b != null && String(b).trim() === 'Panel' &&
      c != null && String(c).trim() === 'Row' &&
      d != null && String(d).trim() === 'Notes'
    ) {
      headerR = r;
      break;
    }
  }
  if (headerR == null) return out;

  for (let r = headerR + 1; r <= ws.rowCount + 1; r++) {
    const sheetCell = ws.getCell(r, 1).value;
    const panelCell = ws.getCell(r, 2).value;
    const labelCell = ws.getCell(r, 3).value;
    const notesCell = ws.getCell(r, 4).value;
    if (sheetCell == null && panelCell == null && labelCell == null && notesCell == null) break;
    const sheetName = sheetCell == null ? '' : String(sheetCell).trim();
    const panelName = panelCell == null ? '' : String(panelCell).trim();
    const label = labelCell == null ? '' : String(labelCell).trim();
    const text = notesCell == null ? '' : String(notesCell).trim();
    if (!text) continue;
    if (label === '(sheet)') {
      out.sheetNotes.push({ panelName, sheetName, text });
    } else {
      out.rowNoteAssignments.push({ sheetName, panelName, label, text });
    }
  }
  return out;
}
```

Then modify the bottom of `parseChecklistXlsx` (just before the final `return result`) to call it. Also add the rowDisplayLabel-based note-to-row assignment. Insert this block after the per-sheet row-parsing loop:

```js
// Notes sheet
const notesWs = wb.getWorksheet('Notes');
const notes = parseNotesSheet(notesWs, result.rowsBySheet, result.warnings);
result.jobMeta.notes = notes.jobNotes;
result.sheetNotes = notes.sheetNotes;

// Match row-note assignments back to parsed rows by (sheet, panelName, label).
const { rowDisplayLabel } = await import('./rowLabel.js');
for (const assignment of notes.rowNoteAssignments) {
  const rows = result.rowsBySheet[assignment.sheetName];
  if (!rows) {
    result.warnings.push({
      kind: 'notes-row-unmatched',
      sheetName: assignment.sheetName,
      panelName: assignment.panelName,
      label: assignment.label,
    });
    continue;
  }
  const schema = schemaMap[assignment.sheetName];
  const match = rows.find((row) =>
    row.panelName === assignment.panelName &&
    rowDisplayLabel({ data: row.data, idx: 0 }, assignment.sheetName, schema) === assignment.label,
  );
  if (match) {
    match.notes = assignment.text;
  } else {
    result.warnings.push({
      kind: 'notes-row-unmatched',
      sheetName: assignment.sheetName,
      panelName: assignment.panelName,
      label: assignment.label,
    });
  }
}
```

- [ ] **Step 4: Run, confirm passing**

```bash
node --test src/lib/xlsxParser.test.js
```

Expected: 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/xlsxParser.js src/lib/xlsxParser.test.js
git commit -m "feat(parser): recover job/row/sheet notes from Notes appendix"
```

---

## Task 6: Parser — panel-name validation across non-Panels sheets

**Files:**
- Modify: `src/lib/xlsxParser.js`
- Modify: `src/lib/xlsxParser.test.js`

For each non-Panels sheet, group rows by `panelName`. If a name appears that's not in the `result.panels` list, emit `unknown-panel-reference` warning with `rowCount`.

- [ ] **Step 1: Add test**

Append to `src/lib/xlsxParser.test.js`:

```js
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
  const r = await parseChecklistXlsx(ab);
  const w = r.warnings.find((w) =>
    w.kind === 'unknown-panel-reference' &&
    w.sheetName === 'Power' &&
    w.panelName === 'Ghost-Panel',
  );
  assert.ok(w, 'expected unknown-panel-reference warning');
  assert.equal(w.rowCount, 1);
});
```

- [ ] **Step 2: Run, confirm new test fails**

```bash
node --test src/lib/xlsxParser.test.js
```

Expected: new test fails (no `unknown-panel-reference` warnings yet).

- [ ] **Step 3: Implement validation**

In `src/lib/xlsxParser.js`, after the per-sheet row-parsing loop and before the Notes block, add:

```js
// Validate panel-name references across non-Panels sheets.
const knownPanelNames = new Set(result.panels.map((p) => p.name));
for (const sn of Object.keys(result.rowsBySheet)) {
  if (sn === 'Panels') continue;
  const counts = new Map();
  for (const row of result.rowsBySheet[sn]) {
    if (row.panelName == null) continue;
    if (knownPanelNames.has(row.panelName)) continue;
    counts.set(row.panelName, (counts.get(row.panelName) || 0) + 1);
  }
  for (const [panelName, rowCount] of counts) {
    result.warnings.push({
      kind: 'unknown-panel-reference',
      sheetName: sn,
      panelName,
      rowCount,
    });
  }
}
```

- [ ] **Step 4: Run, confirm all pass**

```bash
node --test src/lib/xlsxParser.test.js
```

Expected: 14 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/xlsxParser.js src/lib/xlsxParser.test.js
git commit -m "feat(parser): warn on rows referencing panels not in Panels sheet"
```

---

## Task 7: jobDiff — row matching by `(panelName, label)` with collision handling

**Files:**
- Create: `src/lib/jobDiff.js`
- Create: `src/lib/jobDiff.test.js`

Pure data-in-data-out diff. This task ships row matching only (no field comparison yet). Returns `added`, `removed`, and `matched-as-modified` (without fieldChanges) plus `labelCollisions`. Field comparison is added in Task 8.

- [ ] **Step 1: Write tests**

`src/lib/jobDiff.test.js`:

```js
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
```

- [ ] **Step 2: Run, confirm failure**

```bash
node --test src/lib/jobDiff.test.js
```

Expected: module not found.

- [ ] **Step 3: Implement diff (matching only, no field comparison yet)**

`src/lib/jobDiff.js`:

```js
// jobDiff.js — pure-function diff between a local job's IndexedDB state and
// a parsed xlsx. Used by Re-sync (direction='pull') and Push (direction='push').

import { rowDisplayLabel } from './rowLabel.js';

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

  // Per-sheet row diff (matching only; field comparison stubbed → all matches go to modified)
  const allSheetNames = new Set([
    ...Object.keys(localRowsBySheet || {}),
    ...Object.keys(parsedXlsx.rowsBySheet || {}),
  ]);
  for (const sheetName of allSheetNames) {
    const localRows = (localRowsBySheet && localRowsBySheet[sheetName]) || [];
    const xlsxRows = (parsedXlsx.rowsBySheet && parsedXlsx.rowsBySheet[sheetName]) || [];
    const localGroups = groupByPanelLabel(localRows, sheetName, schemaMap, (r) => r.data || {});
    const xlsxGroups = groupByPanelLabel(xlsxRows, sheetName, schemaMap, (r) => r.data || {});

    const sheetDiff = { added: [], removed: [], modified: [], unchanged: [], labelCollisions: [] };

    const allKeys = new Set([...localGroups.keys(), ...xlsxGroups.keys()]);
    for (const key of allKeys) {
      const lg = localGroups.get(key);
      const xg = xlsxGroups.get(key);
      const localItems = lg?.items || [];
      const xlsxItems = xg?.items || [];
      if (localItems.length > 1 || xlsxItems.length > 1) {
        const lbl = (lg || xg).label;
        if (!sheetDiff.labelCollisions.includes(lbl) && lbl !== '') sheetDiff.labelCollisions.push(lbl);
      }
      const pairCount = Math.min(localItems.length, xlsxItems.length);
      for (let i = 0; i < pairCount; i++) {
        const local = localItems[i];
        const xlsx = xlsxItems[i];
        const label = (lg || xg).label;
        // Field comparison comes in Task 8; for now, treat all paired as modified.
        sheetDiff.modified.push({ local, xlsx, label, fieldChanges: [] });
      }
      for (let i = pairCount; i < localItems.length; i++) sheetDiff.removed.push(localItems[i]);
      for (let i = pairCount; i < xlsxItems.length; i++) sheetDiff.added.push(xlsxItems[i]);
    }
    result.sheets[sheetName] = sheetDiff;
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
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
node --test src/lib/jobDiff.test.js
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/jobDiff.js src/lib/jobDiff.test.js
git commit -m "feat(diff): row matching by (panelName, label) with collision detection"
```

---

## Task 8: jobDiff — field comparison (modified vs unchanged)

**Files:**
- Modify: `src/lib/jobDiff.js`
- Modify: `src/lib/jobDiff.test.js`

Replace the placeholder "all paired = modified" with real per-field comparison.

- [ ] **Step 1: Add tests**

Append to `src/lib/jobDiff.test.js`:

```js
test('paired rows with identical fields → unchanged', () => {
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
  assert.equal(d.sheets['PLC Slots'].unchanged.length, 1);
  assert.equal(d.sheets['PLC Slots'].modified.length, 0);
});

test('paired rows differing in one field → modified with fieldChanges', () => {
  const local = emptyLocal();
  local.localPanels = [{ id: 'p1', name: 'PNL-1' }];
  local.localRowsBySheet = {
    'PLC Slots': [{ id: 'r1', panelId: 'p1', sheet: 'PLC Slots', idx: 0, data: { 'Panel Name': 'PNL-1', 'Slot': 5, 'Part Number': '1756-OW16I' }, notes: '' }],
  };
  const parsed = emptyParsed();
  parsed.panels = [{ name: 'PNL-1', sourceRowIndex: 3 }];
  parsed.rowsBySheet = {
    'PLC Slots': [{ panelName: 'PNL-1', data: { 'Panel Name': 'PNL-1', 'Slot': 5, 'Part Number': '1756-IF8I' }, notes: '', sourceRowIndex: 3 }],
  };
  const d = diffJobs(local, parsed, schemaMap);
  assert.equal(d.sheets['PLC Slots'].modified.length, 1);
  assert.equal(d.sheets['PLC Slots'].unchanged.length, 0);
  const fc = d.sheets['PLC Slots'].modified[0].fieldChanges;
  assert.equal(fc.length, 1);
  assert.equal(fc[0].field, 'Part Number');
  assert.equal(fc[0].old, '1756-OW16I');
  assert.equal(fc[0].new, '1756-IF8I');
});

test('"" ≡ null ≡ undefined for string equality', () => {
  const local = emptyLocal();
  local.localPanels = [{ id: 'p1', name: 'PNL-1' }];
  local.localRowsBySheet = {
    'PLC Slots': [{ id: 'r1', panelId: 'p1', sheet: 'PLC Slots', idx: 0, data: { 'Panel Name': 'PNL-1', 'Slot': 5, 'Notes': '' }, notes: '' }],
  };
  const parsed = emptyParsed();
  parsed.panels = [{ name: 'PNL-1', sourceRowIndex: 3 }];
  parsed.rowsBySheet = {
    'PLC Slots': [{ panelName: 'PNL-1', data: { 'Panel Name': 'PNL-1', 'Slot': 5, 'Notes': null }, notes: '', sourceRowIndex: 3 }],
  };
  const d = diffJobs(local, parsed, schemaMap);
  assert.equal(d.sheets['PLC Slots'].unchanged.length, 1);
});

test('hyperlink_column is excluded from field comparison', () => {
  const local = emptyLocal();
  local.localPanels = [{ id: 'p1', name: 'PNL-1' }];
  local.localRowsBySheet = {
    'Panels': [{ id: 'r1', panelId: 'p1', sheet: 'Panels', idx: 0, data: { 'Panel Name': 'PNL-1', 'Folder Hyperlink': 'old-path' }, notes: '' }],
  };
  const parsed = emptyParsed();
  parsed.panels = [{ name: 'PNL-1', sourceRowIndex: 3 }];
  parsed.rowsBySheet = {
    'Panels': [{ panelName: 'PNL-1', data: { 'Panel Name': 'PNL-1', 'Folder Hyperlink': 'new-path' }, notes: '', sourceRowIndex: 3 }],
  };
  const d = diffJobs(local, parsed, schemaMap);
  // The hyperlink_column shouldn't surface as a modification.
  assert.equal(d.sheets['Panels'].modified.length, 0);
  assert.equal(d.sheets['Panels'].unchanged.length, 1);
});
```

- [ ] **Step 2: Run, confirm new tests fail**

```bash
node --test src/lib/jobDiff.test.js
```

Expected: 4 new tests fail (currently always reports modified with empty fieldChanges).

- [ ] **Step 3: Implement field comparison**

Add this helper near the top of `src/lib/jobDiff.js`:

```js
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
```

Then replace the inner loop's "treat all paired as modified" block with:

```js
for (let i = 0; i < pairCount; i++) {
  const local = localItems[i];
  const xlsx = xlsxItems[i];
  const label = (lg || xg).label;
  const fieldChanges = compareRowFields(local, xlsx, sheetName, schemaMap);
  if (fieldChanges.length === 0) {
    sheetDiff.unchanged.push({ local, xlsx, label });
  } else {
    sheetDiff.modified.push({ local, xlsx, label, fieldChanges });
  }
}
```

- [ ] **Step 4: Run, confirm all pass**

```bash
node --test src/lib/jobDiff.test.js
```

Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/jobDiff.js src/lib/jobDiff.test.js
git commit -m "feat(diff): per-field comparison with type-aware equality"
```

---

## Task 9: jobDiff — job-meta diff + push direction flag

**Files:**
- Modify: `src/lib/jobDiff.js`
- Modify: `src/lib/jobDiff.test.js`

Add `jobMeta.changed` for `name` and `notes` changes. Skip `client` and `location` because they aren't round-trippable. Add `direction` option (used by UI to flip column labels — diff data structure stays the same).

- [ ] **Step 1: Add tests**

Append to `src/lib/jobDiff.test.js`:

```js
test('job-meta name change surfaces in jobMeta.changed', () => {
  const local = emptyLocal();
  local.localJob = { name: 'Old Name', client: '', location: '', notes: '' };
  const parsed = emptyParsed();
  parsed.jobMeta = { name: 'New Name', client: '', location: '', notes: '' };
  const d = diffJobs(local, parsed, schemaMap);
  const c = d.jobMeta.changed.find((c) => c.field === 'name');
  assert.ok(c);
  assert.equal(c.old, 'Old Name');
  assert.equal(c.new, 'New Name');
});

test('job-meta notes change surfaces', () => {
  const local = emptyLocal();
  local.localJob = { name: 'J', client: '', location: '', notes: 'old' };
  const parsed = emptyParsed();
  parsed.jobMeta = { name: 'J', client: '', location: '', notes: 'new' };
  const d = diffJobs(local, parsed, schemaMap);
  const c = d.jobMeta.changed.find((c) => c.field === 'notes');
  assert.ok(c);
});

test('job-meta client and location are NEVER diffed', () => {
  const local = emptyLocal();
  local.localJob = { name: 'J', client: 'Acme', location: 'Plant 3', notes: '' };
  const parsed = emptyParsed();
  parsed.jobMeta = { name: 'J', client: '', location: '', notes: '' };
  const d = diffJobs(local, parsed, schemaMap);
  assert.equal(d.jobMeta.changed.find((c) => c.field === 'client'), undefined);
  assert.equal(d.jobMeta.changed.find((c) => c.field === 'location'), undefined);
});

test('direction option does not affect data structure', () => {
  const dPull = diffJobs(emptyLocal(), emptyParsed(), schemaMap, { direction: 'pull' });
  const dPush = diffJobs(emptyLocal(), emptyParsed(), schemaMap, { direction: 'push' });
  assert.deepEqual(dPull.sheets, dPush.sheets);
  assert.deepEqual(dPull.panels, dPush.panels);
});
```

- [ ] **Step 2: Run, confirm new tests fail**

```bash
node --test src/lib/jobDiff.test.js
```

Expected: 3 of 4 new tests fail (the direction-option test passes already).

- [ ] **Step 3: Implement job-meta diff**

In `src/lib/jobDiff.js`, after the `panels` diff block and before the per-sheet row diff, add:

```js
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
```

- [ ] **Step 4: Run, confirm all pass**

```bash
node --test src/lib/jobDiff.test.js
```

Expected: 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/jobDiff.js src/lib/jobDiff.test.js
git commit -m "feat(diff): job-meta name/notes diff + direction flag"
```

---

## Task 10: db.js — `createJob` accepts optional `source` field

**Files:**
- Modify: `src/db.js`

Tiny change: extend `createJob`'s argument shape with an optional `source` field. `updateJob` already accepts arbitrary patches, so it doesn't need editing. No DB version bump.

- [ ] **Step 1: Modify createJob**

Replace the existing `createJob` function in `src/db.js` (around line 107) with:

```js
export async function createJob({ name, client = '', location = '', notes = '', source = null }) {
  const db = await getDB();
  const job = {
    id: uid(),
    name, client, location, notes,
    source,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await db.put('jobs', job);
  return job;
}
```

- [ ] **Step 2: Smoke-test by running the existing e2e**

```bash
npm run test:e2e
```

Expected: passes (existing flow unchanged).

- [ ] **Step 3: Commit**

```bash
git add src/db.js
git commit -m "feat(db): createJob accepts optional source field for xlsx provenance"
```

---

## Task 11: xlsxRoundTrip — `applyParsedXlsxToNewJob`

**Files:**
- Create: `src/lib/xlsxRoundTrip.js`

Atomic creator. Takes a `ParsedXlsx` plus user-supplied job meta (name, client, location override the parsed values), creates a job + panels + rows + sheetNotes inside a single `idb` transaction.

- [ ] **Step 1: Implement**

`src/lib/xlsxRoundTrip.js`:

```js
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
```

- [ ] **Step 2: Sanity check via fake-indexeddb**

```bash
node -e "
import('fake-indexeddb/auto').then(async () => {
  const { applyParsedXlsxToNewJob } = await import('./src/lib/xlsxRoundTrip.js');
  const { listJobs, listPanels, listAllRows } = await import('./src/db.js');
  const parsed = {
    jobMeta: { name: 'Test', client: '', location: '', notes: 'job notes' },
    panels: [{ name: 'PNL-1', sourceRowIndex: 3 }],
    rowsBySheet: { 'Panels': [{ panelName: 'PNL-1', data: { 'Panel Name': 'PNL-1', 'Area': 'A' }, notes: '', sourceRowIndex: 3 }] },
    sheetNotes: [],
    warnings: [], errors: [],
  };
  const jobId = await applyParsedXlsxToNewJob(parsed, { name: 'Test Job', source: { kind: 'xlsx', filename: 't.xlsx', pulledAt: 1 } });
  const jobs = await listJobs();
  const panels = await listPanels(jobs[0].id);
  const rows = await listAllRows(panels[0].id);
  console.log('jobs:', jobs.length, 'panels:', panels.length, 'rows:', rows.length);
  console.log('source:', JSON.stringify(jobs[0].source));
});
"
```

Expected output: `jobs: 1 panels: 1 rows: 1` and `source: {"kind":"xlsx","filename":"t.xlsx","pulledAt":1}`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/xlsxRoundTrip.js
git commit -m "feat(roundtrip): applyParsedXlsxToNewJob — atomic create from parsed xlsx"
```

---

## Task 12: xlsxRoundTrip — `applyResyncToJob`

**Files:**
- Modify: `src/lib/xlsxRoundTrip.js`

Mutate an existing job to match a parsed xlsx, honoring per-row keep/drop decisions for the diff's `removed[]` rows. Photos: never deleted. If their owning row is removed, set `photo.rowId = null`.

- [ ] **Step 1: Implement**

Replace the placeholder `applyResyncToJob` in `src/lib/xlsxRoundTrip.js` with:

```js
export async function applyResyncToJob(jobId, parsed, diff, decisions) {
  // decisions: { removedRowIds: Set<string> } — row IDs the user accepted as removed.
  // Default: every diff.removed[] row is accepted unless explicitly kept.
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
```

- [ ] **Step 2: Smoke test**

```bash
node -e "
import('fake-indexeddb/auto').then(async () => {
  const { applyParsedXlsxToNewJob, applyResyncToJob } = await import('./src/lib/xlsxRoundTrip.js');
  const { diffJobs } = await import('./src/lib/jobDiff.js');
  const { listJobs, listPanels, listAllRows } = await import('./src/db.js');
  const schemaMap = (await import('./src/schema.json', { with: { type: 'json' } })).default;
  const parsed = {
    jobMeta: { name: 'T', client: '', location: '', notes: '' },
    panels: [{ name: 'P1', sourceRowIndex: 3 }],
    rowsBySheet: { 'Panels': [{ panelName: 'P1', data: { 'Panel Name': 'P1', 'Area': 'A' }, notes: '', sourceRowIndex: 3 }] },
    sheetNotes: [], warnings: [], errors: [],
  };
  const jobId = await applyParsedXlsxToNewJob(parsed, { name: 'T' });
  const jobs = await listJobs();
  const panels = await listPanels(jobs[0].id);
  const rows = await listAllRows(panels[0].id);

  // Mutate parsed and resync
  const parsed2 = JSON.parse(JSON.stringify(parsed));
  parsed2.rowsBySheet['Panels'][0].data['Area'] = 'B';
  const localState = {
    localJob: jobs[0],
    localPanels: panels,
    localRowsBySheet: { 'Panels': rows.filter((r) => r.sheet === 'Panels') },
    localSheetNotes: {},
  };
  const diff = diffJobs(localState, parsed2, schemaMap);
  const result = await applyResyncToJob(jobs[0].id, parsed2, diff, { removedRowIds: new Set() });
  const newRows = await listAllRows(panels[0].id);
  console.log('after resync, Area =', newRows.find((r) => r.sheet === 'Panels').data['Area']);
});
"
```

Expected: `after resync, Area = B`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/xlsxRoundTrip.js
git commit -m "feat(roundtrip): applyResyncToJob with photo detach + per-row keep/drop"
```

---

## Task 13: PullOrNewModal component

**Files:**
- Create: `src/components/PullOrNewModal.jsx`

Simple choice modal opened by the FAB. Uses existing `.modal-bg`, `.modal`, `.modal-list-btn` styles.

- [ ] **Step 1: Create the component**

`src/components/PullOrNewModal.jsx`:

```jsx
import React from 'react';
import Icon from './Icon.jsx';

export default function PullOrNewModal({ onClose, onNew, onPull }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Start an investigation</h2>
        <button className="modal-list-btn" type="button" onClick={onNew}>
          <Icon name="add" size={20} />
          <div className="modal-list-btn-text">
            <div className="modal-list-btn-title">New investigation</div>
            <div className="modal-list-btn-sub">Start a fresh job</div>
          </div>
        </button>
        <button className="modal-list-btn" type="button" onClick={onPull}>
          <Icon name="download" size={20} />
          <div className="modal-list-btn-text">
            <div className="modal-list-btn-title">Pull from xlsx</div>
            <div className="modal-list-btn-sub">Import an existing checklist</div>
          </div>
        </button>
        <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 'var(--sp-3)' }}>
          <button className="ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify imports**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds (component is unused but compiles).

- [ ] **Step 3: Commit**

```bash
git add src/components/PullOrNewModal.jsx
git commit -m "feat(ui): PullOrNewModal — FAB choice between New and Pull"
```

---

## Task 14: PullDialog component

**Files:**
- Create: `src/components/PullDialog.jsx`

The picker → parse → confirm → create flow for new-job pull. Stages: `'idle' | 'parsing' | 'confirm' | 'creating' | 'error'`. Done state navigates away so no `'done'` UI.

- [ ] **Step 1: Create the component**

`src/components/PullDialog.jsx`:

```jsx
import React, { useState, useRef } from 'react';
import Icon from './Icon.jsx';
import { parseChecklistXlsx } from '../lib/xlsxParser.js';
import { applyParsedXlsxToNewJob } from '../lib/xlsxRoundTrip.js';
import { nav } from '../App.jsx';
import { toast } from '../lib/toast.js';

const MAX_FILE_BYTES = 50 * 1024 * 1024;

function nameFromFilename(filename) {
  return filename.replace(/\.xlsx$/i, '').replace(/[_-]+/g, ' ').trim();
}

export default function PullDialog({ onClose, onCreated }) {
  const [stage, setStage] = useState('idle');
  const [error, setError] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [filename, setFilename] = useState('');
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [location, setLocation] = useState('');
  const [showAllWarnings, setShowAllWarnings] = useState(false);
  const inputRef = useRef(null);

  function pick() {
    inputRef.current?.click();
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.xlsx?$/i.test(file.name)) {
      toast.error('Pick a .xlsx file (e-OIC checklist).');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error('File looks too large to be a checklist (>50 MB).');
      return;
    }
    setStage('parsing');
    setError(null);
    setFilename(file.name);
    try {
      const buf = await file.arrayBuffer();
      const r = await parseChecklistXlsx(buf);
      if (r.errors.length > 0) {
        const e0 = r.errors[0];
        if (e0.kind === 'invalid-xlsx') setError('Couldn\'t read this file. Make sure it\'s an .xlsx exported from Excel or e-OIC.');
        else if (e0.kind === 'no-recognized-sheets') setError('This .xlsx doesn\'t look like an e-OIC checklist — none of the expected sheets were found.');
        else setError('Parse error: ' + e0.kind);
        setStage('error');
        return;
      }
      setParsed(r);
      setName(nameFromFilename(file.name));
      setStage('confirm');
    } catch (err) {
      console.error(err);
      setError(err.message || String(err));
      setStage('error');
    }
  }

  async function create() {
    if (!name.trim() || !parsed) return;
    setStage('creating');
    try {
      const jobId = await applyParsedXlsxToNewJob(parsed, {
        name: name.trim(),
        client: client.trim(),
        location: location.trim(),
        source: { kind: 'xlsx', filename, pulledAt: Date.now() },
      });
      toast.show(`Imported from ${filename}`);
      onCreated?.();
      nav(`/job/${jobId}`);
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.message || String(err));
      setStage('error');
    }
  }

  const totalRows = parsed
    ? Object.values(parsed.rowsBySheet).reduce((s, rs) => s + rs.length, 0)
    : 0;

  return (
    <div className="modal-bg" onClick={stage === 'parsing' || stage === 'creating' ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Pull from xlsx</h2>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={onFile}
        />

        {stage === 'idle' && (
          <>
            <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
              Pick the e-OIC checklist .xlsx from SharePoint (or anywhere).
              We&apos;ll parse it and create a new job populated from the data.
            </p>
            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={onClose}>Cancel</button>
              <button className="primary" onClick={pick}>
                <Icon name="download" size={16} /><span style={{ marginLeft: 6 }}>Choose file</span>
              </button>
            </div>
          </>
        )}

        {stage === 'parsing' && (
          <div className="export-progress">
            <div className="export-spinner" />
            <div className="export-progress-text">Reading {filename}…</div>
          </div>
        )}

        {stage === 'confirm' && parsed && (
          <>
            <div className="export-summary">
              <div><strong>{filename}</strong></div>
              <div className="export-summary-sub">
                {parsed.panels.length} panel{parsed.panels.length !== 1 ? 's' : ''} ·
                {' '}{totalRows} row{totalRows !== 1 ? 's' : ''} ·
                {' '}{parsed.sheetNotes.length} sheet note{parsed.sheetNotes.length !== 1 ? 's' : ''}
              </div>
            </div>

            {parsed.warnings.length > 0 && (
              <div className="warnings-block" style={{ background: 'var(--surface-alt)', padding: 'var(--sp-2)', borderRadius: 6, fontSize: 12, marginTop: 'var(--sp-2)' }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{parsed.warnings.length} warning{parsed.warnings.length !== 1 ? 's' : ''}</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {parsed.warnings.slice(0, showAllWarnings ? undefined : 3).map((w, i) => (
                    <li key={i}>{formatWarning(w)}</li>
                  ))}
                </ul>
                {parsed.warnings.length > 3 && !showAllWarnings && (
                  <button className="ghost" style={{ marginTop: 4, fontSize: 12 }} onClick={() => setShowAllWarnings(true)}>
                    Show all
                  </button>
                )}
              </div>
            )}

            <div className="field" style={{ marginTop: 'var(--sp-3)' }}>
              <label>Job name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="field">
              <label>Client (optional)</label>
              <input value={client} onChange={(e) => setClient(e.target.value)} />
            </div>
            <div className="field">
              <label>Location (optional)</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>

            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={onClose}>Cancel</button>
              <button className="primary" disabled={!name.trim()} onClick={create}>Create job</button>
            </div>
          </>
        )}

        {stage === 'creating' && (
          <div className="export-progress">
            <div className="export-spinner" />
            <div className="export-progress-text">Creating job…</div>
          </div>
        )}

        {stage === 'error' && (
          <>
            <div className="export-progress export-progress--error">
              <Icon name="warn" size={28} />
              <div className="export-progress-text">{error}</div>
            </div>
            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={onClose}>Close</button>
              <button className="primary" onClick={() => { setStage('idle'); setError(null); }}>Try again</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function formatWarning(w) {
  switch (w.kind) {
    case 'unknown-sheet': return `Sheet "${w.sheetName}" not in schema — skipped`;
    case 'missing-sheet': return `Sheet "${w.sheetName}" missing from xlsx`;
    case 'extra-column': return `Column "${w.columnName}" in ${w.sheetName} skipped`;
    case 'missing-column': return `Column "${w.columnName}" missing from ${w.sheetName}`;
    case 'unknown-panel-reference': return `${w.rowCount} row(s) in ${w.sheetName} reference unknown panel "${w.panelName}"`;
    case 'notes-row-unmatched': return `Note for "${w.label}" in ${w.sheetName} couldn't be matched to a row`;
    default: return JSON.stringify(w);
  }
}
```

- [ ] **Step 2: Build**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/PullDialog.jsx
git commit -m "feat(ui): PullDialog — pick .xlsx, parse, confirm, create new job"
```

---

## Task 15: DiffView component

**Files:**
- Create: `src/components/DiffView.jsx`
- Modify: `src/styles.css`

Renders a `JobDiff` (the structure produced by `diffJobs`). Row-level summary layout. Sheets default-collapsed if no changes. `removed[]` rows on Re-sync get keep/drop toggles. `direction` prop ('pull' or 'push') flips column labels.

- [ ] **Step 1: Create the component**

`src/components/DiffView.jsx`:

```jsx
import React, { useState } from 'react';
import Icon from './Icon.jsx';

export default function DiffView({ diff, direction = 'pull', removedDecisions, onToggleRemoved }) {
  const [expanded, setExpanded] = useState(() => initialExpanded(diff));

  const totalChanges = countChanges(diff);

  if (totalChanges === 0) {
    return (
      <div className="diff-empty">
        No changes detected.
      </div>
    );
  }

  return (
    <div className="diff-view">
      {diff.jobMeta.changed.length > 0 && (
        <div className="diff-section">
          <div className="diff-section-title">Job</div>
          {diff.jobMeta.changed.map((c, i) => (
            <div key={i} className="diff-row diff-row--mod">
              <span className="diff-mark">~</span>
              <span className="diff-label">{c.field}:</span>
              <span className="diff-old">{String(c.old || '(empty)')}</span>
              <span className="diff-arrow"> → </span>
              <span className="diff-new">{String(c.new || '(empty)')}</span>
            </div>
          ))}
        </div>
      )}

      {(diff.panels.added.length > 0 || diff.panels.removed.length > 0) && (
        <div className="diff-section">
          <div className="diff-section-title">Panels</div>
          {diff.panels.added.map((p, i) => (
            <div key={`pa${i}`} className="diff-row diff-row--add"><span className="diff-mark">+</span> {p.name}</div>
          ))}
          {diff.panels.removed.map((p, i) => (
            <div key={`pr${i}`} className="diff-row diff-row--del"><span className="diff-mark">−</span> {p.name}</div>
          ))}
        </div>
      )}

      {Object.entries(diff.sheets).map(([sheetName, sd]) => {
        const changeCount = sd.added.length + sd.removed.length + sd.modified.length;
        const isOpen = expanded[sheetName];
        return (
          <div key={sheetName} className="diff-section">
            <button
              type="button"
              className="diff-section-title diff-section-toggle"
              onClick={() => setExpanded((p) => ({ ...p, [sheetName]: !p[sheetName] }))}
            >
              <span className="diff-toggle-arrow">{isOpen ? '▼' : '▶'}</span>
              {sheetName}
              {changeCount > 0
                ? <span className="diff-count"> ({changeCount} change{changeCount !== 1 ? 's' : ''})</span>
                : <span className="diff-count diff-count--none"> no changes</span>}
              {sd.labelCollisions.length > 0 && (
                <span className="diff-collision" title="Position-matched: identical labels appear multiple times">⚠</span>
              )}
            </button>

            {isOpen && (
              <div className="diff-section-body">
                {sd.modified.map((m, i) => (
                  <div key={`m${i}`} className="diff-row diff-row--mod">
                    <span className="diff-mark">~</span> {m.label || '(unlabeled)'}
                    {m.fieldChanges.map((fc, j) => (
                      <div key={j} className="diff-field-change">
                        {fc.field}:{' '}
                        <span className="diff-old">{String(fc.old ?? '(empty)')}</span>
                        <span className="diff-arrow"> → </span>
                        <span className="diff-new">{String(fc.new ?? '(empty)')}</span>
                      </div>
                    ))}
                  </div>
                ))}
                {sd.added.map((r, i) => (
                  <div key={`a${i}`} className="diff-row diff-row--add">
                    <span className="diff-mark">+</span> {labelOrFallback(r, sheetName, sd, 'add', i)}
                  </div>
                ))}
                {sd.removed.map((r, i) => {
                  const accepted = removedDecisions ? removedDecisions.has(r.id) : true;
                  return (
                    <div key={`d${i}`} className="diff-row diff-row--del">
                      <span className="diff-mark">−</span> {labelOrFallback(r, sheetName, sd, 'del', i)}
                      {direction === 'pull' && onToggleRemoved && (
                        <span className="diff-keep-drop">
                          <button
                            type="button"
                            className={`diff-pill ${accepted ? '' : 'active'}`}
                            onClick={() => onToggleRemoved(r.id, false)}
                          >Keep local</button>
                          <button
                            type="button"
                            className={`diff-pill ${accepted ? 'active' : ''}`}
                            onClick={() => onToggleRemoved(r.id, true)}
                          >Accept removal</button>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {diff.skippedSheets.length > 0 && (
        <div className="diff-skip-block">
          {diff.skippedSheets.map((s, i) => (
            <div key={i} className="diff-skip">⊘ "{s}" sheet skipped (not in schema)</div>
          ))}
        </div>
      )}
      {diff.skippedColumns.length > 0 && (
        <div className="diff-skip-block">
          {diff.skippedColumns.map((c, i) => (
            <div key={i} className="diff-skip">⊘ "{c.columnName}" column skipped in {c.sheetName}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function initialExpanded(diff) {
  const out = {};
  for (const [name, sd] of Object.entries(diff.sheets)) {
    out[name] = sd.added.length + sd.removed.length + sd.modified.length > 0;
  }
  return out;
}

function countChanges(diff) {
  let n = diff.jobMeta.changed.length + diff.panels.added.length + diff.panels.removed.length
    + diff.sheetNotes.added.length + diff.sheetNotes.removed.length + diff.sheetNotes.modified.length;
  for (const sd of Object.values(diff.sheets)) {
    n += sd.added.length + sd.removed.length + sd.modified.length;
  }
  return n;
}

function labelOrFallback(r, sheetName, sd, kind, i) {
  // r may be a local row (with .data) or a parsed xlsx row (with .data) — both work.
  const data = r?.data || {};
  const panelName = data['Panel Name'] || '';
  const labelHint = panelName ? `${panelName} · ` : '';
  return `${labelHint}${kind === 'add' ? 'new row' : 'row'} (${(data[Object.keys(data).find((k) => k !== 'Panel Name')] || '?')})`;
}
```

- [ ] **Step 2: Append CSS**

Append to `src/styles.css`:

```css
/* DiffView */
.diff-view { font-size: 13px; line-height: 1.55; }
.diff-section { margin-bottom: var(--sp-2); }
.diff-section-title { font-weight: 600; color: var(--text); padding: 4px 0; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 6px; background: none; border-left: none; border-right: none; border-top: none; width: 100%; text-align: left; }
.diff-section-toggle { cursor: pointer; }
.diff-toggle-arrow { font-size: 10px; color: var(--text-dim); }
.diff-count { color: var(--text-dim); font-weight: 400; font-size: 12px; margin-left: auto; }
.diff-count--none { font-style: italic; }
.diff-collision { color: var(--warn, #e8d27d); margin-left: 4px; }
.diff-section-body { padding: 6px 0 6px 18px; }
.diff-row { padding: 3px 0; }
.diff-row--add { color: var(--accent-add, #2e8a4f); }
.diff-row--del { color: var(--accent-del, #b14848); }
.diff-row--mod { color: var(--accent-mod, #8a6a2e); }
.diff-mark { display: inline-block; width: 14px; font-weight: 700; }
.diff-label { font-weight: 500; }
.diff-old { text-decoration: line-through; opacity: 0.85; }
.diff-new { font-weight: 500; }
.diff-arrow { color: var(--text-dim); }
.diff-field-change { padding-left: 18px; color: var(--text-dim); font-size: 12px; }
.diff-keep-drop { margin-left: 10px; display: inline-flex; gap: 6px; }
.diff-pill { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--text-dim); cursor: pointer; }
.diff-pill.active { background: var(--accent); color: white; border-color: var(--accent); }
.diff-skip-block { margin-top: var(--sp-2); padding: var(--sp-2); background: var(--surface-alt); border-radius: 6px; font-size: 12px; }
.diff-skip { color: var(--text-dim); padding: 2px 0; }
.diff-empty { color: var(--text-dim); padding: var(--sp-3); text-align: center; font-style: italic; }
```

- [ ] **Step 3: Build**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/DiffView.jsx src/styles.css
git commit -m "feat(ui): DiffView component with row-level summary layout"
```

---

## Task 16: ResyncDialog component

**Files:**
- Create: `src/components/ResyncDialog.jsx`

Picker → parse → diff → apply flow. Uses `DiffView` for the diff stage.

- [ ] **Step 1: Create the component**

`src/components/ResyncDialog.jsx`:

```jsx
import React, { useState, useRef } from 'react';
import Icon from './Icon.jsx';
import DiffView from './DiffView.jsx';
import { parseChecklistXlsx } from '../lib/xlsxParser.js';
import { diffJobs } from '../lib/jobDiff.js';
import { applyResyncToJob } from '../lib/xlsxRoundTrip.js';
import schemaMap from '../schema.json' with { type: 'json' };
import { listPanels, listAllRows, getSheetNotes, updateJob } from '../db.js';
import { toast } from '../lib/toast.js';

const MAX_FILE_BYTES = 50 * 1024 * 1024;

export default function ResyncDialog({ job, onClose, onApplied }) {
  const [stage, setStage] = useState('idle');
  const [error, setError] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [diff, setDiff] = useState(null);
  const [filename, setFilename] = useState('');
  const [removedDecisions, setRemovedDecisions] = useState(new Set());
  const inputRef = useRef(null);

  const sourceHint = job.source?.filename;

  function pick() { inputRef.current?.click(); }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.xlsx?$/i.test(file.name)) { toast.error('Pick a .xlsx file.'); return; }
    if (file.size > MAX_FILE_BYTES) { toast.error('File looks too large (>50 MB).'); return; }
    setStage('parsing');
    setFilename(file.name);
    try {
      const buf = await file.arrayBuffer();
      const r = await parseChecklistXlsx(buf);
      if (r.errors.length > 0) {
        setError(r.errors[0].kind === 'invalid-xlsx'
          ? 'Couldn\'t read this file.'
          : 'This .xlsx doesn\'t look like an e-OIC checklist.');
        setStage('error'); return;
      }
      // Build local state for diff
      const panels = await listPanels(job.id);
      const localRowsBySheet = {};
      const localSheetNotes = {};
      for (const p of panels) {
        const rows = await listAllRows(p.id);
        for (const row of rows) {
          if (!localRowsBySheet[row.sheet]) localRowsBySheet[row.sheet] = [];
          localRowsBySheet[row.sheet].push(row);
        }
        for (const sn of Object.keys(schemaMap)) {
          const text = await getSheetNotes(p.id, sn);
          if (text) {
            if (!localSheetNotes[p.name]) localSheetNotes[p.name] = {};
            localSheetNotes[p.name][sn] = text;
          }
        }
      }
      const localState = { localJob: job, localPanels: panels, localRowsBySheet, localSheetNotes };
      const d = diffJobs(localState, r, schemaMap, { direction: 'pull' });
      setParsed(r);
      setDiff(d);
      // Default: accept all removals
      const decisions = new Set();
      for (const sd of Object.values(d.sheets)) {
        for (const rr of sd.removed) decisions.add(rr.id);
      }
      setRemovedDecisions(decisions);
      setStage('diff');
    } catch (err) {
      console.error(err);
      setError(err.message || String(err));
      setStage('error');
    }
  }

  function toggleRemoved(rowId, accept) {
    setRemovedDecisions((prev) => {
      const next = new Set(prev);
      if (accept) next.add(rowId); else next.delete(rowId);
      return next;
    });
  }

  async function apply() {
    setStage('applying');
    try {
      await applyResyncToJob(job.id, parsed, diff, { removedRowIds: removedDecisions });
      // Update source.pulledAt + filename
      await updateJob(job.id, {
        source: { kind: 'xlsx', filename, pulledAt: Date.now() },
      });
      toast.show('Re-sync applied');
      onApplied?.();
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.message || String(err));
      setStage('error');
    }
  }

  return (
    <div className="modal-bg" onClick={stage === 'parsing' || stage === 'applying' ? undefined : onClose}>
      <div className="export-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '85vh', overflow: 'auto' }}>
        <h2 className="modal-title">Re-sync from xlsx</h2>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={onFile} />

        {stage === 'idle' && (
          <>
            {sourceHint
              ? <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>You pulled this job from <strong>{sourceHint}</strong>. Pick that file (or a newer copy) to re-sync.</p>
              : <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Pick the e-OIC checklist .xlsx for this job.</p>}
            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={onClose}>Cancel</button>
              <button className="primary" onClick={pick}><Icon name="download" size={16}/><span style={{marginLeft:6}}>Choose file</span></button>
            </div>
          </>
        )}

        {stage === 'parsing' && (
          <div className="export-progress">
            <div className="export-spinner" />
            <div className="export-progress-text">Reading {filename}…</div>
          </div>
        )}

        {stage === 'diff' && diff && (
          <>
            <div className="export-summary"><strong>{filename}</strong></div>
            <DiffView diff={diff} direction="pull" removedDecisions={removedDecisions} onToggleRemoved={toggleRemoved} />
            <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 'var(--sp-3)' }}>
              <button className="ghost" onClick={onClose}>Cancel</button>
              <button className="primary" onClick={apply}>Apply changes</button>
            </div>
          </>
        )}

        {stage === 'applying' && (
          <div className="export-progress"><div className="export-spinner" /><div className="export-progress-text">Applying…</div></div>
        )}

        {stage === 'error' && (
          <>
            <div className="export-progress export-progress--error">
              <Icon name="warn" size={28} />
              <div className="export-progress-text">{error}</div>
            </div>
            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={onClose}>Close</button>
              <button className="primary" onClick={() => { setStage('idle'); setError(null); }}>Try again</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/ResyncDialog.jsx
git commit -m "feat(ui): ResyncDialog — pick .xlsx, diff, apply with photo detach"
```

---

## Task 17: exporter — `mode: 'xlsx-only'` option

**Files:**
- Modify: `src/exporter.js`

Today `buildExport` always returns a zip. Add `mode: 'zip' | 'xlsx-only'` (default `'zip'`). When `'xlsx-only'`, skip the photos/CSV/backup steps, return the bare xlsx blob with a `.xlsx` filename.

- [ ] **Step 1: Modify buildExport signature**

In `src/exporter.js`, change the `buildExport` signature (line ~65) to:

```js
export async function buildExport(job, {
  templateUrl = './template.xlsx',
  onProgress = () => {},
  mode = 'zip',
  filename: filenameOverride = null,
} = {}) {
```

- [ ] **Step 2: Branch return after xlsx is built**

The exporter's serialize step writes `xlsxBuf` (around line 360). After all the `fixZip` passes complete and the final xlsx buffer is ready, but BEFORE the zip-bundling block starts, add an early return for `xlsx-only` mode. Find the line `// 6. Serialize` (or similar — search for `xlsxBuf = await wb.xlsx.writeBuffer()`). After all the `fixZip` mutations, locate where the JSZip wrapping starts (search for `const zip = new JSZip()` or `const finalZip = new JSZip()`). Just before that block, insert:

```js
  // 'xlsx-only' mode: ship just the xlsx, no zip wrapper, no photos/csv/backup.
  if (mode === 'xlsx-only') {
    onProgress({ phase: 'finalizing', percent: 95 });
    const blob = new Blob([xlsxBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const xlsxFilename = filenameOverride || `${safe(job.name)}.xlsx`;
    onProgress({ phase: 'done', percent: 100 });
    return { blob, filename: xlsxFilename, sizeBytes: blob.size };
  }
```

(The exact insertion point depends on the current exporter shape; search for the block that constructs the final zip and add the branch immediately above it. The implementer should read the surrounding lines to make sure `xlsxBuf` is defined and `safe(job.name)` is in scope — they are, per current exports.)

- [ ] **Step 3: Run e2e to verify zip mode unchanged**

```bash
npm run test:e2e
```

Expected: passes.

- [ ] **Step 4: Smoke test xlsx-only**

```bash
node -e "
import('fake-indexeddb/auto').then(async () => {
  const fs = await import('node:fs');
  globalThis.fetch = async (url) => {
    const p = url.startsWith('./') ? './public/' + url.slice(2) : './public/' + url;
    const buf = fs.readFileSync(p);
    return { ok: true, status: 200,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      json: async () => JSON.parse(buf.toString('utf8')),
      text: async () => buf.toString('utf8') };
  };
  const { importJSON, getJob } = await import('./src/db.js');
  const { buildExport } = await import('./src/exporter.js');
  const seed = JSON.parse(fs.readFileSync('./public/seed.json', 'utf8'));
  await importJSON(seed, { mode: 'replace' });
  const job = await getJob(seed.jobs[0].id);
  const r = await buildExport(job, { mode: 'xlsx-only' });
  console.log('xlsx-only:', r.filename, r.sizeBytes, 'bytes');
  console.log('expected .xlsx ext:', r.filename.endsWith('.xlsx'));
});
"
```

Expected: filename ends in `.xlsx`, size > 10 KB.

- [ ] **Step 5: Commit**

```bash
git add src/exporter.js
git commit -m "feat(export): buildExport mode 'xlsx-only' returns bare xlsx blob"
```

---

## Task 18: ExportDialog — push mode + diff confirm

**Files:**
- Modify: `src/components/ExportDialog.jsx`

Add a small mode toggle at the top of the `config` stage. In `xlsx-only` mode with a target file picked, show diff via DiffView before generating.

- [ ] **Step 1: Replace ExportDialog with the extended version**

Read the full current contents of `src/components/ExportDialog.jsx` and replace with the version below (this preserves the existing zip flow while adding the push mode):

```jsx
import React, { useState, useEffect, useRef } from 'react';
import Icon from './Icon.jsx';
import DiffView from './DiffView.jsx';
import { buildExport, downloadBlob, shareBlob } from '../exporter.js';
import { parseChecklistXlsx } from '../lib/xlsxParser.js';
import { diffJobs } from '../lib/jobDiff.js';
import { getJobSizeEstimate, listPanels, listAllRows, getSheetNotes, updateJob } from '../db.js';
import schemaMap from '../schema.json' with { type: 'json' };
import { toast } from '../lib/toast.js';

const MAX_FILE_BYTES = 50 * 1024 * 1024;

export default function ExportDialog({ job, onClose }) {
  const [mode, setMode] = useState('zip'); // 'zip' | 'xlsx-only'
  const [stage, setStage] = useState('config');
  // Push-mode specific stages: 'config' | 'parsing-target' | 'push-diff' | 'generating' | 'done' | 'error'
  const [progress, setProgress] = useState({ percent: 0, phase: '', detail: '' });
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(null);
  const [targetParsed, setTargetParsed] = useState(null);
  const [targetDiff, setTargetDiff] = useState(null);
  const [targetFilename, setTargetFilename] = useState('');
  const targetInputRef = useRef(null);

  const hasSource = !!job.source?.filename;

  useEffect(() => { getJobSizeEstimate(job.id).then(setStats); }, [job.id]);

  async function generate(buildMode, filenameOverride) {
    setStage('generating');
    setError(null);
    setResult(null);
    setProgress({ percent: 0, phase: 'starting', detail: '' });
    try {
      const r = await buildExport(job, {
        onProgress: setProgress,
        mode: buildMode,
        filename: filenameOverride,
      });
      setResult(r);
      setStage('done');
    } catch (e) {
      console.error(e);
      let msg = e.message || 'Export failed';
      if (/quota|memory|out of memory/i.test(msg)) {
        msg = 'Ran out of memory while building the export. Try exporting fewer panels at a time, or close other browser tabs.';
      } else if (/template/i.test(msg)) {
        msg = 'Could not load template.xlsx. The app may need to be reopened to refresh its cache.';
      }
      setError(msg);
      toast.error('Export failed: ' + msg);
      setStage('error');
    }
  }

  function pickTarget() { targetInputRef.current?.click(); }

  async function onTargetFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.xlsx?$/i.test(file.name)) { toast.error('Pick a .xlsx file.'); return; }
    if (file.size > MAX_FILE_BYTES) { toast.error('File looks too large (>50 MB).'); return; }
    setStage('parsing-target');
    setTargetFilename(file.name);
    try {
      const buf = await file.arrayBuffer();
      const r = await parseChecklistXlsx(buf);
      if (r.errors.length > 0) {
        toast.error('Couldn\'t read target file. Saving as new instead.');
        await generate('xlsx-only', `${stripExt(file.name)}.xlsx`);
        return;
      }
      const panels = await listPanels(job.id);
      const localRowsBySheet = {};
      const localSheetNotes = {};
      for (const p of panels) {
        const rows = await listAllRows(p.id);
        for (const row of rows) {
          if (!localRowsBySheet[row.sheet]) localRowsBySheet[row.sheet] = [];
          localRowsBySheet[row.sheet].push(row);
        }
        for (const sn of Object.keys(schemaMap)) {
          const text = await getSheetNotes(p.id, sn);
          if (text) {
            if (!localSheetNotes[p.name]) localSheetNotes[p.name] = {};
            localSheetNotes[p.name][sn] = text;
          }
        }
      }
      const d = diffJobs(
        { localJob: job, localPanels: panels, localRowsBySheet, localSheetNotes },
        r, schemaMap, { direction: 'push' },
      );
      setTargetParsed(r);
      setTargetDiff(d);
      setStage('push-diff');
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to read target file');
      setStage('config');
    }
  }

  async function confirmPush() {
    await updateJob(job.id, {
      source: { kind: 'xlsx', filename: targetFilename, pulledAt: Date.now() },
    });
    await generate('xlsx-only', targetFilename);
  }

  async function saveAsNew() {
    const fn = job.source?.filename || `${stripExt(job.name) || 'export'}.xlsx`;
    await generate('xlsx-only', fn);
  }

  function onDownload() {
    if (!result) return;
    downloadBlob(result.blob, result.filename);
    toast.show('Downloaded');
  }

  async function onShare() {
    if (!result) return;
    try {
      const shared = await shareBlob(result.blob, result.filename, job.name);
      if (!shared) {
        downloadBlob(result.blob, result.filename);
        toast.show('Share not supported — downloaded instead');
      }
    } catch (e) {
      if (e.name !== 'AbortError') toast.error(e.message || 'Share failed');
    }
  }

  const sizeMB = result ? (result.sizeBytes / 1024 / 1024).toFixed(1) : null;
  const progressText = progress.phase
    ? `${progress.phase}${progress.detail ? ` · ${progress.detail}` : ''}`
    : 'Working…';

  return (
    <div className="modal-bg" onClick={stage === 'generating' || stage === 'parsing-target' ? undefined : onClose}>
      <div className="export-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '85vh', overflow: 'auto' }}>
        <div className="sheet-picker-grip" aria-hidden="true" />
        <h2 className="modal-title">Export job</h2>

        <input ref={targetInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={onTargetFile} />

        {stage === 'config' && (
          <>
            <div className="export-mode-toggle" style={{ display: 'flex', gap: 8, marginBottom: 'var(--sp-3)' }}>
              <button
                type="button"
                className={mode === 'zip' ? 'primary' : 'ghost'}
                onClick={() => setMode('zip')}
              >Build Export (zip)</button>
              <button
                type="button"
                className={mode === 'xlsx-only' ? 'primary' : 'ghost'}
                onClick={() => setMode('xlsx-only')}
              >Push to xlsx</button>
            </div>

            <div className="export-summary">
              <div><strong>{job.name}</strong></div>
              <div className="export-summary-sub">
                {stats
                  ? `${stats.panels} panel${stats.panels !== 1 ? 's' : ''} · ${stats.rows} row${stats.rows !== 1 ? 's' : ''} · ${stats.photos} photo${stats.photos !== 1 ? 's' : ''}`
                  : 'Calculating…'}
              </div>
            </div>

            {mode === 'zip' && (
              <>
                <div className="export-summary-sub" style={{ marginTop: 6 }}>
                  Builds a .zip with the populated spreadsheet, a photo-metadata CSV (with GPS), and photos organized by panel and item.
                </div>
                <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 'var(--sp-3)' }}>
                  <button className="ghost" onClick={onClose}>Cancel</button>
                  <button className="primary" onClick={() => generate('zip')}>
                    <Icon name="download" size={16} /><span style={{ marginLeft: 6 }}>Build Export</span>
                  </button>
                </div>
              </>
            )}

            {mode === 'xlsx-only' && (
              <>
                {hasSource ? (
                  <div className="export-summary-sub" style={{ marginTop: 6 }}>
                    Pulled from <strong>{job.source.filename}</strong>. Pick that file to overwrite (with diff), or save as new.
                  </div>
                ) : (
                  <div className="export-summary-sub" style={{ marginTop: 6 }}>
                    Saves the bare .xlsx (no photos, no csv, no backup). Route the file to SharePoint via the share sheet.
                  </div>
                )}
                <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 'var(--sp-3)', flexWrap: 'wrap' }}>
                  <button className="ghost" onClick={onClose}>Cancel</button>
                  {hasSource && (
                    <button className="primary" onClick={pickTarget}>
                      <Icon name="download" size={16}/><span style={{marginLeft:6}}>Pick target file</span>
                    </button>
                  )}
                  <button className={hasSource ? '' : 'primary'} onClick={saveAsNew}>
                    <Icon name="download" size={16}/><span style={{marginLeft:6}}>Save as new</span>
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {stage === 'parsing-target' && (
          <div className="export-progress"><div className="export-spinner" /><div className="export-progress-text">Reading {targetFilename}…</div></div>
        )}

        {stage === 'push-diff' && targetDiff && (
          <>
            <div className="export-summary"><strong>Pushing to {targetFilename}</strong></div>
            <DiffView diff={targetDiff} direction="push" />
            <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 'var(--sp-3)' }}>
              <button className="ghost" onClick={() => setStage('config')}>Back</button>
              <button className="primary" onClick={confirmPush}>Generate xlsx</button>
            </div>
          </>
        )}

        {stage === 'generating' && (
          <div className="export-progress">
            <div className="export-spinner" />
            <div className="export-progress-text">{progressText}</div>
            <div className="progress-bar" style={{ width: '100%' }}>
              <div className="progress-bar-fill" style={{ width: `${progress.percent || 0}%` }} />
            </div>
          </div>
        )}

        {stage === 'done' && result && (
          <>
            <div className="export-progress export-progress--done">
              <div className="export-check"><Icon name="check" size={28} strokeWidth={2.5} /></div>
              <div className="export-progress-text">Ready: {result.filename}</div>
              <div className="export-summary-sub">{sizeMB} MB</div>
            </div>
            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={onClose}>Done</button>
              <button onClick={onDownload}><Icon name="download" size={16} /><span style={{ marginLeft: 6 }}>Download</span></button>
              <button className="primary" onClick={onShare}><Icon name="link" size={16} /><span style={{ marginLeft: 6 }}>Share / Email / Cloud</span></button>
            </div>
          </>
        )}

        {stage === 'error' && (
          <>
            <div className="export-progress export-progress--error">
              <Icon name="warn" size={28} />
              <div className="export-progress-text">{error || 'Export failed.'}</div>
            </div>
            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={onClose}>Close</button>
              <button className="primary" onClick={() => generate(mode === 'xlsx-only' ? 'xlsx-only' : 'zip')}>
                <Icon name="refresh" size={16} /><span style={{ marginLeft: 6 }}>Try again</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function stripExt(s) {
  return s.replace(/\.[^.]+$/, '');
}
```

- [ ] **Step 2: Build**

```bash
npm run build 2>&1 | tail -20
```

Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/ExportDialog.jsx
git commit -m "feat(ui): ExportDialog push mode with target-file diff confirm"
```

---

## Task 19: JobView — Re-sync + Disconnect menu items

**Files:**
- Modify: `src/components/JobView.jsx`

Add two new entries to the existing options/menu pattern in `JobView.jsx`. The implementer should read the file first to find where the existing options menu is defined (look for the existing Edit/Export/Delete trio).

- [ ] **Step 1: Read JobView and add the imports**

At the top of `src/components/JobView.jsx`, add:

```jsx
import ResyncDialog from './ResyncDialog.jsx';
import { updateJob } from '../db.js';
```

(Verify these don't duplicate existing imports; merge if needed.)

- [ ] **Step 2: Add state and handlers inside the JobView component**

In the `JobView` component body (alongside whatever existing state hooks live there), add:

```jsx
const [resyncing, setResyncing] = useState(false);
const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

async function handleDisconnect() {
  await updateJob(job.id, { source: null });
  setConfirmingDisconnect(false);
  // Refresh the job state — call whichever existing refresh function the
  // JobView already uses (e.g., setJob, refresh). The implementer must
  // identify the local refresh path and call it here.
}
```

- [ ] **Step 3: Add menu entries**

Locate the existing options menu (button list) in JobView. Add two new entries: "Re-sync from xlsx" (always visible) and "Disconnect from xlsx" (visible only when `job.source != null`). Match the styling of the existing menu items.

Example pattern (adapt to actual menu structure):

```jsx
<button className="menu-item" onClick={() => setResyncing(true)}>
  <Icon name="refresh" size={16} />
  <span>Re-sync from xlsx</span>
</button>
{job.source && (
  <button className="menu-item" onClick={() => setConfirmingDisconnect(true)}>
    <Icon name="link" size={16} />
    <span>Disconnect from xlsx</span>
  </button>
)}
```

- [ ] **Step 4: Render the dialogs at the bottom of the component**

Inside JobView's main return block, alongside other dialog renders:

```jsx
{resyncing && (
  <ResyncDialog
    job={job}
    onClose={() => setResyncing(false)}
    onApplied={() => { /* refresh */ }}
  />
)}
{confirmingDisconnect && (
  <div className="modal-bg" onClick={() => setConfirmingDisconnect(false)}>
    <div className="modal" onClick={(e) => e.stopPropagation()}>
      <h2 className="modal-title">Disconnect from xlsx?</h2>
      <p style={{ color: 'var(--text-dim)' }}>
        This job will no longer be linked to <strong>{job.source?.filename}</strong>.
        Future pushes will save as new.
      </p>
      <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
        <button className="ghost" onClick={() => setConfirmingDisconnect(false)}>Cancel</button>
        <button className="primary" onClick={handleDisconnect}>Disconnect</button>
      </div>
    </div>
  </div>
)}
```

The implementer should locate JobView's existing job-refresh function (whatever is called after Edit/Delete returns) and invoke it inside `handleDisconnect` and `onApplied` to keep the UI fresh.

- [ ] **Step 5: Build**

```bash
npm run build 2>&1 | tail -20
```

Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/JobView.jsx
git commit -m "feat(ui): JobView — Re-sync from xlsx + Disconnect from xlsx menu items"
```

---

## Task 20: JobList — wire FAB to PullOrNewModal

**Files:**
- Modify: `src/components/JobList.jsx`

The current FAB tap sets `creating: true` which directly opens `JobModal`. Change it to open `PullOrNewModal`, with branches that either open the existing `JobModal` (New) or `PullDialog` (Pull).

- [ ] **Step 1: Add imports**

At the top of `src/components/JobList.jsx`, add:

```jsx
import PullOrNewModal from './PullOrNewModal.jsx';
import PullDialog from './PullDialog.jsx';
```

- [ ] **Step 2: Replace state**

Find the `const [creating, setCreating] = useState(false);` line. Replace with:

```jsx
const [choosing, setChoosing] = useState(false);
const [creating, setCreating] = useState(false);
const [pulling, setPulling] = useState(false);
```

- [ ] **Step 3: Update FAB onClick and dialog renders**

Find:

```jsx
<button className="fab" onClick={() => setCreating(true)} aria-label="New job">
```

Change to:

```jsx
<button className="fab" onClick={() => setChoosing(true)} aria-label="New job">
```

Find:

```jsx
{creating && <JobModal onClose={() => setCreating(false)} onSaved={refresh} />}
```

Replace with:

```jsx
{choosing && (
  <PullOrNewModal
    onClose={() => setChoosing(false)}
    onNew={() => { setChoosing(false); setCreating(true); }}
    onPull={() => { setChoosing(false); setPulling(true); }}
  />
)}
{creating && <JobModal onClose={() => setCreating(false)} onSaved={refresh} />}
{pulling && <PullDialog onClose={() => setPulling(false)} onCreated={refresh} />}
```

- [ ] **Step 4: Build**

```bash
npm run build 2>&1 | tail -20
```

Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/JobList.jsx
git commit -m "feat(ui): JobList FAB opens PullOrNewModal"
```

---

## Task 21: e2e — round-trip + resync assertions

**Files:**
- Modify: `scripts/e2e-test.mjs`

After the existing export step, add three assertions: round-trip parse, resync no-op diff, resync with one cell mutation.

- [ ] **Step 1: Add assertions to scripts/e2e-test.mjs**

Read the current end of `scripts/e2e-test.mjs`. After the line that confirms the xlsx wrote successfully (look for `[e2e] export produced` or the openpyxl validation), append:

```js
// =============================================================
// Round-trip parse + resync assertions
// =============================================================

console.log('[e2e] running parser round-trip…');
const { default: JSZip } = await import('jszip');
const zipBuf = await result.blob.arrayBuffer();
const zip = await JSZip.loadAsync(zipBuf);
const xlsxName = Object.keys(zip.files).find((f) => f.endsWith('.xlsx'));
if (!xlsxName) throw new Error('no xlsx in export zip');
const xlsxBuf = await zip.file(xlsxName).async('arraybuffer');

const { parseChecklistXlsx } = await import('../src/lib/xlsxParser.js');
const parsed = await parseChecklistXlsx(xlsxBuf);
if (parsed.errors.length > 0) {
  console.error('[e2e] parser errors:', parsed.errors);
  throw new Error('parser returned errors on round-trip');
}
console.log(`[e2e] parser: ${parsed.panels.length} panels, ${Object.values(parsed.rowsBySheet).reduce((s, r) => s + r.length, 0)} rows, ${parsed.warnings.length} warnings`);

console.log('[e2e] running resync no-op diff…');
const { diffJobs } = await import('../src/lib/jobDiff.js');
const { default: schemaMap } = await import('../src/schema.json', { with: { type: 'json' } });
const { getSheetNotes } = await import('../src/db.js');

const localPanels = panels;
const localRowsBySheet = {};
const localSheetNotes = {};
for (const p of localPanels) {
  const rs = await listAllRows(p.id);
  for (const r of rs) {
    if (!localRowsBySheet[r.sheet]) localRowsBySheet[r.sheet] = [];
    localRowsBySheet[r.sheet].push(r);
  }
  for (const sn of Object.keys(schemaMap)) {
    const txt = await getSheetNotes(p.id, sn);
    if (txt) {
      if (!localSheetNotes[p.name]) localSheetNotes[p.name] = {};
      localSheetNotes[p.name][sn] = txt;
    }
  }
}
const localState = { localJob: job, localPanels, localRowsBySheet, localSheetNotes };
const noopDiff = diffJobs(localState, parsed, schemaMap);

let totalChanges = noopDiff.jobMeta.changed.length + noopDiff.panels.added.length + noopDiff.panels.removed.length;
for (const sd of Object.values(noopDiff.sheets)) {
  totalChanges += sd.added.length + sd.removed.length + sd.modified.length;
}
totalChanges += noopDiff.sheetNotes.added.length + noopDiff.sheetNotes.removed.length + noopDiff.sheetNotes.modified.length;

console.log(`[e2e] no-op diff: ${totalChanges} changes (expected 0)`);
// Allow up to 0 but log details if any.
if (totalChanges !== 0) {
  console.warn('[e2e] no-op diff revealed changes:');
  for (const c of noopDiff.jobMeta.changed) console.warn('  jobMeta:', c.field, JSON.stringify(c.old), '→', JSON.stringify(c.new));
  for (const p of noopDiff.panels.added) console.warn('  panel +', p.name);
  for (const p of noopDiff.panels.removed) console.warn('  panel −', p.name);
  for (const [sn, sd] of Object.entries(noopDiff.sheets)) {
    if (sd.added.length || sd.removed.length || sd.modified.length) {
      console.warn(`  ${sn}: +${sd.added.length} −${sd.removed.length} ~${sd.modified.length}`);
      for (const m of sd.modified) {
        for (const fc of m.fieldChanges) console.warn(`    ~${m.label}.${fc.field}: ${JSON.stringify(fc.old)} → ${JSON.stringify(fc.new)}`);
      }
    }
  }
  throw new Error('round-trip diff is not a no-op — parser/exporter divergence');
}

console.log('[e2e] running resync-with-edit assertion…');
// Mutate one row's data and assert exactly one modified row appears.
const sheetWithRows = Object.keys(parsed.rowsBySheet).find((s) => parsed.rowsBySheet[s].length > 0);
if (sheetWithRows) {
  const editedParsed = JSON.parse(JSON.stringify(parsed));
  const targetRow = editedParsed.rowsBySheet[sheetWithRows][0];
  // Mutate any string field that's not Panel Name
  const editableField = Object.keys(targetRow.data).find((k) => k !== 'Panel Name' && typeof targetRow.data[k] === 'string');
  if (editableField) {
    targetRow.data[editableField] = 'CHANGED-' + targetRow.data[editableField];
    const editDiff = diffJobs(localState, editedParsed, schemaMap);
    const sd = editDiff.sheets[sheetWithRows];
    const mods = sd.modified.length;
    if (mods !== 1) throw new Error(`expected exactly 1 modified row in ${sheetWithRows}, got ${mods}`);
    const fc = sd.modified[0].fieldChanges.find((f) => f.field === editableField);
    if (!fc) throw new Error(`expected fieldChange on ${editableField}`);
    console.log(`[e2e] edit detected: ${sheetWithRows}.${editableField} → "${fc.new}"`);
  }
}

console.log('[e2e] round-trip + resync assertions passed.');
```

- [ ] **Step 2: Run**

```bash
npm run test:e2e
```

Expected: existing assertions pass + new lines `[e2e] no-op diff: 0 changes` and `[e2e] round-trip + resync assertions passed.`.

- [ ] **Step 3: Commit**

```bash
git add scripts/e2e-test.mjs
git commit -m "test(e2e): add parser round-trip and resync diff assertions"
```

---

## Task 22: Version bump + push

**Files:**
- Modify: `src/version.js`
- Modify: `public/service-worker.js`

- [ ] **Step 1: Bump src/version.js**

Replace the `BUILD_VERSION` constant in `src/version.js`:

```js
export const BUILD_VERSION = 'v32';
```

- [ ] **Step 2: Bump public/service-worker.js**

Replace the `VERSION` constant in `public/service-worker.js`:

```js
const VERSION = 'v32';
```

- [ ] **Step 3: Final build**

```bash
npm run build 2>&1 | tail -20
```

Expected: succeeds.

- [ ] **Step 4: Final e2e**

```bash
npm run test:e2e
```

Expected: all assertions pass including the new round-trip ones.

- [ ] **Step 5: Commit and push**

```bash
git add src/version.js public/service-worker.js
git commit -m "chore(release): v32 — SharePoint xlsx round-trip"
git push origin main
```

Expected: push succeeds, GitHub Actions kicks off automatic deploy.

---

## Done

After Task 22, `git log --oneline` should show ~22 new commits. CI runs `npm run test:e2e` against fake-indexeddb, asserting the round-trip is a no-op. The `sample-export` artifact attached to the Actions run holds the freshly-exported xlsx for inspection.
