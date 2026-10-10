'use strict';

/**
 * Profil par défaut d'un groupe : qui peut le régler, et avec quel profil.
 *
 * Règle d'établissement (docs/reference/foretmap/comptes-roles-et-groupes.md, « Les groupes ») :
 *   - seuls l'administrateur et le n3boss (vue globale, rang ≥ 400) règlent le profil par défaut
 *     ou l'imposition d'un groupe ; un prof de classe gère les membres, pas les profils ;
 *   - un groupe ne confère qu'un **profil élève** (`isGroupConferrableRole`) : `visiteur` ou un
 *     palier n3beur (`eleve_*`, profil sur mesure de rang < 400 sans `teacher.access`). Ni
 *     l'encadrement (`admin`, `prof`, `prof_classe`), ni `personnel`, ni les profils du jeu
 *     (`gl_*`). Refus à l'écriture (400, administrateur compris) **et** garde à l'application :
 *     un profil par défaut non élève déjà en base n'est conféré à personne
 *     (`lib/effectiveRole.js`), quelle que soit la voie (rattachement, code de classe,
 *     synchronisation, recalcul) ;
 *   - hors administrateur, on ne pose sur un groupe qu'un profil de rang **strictement
 *     inférieur** au sien (`lib/rankGuard.js`) — même règle que l'attribution directe ;
 *   - rattacher un compte à un groupe revient à lui faire conférer ce profil : hors
 *     administrateur, le rattachement (unitaire, en lot, par la liste des membres, à la
 *     création ou à la duplication d'un compte, à l'import) et la génération d'un code de
 *     classe suivent la même garde de rang (`checkGroupJoinAllowed`).
 *
 * Partagé par `routes/groups.js` (formulaire), `lib/groupImport.js` (fichier) et la
 * synchronisation Moodle (politiques, réservées à l'administrateur).
 */

const { queryOne } = require('../database');
const {
  hasGlobalScopeByRole,
  isGlRoleSlug,
  isStudentProfileRole,
  normalizeRoleSlug,
} = require('./shared/n3beurRolesCore');
const { canGrantRank } = require('./rankGuard');

/**
 * Expression SQL (alias `r` sur `roles`) : 1 si le profil ouvre l'interface n3boss. Un profil
 * sur mesure de rang élève qui porte `teacher.access` n'est pas un profil élève.
 */
const ROLE_OPENS_TEACHER_ACCESS_SQL =
  "EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_key = 'teacher.access')";

/**
 * Vrai si un groupe peut conférer ce profil : profil élève (`isStudentProfileRole`, noyau
 * partagé) qui n'ouvre pas l'interface n3boss. `opens_teacher_access` (colonne
 * `ROLE_OPENS_TEACHER_ACCESS_SQL`) ou `permissions` (liste de clés ou `{ key }`) en décident ;
 * sans l'une ni l'autre, seul le slug et le rang comptent.
 * @param {{ slug?: string, rank?: number, opens_teacher_access?: number|boolean,
 *   permissions?: Array<string|{ key: string }> }|null} role
 */
function isGroupConferrableRole(role) {
  if (!role || isGlRoleSlug(role.slug) || !isStudentProfileRole(role)) return false;
  if (Number(role.opens_teacher_access) === 1 || role.opens_teacher_access === true) return false;
  const permissions = Array.isArray(role.permissions) ? role.permissions : [];
  return !permissions.some((p) => (typeof p === 'string' ? p : p?.key) === 'teacher.access');
}

const NOT_STUDENT_PROFILE_ERROR =
  'Un groupe ne peut conférer qu’un profil élève (visiteur ou palier n3beur), jamais un profil d’encadrement ou de personnel';

/** Vrai si l'acteur peut régler le profil par défaut / l'imposition d'un groupe. */
function canManageGroupDefaultRole(auth) {
  return hasGlobalScopeByRole({ slug: auth?.roleSlug, rank: auth?.roleRank });
}

/**
 * Valide un profil par défaut demandé pour un groupe.
 * @param {object|null} auth acteur (`null` = système, sans garde de rang)
 * @param {number|string|null} roleRef identifiant numérique **ou** slug du profil
 * @returns {Promise<{ ok: true, roleId: number|null, role: object|null }
 *   | { ok: false, status: number, error: string }>}
 */
