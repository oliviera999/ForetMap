const { queryAll, queryOne, execute, getRbacWriteVersion } = require('../database');
const { normalizeEmail } = require('./identity');
const { getSettingValue } = require('./settings');
const { isVisitorLikeSlug } = require('./shared/visitorRoles');
const {
  NON_N3BEUR_SYSTEM_ROLE_SLUGS,
  isGlRoleSlug: isGlRoleSlugCore,
  defaultRoleSlugForUserType,
} = require('./shared/n3beurRolesCore');

/**
 * Cache des lookups RBAC (O3) — collapse les 2-4 requêtes `getPrimaryRoleForUser`/`getRolePermissions`
 * par requête authentifiée. Chaque entrée porte la version d'écriture RBAC (`getRbacWriteVersion()`) au
 * moment de la mise en cache ; toute écriture RBAC incrémente cette version (cf. `database.js`), donc une
 * entrée n'est resservie que si AUCUNE écriture RBAC n'a eu lieu depuis → invalidation complète et sûre
 * (y compris les écritures SQL directes des tests : pas de hook par route, pas de péremption silencieuse).
 * Les valeurs cachées sont traitées en lecture seule par les appelants (jamais mutées).
 */
const rbacLookupCache = new Map();
const RBAC_LOOKUP_CACHE_MAX = 1000;
function rbacCacheGet(key) {
  const hit = rbacLookupCache.get(key);
  if (hit && hit.version === getRbacWriteVersion()) return hit;
  return undefined;
}
function rbacCacheSet(key, value) {
  if (rbacLookupCache.size >= RBAC_LOOKUP_CACHE_MAX) rbacLookupCache.clear();
  rbacLookupCache.set(key, { version: getRbacWriteVersion(), value });
}
function clearRbacLookupCache() {
  rbacLookupCache.clear();
}

const SYSTEM_ROLES = [
  { slug: 'admin', display_name: 'Admin', rank: 500, display_order: 10 },
  { slug: 'prof', display_name: 'n3boss', rank: 400, display_order: 20 },
  { slug: 'gl_admin', display_name: 'MJ Admin', rank: 390, display_order: 22 },
  { slug: 'gl_mj', display_name: 'MJ', rank: 360, display_order: 24 },
  // Tuteur de classe : périmètre groupes, sans tâches ni jardin (voir docs/reference).
  { slug: 'prof_classe', display_name: 'Prof de classe', rank: 350, display_order: 25 },
  { slug: 'gl_player', display_name: 'Joueur G&L', rank: 120, display_order: 55 },
  { slug: 'gl_observateur', display_name: 'Observateur G&L', rank: 60, display_order: 58 },
  {
    slug: 'eleve_chevronne',
    display_name: 'n3beur chevronné',
    rank: 300,
    emoji: '🏆',
    min_done_tasks: 10,
    display_order: 30,
  },
  {
    slug: 'eleve_avance',
    display_name: 'n3beur avancé',
    rank: 200,
    emoji: '🌿',
    min_done_tasks: 5,
    display_order: 40,
  },
  {
    slug: 'eleve_novice',
    display_name: 'n3beur novice',
    rank: 100,
    emoji: '🪨',
    min_done_tasks: 0,
    display_order: 50,
  },
  // Observateur : pas d'action métier ni de données perso des autres.
  { slug: 'visiteur', display_name: 'Visiteur', rank: 50, display_order: 60 },
  // Staff non enseignant : même périmètre que visiteur (Visite / Biodiversité).
  { slug: 'personnel', display_name: 'Personnel', rank: 50, display_order: 61 },
];

