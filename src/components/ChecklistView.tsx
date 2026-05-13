import { useState, useEffect, useRef, useCallback, type RefObject } from 'react';
import { getJob, setManualTaskCompleted, addCustomTask, renameCustomTask, setCustomTaskCompleted, deleteCustomTask, getChecklistState, setChecklistState } from '../db';
import { getJobChecklist, getJobPercent, CHECKLIST_SECTIONS, type IChecklistTaskItem, type ChecklistSection } from '../lib/metrics';
import { nav } from '../lib/nav';
import { toast } from '../lib/toast';
import AppBar from './AppBar';
import PercentBar from './PercentBar';
import ChecklistTaskRow from './ChecklistTaskRow';
import Icon from './Icon';
import CountUp from './CountUp';
import type { IJob } from '../types/job';

interface IAddTaskRowProps {
    adding: boolean;
    draft: string;
    setDraft: (s: string) => void;
    onAdd: () => void;
    onCancel: () => void;
    onStart: () => void;
    inputRef: RefObject<HTMLInputElement>;
}

/* eslint-disable react/jsx-no-bind -- arrow handlers in JSX are intentional throughout this view; the render-frequency penalty is negligible and hoisting every one-liner adds more noise than it removes */

const AddTaskRow = ({
    adding, draft, setDraft, onAdd, onCancel, onStart, inputRef,
}: IAddTaskRowProps) => {
    if (!adding) {
        return (
            <button
                type="button"
                className="checklist-add-btn"
                onClick={onStart}
            >
                <Icon name="add" size={16} />
                {' Add task'}
            </button>
        );
    }
    const trimmed = draft.trim();
    return (
        <div className="checklist-add-input">
            <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && trimmed) onAdd();
                    else if (e.key === 'Escape') onCancel();
                }}
                placeholder="Task name"
                aria-label="New task name"
            />
            <button
                type="button"
                className="primary"
                onClick={onAdd}
                disabled={!trimmed}
            >
                Add
            </button>
            <button
                type="button"
                className="ghost"
                onClick={onCancel}
            >
                Cancel
            </button>
        </div>
    );
};

export interface IChecklistViewProps {
    jobId: string;
}

const ChecklistView = ({ jobId }: IChecklistViewProps) => {
    const [job, setJob] = useState<IJob | null>(null);
    const [tasks, setTasks] = useState<IChecklistTaskItem[]>([]);
    const [percent, setPercent] = useState<number>(0);
    const [adding, setAdding] = useState<boolean>(false);
    const [draft, setDraft] = useState<string>('');
    const addInputRef = useRef<HTMLInputElement>(null);

    const refresh = useCallback(async (): Promise<void> => {
        const j = await getJob(jobId);
        if (!j) { nav('/'); return; }
        setJob(j);
        setTasks(await getJobChecklist(jobId));
        setPercent(await getJobPercent(jobId));
    }, [jobId]);

    useEffect(() => { refresh(); }, [refresh]);

    useEffect(() => {
        if (adding) setTimeout(() => addInputRef.current?.focus(), 0);
    }, [adding]);

    async function onToggleManual(taskId: string, current: boolean): Promise<void> {
        await setManualTaskCompleted(jobId, taskId, !current);
        refresh();
    }

    async function onToggleCustom(taskId: string, current: boolean): Promise<void> {
        await setCustomTaskCompleted(jobId, taskId, !current);
        refresh();
    }

    async function onAddCustom(): Promise<void> {
        const trimmed = draft.trim();
        if (!trimmed) return;
        await addCustomTask(jobId, trimmed);
        setDraft('');
        setAdding(false);
        refresh();
    }

    async function onRenameCustom(taskId: string, label: string): Promise<void> {
        await renameCustomTask(jobId, taskId, label);
        refresh();
    }

    async function onDeleteCustom(taskId: string, label: string): Promise<void> {
        // Optimistic delete with undo. Snapshot the entire state so undo restores
        // exactly, including the createdAt timestamp.
        const stateBefore = await getChecklistState(jobId);
        await deleteCustomTask(jobId, taskId);
        refresh();
        toast.undoable(`Deleted "${label}"`, {
            onUndo: async () => {
                await setChecklistState(jobId, stateBefore);
                refresh();
            },
        });
    }

    if (!job) return null;

    const tasksBySection: Record<ChecklistSection, IChecklistTaskItem[]> = {
        Backups: [],
        Documentation: [],
        'Field Work': [],
        'Data Sheets': [],
        Custom: [],
    };
    tasks.forEach((t) => {
        if (tasksBySection[t.section]) tasksBySection[t.section].push(t);
    });

    const totalChecked = tasks.filter((t) => t.completed).length;
    const total = tasks.length;
    const customTasks = tasksBySection.Custom;

    return (
        <>
            <AppBar
                onBack={() => nav(`/job/${jobId}`)}
                wordmark={job.name || 'e-OIC'}
                crumb="Checklist"
            />
            <main>
                <div className="hero">
                    <div className="hero-pretitle">JOB CHECKLIST</div>
                    <h1 className="hero-title">
                        <CountUp value={percent} />
                        % complete
                    </h1>
                    <div className="hero-sub">
                        <CountUp value={totalChecked} />
                        {' of '}
                        <CountUp value={total} />
                        {' tasks'}
                    </div>
                    <div className="hero-bar">
                        <PercentBar percent={percent} height={8} ariaLabel={`${percent}% complete`} />
                    </div>
                </div>

                {CHECKLIST_SECTIONS.map((section) => {
                    const list = tasksBySection[section] || [];
                    if (section === 'Custom' && list.length === 0) return null;
                    const checked = list.filter((t) => t.completed).length;
                    return (
                        <section key={section} className="checklist-section">
                            <header className="checklist-section__header">
                                <span className="checklist-section__label">{section}</span>
                                <span className="checklist-section__count">
                                    <CountUp value={checked} />
                                    /
                                    <CountUp value={list.length} />
                                </span>
                            </header>
                            <div className="checklist-section__rows">
                                {list.map((t) => (
                                    <ChecklistTaskRow
                                        key={t.id}
                                        task={t}
                                        onToggle={() => (t.kind === 'custom'
                                            ? onToggleCustom(t.id, t.completed)
                                            : onToggleManual(t.id, t.completed))}
                                        onRename={(label: string) => onRenameCustom(t.id, label)}
                                        onDelete={() => onDeleteCustom(t.id, t.label)}
                                    />
                                ))}
                                {section === 'Custom' && (
                                    <AddTaskRow
                                        adding={adding}
                                        draft={draft}
                                        setDraft={setDraft}
                                        onAdd={onAddCustom}
                                        onCancel={() => { setAdding(false); setDraft(''); }}
                                        onStart={() => setAdding(true)}
                                        inputRef={addInputRef}
                                    />
                                )}
                            </div>
                        </section>
                    );
                })}

                {customTasks.length === 0 && (
                    <div className="checklist-add-empty">
                        <AddTaskRow
                            adding={adding}
                            draft={draft}
                            setDraft={setDraft}
                            onAdd={onAddCustom}
                            onCancel={() => { setAdding(false); setDraft(''); }}
                            onStart={() => setAdding(true)}
                            inputRef={addInputRef}
                        />
                    </div>
                )}
            </main>
        </>
    );
};

/* eslint-enable react/jsx-no-bind */

export default ChecklistView;
