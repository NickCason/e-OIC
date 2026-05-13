import Icon from './Icon';
import { useUpdateState, applyUpdate } from '../lib/swUpdate';

// Floating "Update ready" pill. Renders only when a newer service worker
// has installed and is waiting to take over. Tapping it posts skipWaiting
// to the SW; the controllerchange listener in swUpdate.ts then reloads
// the page so the new bundle starts running.

const UpdatePill = () => {
    const { available, applying } = useUpdateState();
    if (!available) return null;
    return (
        <button
            type="button"
            className="update-pill"
            onClick={applyUpdate}
            disabled={applying}
        >
            <Icon name="refresh" size={14} strokeWidth={2.25} />
            <span>{applying ? 'Updating…' : 'Update ready · Reload'}</span>
        </button>
    );
};

export default UpdatePill;
