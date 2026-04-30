import React, { useState, useEffect, useRef } from 'react';
import {
  getJob, setManualTaskCompleted, addCustomTask, renameCustomTask,
  setCustomTaskCompleted, deleteCustomTask, getChecklistState, setChecklistState,
} from '../db.js';
import { getJobChecklist, getJobPercent, CHECKLIST_SECTIONS } from '../lib/metrics.js';
import { nav } from '../App.jsx';
import { toast } from '../lib/toast.js';
import AppBar from './AppBar.jsx';
import PercentBar from './PercentBar.jsx';
import ChecklistTaskRow from './ChecklistTaskRow.jsx';
import Icon from './Icon.jsx';

export default function ChecklistView({ jobId }) {
  const [job, setJob] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [percent, setPercent] = useState(0);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const addInputRef = useRef(null);

  async function refresh() {
    const j = await getJob(jobId);
    if (!j) { nav('/'); return; }
    setJob(j);
    setTasks(await getJobChecklist(jobId));
    setPercent(await getJobPercent(jobId));
  }

  useEffect(() => { refresh(); }, [jobId]);

  useEffect(() => {
    if (adding) setTimeout(() => addInputRef.current?.focus(), 0);
  }, [adding]);

  async function onToggleManual(taskId, current) {
    await setManualTaskCompleted(jobId, taskId, !current);
    refresh();
  }

  async function onToggleCustom(taskId, current) {
    await setCustomTaskCompleted(jobId, taskId, !current);
    refresh();
  }

  async function onAddCustom() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    await addCustomTask(jobId, trimmed);
    setDraft('');
    setAdding(false);
    refresh();
  }

  async function onRenameCustom(taskId, label) {
    await renameCustomTask(jobId, taskId, label);
    refresh();
  }

  async function onDeleteCustom(taskId, label) {
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

  const tasksBySection = {};
  for (const s of CHECKLIST_SECTIONS) tasksBySection[s] = [];
  for (const t of tasks) {
    if (tasksBySection[t.section]) tasksBySection[t.section].push(t);
  }

  const totalChecked = tasks.filter((t) => t.completed).length;
  const total = tasks.length;
  const customTasks = tasksBySection['Custom'] || [];

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
          <h1 className="hero-title">{percent}% complete</h1>
          <div className="hero-sub">{totalChecked} of {total} tasks</div>
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
                <span className="checklist-section__count">{checked}/{list.length}</span>
              </header>
              <div className="checklist-section__rows">
                {list.map((t) => (
                  <ChecklistTaskRow
                    key={t.id}
                    task={t}
                    onToggle={() =>
                      t.kind === 'custom'
                        ? onToggleCustom(t.id, t.completed)
                        : onToggleManual(t.id, t.completed)
                    }
                    onRename={(label) => onRenameCustom(t.id, label)}
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
}

function AddTaskRow({ adding, draft, setDraft, onAdd, onCancel, onStart, inputRef }) {
  if (!adding) {
    return (
      <button
        type="button"
        className="checklist-add-btn"
        onClick={onStart}
      >
        <Icon name="add" size={16} /> Add task
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
}
