'use strict';

/**
 * Adaptateur Gnomes & Licornes de l'intégration Moodle (audit du 25/09/2026, § 3.1 ; décision
 * Q18 du mainteneur).
 *
 * La synchronisation Moodle alimente, en plus des groupes et comptes ForetMap, une **cible
 * optionnelle** : les classes et joueurs G&L (politique `gl_class`), et le miroir des équipes
 * d'une partie vers les groupes de cours Moodle. Ces accès étaient écrits en SQL direct sur les
 * tables `gl_*` dans cinq fichiers de `lib/moodle/` ; ils sont regroupés ici, derrière des
 * fonctions nommées. **Seul ce fichier de `lib/moodle/` lit ou écrit une table `gl_*` ou importe
 * du code GL** (`lib/glSettings`, `lib/glVitality`, `lib/glIdentityReconcile`) — sans le modifier.
 *
 * Pourquoi un module de fonctions et pas « un objet par produit » comme le verrouillage
 * (`lib/pedago/gatingProducts.js`) : ici GL n'est pas une variante d'un même contrat, c'est une
 * cible en aval, sans équivalent ForetMap. Le patron utile est donc un **port** (dépôt côté GL),
 * pas un polymorphisme. Restent volontairement dans le code Moodle : la colonne
 * `external_groups.gl_class_id` (table d'identité Moodle), la clé de politique `gl_class` et
 * les types d'action journalisés `gl_class.ensure`, `gl_player.ensure`, `gl_player.move` —
 * des valeurs stockées (`app_settings`, `sync_actions`) qu'on ne renomme pas.
 *
 * Aucun changement de comportement (piste B) : chaque requête est reprise à l'identique, dans
 * le même ordre, sur le même exécuteur (`db` : connexion de la transaction de la cohorte, ou
 * pool). Caractérisation : tests/moodle-gl-characterization.test.js,
 * tests/moodle-sync-apply.test.js, tests/moodle-teams-mirror.test.js.
 */

const crypto = require('node:crypto');
const database = require('../../database');
const { sanitizePseudoBase } = require('../shared/pseudo');
// Gnomes & Licornes — seuls points d'entrée de lib/moodle vers le module GL.
const { getGameplaySettings } = require('../glSettings');
const { getDefaultVitalityFromSettings } = require('../glVitality');

// ---------------------------------------------------------------------------------------------
// État local lu par le plan (`localState.js`)
// ---------------------------------------------------------------------------------------------

/**
 * Joueurs G&L liés à un compte : classe courante, et présence dans une partie non terminée
 * (I-10 : une partie en cours n'est pas touchée).
 */
async function loadLinkedPlayers() {
  return database.queryAll(
    `SELECT p.id, p.class_id, p.linked_foretmap_user_id, p.is_active,
            EXISTS (
              SELECT 1 FROM gl_team_members tm
              INNER JOIN gl_games g ON g.id = tm.game_id
              WHERE tm.player_id = p.id AND g.status IN ('live', 'paused')
            ) AS in_live_game
       FROM gl_players p
      WHERE p.linked_foretmap_user_id IS NOT NULL`,
  );
}

/** Toutes les classes G&L (identifiant, nom, groupe ForetMap lié, activité). */
async function loadClasses() {
  return database.queryAll('SELECT id, name, foretmap_group_id, is_active FROM gl_classes');
}

// ---------------------------------------------------------------------------------------------
// Application du plan (`apply.js`) — toujours dans la transaction de la cohorte (`db` = tx)
// ---------------------------------------------------------------------------------------------

/** Points de vie et de pouvoir d'un joueur créé (réglages de jeu, défauts si illisibles). */
async function loadDefaultVitality() {
  return getDefaultVitalityFromSettings(await getGameplaySettings().catch(() => ({})));
}

