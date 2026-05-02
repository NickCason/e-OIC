// metrics.js — pure derivations for panel/job completion and the merged
// checklist task list. Uses IndexedDB through db.js but never touches React.

import schemaMap from '../schema.json';
import {
  listPanels, listRows, listAllRows, listPanelPhotos, getChecklistState,
  slugifyTaskLabel,
} from '../db.js';

export const SHEET_ORDER = [
  'Panels', 'Power', 'PLC Racks', 'PLC Slots', 'Fieldbus IO',
  'Network Devices', 'HMIs', 'Ethernet Switches', 'Drive Parameters',
  'Conv. Speeds', 'Safety Circuit', 'Safety Devices', 'Peer to Peer Comms',
];

// Canonical Checklist task list. Order here drives UI render order.
// Section keys must be one of: 'Backups', 'Documentation', 'Field Work',
// 'Data Sheets'. Custom tasks are appended at runtime in their own section.
//
// `kind: 'auto'` ⇒ taskId-keyed lookup against the panels' rows
// (auto-completed when ANY panel has rows in `sheet`).
// `kind: 'manual'` ⇒ user toggles via UI; persisted in checklistState.manualTasks.
//
// IDs MUST match `slugifyTaskLabel(label)` so the exporter can recover them
// from the xlsx Checklist sheet without storing IDs in the workbook.
export const CHECKLIST_TEMPLATE = [
  // Backups
  { id: 'plc-program-backup', section: 'Backups', label: 'PLC Program Backup', kind: 'manual' },
  { id: 'hmi-program-backup', section: 'Backups', label: 'HMI Program Backup', kind: 'manual' },
  { id: 'scada-backup', section: 'Backups', label: 'SCADA Backup', kind: 'manual' },
  { id: 'rsnetworx-backup-cnet-dnet', section: 'Backups', label: 'RSNetworx Backup (CNet, DNet)', kind: 'manual' },
  { id: 'dh-rio-backup', section: 'Backups', label: 'DH+/RIO Backup', kind: 'manual' },
  // Documentation
  { id: 'existing-plant-drawings', section: 'Documentation', label: 'Existing Plant Drawings', kind: 'manual' },
  { id: 'existing-network-diagram', section: 'Documentation', label: 'Existing Network Diagram', kind: 'manual' },
  { id: 'process-flow-diagram', section: 'Documentation', label: 'Process Flow Diagram', kind: 'manual' },
  { id: 'io-list', section: 'Documentation', label: 'IO List', kind: 'manual' },
  { id: 'device-list', section: 'Documentation', label: 'Device List', kind: 'manual' },
  // Field Work
  { id: 'process-investigation', section: 'Field Work', label: 'Process Investigation', kind: 'manual' },
  { id: 'operator-interviews', section: 'Field Work', label: 'Operator Interviews', kind: 'manual' },
  // Data Sheets — auto when matched to a SHEET_ORDER entry, manual otherwise
  { id: 'panel-sheet', section: 'Data Sheets', label: 'Panel Sheet', kind: 'auto', sheet: 'Panels' },
  { id: 'power-sheet', section: 'Data Sheets', label: 'Power Sheet', kind: 'auto', sheet: 'Power' },
  { id: 'plc-racks-sheet', section: 'Data Sheets', label: 'PLC Racks Sheet', kind: 'auto', sheet: 'PLC Racks' },
  { id: 'plc-slots-sheet', section: 'Data Sheets', label: 'PLC Slots sheet', kind: 'auto', sheet: 'PLC Slots' },
  { id: 'hmis-sheet', section: 'Data Sheets', label: 'HMIs Sheet', kind: 'auto', sheet: 'HMIs' },
  { id: 'ethernet-switches-sheet', section: 'Data Sheets', label: 'Ethernet Switches Sheet', kind: 'auto', sheet: 'Ethernet Switches' },
  { id: 'switch-ports-sheet', section: 'Data Sheets', label: 'Switch Ports Sheet', kind: 'manual' },
  { id: 'fieldbus-io-sheet', section: 'Data Sheets', label: 'Fieldbus IO Sheet', kind: 'auto', sheet: 'Fieldbus IO' },
  { id: 'devices-sheet', section: 'Data Sheets', label: 'Devices Sheet', kind: 'auto', sheet: 'Network Devices' },
  { id: 'conv-speeds-sheet', section: 'Data Sheets', label: 'Conv. Speeds Sheet', kind: 'auto', sheet: 'Conv. Speeds' },
  { id: 'safety-circuit-sheet', section: 'Data Sheets', label: 'Safety Circuit Sheet', kind: 'auto', sheet: 'Safety Circuit' },
  { id: 'safety-devices-sheet', section: 'Data Sheets', label: 'Safety Devices Sheet', kind: 'auto', sheet: 'Safety Devices' },
  { id: 'peer-to-peer-comms', section: 'Data Sheets', label: 'Peer to Peer Comms', kind: 'auto', sheet: 'Peer to Peer Comms' },
];

