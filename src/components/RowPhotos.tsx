import { useState, useEffect, useMemo, useCallback, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { listRowPhotos, deletePhoto } from '../db';
import schemaMap from '../schema.json' with { type: 'json' };
import PhotoCapture from './PhotoCapture';
import Icon from './Icon';
import Lightbox, { type ILightboxPhoto } from './Lightbox';
import { toast } from '../lib/toast';
import PhotoOverlay from './PhotoOverlay';
import { rowDisplayLabel } from '../lib/rowLabel';
import type { IJob, IPanel, IRow, IPhoto } from '../types/job';

// Row-level photos: tied to a specific row (one PLC card, one drive, etc.).
// Inside the export these become Photos/{Panel}/{Sheet}/{RowLabel}/IMG_001.jpg.

export interface IRowPhotosProps {
    job: IJob;
    panel: IPanel;
    sheetName: string;
    row: IRow;
    onChange?: () => void;
}

const schemaMapTyped = schemaMap as unknown as Record<string, Parameters<typeof rowDisplayLabel>[2]>;

// view-transition-name isn't yet in CSSProperties.
type TileStyle = CSSProperties & { viewTransitionName?: string };

/* eslint-disable react/jsx-no-bind -- arrow handlers in JSX are intentional for this small handler set */

const RowPhotos = ({
    job, panel, sheetName, row, onChange,
}: IRowPhotosProps) => {
    const [photos, setPhotos] = useState<IPhoto[]>([]);
    const [open, setOpen] = useState<boolean>(false);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

    const refresh = useCallback(async (): Promise<void> => {
        setPhotos(await listRowPhotos(row.id));
    }, [row.id]);

    useEffect(() => { refresh(); }, [refresh]);

    const photosWithUrls = useMemo(
        () => photos.map((p) => ({ ...p, blobUrl: URL.createObjectURL(p.blob) })),
        [photos],
    );
    useEffect(() => () => {
        photosWithUrls.forEach((p) => {
            try { URL.revokeObjectURL(p.blobUrl); } catch { /* ignore */ }
        });
    }, [photosWithUrls]);

    const itemLabel = rowDisplayLabel(row, sheetName, schemaMapTyped[sheetName]);
    const overlayPhotos: ILightboxPhoto[] = useMemo(() => photosWithUrls.map((p) => ({
        ...p,
        jobName: job.name,
        panelName: panel.name,
        sheetName,
        itemLabel,
    })), [photosWithUrls, job.name, panel.name, sheetName, itemLabel]);

    function openLightbox(i: number): void {
        if (typeof document !== 'undefined' && document.startViewTransition) {
            document.startViewTransition(() => flushSync(() => setLightboxIndex(i)));
        } else {
            setLightboxIndex(i);
        }
    }
    function closeLightbox(): void {
        if (typeof document !== 'undefined' && document.startViewTransition) {
            document.startViewTransition(() => flushSync(() => setLightboxIndex(null)));
        } else {
            setLightboxIndex(null);
        }
    }

    async function handleDeletePhoto(p: ILightboxPhoto): Promise<void> {
        await deletePhoto(p.id);
        await refresh();
        onChange?.();
        toast.show('Photo deleted');
    }

    return (
        <div>
            <div
                style={{
                    color: 'var(--text-dim)',
                    fontSize: 12,
                    marginBottom: 10,
                }}
            >
                Photos attached directly to this row (not the panel).
            </div>
            <div className="photo-grid">
                {overlayPhotos.map((p, i) => {
                    const tileStyle: TileStyle = { viewTransitionName: lightboxIndex === null ? `photo-${p.id}` : 'none' };
                    return (
                        /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- tile opens lightbox via OS-tap; image child carries the content */
                        <div
                            key={p.id}
                            className="photo-tile"
                            style={tileStyle}
                            onClick={() => openLightbox(i)}
                        >
                            <PhotoOverlay
                                src={p.blobUrl}
                                jobName={p.jobName}
                                panelName={p.panelName}
                                sheetName={p.sheetName}
                                itemLabel={p.itemLabel}
                                takenAt={p.takenAt}
                                gps={p.gps}
                            />
                        </div>
                    );
                })}
                <button
                    className="photo-tile photo-tile--add"
                    onClick={() => setOpen(true)}
                    aria-label="Add photo"
                    type="button"
                >
                    <Icon name="add" size={22} strokeWidth={1.75} />
                </button>
            </div>
            {open && (
                <PhotoCapture
                    job={job}
                    panel={panel}
                    sheetName={sheetName}
                    item={null}
                    rowId={row.id}
                    rowLabelHint={itemLabel}
                    onClose={() => { setOpen(false); refresh(); onChange?.(); }}
                />
            )}
            {lightboxIndex !== null && overlayPhotos[lightboxIndex] && (
                <Lightbox
                    photos={overlayPhotos}
                    index={lightboxIndex}
                    onClose={closeLightbox}
                    onDelete={handleDeletePhoto}
                />
            )}
        </div>
    );
};

/* eslint-enable react/jsx-no-bind */

export default RowPhotos;
