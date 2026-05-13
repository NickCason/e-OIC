// metrics.ts — pure derivations for panel/job completion and the merged
// checklist task list. Uses IndexedDB through db.js but never touches React.

import schemaMapJson from '../schema.json';
import {listPanels, listRows, listAllRows, listPanelPhotos, getChecklistState,
    slugifyTaskLabel,} from '../db';
import type { ISheetSchema } from '../types/xlsx';
import type { IChecklistCustomTask } from '../types/job';

const schemaMap = schemaMapJson as unknown as Record<string, ISheetSchema>;

export type ChecklistSection = 'Backups' | 'Documentation' | 'Field Work' | 'Data Sheets' | 'Custom';
export type ChecklistTaskKind = 'auto' | 'manual' | 'custom';
export type SheetStatus = 'empty' | 'partial' | 'complete';

export const SHEET_ORDER: readonly string[] = [
    'Panels', 'Power', 'PLC Racks', 'PLC Slots', 'Fieldbus IO',
    'Network Devices', 'HMIs', 'Ethernet Switches', 'Drive Parameters',
    'Conv. Speeds', 'Safety Circuit', 'Safety Devices', 'Peer to Peer Comms',
];

// Template entry: `kind: 'auto'` ⇒ taskId-keyed lookup against the panels'
// rows (auto-completed when ANY panel has rows in `sheet`). `kind: 'manual'`
// ⇒ user toggles via UI; persisted in checklistState.manualTasks.
interface IChecklistTemplateAuto {
    id: string;
    section: ChecklistSection;
    label: string;
    kind: 'auto';
    sheet: string;
}

interface IChecklistTemplateManual {
    id: string;
    section: ChecklistSection;
    label: string;
    kind: 'manual';
}

type ChecklistTemplateEntry = IChecklistTemplateAuto | IChecklistTemplateManual;

// Canonical Checklist task list. Order here drives UI render order.
// IDs MUST match `slugifyTaskLabel(label)` so the exporter can recover them
// from the xlsx Checklist sheet without storing IDs in the workbook.
export const CHECKLIST_TEMPLATE: readonly ChecklistTemplateEntry[] = [
    // Backups
    {
        id: 'plc-program-backup', section: 'Backups', label: 'PLC Program Backup', kind: 'manual'
    },
    {
        id: 'hmi-program-backup', section: 'Backups', label: 'HMI Program Backup', kind: 'manual'
    },
    {
        id: 'scada-backup', section: 'Backups', label: 'SCADA Backup', kind: 'manual'
    },
    {
        id: 'rsnetworx-backup-cnet-dnet', section: 'Backups', label: 'RSNetworx Backup (CNet, DNet)', kind: 'manual'
    },
    {
        id: 'dh-rio-backup', section: 'Backups', label: 'DH+/RIO Backup', kind: 'manual'
    },
    // Documentation
    {
        id: 'existing-plant-drawings', section: 'Documentation', label: 'Existing Plant Drawings', kind: 'manual'
    },
    {
        id: 'existing-network-diagram', section: 'Documentation', label: 'Existing Network Diagram', kind: 'manual'
    },
    {
        id: 'process-flow-diagram', section: 'Documentation', label: 'Process Flow Diagram', kind: 'manual'
    },
    {
        id: 'io-list', section: 'Documentation', label: 'IO List', kind: 'manual'
    },
    {
        id: 'device-list', section: 'Documentation', label: 'Device List', kind: 'manual'
    },
    // Field Work
    {
        id: 'process-investigation', section: 'Field Work', label: 'Process Investigation', kind: 'manual'
    },
    {
        id: 'operator-interviews', section: 'Field Work', label: 'Operator Interviews', kind: 'manual'
    },
    // Data Sheets — auto when matched to a SHEET_ORDER entry, manual otherwise
    {
        id: 'panel-sheet', section: 'Data Sheets', label: 'Panel Sheet', kind: 'auto', sheet: 'Panels'
    },
    {
        id: 'power-sheet', section: 'Data Sheets', label: 'Power Sheet', kind: 'auto', sheet: 'Power'
    },
    {
        id: 'plc-racks-sheet', section: 'Data Sheets', label: 'PLC Racks Sheet', kind: 'auto', sheet: 'PLC Racks'
    },
    {
        id: 'plc-slots-sheet', section: 'Data Sheets', label: 'PLC Slots sheet', kind: 'auto', sheet: 'PLC Slots'
    },
    {
        id: 'hmis-sheet', section: 'Data Sheets', label: 'HMIs Sheet', kind: 'auto', sheet: 'HMIs'
    },
    {
        id: 'ethernet-switches-sheet', section: 'Data Sheets', label: 'Ethernet Switches Sheet', kind: 'auto', sheet: 'Ethernet Switches'
    },
    {
        id: 'switch-ports-sheet', section: 'Data Sheets', label: 'Switch Ports Sheet', kind: 'manual'
    },
    {
        id: 'fieldbus-io-sheet', section: 'Data Sheets', label: 'Fieldbus IO Sheet', kind: 'auto', sheet: 'Fieldbus IO'
    },
    {
        id: 'devices-sheet', section: 'Data Sheets', label: 'Devices Sheet', kind: 'auto', sheet: 'Network Devices'
    },
    {
        id: 'conv-speeds-sheet', section: 'Data Sheets', label: 'Conv. Speeds Sheet', kind: 'auto', sheet: 'Conv. Speeds'
    },
    {
        id: 'safety-circuit-sheet', section: 'Data Sheets', label: 'Safety Circuit Sheet', kind: 'auto', sheet: 'Safety Circuit'
    },
    {
        id: 'safety-devices-sheet', section: 'Data Sheets', label: 'Safety Devices Sheet', kind: 'auto', sheet: 'Safety Devices'
    },
    {
        id: 'peer-to-peer-comms', section: 'Data Sheets', label: 'Peer to Peer Comms', kind: 'auto', sheet: 'Peer to Peer Comms'
    },
];