const PERMISSIONS = [
  ['teacher.access', 'Accès interface n3boss', 'Permet d’ouvrir l’interface n3boss'],
  [
    'media.manage',
    'Gestion médiathèque',
    'Téléverser et supprimer des médias dans la médiathèque partagée',
  ],
  ['admin.roles.manage', 'Gestion des profils RBAC', 'Créer/renommer profils et permissions'],
  [
    'admin.users.assign_roles',
    'Attribution des profils',
    'Attribuer/retraiter un profil aux utilisateurs',
  ],
  [
    'admin.impersonate',
    'Prise de contrôle utilisateur',
    'Se connecter en tant qu’un autre compte (support / diagnostic)',
  ],
  [
    'users.create',
    'Création unitaire utilisateurs',
    'Créer un utilisateur unitaire (n3beur/n3boss/admin selon droits)',
  ],
  ['admin.settings.read', 'Lecture paramètres admin', 'Consulter la console de réglages'],
  ['admin.settings.write', 'Édition paramètres admin', 'Modifier les réglages non secrets'],
  [
    'admin.settings.secrets.write',
    'Actions admin critiques',
    'Exécuter les actions critiques (restart, secrets)',
  ],
  ['groups.read', 'Lecture groupes utilisateurs', 'Consulter les groupes et sous-groupes'],
  [
    'groups.manage',
    'Gestion groupes utilisateurs',
    'Créer/éditer/supprimer les groupes, membres et périmètres',
  ],
  ['stats.read.all', 'Lecture stats globales', 'Consulter les stats de tous les n3beurs'],
  [
    'stats.read.group',
    'Lecture stats par groupe',
    'Consulter les stats dans le périmètre de ses groupes',
  ],
  ['stats.export', 'Export stats', 'Exporter les stats n3beurs en CSV'],
  ['students.import', 'Import n3beurs', 'Importer des n3beurs via CSV/XLSX'],
  ['students.delete', 'Suppression n3beur', 'Supprimer un compte n3beur'],
  ['tasks.manage', 'Gestion tâches', 'Créer/éditer/supprimer les tâches'],
  [
    'tasks.assign.group',
    'Affectation tâches par groupe',
    'Affecter des missions à un groupe/sous-groupe',
  ],
  ['tasks.validate', 'Validation tâches', 'Valider les tâches terminées'],
  ['tasks.propose', 'Proposition de tâches', 'Proposer de nouvelles tâches'],
  ['tasks.assign_self', 'Prise en charge tâche', 'S’assigner à une tâche'],
  ['tasks.unassign_self', 'Retrait de tâche', 'Se retirer d’une tâche'],
  ['tasks.done_self', 'Soumission de tâche', 'Marquer une tâche comme faite'],
  ['zones.manage', 'Gestion zones', 'Créer/éditer/supprimer zones et photos'],
  ['map.manage_markers', 'Gestion repères', 'Créer/éditer/supprimer repères'],
  ['plants.manage', 'Gestion biodiversité', 'Créer/éditer/supprimer/importer plantes'],
  ['tutorials.manage', 'Gestion tutoriels', 'Créer/éditer/supprimer tutoriels'],
  ['visit.manage', 'Gestion visite', 'Gérer la carte de visite publique'],
  // Plan des personnels (proflyautey) : ouvre la lecture de la surface `staff`, c'est-à-dire
  // les lieux retirés du plan public et les compléments confidentiels des lieux. Distincte de
  // `teacher.access` : un personnel non enseignant (agent, vie scolaire) doit pouvoir entrer
  // sur le plan sans pour autant ouvrir la console n3boss. Elle s'attribue à n'importe quel
  // profil, y compris maison, depuis « Profils RBAC ».
  [
    'staff_plan.access',
    'Accès plan des personnels',
    'Ouvrir proflyautey : lieux réservés aux personnels et compléments confidentiels',
  ],
  // Traitement des messages reçus sur un lieu (statut « pris en compte » / « traité » /
  // « sans suite »). Accordée au seul `admin` à la livraison : l'établissement n'a pas encore
  // désigné de référent, et un statut que personne ne pose vaut mieux qu'un statut que tout le
  // monde pose (`docs/AUDIT_COMMUNICATION_2026-09-18.md` §6, C1 et C4). Distincte de
  // `zones.manage` : corriger un lieu et clore un signalement ne sont pas le même geste, et
  // elle s'attribue à n'importe quel profil depuis « Profils RBAC » le jour venu.
  [
    'place_messages.manage',
    'Traitement des messages de lieux',
    'Marquer un message reçu sur un lieu comme pris en compte, traité ou sans suite',
  ],
  // Volontairement distincte de `admin.settings.write` : éditer les textes des visites
  // guidées ne doit pas supposer l'accès à toute la console de réglages. Accordée à
  // l'admin par défaut, elle s'attribue à un profil prof depuis « Profils RBAC ».
  [
    'tours.manage',
    'Édition visites guidées',
    'Réécrire les textes des visites guidées de découverte',
  ],
  ['audit.read', 'Lecture audit', 'Consulter le journal d’audit'],
  // Lien Moodle (docs/AUDIT_MOODLE_IDENTITES_2026-09.md, section 13) : réglages, simulation,
  // application, conflits, rapprochements en attente et liaisons LTI. Réservée à l'admin par
  // défaut ; un MJ G&L sans cette permission ne touche pas aux liaisons LTI (section 21.5).
  [
    'integrations.moodle.manage',
    'Intégration Moodle',
    'Configurer, simuler et appliquer la synchronisation Moodle et l’entrée LTI',
  ],
  ['observations.read.all', 'Lecture observations globales', 'Consulter toutes les observations'],
  [
    'observations.read.group',
    'Lecture observations par groupe',
    'Consulter les observations du périmètre de groupe',
  ],
  ['observations.manage.all', 'Gestion observations globales', 'Supprimer toutes les observations'],
  [
    'observations.manage.group',
    'Gestion observations par groupe',
    'Supprimer les observations du périmètre de groupe',
  ],
  [
    'forum.group.moderate',
    'Modération forum par groupe',
    'Modérer les discussions dans son périmètre de groupe',
  ],
  ['gl.read', 'Lecture Gnomes & Licornes', 'Voir les données publiques et de partie de G&L'],
  ['gl.content.manage', 'Edition contenu G&L', 'Editer le contenu narratif du jeu G&L'],
  ['gl.players.manage', 'Gestion joueurs G&L', 'Créer et gérer classes et joueurs G&L'],
  ['gl.game.manage', 'Gestion parties G&L', 'Créer et piloter les parties G&L'],
  ['gl.team.manage', 'Gestion équipes G&L', 'Créer et modifier les équipes de partie'],
  ['gl.event.emit', 'Emission événements G&L', 'Publier des événements de partie'],
  ['gl.mascot.position', 'Position mascottes G&L', 'Déplacer les mascottes sur la carte'],
  ['gl.settings.manage', 'Réglages G&L', 'Modifier les réglages de la plateforme G&L'],
  [
    'gl.action.request',
    'Demande d’action joueur G&L',
    'Un joueur peut proposer une action à valider par le MJ',
  ],
];

