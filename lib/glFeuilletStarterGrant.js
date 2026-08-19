'use strict';

/**
 * Feuillets d'ouverture — mise en situation.
 *
 * Certains feuillets ne récompensent pas l'exploration : ils **posent la
 * situation** (la boîte confiée à la classe, le pacte du seuil, ce que voit un
 * gnome, ce que garde une licorne). Les faire mériter n'a pas de sens : sans eux
 * la partie commence sans contexte. Ils sont donc **donnés** à chaque équipe au
 * démarrage de la partie, quel que soit le chapitre — sans QCM, sans coût en
 * gemmes, sans effet de vitalité.
 *
 * Le marquage est **dans la donnée** (`gl_lore_feuillets.offert_ouverture`), pas
 * dans le code : le MJ peut ajouter ou retirer un feuillet du lot d'ouverture
 * depuis l'admin (patch groupé) sans livraison.
 *
 * Idempotent : un feuillet déjà trouvé par l'équipe n'est jamais réattribué.
 */

const { FEUILLET_SELECT, upsertFeuilletState } = require('./glLoreFeuillets');
const { recordFeuilletEvent } = require('./glLoreFeuilletEvents');

const STARTER_SOURCE = 'ouverture';

/** Feuillets actifs marqués « offerts à l'ouverture », dans l'ordre du récit. */
async function loadStartingFeuillets(deps) {
  return deps.queryAll(
    `SELECT ${FEUILLET_SELECT}
       FROM gl_lore_feuillets f
      WHERE f.statut = 'actif' AND f.offert_ouverture = 1
      ORDER BY f.ordre_recit ASC, f.ordre_voyage ASC, f.feuillet_code ASC`,
  );
}

/** Codes déjà trouvés (découverts/lus/tenus/effacés) par l'équipe. */
async function loadTeamFoundCodes(deps, gameId, teamId) {
  const rows = await deps.queryAll(
    `SELECT feuillet_code FROM gl_game_feuillet_states
      WHERE game_id = ? AND team_id = ?
        AND (discovered_at IS NOT NULL OR status <> 'locked')`,
    [gameId, teamId],
  );
  return new Set(rows.map((r) => String(r.feuillet_code)));
}

/**
 * Attribue à une équipe les feuillets d'ouverture qui lui manquent.
 * @returns {Promise<string[]>} codes réellement attribués (vide si rien à faire)
 */
async function grantStartingFeuilletsToTeam(deps, { gameId, teamId, actorType = 'mj', actorId }) {
  const feuillets = await loadStartingFeuillets(deps);
  if (!feuillets.length) return [];
  const found = await loadTeamFoundCodes(deps, gameId, teamId);
  const granted = [];

  for (const feuillet of feuillets) {
    const code = String(feuillet.feuillet_code);
    if (found.has(code)) continue;
    // Pas d'effet de vitalité ni d'effacement : un feuillet offert arrive entier.
    await upsertFeuilletState(deps, {
      gameId,
      teamId,
      feuilletCode: code,
      status: 'discovered',
      effacementPct: 0,
      unlockedVia: STARTER_SOURCE,
      discoveredSource: STARTER_SOURCE,
    });
    await recordFeuilletEvent(
      gameId,
      teamId,
      actorType,
      actorId != null ? String(actorId) : null,
      'feuillet_discovered',
      {
        feuilletCode: code,
        titre: feuillet.titre,
        effacementPct: 0,
        source: STARTER_SOURCE,
      },
    );
    granted.push(code);
  }
  return granted;
}

/**
 * Attribue les feuillets d'ouverture à **toutes** les équipes d'une partie.
 * Appelé au démarrage ; sans équipe, ne fait rien (les équipes créées ensuite
 * reçoivent leur lot à la création).
 * @returns {Promise<{teams: number, granted: number}>}
 */
async function grantStartingFeuilletsForGame(deps, { gameId, actorType = 'mj', actorId }) {
  const teams = await deps.queryAll('SELECT id FROM gl_teams WHERE game_id = ?', [gameId]);
  let granted = 0;
  for (const team of teams) {
    const codes = await grantStartingFeuilletsToTeam(deps, {
      gameId,
      teamId: Number(team.id),
      actorType,
      actorId,
    });
    granted += codes.length;
  }
  return { teams: teams.length, granted };
}

module.exports = {
  STARTER_SOURCE,
  loadStartingFeuillets,
  grantStartingFeuilletsToTeam,
  grantStartingFeuilletsForGame,
};
