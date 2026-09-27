'use strict';

/**
 * Modèle de lecture des statistiques (piste B, étape B5 de l'audit du 25/09/2026,
 * `docs/AUDIT_ETAT_DES_LIEUX_2026-09-25.md` § 3.1).
 *
 * `routes/stats.js` lisait lui-même les tables de quatre domaines : identité (`users`), tâches
 * (`tasks`, `task_assignments`, `zones` pour le libellé), biodiversité
 * (`user_plant_observation_events`) et pédagogie (`user_tutorial_reads`). Ces lectures sont
 * regroupées ici, avec les agrégations pures qui en dérivent : **lectures seulement**, aucune
 * dépendance à Express. La synchronisation des paliers de progression — une écriture — reste
 * à l'appelant, tout comme les permissions et le périmètre (`lib/groupScope.js`).
 *
 * SQL et agrégations repris à l'identique de la route (instantanés :
 * `tests/stats-snapshot.test.js`).
 */

const { queryAll, queryOne } = require('../../database');

/** Compteurs d'assignations d'un élève sans aucune tâche. */
const EMPTY_ASSIGNMENT_COUNTS = Object.freeze({ total: 0, done: 0, pending: 0, submitted: 0 });

/**
 * Colonne de compteur d'un statut de tâche : `validated` → validées (`done`), `available` et
 * `in_progress` → en cours (`pending`), `done` → en attente de validation (`submitted`).
 * Les autres statuts (`proposed`, `on_hold`…) ne comptent que dans le total.
 * @returns {'done'|'pending'|'submitted'|null}
 */
function assignmentCounterForStatus(status) {
  if (status === 'validated') return 'done';
  if (status === 'available' || status === 'in_progress') return 'pending';
  if (status === 'done') return 'submitted';
  return null;
}

/** Compteurs `{ done, pending, submitted, total }` d'une liste d'assignations (`status` de la tâche). */
function summarizeAssignments(assignments) {
  const counts = { done: 0, pending: 0, submitted: 0, total: assignments.length };
  for (const a of assignments) {
    const counter = assignmentCounterForStatus(a.status);
    if (counter) counts[counter] += 1;
  }
  return counts;
}

/**
 * Agrège en UNE requête les compteurs d'assignments par élève et par statut
 * (remplace le « un SELECT task_assignments par élève » du tableau de bord prof).
 * Le matching id OU (prénom, nom) reste fait en SQL pour conserver la collation
 * _ci (casse/accents) du matching legacy par nom.
 * @param {{ all: boolean, studentIds: string[] }} scope périmètre résolu par `getScopedStudentIds`
 * @returns {Promise<Map<string, { total:number, done:number, pending:number, submitted:number }>>}
 */
async function fetchAssignmentStatusCountsByStudent(scope) {
  const where = ["u.user_type = 'student'"];
  const params = [];
  if (!scope.all) {
    if (!scope.studentIds.length) return new Map();
    where.push(`u.id IN (${scope.studentIds.map(() => '?').join(',')})`);
    params.push(...scope.studentIds);
  }
  const rows = await queryAll(
    `SELECT u.id AS student_id, t.status, COUNT(*) AS n
       FROM users u
       JOIN task_assignments ta
         ON ta.student_id = u.id
         OR (ta.student_first_name = u.first_name AND ta.student_last_name = u.last_name)
       JOIN tasks t ON t.id = ta.task_id
      WHERE ${where.join(' AND ')}
      GROUP BY u.id, t.status`,
    params,
  );
  const byStudent = new Map();
  for (const row of rows) {
    const key = String(row.student_id);
    if (!byStudent.has(key)) {
      byStudent.set(key, { total: 0, done: 0, pending: 0, submitted: 0 });
    }
    const agg = byStudent.get(key);
    const n = Number(row.n) || 0;
    agg.total += n;
    const counter = assignmentCounterForStatus(row.status);
    if (counter) agg[counter] += n;
  }
  return byStudent;
}

/** Agrégats biodiversité + tutoriels par user_id (clés chaîne). */
async function fetchEngagementByUserId() {
  const [plantRows, tutRows] = await Promise.all([
    queryAll(
      `SELECT user_id, COUNT(DISTINCT plant_id) AS species, COUNT(*) AS events
       FROM user_plant_observation_events GROUP BY user_id`,
    ),
    queryAll(
      `SELECT user_id, COUNT(*) AS tutorials_read FROM user_tutorial_reads GROUP BY user_id`,
    ),
  ]);
  const plantMap = new Map();
  for (const r of plantRows) {
    plantMap.set(String(r.user_id), {
      species: Number(r.species) || 0,
      events: Number(r.events) || 0,
    });
  }
  const tutMap = new Map();
  for (const r of tutRows) {
    tutMap.set(String(r.user_id), Number(r.tutorials_read) || 0);
  }
  return { plantMap, tutMap };
}

