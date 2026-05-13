import { useState, useRef, useEffect } from 'react';
import Icon from './Icon';
import type { IChecklistTaskItem } from '../lib/metrics';

// One row in the Checklist screen. Renders auto, manual, or custom tasks.

export interface IChecklistTaskRowProps {
    task: IChecklistTaskItem;
    onToggle: () => void;
    onRename: (label: string) => void;
    onDelete: () => void;
}

const ChecklistTaskRow = ({
    task, onToggle, onRename, onDelete,
}: IChecklistTaskRowProps) => {
    const [menuOpen, setMenuOpen] = useState<boolean>(false);
    const [renaming, setRenaming] = useState<boolean>(false);
    const [draft, setDraft] = useState<string>(task.label);
    const [pulsing, setPulsing] = useState<boolean>(false);
    const prevCheckedRef = useRef<boolean>(!!task.completed);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (renaming) {
            setDraft(task.label);
            setTimeout(() => inputRef.current?.select(), 0);
        }
    }, [renaming, task.label]);

    // Pulse when completed transitions false -> true. No pulse on uncheck or
    // initial mount with already-completed tasks.
    useEffect(() => {
        if (!prevCheckedRef.current && task.completed) {
            setPulsing(true);
            const t = setTimeout(() => setPulsing(false), 700);
            prevCheckedRef.current = true;
            return () => clearTimeout(t);
        }
        prevCheckedRef.current = !!task.completed;
        return undefined;
    }, [task.completed]);

    function commitRename(): void {
        const trimmed = draft.trim();
        if (!trimmed) {
            setRenaming(false);
            setDraft(task.label);
            return;
        }
        if (trimmed !== task.label) onRename(trimmed);
        setRenaming(false);
    }

    function cancelRename(): void {
        setRenaming(false);
        setDraft(task.label);
    }

    if (renaming) {
        return (
            <div className="checklist-task-row checklist-task-row--editing">
                <input
                    ref={inputRef}
                    className="checklist-rename-input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename();
                        else if (e.key === 'Escape') cancelRename();
                    }}
                    onBlur={commitRename}
                    aria-label="Rename task"
                />
            </div>
        );
    }

    const checked = !!task.completed;
    const locked = !!task.locked;
    const isCustom = task.kind === 'custom';

    return (
        <div className={`checklist-task-row ${checked ? 'is-checked' : ''} ${locked ? 'is-locked' : ''} ${pulsing ? 'pulse-on' : ''}`.trim()}>
            <button
                type="button"
                className="checklist-task-row__check"
                onClick={() => { if (!locked) onToggle(); }}
                aria-pressed={checked}
                aria-label={`${checked ? 'Uncheck' : 'Check'} ${task.label}`}
                disabled={locked}
            >
                {locked
                    ? <Icon name="check" size={14} className={checked ? 'is-on' : 'is-off'} />
                    : (checked ? <Icon name="check" size={16} /> : <span className="checklist-empty-box" />)}
            </button>
            <div className="checklist-task-row__main">
                <div className="checklist-task-row__label">{task.label}</div>
                {locked && (
                    <div className="checklist-task-row__caption">
                        {checked
                            ? `Auto-checked from ${task.sheet || 'sheet'} sheet`
                            : `Auto-checks when ${task.sheet || 'this'} sheet has rows`}
                    </div>
                )}
            </div>
            {isCustom && (
                <div className="checklist-task-row__actions">
                    <button
                        type="button"
                        className="icon-btn ghost"
                        onClick={() => setMenuOpen((v) => !v)}
                        aria-label="Task actions"
                    >
                        <Icon name="more" size={16} />
                    </button>
                    {menuOpen && (
                        <div className="checklist-task-menu" onMouseLeave={() => setMenuOpen(false)}>
                            <button
                                type="button"
                                onClick={() => { setMenuOpen(false); setRenaming(true); }}
                            >
                                Rename
                            </button>
                            <button
                                type="button"
                                className="danger"
                                onClick={() => { setMenuOpen(false); onDelete(); }}
                            >
                                Delete
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ChecklistTaskRow;
