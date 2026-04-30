import React, { useState, useEffect, useRef, useCallback } from 'react';
import schemaMap from '../schema.json';
import {
  listRows, createRow, updateRow, deleteRow, reorderRow,
  getSheetNotes, setSheetNotes, listRowPhotos, exportJobJSON, importJSON,
} from '../db.js';
import { toast } from '../lib/toast.js';
import PhotoChecklist from './PhotoChecklist.jsx';
import RowPhotos from './RowPhotos.jsx';

// Top-level form for one (panel, sheet). Renders:
//   - sheet-level notes scratchpad
//   - row picker (multiple rows per sheet are common)
//   - a row editor (form view) OR table view
//
// Form-vs-table is a per-sheet preference stored in component state.

export default function SheetForm({ job, panel, sheetName, onChange }) {
  const schema = schemaMap[sheetName];
  const [rows, setRows] = useState([]);
  const [activeRowId, setActiveRowId] = useState(null);
  const [view, setView] = useState('form'); // 'form' | 'table'

  async function refresh() {
    const r = await listRows(panel.id, sheetName);
    setRows(r);
    if (r.length > 0 && (!activeRowId || !r.find((x) => x.id === activeRowId))) {
      setActiveRowId(r[0].id);
    }
    if (r.length === 0) setActiveRowId(null);
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [panel.id, sheetName]);

  async function addRow() {
    const row = await createRow({ panelId: panel.id, sheet: sheetName });
    await refresh();
    setActiveRowId(row.id);
    onChange?.();
  }

  async function removeRow(id) {
    // Capture full job snapshot for undo (covers row + its photos)
    const snapshot = await exportJobJSON(job.id);
    await deleteRow(id);
    await refresh();
    onChange?.();
    toast.undoable('Row deleted', {
      onUndo: async () => {
        await importJSON(snapshot, { mode: 'replace' });
        await refresh();
        onChange?.();
      },
    });
  }

  async function moveRow(id, direction) {
    await reorderRow(id, direction);
    await refresh();
  }

  if (!schema) return <div className="card">No schema for {sheetName}</div>;
  const activeRow = rows.find((r) => r.id === activeRowId);

  return (
    <div>
      <SheetNotes panelId={panel.id} sheet={sheetName} panelName={panel.name} />

      <RowPicker
        rows={rows}
        activeRowId={activeRowId}
        onPick={setActiveRowId}
        onAdd={addRow}
        onRemove={removeRow}
        onMove={moveRow}
        sheetName={sheetName}
        schema={schema}
        view={view}
        onViewChange={setView}
      />

      {view === 'table' && rows.length > 0 && (
        <TableView rows={rows} schema={schema} onPick={(id) => { setActiveRowId(id); setView('form'); }} />
      )}

      {view === 'form' && activeRow && (
        <RowEditor
          job={job}
          panel={panel}
          sheetName={sheetName}
          schema={schema}
          row={activeRow}
          onSaved={() => { refresh(); onChange?.(); }}
        />
      )}
    </div>
  );
}

// ----- Sheet-level notes -----
function SheetNotes({ panelId, sheet, panelName }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef('');

  useEffect(() => {
    (async () => {
      const t = await getSheetNotes(panelId, sheet);
      setText(t || '');
      ref.current = t || '';
      setOpen(!!(t && t.length > 0));
    })();
  }, [panelId, sheet]);

  // Debounce save on change
  useEffect(() => {
    if (text === ref.current) return;
    const t = setTimeout(() => {
      setSheetNotes(panelId, sheet, text);
      ref.current = text;
    }, 500);
    return () => clearTimeout(t);
  }, [text, panelId, sheet]);

  return (
    <div className="group" style={{ marginBottom: 10 }}>
      <div className="group-head" onClick={() => setOpen((o) => !o)}>
        <div className="name">📝 Sheet notes {text && <span style={{ color: 'var(--text-dim)', fontSize: 12, fontWeight: 400 }}>({text.length} chars)</span>}</div>
        <div className="count">{open ? '▾' : '▸'}</div>
      </div>
      {open && (
        <div className="group-body">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Notes for ${sheet} on ${panelName || 'this panel'}. Saved automatically. Included in the export's Notes sheet.`}
            style={{ minHeight: 80 }}
          />
        </div>
      )}
    </div>
  );
}

