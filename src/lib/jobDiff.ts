// jobDiff.ts — pure-function diff between a local job's IndexedDB state and
// a parsed xlsx. Used by Re-sync (direction='pull') and Push (direction='push').

import { rowDisplayLabel } from './rowLabel';
import type { IPanel, IRow, RowData } from '../types/job';
import type {DiffCellValue, IDiffJobsLocalState, IJobDiff, IParsedPanel, IParsedRow, IParsedXlsx,
    IPanelsDiff, IRowFieldChange, ISheetNoteDiff, ISheetRowDiff, ISheetSchema,} from '../types/xlsx';

type SchemaMap = Record<string, ISheetSchema | undefined>;

interface IDiffOptions {
    direction?: 'pull' | 'push';
}

interface IGroup<T> {
    panelName: string;
    label: string;
    items: T[];
}

export function valuesEqual(a: DiffCellValue, b: DiffCellValue): boolean {
    // Treat '' / null / undefined as equivalent.
    const na: DiffCellValue = (a === '' || a === undefined) ? null : a;
    const nb: DiffCellValue = (b === '' || b === undefined) ? null : b;
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
        (typeof na === 'number' && typeof nb === 'string')
        || (typeof na === 'string' && typeof nb === 'number')
    ) {
        const sa = String(na).trim();
        const sb = String(nb).trim();
        if (sa !== '' && sb !== '' && !Number.isNaN(Number(sa)) && !Number.isNaN(Number(sb))) {
            return Number(sa) === Number(sb);
        }
    }
    return String(na).trim() === String(nb).trim();
}

function compareRowFields(
    localRow: { data?: RowData },
    xlsxRow: { data?: RowData },
    sheetName: string,
    schemaMap: SchemaMap,
): IRowFieldChange[] {
    const schema = schemaMap[sheetName];
    if (!schema) return [];
    const changes: IRowFieldChange[] = [];
    schema.columns.forEach((col) => {
        if (col.header === schema.hyperlink_column) return;
        const oldV: DiffCellValue = localRow.data?.[col.header] ?? null;
        const newV: DiffCellValue = xlsxRow.data?.[col.header] ?? null;
        if (!valuesEqual(oldV, newV)) {
            changes.push({
                field: col.header, old: oldV, new: newV
            });
        }
    });
    return changes;
}

function labelOf(rowData: RowData, sheetName: string, schemaMap: SchemaMap): string {
    return rowDisplayLabel({ data: rowData, idx: 0 }, sheetName, schemaMap[sheetName]);
}

function groupByPanelLabel<T>(
    rows: T[],
    sheetName: string,
    schemaMap: SchemaMap,
    getData: (r: T) => RowData,
): Map<string, IGroup<T>> {
    const groups = new Map<string, IGroup<T>>();
    rows.forEach((r) => {
        const data = getData(r);
        const panelNameRaw = data['Panel Name'];
        const panelName = panelNameRaw != null ? String(panelNameRaw) : '';
        const label = labelOf(data, sheetName, schemaMap) || '';
        const key = `${panelName}|${label}`;
        let group = groups.get(key);
        if (!group) {
            group = {
                panelName, label, items: []
            };
            groups.set(key, group);
        }
        group.items.push(r);
    });
    return groups;
}

function pairItems(
    localItems: IRow[],
    xlsxItems: IParsedRow[],
    label: string,
    sheetName: string,
    schemaMap: SchemaMap,
    sheetDiff: ISheetRowDiff,
): void {
    const pairCount = Math.min(localItems.length, xlsxItems.length);
    for (let i = 0; i < pairCount; i += 1) {
        const local = localItems[i]!;
        const xlsx = xlsxItems[i]!;
        const fieldChanges = compareRowFields(local, xlsx, sheetName, schemaMap);
        if (fieldChanges.length === 0) {
            sheetDiff.unchanged.push({
                local, xlsx, label
            });
        } else {
            sheetDiff.modified.push({
                local, xlsx, label, fieldChanges,
            });
        }
    }
    for (let i = pairCount; i < localItems.length; i += 1) sheetDiff.removed.push(localItems[i]!);
    for (let i = pairCount; i < xlsxItems.length; i += 1) sheetDiff.added.push(xlsxItems[i]!);
}

function diffGroupPair(
    lg: IGroup<IRow> | undefined,
    xg: IGroup<IParsedRow> | undefined,
    sheetName: string,
    schemaMap: SchemaMap,
    sheetDiff: ISheetRowDiff,
): void {
    const localItems: IRow[] = lg?.items ?? [];
    const xlsxItems: IParsedRow[] = xg?.items ?? [];
    const labelHolder = lg ?? xg;
    const label = labelHolder ? labelHolder.label : '';
    if (localItems.length > 1 || xlsxItems.length > 1) {
        if (!sheetDiff.labelCollisions.includes(label) && label !== '') {
            sheetDiff.labelCollisions.push(label);
        }
    }
    pairItems(localItems, xlsxItems, label, sheetName, schemaMap, sheetDiff);
}

