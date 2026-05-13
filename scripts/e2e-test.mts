// scripts/e2e-test.mts
//
// End-to-end test for the export pipeline.
//
// Spins up an in-memory IndexedDB shim (fake-indexeddb), seeds it from
// public/seed.json using the same db.ts + importJSON path the browser uses,
// runs buildExport(), and writes the produced zip to /tmp for inspection.
// A second pass re-extracts the xlsx from the zip and runs a Python
// openpyxl validation to confirm the workbook opens cleanly.
//
// Usage: tsx scripts/e2e-test.mts
// Exit code 0 on success, non-zero on any failure.

import 'fake-indexeddb/auto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import type { IBackupSnapshot } from '../src/db.js';
import type { IExportProgress } from '../src/exporter.js';
import type { IJob, IPanel, IRow } from '../src/types/job.js';
import type { IParsedXlsx, IParsedRow, ISheetSchema, IDiffJobsLocalState } from '../src/types/xlsx.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Minimal Response-shaped object the exporter/parser consume. They only call
// ok/status/arrayBuffer/json/text — not the full Fetch API — so a hand-rolled
// shape is sufficient and avoids dragging in lib.dom for a Node script.
interface IFakeFetchResponse {
    ok: boolean;
    status: number;
    arrayBuffer: () => Promise<ArrayBuffer>;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
}

// Polyfill `fetch` for the exporter's `fetch(templateUrl)` call. The
// templateUrl is a relative web URL in browser; here we map it to a local
// file read so the rest of the exporter is unchanged.
const fakeFetch = async (url: string): Promise<IFakeFetchResponse> => {
    let p: string;
    if (url.startsWith('http')) {
        throw new Error('e2e-test does not allow network fetches');
    } else if (url.startsWith('./')) {
        p = path.join(ROOT, 'public', url.slice(2));
    } else {
        p = path.join(ROOT, 'public', url);
    }
    const buf = fs.readFileSync(p);
    return {
        ok: true,
        status: 200,
        arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
        json: async () => JSON.parse(buf.toString('utf8')) as unknown,
        text: async () => buf.toString('utf8'),
    };
};
// Cast through unknown because our fake only implements the subset the
// exporter actually uses; a full Fetch typedef would force us to stub
// dozens of unused methods.
(globalThis as { fetch: typeof fetch }).fetch = fakeFetch as unknown as typeof fetch;

// Minimal Blob/File polyfill check — Node 20+ has these natively.
if (typeof Blob === 'undefined') {
    throw new Error('Node 20+ required (Blob is missing).');
}

console.log('[e2e] importing app modules…');
const { importJSON, getJob, listPanels, listAllRows, getSheetNotes } = await import('../src/db.js');
const { buildExport } = await import('../src/exporter.js');

console.log('[e2e] loading public/seed.json…');
const seed = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'public', 'seed.json'), 'utf8'),
) as IBackupSnapshot;
const stats = await importJSON(seed, { mode: 'replace' });
console.log(`[e2e] imported: ${stats.jobs} job(s), ${stats.panels} panels, ${stats.rows} rows, ${stats.photos} photos`);

const seedJob = seed.jobs[0];
if (!seedJob) throw new Error('seed.json has no jobs');
const job: IJob | undefined = await getJob(seedJob.id);
if (!job) throw new Error('seeded job not found in fake-indexeddb');

const panels: IPanel[] = await listPanels(job.id);
console.log(`[e2e] panels under job: ${panels.map((p) => p.name).join(', ')}`);

let totalRows = 0;
for (const p of panels) {
    const rows = await listAllRows(p.id);
    totalRows += rows.length;
}
console.log(`[e2e] total rows across panels: ${totalRows}`);

console.log('[e2e] running buildExport()…');
const phases: IExportProgress[] = [];
const result = await buildExport(job, {
    templateUrl: './template.xlsx',
    onProgress: (p) => phases.push(p),
});
console.log(`[e2e] export produced: ${result.filename} (${result.sizeBytes} bytes)`);
console.log(`[e2e] phases: ${phases.map((p) => p.phase).join(' -> ')}`);

