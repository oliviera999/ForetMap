'use strict';

/**
 * « Tenir à deux », lot 2 — présences confirmées par équipe (`gl_game_round_presences`,
 * migration 350).
 *
 * En `hybride` et sur `tablette`, chaque équipe dit au début du tour s'il manque quelqu'un
 * (« Il manque quelqu'un ? » : on touche les absents, puis « C'est bon »). Tant que ce n'est pas
 * fait, la création d'un pot de sort est refusée (409 `PRESENCE_A_CONFIRMER`) : un absent ne
 * paie jamais par oubli. Le prof confirme ou corrige à tout moment ; enregistrer les absences
 * depuis la console confirme toutes les équipes. Au tableau, rien ne change.
 *
 * Les absents restent dans `gl_game_round_absences` (lus par `listPresentMembers` et par les
 * mesures de badges « en sa présence »). Une demande `presence_a_confirmer` par équipe attend
 * dans la file du prof ; elle se ferme à la confirmation, et d'office à la sortie de la phase
 * `jeu` (garde-fou 11 : aucun état d'attente sans sortie).
 */

const { insertGameEvent } = require('./glGameEvents');
const { creerDemandeTx, resoudreDemandeTx } = require('./glDemandes');

const PHASES_DE_PRESENCE = Object.freeze(['ouverture', 'jeu']);

function fail(code, status) {
  const err = new Error(code);
  err.status = status;
  return err;
}

/** La présence se confirme-t-elle sur cette surface ? (jamais au tableau) */
function presenceRequise(surface) {
  return surface === 'hybride' || surface === 'tablette';
}

function refDemande(roundNumber, teamId) {
  return `presence-${Number(roundNumber)}-${Number(teamId)}`;
}

async function loadPresences(db, gameId, roundNumber) {
  if (!(Number(roundNumber) > 0)) return [];
  const rows = await db.queryAll(
    `SELECT team_id, confirmed_at, confirmed_by_type FROM gl_game_round_presences
      WHERE game_id = ? AND round_number = ?`,
    [gameId, roundNumber],
  );
  return rows.map((r) => ({
    teamId: Number(r.team_id),
    confirmedAt: r.confirmed_at,
    confirmedByType: String(r.confirmed_by_type || ''),
  }));
}

async function isPresenceConfirmee(db, gameId, roundNumber, teamId) {
  const row = await db.queryOne(
    `SELECT 1 AS ok FROM gl_game_round_presences
      WHERE game_id = ? AND round_number = ? AND team_id = ? LIMIT 1`,
    [gameId, roundNumber, teamId],
  );
  return !!row;
}

async function membresDe(db, gameId, teamId) {
  const rows = await db.queryAll(
    'SELECT player_id FROM gl_team_members WHERE game_id = ? AND team_id = ?',
    [gameId, teamId],
  );
  return rows.map((r) => Number(r.player_id));
}

/** Absents du tour parmi les membres d'une équipe. */
async function absentsDeLEquipe(db, gameId, roundNumber, teamId) {
  const rows = await db.queryAll(
    `SELECT a.player_id FROM gl_game_round_absences a
       INNER JOIN gl_team_members m ON m.game_id = a.game_id AND m.player_id = a.player_id
      WHERE a.game_id = ? AND a.round_number = ? AND m.team_id = ?
      ORDER BY a.player_id ASC`,
    [gameId, roundNumber, teamId],
  );
  return rows.map((r) => Number(r.player_id));
}

async function marquerConfirmeeTx(tx, { gameId, roundNumber, teamId, actorType, actorId }) {
  await tx.execute(
    `INSERT INTO gl_game_round_presences
       (game_id, round_number, team_id, confirmed_at, confirmed_by_type, confirmed_by_id)
     VALUES (?, ?, ?, NOW(), ?, ?)
     ON DUPLICATE KEY UPDATE confirmed_at = NOW(), confirmed_by_type = VALUES(confirmed_by_type),
       confirmed_by_id = VALUES(confirmed_by_id)`,
    [gameId, roundNumber, teamId, String(actorType), actorId != null ? String(actorId) : null],
  );
  await resoudreDemandeTx(tx, {
    gameId,
    kind: 'presence_a_confirmer',
    refId: refDemande(roundNumber, teamId),
  });
}

/**
 * Ouverture du tour : une demande « présence à confirmer » par équipe (hybride, tablette).
 * Aucune donnée d'élève dans la demande.
 */
async function ouvrirPresencesTx(tx, { gameId, roundNumber, teamIds, surface }) {
  if (!presenceRequise(surface)) return 0;
  for (const teamId of teamIds || []) {
    await creerDemandeTx(tx, {
      gameId,
      roundNumber,
      teamId: Number(teamId),
      kind: 'presence_a_confirmer',
      refId: refDemande(roundNumber, teamId),
    });
  }
  return (teamIds || []).length;
}

/**
 * Une équipe (ou le prof pour elle) dit qui manque : les absences des membres de CETTE équipe
 * sont remplacées par la liste donnée, et la présence est confirmée.
 *
 * @throws 409 `AUCUN_TOUR`, 409 `PRESENCE_PHASE` (équipe hors des phases ouverture / jeu),
 *   400 `PRESENCE_ABSENT_INVALIDE` (un absent n'est pas membre de l'équipe)
 */
