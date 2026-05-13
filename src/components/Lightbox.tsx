import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, TouchEvent as ReactTouchEvent } from 'react';
import Icon from './Icon';
import { fmtTimestamp, fmtGps } from '../photoOverlay';
import type { IPhoto } from '../types/job';

// Themed photo lightbox.
//
// Each photo is shown inside a .lightbox-frame sized to the image's stored
// aspect ratio so the live overlay sits ON the image (matching the
// burned-in overlay produced by applyOverlay() at export time), not at
// some viewport corner.

// Lightbox accepts the DB IPhoto enriched with a blob URL plus the overlay
// strings consumers compute up-front (jobName/panelName/sheetName/itemLabel).
export interface ILightboxPhoto extends IPhoto {
    blobUrl: string;
    jobName: string;
    panelName: string;
    sheetName: string;
    itemLabel: string;
}

export interface ILightboxProps {
    photos: ILightboxPhoto[];
    index: number;
    onClose: () => void;
    onDelete?: (photo: ILightboxPhoto) => void;
}

// View-transition-name isn't yet in CSSProperties; widen on the fly.
type FrameStyle = CSSProperties & { viewTransitionName?: string };

const Lightbox = ({
    photos, index: initialIndex, onClose, onDelete,
}: ILightboxProps) => {
    const [idx, setIdx] = useState<number>(initialIndex || 0);
    const startX = useRef<number | null>(null);
    const startY = useRef<number | null>(null);

    useEffect(() => {
        function onKey(e: KeyboardEvent): void {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
            if (e.key === 'ArrowRight') setIdx((i) => Math.min(photos.length - 1, i + 1));
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [photos.length, onClose]);

    if (!photos.length) return null;
    const cur = photos[idx];
    if (!cur) return null;

    function onTouchStart(e: ReactTouchEvent<HTMLDivElement>): void {
        const t = e.touches[0];
        if (!t) return;
        startX.current = t.clientX;
        startY.current = t.clientY;
    }
    function onTouchEnd(e: ReactTouchEvent<HTMLDivElement>): void {
        if (startX.current == null || startY.current == null) return;
        const t = e.changedTouches[0];
        if (!t) return;
        const dx = t.clientX - startX.current;
        const dy = t.clientY - startY.current;
        if (Math.abs(dy) > Math.abs(dx) * 1.5 && dy > 80) {
            onClose();
        } else if (dx > 60) {
            setIdx((i) => Math.max(0, i - 1));
        } else if (dx < -60) {
            setIdx((i) => Math.min(photos.length - 1, i + 1));
        }
        startX.current = null;
        startY.current = null;
    }

    const dateStr = cur.takenAt ? fmtTimestamp(new Date(cur.takenAt)) : '';
    const gpsStr = cur.gps ? `  ${fmtGps(cur.gps) ?? ''}` : '';

    // Frame fits the image inside the viewport while preserving aspect ratio.
    // width = min(100vw, 100vh * w/h); aspect-ratio handles the height.
    const w = cur.w || 1;
    const h = cur.h || 1;
    const frameStyle: FrameStyle = {
        width: `min(100vw, calc(100vh * ${w} / ${h}))`,
        aspectRatio: `${w} / ${h}`,
        // Pair with the corresponding .photo-tile's view-transition-name so
        // opening/closing the lightbox runs a shared-element morph instead
        // of a hard cut.
        viewTransitionName: `photo-${cur.id}`,
    };

    return (
        /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- backdrop click/touch-to-dismiss; Esc keydown handler covers keyboard */
        <div
            className="lightbox"
            onClick={onClose}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
        >
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- stopPropagation guard, not an interactive surface */}
            <div
                className="lightbox-frame"
                style={frameStyle}
                onClick={(e) => e.stopPropagation()}
            >
                <img
                    key={cur.id}
                    src={cur.blobUrl}
                    alt=""
                    className="lightbox-img"
                />
                <div className="photo-overlay" aria-hidden="true">
                    <div>
                        {cur.jobName}
                        {' • '}
                        {cur.panelName}
                    </div>
                    <div>
                        {cur.sheetName}
                        {' — '}
                        {cur.itemLabel}
                    </div>
                    <div>
                        {dateStr}
                        {gpsStr}
                    </div>
                </div>
            </div>

            <button
                className="lightbox-btn lightbox-close"
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                aria-label="Close"
                type="button"
            >
                <Icon name="close" size={20} strokeWidth={2} />
            </button>

            {onDelete && (
                <button
                    className="lightbox-btn lightbox-delete"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(cur);
                        if (photos.length === 1) onClose();
                        else setIdx((i) => Math.min(i, photos.length - 2));
                    }}
                    aria-label="Delete photo"
                    type="button"
                >
                    <Icon name="trash" size={18} strokeWidth={2} />
                </button>
            )}

            {photos.length > 1 && (
                /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- counter chip stops backdrop click; not itself interactive */
                <div
                    className="lightbox-counter"
                    onClick={(e) => e.stopPropagation()}
                >
                    {idx + 1}
                    {' / '}
                    {photos.length}
                </div>
            )}
        </div>
    );
};

export default Lightbox;
