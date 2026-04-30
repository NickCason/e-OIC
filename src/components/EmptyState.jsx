import React from 'react';
import Icon from './Icon.jsx';

// Reusable empty state.
//
// Props:
//   icon: Lucide icon name ('image', 'imageOff', 'add', etc.)
//   title: string — short slab heading
//   body: string  — supporting paragraph
//   pointTo: 'fab' | 'top' | null — when set, renders a bouncing arrow
//                                   in the direction of the action
//   action: ReactNode — optional inline button rendered below body

export default function EmptyState({ icon = 'imageOff', title, body, pointTo = null, action }) {
  return (
    <div className="empty-state" role="status">
      <div className="empty-state-icon">
        <Icon name={icon} size={32} strokeWidth={1.5} />
      </div>
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