export const CHECKLIST_SECTIONS = ['Backups', 'Documentation', 'Field Work', 'Data Sheets', 'Custom'];

// Sheet-status weights for the panel percentage.
const STATUS_WEIGHT = { empty: 0, partial: 0.5, complete: 1 };

function sheetStatusFromRowsPhotos(sheet, rowCount, photoCountForSheet) {
  if (rowCount <= 0) return 'empty';
  const requiredItems = (schemaMap[sheet]?.photo_checklist_columns || []).length;
  if (requiredItems === 0 || photoCountForSheet >= requiredItems) return 'complete';
  return 'partial';
}

export async function getPanelProgress(panelId) {
  const allPhotos = await listPanelPhotos(panelId);
  const sheetStatuses = {};
  const sheetCounts = {};
  let total = 0;
  for (const sheet of SHEET_ORDER) {
    const rows = await listRows(panelId, sheet);
    const sheetPhotos = allPhotos.filter((ph) => ph.sheet === sheet);
    const required = (schemaMap[sheet]?.photo_checklist_columns || []).length;
    const status = sheetStatusFromRowsPhotos(sheet, rows.length, sheetPhotos.length);
    sheetStatuses[sheet] = status;
    sheetCounts[sheet] = { rows: rows.length, photos: sheetPhotos.length, required };
    total += STATUS_WEIGHT[status];
  }
  const percent = Math.round((total / SHEET_ORDER.length) * 100);
  return { percent, sheetStatuses, sheetCounts };
}

// Returns the merged task list for the job. Auto tasks read panel rows; manual
// tasks read checklistState.manualTasks; custom tasks come from
// checklistState.customTasks.
export async function getJobChecklist(jobId) {
  const state = await getChecklistState(jobId);
  const panels = await listPanels(jobId);
  const filledSheets = new Set();
  for (const p of panels) {
    const rs = await listAllRows(p.id);
    for (const r of rs) filledSheets.add(r.sheet);
  }

  const tasks = CHECKLIST_TEMPLATE.map((t) => {
    if (t.kind === 'auto') {
      const completed = !!t.sheet && filledSheets.has(t.sheet);
      return {
        id: t.id,
        section: t.section,
        label: t.label,
        kind: 'auto',
        sheet: t.sheet,
        required: true,
        completed,
        locked: true,
      };
    }
    return {
      id: t.id,
      section: t.section,
      label: t.label,
      kind: 'manual',
      required: true,
      completed: !!state.manualTasks[t.id],
      locked: false,
    };
  });

  for (const c of state.customTasks) {
    tasks.push({
      id: c.id,
      section: 'Custom',
      label: c.label,
      kind: 'custom',
      required: true,
      completed: !!c.completed,
      locked: false,
      createdAt: c.createdAt,
    });
  }

  return tasks;
}

export async function getJobPercent(jobId) {
  const tasks = await getJobChecklist(jobId);
  if (tasks.length === 0) return 0;
  const checked = tasks.filter((t) => t.completed).length;
  return Math.round((checked / tasks.length) * 100);
}

export async function getJobAggregateStats(jobId) {
  const panels = await listPanels(jobId);
  let photoCount = 0;
  for (const p of panels) {
    const photos = await listPanelPhotos(p.id);
    photoCount += photos.length;
  }
  const jobPercent = await getJobPercent(jobId);
  return { panelCount: panels.length, photoCount, jobPercent };
}

// Helpers for the exporter — exposed so it doesn't have to recompute the
// auto-checked set or the slug logic itself.
export { slugifyTaskLabel };
