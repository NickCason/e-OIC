import { useState, useEffect, useRef, type ReactNode } from 'react';
import schemaMap from '../schema.json' with { type: 'json' };
import { listRows, createRow, updateRow, deleteRow, reorderRow, getSheetNotes, setSheetNotes, listRowPhotos, exportJobJSON, importJSON, listPanels, listAllRows } from '../db';
import { toast } from '../lib/toast';
import { rowPhotoFolder } from '../lib/paths';
import { rowDisplayLabel } from '../lib/rowLabel';
import { getHint, getEnumOptions, isSharedHeader, slugForId } from '../lib/fieldHints';
import PhotoChecklist from './PhotoChecklist';
import RowPhotos from './RowPhotos';
import SaveBar from './SaveBar';
import Marquee from './Marquee';
import type { IJob, IPanel, IRow, RowValue, RowData } from '../types/job';
import type { ISheetSchema, ISheetSchemaColumn } from '../types/xlsx';

// Top-level form for one (panel, sheet). Renders:
//   - sheet-level notes scratchpad
//   - row picker (multiple rows per sheet are common)
//   - a row editor (form view) OR table view
//
// Form-vs-table is a per-sheet preference stored in component state.

// schema.json is keyed by sheet name; cast through unknown because the JSON
// shape is broader (nullable hyperlink_column, etc.) than ISheetSchema.
const schemaMapTyped = schemaMap as unknown as Record<string, ISheetSchema | undefined>;

type SheetView = 'form' | 'table';

type SharedValues = Record<string, string[]>;

/* eslint-disable react/jsx-no-bind -- arrow handlers in JSX are intentional throughout this form; hoisting every debounced/inline handler adds noise without benefit */

// ---- Helpers ----

function looksBoolean(h: string): boolean {
    return /completed|complete|uploaded|backup/i.test(h);
}

function looksNumeric(h: string): boolean {
    return /(^|\s)(volts?|amps?|amperage|voltage|hp|kw|hz|frequency|fla|scc|rpm|sec|seconds|inches|height|width|depth|count|qty|fpm|phase|fuse)(\s|$)/i.test(h);
}

function formatCell(v: RowValue | undefined): string {
    if (v === true) return '✓';
    if (v === false) return '';
    if (v == null) return '';
    return String(v);
}

function addRowToAcc(row: IRow, acc: Record<string, Set<string>>): void {
    Object.entries(row.data || {}).forEach(([k, v]) => {
        if (typeof v !== 'string') return;
        const t = v.trim();
        if (!t) return;
        if (!acc[k]) acc[k] = new Set<string>();
        acc[k].add(t);
    });
}

// Collect every distinct string value per column header across all panels'
// rows. Hoisted out of the component to keep effect bodies shallow (max-depth: 2).
async function collectSharedValues(jobId: string): Promise<SharedValues> {
    const acc: Record<string, Set<string>> = {};
    const panels = await listPanels(jobId);
    const rowsPerPanel = await Promise.all(panels.map((p) => listAllRows(p.id)));
    rowsPerPanel.flat().forEach((r) => addRowToAcc(r, acc));
    const out: SharedValues = {};
    Object.entries(acc).forEach(([k, s]) => { out[k] = Array.from(s).sort(); });
    return out;
}

function groupColumns(schema: ISheetSchema): Record<string, ISheetSchemaColumn[]> {
    const groups: Record<string, ISheetSchemaColumn[]> = {};
    schema.columns.forEach((col) => {
        const g = col.group || 'General Data';
        if (!groups[g]) groups[g] = [];
        groups[g].push(col);
    });
    return groups;
}

// ---- Subcomponents ----

interface ISheetNotesProps {
    panelId: string;
    sheet: string;
    panelName: string;
}

const SheetNotes = ({ panelId, sheet, panelName }: ISheetNotesProps) => {
    const [text, setText] = useState<string>('');
    const [open, setOpen] = useState<boolean>(false);
    const ref = useRef<string>('');

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
        if (text === ref.current) return undefined;
        const t = setTimeout(() => {
            setSheetNotes(panelId, sheet, text);
            ref.current = text;
        }, 500);
        return () => clearTimeout(t);
    }, [text, panelId, sheet]);

    return (
        <div className="group" style={{ marginBottom: 10 }}>
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- group header is a disclosure surface; the chevron carries the visual affordance */}
            <div className="group-head" onClick={() => setOpen((o) => !o)}>
                <div className="name">
                    {'📝 Sheet notes '}
                    {text && (
                        <span style={{
                            color: 'var(--text-dim)', fontSize: 12, fontWeight: 400
                        }}
                        >
                            {`(${text.length} chars)`}
                        </span>
                    )}
                </div>
                <div className="count">{open ? '▾' : '▸'}</div>
            </div>
            <div className={`group-body-wrap${open ? ' open' : ''}`}>
                <div className="group-body">
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={`Notes for ${sheet} on ${panelName || 'this panel'}. Saved automatically. Included in the export's Notes sheet.`}
                        style={{ minHeight: 80 }}
                    />
                </div>
            </div>
        </div>
    );
};

