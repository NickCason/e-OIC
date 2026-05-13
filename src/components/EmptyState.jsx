import React from 'react';
import Icon from './Icon';

// Reusable empty state.
//
// Props:
//   icon: Lucide icon name ('image', 'imageOff', 'add', etc.)
//   title: string — short slab heading
//   body: string  — supporting paragraph
//   pointTo: 'fab' | 'top' | null — when set, renders a bouncing arrow
//                                   in the direction of the action
//   action: ReactNode — optional inline button rendered below body
//   onIconClick: () => void — when set, the icon becomes a tappable
//                              button (used so the empty-state plus IS
//                              the add action, not just decoration)
//   iconLabel: string — aria-label for the tappable icon

export default function EmptyState({
  icon = 'imageOff',
  title,
  body,
  pointTo = null,
  action,
  onIconClick,
  iconLabel,
}) {
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
}