/** Engagement d'un compte, lu dans les agrégats de `fetchEngagementByUserId` (zéros par défaut). */
function engagementStatsForUser(userId, plantMap, tutMap) {
  const uid = String(userId);
  const p = plantMap.get(uid) || { species: 0, events: 0 };
  return {
    plant_species_observed: p.species,
    plant_observation_events: p.events,
    tutorials_read: tutMap.get(uid) || 0,
  };
}

/** Totaux site (distinct espèces observées, événements, lectures tutoriel). */
async function fetchSiteEngagementTotals() {
  const [plants, tutorials] = await Promise.all([
    queryOne(
      `SELECT COUNT(DISTINCT plant_id) AS plant_species_observed, COUNT(*) AS plant_observation_events
       FROM user_plant_observation_events`,
    ),
    queryOne(`SELECT COUNT(*) AS tutorials_read FROM user_tutorial_reads`),
  ]);
  return {
    plant_species_observed: Number(plants?.plant_species_observed) || 0,
    plant_observation_events: Number(plants?.plant_observation_events) || 0,
    tutorials_read: Number(tutorials?.tutorials_read) || 0,
  };
}

/** Engagement d'un seul compte (fiche individuelle). */
async function fetchUserEngagementStats(userId) {
  const uid = String(userId);
  const [plantRow, tutRow] = await Promise.all([
    queryOne(
      `SELECT COUNT(DISTINCT plant_id) AS species, COUNT(*) AS events
       FROM user_plant_observation_events WHERE user_id = ?`,
      [uid],
    ),
    queryOne(`SELECT COUNT(*) AS tutorials_read FROM user_tutorial_reads WHERE user_id = ?`, [uid]),
  ]);
  return {
    plant_species_observed: Number(plantRow?.species) || 0,
    plant_observation_events: Number(plantRow?.events) || 0,
    tutorials_read: Number(tutRow?.tutorials_read) || 0,
  };
}

/**
 * Compte présenté par la fiche de statistiques, ou `null`.
 * Projection explicite (audit § 2.4/§ 3.7) : champs consommés par la réponse et la requête des
 * assignations — jamais `password_hash`.
 */
async function getStatsUserRow(userId) {
  return queryOne(
    `SELECT id, user_type, first_name, last_name, display_name, email,
            pseudo, description, avatar_path, last_seen
       FROM users WHERE id = ? LIMIT 1`,
    [userId],
  );
}

/**
 * Assignations d'un élève (par identifiant OU par prénom + nom, rattachement historique), avec
 * le statut, le titre, l'échéance et la zone de la tâche — les plus récentes d'abord.
 * @param {{ id: string, first_name: string|null, last_name: string|null }} student
 */
async function listStudentTaskAssignments(student) {
  return queryAll(
    `SELECT ta.*, t.status, t.title, t.due_date, t.zone_id, z.name as zone_name
       FROM task_assignments ta
       JOIN tasks t ON ta.task_id = t.id
       LEFT JOIN zones z ON t.zone_id = z.id
       WHERE ta.student_id = ? OR (ta.student_first_name = ? AND ta.student_last_name = ?)
       ORDER BY ta.assigned_at DESC`,
    [student.id, student.first_name, student.last_name],
  );
}

/** Colonnes des élèves listés : tableau de bord (profil public) ou export CSV. */
const STUDENT_LIST_COLUMNS = Object.freeze({
  dashboard: 'id, first_name, last_name, pseudo, description, avatar_path, last_seen',
  export: 'id, first_name, last_name, last_seen',
});

/**
 * Élèves du périmètre (tous, ou la liste d'identifiants résolue), sans ordre imposé.
 * @param {{ all: boolean, studentIds: string[] }} scope
 * @param {'dashboard'|'export'} [projection]
 */
async function listScopedStudents(scope, projection = 'dashboard') {
  const columns = STUDENT_LIST_COLUMNS[projection] || STUDENT_LIST_COLUMNS.dashboard;
  if (scope.all) {
    return queryAll(`SELECT ${columns} FROM users WHERE user_type = 'student'`);
  }
  if (!scope.studentIds.length) return [];
  return queryAll(
    `SELECT ${columns}
       FROM users
      WHERE user_type = 'student'
        AND id IN (${scope.studentIds.map(() => '?').join(',')})`,
    scope.studentIds,
  );
}

module.exports = {
  EMPTY_ASSIGNMENT_COUNTS,
  assignmentCounterForStatus,
  summarizeAssignments,
  fetchAssignmentStatusCountsByStudent,
  fetchEngagementByUserId,
  engagementStatsForUser,
  fetchSiteEngagementTotals,
  fetchUserEngagementStats,
  getStatsUserRow,
  listStudentTaskAssignments,
  listScopedStudents,
};
