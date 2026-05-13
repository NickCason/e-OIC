import { useState, useEffect, useMemo, useRef, useCallback, type ChangeEvent, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { listPhotos, listRowPhotos, addPhoto, deletePhoto } from '../db';
import { processIncomingPhoto } from '../lib/photoStore';
import { readPhotoExif } from '../lib/photoExif';
import { maybeGetGps } from '../lib/geolocation';
import { toast } from '../lib/toast';
import { BUILD_VERSION } from '../version';
import Icon from './Icon';
import Lightbox, { type ILightboxPhoto } from './Lightbox';
import PhotoOverlay from './PhotoOverlay';
import EtechLoader from './EtechLoader';
import LoadingPhrases from './LoadingPhrases';
import { withMinDuration, fadeOutLoader } from '../lib/loaderHold';
import type { IJob, IPanel, IPhoto, IPhotoGps } from '../types/job';

// iOS standalone-PWA Safari has documented issues with `display: none` file
// inputs not propagating selected files. Off-screen positioning works.
const HIDDEN_INPUT_STYLE: CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    opacity: 0,
    pointerEvents: 'none',
};

// view-transition-name isn't yet in CSSProperties; widen on the fly.
type TileStyle = CSSProperties & { viewTransitionName?: string };

export interface IPhotoCaptureProps {
    job: IJob;
    panel: IPanel;
    sheetName: string;
    item: string | null;
    rowId?: string | null;
    rowLabelHint?: string;
    onClose: () => void;
}

type PhotoSource = 'camera' | 'library';

/* eslint-disable react/jsx-no-bind -- arrow handlers in JSX are intentional for this modal's small handler set */