async function confirmerPresenceTx(
  tx,
  { gameId, roundNumber, teamId, absentPlayerIds = [], actorType, actorId, phase = null },
) {
  if (!(Number(roundNumber) > 0)) throw fail('AUCUN_TOUR', 409);
  if (actorType !== 'mj' && !PHASES_DE_PRESENCE.includes(String(phase || ''))) {
    throw fail('PRESENCE_PHASE', 409);
  }
  const membres = await membresDe(tx, gameId, teamId);
  const absents = [
    ...new Set((absentPlayerIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0)),
  ];
  if (absents.some((id) => !membres.includes(id))) throw fail('PRESENCE_ABSENT_INVALIDE', 400);
  if (membres.length) {
    await tx.execute(
      `DELETE FROM gl_game_round_absences
        WHERE game_id = ? AND round_number = ? AND player_id IN (${membres.map(() => '?').join(', ')})`,
      [gameId, roundNumber, ...membres],
    );
  }
  for (const playerId of absents) {
    await tx.execute(
      'INSERT IGNORE INTO gl_game_round_absences (game_id, round_number, player_id) VALUES (?, ?, ?)',
      [gameId, roundNumber, playerId],
    );
  }
  await marquerConfirmeeTx(tx, { gameId, roundNumber, teamId, actorType, actorId });
  const event = await insertGameEvent(tx, {
    gameId,
    teamId,
    actorType,
    actorId: String(actorId),
    eventType: 'presence_confirmee',
    // Identités des absents : prof seul (payload privé) ; le nombre reste public.
    payload: {
      roundNumber,
      teamId: Number(teamId),
      playerIds: absents,
      count: absents.length,
      private: true,
      publicKeys: ['roundNumber', 'teamId', 'count'],
    },
  });
  return { teamId: Number(teamId), absents, events: [event] };
}

/**
 * « Quelqu'un vient d'arriver » : le retardataire redevient présent (inclus dans le pot
 * suivant et dans les mesures de présence à partir de maintenant).
 * @throws 400 `PRESENCE_ABSENT_INVALIDE`, 409 `PRESENCE_PAS_ABSENT`
 */
async function arriveeRetardataireTx(
  tx,
  { gameId, roundNumber, teamId, playerId, actorType, actorId },
) {
  if (!(Number(roundNumber) > 0)) throw fail('AUCUN_TOUR', 409);
  const membres = await membresDe(tx, gameId, teamId);
  if (!membres.includes(Number(playerId))) throw fail('PRESENCE_ABSENT_INVALIDE', 400);
  const result = await tx.execute(
    'DELETE FROM gl_game_round_absences WHERE game_id = ? AND round_number = ? AND player_id = ?',
    [gameId, roundNumber, playerId],
  );
  if (!Number(result?.affectedRows)) throw fail('PRESENCE_PAS_ABSENT', 409);
  const event = await insertGameEvent(tx, {
    gameId,
    teamId,
    actorType,
    actorId: String(actorId),
    eventType: 'presence_arrivee',
    payload: {
      roundNumber,
      teamId: Number(teamId),
      playerId: Number(playerId),
      private: true,
      publicKeys: ['roundNumber', 'teamId'],
    },
  });
  return { teamId: Number(teamId), playerId: Number(playerId), events: [event] };
}

/** Le prof a enregistré les absences de la classe : toutes les équipes sont confirmées. */
async function confirmerToutesParLeProfTx(tx, { gameId, roundNumber, actorId }) {
  const teams = await tx.queryAll('SELECT id FROM gl_teams WHERE game_id = ?', [gameId]);
  for (const t of teams) {
    await marquerConfirmeeTx(tx, {
      gameId,
      roundNumber,
      teamId: Number(t.id),
      actorType: 'mj',
      actorId,
    });
  }
  return teams.length;
}

/**
 * Vue des présences du tour. `equipes` (public : confirmée ou non, aucun nom) ; `absents` par
 * équipe pour le prof ; pour un membre ou une tablette, les absents de SA seule équipe.
 */
async function buildPresencesView(
  db,
  { gameId, roundNumber, surface, phase, viewerTeamId, staff },
) {
  const requise =
    presenceRequise(surface) && Number(roundNumber) > 0 && PHASES_DE_PRESENCE.includes(phase);
  if (!(Number(roundNumber) > 0)) return { requise: false, equipes: [] };
  const confirmees = new Map(
    (await loadPresences(db, gameId, roundNumber)).map((p) => [p.teamId, p]),
  );
  const teams = await db.queryAll('SELECT id FROM gl_teams WHERE game_id = ? ORDER BY id ASC', [
    gameId,
  ]);
  const equipes = [];
  for (const t of teams) {
    const teamId = Number(t.id);
    const voitLesAbsents = staff || (viewerTeamId != null && Number(viewerTeamId) === teamId);
    equipes.push({
      teamId,
      confirmee: confirmees.has(teamId),
      ...(voitLesAbsents
        ? { absents: await absentsDeLEquipe(db, gameId, roundNumber, teamId) }
        : {}),
    });
  }
  return { requise, equipes };
}

module.exports = {
  PHASES_DE_PRESENCE,
  presenceRequise,
  loadPresences,
  isPresenceConfirmee,
  absentsDeLEquipe,
  ouvrirPresencesTx,
  confirmerPresenceTx,
  arriveeRetardataireTx,
  confirmerToutesParLeProfTx,
  buildPresencesView,
};
