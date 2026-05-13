import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

// Sticky "Save & next row →" action bar.

export interface ISaveBarProps {
    onSaveAndNext: () => void;
    nextLabel?: 'next' | 'new';
    /** Bumped counter (or any changing value) — every change flashes the "Saved ✓" pill for 1.2s. */
    pulseSavedKey?: number | string;
}

const SaveBar = ({ onSaveAndNext, nextLabel = 'next', pulseSavedKey }: ISaveBarProps) => {
    const [showSaved, setShowSaved] = useState<boolean>(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const firstRender = useRef<boolean>(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return undefined;
        }
        setShowSaved(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setShowSaved(false), 1200);
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [pulseSavedKey]);

    return (
        <div className="savebar" role="region" aria-label="Save and continue">
            <div className={`savebar-saved${showSaved ? ' visible' : ''}`} aria-live="polite">
                <Icon name="check" size={14} strokeWidth={2.5} />
                <span>Saved</span>
            </div>
            <button
                type="button"
                className="savebar-cta"
                onClick={onSaveAndNext}
            >
                {nextLabel === 'new' ? (
                    <>
                        <Icon name="add" size={18} strokeWidth={2.25} />
                        <span>New row</span>
                    </>
                ) : (
                    <>
                        <span>Save &amp; next row</span>
                        <Icon name="arrowRight" size={18} strokeWidth={2.25} />
                    </>
                )}
            </button>
        </div>
    );
};

export default SaveBar;