// Permissions attribuées par défaut à chaque rôle système. Toute permission listée est accordée
// directement à l'utilisateur connecté (plus de dimension d'élévation / PIN).
const ROLE_PERMISSION_MATRIX = {
  admin: [
    'teacher.access',
    'admin.roles.manage',
    'admin.users.assign_roles',
    'admin.impersonate',
    'users.create',
    'groups.read',
    'groups.manage',
    'admin.settings.read',
    'admin.settings.write',
    'admin.settings.secrets.write',
    'stats.read.all',
    'stats.read.group',
    'stats.export',
    'students.import',
    'students.delete',
    'tasks.manage',
    'tasks.validate',
    'tasks.propose',
    'tasks.assign_self',
    'tasks.assign.group',
    'tasks.unassign_self',
    'tasks.done_self',
    'zones.manage',
    'map.manage_markers',
    'plants.manage',
    'tutorials.manage',
    'visit.manage',
    'staff_plan.access',
    'place_messages.manage',
    'tours.manage',
    'audit.read',
    'integrations.moodle.manage',
    'observations.read.all',
    'observations.read.group',
    'observations.manage.all',
    'observations.manage.group',
    'forum.group.moderate',
    'media.manage',
  ],
  prof: [
    'teacher.access',
    'groups.read',
    'groups.manage',
    'stats.read.all',
    'stats.read.group',
    'stats.export',
    'students.import',
    'students.delete',
    'users.create',
    'tasks.manage',
    'tasks.assign.group',
    'tasks.validate',
    'tasks.propose',
    'tasks.assign_self',
    'tasks.unassign_self',
    'tasks.done_self',
    'zones.manage',
    'map.manage_markers',
    'plants.manage',
    'tutorials.manage',
    'visit.manage',
    'staff_plan.access',
    'audit.read',
    'observations.read.all',
    'observations.read.group',
    'observations.manage.all',
    'observations.manage.group',
    'forum.group.moderate',
    'media.manage',
  ],
  // Tuteur : élèves de ses groupes seulement ; pas de tâches / jardin / création par défaut.
  prof_classe: [
    'teacher.access',
    'groups.read',
    'groups.manage',
    'stats.read.group',
    'observations.read.group',
    'staff_plan.access',
  ],
  eleve_chevronne: ['tasks.propose', 'tasks.assign_self', 'tasks.unassign_self', 'tasks.done_self'],
  eleve_avance: ['tasks.propose', 'tasks.assign_self', 'tasks.unassign_self', 'tasks.done_self'],
  eleve_novice: ['tasks.assign_self', 'tasks.unassign_self', 'tasks.done_self'],
  gl_admin: [
    'gl.read',
    'gl.content.manage',
    'gl.players.manage',
    'gl.game.manage',
    'gl.team.manage',
    'gl.event.emit',
    'gl.mascot.position',
    'gl.settings.manage',
  ],
  gl_mj: [
    'gl.read',
    'gl.content.manage',
    'gl.players.manage',
    'gl.game.manage',
    'gl.team.manage',
    'gl.event.emit',
    'gl.mascot.position',
  ],
  gl_player: ['gl.read', 'gl.action.request', 'gl.mascot.position'],
  gl_observateur: ['gl.read'],
  visiteur: [],
  // Staff non enseignant : aucune action métier, mais l'accès au plan des personnels — c'est
  // le profil visé par le sous-domaine proflyautey.
  personnel: ['staff_plan.access'],
};

let bootstrapped = false;

/** Avis UI ponctuel : consommé par GET /api/auth/me (un seul onglet / première requête). */
const pendingAutoProfilePromotionByStudentId = new Map();

const STUDENT_PROFILE_PROMO_PERMISSION_LINES = [
  { key: 'tasks.propose', text: 'Proposer de nouvelles tâches' },
  { key: 'tasks.assign_self', text: 'Prendre des tâches en charge' },
  { key: 'tasks.done_self', text: 'Marquer tes tâches comme réalisées' },
  { key: 'tasks.unassign_self', text: 'Te retirer d’une tâche' },
];

const STUDENT_PROGRESS_DEFAULTS = {
  eleve_novice: { min: 0, emoji: '🪨', order: 50, label: 'n3beur novice' },
  eleve_avance: { min: 5, emoji: '🌿', order: 40, label: 'n3beur avancé' },
  eleve_chevronne: { min: 10, emoji: '🏆', order: 30, label: 'n3beur chevronné' },
};

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.max(0, Math.floor(n));
  return i;
}

function normalizeEmoji(value, fallback = '🌿') {
  const emoji = String(value || '').trim();
  if (!emoji) return fallback;
  return emoji.slice(0, 16);
}

/** Rang du profil n3boss (`prof`) : seuil pour distinguer paliers n3beur vs staff. */
const N3BOSS_ROLE_RANK = 400;

/**
 * Profils système hors échelle n3beur : l'encadrement (admin, n3boss, **prof de classe**) et
 * la lecture seule (visiteur, personnel). Source unique : `lib/shared/n3beurRolesCore.js`.
 * « Prof de classe » manquait à l'ancienne liste locale : un seuil `min_done_tasks` posé sur
 * ce profil l'aurait fait entrer dans l'échelle, et la validation d'une tâche aurait promu
 * un élève tuteur de classe (CDG-09).
 */
const STAFF_ROLE_SLUGS = new Set(NON_N3BEUR_SYSTEM_ROLE_SLUGS);

function isStaffRoleSlug(slug) {
  return STAFF_ROLE_SLUGS.has(
    String(slug || '')
      .trim()
      .toLowerCase(),
  );
}

const isGlRoleSlug = isGlRoleSlugCore;

/** Profil pouvant porter des réglages « palier n3beur » (aligné Profils & utilisateurs). */
function isStudentProgressionTierSlug(slug, rank) {
  const s = String(slug || '')
    .trim()
    .toLowerCase();
  if (!s || isStaffRoleSlug(s) || isGlRoleSlug(s)) return false;
  if (s.startsWith('eleve_')) return true;
  const r = Number(rank);
  return Number.isFinite(r) && r < N3BOSS_ROLE_RANK;
}

/** Profil entrant dans l’échelle auto : palier n3beur avec seuil défini (ou seed eleve_*). */
function isStudentProgressionLadderRole(slug, rank, minDoneTasks) {
  if (!isStudentProgressionTierSlug(slug, rank)) return false;
  const s = String(slug || '')
    .trim()
    .toLowerCase();
  if (s.startsWith('eleve_')) return true;
  if (minDoneTasks === null || minDoneTasks === undefined || minDoneTasks === '') return false;
  return Number.isFinite(Number(minDoneTasks));
}