function diffSheetRows(
    localRows: IRow[],
    xlsxRows: IParsedRow[],
    sheetName: string,
    schemaMap: SchemaMap,
): ISheetRowDiff {
    const localGroups = groupByPanelLabel(localRows, sheetName, schemaMap, (r) => r.data ?? {});
    const xlsxGroups = groupByPanelLabel(xlsxRows, sheetName, schemaMap, (r) => r.data ?? {});
    const sheetDiff: ISheetRowDiff = {
        added: [], removed: [], modified: [], unchanged: [], labelCollisions: [],
    };
    const allKeys = new Set<string>([...localGroups.keys(), ...xlsxGroups.keys()]);
    allKeys.forEach((key) => {
        diffGroupPair(localGroups.get(key), xlsxGroups.get(key), sheetName, schemaMap, sheetDiff);
    });
    return sheetDiff;
}

function diffPanels(localPanels: IPanel[], xlsxPanels: IParsedPanel[]): IPanelsDiff {
    const localPanelNames = new Set(localPanels.map((p) => p.name));
    const xlsxPanelNames = new Set(xlsxPanels.map((p) => p.name));
    const out: IPanelsDiff = {
        added: [], removed: [], matched: []
    };
    localPanels.forEach((lp) => {
        if (xlsxPanelNames.has(lp.name)) {
            const xp = xlsxPanels.find((p) => p.name === lp.name);
            if (xp) out.matched.push({ local: { id: lp.id, name: lp.name }, xlsx: xp });
        } else {
            out.removed.push({ id: lp.id, name: lp.name });
        }
    });
    xlsxPanels.forEach((xp) => {
        if (!localPanelNames.has(xp.name)) out.added.push(xp);
    });
    return out;
}

function diffSheetNotes(
    localSheetNotes: Record<string, Record<string, string>>,
    xlsxSheetNotes: IParsedXlsx['sheetNotes'],
): ISheetNoteDiff {
    const out: ISheetNoteDiff = {
        added: [], removed: [], modified: []
    };
    const xlsxKeys = new Set(xlsxSheetNotes.map((n) => `${n.panelName}|${n.sheetName}`));
    Object.keys(localSheetNotes).forEach((panel) => {
        const perPanel = localSheetNotes[panel] ?? {};
        Object.keys(perPanel).forEach((sheet) => {
            const k = `${panel}|${sheet}`;
            if (!xlsxKeys.has(k)) {
                out.removed.push({
                    panelName: panel, sheetName: sheet, text: perPanel[sheet] ?? ''
                });
            }
        });
    });
    xlsxSheetNotes.forEach((xn) => {
        const localText = localSheetNotes[xn.panelName]?.[xn.sheetName];
        if (localText == null) out.added.push(xn);
        else if (String(localText).trim() !== String(xn.text).trim()) {
            out.modified.push({
                panelName: xn.panelName, sheetName: xn.sheetName, old: localText, new: xn.text,
            });
        }
    });
    return out;
}

function diffJobMeta(
    localJob: IDiffJobsLocalState['localJob'],
    xlsxMeta: IParsedXlsx['jobMeta'],
): IJobDiff['jobMeta'] {
    const out: IJobDiff['jobMeta'] = { changed: [] };
    const localMeta = localJob ?? { name: '', notes: '' };
    const metaFields: Array<'name' | 'notes'> = ['name', 'notes'];
    metaFields.forEach((field) => {
        const oldRaw = localMeta[field] ?? '';
        const newRaw = xlsxMeta[field] ?? '';
        const oldV = oldRaw.toString().trim();
        const newV = newRaw.toString().trim();
        if (oldV !== newV) {
            out.changed.push({
                field, old: oldRaw.toString(), new: newRaw.toString()
            });
        }
    });
    return out;
}

export function diffJobs(
    localState: IDiffJobsLocalState,
    parsedXlsx: IParsedXlsx,
    schemaMap: SchemaMap,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options: IDiffOptions = {},
): IJobDiff {
    // `_options.direction` ('pull'|'push') is accepted for caller symmetry but
    // does not affect the diff shape — the underscore + disable above keep the
    // unused-vars rule happy without changing the public signature.
    const {
        localJob, localPanels, localRowsBySheet, localSheetNotes,
    } = localState;

    const result: IJobDiff = {
        jobMeta: diffJobMeta(localJob, parsedXlsx.jobMeta),
        panels: diffPanels(localPanels, parsedXlsx.panels),
        sheets: {},
        sheetNotes: diffSheetNotes(localSheetNotes ?? {}, parsedXlsx.sheetNotes),
        skippedSheets: parsedXlsx.warnings.filter((w) => w.kind === 'unknown-sheet').map((w) => w.sheetName),
        skippedColumns: parsedXlsx.warnings
            .filter((w) => w.kind === 'extra-column')
            .map((w) => ({ sheetName: w.sheetName, columnName: w.columnName })),
        missingSheets: parsedXlsx.warnings.filter((w) => w.kind === 'missing-sheet').map((w) => w.sheetName),
    };

    const allSheetNames = new Set<string>([
        ...Object.keys(localRowsBySheet ?? {}),
        ...Object.keys(parsedXlsx.rowsBySheet ?? {}),
    ]);
    allSheetNames.forEach((sheetName) => {
        const localRows = localRowsBySheet?.[sheetName] ?? [];
        const xlsxRows = parsedXlsx.rowsBySheet?.[sheetName] ?? [];
        result.sheets[sheetName] = diffSheetRows(localRows, xlsxRows, sheetName, schemaMap);
    });

    return result;
}