/** Pseudo de joueur libre (insensible à la casse), dérivé de `base`. */
async function uniquePlayerPseudo(db, base) {
  const root = sanitizePseudoBase(base, 100).toLowerCase() || 'joueur';
  let candidate = root;
  for (let i = 0; i < 50; i += 1) {
    const row = await db.queryOne(
      'SELECT id FROM gl_players WHERE LOWER(pseudo) = LOWER(?) LIMIT 1',
      [candidate],
    );
    if (!row) return candidate;
    candidate = `${root}-${i + 2}`;
  }
  return `${root}-${crypto.randomBytes(2).toString('hex')}`;
}

/** Réactive une classe désactivée (annulation antérieure, désactivation manuelle). */
async function reactivateClass(db, classId) {
  await db.execute('UPDATE gl_classes SET is_active = 1, updated_at = NOW() WHERE id = ?', [
    classId,
  ]);
}

/** Crée une classe rattachée au groupe ForetMap de la cohorte ; renvoie son identifiant. */
async function createClass(db, { name, groupId }) {
  const result = await db.execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, foretmap_group_id, created_at, updated_at)
     VALUES (?, NULL, NULL, 1, ?, NOW(), NOW())`,
    [String(name).slice(0, 180), groupId],
  );
  return Number(result.insertId);
}

/** Joueur déjà lié à ce compte (idempotence entre le plan et l'application). */
async function findPlayerByUserId(db, userId) {
  return db.queryOne(
    'SELECT id, class_id FROM gl_players WHERE linked_foretmap_user_id = ? LIMIT 1',
    [userId],
  );
}

/** Crée le joueur lié au compte, sans équipe ; renvoie son identifiant. */
async function createPlayer(db, { classId, firstName, lastName, pseudo, userId, vitality }) {
  const result = await db.execute(
    `INSERT INTO gl_players
       (class_id, team_id, first_name, last_name, pseudo, linked_foretmap_user_id, is_active, health_points, power_points, created_at, updated_at)
     VALUES (?, NULL, ?, ?, ?, ?, 1, ?, ?, NOW(), NOW())`,
    [Number(classId), firstName, lastName, pseudo, userId, vitality.health, vitality.power],
  );
  return Number(result.insertId);
}

/** Classe et équipe courantes d'un joueur. */
async function findPlayer(db, playerId) {
  return db.queryOne('SELECT id, class_id, team_id FROM gl_players WHERE id = ? LIMIT 1', [
    Number(playerId),
  ]);
}

/** Change le joueur de classe ; il quitte son équipe. */
async function movePlayer(db, playerId, classId) {
  await db.execute(
    'UPDATE gl_players SET class_id = ?, team_id = NULL, updated_at = NOW() WHERE id = ?',
    [Number(classId), Number(playerId)],
  );
}

// ---------------------------------------------------------------------------------------------
// Annulation d'une exécution (`undo.js`) — dans la transaction de l'annulation (`db` = tx)
// ---------------------------------------------------------------------------------------------

/** Classe liée à un groupe ForetMap (un groupe lié à une classe n'est pas supprimé). */
async function findClassByGroupId(db, groupId) {
  return db.queryOne('SELECT id FROM gl_classes WHERE foretmap_group_id = ? LIMIT 1', [groupId]);
}

async function deactivateClass(db, classId) {
  await db.execute('UPDATE gl_classes SET is_active = 0, updated_at = NOW() WHERE id = ?', [
    classId,
  ]);
}

/** Nombre de joueurs de la classe (0 → la classe peut être supprimée). */
async function countClassPlayers(db, classId) {
  const row = await db.queryOne('SELECT COUNT(*) AS c FROM gl_players WHERE class_id = ?', [
    classId,
  ]);
  return Number(row?.c || 0);
}

async function deleteClass(db, classId) {
  await db.execute('DELETE FROM gl_classes WHERE id = ?', [classId]);
}

/**
 * Retire un joueur créé par la synchronisation. S'il porte déjà des contributions de jeu
 * (clé étrangère RESTRICT), il est désactivé au lieu d'être supprimé.
 */
async function removePlayer(db, playerId) {
  try {
    await db.execute('DELETE FROM gl_players WHERE id = ?', [playerId]);
  } catch (error) {
    if (error?.errno === 1451 || error?.code === 'ER_ROW_IS_REFERENCED_2') {
      await db.execute('UPDATE gl_players SET is_active = 0, updated_at = NOW() WHERE id = ?', [
        playerId,
      ]);
    } else {
      throw error;
    }
  }
}

/** Replace un joueur dans sa classe et son équipe d'avant le déplacement. */
async function restorePlayerPlacement(db, playerId, { classId, teamId }) {
  await db.execute(
    'UPDATE gl_players SET class_id = ?, team_id = ?, updated_at = NOW() WHERE id = ?',
    [Number(classId), teamId == null ? null : Number(teamId), Number(playerId)],
  );
}

// ---------------------------------------------------------------------------------------------
// Miroir des équipes d'une partie (`teamsMirror.js`) — lectures sur le pool
// ---------------------------------------------------------------------------------------------

/** `idnumber` de la cohorte Moodle liée à la classe (via son groupe ForetMap), ou `null`. */
async function cohortIdnumberForClass(classId) {
  const row = await database.queryOne(
    `SELECT eg.external_idnumber
       FROM gl_classes gc
       INNER JOIN external_groups eg
         ON eg.group_id = gc.foretmap_group_id AND eg.provider = 'moodle'
      WHERE gc.id = ? LIMIT 1`,
    [classId],
  );
  return row?.external_idnumber ? String(row.external_idnumber) : null;
}

async function findGame(gameId) {
  return database.queryOne(
    `SELECT g.id, g.status, g.class_id, g.chapter_id, g.name
       FROM gl_games g WHERE g.id = ? LIMIT 1`,
    [gameId],
  );
}

async function listGameTeams(gameId) {
  return database.queryAll(
    'SELECT id, name, type FROM gl_teams WHERE game_id = ? ORDER BY id ASC',
    [gameId],
  );
}

/** Membres des équipes d'une partie, avec le compte ForetMap lié à chaque joueur. */
async function listGameTeamMembers(gameId) {
  return database.queryAll(
    `SELECT tm.team_id, tm.player_id, p.linked_foretmap_user_id AS user_id, p.pseudo
       FROM gl_team_members tm
       INNER JOIN gl_players p ON p.id = tm.player_id
      WHERE tm.game_id = ?`,
    [gameId],
  );
}

/** Parties des classes liées à ces cohortes, de la plus récemment modifiée à la plus ancienne. */
async function listGamesForCohorts(cohortIdnumbers) {
  const placeholders = cohortIdnumbers.map(() => '?').join(', ');
  return database.queryAll(
    `SELECT g.id FROM gl_games g
       INNER JOIN gl_classes gc ON gc.id = g.class_id
       INNER JOIN external_groups eg
         ON eg.group_id = gc.foretmap_group_id AND eg.provider = 'moodle'
      WHERE eg.external_idnumber IN (${placeholders})
      ORDER BY g.updated_at DESC`,
    cohortIdnumbers,
  );
}

async function findGameClass(gameId) {
  return database.queryOne('SELECT id, class_id FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
}

// ---------------------------------------------------------------------------------------------
// Contrôles après synchronisation (`syncRun.js`)
// ---------------------------------------------------------------------------------------------

/**
 * Rapport d'identités G&L. `require` paresseux, comme avant l'extraction : le module GL tire
 * la suppression des comptes, que la synchronisation n'a pas à charger au démarrage.
 */
async function buildIdentityReport() {
  const { buildGlIdentityReport } = require('../glIdentityReconcile');
  return buildGlIdentityReport();
}

module.exports = {
  loadLinkedPlayers,
  loadClasses,
  loadDefaultVitality,
  uniquePlayerPseudo,
  reactivateClass,
  createClass,
  findPlayerByUserId,
  createPlayer,
  findPlayer,
  movePlayer,
  findClassByGroupId,
  deactivateClass,
  countClassPlayers,
  deleteClass,
  removePlayer,
  restorePlayerPlacement,
  cohortIdnumberForClass,
  findGame,
  listGameTeams,
  listGameTeamMembers,
  listGamesForCohorts,
  findGameClass,
  buildIdentityReport,
};