function normalizeStudentProgressionStep(row) {
  const slug = String(row?.slug || '')
    .trim()
    .toLowerCase();
  if (!slug || !isStudentProgressionLadderRole(slug, row.rank, row.min_done_tasks)) return null;
  const defaults = STUDENT_PROGRESS_DEFAULTS[slug] || {};
  const min = toPositiveInt(row.min_done_tasks, defaults.min ?? 0);
  const displayOrder = toPositiveInt(row.display_order, defaults.order ?? 999);
  return {
    roleSlug: slug,
    min,
    label: String(row.display_name || defaults.label || slug),
    emoji: normalizeEmoji(row.emoji, defaults.emoji || '🌿'),
    displayOrder,
  };
}

async function getStudentProgressionRoles() {
  const rows = await queryAll(
    `SELECT slug, display_name, emoji, min_done_tasks, display_order, \`rank\`
       FROM roles
      ORDER BY display_order ASC, min_done_tasks ASC, \`rank\` DESC, id ASC`,
  );
  const normalized = rows.map(normalizeStudentProgressionStep).filter(Boolean);
  if (normalized.length > 0) return normalized;
  return [
    {
      roleSlug: 'eleve_novice',
      min: STUDENT_PROGRESS_DEFAULTS.eleve_novice.min,
      label: STUDENT_PROGRESS_DEFAULTS.eleve_novice.label,
      emoji: STUDENT_PROGRESS_DEFAULTS.eleve_novice.emoji,
      displayOrder: STUDENT_PROGRESS_DEFAULTS.eleve_novice.order,
    },
    {
      roleSlug: 'eleve_avance',
      min: STUDENT_PROGRESS_DEFAULTS.eleve_avance.min,
      label: STUDENT_PROGRESS_DEFAULTS.eleve_avance.label,
      emoji: STUDENT_PROGRESS_DEFAULTS.eleve_avance.emoji,
      displayOrder: STUDENT_PROGRESS_DEFAULTS.eleve_avance.order,
    },
    {
      roleSlug: 'eleve_chevronne',
      min: STUDENT_PROGRESS_DEFAULTS.eleve_chevronne.min,
      label: STUDENT_PROGRESS_DEFAULTS.eleve_chevronne.label,
      emoji: STUDENT_PROGRESS_DEFAULTS.eleve_chevronne.emoji,
      displayOrder: STUDENT_PROGRESS_DEFAULTS.eleve_chevronne.order,
    },
  ];
}

function sortProgressionSteps(steps) {
  return [...(Array.isArray(steps) ? steps : [])].sort(
    (a, b) =>
      a.min - b.min ||
      a.displayOrder - b.displayOrder ||
      String(a.label || '').localeCompare(String(b.label || '')),
  );
}

function pickProgressionStep(steps) {
  if (!steps.length) return null;
  return steps.reduce((best, step) => {
    if (!best) return step;
    if (step.min > best.min) return step;
    if (step.min < best.min) return best;
    if (step.displayOrder < best.displayOrder) return step;
    if (step.displayOrder > best.displayOrder) return best;
    return String(step.roleSlug).localeCompare(String(best.roleSlug)) > 0 ? step : best;
  });
}

function resolveStudentRoleSlugFromValidatedCount(validatedCount, steps) {
  const done = toPositiveInt(validatedCount, 0);
  const ordered = sortProgressionSteps(steps);
  const eligible = ordered.filter((step) => done >= step.min);
  if (eligible.length === 0) return 'eleve_novice';
  const maxMin = Math.max(...eligible.map((step) => step.min));
  const atMaxMin = eligible.filter((step) => step.min === maxMin);
  if (maxMin === 0) {
    return atMaxMin.reduce((best, step) =>
      !best ||
      step.displayOrder < best.displayOrder ||
      (step.displayOrder === best.displayOrder &&
        String(step.roleSlug).localeCompare(String(best.roleSlug)) < 0)
        ? step
        : best,
    ).roleSlug;
  }
  return pickProgressionStep(atMaxMin).roleSlug;
}

async function countValidatedAssignmentsForStudent(studentId) {
  const row = await queryOne(
    `SELECT COUNT(*) AS c
       FROM task_assignments ta
       INNER JOIN tasks t ON t.id = ta.task_id
       INNER JOIN users u ON u.id = ? AND u.user_type = 'student'
      WHERE t.status = 'validated'
        AND (
          ta.student_id = u.id
          OR (ta.student_first_name = u.first_name AND ta.student_last_name = u.last_name)
        )`,
    [studentId],
  );
  return toPositiveInt(row?.c, 0);
}

async function getStudentProgressionConfig() {
  const steps = sortProgressionSteps(await getStudentProgressionRoles());
  const thresholds = Object.fromEntries(steps.map((step) => [step.roleSlug, step.min]));
  const autoProgressionEnabled = await getSettingValue('rbac.progression_by_validated_tasks', true);
  return {
    thresholds,
    steps,
    progressionSlugs: new Set(steps.map((step) => step.roleSlug)),
    autoProgressionEnabled: !!autoProgressionEnabled,
  };
}

function consumePendingAutoProfilePromotion(studentId) {
  const key = String(studentId || '').trim();
  if (!key) return null;
  const payload = pendingAutoProfilePromotionByStudentId.get(key) || null;
  if (payload) pendingAutoProfilePromotionByStudentId.delete(key);
  return payload;
}

