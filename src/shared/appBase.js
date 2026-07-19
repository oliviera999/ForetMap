/**
 * Base d'URL de l'application — module partagé NEUTRE (aucun produit).
 *
 * Ce module ne contient QUE des primitives pures de résolution d'URL :
 * ni session, ni claim JWT, ni logique 401, ni store d'état. Il peut donc
 * être importé indifféremment par ForetMap et par GL sans tirer la session
 * ForetMap (cf. §5.1 de docs/AUDIT_CODE_2026-07.md).
 */

/**
 * Préfixe de base de l'app (Vite `base`) sans slash final.
 *
 * Pourquoi:
 * - En déploiement "sous-dossier" (ex: https://domaine.tld/foretmap/),
 *   les appels absolus "/api/..." pointent vers la racine du domaine et
 *   peuvent être réécrits vers l'accueil (symptôme: retour page d'accueil sans message).
 * - `import.meta.env.BASE_URL` est toujours suffixé par "/".
 */
export const API = String(import.meta.env?.BASE_URL || '/').replace(/\/+$/, '');

/**
 * Préfixe un chemin applicatif avec la base `API`.
 * - URL absolue (http/https) : renvoyée telle quelle.
 * - Quand `API === ''` (base '/'), on retombe sur une URL absolue classique.
 */
export function withAppBase(path) {
  const raw = String(path || '');
  if (!raw) return API || '/';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  return `${API}${normalized}` || normalized;
}