interface IRowPickerProps {
    rows: IRow[];
    activeRowId: string | null;
    onPick: (id: string) => void;
    onRemove: (id: string) => void;
    onMove: (id: string, direction: number) => void;
    sheetName: string;
    schema: ISheetSchema;
    view: SheetView;
    onViewChange: (v: SheetView) => void;
}

const RowPicker = ({
    rows, activeRowId, onPick, onRemove, onMove, sheetName, schema, view, onViewChange
}: IRowPickerProps) => (
    <div className="card" style={{ padding: 10 }}>
        <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: rows.length ? 8 : 0
        }}
        >
            <strong style={{ flex: 1 }}>
                {`${sheetName} `}
                {rows.length > 0 && `(${rows.length})`}
            </strong>
            {rows.length > 1 && (
                <div className="view-toggle">
                    <button type="button" className={view === 'form' ? 'active' : ''} onClick={() => onViewChange('form')}>Form</button>
                    <button type="button" className={view === 'table' ? 'active' : ''} onClick={() => onViewChange('table')}>Table</button>
                </div>
            )}
        </div>

        {rows.length === 0 && (
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                {'No rows yet. Tap '}
                <strong>+ New row</strong>
                {' below to add one.'}
            </div>
        )}

        {rows.length > 0 && view === 'form' && (
            <div className="row-pills">
                {rows.map((r, i) => {
                    const lbl = rowDisplayLabel(r, sheetName, schema);
                    const isActive = r.id === activeRowId;
                    return (
                        <div key={r.id} className={`row-pill${isActive ? ' active' : ''}`}>
                            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- pill label selects the row; sibling buttons cover the keyboard path */}
                            <span className="lbl" onClick={() => onPick(r.id)}><Marquee>{lbl}</Marquee></span>
                            {isActive && (
                                <>
                                    <button type="button" className="more" onClick={() => onMove(r.id, -1)} disabled={i === 0} title="Move up">↑</button>
                                    <button type="button" className="more" onClick={() => onMove(r.id, +1)} disabled={i === rows.length - 1} title="Move down">↓</button>
                                    <button type="button" className="more" onClick={() => onRemove(r.id)} title="Delete row" style={{ color: 'var(--danger)' }}>✕</button>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        )}
    </div>
);

interface ITableViewProps {
    rows: IRow[];
    schema: ISheetSchema;
    onPick: (id: string) => void;
}

const TableView = ({ rows, schema, onPick }: ITableViewProps) => {
    // Show non-photo, non-hyperlink columns to keep it scannable
    const visibleCols = schema.columns.filter((c) => (
        c.group !== 'Photo Checklist' && !/Hyperlink/.test(c.header)
    )).slice(0, 10); // first 10 columns

    return (
        <div className="row-table-wrap">
            <table className="row-table">
                <thead>
                    <tr>
                        {visibleCols.map((c) => <th key={c.header}>{c.header}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r) => (
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
};

interface IGroupProps {
    name: string;
    children: ReactNode;
}

const Group = ({ name, children }: IGroupProps) => {
    const [open, setOpen] = useState<boolean>(true);
    return (
        <div className="group">
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- group header is a disclosure surface; chevron carries the visual affordance */}
            <div className="group-head" onClick={() => setOpen((o) => !o)}>
                <div className="name">{name}</div>
                <div className="count">{open ? '▾' : '▸'}</div>
            </div>
            <div className={`group-body-wrap${open ? ' open' : ''}`}>
                <div className="group-body">{children}</div>
            </div>
        </div>
    );
};

interface IDebouncedTextFieldProps {
    column: ISheetSchemaColumn;
    value: RowValue | undefined;
    onChange: (v: string) => void;
    datalistOptions: string[] | null;
    hint: string | null;
}

const DebouncedTextField = ({
    column, value, onChange, datalistOptions, hint
}: IDebouncedTextFieldProps) => {
    const [local, setLocal] = useState<string>(value == null ? '' : String(value));
    const lastSaved = useRef<string>(value == null ? '' : String(value));

    // Sync external value updates (e.g. when active row changes)
    useEffect(() => {
        const s = value == null ? '' : String(value);
        setLocal(s);
        lastSaved.current = s;
    }, [value]);

    // Debounce save
    useEffect(() => {
        if (local === lastSaved.current) return undefined;
        const t = setTimeout(() => {
            onChange(local);
            lastSaved.current = local;
        }, 400);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intent: debounce on text change only; onChange identity intentionally excluded
    }, [local]);

    const isLong = /description|notes/i.test(column.header);
    const isNumeric = looksNumeric(column.header);
    const listId = datalistOptions && datalistOptions.length > 0
        ? `dl-${slugForId(column.header)}-${column.index}`
        : null;
    const inputId = `f-${column.index}`;
    const placeholder = hint ?? undefined;

    return (
        <div className="field">
            <label htmlFor={inputId}>{column.header}</label>
            {isLong ? (
                <textarea
                    id={inputId}
                    value={local}
                    onChange={(e) => setLocal(e.target.value)}
                    placeholder={placeholder}
                />
            ) : (
                <input
                    id={inputId}
                    value={local}
                    onChange={(e) => setLocal(e.target.value)}
                    inputMode={isNumeric ? 'decimal' : undefined}
                    placeholder={placeholder}
                    list={listId ?? undefined}
                    autoComplete="off"
                />
            )}
            {listId && datalistOptions && (
                <datalist id={listId}>
                    {datalistOptions.map((opt) => <option key={opt} value={opt} />)}
                </datalist>
            )}
        </div>
    );
};

interface IFieldProps {
    column: ISheetSchemaColumn;
    value: RowValue | undefined;
    isHyperlink: boolean;
    hyperlinkPath: string | null;
    sharedSuggestions: string[] | null;
    onChange: (v: RowValue) => void;
}

const Field = ({
    column, value, isHyperlink, hyperlinkPath, sharedSuggestions, onChange
}: IFieldProps) => {
    if (isHyperlink) {
        const inputId = `f-${column.index}`;
        return (
            <div className="field">
                <label htmlFor={inputId}>{column.header}</label>
                <div id={inputId} className="hyperlink-path" title="Auto-generated at export. Click in the exported xlsx to open this folder in the unzipped Photos directory.">
                    {hyperlinkPath}
                </div>
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

    // Datalist options: prefer hardcoded enum (Phase, Protocol, etc.); fall
    // back to shared cross-row suggestions (Area, Panel Name, etc.).
    const enumOpts = getEnumOptions(column.header);
    const datalistOptions = enumOpts ? Array.from(enumOpts) : sharedSuggestions;

    return (
        <DebouncedTextField
            column={column}
            value={value}
            onChange={onChange}
            datalistOptions={datalistOptions}
            hint={getHint(column.header)}
        />
    );
};

interface IRowNotesProps {
    row: IRow;
    onSaved?: () => void;
}

const RowNotes = ({ row, onSaved }: IRowNotesProps) => {
    const [text, setText] = useState<string>(row.notes || '');
    const lastSaved = useRef<string>(row.notes || '');

    useEffect(() => {
        setText(row.notes || '');
        lastSaved.current = row.notes || '';
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intent: reset only when the active row changes
    }, [row.id]);

    useEffect(() => {
        if (text === lastSaved.current) return undefined;
        const t = setTimeout(async () => {
            await updateRow(row.id, { notes: text });
            lastSaved.current = text;
            onSaved?.();
        }, 500);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intent: debounce on text change only
    }, [text]);

    return (
        <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Notes for this row. Saved automatically. Included in the export's Notes sheet."
            style={{ minHeight: 70 }}
        />
    );
};

interface IRowEditorProps {
    job: IJob;
    panel: IPanel;
    sheetName: string;
    schema: ISheetSchema;
    row: IRow;
    sharedValues: SharedValues;
    onSaved: () => void;
}

const RowEditor = ({
    job, panel, sheetName, schema, row, sharedValues, onSaved
}: IRowEditorProps) => {
    const groups = groupColumns(schema);

    const [photoCount, setPhotoCount] = useState<number>(0);
    useEffect(() => {
        (async () => setPhotoCount((await listRowPhotos(row.id)).length))();
    }, [row.id]);

    return (
        <div>
            {Object.entries(groups).map(([groupName, cols]) => (
                <Group key={groupName} name={groupName}>
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
                                isHyperlink={col.header === schema.hyperlink_column}
                                hyperlinkPath={
                                    col.header === schema.hyperlink_column
                                        ? rowPhotoFolder(panel.name, sheetName, row, schema)
                                        : null
                                }
                                sharedSuggestions={
                                    isSharedHeader(col.header) ? (sharedValues[col.header] ?? []) : null
                                }
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
            <Group name={`📷 Photos for this row (${photoCount})`}>
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
            <Group name="🗒 Row notes">
                <RowNotes row={row} onSaved={onSaved} />
            </Group>
        </div>
    );
};

// ---- Top-level component ----

export interface ISheetFormProps {
    job: IJob;
    panel: IPanel;
    sheetName: string;
    onChange?: () => void;
}

const SheetForm = ({
    job, panel, sheetName, onChange
}: ISheetFormProps) => {
    const schema = schemaMapTyped[sheetName];
    const [rows, setRows] = useState<IRow[]>([]);
    const [activeRowId, setActiveRowId] = useState<string | null>(null);
    const [view, setView] = useState<SheetView>('form');
    // Map of header -> string[] of distinct values across all rows in the job.
    // Drives the cross-row autocomplete for SHARED_HEADERS (Area, Panel Name,
    // etc.). Refreshed on mount, on row save, and on panel/sheet change.
    const [sharedValues, setSharedValues] = useState<SharedValues>({});
    // Counter that bumps on every confirmed autosave write; SaveBar watches it
    // to flash its "Saved ✓" pill.
    const [savePulse, setSavePulse] = useState<number>(0);

    async function refresh(): Promise<void> {
        const r = await listRows(panel.id, sheetName);
        setRows(r);
        const first = r[0];
        if (first && (!activeRowId || !r.find((x) => x.id === activeRowId))) {
            setActiveRowId(first.id);
        }
        if (r.length === 0) setActiveRowId(null);
    }

    async function refreshSharedValues(): Promise<void> {
        if (!job.id) return;
        setSharedValues(await collectSharedValues(job.id));
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh is a non-stable inline async fn; adding it would infinite-loop. Intent: run only when panel/sheet context changes.
    useEffect(() => { refresh(); }, [panel.id, sheetName]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshSharedValues is a non-stable inline async fn; adding it would infinite-loop. Intent: run only when job/panel/sheet context changes.
    useEffect(() => { refreshSharedValues(); }, [job.id, panel.id, sheetName]);

    async function addRow(): Promise<void> {
        // Pre-fill any column inherited from the parent panel. Editable like
        // anything else — this is just a sensible default so the row's "Panel
        // Name" cell isn't blank in the export.
        const initial: RowData = {};
        if (schema?.columns?.some((c) => c.header === 'Panel Name')) {
            initial['Panel Name'] = panel.name;
        }
        const row = await createRow({
            panelId: panel.id, sheet: sheetName, data: initial
        });
        await refresh();
        setActiveRowId(row.id);
        onChange?.();
    }

    async function removeRow(id: string): Promise<void> {
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

    async function moveRow(id: string, direction: number): Promise<void> {
        await reorderRow(id, direction);
        await refresh();
    }

    if (!schema) {
        return (
            <div className="card">
                {`No schema for ${sheetName}`}
            </div>
        );
    }
    const activeRow = rows.find((r) => r.id === activeRowId) ?? null;

    const currentRowIndex = rows.findIndex((r) => r.id === activeRowId);
    const hasNextRow = currentRowIndex >= 0 && currentRowIndex < rows.length - 1;

    function handleSaveAndNext(): void {
        // Force-blur the active input so its onBlur/debounced autosave fires.
        if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        const next = rows[currentRowIndex + 1];
        if (hasNextRow && next) {
            setActiveRowId(next.id);
        } else {
            addRow();
        }
    }

    return (
        <div>
            <SheetNotes panelId={panel.id} sheet={sheetName} panelName={panel.name} />

            <RowPicker
                rows={rows}
                activeRowId={activeRowId}
                onPick={setActiveRowId}
                onRemove={removeRow}
                onMove={moveRow}
                sheetName={sheetName}
                schema={schema}
                view={view}
                onViewChange={setView}
            />

            {view === 'table' && rows.length > 0 && (
                <TableView
                    rows={rows}
                    schema={schema}
                    onPick={(id) => { setActiveRowId(id); setView('form'); }}
                />
            )}

            {view === 'form' && activeRow && (
                <RowEditor
                    job={job}
                    panel={panel}
                    sheetName={sheetName}
                    schema={schema}
                    row={activeRow}
                    sharedValues={sharedValues}
                    onSaved={() => {
                        setSavePulse((n) => n + 1);
                        refresh();
                        refreshSharedValues();
                        onChange?.();
                    }}
                />
            )}

            {view === 'form' && (
                <SaveBar
                    onSaveAndNext={handleSaveAndNext}
                    nextLabel={hasNextRow ? 'next' : 'new'}
                    pulseSavedKey={savePulse}
                />
            )}
        </div>
    );
};

/* eslint-enable react/jsx-no-bind */

export default SheetForm;