export const CHECKLIST_SECTIONS: readonly ChecklistSection[] = [
    'Backups', 'Documentation', 'Field Work', 'Data Sheets', 'Custom',
];

// Sheet-status weights for the panel percentage.
const STATUS_WEIGHT: Record<SheetStatus, number> = {
    empty: 0, partial: 0.5, complete: 1
};

function sheetStatusFromRowsPhotos(
    sheet: string,
    rowCount: number,
    photoCountForSheet: number,
): SheetStatus {
    if (rowCount <= 0) return 'empty';
    const requiredItems = (schemaMap[sheet]?.photo_checklist_columns ?? []).length;
    if (requiredItems === 0 || photoCountForSheet >= requiredItems) return 'complete';
    return 'partial';
}

export interface IPanelSheetCount {
    rows: number;
    photos: number;
    required: number;
}

export interface IPanelProgress {
    percent: number;
    sheetStatuses: Record<string, SheetStatus>;
    sheetCounts: Record<string, IPanelSheetCount>;
}

export async function getPanelProgress(panelId: string): Promise<IPanelProgress> {
    const allPhotos = await listPanelPhotos(panelId);
    const sheetStatuses: Record<string, SheetStatus> = {};
    const sheetCounts: Record<string, IPanelSheetCount> = {};
    let total = 0;
    // SHEET_ORDER is a small fixed list; sequential await is intentional —
    // IDB read concurrency isn't a meaningful win here and a for..of would
    // trip max-depth/no-restricted-syntax. Use a serial reducer instead.
    await SHEET_ORDER.reduce<Promise<void>>(async (prev, sheet) => {
        await prev;
        const rows = await listRows(panelId, sheet);
        const sheetPhotos = allPhotos.filter((ph) => ph.sheet === sheet);
        const required = (schemaMap[sheet]?.photo_checklist_columns ?? []).length;
        const status = sheetStatusFromRowsPhotos(sheet, rows.length, sheetPhotos.length);
        sheetStatuses[sheet] = status;
        sheetCounts[sheet] = {
            rows: rows.length, photos: sheetPhotos.length, required
        };
        total += STATUS_WEIGHT[status];
    }, Promise.resolve());
    const percent = Math.round((total / SHEET_ORDER.length) * 100);
    return {
        percent, sheetStatuses, sheetCounts
    };
}

export interface IChecklistTaskItem {
    id: string;
    section: ChecklistSection;
    label: string;
    kind: ChecklistTaskKind;
    sheet?: string;
    required: boolean;
    completed: boolean;
    locked: boolean;
    createdAt?: number;
}

function templateToTaskItem(
    t: ChecklistTemplateEntry,
    filledSheets: Set<string>,
    manualTasks: Record<string, boolean>,
): IChecklistTaskItem {
    if (t.kind === 'auto') {
        return {
            id: t.id,
            section: t.section,
            label: t.label,
            kind: 'auto',
            sheet: t.sheet,
            required: true,
            completed: filledSheets.has(t.sheet),
            locked: true,
        };
    }
    return {
        id: t.id,
        section: t.section,
        label: t.label,
        kind: 'manual',
        required: true,
        completed: !!manualTasks[t.id],
        locked: false,
    };
}

function customToTaskItem(c: IChecklistCustomTask): IChecklistTaskItem {
    return {
        id: c.id,
        section: 'Custom',
        label: c.label,
        kind: 'custom',
        required: true,
        completed: !!c.completed,
        locked: false,
        createdAt: c.createdAt,
    };
}

// Returns the merged task list for the job. Auto tasks read panel rows; manual
// tasks read checklistState.manualTasks; custom tasks come from
// checklistState.customTasks.
export async function getJobChecklist(jobId: string): Promise<IChecklistTaskItem[]> {
    const state = await getChecklistState(jobId);
    const panels = await listPanels(jobId);
    const filledSheets = new Set<string>();
    await panels.reduce<Promise<void>>(async (prev, p) => {
        await prev;
        const rs = await listAllRows(p.id);
        rs.forEach((r) => filledSheets.add(r.sheet));
    }, Promise.resolve());

    const tasks: IChecklistTaskItem[] = CHECKLIST_TEMPLATE.map(
        (t) => templateToTaskItem(t, filledSheets, state.manualTasks),
    );
    state.customTasks.forEach((c) => tasks.push(customToTaskItem(c)));
    return tasks;
}

export async function getJobPercent(jobId: string): Promise<number> {
    const tasks = await getJobChecklist(jobId);
    if (tasks.length === 0) return 0;
    const checked = tasks.filter((t) => t.completed).length;
    return Math.round((checked / tasks.length) * 100);
}

export interface IJobAggregateStats {
    panelCount: number;
    photoCount: number;
    jobPercent: number;
}

export async function getJobAggregateStats(jobId: string): Promise<IJobAggregateStats> {
    const panels = await listPanels(jobId);
    let photoCount = 0;
    await panels.reduce<Promise<void>>(async (prev, p) => {
        await prev;
        const photos = await listPanelPhotos(p.id);
        photoCount += photos.length;
    }, Promise.resolve());
    const jobPercent = await getJobPercent(jobId);
    return {
        panelCount: panels.length, photoCount, jobPercent
    };
}

// Helpers for the exporter — exposed so it doesn't have to recompute the
// auto-checked set or the slug logic itself.
export { slugifyTaskLabel };
