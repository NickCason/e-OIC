import type { MouseEventHandler } from 'react';
import { fmtTimestamp, fmtGps } from '../photoOverlay';
import type { IPhotoGps } from '../types/job';

// Live overlay rendered on top of an <img>. The overlay text is derived
// purely from props — renaming a panel/job re-renders consumers and the
// overlay updates with no DB writes.

export interface IPhotoOverlayProps {
    src: string;
    alt?: string;
    jobName: string;
    panelName: string;
    sheetName: string;
    itemLabel: string;
    takenAt?: number | null;
    gps?: IPhotoGps | null;
    imgClassName?: string;
    wrapClassName?: string;
    onClick?: MouseEventHandler<HTMLDivElement>;
    onImgClick?: MouseEventHandler<HTMLImageElement>;
}

const PhotoOverlay = ({
    src,
    alt = '',
    jobName,
    panelName,
    sheetName,
    itemLabel,
    takenAt,
    gps,
    imgClassName,
    wrapClassName,
    onClick,
    onImgClick,
}: IPhotoOverlayProps) => {
    const dateStr = takenAt ? fmtTimestamp(new Date(takenAt)) : '';
    const gpsStr = gps ? `  ${fmtGps(gps) ?? ''}` : '';
    const cls = `photo-overlay-wrap${wrapClassName ? ` ${wrapClassName}` : ''}`;
    return (
        /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- wrapper relays click to parent (lightbox tile); the tile itself is keyboard-accessible */
        <div className={cls} onClick={onClick}>
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- onImgClick is a stopPropagation guard for lightbox use; image is decorative */}
            <img src={src} alt={alt} className={imgClassName} onClick={onImgClick} />
            <div className="photo-overlay" aria-hidden="true">
                <div>
                    {jobName}
                    {' • '}
                    {panelName}
                </div>
                <div>
                    {sheetName}
                    {' — '}
                    {itemLabel}
                </div>
                <div>
                    {dateStr}
                    {gpsStr}
                </div>
            </div>
        </div>
    );
};

export default PhotoOverlay;
