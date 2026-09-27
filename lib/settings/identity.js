'use strict';

/**
 * Réglages du domaine « identité » (`app_settings`).
 *
 * Identité : connexion et inscription (dont Google), écran de connexion, mots de passe, import
 * de comptes, progression des profils, durée des sessions.
 *
 * Déclarations au format du noyau commun `lib/shared/settingsRegistryCore.js` (+ `scope` :
 * public / teacher / admin), agrégées par `lib/settings/domains.js` dans le registre unique
 * `SETTINGS_REGISTRY` de `lib/settings.js`. Recopiées telles quelles depuis ce registre
 * (piste B, étape B6) : mêmes clés, mêmes défauts, mêmes bornes.
 */

const { brandText, getBrand } = require('../brand');

/** Noms affichés par défaut (logiciel, établissement) — source unique `lib/brand.js`. */
const brand = getBrand();

const IDENTITY_SETTINGS = {
  'ui.auth.allow_register': { scope: 'public', type: 'boolean', default: true },
  'ui.auth.allow_google_student': { scope: 'public', type: 'boolean', default: true },
  'ui.auth.allow_google_teacher': { scope: 'public', type: 'boolean', default: true },
  /** Création d'un compte élève à la 1ʳᵉ connexion Google (sinon connexion seule si le compte existe). */
  'ui.auth.allow_google_auto_register': { scope: 'public', type: 'boolean', default: false },
  'ui.auth.allow_guest_visit': { scope: 'public', type: 'boolean', default: true },
  'ui.auth.default_mode': {
    scope: 'public',
    type: 'enum',
    values: ['login', 'register'],
    default: 'login',
  },
  'ui.auth.welcome_message': { scope: 'public', type: 'string', maxLength: 160, default: '' },
  'content.auth.title': { scope: 'public', type: 'string', maxLength: 80, default: brand.appName },
  'content.auth.subtitle': {
    scope: 'public',
    type: 'string',
    maxLength: 180,
    default: brandText('{app} — Le terrain d’apprentissage vivant du lycée'),
  },
  'content.auth.login_tab': {
    scope: 'public',
    type: 'string',
    maxLength: 40,
    default: 'Connexion',
  },
  'content.auth.register_tab': {
    scope: 'public',
    type: 'string',
    maxLength: 50,
    default: 'Créer un compte',
  },
  'content.auth.guest_visit_cta': {
    scope: 'public',
    type: 'string',
    maxLength: 70,
    default: '🧭 Visiter sans compte',
  },
  'security.password_min_length': { scope: 'teacher', type: 'number', min: 4, max: 32, default: 4 },
  /**
   * Import comptes : si un compte existe déjà (même type + prénom + nom), `update` applique
   * les infos du fichier (défaut) ; `fill` ne complète que les champs vides du profil ;
   * `skip` ignore la ligne. Dans tous les cas, le profil n'est jamais rétrogradé.
   * Surchargeable ponctuellement par `existingStrategy` dans `POST /api/students/import`.
   */
  'students.import.existing_strategy': {
    scope: 'teacher',
    type: 'enum',
    values: ['update', 'fill', 'skip'],
    default: 'update',
  },
  /**
   * Import comptes : si true, n’applique pas le plancher de longueur (élève ni 12 car. prof).
   * Le mot de passe reste obligatoire à la **création** ; vide à la mise à jour = inchangé.
   */
  'students.import.allow_weak_passwords': {
    scope: 'admin',
    type: 'boolean',
    default: false,
  },
  /** Si false : pas de changement automatique de profil élève selon les tâches validées (attribution manuelle uniquement). */
  'rbac.progression_by_validated_tasks': { scope: 'teacher', type: 'boolean', default: true },
  /** Défaut 1 h 30 (5400 s) pour toutes les émissions JWT ; surcharge possible dans Réglages > Sécurité. */
  'security.jwt_ttl_base_seconds': {
    scope: 'teacher',
    type: 'number',
    min: 900,
    max: 604800,
    default: 5400,
  },
  /**
   * Plafond absolu d'une session prolongée par le renouvellement glissant
   * (`lib/auth/slidingSession.js`) : au-delà, `/api/auth/me` cesse de ré-émettre et
   * l'utilisateur se reconnecte. Défaut 12 h (43200 s) — une journée de classe tient,
   * un jeton volé ne devient pas éternel.
   */
  'security.jwt_sliding_max_seconds': {
    scope: 'teacher',
    type: 'number',
    min: 900,
    max: 2592000,
    default: 43200,
  },
  'integration.google.enabled': { scope: 'admin', type: 'boolean', default: true },
};

module.exports = { IDENTITY_SETTINGS };
