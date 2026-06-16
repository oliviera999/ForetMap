import React, { useState } from 'react';
import { GLButton } from './ui/GLButton.jsx';

export function GLNotificationsCenter({ items, unreadCount, onMarkAllRead, onClear }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="gl-notifications">
      <button
        type="button"
        className="gl-notifications-bell"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications (${unreadCount} non lues)`}
      >
        <span aria-hidden>🔔</span>
        {unreadCount > 0 ? <span className="gl-notifications-badge">{unreadCount}</span> : null}
      </button>
      {open ? (
        <div className="gl-notifications-panel" role="dialog" aria-label="Centre de notifications">
          <header>
            <strong>Notifications GL</strong>
            <div className="gl-inline-actions">
              <GLButton type="button" size="sm" variant="secondary" onClick={onMarkAllRead}>
                Tout marquer lu
              </GLButton>
              <GLButton type="button" size="sm" variant="ghost" onClick={onClear}>
                Vider
              </GLButton>
            </div>
          </header>
          {items.length === 0 ? (
            <p className="gl-empty gl-hint">
              <span className="gl-empty-icon" aria-hidden>
                🔔
              </span>
              Aucune notification.
            </p>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.id} className={item.read ? 'is-read' : ''}>
                  <span className="gl-notifications-cat">{item.category}</span>
                  <strong>{item.title || '(sans titre)'}</strong>
                  {item.body ? <p>{item.body}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
