'use strict';

/**
 * Réglages du domaine « plan » (`app_settings`).
 *
 * Produits « Plan », « Plan des personnels » et « Plan e-nov » : coquille, cartes proposées,
 * porte d'entrée et empreintes des codes d'accès.
 *
 * Déclarations au format du noyau commun `lib/shared/settingsRegistryCore.js` (+ `scope` :
 * public / teacher / admin), agrégées par `lib/settings/domains.js` dans le registre unique
 * `SETTINGS_REGISTRY` de `lib/settings.js`. Recopiées telles quelles depuis ce registre
 * (piste B, étape B6) : mêmes clés, mêmes défauts, mêmes bornes.
 */

const { brandText } = require('../brand');
const { CATEGORY_IDS_SETTING_MAX_LENGTH } = require('../categoryIdsSetting');

/**
 * Profils qu'un porteur du code du plan des personnels peut endosser — **liste blanche** : les
 * deux profils sans aucune capacité de gestion ni accès d'encadrement (`lib/rbac.js` :
 * « Personnel », rang 320 ; « Visiteur », rang 50). Le profil endossé décide des lieux réservés
 * et des compléments confidentiels qu'il voit (`lib/locationAudience.js`) : un code partagé,
 * qui se transmet et ne dit pas qui entre, ne doit jamais ouvrir la vue d'un administrateur ou
 * d'un professeur. Le premier est le défaut.
 */
const STAFF_PLAN_CODE_ROLE_SLUGS = Object.freeze(['personnel', 'visiteur']);

