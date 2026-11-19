'use strict';

/**
 * Catalogue des actions du journal d'audit et du journal de sécurité.
 *
 * Source unique (serveur) des libellés lisibles, des catégories et du niveau « principal »
 * des événements. Le front ne garde plus sa propre table : les routes `/api/audit/*`
 * renvoient chaque ligne déjà décrite (`action_label`, `category`, `major`) et
 * `GET /api/audit/catalog` expose les catégories pour les filtres.
 *
 * - **Catégorie** : déduite par règles ordonnées (premier motif qui correspond) ; une action
 *   inconnue tombe dans `other` sans rien casser.
 * - **Principal** (`major`) : vrai pour tout ce qui n'est pas de la routine. Un échec
 *   (`result` ≠ `success`) est TOUJOURS principal, quelle que soit l'action : une connexion
 *   réussie est routinière, une connexion refusée ne l'est pas.
 * - **Libellé** : table explicite, sinon libellé fabriqué à partir des segments de l'action
 *   (`create_x` → « Création x ») pour qu'aucune action nouvelle n'apparaisse en code brut.
 */

const CATEGORIES = Object.freeze([
  { id: 'auth', label: 'Connexions & inscriptions' },
  { id: 'security', label: 'Droits & sécurité' },
  { id: 'users', label: 'Comptes & groupes' },
  { id: 'tasks', label: 'Tâches & projets' },
  { id: 'content', label: 'Contenus & cartes' },
  { id: 'community', label: 'Forum & échanges' },
  { id: 'settings', label: 'Paramètres & intégrations' },
  { id: 'mcp', label: 'Connecteur Claude' },
  { id: 'gl', label: 'Gnomes & Licornes' },
  { id: 'other', label: 'Autres' },
]);

const CATEGORY_IDS = Object.freeze(CATEGORIES.map((c) => c.id));
const CATEGORY_LABELS = Object.freeze(Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label])));

/**
 * Règles ordonnées : `exact` (liste), `prefixes`, `includes` (sous-chaînes). Première règle
 * qui correspond = catégorie.
 */
const CATEGORY_RULES = Object.freeze([
  { category: 'gl', prefixes: ['gl.', 'gl_'] },
  { category: 'mcp', prefixes: ['mcp.', 'mcp_'] },
  {
    category: 'security',
    exact: ['auth_impersonate_start', 'auth_impersonate_stop', 'auth_elevate', 'delete_teacher'],
    prefixes: [
      'rbac_',
      'auth.totp',
      'auth.password',
      'auth.email_change',
      'auth.password_setup_link',
    ],
  },
  { category: 'auth', exact: ['lti_launch'], prefixes: ['auth.', 'auth_'] },
  {
    category: 'users',
    exact: [
      'delete_student',
      'duplicate_student',
      'create_user_manual',
      'update_user_profile',
      'update_student_profile',
      'students_import',
      'create_group',
      'update_group',
      'delete_group',
    ],
    prefixes: ['groups_', 'user_', 'student_'],
  },
  { category: 'tasks', exact: ['delete_log'], includes: ['task', 'project'] },
  {
    category: 'community',
    prefixes: ['forum_', 'context_comment_', 'notification_', 'reward_'],
  },
  { category: 'settings', prefixes: ['settings_', 'moodle_', 'sync_', 'media_library'] },
  {
    category: 'content',
    includes: [
      'zone',
      'plant',
      'marker',
      'map',
      'tutorial',
      'quiz',
      'food_web',
      'visit',
      'content_library',
      'pedago',
      'species',
      'glossary',
      'media',
      'route',
      'category',
      'observation',
    ],
  },
]);

