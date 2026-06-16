/**
 * Helpers purs du shell App (O6), extraits de `src/App.jsx` :
 * messages d'erreur OAuth, décodage du payload OAuth (base64url), onglet
 * mémorisé, détection iOS, choix de carte visible et split desktop carte/tâches.
 * Aucun état React ici — uniquement des dérivations.
 */
import {
  DESKTOP_SPLIT_MIN_WIDTH,
  DESKTOP_SPLIT_MIN_MAP_PX,
  DESKTOP_SPLIT_MIN_TASKS_PX,
  TAB_STORAGE_KEY,
  KNOWN_TAB_VALUES,
} from '../constants/app-runtime';
import { safeLocalStorageGetItem } from './browserStorage.js';

export const OAUTH_ERROR_MESSAGES = {
  oauth_not_configured: 'Connexion Google indisponible (configuration serveur incomplète).',
  oauth_google_refused: 'Connexion Google annulée.',
  oauth_invalid_state: 'Connexion Google invalide (session expirée).',
  oauth_missing_code: 'Connexion Google impossible (code manquant).',
  oauth_missing_id_token: 'Connexion Google impossible (token manquant).',
  oauth_invalid_token: 'Connexion Google impossible (token invalide).',
  oauth_claims_invalid: 'Connexion Google refusée (compte non vérifié).',
  oauth_email_not_allowed: 'Adresse Google non autorisée pour ForetMap.',
  oauth_teacher_inactive: 'Compte n3boss inactif.',
  oauth_teacher_no_role: 'Aucun rôle n3boss attribué à ce compte.',
  oauth_server_error: 'Erreur serveur pendant la connexion Google.',
};

/** Message utilisateur pour un code d'erreur OAuth (message générique si inconnu). */
export function resolveOauthErrorMessage(code) {
  return OAUTH_ERROR_MESSAGES[code] || 'Connexion Google refusée.';
}

/** Décode un payload base64url (retour OAuth dans le hash d'URL) en objet JSON. */
export function decodeBase64UrlJson(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return JSON.parse(window.atob(padded));
}

/** Onglet mémorisé en localStorage, replié sur `map` si absent ou inconnu. */
export function readStoredTab() {
  const raw = String(safeLocalStorageGetItem(TAB_STORAGE_KEY, '') || '')
    .trim()
    .toLowerCase();
  if (!raw) return 'map';
  return KNOWN_TAB_VALUES.has(raw) ? raw : 'map';
}

/** Vrai sur iPhone / iPad / iPod (bannière d'installation iOS). */
export function detectIosDevice() {
  const ua = String(window.navigator.userAgent || '').toLowerCase();
  return ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod');
}

/** Carte préférée si visible, sinon première carte visible, sinon ''. */
export function pickVisibleMapId(visibleMaps, preferredMapId = '') {
  const preferred = String(preferredMapId || '').trim();
  if (!Array.isArray(visibleMaps) || visibleMaps.length === 0) return '';
  if (preferred && visibleMaps.some((map) => map.id === preferred)) return preferred;
  return String(visibleMaps[0]?.id || '').trim();
}

/**
 * Vrai quand le viewport permet le split desktop carte/tâches : largeur minimale
 * atteinte ET chaque colonne (ratio 1.25 / 1) garde sa largeur utile minimale.
 */
export function shouldUseDesktopSplitLayout(viewportWidth) {
  if (viewportWidth < DESKTOP_SPLIT_MIN_WIDTH) return false;
  const pagePadding = 32;
  const columnGap = 16;
  const usableWidth = Math.max(0, viewportWidth - pagePadding);
  const availableForColumns = Math.max(0, usableWidth - columnGap);
  const mapWidth = availableForColumns * (1.25 / 2.25);
  const tasksWidth = availableForColumns * (1 / 2.25);
  return mapWidth >= DESKTOP_SPLIT_MIN_MAP_PX && tasksWidth >= DESKTOP_SPLIT_MIN_TASKS_PX;
}
