import { useState } from 'react';
import { rowDisplayLabel } from '../lib/rowLabel';
import schemaMap from '../schema.json' with { type: 'json' };
import type { IJobDiff, IParsedRow } from '../types/xlsx';
import type { IRow, RowData } from '../types/job';

export type DiffDirection = 'pull' | 'push';

export interface IDiffViewProps {
    diff: IJobDiff;
    direction?: DiffDirection;
    removedDecisions?: Set<string>;
    onToggleRemoved?: (rowId: string, accept: boolean) => void;
}

// Minimal row-like shape consumed by rowDisplayLabel. Local rows are IRow,
// parsed (added) rows are IParsedRow — both expose `data`.
interface IRowLike {
    data?: RowData;
    idx?: number;
}

// Cast through unknown: schema.json includes shapes (e.g. nullable
// hyperlink_column) that drift from ISheetSchema's optional-string typing.
// rowDisplayLabel only reads columns/primary_key.
const schemaMapTyped = schemaMap as unknown as Record<string, Parameters<typeof rowDisplayLabel>[2]>;

function initialExpanded(diff: IJobDiff): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    Object.entries(diff.sheets).forEach(([name, sd]) => {
        out[name] = sd.added.length + sd.removed.length + sd.modified.length > 0;
    });
    return out;
}

function countChanges(diff: IJobDiff): number {
    let n = diff.jobMeta.changed.length + diff.panels.added.length + diff.panels.removed.length
        + diff.sheetNotes.added.length + diff.sheetNotes.removed.length + diff.sheetNotes.modified.length;
    Object.values(diff.sheets).forEach((sd) => {
        n += sd.added.length + sd.removed.length + sd.modified.length;
    });
    return n;
}

function labelOrFallback(r: IRowLike | IRow | IParsedRow, sheetName: string, i: number): string {
    const schema = schemaMapTyped[sheetName];
    // rowDisplayLabel accepts a RowLike shape (data + idx); IRow and IParsedRow satisfy.
    const label = rowDisplayLabel(r as IRow, sheetName, schema);
    // rowDisplayLabel returns "Row N" as last-resort generic. In a diff
    // context that's ambiguous across sheets, so qualify it.
    if (/^Row \d+$/.test(label)) return `${sheetName} · row ${i + 1}`;
    return label;
}

