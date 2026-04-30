// fieldHints.js — central config for form-field UX:
//   - HINTS: placeholder text shown inside empty inputs (units, examples)
//   - ENUM_HEADERS: hardcoded option lists (rendered as a datalist so the
//     field still accepts free typing for edge cases like "N/A" variants)
//   - SHARED_HEADERS: headers whose options come from other rows in the
//     current job — typing an Area in one row makes it suggested in the
//     next.
//
// Datalist (rather than a strict <select>) is intentional everywhere —
// keeps the existing fluid-typing model the user expects.

export const HINTS = {
  // Currents / power
  'FLA': 'amps',
  'Amperage In': 'amps',
  'Amperage Out': 'amps',
  'Motor OL Current': 'amps',
  'Circuit Rating': 'amps',
  'SCC': 'e.g. 5.39 kA',
  'Frequency': 'Hz',
  'Largest Motor HP': 'HP',
  'Volts Max': 'V',
  'Voltage': 'e.g. 120 VAC',
  'Voltage In': 'e.g. 480 VAC',
  'Voltage Out': 'e.g. 120 VAC',

  // Drive / motor
  'Motor NP Volts': 'V',
  'Motor NP Hz': 'Hz',
  'Motor NP RPM': 'RPM',
  'Motor NP Power (HP/kW)': 'HP or kW',
  'Minimum Freq.': 'Hz',
  'Maximum Freq.': 'Hz',
  'Accel Time 1 (sec)': 'sec',
  'Decel Time 1 (sec)': 'sec',

  // Conveyor speeds
  'Tach Reading 1 (fpm)': 'fpm',
  'Tach Reading 2 (fpm)': 'fpm',
  'Tach Reading 3 (fpm)': 'fpm',
  'Tach Reading 4 (fpm)': 'fpm',
  'Tach Reading 5 (fpm)': 'fpm',
  'VFD Speed 1 (Hz)': 'Hz',
  'VFD Speed 2 (Hz)': 'Hz',
  'VFD Speed 3 (Hz)': 'Hz',
  'VFD Speed 4 (Hz)': 'Hz',
  'VFD Speed 5 (Hz)': 'Hz',

  // Dimensions / clearances (all in inches per the template convention)
  'Height': 'inches',
  'Width': 'inches',
  'Depth': 'inches',
  'Height 2': 'inches',
  'Width 2': 'inches',
  'Depth 2': 'inches',
  'Top': 'inches',
  'Bottom': 'inches',
  'Left': 'inches',
  'Right': 'inches',
  'Front': 'inches',
  'Back': 'inches',

  // Counts
  '# Ports in use': 'count',
  'Input Device Count': 'count',
  'Output Device Count': 'count',
  'Safety Input Count (To PLC/MSR)': 'count',
  'Safety Output Count (From PLC/MSR)': 'count',

  // Network
  'Comm Address (IP, Serial, Fieldbus, RIO)': 'e.g. 172.25.106.100',
  'Destination Address': 'e.g. 172.25.106.50',
};

const PHASE_OPTS = ['Single', 'Three', 'N/A'];
const PROTOCOL_OPTS = [
  'EtherNet/IP', 'Modbus TCP', 'Modbus RTU', 'DeviceNet', 'ControlNet',
  'Profibus', 'Serial', 'RIO', 'Fieldbus', 'N/A',
];
const VOLTAGE_OPTS = [
  '24 VDC', '12 VDC', '120 VAC', '208 VAC', '240 VAC', '277 VAC',
  '480 VAC', '600 VAC', 'N/A',
];

export const ENUM_HEADERS = {
  'Phase': PHASE_OPTS,
  'Phase In': PHASE_OPTS,
  'Phase Out': PHASE_OPTS,

  'Comm Protocol': PROTOCOL_OPTS,
  'Communication Protocol': PROTOCOL_OPTS,

  'Voltage': VOLTAGE_OPTS,
  'Voltage In': VOLTAGE_OPTS,
  'Voltage Out': VOLTAGE_OPTS,

  'Start Mode': ['2-Wire', '3-Wire', 'N/A'],
  'Stop Mode': ['Ramp', 'Coast', 'DC Brake', 'Ramp, CF', 'Coast, CF', 'N/A'],

  'Hardware Platform': [
    'WonderWare InTouch', 'FactoryTalk View SE', 'FactoryTalk View ME',
    'PanelView Plus', 'Industrial PC', 'Other',
  ],
};

// Headers whose autocomplete options come from existing values in other
// rows of the current job. Cross-sheet (so an Area typed on Panels suggests
// itself on Drive Parameters etc.).
export const SHARED_HEADERS = new Set([
  'Area',
  'Panel Name',
  'Drawing Reference',
  'Device Name',
  'Rack Name',
  'Safety Circuit',
  'HMI Name',
  'Circuit Name',
  'Source Panel',
  'Application Name',
]);

export function getHint(header) {
  return HINTS[header] || null;
}

export function getEnumOptions(header) {
  return ENUM_HEADERS[header] || null;
}

export function isSharedHeader(header) {
  return SHARED_HEADERS.has(header);
}

// Stable, datalist-id-safe slug from a column header.
export function slugForId(header) {
  return String(header).replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
}