// ----- Row picker -----
function RowPicker({ rows, activeRowId, onPick, onAdd, onRemove, onMove, sheetName, schema, view, onViewChange }) {
  const labelField = schema.columns.find((c) =>
    /name/i.test(c.header) && !/hyperlink/i.test(c.header)
  )?.header || schema.columns[1]?.header;

  return (
    <div className="card" style={{ padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: rows.length ? 8 : 0 }}>
        <strong style={{ flex: 1 }}>{sheetName} {rows.length > 0 && `(${rows.length})`}</strong>
        {rows.length > 1 && (
          <div className="view-toggle">
            <button className={view === 'form' ? 'active' : ''} onClick={() => onViewChange('form')}>Form</button>
            <button className={view === 'table' ? 'active' : ''} onClick={() => onViewChange('table')}>Table</button>
          </div>
        )}
        <button className="primary" onClick={onAdd}>+ Row</button>
      </div>

      {rows.length === 0 && (
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          No rows yet. Tap <strong>+ Row</strong> to add one.
        </div>
      )}

      {rows.length > 0 && view === 'form' && (
        <div className="row-pills">
          {rows.map((r, i) => {
            const lbl = (labelField && r.data[labelField]) || `Row ${i + 1}`;
            const isActive = r.id === activeRowId;
            return (
              <div key={r.id} className={'row-pill' + (isActive ? ' active' : '')}>
                <span className="lbl" onClick={() => onPick(r.id)}>{lbl}</span>
                {isActive && (
                  <>
                    <button className="more" onClick={() => onMove(r.id, -1)} disabled={i === 0} title="Move up">↑</button>
                    <button className="more" onClick={() => onMove(r.id, +1)} disabled={i === rows.length - 1} title="Move down">↓</button>
                    <button className="more" onClick={() => onRemove(r.id)} title="Delete row" style={{ color: 'var(--danger)' }}>✕</button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ----- Table view (review mode) -----
function TableView({ rows, schema, onPick }) {
  // Show non-photo, non-hyperlink columns to keep it scannable
  const visibleCols = schema.columns.filter((c) =>
    c.group !== 'Photo Checklist' && !/Hyperlink/.test(c.header)
  ).slice(0, 10); // first 10 columns

  return (
    <div className="row-table-wrap">
      <table className="row-table">
        <thead>
          <tr>
            {visibleCols.map((c) => <th key={c.header}>{c.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} onClick={() => onPick(r.id)} style={{ cursor: 'pointer' }}>
              {visibleCols.map((c) => (
                <td key={c.header}>{formatCell(r.data[c.header])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(v) {
  if (v === true) return '✓';
  if (v === false) return '';
  if (v == null) return '';
  return String(v);
}

// ----- Row editor (the heavy form) -----
function RowEditor({ job, panel, sheetName, schema, row, onSaved }) {
  const groups = {};
  for (const col of schema.columns) {
    const g = col.group || 'General Data';
    if (!groups[g]) groups[g] = [];
    groups[g].push(col);
  }

  const [photoCount, setPhotoCount] = useState(0);
  useEffect(() => {
    (async () => setPhotoCount((await listRowPhotos(row.id)).length))();
  }, [row.id]);

  return (
    <div>
      {Object.entries(groups).map(([groupName, cols]) => (
        <Group key={groupName} name={groupName} count={cols.length}>
          {groupName === 'Photo Checklist' ? (
            <PhotoChecklist
              job={job}
              panel={panel}
              sheetName={sheetName}
              items={cols.map((c) => c.header)}
            />
          ) : (
            cols.map((col) => (
              <Field
                key={col.header}
                column={col}
                value={row.data[col.header]}
                rowId={row.id}
                isHyperlink={col.header === schema.hyperlink_column}
                panelName={panel.name}
                sheetName={sheetName}
                onChange={async (v) => {
                  await updateRow(row.id, { data: { [col.header]: v } });
                  onSaved();
                }}
              />
            ))
          )}
        </Group>
      ))}

      {/* Row-level photos: every row gets a photos bucket regardless of sheet */}
      <Group name={`📷 Photos for this row (${photoCount})`} count={photoCount}>
        <RowPhotos
          job={job}
          panel={panel}
          sheetName={sheetName}
          row={row}
          onChange={async () => {
            setPhotoCount((await listRowPhotos(row.id)).length);
          }}
        />
      </Group>

      {/* Row-level notes */}
      <Group name="🗒 Row notes" count={1}>
        <RowNotes row={row} onSaved={onSaved} />
      </Group>
    </div>
  );
}

function Group({ name, count, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="group">
      <div className="group-head" onClick={() => setOpen((o) => !o)}>
        <div className="name">{name}</div>
        <div className="count">{open ? '▾' : '▸'}</div>
      </div>
      {open && <div className="group-body">{children}</div>}
    </div>
  );
}

// ----- Field with debounced save-on-type -----
function Field({ column, value, isHyperlink, panelName, sheetName, onChange }) {
  if (isHyperlink) {
    return (
      <div className="field">
        <label>{column.header}</label>
        <input
          value={`Photos/${panelName}/${sheetName}/…`}
          readOnly
          style={{ opacity: 0.6 }}
          title="Auto-generated at export"
        />
      </div>
    );
  }

  if (looksBoolean(column.header)) {
    return (
      <div className="field-checkbox">
        <input
          id={`f-${column.index}`}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
        <label htmlFor={`f-${column.index}`}>{column.header}</label>
      </div>
    );
  }

  return <DebouncedTextField column={column} value={value} onChange={onChange} />;
}

function DebouncedTextField({ column, value, onChange }) {
  const [local, setLocal] = useState(value ?? '');
  const lastSaved = useRef(value ?? '');

  // Sync external value updates (e.g. when active row changes)
  useEffect(() => {
    setLocal(value ?? '');
    lastSaved.current = value ?? '';
  }, [value]);

  // Debounce save
  useEffect(() => {
    if (local === lastSaved.current) return;
    const t = setTimeout(() => {
      onChange(local);
      lastSaved.current = local;
    }, 400);
    return () => clearTimeout(t);
  }, [local]); // eslint-disable-line

  const isLong = /description|notes/i.test(column.header);
  const isNumeric = looksNumeric(column.header);

  return (
    <div className="field">
      <label>{column.header}</label>
      {isLong ? (
        <textarea value={local} onChange={(e) => setLocal(e.target.value)} />
      ) : (
        <input
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          inputMode={isNumeric ? 'decimal' : undefined}
        />
      )}
    </div>
  );
}

function RowNotes({ row, onSaved }) {
  const [text, setText] = useState(row.notes || '');
  const lastSaved = useRef(row.notes || '');

  useEffect(() => {
    setText(row.notes || '');
    lastSaved.current = row.notes || '';
  }, [row.id]); // eslint-disable-line

  useEffect(() => {
    if (text === lastSaved.current) return;
    const t = setTimeout(async () => {
      await updateRow(row.id, { notes: text });
      lastSaved.current = text;
      onSaved?.();
    }, 500);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line

  return (
    <textarea
      value={text}
      onChange={(e) => setText(e.target.value)}
      placeholder="Notes for this row. Saved automatically. Included in the export's Notes sheet."
      style={{ minHeight: 70 }}
    />
  );
}

function looksBoolean(h) {
  return /completed|complete|uploaded|backup/i.test(h);
}

function looksNumeric(h) {
  return /(^|\s)(volts?|amps?|amperage|voltage|hp|kw|hz|frequency|fla|scc|rpm|sec|seconds|inches|height|width|depth|count|qty|fpm|phase|fuse)(\s|$)/i.test(h);
}