async function validateGroupDefaultRole(auth, roleRef) {
  if (roleRef == null || roleRef === '') return { ok: true, roleId: null, role: null };
  const numeric = Number(roleRef);
  const fields = `r.id, r.slug, r.display_name, r.\`rank\`, ${ROLE_OPENS_TEACHER_ACCESS_SQL} AS opens_teacher_access`;
  const role =
    Number.isFinite(numeric) && numeric > 0
      ? await queryOne(`SELECT ${fields} FROM roles r WHERE r.id = ? LIMIT 1`, [numeric])
      : await queryOne(
          `SELECT ${fields} FROM roles r WHERE r.slug = ? OR LOWER(r.display_name) = ? LIMIT 1`,
          [normalizeRoleSlug(roleRef), String(roleRef).trim().toLowerCase()],
        );
  if (!role) return { ok: false, status: 400, error: 'default_role_id invalide' };
  if (isGlRoleSlug(role.slug)) {
    return {
      ok: false,
      status: 400,
      error: 'Les profils Gnomes & Licornes ne peuvent pas être conférés par un groupe',
    };
  }
  // Valeur hors de la famille autorisée : refusée pour tout le monde, administrateur et
  // système compris (formulaire, import de groupes, classe G&L miroir).
  if (!isGroupConferrableRole(role)) {
    return { ok: false, status: 400, error: NOT_STUDENT_PROFILE_ERROR };
  }
  if (auth) {
    if (!canManageGroupDefaultRole(auth)) {
      return {
        ok: false,
        status: 403,
        error: 'Seuls un administrateur ou un n3boss règlent le profil par défaut d’un groupe',
      };
    }
    if (!canGrantRank(auth, role.rank)) {
      return {
        ok: false,
        status: 403,
        error: 'Un groupe ne peut conférer qu’un profil de rang inférieur au vôtre',
      };
    }
  }
  return { ok: true, roleId: Number(role.id), role };
}

const GROUP_JOIN_REFUSED_ERROR =
  'Le profil par défaut de ce groupe est de rang égal ou supérieur au vôtre : rattachement réservé à un profil plus élevé';

/**
 * Garde de rang d'un rattachement à un groupe (ou de la génération de son code de classe) :
 * hors administrateur, refus si le profil par défaut du groupe est de rang égal ou supérieur à
 * celui de l'acteur. Sans profil par défaut, rien à conférer : toujours permis.
 * @param {object|null} actor `req.auth` (`null` = système)
 * @param {{ default_role_rank?: number|null }|null} group ligne `groups` enrichie du rang
 * @returns {{ ok: true }|{ ok: false, status: number, error: string }}
 */
function checkGroupJoinAllowed(actor, group) {
  if (!actor || group?.default_role_rank == null) return { ok: true };
  if (canGrantRank(actor, group.default_role_rank)) return { ok: true };
  return { ok: false, status: 403, error: GROUP_JOIN_REFUSED_ERROR };
}

/** Groupe et rang de son profil par défaut (`null` si le groupe n'existe pas). */
async function loadGroupWithDefaultRole(groupId) {
  return queryOne(
    `SELECT g.id, g.name, g.is_active, g.default_role_id, g.force_default_role,
            r.slug AS default_role_slug, r.\`rank\` AS default_role_rank
       FROM \`groups\` g
       LEFT JOIN roles r ON r.id = g.default_role_id
      WHERE g.id = ?
      LIMIT 1`,
    [String(groupId || '').trim()],
  );
}

/**
 * `checkGroupJoinAllowed` à partir d'un identifiant : 404 si le groupe n'existe pas.
 * @returns {Promise<{ ok: true, group: object }|{ ok: false, status: number, error: string }>}
 */
async function checkGroupJoinAllowedById(actor, groupId) {
  const group = await loadGroupWithDefaultRole(groupId);
  if (!group) return { ok: false, status: 404, error: 'Groupe introuvable' };
  const allowed = checkGroupJoinAllowed(actor, group);
  return allowed.ok ? { ok: true, group } : allowed;
}

module.exports = {
  ROLE_OPENS_TEACHER_ACCESS_SQL,
  isGroupConferrableRole,
  canManageGroupDefaultRole,
  validateGroupDefaultRole,
  checkGroupJoinAllowed,
  checkGroupJoinAllowedById,
  loadGroupWithDefaultRole,
};