const outDir = '/tmp/eoic-e2e';
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const zipPath = path.join(outDir, result.filename);
fs.writeFileSync(zipPath, Buffer.from(await result.blob.arrayBuffer()));
console.log(`[e2e] wrote zip -> ${zipPath}`);

// Extract the zip and locate the xlsx inside it.
const { default: JSZip } = await import('jszip');
const innerZip = await JSZip.loadAsync(fs.readFileSync(zipPath));
const xlsxFiles = Object.keys(innerZip.files).filter((f) => f.endsWith('.xlsx'));
if (xlsxFiles.length !== 1) {
    throw new Error(`expected exactly 1 xlsx in zip, found ${xlsxFiles.length}: ${xlsxFiles.join(', ')}`);
}
const xlsxName = xlsxFiles[0]!;
const xlsxFile = innerZip.file(xlsxName);
if (!xlsxFile) throw new Error(`xlsx ${xlsxName} missing from zip`);
const xlsxBuf = await xlsxFile.async('nodebuffer');
const xlsxOut = path.join(outDir, xlsxName);
fs.writeFileSync(xlsxOut, xlsxBuf);
console.log(`[e2e] extracted -> ${xlsxOut}`);

// Validate with openpyxl (strict-ish parser; catches schema issues).
console.log('[e2e] validating xlsx with openpyxl…');
const venvPython = '/tmp/xlvenv/bin/python';
if (!fs.existsSync(venvPython)) {
    console.warn('[e2e] /tmp/xlvenv/bin/python not found; skipping openpyxl validation');
} else {
    const out = execSync(
        `${venvPython} -c "import openpyxl,sys,json; wb=openpyxl.load_workbook(r'${xlsxOut}'); print(json.dumps({'sheets': wb.sheetnames, 'sheet_count': len(wb.sheetnames)}))"`,
        { encoding: 'utf8' },
    ).trim();
    const parsedOpenpyxl = JSON.parse(out) as { sheets: string[]; sheet_count: number };
    console.log(`[e2e] openpyxl: ${parsedOpenpyxl.sheet_count} sheets — ${parsedOpenpyxl.sheets.join(', ')}`);
}

// Regression checks for the post-process pipeline (v8-v11 fixes).
// These catch silent breakage of the workarounds for ExcelJS bugs.
console.log('[e2e] regression-checking xlsx structure…');
{
    const xlsxZip = await JSZip.loadAsync(xlsxBuf);
    const sheetNames = Object.keys(xlsxZip.files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f));
    const tableNames = Object.keys(xlsxZip.files).filter((f) => /^xl\/tables\/table\d+\.xml$/.test(f));

    for (const f of sheetNames) {
        const entry = xlsxZip.file(f);
        if (!entry) throw new Error(`zip entry ${f} disappeared between listing and read`);
        const xml = await entry.async('string');
        if (xml.includes('4294967295')) {
            throw new Error(`regression: ${f} contains uint32-max DPI sentinel (v9 fix broken)`);
        }
        const tpIdx = xml.indexOf('<tableParts');
        const ldIdx = xml.indexOf('<legacyDrawing');
        if (tpIdx !== -1 && ldIdx !== -1 && tpIdx < ldIdx) {
            throw new Error(`regression: ${f} has tableParts before legacyDrawing (v10 fix broken)`);
        }
    }
    for (const f of tableNames) {
        const entry = xlsxZip.file(f);
        if (!entry) throw new Error(`zip entry ${f} disappeared between listing and read`);
        const xml = await entry.async('string');
        if (xml.includes('<autoFilter')) {
            throw new Error(`regression: ${f} still contains autoFilter element (v11 fix broken)`);
        }
    }
    console.log(`  ${sheetNames.length} sheets clean (no DPI sentinel, correct element order)`);
    console.log(`  ${tableNames.length} tables clean (no autoFilter)`);
}

// Spot-check a few cells to confirm seed data made it through.
console.log('[e2e] spot-checking populated cells…');
const ExcelJS = (await import('exceljs')).default;
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(xlsxOut);

