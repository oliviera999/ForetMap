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
  /** Portée de l'en-tête `Clear-Site-Data` à la déconnexion (`POST /api/auth/logout` et
   *  déconnexions des plans). `cache` (défaut) : vide le cache HTTP. `cache_storage` : mode
   *  borne / tablette partagée — vide aussi tout le stockage du site (préférences, files hors
   *  ligne de tous les comptes). Jamais `"cookies"` ni `"executionContexts"`. */
  'privacy.logout_clear_site_data_scope': {
    scope: 'public',
    type: 'enum',
    values: ['cache', 'cache_storage'],
    default: 'cache',
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
  /** Relais d'images : `any_public` (défaut) accepte tout hôte HTTPS public ; `allowlist`
   *  n'accepte que `privacy.remote_media_hosts` (+ Wikimedia). */
  'privacy.remote_media_hosts_mode': {
    scope: 'admin',
    type: 'enum',
    values: ['any_public', 'allowlist'],
    default: 'any_public',
  },
  /** Liste d'hôtes (séparés par virgule/espace) : liste blanche en mode `allowlist`. */
  'privacy.remote_media_hosts': {
    scope: 'admin',
    type: 'string',
    maxLength: 2000,
    default: '',
  },
  /** Liste noire d'hôtes, toujours appliquée. */
  'privacy.remote_media_blocked_hosts': {
    scope: 'admin',
    type: 'string',
    maxLength: 2000,
    default: '',
  },
};

module.exports = { PRIVACY_SETTINGS };
