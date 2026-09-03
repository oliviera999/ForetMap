import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOverlayHistoryBack } from '../shared/platform/useOverlayHistoryBack';
import { NOTIFICATION_CATEGORY, NOTIFICATION_LEVEL_LABELS } from '../constants/notifications';
import { Tooltip } from '../shared/components/Tooltip.jsx';
import { IconBell, IconClose } from '../shared/icons.jsx';
import {
  formatNotificationDateFr,
  notificationLevelClass,
} from '../shared/notifications/notificationCenterCore.js';

const CATEGORY_LABELS = {
  [NOTIFICATION_CATEGORY.DEADLINES]: 'Échéances',
  [NOTIFICATION_CATEGORY.VALIDATIONS]: 'Validations',
  [NOTIFICATION_CATEGORY.PROPOSALS]: 'Propositions',
  [NOTIFICATION_CATEGORY.OPERATIONS]: 'Exploitation',
  [NOTIFICATION_CATEGORY.SECURITY]: 'Sécurité',
};

// Niveaux et dates relatives viennent du noyau partagé des centres de notifications
// (`src/shared/notifications/notificationCenterCore.js`, lot 7) : G&L s'en sert aussi.
const levelClass = notificationLevelClass;

function preferenceCategoriesForRole(roleKey) {
  if (roleKey === 'student') {
    return [
      NOTIFICATION_CATEGORY.DEADLINES,
      NOTIFICATION_CATEGORY.OPERATIONS,
      NOTIFICATION_CATEGORY.SECURITY,
    ];
  }
  if (roleKey === 'teacher') {
    return [
      NOTIFICATION_CATEGORY.VALIDATIONS,
      NOTIFICATION_CATEGORY.PROPOSALS,
      NOTIFICATION_CATEGORY.OPERATIONS,
    ];
  }
  return [
    NOTIFICATION_CATEGORY.VALIDATIONS,
    NOTIFICATION_CATEGORY.PROPOSALS,
    NOTIFICATION_CATEGORY.OPERATIONS,
    NOTIFICATION_CATEGORY.SECURITY,
  ];
}

const formatRelative = formatNotificationDateFr;

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
  helpText = 'Notifications',
}) {
  const [open, setOpen] = useState(false);
  useOverlayHistoryBack(open, () => setOpen(false));
  const [portalNode, setPortalNode] = useState(null);
  const bellRef = useRef(null);
  const panelRef = useRef(null);
  const categories = useMemo(() => preferenceCategoriesForRole(roleKey), [roleKey]);
  const openClose = () => setOpen((prev) => !prev);
  const closePanel = () => setOpen(false);

  useEffect(() => {
    const node = document.createElement('div');
    document.body.appendChild(node);
    setPortalNode(node);
    return () => {
      document.body.removeChild(node);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    onOpenPanel?.();
  }, [onOpenPanel, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      const t = event.target;
      if (panelRef.current?.contains(t)) return;
      if (bellRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const panel = open ? (
    <div
      ref={panelRef}
      className="notif-panel fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Centre de notifications"
    >
      <div className="notif-panel-head">
        <div className="notif-panel-head-top">
          <strong>Notifications</strong>
          <button
            type="button"
            className="notif-panel-close"
            aria-label="Fermer le centre de notifications"
            onClick={closePanel}
          >
            <IconClose size={16} />
          </button>
        </div>
        <div className="notif-panel-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onMarkAllRead}>
            Tout lu
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClearRead}>
            Nettoyer lues
          </button>
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
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onMarkAsRead?.(item.id)}
                >
                  Marquer lu
                </button>
              )}
              {item.action && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    onOpenAction?.(item);
                    closePanel();
                  }}
                >
                  Ouvrir
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onRemove?.(item.id)}
              >
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
        <button type="button" className="btn btn-ghost btn-sm" onClick={onResetMetrics}>
          Réinitialiser
        </button>
      </details>
    </div>
  ) : null;

  return (
    <div className="notif-center" ref={bellRef}>
      <Tooltip text={helpText}>
        <button
          type="button"
          className={`lock-btn notif-bell ${unreadCount > 0 ? 'has-unread' : ''}`}
          aria-label={`Notifications (${unreadCount} non lues)`}
          aria-expanded={open}
          onClick={openClose}
        >
          <IconBell />
          {unreadCount > 0 && (
            <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
          )}
        </button>
      </Tooltip>
      {portalNode && panel ? createPortal(panel, portalNode) : null}
    </div>
  );
}

export { NotificationCenter };
