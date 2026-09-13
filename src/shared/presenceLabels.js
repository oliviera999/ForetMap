/**
 * Miroir front des constantes `lib/shared/presenceCore.js` (pas d'import CJS ici).
 * Les valeurs doivent rester synchrones avec le cœur serveur.
 */
export const PRESENCE_STATUS = Object.freeze({
  ONLINE: 'online',
  RECENT: 'recent',
  OFFLINE: 'offline',
});

export const STATUS_LABELS_FR = Object.freeze({
  online: 'En ligne',
  recent: 'Vu récemment',
  offline: 'Hors ligne',
});

export const PRESENCE_EVENT = 'presence:update';

export function presenceLabelFr(status) {
  return STATUS_LABELS_FR[status] || STATUS_LABELS_FR.offline;
}