function check(sheetName: string, ref: string, expected: string): void {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) throw new Error(`worksheet ${sheetName} missing`);
    const v = ws.getCell(ref).value;
    const text = v && typeof v === 'object' && 'text' in v ? (v as { text: unknown }).text : v;
    const ok = String(text).includes(expected);
    console.log(`  ${sheetName}!${ref} = ${JSON.stringify(text)} ${ok ? '✓' : '✗'} (expected to contain ${JSON.stringify(expected)})`);
    if (!ok) throw new Error(`spot-check failed for ${sheetName}!${ref}`);
}

// Panels: first data row should have "MCC PLC Cabinet #1" in the Panel Name column (col C, header "Panel Name")
check('Panels', 'C3', 'MCC PLC Cabinet #1');
// Power: voltage in for MCC-0025
check('Power', 'C4', 'MCC-0025');
// PLC Slots: first slot is the L72 processor
check('PLC Slots', 'F3', 'MCC Processor');
// Drive Parameters: E Cooler row
check('Drive Parameters', 'C3', 'E Cooler');
// Notes appendix appears
const notesWs = wb.getWorksheet('Notes');
if (!notesWs) throw new Error('Notes sheet not found');
console.log(`  Notes sheet has ${notesWs.rowCount} rows`);

// v21: checkbox cells must remain real booleans so Excel renders them as
// native interactive cell-checkboxes. The FeaturePropertyBag part + workbook
// relationship + Content Types override + styles.xml extLst entries must be
// present so Excel knows to apply the Checkbox feature to those cells.
console.log('[e2e] verifying native cell-checkbox round-trip…');
{
    let foundLiteralBoolean = false;
    let foundGlyph = false;
    for (const ws of wb.worksheets) {
        ws.eachRow((row) => {
            row.eachCell((cell) => {
                const v = cell.value;
                const text = v && typeof v === 'object' && 'text' in v ? (v as { text: unknown }).text : v;
                if (text === true || text === false) foundLiteralBoolean = true;
                if (text === '☑' || text === '☐') foundGlyph = true;
            });
        });
    }
    if (!foundLiteralBoolean) {
        throw new Error('expected at least one literal true/false cell (seed has IO List Completed flags)');
    }
    if (foundGlyph) {
        throw new Error('regression: workbook still contains ☑/☐ glyphs — boolean cells should stay native (v21 fix broken)');
    }
    console.log('  boolean cells kept native (no glyph downgrade) ✓');

    const xlsxZip = await JSZip.loadAsync(xlsxBuf);
    const fpbPath = 'xl/featurePropertyBag/featurePropertyBag.xml';
    if (!xlsxZip.file(fpbPath)) {
        throw new Error(`regression: ${fpbPath} missing — cell-checkbox feature will be disabled in Excel`);
    }
    const wbRelsEntry = xlsxZip.file('xl/_rels/workbook.xml.rels');
    if (!wbRelsEntry) throw new Error('regression: xl/_rels/workbook.xml.rels missing');
    const rels = await wbRelsEntry.async('string');
    if (!rels.includes('schemas.microsoft.com/office/2022/11/relationships/FeaturePropertyBag')) {
        throw new Error('regression: workbook.xml.rels missing FeaturePropertyBag relationship');
    }
    const ctEntry = xlsxZip.file('[Content_Types].xml');
    if (!ctEntry) throw new Error('regression: [Content_Types].xml missing');
    const ct = await ctEntry.async('string');
    if (!ct.includes('application/vnd.ms-excel.featurepropertybag+xml')) {
        throw new Error('regression: [Content_Types].xml missing FeaturePropertyBag override');
    }
    const stylesEntry = xlsxZip.file('xl/styles.xml');
    if (!stylesEntry) throw new Error('regression: xl/styles.xml missing');
    const styles = await stylesEntry.async('string');
    if (!styles.includes('xfpb:xfComplement')) {
        throw new Error('regression: styles.xml missing xfpb:xfComplement extLst entries');
    }
    console.log('  FeaturePropertyBag part + relationship + content-type override + styles extLst all present ✓');

    // v22: Checklist boolean cells must reference a checkbox-enabled xfId
    // (one carrying <xfpb:xfComplement>), or Excel renders TRUE/FALSE text.
    const cellXfsMatch = styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/);
    if (!cellXfsMatch || cellXfsMatch[1] == null) {
        throw new Error('regression: styles.xml has no <cellXfs> block');
    }
    const cellXfsXml = cellXfsMatch[1];
    const xfRe = /<xf\b[^/]*?(?:\/>|>[\s\S]*?<\/xf>)/g;
    const checkboxXfIds = new Set<number>();
    let i = 0; let xm: RegExpExecArray | null;
    while ((xm = xfRe.exec(cellXfsXml)) !== null) {
        if (xm[0].includes('xfpb:xfComplement')) checkboxXfIds.add(i);
        i += 1;
    }
    const wbXmlEntry = xlsxZip.file('xl/workbook.xml');
    if (!wbXmlEntry) throw new Error('regression: xl/workbook.xml missing');
    const wbXml = await wbXmlEntry.async('string');
    const sheetMatch = wbXml.match(/<sheet[^>]+name="Checklist"[^>]+r:id="(rId\d+)"/);
    if (!sheetMatch || sheetMatch[1] == null) throw new Error('regression: Checklist sheet missing from workbook.xml');
    const ridRe = new RegExp(`Id="${sheetMatch[1]}"[^>]+Target="([^"]+)"`);
    const targetMatch = rels.match(ridRe);
    if (!targetMatch || targetMatch[1] == null) throw new Error('regression: Checklist sheet rel target missing');
    const checklistEntry = xlsxZip.file(`xl/${targetMatch[1].replace(/^\.\//, '')}`);
    if (!checklistEntry) throw new Error('regression: Checklist sheet xml missing');
    const checklistXml = await checklistEntry.async('string');
    const boolCells = [...checklistXml.matchAll(/<c\s+([^>]*?)>/g)]
        .map((m) => m[1] ?? '')
        .filter((a) => /\bt="b"/.test(a));
    const offending = boolCells.filter((a) => {
        const sm = a.match(/\bs="(\d+)"/);
        return !sm || sm[1] == null || !checkboxXfIds.has(parseInt(sm[1], 10));
    });
    if (offending.length > 0) {
        throw new Error(`regression: ${offending.length}/${boolCells.length} Checklist boolean cells reference a non-checkbox xfId — Excel will render TRUE/FALSE`);
    }
    console.log(`  ${boolCells.length} Checklist boolean cells reference checkbox-enabled xfIds ✓`);
}

