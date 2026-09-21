/**
 * Session du plan des personnels (proflyautey) — volontairement minuscule.
 *
 * Le plan public est un produit **sans session** : ni jeton, ni compte. Le plan des personnels
 * en a besoin, mais pas de tout l'appareillage de ForetMap (rafraîchissement glissant,
 * usurpation, snapshots élève, événements d'expiration). Il lui faut trois choses : recueillir
 * le jeton déposé par le retour OAuth dans `#oauth=`, le relire pour signer ses requêtes, et
 * l'oublier. D'où ce module plutôt qu'un import de `src/services/api.js`, qui embarquerait
 * dans le paquet du plan tout le cœur applicatif de ForetMap.
 *
 * Le jeton est un JWT ForetMap ordinaire (`product: 'foret'`) : il vaut aussi pour les
 * commentaires de contexte, ce qui permet le bouton « signaler / proposer » sur une fiche.
 */
import {
  safeLocalStorageGetItem,
  safeLocalStorageSetItem,
  safeLocalStorageRemoveItem,
} from '../shared/platform/browserStorage.js';

const TOKEN_STORAGE_KEY = 'staffplan_auth_token';

/** Décode la charge base64url déposée par `buildOAuthFrontendRedirect` côté serveur. */
function decodeOAuthPayload(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return JSON.parse(window.atob(padded));
}

/** Jeton mémorisé, ou `''`. */
export function getStaffToken() {
  return String(safeLocalStorageGetItem(TOKEN_STORAGE_KEY, '') || '');
}

export function clearStaffToken() {
  safeLocalStorageRemoveItem(TOKEN_STORAGE_KEY);
}

/**
 * Consomme le fragment `#oauth=` / `#oauth_error=` du retour Google, au montage.
 *
 * Le fragment est retiré de l'URL (`history.replaceState`) avant tout : un jeton dans la barre
 * d'adresse se retrouve dans un signet, une capture d'écran ou un partage de lien.
 *
 * @returns {{ status: 'none' } | { status: 'ok' } | { status: 'error', code: string }}
 */
export function consumeStaffOauthHash() {
  if (typeof window === 'undefined') return { status: 'none' };
  const hashRaw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  if (!hashRaw) return { status: 'none' };
  const params = new URLSearchParams(hashRaw);
  const payloadRaw = params.get('oauth');
  const errorCode = params.get('oauth_error');
  if (!payloadRaw && !errorCode) return { status: 'none' };

  window.history.replaceState(
    {},
    document.title,
    `${window.location.pathname}${window.location.search}`,
  );

  if (errorCode) return { status: 'error', code: String(errorCode) };
  try {
    const payload = decodeOAuthPayload(payloadRaw);
    // `staff` est le retour du mode dédié à ce produit (`/api/auth/google/start?mode=staff`) :
    // il porte un jeton, que le compte soit enseignant ou non — un « Personnel » est un compte
    // de type élève. `teacher` reste accepté pour un retour émis par une version antérieure
    // (onglet resté ouvert pendant un déploiement).
    if ((payload?.type === 'staff' || payload?.type === 'teacher') && payload?.token) {
      safeLocalStorageSetItem(TOKEN_STORAGE_KEY, String(payload.token));
      return { status: 'ok' };
    }
    // Retour d'un autre mode (élève) : rien à mémoriser ici.
    return { status: 'error', code: 'oauth_staff_no_access' };
  } catch (_) {
    return { status: 'error', code: 'oauth_server_error' };
  }
}

/**
 * Messages des codes d'erreur OAuth rencontrés depuis ce produit.
 *
 * Tous les codes que le serveur sait émettre sont traités : un code non listé retombait sur
 * « La connexion n'a pas abouti », qui ne dit ni ce qui a échoué ni quoi faire — c'est
 * exactement ce que voyaient les personnels refusés à tort par le mode enseignant.
 */
export function staffOauthErrorMessage(code) {
  switch (String(code || '')) {
    case 'oauth_email_not_allowed':
      return 'Ce compte Google n’appartient pas au domaine autorisé par l’établissement.';
    case 'oauth_staff_no_access':
    case 'oauth_teacher_no_role':
      return 'Connexion réussie, mais ce compte n’a pas encore l’accès au plan des personnels.';
    case 'oauth_staff_account_not_found':
    case 'oauth_teacher_account_not_found':
    case 'oauth_account_not_found':
      return 'Aucun compte de l’établissement n’est rattaché à cette adresse. Demandez la création d’un compte à un administrateur, ou entrez par le code partagé s’il est activé.';
    case 'oauth_teacher_email_is_student':
      return 'Cette adresse est rattachée à un compte n3beur : elle n’ouvre pas le plan des personnels.';
    case 'oauth_teacher_inactive':
    case 'oauth_account_inactive':
      return 'Ce compte est désactivé. Contactez un administrateur.';
    case 'oauth_google_refused':
      return 'Connexion Google annulée.';
    case 'oauth_teacher_google_disabled':
      return 'La connexion Google des enseignants est désactivée par l’établissement.';
    case 'oauth_student_google_disabled':
      return 'La connexion Google est désactivée pour ce type de compte par l’établissement.';
    case 'oauth_account_mismatch':
      return 'Cette adresse est déjà rattachée à une autre identité Google.';
    case 'oauth_not_configured':
      return 'La connexion Google n’est pas configurée sur ce serveur.';
    case 'oauth_invalid_state':
    case 'oauth_missing_code':
      return 'La session de connexion a expiré avant le retour de Google. Réessayez.';
    default:
      return 'La connexion n’a pas abouti. Réessayez.';
  }
}