async function buildAutoProfilePromotionPayload(roleRow, validatedTaskCount) {
  if (!roleRow?.id) return null;
  const permRows = await getRolePermissions(roleRow.id);
  const highlights = [];
  for (const { key, text } of STUDENT_PROFILE_PROMO_PERMISSION_LINES) {
    const row = permRows.find((r) => r.permission_key === key);
    if (row) {
      highlights.push(text);
    }
  }
  const forumOk = Number(roleRow.forum_participate) !== 0;
  const ctxOk = Number(roleRow.context_comment_participate) !== 0;
  highlights.push(forumOk ? 'Forum : tu peux participer' : 'Forum : lecture seule');
  highlights.push(
    ctxOk
      ? 'Commentaires sur les fiches : tu peux publier'
      : 'Commentaires sur les fiches : lecture seule',
  );
  const maxConc = roleRow.max_concurrent_tasks;
  if (maxConc != null && maxConc !== '') {
    const n = Number(maxConc);
    if (Number.isFinite(n)) {
      if (n === 0) highlights.push('Inscriptions actives : pas de plafond pour ton profil');
      else highlights.push(`Jusqu’à ${n} tâche(s) active(s) en parallèle (selon ton profil)`);
    }
  }
  const slug = String(roleRow.slug || '')
    .trim()
    .toLowerCase();
  const displayName = String(roleRow.display_name || '').trim() || slug;
  const emojiRaw = String(roleRow.emoji || '').trim();
  return {
    kind: 'progression',
    roleSlug: slug,
    roleDisplayName: displayName,
    roleEmoji: emojiRaw ? emojiRaw.slice(0, 16) : null,
    validatedTaskCount: toPositiveInt(validatedTaskCount, 0),
    highlights: highlights.slice(0, 6),
  };
}

/**
 * Aligne le profil **attribué** d'un n3beur sur son nombre de tâches validées, puis recalcule
 * le profil effectif (`lib/effectiveRole.js`).
 *
 * La progression ne fait que **relever** le profil attribué ; un profil conféré par un groupe
 * plus élevé reste effectif (« le plus élevé l'emporte »), et un groupe qui **impose** son
 * profil sort le compte de l'échelle. Seuls les comptes dont le profil effectif est un palier
 * n3beur sont concernés : un visiteur, un encadrant ou un profil sur mesure ne sont jamais
 * touchés — même en manuel.
 *
 * @param {string} studentId
 * @param {number|null} doneCount Compteur déjà connu (évite un COUNT), sinon recalculé.
 * @param {object|null} progressionConfig Config partagée (évite N lectures de réglages).
 * @param {{recordPromotionNotice?: boolean, manual?: boolean, allowDemotion?: boolean,
 *   dryRun?: boolean}} [options]
 *   - `manual` : recalcul demandé explicitement par un n3boss (bouton « Recalculer ») : passe
 *     outre le réglage `rbac.progression_by_validated_tasks`.
 *   - `allowDemotion` : alignement strict (le profil attribué peut redescendre au palier
 *     mérité). Par défaut la montée seule s'applique.
 *   - `dryRun` : calcule la décision et la renvoie (`changed` + `dryRun: true`) sans écrire.
 */