const PhotoCapture = ({
    job, panel, sheetName, item, rowId = null, rowLabelHint = '', onClose,
}: IPhotoCaptureProps) => {
    const [photos, setPhotos] = useState<IPhoto[]>([]);
    const [busy, setBusy] = useState<boolean>(false);
    const [isFading, setIsFading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const [shutter, setShutter] = useState<boolean>(false);
    const cameraRef = useRef<HTMLInputElement>(null);
    const libraryRef = useRef<HTMLInputElement>(null);

    // Tile <-> lightbox shared-element transition. View Transitions API
    // morphs the tapped tile into the lightbox frame (and back) using
    // matching view-transition-name on each end. Falls back gracefully
    // when the API isn't available (older Safari, anything pre-Chrome 111).
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

    function fireShutter(): void {
        // Visual flash + haptic on tap. Vibrate is supported on Android
        // Chrome/Firefox/wrapper but no-op on iOS Safari, which is fine —
        // the flash carries the moment on iOS.
        setShutter(true);
        if (navigator.vibrate) navigator.vibrate(15);
        setTimeout(() => setShutter(false), 220);
        cameraRef.current?.click();
    }

    const refresh = useCallback(async (): Promise<void> => {
        if (rowId) {
            setPhotos(await listRowPhotos(rowId));
        } else if (item != null) {
            setPhotos(await listPhotos(panel.id, sheetName, item));
        }
    }, [rowId, panel.id, sheetName, item]);

    useEffect(() => { refresh(); }, [refresh]);

    // Bottom-sheet UX: scrolling the underlying page dismisses the modal.
    // Skip dismiss while the lightbox is mounted on top so swipes inside it
    // don't close everything.
    const lightboxOpenRef = useRef<boolean>(false);
    useEffect(() => { lightboxOpenRef.current = lightboxIndex !== null; }, [lightboxIndex]);
    useEffect(() => {
        const initialY = window.scrollY;
        function onScroll(): void {
            if (lightboxOpenRef.current) return;
            if (Math.abs(window.scrollY - initialY) > 12) onClose();
        }
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, [onClose]);

    // Build blob URLs for the current photo set; revoke on change/unmount.
    const photosWithUrls = useMemo(
        () => photos.map((p) => ({ ...p, blobUrl: URL.createObjectURL(p.blob) })),
        [photos],
    );
    useEffect(() => () => {
        photosWithUrls.forEach((p) => {
            try { URL.revokeObjectURL(p.blobUrl); } catch { /* ignore */ }
        });
    }, [photosWithUrls]);

    const overlayPhotos: ILightboxPhoto[] = useMemo(() => photosWithUrls.map((p) => ({
        ...p,
        jobName: job.name,
        panelName: panel.name,
        sheetName,
        itemLabel: rowId ? (rowLabelHint || sheetName) : (p.item || item || sheetName),
    })), [photosWithUrls, job.name, panel.name, sheetName, rowId, rowLabelHint, item]);

    async function handleFiles(fileList: FileList | null, source: PhotoSource): Promise<void> {
        const len = fileList?.length ?? 0;
        if (len === 0) {
            setError('iOS handed back zero files. This usually means the camera/library was cancelled, or a known iOS standalone-PWA bug.');
            return;
        }
        const files = Array.from(fileList as FileList);
        setBusy(true);
        setIsFading(false);
        setError(null);
        try {
            const work = (async (): Promise<number> => {
                // Camera path: device GPS + now. Library path: photo's own EXIF only.
                let cameraGps: IPhotoGps | null = null;
                if (source === 'camera') {
                    cameraGps = await maybeGetGps();
                }
                let saved = 0;
                // sequential await needed: addPhoto writes to IndexedDB; running in
                // parallel risked transaction conflicts on older Safari.
                // eslint-disable-next-line no-restricted-syntax -- intentional sequential await
                for (const file of files) {
                    let gps: IPhotoGps | null;
                    let takenAt: number;
                    if (source === 'camera') {
                        gps = cameraGps;
                        takenAt = Date.now();
                    } else {
                        // eslint-disable-next-line no-await-in-loop -- intentional sequential await
                        const exif = await readPhotoExif(file);
                        gps = exif.gps;
                        takenAt = exif.takenAt ?? file.lastModified ?? Date.now();
                    }
                    // eslint-disable-next-line no-await-in-loop -- intentional sequential await
                    const { blob, width, height } = await processIncomingPhoto(file, { gps });
                    // eslint-disable-next-line no-await-in-loop -- intentional sequential await
                    await addPhoto({
                        panelId: panel.id,
                        sheet: sheetName,
                        item: rowId ? (rowLabelHint || 'row') : (item ?? ''),
                        rowId,
                        blob,
                        mime: 'image/jpeg',
                        w: width,
                        h: height,
                        gps,
                        takenAt,
                    });
                    saved += 1;
                    if (navigator.vibrate) navigator.vibrate(20);
                }
                await refresh();
                return saved;
            })();
            const savedCount = await withMinDuration(work, 2200);
            if (savedCount === 0) {
                setError('Photo could not be saved. The file may not be a recognized image format.');
            } else {
                await fadeOutLoader(setIsFading);
            }
        } catch (e: unknown) {
            console.error(e);
            const msg = e instanceof Error ? e.message : 'Could not save photo';
            setError(msg);
        } finally {
            setBusy(false);
            setIsFading(false);
        }
    }

    async function onDelete(photo: ILightboxPhoto): Promise<void> {
        await deletePhoto(photo.id);
        await refresh();
        toast.show('Photo deleted');
    }

    const title = rowId
        ? `Photos: ${rowLabelHint || sheetName}`
        : item;

    const subtitle = rowId
        ? `${sheetName} · ${panel.name} · row-level`
        : `${sheetName} · ${panel.name}`;

    return (
        /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- modal backdrop click-to-dismiss; Done button covers keyboard path */
        <div className="modal-bg" onClick={onClose}>
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- stopPropagation guard, not an interactive surface */}
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h2>{title}</h2>
                <div
                    style={{
                        color: 'var(--text-dim)',
                        fontSize: 13,
                        marginTop: -8,
                        marginBottom: 12,
                    }}
                >
                    {subtitle}
                </div>

                <div className="btn-row" style={{ marginBottom: 12 }}>
                    <button
                        type="button"
                        className={`primary shutter-btn${shutter ? ' is-firing' : ''}`}
                        onClick={fireShutter}
                        disabled={busy}
                    >
                        <Icon name="camera" size={16} strokeWidth={2} />
                        {' Take Photo'}
                    </button>
                    <button type="button" onClick={() => libraryRef.current?.click()} disabled={busy}>
                        <Icon name="image" size={16} strokeWidth={2} />
                        {' From Library'}
                    </button>
                </div>
                <input
                    ref={cameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={HIDDEN_INPUT_STYLE}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        const input = e.target;
                        handleFiles(input.files, 'camera');
                        setTimeout(() => { try { input.value = ''; } catch { /* ignore */ } }, 1500);
                    }}
                />
                <input
                    ref={libraryRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={HIDDEN_INPUT_STYLE}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        const input = e.target;
                        handleFiles(input.files, 'library');
                        setTimeout(() => { try { input.value = ''; } catch { /* ignore */ } }, 1500);
                    }}
                />

                {busy && (
                    <div
                        className={`export-progress${isFading ? ' is-fading-out' : ''}`}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            color: 'var(--text-dim)',
                            marginBottom: 8,
                            padding: 0,
                        }}
                    >
                        <EtechLoader variant="current" size={36} />
                        <LoadingPhrases set="photo" className="loading-phrase--inline" />
                    </div>
                )}
                {error && <div style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</div>}

                {overlayPhotos.length === 0 && !busy && (
                    <div className="empty" style={{ padding: '20px 0' }}>
                        <p>
                            No photos yet for this
                            {' '}
                            {rowId ? 'row' : 'item'}
                            .
                        </p>
                    </div>
                )}

                {overlayPhotos.length > 0 && (
                    <div className="photo-grid">
                        {overlayPhotos.map((p, i) => {
                            const tileStyle: TileStyle = { viewTransitionName: lightboxIndex === null ? `photo-${p.id}` : 'none' };
                            return (
                                /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- thumb tile opens lightbox; PhotoOverlay child carries the image */
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
                    </div>
                )}

                <div
                    className="btn-row"
                    style={{
                        marginTop: 16,
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <span
                        style={{
                            fontSize: 10,
                            color: 'var(--text-dim)',
                            fontFamily: 'ui-monospace, monospace',
                        }}
                    >
                        {BUILD_VERSION}
                    </span>
                    <button type="button" onClick={onClose}>Done</button>
                </div>
            </div>
            {lightboxIndex !== null && overlayPhotos[lightboxIndex] && (
                <Lightbox
                    photos={overlayPhotos}
                    index={lightboxIndex}
                    onClose={closeLightbox}
                    onDelete={onDelete}
                />
            )}
            {shutter && <div className="shutter-flash" aria-hidden="true" />}
        </div>
    );
};

/* eslint-enable react/jsx-no-bind */

export default PhotoCapture;
