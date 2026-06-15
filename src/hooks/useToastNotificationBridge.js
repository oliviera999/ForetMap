import { useEffect } from 'react';

import { NOTIFICATION_CATEGORY, NOTIFICATION_LEVEL } from '../constants/notifications';

/**
 * Passerelle toast → centre de notifications (extrait de App.jsx, O5).
 *
 * Encapsule l'unique effet inline d'App.jsx qui, à chaque nouveau `toast`,
 * pousse une notification d'information (niveau INFO, catégorie OPERATIONS)
 * dans le centre de notifications via `addNotification`.
 *
 * Concern autonome et faiblement couplé : aucun état n'est déplacé ni créé.
 * `toast` (état cœur d'App.jsx) et `addNotification` (fourni par
 * `useNotificationCenter`) restent gérés par App.jsx et sont passés en
 * paramètres. Iso-comportement : même clé, mêmes niveau/catégorie/titre,
 * même garde `if (!toast) return` et mêmes dépendances que l'ancien
 * `useEffect`.
 *
 * @param {object} params
 * @param {string|null} params.toast - message courant (ou null).
 * @param {(notification: object) => void} params.addNotification - ajout au centre de notifications.
 */
export function useToastNotificationBridge({ toast, addNotification }) {
  useEffect(() => {
    if (!toast) return;
    addNotification({
      key: `toast:${toast}`,
      level: NOTIFICATION_LEVEL.INFO,
      category: NOTIFICATION_CATEGORY.OPERATIONS,
      title: 'Information',
      message: String(toast),
    });
  }, [addNotification, toast]);
}