async function syncStudentPrimaryRoleFromProgress(
  studentId,
  doneCount = null,
  progressionConfig = null,
  options = {},
) {
  const recordPromotionNotice = !!options.recordPromotionNotice;
  const manual = !!options.manual;
  const allowDemotion = !!options.allowDemotion;
  const dryRun = !!options.dryRun;
  await ensureRbacBootstrap();
  const { resolveEffectiveRole, pickEffectiveRole, setAssignedRole } = require('./effectiveRole');
  const config = progressionConfig || (await getStudentProgressionConfig());
  const resolved = await resolveEffectiveRole(studentId);
  const done =
    doneCount == null
      ? await countValidatedAssignmentsForStudent(studentId)
      : toPositiveInt(doneCount, 0);
  if (!resolved || resolved.userType !== 'student' || !resolved.decision) {
    return { changed: false, reason: 'not_student', currentRoleSlug: null, done, ...config };
  }
  const current = resolved.decision.role;
  const currentSlug = current.slug;
  const base = {
    currentRoleSlug: currentSlug,
    currentRoleDisplayName: current.displayName,
    assignedRoleSlug: resolved.assigned?.slug ?? null,
    done,
    ...config,
  };
  if (!config.autoProgressionEnabled && !manual) {
    return { changed: false, reason: 'auto_progression_disabled', ...base };
  }
  if (resolved.decision.source === 'forced') {
    return {
      changed: false,
      reason: 'group_forced_role',
      forcedByGroupId: resolved.decision.groupId,
      forcedByGroupName: resolved.decision.groupName,
      ...base,
    };
  }
  if (!config.progressionSlugs.has(currentSlug)) {
    return {
      changed: false,
      reason: isVisitorLikeSlug(currentSlug) ? 'visitor_like_skipped' : 'role_out_of_ladder',
      ...base,
    };
  }
  const targetSlug = resolveStudentRoleSlugFromValidatedCount(done, config.steps);
  const targetRole = await getRoleBySlug(targetSlug);
  if (!targetRole?.id) {
    return { changed: false, reason: 'target_role_missing', targetRoleSlug: targetSlug, ...base };
  }
  const assigned = resolved.assigned;
  const assignedSlug = assigned?.slug ?? '';
  // Le profil attribué ne bouge que s'il est lui-même dans l'échelle, de type visiteur, ou
  // absent : un profil d'encadrement ou sur mesure posé à la main n'est jamais réécrit.
  const assignedMovable =
    !assigned || config.progressionSlugs.has(assignedSlug) || isVisitorLikeSlug(assignedSlug);
  if (!assignedMovable) {
    return {
      changed: false,
      reason: 'assigned_out_of_ladder',
      targetRoleSlug: targetSlug,
      ...base,
    };
  }
  // L'échelle est ordonnée par **seuil** de tâches validées (`min_done_tasks`), pas par rang :
  // un palier sur mesure au seuil plus haut est une montée même si son rang est plus bas.
  const stepOf = (slug) => (config.steps || []).find((step) => step.roleSlug === slug);
  const targetMin = stepOf(targetSlug)?.min ?? STUDENT_PROGRESS_DEFAULTS[targetSlug]?.min ?? 0;
  const assignedMin = assigned
    ? (stepOf(assignedSlug)?.min ?? STUDENT_PROGRESS_DEFAULTS[assignedSlug]?.min ?? 0)
    : -1;
  const targetRank = Number(targetRole.rank || 0);
  const assignedRank = Number(assigned?.rank || 0);
  const sameSlug = assignedSlug === targetSlug;
  // Le profil effectif est déjà au palier mérité (par exemple conféré par un groupe) : rien
  // à relever, on ne réécrit pas le profil attribué pour rien.
  const alreadyThere = sameSlug || currentSlug === targetSlug;
  // Rattrapage automatique : un palier n3beur attribué au-dessus du compteur réel redescend
  // à la validation d'une tâche (règle historique) ; en recalcul manuel, seul l'alignement
  // strict (`allowDemotion`) rétrograde. Un palier sur mesure posé à la main est conservé.
  const catchUp = !manual && assignedSlug.startsWith('eleve_') && done < assignedMin;
  const up = !alreadyThere && (targetMin > assignedMin || targetRank > assignedRank);
  const down = !alreadyThere && !up;
  if (alreadyThere || (down && !allowDemotion && !catchUp)) {
    return {
      changed: false,
      reason: alreadyThere ? 'already_aligned' : 'demotion_not_allowed',
      targetRoleSlug: targetSlug,
      ...base,
    };
  }
  // Profil effectif après relèvement du profil attribué (même règle que le recalcul réel).
  const preview = pickEffectiveRole({
    userType: 'student',
    assigned: targetRole,
    conferred: resolved.conferred.map((c) => ({
      id: c.role.id,
      slug: c.role.slug,
      display_name: c.role.displayName,
      rank: c.role.rank,
      group_id: c.groupId,
      group_name: c.groupName,
      force_default_role: c.forced ? 1 : 0,
    })),
  });
  const nextSlug = preview?.role?.slug ?? targetSlug;
  const nextRank = preview?.role?.rank ?? targetRank;
  const effectiveChanged = nextSlug !== currentSlug;
  if (!dryRun) {
    await setAssignedRole(studentId, targetRole.id);
    if (recordPromotionNotice && effectiveChanged && nextRank > current.rank) {
      const nextRole = await getRoleBySlug(nextSlug);
      const notice = await buildAutoProfilePromotionPayload(nextRole, done);
      if (notice) pendingAutoProfilePromotionByStudentId.set(String(studentId).trim(), notice);
    }
  }
  return {
    changed: true,
    dryRun,
    reason: effectiveChanged
      ? nextRank < current.rank
        ? 'demoted'
        : 'promoted'
      : 'assigned_updated',
    effectiveChanged,
    currentRoleSlug: nextSlug,
    currentRoleDisplayName: preview?.role?.displayName ?? targetRole.display_name,
    previousRoleSlug: currentSlug,
    previousRoleDisplayName: current.displayName,
    assignedRoleSlug: targetSlug,
    previousAssignedRoleSlug: assignedSlug || null,
    targetRoleSlug: targetSlug,
    done,
    ...config,
  };
}

/** Après validation d’une tâche : met à jour le profil principal des n3beurs assignés. */
async function syncProgressionForValidatedTask(taskId) {
  const tid = String(taskId || '').trim();
  if (!tid) return;
  const rows = await queryAll(
    `SELECT DISTINCT u.id AS student_id
       FROM task_assignments ta
       INNER JOIN tasks t ON t.id = ta.task_id AND t.status = 'validated'
       INNER JOIN users u ON u.user_type = 'student'
        AND (
          ta.student_id = u.id
          OR (ta.student_first_name = u.first_name AND ta.student_last_name = u.last_name)
        )
      WHERE ta.task_id = ?`,
    [tid],
  );
  for (const row of rows) {
    const sid = String(row?.student_id || '').trim();
    if (sid) await syncStudentPrimaryRoleFromProgress(sid);
  }
}

async function getRoleBySlug(slug) {
  // C1 (audit 2026-09) : seul maillon RBAC non caché, et c'est le chemin qu'emprunte
  // l'hydratation GL (`buildAuthzPayloadForRoleSlug`) à chaque requête. Même cache
  // versionné que `getPrimaryRoleForUser` : toute écriture RBAC périme l'entrée.
  const key = `rs:${slug}`;
  const cached = rbacCacheGet(key);
  if (cached) return cached.value;
  const value = await queryOne('SELECT * FROM roles WHERE slug = ? LIMIT 1', [slug]);
  rbacCacheSet(key, value);
  return value;
}