// =============================================================
// Round-trip parse + resync assertions
// =============================================================

console.log('[e2e] running parser round-trip…');
const zipBuf = await result.blob.arrayBuffer();
const zip = await JSZip.loadAsync(zipBuf);
const xlsxNameRT = Object.keys(zip.files).find((f) => f.endsWith('.xlsx'));
if (!xlsxNameRT) throw new Error('no xlsx in export zip');
const xlsxRTEntry = zip.file(xlsxNameRT);
if (!xlsxRTEntry) throw new Error(`round-trip: ${xlsxNameRT} missing from zip listing`);
const xlsxBufRT = await xlsxRTEntry.async('arraybuffer');

const { parseChecklistXlsx } = await import('../src/lib/xlsxParser.js');
const parsed: IParsedXlsx = await parseChecklistXlsx(xlsxBufRT);
if (parsed.errors.length > 0) {
    console.error('[e2e] parser errors:', parsed.errors);
    throw new Error('parser returned errors on round-trip');
}
console.log(`[e2e] parser: ${parsed.panels.length} panels, ${Object.values(parsed.rowsBySheet).reduce((s, r) => s + r.length, 0)} rows, ${parsed.warnings.length} warnings`);

console.log('[e2e] running resync no-op diff…');
const { diffJobs } = await import('../src/lib/jobDiff.js');
const { default: schemaMapJson } = await import('../src/schema.json', { with: { type: 'json' } });
const schemaMap = schemaMapJson as unknown as Record<string, ISheetSchema>;