const PLAN_SETTINGS = {
  // Produit « Plan » (plan interactif d'établissement, cf. docs/AUDIT_CONVERGENCE_APPS_2026-09.md
  // §5.2) : réglages publics de la coquille, servis par la charge publique. Les listes de
  // catégories sont des identifiants séparés par `;`.
  'ui.plan.map_id': { scope: 'public', type: 'string', maxLength: 32, default: 'lyautey' },
  'ui.plan.title': {
    scope: 'public',
    type: 'string',
    maxLength: 120,
    default: brandText('Plan {orgShort}', 'Plan'),
  },
  'ui.plan.welcome_hint': {
    scope: 'public',
    type: 'string',
    maxLength: 240,
    default: 'Touchez un lieu, ou cherchez-le.',
  },
  'ui.plan.access_mode': {
    scope: 'public',
    type: 'enum',
    values: ['public', 'code'],
    default: 'public',
  },
  'ui.plan.attribution': { scope: 'public', type: 'string', maxLength: 240, default: '' },
  /**
   * URL publique du plan (`https://planlyautey.example.fr`). Sert de base aux liens profonds
   * imprimés — le QR code d'un parcours exporté depuis la console ForetMap doit pointer vers
   * le plan, pas vers l'hôte de la console. Vide = on retombe sur l'hôte de la requête.
   */
  'ui.plan.public_base_url': { scope: 'public', type: 'string', maxLength: 200, default: '' },
  'ui.plan.brand': { scope: 'public', type: 'json', shape: 'object', default: {} },
  /**
   * Autres cartes proposées au changement depuis le plan (bouton « Réglages » → « Plan
   * affiché »), identifiants séparés par `;`. Vide = un seul plan, pas de sélecteur.
   *
   * C'est **aussi la liste blanche de `?map_id=`** : sans elle, n'importe quelle carte de la
   * base sortait sur planlyautey à qui devinait son identifiant — la carte de travail de la
   * forêt comestible comprise. Une carte ouverte au public se déclare ici, elle ne se devine
   * pas.
   */
  'ui.plan.selectable_map_ids': {
    scope: 'public',
    type: 'string',
    maxLength: 512,
    default: '',
  },
  'ui.plan.default_category_ids': {
    scope: 'public',
    type: 'string',
    maxLength: CATEGORY_IDS_SETTING_MAX_LENGTH,
    default: '',
  },
  'ui.plan.hidden_category_ids': {
    scope: 'public',
    type: 'string',
    maxLength: CATEGORY_IDS_SETTING_MAX_LENGTH,
    default: '',
  },
  /** Autorise le mode « Orienter » (carte selon la boussole) sur le produit Plan. */
  'ui.plan.heading_up_enabled': { scope: 'public', type: 'boolean', default: false },
  /**
   * Plan des personnels (proflyautey, surface `staff`). Il partage la **carte** du plan public
   * — `ui.plan.map_id`, `ui.plan.brand`, `ui.plan.heading_up_enabled` (`lib/planContent.js`) —
   * et n'a en propre que sa ligne éditoriale et sa porte d'entrée.
   */
  'ui.staff_plan.title': {
    scope: 'public',
    type: 'string',
    maxLength: 120,
    default: brandText('Plan personnels — {orgShort}', 'Plan personnels'),
  },
  'ui.staff_plan.welcome_hint': {
    scope: 'public',
    type: 'string',
    maxLength: 400,
    default: 'Les lieux et consignes réservés aux personnels du lycée.',
  },
  /**
   * Porte d'entrée **par compte** (complément à `staff_plan.access`). Liste de profils
   * (slugs, séparés par `;`) autorisés à ouvrir proflyautey même sans la permission RBAC.
   * Défaut = admin / n3boss / prof de classe / personnel. Une liste vide est traitée comme
   * le défaut (ne ferme jamais le plan par accident). Portée `admin`.
   */
  'ui.staff_plan.allowed_role_slugs': {
    scope: 'admin',
    type: 'string',
    maxLength: 512,
    default: 'admin;prof;prof_classe;personnel',
  },
  /**
   * Porte d'entrée **secondaire**. L'entrée normale est l'authentification (Google ou mot de
   * passe) pour un profil listé dans `ui.staff_plan.allowed_role_slugs` : elle se règle dans
   * Réglages → Plan des personnels. `disabled` (défaut) = pas de code du tout ; `code` = un
   * code partagé est aussi accepté, pour les personnels sans compte.
   */
  'ui.staff_plan.access_mode': {
    scope: 'public',
    type: 'enum',
    values: ['disabled', 'code'],
    default: 'disabled',
  },
  /**
   * Rôle endossé par un visiteur entré au code : il n'a pas de compte, donc pas de rôle
   * propre, et `lib/locationAudience.js` a besoin d'un rôle pour filtrer les lieux. Portée
   * `admin` — c'est le curseur qui décide de ce qu'un porteur de code voit, il n'a rien à
   * faire dans la charge publique.
   *
   * Borné à `STAFF_PLAN_CODE_ROLE_SLUGS` : une autre valeur est refusée à l'écriture (**400**)
   * et, déjà enregistrée, ignorée à la lecture (repli sur le défaut).
   */
  'ui.staff_plan.code_role_slug': {
    scope: 'admin',
    type: 'enum',
    values: [...STAFF_PLAN_CODE_ROLE_SLUGS],
    default: STAFF_PLAN_CODE_ROLE_SLUGS[0],
    errorMessage: `Profil non autorisé pour l’entrée par code (attendus : ${STAFF_PLAN_CODE_ROLE_SLUGS.join(', ')})`,
  },
  'ui.staff_plan.attribution': { scope: 'public', type: 'string', maxLength: 240, default: '' },
  /**
   * Cartes proposées au changement sur le plan des personnels — liste **propre à cette
   * surface** : un lecteur identifié peut avoir accès à des plans que le plan public n'offre
   * pas (annexes, niveaux techniques, site distant).
   */
  'ui.staff_plan.selectable_map_ids': {
    scope: 'public',
    type: 'string',
    maxLength: 512,
    default: '',
  },
  'ui.staff_plan.default_category_ids': {
    scope: 'public',
    type: 'string',
    maxLength: CATEGORY_IDS_SETTING_MAX_LENGTH,
    default: '',
  },
  'ui.staff_plan.hidden_category_ids': {
    scope: 'public',
    type: 'string',
    maxLength: CATEGORY_IDS_SETTING_MAX_LENGTH,
    default: '',
  },
  /**
   * Plan e-nov (`enov.*`, surface `enov`, migration 315). Il partage la **carte** du Plan
   * Lyautey — `ui.plan.map_id`, `ui.plan.brand`, `ui.plan.heading_up_enabled` — et n'a en
   * propre que sa ligne éditoriale, sa porte d'entrée et sa mise en avant des lieux innovants
   * (`lib/enovPlan.js`).
   */
  'ui.enov_plan.title': {
    scope: 'public',
    type: 'string',
    maxLength: 120,
    default: brandText('Plan e-nov — {orgShort}', 'Plan e-nov'),
  },
  'ui.enov_plan.welcome_hint': {
    scope: 'public',
    type: 'string',
    maxLength: 400,
    default: 'Les lieux mis en avant sont nos innovations : touchez-en un pour le découvrir.',
  },
  'ui.enov_plan.access_mode': {
    scope: 'public',
    type: 'enum',
    values: ['public', 'code'],
    default: 'public',
  },
  'ui.enov_plan.attribution': { scope: 'public', type: 'string', maxLength: 240, default: '' },
  /** Autres cartes proposées au changement — et liste blanche de `?map_id=` (voir `ui.plan.*`). */
  'ui.enov_plan.selectable_map_ids': {
    scope: 'public',
    type: 'string',
    maxLength: 512,
    default: '',
  },
  'ui.enov_plan.default_category_ids': {
    scope: 'public',
    type: 'string',
    maxLength: CATEGORY_IDS_SETTING_MAX_LENGTH,
    default: '',
  },
  'ui.enov_plan.hidden_category_ids': {
    scope: 'public',
    type: 'string',
    maxLength: CATEGORY_IDS_SETTING_MAX_LENGTH,
    default: '',
  },
  /**
   * Catégories dont les lieux sont **mis en avant** (halo, liste « Innovations », fiche
   * ouverte par le texte e-nov). Défaut : la catégorie semée par la migration 315.
   */
  'ui.enov_plan.highlight_category_ids': {
    scope: 'public',
    type: 'string',
    maxLength: CATEGORY_IDS_SETTING_MAX_LENGTH,
    default: 'cat-enov',
  },
  /** Couleur du halo des lieux mis en avant (`#rrggbb`) — par défaut le jaune du label e-nov. */
  'ui.enov_plan.highlight_color': {
    scope: 'public',
    type: 'string',
    maxLength: 7,
    default: '#faba38',
  },
  /** Pastille « e-nov » accolée aux lieux mis en avant, en plus du halo. */
  'ui.enov_plan.badge_enabled': { scope: 'public', type: 'boolean', default: false },
  /** Intitulé de la puce qui ouvre la liste des lieux mis en avant. */
  'ui.enov_plan.innovations_label': {
    scope: 'public',
    type: 'string',
    maxLength: 40,
    default: 'Innovations',
  },
  /** Hachage (bcrypt) du code d'accès du plan quand `ui.plan.access_mode` vaut `code`. */
  'security.plan_access_code_hash': {
    scope: 'admin',
    type: 'string',
    maxLength: 120,
    default: '',
  },
  /**
   * Hachage (bcrypt) du code d'accès du plan des personnels quand
   * `ui.staff_plan.access_mode` vaut `code`. Le code lui-même n'est jamais stocké en clair.
   */
  'security.staff_plan_access_code_hash': {
    scope: 'admin',
    type: 'string',
    maxLength: 120,
    default: '',
  },
  /** Hachage (bcrypt) du code d'accès du plan e-nov quand `ui.enov_plan.access_mode` vaut `code`. */
  'security.enov_plan_access_code_hash': {
    scope: 'admin',
    type: 'string',
    maxLength: 120,
    default: '',
  },
  /**
   * Durée du laissez-passer posé après la saisie du code, en jours. Elle fixe le `Max-Age` du
   * cookie **et** l'échéance signée qu'il porte (`lib/accessGate.js`, option `expiring`) : le
   * serveur refuse un laissez-passer échu, même recopié. Une nouvelle durée vaut pour les
   * laissez-passer émis ensuite ; pour fermer la porte à ceux déjà émis, changer le code.
   */
  'security.plan_access_pass_days': {
    scope: 'admin',
    type: 'number',
    min: 1,
    max: 90,
    default: 30,
  },
  /**
   * Plan des personnels : plus court que le plan public — le code y ouvre des informations
   * internes, et un secret partagé ne se révoque pas personne par personne.
   */
  'security.staff_plan_access_pass_days': {
    scope: 'admin',
    type: 'number',
    min: 1,
    max: 30,
    default: 7,
  },
  'security.enov_plan_access_pass_days': {
    scope: 'admin',
    type: 'number',
    min: 1,
    max: 90,
    default: 30,
  },
};

module.exports = { PLAN_SETTINGS, STAFF_PLAN_CODE_ROLE_SLUGS };
