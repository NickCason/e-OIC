import type { ReactNode } from 'react';
import Icon from './Icon';
import type { IconName } from './Icon';

// Reusable empty state.

export interface IEmptyStateProps {
    icon?: IconName;
    title?: string;
    body?: string;
    pointTo?: 'fab' | 'top' | null;
    action?: ReactNode;
    onIconClick?: () => void;
    iconLabel?: string;
}

const EmptyState = ({
    icon = 'imageOff',
    title,
    body,
    pointTo = null,
    action,
    onIconClick,
    iconLabel,
}: IEmptyStateProps) => {
    const iconNode = <Icon name={icon} size={32} strokeWidth={1.5} />;
    return (
        <div className="empty-state" role="status">
            {onIconClick ? (
                <button
                    type="button"
                    className="empty-state-icon empty-state-icon--button"
                    onClick={onIconClick}
                    aria-label={iconLabel || 'Add'}
                >
                    {iconNode}
                </button>
            ) : (
                <div className="empty-state-icon">{iconNode}</div>
            )}
            {title && <h2 className="empty-state-title">{title}</h2>}
            {body && <p className="empty-state-body">{body}</p>}
            {action && <div className="empty-state-action">{action}</div>}
            {pointTo === 'fab' && (
                <div className="empty-state-arrow empty-state-arrow--down" aria-hidden="true">
                    <Icon name="arrowDown" size={28} strokeWidth={2.25} />
                </div>
            )}
            {pointTo === 'top' && (
                <div className="empty-state-arrow empty-state-arrow--up" aria-hidden="true">
                    <Icon name="arrowDown" size={28} strokeWidth={2.25} />
                </div>
            )}
        </div>
    );
};

export default EmptyState;
