'use strict';

/**
 * Réglages du domaine « confidentialité » (`app_settings`) — audit RGPD du 28/09/2026.
 *
 * Déclarations au format du noyau commun `lib/shared/settingsRegistryCore.js` (+ `scope`),
 * agrégées par `lib/settings/domains.js`. Portée `public` : le navigateur doit les connaître
 * avant toute connexion (polices, images, nettoyage à la déconnexion).
 */

const PRIVACY_SETTINGS = {
  /** Ressources tierces chargées par le navigateur. `local` (défaut) : polices servies par
   *  l'application, images Wikimedia relayées et mises en cache par le serveur — aucune adresse
   *  IP d'élève ne part vers un tiers. `external` : comportement historique (polices de marque
   *  Google, images chargées directement chez Wikimedia). */
  'privacy.external_assets_mode': {
    scope: 'public',
    type: 'enum',
    values: ['local', 'external'],
    default: 'local',
  },
  /** À la déconnexion volontaire, effacer de l'appareil les données propres au compte : files
   *  d'actions hors ligne (tâches faites, observations, brouillons de carnet, progression de
   *  visite) et photos gardées par le service worker. Une confirmation est demandée s'il reste
   *  des actions non envoyées. `false` : comportement historique (les files attendent que leur
   *  auteur se reconnecte). */
  'privacy.clear_local_data_on_logout': {
    scope: 'public',
    type: 'boolean',
    default: true,
  },
  /** Coordonnées « données personnelles » affichées dans la notice « Vos données » de chaque
   *  produit (`/confidentialite`, audit sécurité/RGPD du 30/09/2026, RG1) : DPO de
   *  l'établissement, adresse de contact, bureau de la vie scolaire… Texte libre, vide par
   *  défaut — la notice renvoie alors vers les enseignants et la direction. Portée `public` :
   *  la notice se lit sans compte. */
  'privacy.data_contact': {
    scope: 'public',
    type: 'string',
    maxLength: 400,
    default: '',
  },
};

module.exports = { PRIVACY_SETTINGS };