const DiffView = ({
    diff, direction = 'pull', removedDecisions, onToggleRemoved,
}: IDiffViewProps) => {
    const [expanded, setExpanded] = useState<Record<string, boolean>>(() => initialExpanded(diff));

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
                        // eslint-disable-next-line react/no-array-index-key -- diff entries have no stable id; index is fine for a static list
                        <div key={i} className="diff-row diff-row--mod">
                            <span className="diff-mark">~</span>
                            <span className="diff-label">
                                {c.field}
                                :
                            </span>
                            <span className="diff-old">{String(c.old || '(empty)')}</span>
                            <span className="diff-arrow">{' → '}</span>
                            <span className="diff-new">{String(c.new || '(empty)')}</span>
                        </div>
                    ))}
                </div>
            )}

            {(diff.panels.added.length > 0 || diff.panels.removed.length > 0) && (
                <div className="diff-section">
                    <div className="diff-section-title">Panels</div>
                    {diff.panels.added.map((p, i) => (
                        // eslint-disable-next-line react/no-array-index-key -- diff entries have no stable id; index is fine for a static list
                        <div key={`pa${i}`} className="diff-row diff-row--add">
                            <span className="diff-mark">+</span>
                            {' '}
                            {p.name}
                        </div>
                    ))}
                    {diff.panels.removed.map((p, i) => (
                        // eslint-disable-next-line react/no-array-index-key -- diff entries have no stable id; index is fine for a static list
                        <div key={`pr${i}`} className="diff-row diff-row--del">
                            <span className="diff-mark">−</span>
                            {' '}
                            {p.name}
                        </div>
                    ))}
                </div>
            )}

            {(diff.sheetNotes.added.length > 0 || diff.sheetNotes.removed.length > 0 || diff.sheetNotes.modified.length > 0) && (
                <div className="diff-section diff-section--notes">
                    <div className="diff-section-title">Sheet notes</div>
                    {diff.sheetNotes.added.map((n, i) => (
                        // eslint-disable-next-line react/no-array-index-key -- diff entries have no stable id; index is fine for a static list
                        <div key={`sna${i}`} className="diff-row diff-row--add">
                            <span className="diff-mark">+</span>
                            <span className="diff-label">
                                {n.panelName}
                                {' · '}
                                {n.sheetName}
                                :
                                {' '}
                            </span>
                            <span className="diff-new">{String(n.text || '(empty)')}</span>
                        </div>
                    ))}
                    {diff.sheetNotes.removed.map((n, i) => (
                        // eslint-disable-next-line react/no-array-index-key -- diff entries have no stable id; index is fine for a static list
                        <div key={`snr${i}`} className="diff-row diff-row--del">
                            <span className="diff-mark">−</span>
                            <span className="diff-label">
                                {n.panelName}
                                {' · '}
                                {n.sheetName}
                                :
                                {' '}
                            </span>
                            <span className="diff-old">{String(n.text || '(empty)')}</span>
                        </div>
                    ))}
                    {diff.sheetNotes.modified.map((n, i) => (
                        // eslint-disable-next-line react/no-array-index-key -- diff entries have no stable id; index is fine for a static list
                        <div key={`snm${i}`} className="diff-row diff-row--mod">
                            <span className="diff-mark">~</span>
                            <span className="diff-label">
                                {n.panelName}
                                {' · '}
                                {n.sheetName}
                            </span>
                            <div className="diff-field-change diff-field-change--stacked">
                                <div className="diff-field-old">{String(n.old || '(empty)')}</div>
                                <div className="diff-field-new">{String(n.new || '(empty)')}</div>
                            </div>
                        </div>
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
                                ? (
                                    <span className="diff-count">
                                        {' ('}
                                        {changeCount}
                                        {' change'}
                                        {changeCount !== 1 ? 's' : ''}
                                        )
                                    </span>
                                )
                                : <span className="diff-count diff-count--none"> no changes</span>}
                            {sd.labelCollisions.length > 0 && (
                                <span className="diff-collision" title="Position-matched: identical labels appear multiple times">⚠</span>
                            )}
                        </button>

                        {isOpen && (
                            <div className="diff-section-body">
                                {sd.modified.map((m, i) => (
                                    // eslint-disable-next-line react/no-array-index-key -- diff entries have no stable id; index is fine for a static list
                                    <div key={`m${i}`} className="diff-row diff-row--mod">
                                        <span className="diff-mark">~</span>
                                        {' '}
                                        {m.label || labelOrFallback(m.local || m.xlsx || { data: {} }, sheetName, i)}
                                        {m.fieldChanges.map((fc, j) => (
                                            // eslint-disable-next-line react/no-array-index-key -- diff entries have no stable id; index is fine for a static list
                                            <div key={j} className="diff-field-change diff-field-change--stacked">
                                                <div className="diff-field-name">{fc.field}</div>
                                                <div className="diff-field-old">{String(fc.old ?? '(empty)')}</div>
                                                <div className="diff-field-new">{String(fc.new ?? '(empty)')}</div>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                                {sd.added.map((r, i) => (
                                    // eslint-disable-next-line react/no-array-index-key -- diff entries have no stable id; index is fine for a static list
                                    <div key={`a${i}`} className="diff-row diff-row--add">
                                        <span className="diff-mark">+</span>
                                        {' '}
                                        {labelOrFallback(r, sheetName, i)}
                                    </div>
                                ))}
                                {sd.removed.map((r, i) => {
                                    const accepted = removedDecisions ? removedDecisions.has(r.id) : true;
                                    return (
                                        // eslint-disable-next-line react/no-array-index-key -- diff entries have no stable id; index is fine for a static list
                                        <div key={`d${i}`} className="diff-row diff-row--del">
                                            <span className="diff-mark">−</span>
                                            {' '}
                                            {labelOrFallback(r, sheetName, i)}
                                            {direction === 'pull' && onToggleRemoved && (
                                                <span className="diff-keep-drop">
                                                    <button
                                                        type="button"
                                                        className={`diff-pill ${accepted ? '' : 'active'}`}
                                                        onClick={() => onToggleRemoved(r.id, false)}
                                                    >
                                                        Keep local
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={`diff-pill ${accepted ? 'active' : ''}`}
                                                        onClick={() => onToggleRemoved(r.id, true)}
                                                    >
                                                        Accept removal
                                                    </button>
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
                        // eslint-disable-next-line react/no-array-index-key -- skip entries have no stable id
                        <div key={i} className="diff-skip">
                            ⊘ &quot;
                            {s}
                            &quot; sheet skipped (not in schema)
                        </div>
                    ))}
                </div>
            )}
            {diff.skippedColumns.length > 0 && (
                <div className="diff-skip-block">
                    {diff.skippedColumns.map((c, i) => (
                        // eslint-disable-next-line react/no-array-index-key -- skip entries have no stable id
                        <div key={i} className="diff-skip">
                            ⊘ &quot;
                            {c.columnName}
                            &quot; column skipped in
                            {' '}
                            {c.sheetName}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DiffView;
