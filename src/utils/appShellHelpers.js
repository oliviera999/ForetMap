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
import { safeLocalStorageGetItem } from '../shared/platform/browserStorage.js';

export const OAUTH_ERROR_MESSAGES = {
  oauth_not_configured: 'Connexion Google indisponible (configuration serveur incomplète).',
  oauth_google_refused: 'Connexion Google annulée.',
  oauth_invalid_state: 'Connexion Google invalide (session expirée). Réessayez depuis ForetMap.',
  oauth_missing_code: 'Connexion Google impossible (code manquant).',
  oauth_missing_id_token: 'Connexion Google impossible (token manquant).',
  oauth_invalid_token: 'Connexion Google impossible (token invalide).',
  oauth_claims_invalid:
    'Connexion Google refusée : adresse non vérifiée chez Google, ou jeton invalide.',
  oauth_email_not_allowed:
    'Adresse Google non autorisée pour ForetMap. Causes possibles : domaine hors liste (ex. Gmail perso), ou adresse absente de la liste d’e-mails autorisés. Utilisez le compte Google du lycée, ou demandez à un administrateur d’autoriser votre adresse.',
  oauth_account_not_found:
    'Aucun compte ForetMap pour cette adresse Google. Causes possibles : compte pas encore créé, e-mail différent sur la fiche, ou création automatique Google désactivée. Demandez à un responsable de créer votre compte avec exactement cette adresse.',
  oauth_teacher_account_not_found:
    'Connexion enseignant Google refusée : aucun compte enseignant avec cette adresse. Causes possibles : le compte n’a pas encore été créé (Prof de classe / n3boss / admin), l’e-mail sur la fiche ForetMap est vide ou différent de Google, ou le compte a été créé comme élève/visiteur. Un administrateur doit créer (ou corriger) le compte enseignant avec exactement votre adresse Google, puis réessayez.',
  oauth_teacher_email_is_student:
    'Connexion enseignant Google refusée : cette adresse est déjà liée à un compte élève ou visiteur, pas à un compte enseignant. Causes possibles : une précédente connexion Google a créé un compte visiteur, ou le profil « Prof de classe » a été attribué à un compte élève. Un administrateur doit créer un vrai compte enseignant avec cette adresse (et éventuellement retirer le doublon visiteur), puis réessayez.',
  oauth_teacher_inactive:
    'Compte enseignant inactif. Un administrateur doit réactiver le compte dans Profils → Comptes.',
  oauth_teacher_no_role:
    'Compte enseignant sans profil de droits. Un administrateur doit attribuer un profil (ex. Prof de classe, n3boss) sur la fiche.',
  oauth_server_error: 'Erreur serveur pendant la connexion Google. Réessayez plus tard.',
};

/**
 * Avertissement après création automatique d’un compte visiteur via Google.
 * Destiné aux enseignants qui croyaient se connecter à un compte déjà créé.
 */
export const OAUTH_VISITOR_CREATED_WARNING =
  'Un compte visiteur vient d’être créé pour cette adresse Google. Si vous êtes enseignant (prof de classe, n3boss…), ce n’est pas le bon résultat. Causes fréquentes : compte enseignant pas encore créé, e-mail manquant ou différent sur la fiche ForetMap, ou création automatique Google activée. Demandez à un administrateur de créer (ou corriger) votre compte enseignant avec exactement cette adresse, puis reconnectez-vous avec Google.';

/** Message utilisateur pour un code d'erreur OAuth (message générique si inconnu). */
export function resolveOauthErrorMessage(code) {
  return OAUTH_ERROR_MESSAGES[code] || 'Connexion Google refusée.';
}

/** Durée d’affichage adaptée aux messages OAuth longs (causes d’échec). */
export function oauthFeedbackDurationMs(message) {
  const len = String(message || '').length;
  if (len > 220) return 20000;
  if (len > 100) return 12000;
  return 5000;
}

/** Décode un payload base64url (retour OAuth dans le hash d'URL) en objet JSON. */
export function decodeBase64UrlJson(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return JSON.parse(window.atob(padded));
}

/** Onglet mémorisé en localStorage, replié selon le rôle visiteur ou élève. */
export function readStoredTab(options = {}) {
  const isVisitor = !!options.isVisitor;
  const visitEnabled = options.visitEnabled !== false;
  const fallback = isVisitor ? (visitEnabled ? 'visit' : 'plants') : 'map';
  const raw = String(safeLocalStorageGetItem(TAB_STORAGE_KEY, '') || '')
    .trim()
    .toLowerCase();
  if (!raw) return fallback;
  if (!KNOWN_TAB_VALUES.has(raw)) return fallback;
  if (isVisitor && ['map', 'tasks', 'maptasks', 'tuto'].includes(raw)) {
    return visitEnabled ? 'visit' : 'plants';
  }
  return raw;
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
