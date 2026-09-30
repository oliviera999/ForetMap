import { withAppBase } from '../appBase.js';

/**
 * Adresse de la notice « Vos données » (audit sécurité/RGPD du 30/09/2026, RG1).
 *
 * Même chemin dans les quatre produits (ForetMap, G&L, plan public, plan des personnels) : le
 * serveur renvoie l'entrée HTML du produit pour toute adresse inconnue (`lib/spaFallback.js`),
 * et chaque `main.jsx` monte la notice à la place de l'application quand l'adresse est
 * celle-ci. La page s'affiche donc **sans compte**, sans session et sans passer par l'écran de
 * connexion — c'est l'exigence de l'article 12 du RGPD pour un public mineur.
 */
export const PRIVACY_NOTICE_PATH = '/confidentialite';

/** Lien absolu (préfixe de déploiement compris) vers la notice du produit courant. */
export function privacyNoticeHref() {
  return withAppBase(PRIVACY_NOTICE_PATH);
}

/**
 * L'adresse demandée est-elle celle de la notice ? Tolère la barre oblique finale et un
 * préfixe de déploiement (`/foretmap/confidentialite`).
 * @param {string} pathname `window.location.pathname`
 * @returns {boolean}
 */
export function isPrivacyNoticePath(pathname) {
  const path = String(pathname || '').replace(/\/+$/, '');
  return path === PRIVACY_NOTICE_PATH || path.endsWith(PRIVACY_NOTICE_PATH);
}