async function ensureDefaultRolesAndPermissions() {
  for (const role of SYSTEM_ROLES) {
    await execute(
      'INSERT IGNORE INTO roles (slug, display_name, emoji, min_done_tasks, display_order, `rank`, is_system) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [
        role.slug,
        role.display_name,
        role.emoji || null,
        role.min_done_tasks ?? null,
        role.display_order ?? 0,
        role.rank,
      ],
    );
  }
  for (const [key, label, description] of PERMISSIONS) {
    await execute('INSERT IGNORE INTO permissions (`key`, label, description) VALUES (?, ?, ?)', [
      key,
      label,
      description,
    ]);
  }
  // Semis matrice, permission par permission : on n'accorde que ce qui n'a JAMAIS été
  // proposé à ce profil, l'historique vivant dans `rbac_seeded_permissions` (migration 241).
  //
  // Le critère précédent — « seulement si le profil n'a encore aucune permission » — visait
  // le bon but (qu'une révocation admin survive aux redémarrages) avec un mauvais test. Sur
  // une base neuve, les migrations `025`, `034`, `163`, `219` et `231` remplissent déjà une
  // partie de `role_permissions` avant ce semis : le compteur valait donc > 0, la matrice
  // entière était sautée, et toute permission qui ne vit que dans `ROLE_PERMISSION_MATRIX`
  // n'était jamais posée. `admin` démarrait sans `forum.group.moderate` — donc sans personne
  // pour modérer le forum — et `prof` sans `groups.read` ni `groups.manage`, c'est-à-dire
  // sans le périmètre de groupes sur lequel repose « Prof de classe » lui-même.
  //
  // Mémoriser la proposition plutôt que compter les permissions distingue « révoqué par un
  // admin » de « jamais accordé » : une révocation reste révoquée, et une permission ajoutée
  // plus tard au catalogue est bien déployée sur les profils existants.
  for (const [roleSlug, permissionKeys] of Object.entries(ROLE_PERMISSION_MATRIX)) {
    const role = await getRoleBySlug(roleSlug);
    if (!role) continue;
    const seededRows = await queryAll(
      'SELECT permission_key FROM rbac_seeded_permissions WHERE role_id = ?',
      [role.id],
    );
    const alreadySeeded = new Set(seededRows.map((row) => row.permission_key));
    for (const permissionKey of permissionKeys) {
      if (alreadySeeded.has(permissionKey)) continue;
      await execute('INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [
        role.id,
        permissionKey,
      ]);
      await execute(
        'INSERT IGNORE INTO rbac_seeded_permissions (role_id, permission_key) VALUES (?, ?)',
        [role.id, permissionKey],
      );
    }
  }
}

async function repairDuplicatePrimaryRoles() {
  const dupPairs = await queryAll(
    `SELECT user_type, user_id
       FROM user_roles
      WHERE is_primary = 1
      GROUP BY user_type, user_id
     HAVING COUNT(*) > 1`,
  );
  for (const row of dupPairs) {
    const userType = row.user_type;
    const userId = row.user_id;
    const primaries = await queryAll(
      `SELECT ur.role_id, ur.assigned_at, r.slug, r.\`rank\` AS role_rank
         FROM user_roles ur
         INNER JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_type = ? AND ur.user_id = ? AND ur.is_primary = 1
        ORDER BY r.\`rank\` DESC, ur.assigned_at ASC`,
      [userType, userId],
    );
    let keepRoleId = primaries[0]?.role_id;
    if (String(userType).toLowerCase() === 'student') {
      const nonVisitor = primaries.filter((p) => !isVisitorLikeSlug(p.slug));
      if (nonVisitor.length > 0) {
        keepRoleId = nonVisitor[0].role_id;
      } else {
        const vis = primaries.find((p) => isVisitorLikeSlug(p.slug));
        if (vis) keepRoleId = vis.role_id;
      }
    }
    if (!keepRoleId) continue;
    await execute(
      `UPDATE user_roles
          SET is_primary = CASE WHEN role_id = ? THEN 1 ELSE 0 END
        WHERE user_type = ? AND user_id = ?`,
      [keepRoleId, userType, userId],
    );
  }
}

/**
 * Comptes sans profil attribué → le profil par défaut de leur type (prof de classe pour un
 * enseignant, visiteur pour un élève), puis profil effectif posé si absent. Plus aucune
 * promotion « admin » au démarrage : le compte administrateur initial est semé par
 * `lib/teacherAdminSeed.js` (`TEACHER_ADMIN_EMAIL`), une fois, et jamais d'après un alias
 * d'e-mail (CDG-01).
 */
async function ensureDefaultAssignments() {
  for (const userType of ['teacher', 'student']) {
    const role = await getRoleBySlug(defaultRoleSlugForUserType(userType));
    if (!role) continue;
    await execute(
      'UPDATE users SET assigned_role_id = ? WHERE user_type = ? AND assigned_role_id IS NULL',
      [role.id, userType],
    );
  }
  await execute(
    `INSERT IGNORE INTO user_roles (user_type, user_id, role_id, is_primary)
     SELECT u.user_type, u.id, u.assigned_role_id, 1
       FROM users u
       LEFT JOIN user_roles ur
         ON ur.user_type = u.user_type AND ur.user_id = u.id AND ur.is_primary = 1
      WHERE ur.user_id IS NULL AND u.assigned_role_id IS NOT NULL`,
  );
  await repairDuplicatePrimaryRoles();
}

async function ensureRbacBootstrap() {
  if (bootstrapped) return;
  await ensureDefaultRolesAndPermissions();
  await ensureDefaultAssignments();
  bootstrapped = true;
}

function resetRbacBootstrapForTests() {
  bootstrapped = false;
  pendingAutoProfilePromotionByStudentId.clear();
  clearRbacLookupCache();
}

/** Rétablit forum / commentaires sur les paliers n3beur système (pollution tests RBAC). */
async function repairSystemN3beurParticipationDefaults() {
  await execute(
    `UPDATE roles
        SET context_comment_participate = 1,
            forum_participate = 1
      WHERE is_system = 1
        AND slug IN ('eleve_novice', 'eleve_avance', 'eleve_chevronne')`,
  );
}

async function getPrimaryRoleForUser(userType, userId) {
  const key = `pr:${userType}:${userId}`;
  const cached = rbacCacheGet(key);
  if (cached) return cached.value;
  const value = await queryOne(
    `SELECT r.id, r.slug, r.display_name, r.\`rank\` AS \`rank\`
       FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_type = ? AND ur.user_id = ? AND ur.is_primary = 1
      ORDER BY r.\`rank\` DESC, ur.assigned_at ASC
      LIMIT 1`,
    [userType, userId],
  );
  rbacCacheSet(key, value);
  return value;
}

