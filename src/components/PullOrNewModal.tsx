import Icon from './Icon';

export interface IPullOrNewModalProps {
    onClose: () => void;
    onNew: () => void;
    onPull: () => void;
}

const PullOrNewModal = ({ onClose, onNew, onPull }: IPullOrNewModalProps) => (
    /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- modal backdrop click-to-dismiss; Cancel button covers keyboard path */
    <div className="modal-bg" onClick={onClose}>
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- stopPropagation guard, not an interactive surface */}
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
                <button type="button" className="ghost" onClick={onClose}>Cancel</button>
            </div>
        </div>
    </div>
);

export default PullOrNewModal;
