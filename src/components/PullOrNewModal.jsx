import React from 'react';
import Icon from './Icon';

export default function PullOrNewModal({ onClose, onNew, onPull }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Start an investigation</h2>
        <button className="modal-list-btn" type="button" onClick={onNew}>
          <Icon name="add" size={20} />
          <div className="modal-list-btn-text">
            <div className="modal-list-btn-title">New investigation</div>
            <div className="modal-list-btn-sub">Start a fresh job</div>
          </div>
        </button>
        <button className="modal-list-btn" type="button" onClick={onPull}>
          <Icon name="download" size={20} />
          <div className="modal-list-btn-text">
            <div className="modal-list-btn-title">Pull from xlsx</div>
            <div className="modal-list-btn-sub">Import an existing checklist</div>
          </div>
        </button>
        <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 'var(--sp-3)' }}>
          <button className="ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