async function getRolePermissions(roleId) {
  const key = `rp:${roleId}`;
  const cached = rbacCacheGet(key);
  if (cached) return cached.value;
  const value = await queryAll(
    `SELECT rp.permission_key
       FROM role_permissions rp
      WHERE rp.role_id = ?`,
    [roleId],
  );
  rbacCacheSet(key, value);
  return value;
}

/**
 * Même effet « sans PIN » que les slugs système admin/prof : paliers n3boss dupliqués
 * (autre slug, rang ≥ 400, permission teacher.access) pour les comptes enseignant.
 */
function computeNativePrivilegedRole(userType, role, permissionRows) {
  if (!role) return false;
  const roleSlug = String(role.slug || '').toLowerCase();
  if (roleSlug === 'admin' || roleSlug === 'prof') return true;
  if (String(userType || '').toLowerCase() !== 'teacher') return false;
  const rank = Number(role.rank);
  if (!Number.isFinite(rank) || rank < 400) return false;
  const rows = Array.isArray(permissionRows) ? permissionRows : [];
  return rows.some((r) => r.permission_key === 'teacher.access');
}

/**
 * Charge d'un coup les permissions d'un rôle et construit le payload d'autorisation.
 * Source unique partagée par les deux produits :
 *  - ForetMap passe par `buildAuthzPayload` (rôle primaire de l'utilisateur) ;
 *  - Gnomes & Licornes par `buildAuthzPayloadForRoleSlug` (rôle porté par l'identité GL).
 * @param {object} role ligne `roles`
 * @param {string|null} userType type d'utilisateur (pour le calcul « rôle privilégié natif »)
 */
async function buildAuthzPayloadFromRole(role, userType = null) {
  if (!role) return null;
  const rows = await getRolePermissions(role.id);
  const hasNativePrivilegedRole = computeNativePrivilegedRole(userType, role, rows);
  // Toute permission attribuée au rôle est accordée directement (plus de dimension d'élévation).
  const permissions = rows.map((row) => row.permission_key);

  return {
    roleId: role.id,
    roleSlug: role.slug,
    roleDisplayName: role.display_name,
    roleRank: role.rank,
    permissions,
    // Conservé (toujours vide) pour compatibilité de forme avec les consommateurs existants.
    elevatedPermissions: [],
    nativePrivileged: hasNativePrivilegedRole,
  };
}

async function buildAuthzPayload(userType, userId) {
  await ensureRbacBootstrap();
  const role = await getPrimaryRoleForUser(userType, userId);
  if (!role) return null;
  return buildAuthzPayloadFromRole(role, userType);
}

/**
 * Permissions courantes d'un **slug de rôle** (et non d'un utilisateur ForetMap).
 *
 * Utilisé par Gnomes & Licornes, dont les identités vivent dans `gl_players` / `gl_admins`
 * (hors table `user_roles`) mais dont les rôles `gl_*` figurent bien au catalogue RBAC
 * partagé. Permet à GL de dériver ses permissions de la MÊME source que ForetMap, au lieu
 * d'une liste codée en dur à tenir alignée à la main (cf. audit B6).
 *
 * @returns {Promise<object|null>} payload d'autorisation, ou `null` si le slug est inconnu
 */
async function buildAuthzPayloadForRoleSlug(roleSlug, userType = null) {
  const slug = String(roleSlug || '')
    .trim()
    .toLowerCase();
  if (!slug) return null;
  await ensureRbacBootstrap();
  const role = await getRoleBySlug(slug);
  if (!role) return null;
  return buildAuthzPayloadFromRole(role, userType);
}

async function setPrimaryRole(userType, userId, roleId) {
  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', [
    userType,
    userId,
  ]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    [userType, userId, roleId],
  );
}

async function checkCriticalAdminAccount() {
  await ensureRbacBootstrap();
  const adminRole = await getRoleBySlug('admin');
  if (!adminRole) return { ok: false, reason: 'admin_role_missing' };
  const adminEmail = normalizeEmail(process.env.TEACHER_ADMIN_EMAIL);
  if (!adminEmail) return { ok: false, reason: 'admin_email_not_configured' };
  const teacher = await queryOne(
    "SELECT id, email FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [adminEmail],
  );
  if (!teacher) return { ok: false, reason: 'admin_teacher_not_found' };
  const role = await getPrimaryRoleForUser('teacher', teacher.id);
  if (role?.slug === 'admin') return { ok: true, teacherId: teacher.id, email: teacher.email };
  return { ok: false, reason: 'admin_role_not_assigned', candidates: [teacher.email] };
}

module.exports = {
  PERMISSIONS,
  ROLE_PERMISSION_MATRIX,
  ensureRbacBootstrap,
  ensureDefaultAssignments,
  buildAuthzPayload,
  buildAuthzPayloadFromRole,
  buildAuthzPayloadForRoleSlug,
  computeNativePrivilegedRole,
  consumePendingAutoProfilePromotion,
  getPrimaryRoleForUser,
  getRoleBySlug,
  getRolePermissions,
  setPrimaryRole,
  resetRbacBootstrapForTests,
  repairSystemN3beurParticipationDefaults,
  checkCriticalAdminAccount,
  resolveStudentRoleSlugFromValidatedCount,
  countValidatedAssignmentsForStudent,
  getStudentProgressionConfig,
  syncStudentPrimaryRoleFromProgress,
  syncProgressionForValidatedTask,
  isStudentProgressionTierSlug,
  isStudentProgressionLadderRole,
  N3BOSS_ROLE_RANK,
};