/** Actions de routine : masquées de la vue « principaux » quand elles réussissent. */
const MINOR_EXACT = new Set([
  'update_task',
  'assign_task',
  'unassign_task',
  'done_task',
  'add_task_log',
  'propose_task',
  'recurring_task_spawn',
  'context_comment_create',
  'forum_post_create',
  'forum_post_edit',
  'forum_thread_create',
  'content_library_analyze',
  'settings_map_georef',
  'map_route_pdf_export',
  'moodle_check',
  'mcp_api_call',
  'mcp.sql.dry_run',
  'auth.totp.challenge',
  'auth.totp.verify',
  'rbac_progression_recompute',
  'auth_impersonate_stop',
  'gl.auth.impersonate.stop',
]);
const MINOR_PREFIXES = ['auth.login', 'mcp.oauth.login', 'gl.auth.login'];
const MINOR_INCLUDES = ['reorder', 'reaction_toggle'];
/** Modifications de contenu courantes (hors droits, comptes et paramètres). */
const MINOR_CONTENT_UPDATE_RE = /^update_(zone|plant|marker|tutorial|quiz)$/;

const EXPLICIT_LABELS = Object.freeze({
  // Connexions & inscriptions
  'auth.login': 'Connexion',
  'auth.login.student': 'Connexion élève',
  'auth.login.student.oauth_google': 'Connexion élève (Google)',
  'auth.login.teacher.oauth_google': 'Connexion professeur (Google)',
  'auth.login.staff_plan.oauth_google': 'Connexion personnel (Google)',
  'auth.login.oauth_google.linked_elsewhere': 'Connexion Google refusée (compte lié ailleurs)',
  'auth.register.student': 'Inscription élève',
  'auth.register.class_code_invalid': 'Inscription : code de classe invalide',
  lti_launch: 'Lancement depuis Moodle (LTI)',
  // Droits & sécurité
  auth_impersonate_start: 'Prise de contrôle d’un compte',
  auth_impersonate_stop: 'Fin de prise de contrôle',
  auth_elevate: 'Élévation de droits',
  'auth.password_change': 'Changement de mot de passe',
  'auth.password_setup_link': 'Lien de création de mot de passe',
  'auth.password_reset.request.teacher': 'Demande de réinitialisation (professeur)',
  'auth.password_reset.request.student': 'Demande de réinitialisation (élève)',
  'auth.password_reset.confirm.teacher': 'Réinitialisation du mot de passe (professeur)',
  'auth.password_reset.confirm.student': 'Réinitialisation du mot de passe (élève)',
  'auth.email_change': 'Changement d’e-mail',
  'auth.totp.enroll_start': 'Double authentification : début d’activation',
  'auth.totp.enroll': 'Double authentification activée',
  'auth.totp.verify': 'Double authentification vérifiée',
  'auth.totp.challenge': 'Double authentification demandée',
  'auth.totp.backup_codes_regenerate': 'Codes de secours régénérés',
  'auth.totp.backup_code_used': 'Code de secours utilisé',
  rbac_assign_role: 'Attribution d’un profil',
  rbac_assign_role_bulk: 'Attribution de profils en masse',
  rbac_create_profile: 'Création d’un profil de droits',
  rbac_update_profile: 'Modification d’un profil de droits',
  rbac_update_profile_permissions: 'Modification des permissions d’un profil',
  rbac_update_profile_pin: 'Modification du code d’un profil',
  rbac_duplicate_profile: 'Duplication d’un profil de droits',
  rbac_delete_profile: 'Suppression d’un profil de droits',
  rbac_update_user: 'Modification d’un compte (droits)',
  rbac_password_reset_link: 'Lien de réinitialisation envoyé',
  rbac_progression_recompute: 'Recalcul des paliers',
  rbac_progression_by_tasks: 'Paliers recalculés par les tâches',
  delete_teacher: 'Suppression d’un compte professeur',
  // Comptes & groupes
  delete_student: 'Suppression élève',
  duplicate_student: 'Fusion / duplication élève',
  create_user_manual: 'Création manuelle de compte',
  update_user_profile: 'Modification de profil',
  update_student_profile: 'Modification de profil élève',
  students_import: 'Import d’élèves',
  create_group: 'Création groupe',
  update_group: 'Modification groupe',
  delete_group: 'Suppression groupe',
  groups_import: 'Import de groupes',
  groups_add_members_bulk: 'Ajout de membres à un groupe',
  groups_remove_member: 'Retrait d’un membre de groupe',
  // Tâches & projets
  create_task: 'Création tâche',
  update_task: 'Modification tâche',
  delete_task: 'Suppression tâche',
  archive_task: 'Archivage tâche',
  duplicate_task: 'Duplication tâche',
  assign_task: 'Inscription à une tâche',
  unassign_task: 'Désinscription d’une tâche',
  done_task: 'Tâche déclarée faite',
  validate_task: 'Validation tâche',
  propose_task: 'Proposition de tâche',
  add_task_log: 'Rapport de tâche',
  delete_log: 'Suppression rapport',
  recurring_task_spawn: 'Tâche récurrente générée',
  validate_task_project: 'Validation projet',
  duplicate_task_project: 'Duplication projet',
  reorder_project_tasks: 'Réordonnancement des tâches d’un projet',
  // Contenus & cartes
  create_zone: 'Création zone',
  update_zone: 'Modification zone',
  delete_zone: 'Suppression zone',
  create_plant: 'Création plante',
  update_plant: 'Modification plante',
  delete_plant: 'Suppression plante',
  create_marker: 'Création repère',
  update_marker: 'Modification repère',
  delete_marker: 'Suppression repère',
  create_tutorial: 'Création tutoriel',
  update_tutorial: 'Modification tutoriel',
  delete_tutorial: 'Désactivation tutoriel',
  create_quiz: 'Création question QCM',
  update_quiz: 'Modification question QCM',
  food_web_create: 'Création lien trophique',
  food_web_update: 'Modification lien trophique',
  food_web_delete: 'Suppression lien trophique',
  visit_mascot_pack_create: 'Création pack mascotte',
  visit_mascot_pack_update: 'Modification pack mascotte',
  visit_mascot_pack_delete: 'Suppression pack mascotte',
  visit_zone_delete: 'Suppression zone de visite',
  map_category_create: 'Création catégorie de lieu',
  map_category_update: 'Modification catégorie de lieu',
  map_category_delete: 'Suppression catégorie de lieu',
  map_category_reorder: 'Réordonnancement des catégories de lieu',
  map_route_create: 'Création parcours',
  map_route_update: 'Modification parcours',
  map_route_delete: 'Suppression parcours',
  map_route_pdf_export: 'Export PDF d’un parcours',
  content_library_analyze: 'Analyse de la bibliothèque de contenus',
  content_library_apply: 'Application de la bibliothèque de contenus',
  delete_pedago_session: 'Suppression séance pédagogique',
  media_library_delete: 'Suppression média',
  // Forum & échanges
  forum_thread_create: 'Nouveau sujet de forum',
  forum_post_create: 'Message de forum',
  forum_post_edit: 'Modification message de forum',
  forum_post_delete: 'Suppression message de forum',
  forum_post_report: 'Signalement message de forum',
  forum_report_resolve: 'Traitement d’un signalement',
  forum_post_reaction_toggle: 'Réaction sur le forum',
  context_comment_create: 'Commentaire',
  context_comment_delete: 'Suppression commentaire',
  context_comment_reaction_toggle: 'Réaction sur un commentaire',
  notification_send: 'Envoi de notification',
  reward_award: 'Attribution de récompense',
  // Paramètres & intégrations
  settings_update: 'Modification des paramètres',
  settings_media_upload: 'Dépôt de média (paramètres)',
  settings_media_delete: 'Suppression de média (paramètres)',
  settings_system_restart: 'Redémarrage du serveur',
  settings_map_create: 'Création carte',
  settings_map_update: 'Modification carte',
  settings_map_image_update: 'Nouvelle image de carte',
  settings_map_georef: 'Géoréférencement de carte',
  settings_help_narrator_update: 'Modification du narrateur d’aide',
  moodle_check: 'Vérification Moodle',
  moodle_sync_run: 'Synchronisation Moodle',
  moodle_group_mirror: 'Miroir des groupes Moodle',
  moodle_teams_mirror: 'Miroir des équipes Moodle',
  // Connecteur Claude
  mcp_api_call: 'Appel d’API via le connecteur',
  'mcp.oauth.login': 'Connexion du connecteur Claude',
  'mcp.oauth.consent': 'Autorisation du connecteur Claude',
  'mcp.oauth.totp': 'Double authentification du connecteur',
  'mcp.sql.execute': 'SQL d’écriture (connecteur)',
  'mcp.sql.dry_run': 'SQL d’écriture simulé (connecteur)',
  'mcp.sql.refused': 'SQL refusé (connecteur)',
  'mcp.privacy_bypass.read': 'Lecture de données personnelles (connecteur)',
  'mcp.content.apply': 'Modification de contenu (connecteur)',
  'mcp.write_off': 'Écriture du connecteur désactivée',
  // Gnomes & Licornes
  'gl.auth.link_foretmap': 'G&L : liaison au compte principal',
  'gl.auth.unlink_foretmap': 'G&L : déliaison du compte principal',
  'gl.auth.impersonate.start': 'G&L : prise de contrôle d’un joueur',
  'gl.auth.impersonate.stop': 'G&L : fin de prise de contrôle',
  'gl.auth.password_reset.confirm.player': 'G&L : réinitialisation du mot de passe joueur',
  'gl.auth.legacy_password_adopted': 'G&L : ancien mot de passe repris',
  gl_players_import: 'G&L : import de joueurs',
  gl_players_reconcile: 'G&L : rapprochement des joueurs',
  gl_player_delete: 'G&L : suppression joueur',
});

