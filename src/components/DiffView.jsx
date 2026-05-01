import React, { useState } from 'react';
import Icon from './Icon.jsx';

export default function DiffView({ diff, direction = 'pull', removedDecisions, onToggleRemoved }) {
  const [expanded, setExpanded] = useState(() => initialExpanded(diff));

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
            <div key={i} className="diff-row diff-row--mod">
              <span className="diff-mark">~</span>
              <span className="diff-label">{c.field}:</span>
              <span className="diff-old">{String(c.old || '(empty)')}</span>
              <span className="diff-arrow"> → </span>
              <span className="diff-new">{String(c.new || '(empty)')}</span>
            </div>
          ))}
        </div>
      )}

      {(diff.panels.added.length > 0 || diff.panels.removed.length > 0) && (
        <div className="diff-section">
          <div className="diff-section-title">Panels</div>
          {diff.panels.added.map((p, i) => (
            <div key={`pa${i}`} className="diff-row diff-row--add"><span className="diff-mark">+</span> {p.name}</div>
          ))}
          {diff.panels.removed.map((p, i) => (
            <div key={`pr${i}`} className="diff-row diff-row--del"><span className="diff-mark">−</span> {p.name}</div>
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
                ? <span className="diff-count"> ({changeCount} change{changeCount !== 1 ? 's' : ''})</span>
                : <span className="diff-count diff-count--none"> no changes</span>}
              {sd.labelCollisions.length > 0 && (
                <span className="diff-collision" title="Position-matched: identical labels appear multiple times">⚠</span>
              )}
            </button>

            {isOpen && (
              <div className="diff-section-body">
                {sd.modified.map((m, i) => (
                  <div key={`m${i}`} className="diff-row diff-row--mod">
                    <span className="diff-mark">~</span> {m.label || '(unlabeled)'}
                    {m.fieldChanges.map((fc, j) => (
                      <div key={j} className="diff-field-change">
                        {fc.field}:{' '}
                        <span className="diff-old">{String(fc.old ?? '(empty)')}</span>
                        <span className="diff-arrow"> → </span>
                        <span className="diff-new">{String(fc.new ?? '(empty)')}</span>
                      </div>
                    ))}
                  </div>
                ))}
                {sd.added.map((r, i) => (
                  <div key={`a${i}`} className="diff-row diff-row--add">
                    <span className="diff-mark">+</span> {labelOrFallback(r, sheetName, sd, 'add', i)}
                  </div>
                ))}
                {sd.removed.map((r, i) => {
                  const accepted = removedDecisions ? removedDecisions.has(r.id) : true;
                  return (
                    <div key={`d${i}`} className="diff-row diff-row--del">
                      <span className="diff-mark">−</span> {labelOrFallback(r, sheetName, sd, 'del', i)}
                      {direction === 'pull' && onToggleRemoved && (
                        <span className="diff-keep-drop">
                          <button
                            type="button"
                            className={`diff-pill ${accepted ? '' : 'active'}`}
                            onClick={() => onToggleRemoved(r.id, false)}
                          >Keep local</button>
                          <button
                            type="button"
                            className={`diff-pill ${accepted ? 'active' : ''}`}
                            onClick={() => onToggleRemoved(r.id, true)}
                          >Accept removal</button>
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
            <div key={i} className="diff-skip">⊘ &quot;{s}&quot; sheet skipped (not in schema)</div>
          ))}
        </div>
      )}
      {diff.skippedColumns.length > 0 && (
        <div className="diff-skip-block">
          {diff.skippedColumns.map((c, i) => (
            <div key={i} className="diff-skip">⊘ &quot;{c.columnName}&quot; column skipped in {c.sheetName}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function initialExpanded(diff) {
  const out = {};
  for (const [name, sd] of Object.entries(diff.sheets)) {
    out[name] = sd.added.length + sd.removed.length + sd.modified.length > 0;
  }
  return out;
}

function countChanges(diff) {
  let n = diff.jobMeta.changed.length + diff.panels.added.length + diff.panels.removed.length
    + diff.sheetNotes.added.length + diff.sheetNotes.removed.length + diff.sheetNotes.modified.length;
  for (const sd of Object.values(diff.sheets)) {
    n += sd.added.length + sd.removed.length + sd.modified.length;
  }
  return n;
}

function labelOrFallback(r, sheetName, sd, kind, i) {
  const data = r?.data || {};
  const panelName = data['Panel Name'] || '';
  const labelHint = panelName ? `${panelName} · ` : '';
  return `${labelHint}${kind === 'add' ? 'new row' : 'row'} (${(data[Object.keys(data).find((k) => k !== 'Panel Name')] || '?')})`;
}