const localPanels = panels;
const localRowsBySheet: Record<string, IRow[]> = {};
const localSheetNotes: Record<string, Record<string, string>> = {};
for (const p of localPanels) {
    const rs = await listAllRows(p.id);
    for (const r of rs) {
        if (!localRowsBySheet[r.sheet]) localRowsBySheet[r.sheet] = [];
        localRowsBySheet[r.sheet]!.push(r);
    }
    for (const sn of Object.keys(schemaMap)) {
        const txt = await getSheetNotes(p.id, sn);
        if (txt) {
            if (!localSheetNotes[p.name]) localSheetNotes[p.name] = {};
            localSheetNotes[p.name]![sn] = txt;
        }
    }
}
const localState: IDiffJobsLocalState = {
    localJob: job,
    localPanels,
    localRowsBySheet,
    localSheetNotes,
};
const noopDiff = diffJobs(localState, parsed, schemaMap);

// The job name is carried in the export filename, not in the xlsx contents,
// so a parser-only round-trip cannot recover it. Treat that single field as a
// known unrecoverable divergence and exclude it from the no-op count.
const jobMetaChangesIgnoringName = noopDiff.jobMeta.changed.filter((c) => c.field !== 'name');
let totalChanges = jobMetaChangesIgnoringName.length + noopDiff.panels.added.length + noopDiff.panels.removed.length;
for (const sd of Object.values(noopDiff.sheets)) {
    totalChanges += sd.added.length + sd.removed.length + sd.modified.length;
}
totalChanges += noopDiff.sheetNotes.added.length + noopDiff.sheetNotes.removed.length + noopDiff.sheetNotes.modified.length;

console.log(`[e2e] no-op diff: ${totalChanges} changes (expected 0)`);
if (totalChanges !== 0) {
    console.warn('[e2e] no-op diff revealed changes:');
    for (const c of jobMetaChangesIgnoringName) console.warn('  jobMeta:', c.field, JSON.stringify(c.old), '→', JSON.stringify(c.new));
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
const sheetWithRows = Object.keys(parsed.rowsBySheet).find((s) => (parsed.rowsBySheet[s]?.length ?? 0) > 0);
if (sheetWithRows) {
    const editedParsed = JSON.parse(JSON.stringify(parsed)) as IParsedXlsx;
    const sheetRows = editedParsed.rowsBySheet[sheetWithRows];
    const targetRow: IParsedRow | undefined = sheetRows?.[0];
    if (targetRow) {
        const editableField = Object.keys(targetRow.data).find((k) => k !== 'Panel Name' && typeof targetRow.data[k] === 'string');
        if (editableField) {
            targetRow.data[editableField] = 'CHANGED-' + String(targetRow.data[editableField]);
            const editDiff = diffJobs(localState, editedParsed, schemaMap);
            const sd = editDiff.sheets[sheetWithRows];
            if (!sd) throw new Error(`edit diff missing sheet ${sheetWithRows}`);
            const mods = sd.modified.length;
            if (mods !== 1) {
                // Could be that label-stable mutation causes added+removed instead of modified.
                // Check that path too — but ideally the test should pick a non-label field.
                // If field IS a label component, we'd see 1 added + 1 removed.
                const totalSheetChanges = sd.modified.length + sd.added.length + sd.removed.length;
                if (totalSheetChanges < 1) throw new Error(`expected ≥1 change in ${sheetWithRows}, got ${totalSheetChanges}`);
                console.log(`[e2e] edit detected (label-affecting): +${sd.added.length} −${sd.removed.length} ~${sd.modified.length}`);
            } else {
                const firstMod = sd.modified[0];
                if (!firstMod) throw new Error('edit diff modified[0] missing despite mods === 1');
                const fc = firstMod.fieldChanges.find((f) => f.field === editableField);
                if (!fc) throw new Error(`expected fieldChange on ${editableField}`);
                console.log(`[e2e] edit detected: ${sheetWithRows}.${editableField} → "${String(fc.new)}"`);
            }
        }
    }
}

console.log('[e2e] round-trip + resync assertions passed.');

console.log('\n[e2e] ✅ all checks passed');
console.log(`[e2e] inspect outputs at: ${outDir}`);
