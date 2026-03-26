import React, { useEffect, useMemo, useState } from 'react';
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_LEVEL,
  NOTIFICATION_LEVEL_LABELS,
} from '../constants/notifications';

const CATEGORY_LABELS = {
  [NOTIFICATION_CATEGORY.DEADLINES]: 'Échéances',
  [NOTIFICATION_CATEGORY.VALIDATIONS]: 'Validations',
  [NOTIFICATION_CATEGORY.PROPOSALS]: 'Propositions',
  [NOTIFICATION_CATEGORY.OPERATIONS]: 'Exploitation',
  [NOTIFICATION_CATEGORY.SECURITY]: 'Sécurité',
};

function levelClass(level) {
  if (level === NOTIFICATION_LEVEL.CRITICAL) return 'critical';
  if (level === NOTIFICATION_LEVEL.IMPORTANT) return 'important';
  return 'info';
}

function preferenceCategoriesForRole(roleKey) {
  if (roleKey === 'student') {
    return [NOTIFICATION_CATEGORY.DEADLINES, NOTIFICATION_CATEGORY.OPERATIONS, NOTIFICATION_CATEGORY.SECURITY];
  }
  if (roleKey === 'teacher') {
    return [NOTIFICATION_CATEGORY.VALIDATIONS, NOTIFICATION_CATEGORY.PROPOSALS, NOTIFICATION_CATEGORY.OPERATIONS];
  }
  return [
    NOTIFICATION_CATEGORY.VALIDATIONS,
    NOTIFICATION_CATEGORY.PROPOSALS,
    NOTIFICATION_CATEGORY.OPERATIONS,
    NOTIFICATION_CATEGORY.SECURITY,
  ];
}

function formatRelative(dateIso) {
  const ts = Date.parse(dateIso || '');
  if (!Number.isFinite(ts)) return '';
  const diffMs = Date.now() - ts;
  if (diffMs < 60 * 1000) return 'à l’instant';
  if (diffMs < 60 * 60 * 1000) return `il y a ${Math.floor(diffMs / (60 * 1000))} min`;
  if (diffMs < 24 * 60 * 60 * 1000) return `il y a ${Math.floor(diffMs / (60 * 60 * 1000))} h`;
  return new Date(ts).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function NotificationCenter({
  roleKey,
  unreadCount,
  items,
  prefs,
  metrics,
  onTogglePref,
  onOpenAction,
  onMarkAsRead,
  onMarkAllRead,
  onRemove,
  onClearRead,
  onOpenPanel,
  onResetMetrics,
}) {
  const [open, setOpen] = useState(false);
  const categories = useMemo(() => preferenceCategoriesForRole(roleKey), [roleKey]);
  const openClose = () => setOpen((prev) => !prev);

  useEffect(() => {
    if (!open) return;
    onOpenPanel?.();
  }, [onOpenPanel, open]);

  return (
    <div className="notif-center">
      <button
        type="button"
        className={`lock-btn notif-bell ${unreadCount > 0 ? 'has-unread' : ''}`}
        aria-label={`Notifications (${unreadCount} non lues)`}
        title="Notifications"
        onClick={openClose}
      >
        🔔
        {unreadCount > 0 && <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      {open && (
        <div className="notif-panel fade-in" role="dialog" aria-modal="false" aria-label="Centre de notifications">
          <div className="notif-panel-head">
            <strong>Notifications</strong>
            <div className="notif-panel-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onMarkAllRead}>Tout lu</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClearRead}>Nettoyer lues</button>
            </div>
          </div>
          <div className="notif-prefs">
            {categories.map((category) => (
              <label key={category} className="notif-pref-item">
                <input
                  type="checkbox"
                  checked={prefs?.[category] !== false}
                  onChange={(event) => onTogglePref?.(category, event.target.checked)}
                />
                {CATEGORY_LABELS[category]}
              </label>
            ))}
          </div>
          <div className="notif-list">
            {items.length === 0 && <p className="notif-empty">Aucune notification pour le moment.</p>}
            {items.map((item) => (
              <article
                key={item.id}
                className={`notif-item ${item.read ? 'read' : 'unread'} notif-${levelClass(item.level)}`}
              >
                <div className="notif-item-top">
                  <span className={`notif-level notif-level-${levelClass(item.level)}`}>
                    {NOTIFICATION_LEVEL_LABELS[item.level] || 'Info'}
                  </span>
                  <span className="notif-time">{formatRelative(item.createdAt)}</span>
                </div>
                <div className="notif-title">{item.title}</div>
                <p className="notif-message">{item.message}</p>
                <div className="notif-item-actions">
                  {!item.read && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onMarkAsRead?.(item.id)}>
                      Marquer lu
                    </button>
                  )}
                  {item.action && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenAction?.(item)}>
                      Ouvrir
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRemove?.(item.id)}>
                    Retirer
                  </button>
                </div>
              </article>
            ))}
          </div>
          <details className="notif-metrics">
            <summary>Diagnostic notifications</summary>
            <div className="notif-metrics-grid">
              <span>Créées: {Number(metrics?.created || 0).toLocaleString('fr-FR')}</span>
              <span>Ouvertures panneau: {Number(metrics?.opened || 0).toLocaleString('fr-FR')}</span>
              <span>Actions ouvertes: {Number(metrics?.actions || 0).toLocaleString('fr-FR')}</span>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onResetMetrics}>Réinitialiser</button>
          </details>
        </div>
      )}
    </div>
  );
}

export { NotificationCenter };