/**
 * Motifs (`reason`) les plus fréquents, traduits. L'identifiant saisi lors d'une connexion
 * refusée n'est volontairement PAS journalisé (un mot de passe tapé dans ce champ serait
 * lisible, CDG-13) : le motif est la seule information disponible.
 */
const REASON_LABELS = Object.freeze({
  account_not_found: 'Compte introuvable',
  password_invalid: 'Mot de passe incorrect',
  account_inactive: 'Compte désactivé',
  throttled: 'Trop de tentatives (verrou temporaire)',
  oauth_staff_no_access: 'Compte Google sans accès personnel',
  invalid: 'Donnée invalide',
  not_found: 'Introuvable',
  missing: 'Donnée manquante',
  missing_id: 'Identifiant manquant',
  reuse: 'Réutilisation refusée',
  replay: 'Rejeu refusé',
  limit: 'Limite atteinte',
  not_enrolled: 'Non inscrit',
});

/** Libellé d'un motif (`null` si vide ; motif inconnu → texte lisible). */
function reasonLabel(reason) {
  const r = String(reason == null ? '' : reason).trim();
  if (!r) return null;
  if (REASON_LABELS[r]) return REASON_LABELS[r];
  const text = r.replace(/[_.]+/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const VERBS = Object.freeze({
  create: 'Création',
  update: 'Modification',
  edit: 'Modification',
  delete: 'Suppression',
  remove: 'Retrait',
  add: 'Ajout',
  import: 'Import',
  export: 'Export',
  assign: 'Attribution',
  unassign: 'Retrait',
  validate: 'Validation',
  duplicate: 'Duplication',
  archive: 'Archivage',
  restore: 'Restauration',
  reorder: 'Réordonnancement',
  upload: 'Dépôt',
  toggle: 'Bascule',
  start: 'Début',
  stop: 'Fin',
  run: 'Exécution',
  sync: 'Synchronisation',
  apply: 'Application',
  analyze: 'Analyse',
  send: 'Envoi',
  reset: 'Réinitialisation',
  login: 'Connexion',
  logout: 'Déconnexion',
  register: 'Inscription',
  spawn: 'Génération',
  resolve: 'Traitement',
  report: 'Signalement',
  link: 'Liaison',
  unlink: 'Déliaison',
});

const NOUNS = Object.freeze({
  task: 'tâche',
  tasks: 'tâches',
  project: 'projet',
  zone: 'zone',
  plant: 'plante',
  marker: 'repère',
  group: 'groupe',
  groups: 'groupes',
  tutorial: 'tutoriel',
  quiz: 'QCM',
  map: 'carte',
  route: 'parcours',
  category: 'catégorie',
  media: 'média',
  student: 'élève',
  students: 'élèves',
  teacher: 'professeur',
  user: 'compte',
  player: 'joueur',
  players: 'joueurs',
  profile: 'profil',
  role: 'profil',
  settings: 'paramètres',
  forum: 'forum',
  post: 'message',
  thread: 'sujet',
  comment: 'commentaire',
  session: 'séance',
  pedago: 'pédagogique',
  visit: 'visite',
  pack: 'pack',
  mascot: 'mascotte',
  log: 'rapport',
  species: 'espèce',
  glossary: 'glossaire',
  term: 'terme',
  library: 'bibliothèque',
  content: 'contenu',
  password: 'mot de passe',
  game: 'partie',
  chapter: 'chapitre',
  spell: 'sort',
  catalogue: 'catalogue',
  catalogues: 'catalogues',
});

function startsWithAny(action, prefixes) {
  return (prefixes || []).some((p) => action.startsWith(p));
}

function includesAny(action, needles) {
  return (needles || []).some((n) => action.includes(n));
}

/** Catégorie d'une action (`other` si aucune règle ne correspond). */
function categoryOf(action) {
  const a = String(action || '');
  for (const rule of CATEGORY_RULES) {
    if (rule.exact && rule.exact.includes(a)) return rule.category;
    if (startsWithAny(a, rule.prefixes)) return rule.category;
    if (includesAny(a, rule.includes)) return rule.category;
  }
  return 'other';
}

/** L'action est-elle principale quand elle réussit ? */
function isMajorAction(action) {
  const a = String(action || '');
  if (MINOR_EXACT.has(a)) return false;
  if (startsWithAny(a, MINOR_PREFIXES)) return false;
  if (includesAny(a, MINOR_INCLUDES)) return false;
  if (MINOR_CONTENT_UPDATE_RE.test(a)) return false;
  return true;
}

function isFailureResult(result) {
  const r = String(result == null ? 'success' : result)
    .trim()
    .toLowerCase();
  return r !== '' && r !== 'success';
}

/** Libellé fabriqué depuis les segments de l'action (`create_zone` → « Création zone »). */
function humanizeAction(action) {
  const tokens = String(action || '')
    .split(/[._:-]+/)
    .filter(Boolean);
  if (!tokens.length) return '—';
  let verb = null;
  const rest = [];
  for (const t of tokens) {
    const low = t.toLowerCase();
    if (!verb && VERBS[low]) verb = VERBS[low];
    else if (low === 'gl') rest.push('G&L');
    else if (low === 'mcp') rest.push('connecteur');
    else if (low === 'auth') continue;
    else rest.push(NOUNS[low] || low.replace(/_/g, ' '));
  }
  const body = rest.join(' ').trim();
  if (verb) return body ? `${verb} ${body}` : verb;
  return body ? body.charAt(0).toUpperCase() + body.slice(1) : String(action);
}

function actionLabel(action) {
  const a = String(action || '');
  return EXPLICIT_LABELS[a] || humanizeAction(a);
}

/**
 * Description complète d'un événement.
 * @param {string} action
 * @param {string|null} [result]
 * @returns {{ action_label: string, category: string, category_label: string, major: boolean,
 *   failure: boolean }}
 */
function describeAction(action, result) {
  const category = categoryOf(action);
  const failure = isFailureResult(result);
  return {
    action_label: actionLabel(action),
    category,
    category_label: CATEGORY_LABELS[category] || CATEGORY_LABELS.other,
    major: failure || isMajorAction(action),
    failure,
  };
}

/** Catalogue sérialisable pour le front (`GET /api/audit/catalog`). */
function catalogPayload() {
  return {
    categories: CATEGORIES.map((c) => ({ ...c })),
    actions: Object.keys(EXPLICIT_LABELS)
      .sort()
      .map((action) => ({
        action,
        label: EXPLICIT_LABELS[action],
        category: categoryOf(action),
        major: isMajorAction(action),
      })),
  };
}

module.exports = {
  CATEGORIES,
  CATEGORY_IDS,
  CATEGORY_LABELS,
  categoryOf,
  isMajorAction,
  isFailureResult,
  humanizeAction,
  actionLabel,
  reasonLabel,
  describeAction,
  catalogPayload,
};
