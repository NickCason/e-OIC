// rowLabel.ts — single source of truth for the human-facing label of a row.
//
// The "row pill" in SheetForm, the row-photo folder name in the xlsx export,
// the photo overlay's bottom line — all derive from rowDisplayLabel(...).
//
// Why per-sheet config: every row carries an inherited "Panel Name" column
// (auto-filled from the parent panel), so a generic /name/i search lands on
// "Panel Name" everywhere and labels every row identically. This map names
// the column that actually distinguishes rows of each sheet type.

import type { IRow, RowData } from '../types/job';
import type { ISheetSchema } from '../types/xlsx';

type SheetLabelFormatFn = (data: RowData) => string | null;

interface ISheetLabelFieldsCfg {
    fields: string[];
}

interface ISheetLabelFormatCfg {
    format: SheetLabelFormatFn;
}

type SheetLabelCfg = ISheetLabelFieldsCfg | ISheetLabelFormatCfg;

export const SHEET_LABEL_CONFIG: Record<string, SheetLabelCfg> = {
    Panels: { fields: ['Panel Name'] },
    Power: { fields: ['Device Name'] },
    'PLC Racks': { fields: ['Rack Name'] },
    'PLC Slots': {
        format: (data: RowData): string | null => {
            const slot = data?.Slot;
            const pn = data?.['Part Number'] || data?.['Slot Part Number'];
            const slotStr = slot != null && slot !== '' ? `Slot ${String(slot)}` : '';
            if (slotStr && pn) return `${slotStr} · ${String(pn)}`;
            return slotStr || (pn ? String(pn) : null);
        },
    },
    'Fieldbus IO': { fields: ['Device Name'] },
    'Network Devices': { fields: ['Device Name'] },
    HMIs: { fields: ['HMI Name'] },
    'Ethernet Switches': { fields: ['Name'] },
    'Drive Parameters': { fields: ['Device Name'] },
    'Conv. Speeds': { fields: ['Device Name'] },
    'Safety Circuit': { fields: ['Circuit Name'] },
    'Safety Devices': { fields: ['Device Name'] },
    'Peer to Peer Comms': { fields: ['Device Name'] },
};

// Accept partial row shapes (parsed-xlsx rows lack id/panelId/etc.) — the
// only fields read are `data` and `idx`.
type RowLike = Pick<IRow, 'data'> & Partial<Pick<IRow, 'idx'>>;

function nonEmpty(v: unknown): v is string | number | boolean {
    return v != null && v !== '';
}

function labelFromCfgFields(data: RowData, fields: string[]): string | null {
    const hit = fields.find((f) => nonEmpty(data[f]));
    return hit ? String(data[hit]) : null;
}

function labelFromCfg(data: RowData, cfg: SheetLabelCfg | undefined): string | null {
    if (!cfg) return null;
    if ('format' in cfg) {
        const v = cfg.format(data);
        return v ? String(v) : null;
    }
    return labelFromCfgFields(data, cfg.fields);
}

function isFallbackHeader(header: string): boolean {
    return header !== 'Panel Name'
        && /name/i.test(header)
        && !/hyperlink/i.test(header);
}

function labelFromSchema(
    data: RowData,
    schema: ISheetSchema | null | undefined,
): string | null {
    if (!schema?.columns) return null;
    const hit = schema.columns.find((col) => isFallbackHeader(col.header) && nonEmpty(data[col.header]));
    if (hit) return String(data[hit.header]);
    const panelName = data['Panel Name'];
    return panelName ? String(panelName) : null;
}

export function rowDisplayLabel(
    row: RowLike | null | undefined,
    sheetName: string,
    schema: ISheetSchema | null | undefined,
): string {
    const data: RowData = row?.data ?? {};
    const cfgLabel = labelFromCfg(data, SHEET_LABEL_CONFIG[sheetName]);
    if (cfgLabel) return cfgLabel;
    // Generic fallback: any *Name column except "Panel Name" (inherited from
    // parent — labeling every row by the panel name is exactly the bug we're
    // avoiding). Try Panel Name only as a last resort.
    const schemaLabel = labelFromSchema(data, schema);
    if (schemaLabel) return schemaLabel;
    return `Row ${(row?.idx ?? 0) + 1}`;
}
