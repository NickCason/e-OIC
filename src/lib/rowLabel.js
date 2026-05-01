// rowLabel.js — single source of truth for the human-facing label of a row.
//
// The "row pill" in SheetForm, the row-photo folder name in the xlsx export,
// the photo overlay's bottom line — all derive from rowDisplayLabel(...).
//
// Why per-sheet config: every row carries an inherited "Panel Name" column
// (auto-filled from the parent panel), so a generic /name/i search lands on
// "Panel Name" everywhere and labels every row identically. This map names
// the column that actually distinguishes rows of each sheet type.

export const SHEET_LABEL_CONFIG = {
  'Panels': { fields: ['Panel Name'] },
  'Power': { fields: ['Device Name'] },
  'PLC Racks': { fields: ['Rack Name'] },
  'PLC Slots': {
    format: (data) => {
      const slot = data?.['Slot'];
      const pn = data?.['Part Number'] || data?.['Slot Part Number'];
      const slotStr = slot != null && slot !== '' ? `Slot ${slot}` : '';
      if (slotStr && pn) return `${slotStr} · ${pn}`;
      return slotStr || pn || null;
    },
  },
  'Fieldbus IO': { fields: ['Device Name'] },
  'Network Devices': { fields: ['Device Name'] },
  'HMIs': { fields: ['HMI Name'] },
  'Ethernet Switches': { fields: ['Name'] },
  'Drive Parameters': { fields: ['Device Name'] },
  'Conv. Speeds': { fields: ['Device Name'] },
  'Safety Circuit': { fields: ['Circuit Name'] },
  'Safety Devices': { fields: ['Device Name'] },
  'Peer to Peer Comms': { fields: ['Device Name'] },
};

export function rowDisplayLabel(row, sheetName, schema) {
  const data = row?.data || {};
  const cfg = SHEET_LABEL_CONFIG[sheetName];
  if (cfg?.format) {
    const v = cfg.format(data);
    if (v) return String(v);
  }
  if (cfg?.fields) {
    for (const f of cfg.fields) {
      const v = data[f];
      if (v != null && v !== '') return String(v);
    }
  }
  // Generic fallback: any *Name column except "Panel Name" (inherited from
  // parent — labeling every row by the panel name is exactly the bug we're
  // avoiding). Try Panel Name only as a last resort.
  if (schema?.columns) {
    for (const col of schema.columns) {
      if (col.header === 'Panel Name') continue;
      if (/name/i.test(col.header) && !/hyperlink/i.test(col.header)) {
        const v = data[col.header];
        if (v != null && v !== '') return String(v);
      }
    }
    const panelName = data['Panel Name'];
    if (panelName) return String(panelName);
  }
  return `Row ${(row?.idx ?? 0) + 1}`;
}
