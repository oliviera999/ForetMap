import { useMemo, useState } from 'react';
import { GLButton } from './ui/GLButton.jsx';
import { Tooltip } from '../../shared/components/Tooltip.jsx';
import {
  formatNotificationDateFr,
  groupNotificationsByCategory,
  notificationLevelClass,
} from '../../shared/notifications/notificationCenterCore.js';

/** Libellés lisibles des catégories G&L (la clé brute sinon). */
const GL_CATEGORY_LABELS = Object.freeze({
  game_event: 'Partie',
  chapter: 'Chapitre',
  market: 'Marché',
  spell: 'Sortilèges',
  moderation: 'Modération',
  system: 'Système',
});

/**
 * Centre de notifications G&L — depuis le lot 7 du plan de convergence, il partage son noyau
 * avec celui de ForetMap (`src/shared/notifications/notificationCenterCore.js`) et gagne ce
 * qui lui manquait : **dates relatives**, **niveaux** et **regroupement par catégorie**, les
 * groupes qui portent des non-lues en premier.
 */
export function GLNotificationsCenter({ items, unreadCount, onMarkAllRead, onClear }) {
  const groups = useMemo(() => groupNotificationsByCategory(items, GL_CATEGORY_LABELS), [items]);
  const [open, setOpen] = useState(false);
  return (
    <div className="gl-notifications">
      <Tooltip
        text={
          unreadCount > 0
            ? `Notifications — ${unreadCount} non ${unreadCount > 1 ? 'lues' : 'lue'}`
            : 'Notifications'
        }
        position="bottom"
      >
        <button
          type="button"
          className="gl-notifications-bell"
          onClick={() => setOpen((v) => !v)}
          aria-label={`Notifications (${unreadCount} non lues)`}
        >
          <span aria-hidden>🔔</span>
          {unreadCount > 0 ? <span className="gl-notifications-badge">{unreadCount}</span> : null}
        </button>
      </Tooltip>
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
            groups.map((group) => (
              <section key={group.category} className="gl-notifications-group">
                <h4 className="gl-notifications-group-title">
                  {group.label}
                  {group.unread > 0 ? (
                    <span className="gl-notifications-group-unread">{group.unread}</span>
                  ) : null}
                </h4>
                <ul>
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      className={`${item.read ? 'is-read' : ''} is-${notificationLevelClass(item.level)}`}
                    >
                      <span className="gl-notifications-cat">{group.label}</span>
                      <strong>{item.title || '(sans titre)'}</strong>
                      {item.body ? <p>{item.body}</p> : null}
                      <time
                        className="gl-notifications-date"
                        dateTime={new Date(item.ts).toISOString()}
                      >
                        {formatNotificationDateFr(item.ts)}
                      </time>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
