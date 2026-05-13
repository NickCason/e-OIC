import Icon from './Icon';
import type { SheetStatus } from '../lib/metrics';

// Bottom-sheet picker for sheet selection.

export interface ISheetPickerCounts {
    rows: number;
    photos: number;
    required: number;
}

export interface ISheetPickerEntry {
    id: string;
    name: string;
    status: SheetStatus;
    counts: ISheetPickerCounts;
}

export interface ISheetPickerProps {
    sheets: ISheetPickerEntry[];
    activeId: string;
    onPick: (sheetId: string) => void;
    onClose: () => void;
}

function describeCounts(c: ISheetPickerCounts | null | undefined): string {
    if (!c) return '';
    // Sheets with a photo checklist: show photos taken / required.
    if (c.required > 0) return `${c.photos}/${c.required}`;
    // Sheets without photo requirements: surface row count instead.
    if (c.rows > 0) return `${c.rows} row${c.rows === 1 ? '' : 's'}`;
    return '—';
}

const SheetPicker = ({
    sheets, activeId, onPick, onClose,
}: ISheetPickerProps) => (
    /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- modal backdrop click-to-dismiss; buttons cover keyboard path */
    <div className="modal-bg" onClick={onClose}>
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- stopPropagation guard, not an interactive surface */}
        <div className="sheet-picker" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-picker-grip" aria-hidden="true" />
            <h2 className="modal-title">All sheets</h2>
            <div className="sheet-picker-list">
                {sheets.map((s) => (
                    <button
                        key={s.id}
                        type="button"
                        className={`sheet-picker-row${s.id === activeId ? ' active' : ''}`}
                        onClick={() => { onPick(s.id); onClose(); }}
                    >
                        <span className={`sheet-picker-dot ${s.status}`} aria-hidden="true" />
                        <span className="sheet-picker-name">{s.name}</span>
                        <span className="sheet-picker-counts">{describeCounts(s.counts)}</span>
                        <Icon name="next" size={16} className="sheet-picker-chev" />
                    </button>
                ))}
            </div>
        </div>
    </div>
);

export default SheetPicker;
