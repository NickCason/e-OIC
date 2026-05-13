import { useState, useEffect, useCallback } from 'react';
import { listPhotos } from '../db';
import PhotoCapture from './PhotoCapture';
import Icon from './Icon';
import type { IJob, IPanel } from '../types/job';

// Renders the "Photo Checklist" group for the Panels sheet (panel-level shots
// like Full Panel, Each Door, etc.). Tappable, opens a capture modal.

export interface IPhotoChecklistProps {
    job: IJob;
    panel: IPanel;
    sheetName: string;
    items: string[];
}

const PhotoChecklist = ({
    job, panel, sheetName, items,
}: IPhotoChecklistProps) => {
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [openItem, setOpenItem] = useState<string | null>(null);

    const itemsKey = items.join('|');
    const refresh = useCallback(async (): Promise<void> => {
        const c: Record<string, number> = {};
        const itemList = itemsKey ? itemsKey.split('|') : [];
        await Promise.all(itemList.map(async (item) => {
            const ph = await listPhotos(panel.id, sheetName, item);
            c[item] = ph.length;
        }));
        setCounts(c);
    }, [panel.id, sheetName, itemsKey]);

    useEffect(() => { refresh(); }, [refresh]);

    return (
        <div>
            <div
                style={{
                    color: 'var(--text-dim)',
                    fontSize: 12,
                    marginBottom: 10,
                }}
            >
                {'Tap an item to capture photos. Each photo is auto-tagged with project, panel, item '}
                and (if location is enabled) GPS coordinates.
            </div>
            {items.map((item) => {
                const count = counts[item] || 0;
                const done = count > 0;
                return (
                    /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- list row opens capture modal; div is used for layout, not as a button */
                    <div
                        key={item}
                        className={`checklist-row${done ? ' done' : ''}`}
                        onClick={() => setOpenItem(item)}
                    >
                        <span className="checklist-cb" aria-hidden="true">
                            {done && <Icon name="check" size={12} strokeWidth={3} />}
                        </span>
                        <span className="checklist-name">{item}</span>
                        <span className="checklist-count">{count}</span>
                    </div>
                );
            })}
            {openItem && (
                <PhotoCapture
                    job={job}
                    panel={panel}
                    sheetName={sheetName}
                    item={openItem}
                    rowId={null}
                    onClose={() => { setOpenItem(null); refresh(); }}
                />
            )}
        </div>
    );
};

export default PhotoChecklist;
