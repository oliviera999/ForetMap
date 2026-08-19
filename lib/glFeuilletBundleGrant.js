'use strict';

/**
 * Liasses remises en bloc — ouverture et clôture.
 *
 * Certains feuillets ne récompensent pas l'exploration : ils **encadrent** le voyage.
 *
 *  - **Ouverture** — ils posent la situation (la boîte confiée à la classe, le pacte du
 *    seuil, ce que voit un gnome, ce que garde une licorne). Les faire mériter n'a pas de
 *    sens : sans eux la partie commence sans contexte. Donnés à chaque équipe **au
 *    démarrage**, quel que soit le chapitre.
 *  - **Clôture** — la liasse du copiste : sa préface, ses marginalia, ses trois actes, et
 *    surtout les deux pages qui expliquent que le carnet de Sélène s'arrête sur un mot
 *    suspendu, délibérément. Livrées trop tôt elles dévoilent la fin ; jamais livrées,
 *    elles laissent croire à un feuillet manquant. Remises **à la fin du voyage**.
 *
 * Dans les deux cas : sans QCM, sans coût en gemmes, sans effacement — un feuillet remis
 * arrive entier. Le marquage est **dans la donnée** (`offert_ouverture`, `offert_cloture`),
 * pas dans le code : le MJ compose ses liasses depuis l'admin, sans livraison.
 *
 * Idempotent : un feuillet déjà trouvé par l'équipe n'est jamais réattribué.
 */

const { FEUILLET_SELECT, upsertFeuilletState } = require('./glLoreFeuillets');
const { recordFeuilletEvent } = require('./glLoreFeuilletEvents');

/** Liasses connues : colonne de marquage ↔ provenance inscrite dans l'état du feuillet. */
const FEUILLET_BUNDLES = Object.freeze({
  ouverture: { column: 'offert_ouverture', via: 'ouverture' },
  cloture: { column: 'offert_cloture', via: 'cloture' },
});

function resolveBundle(name) {
  const bundle = FEUILLET_BUNDLES[String(name || '').trim()];
  if (!bundle) throw new Error(`Liasse inconnue : ${name}`);
  return bundle;
}

/** Feuillets actifs d'une liasse, dans l'ordre du récit. */
async function loadBundleFeuillets(deps, bundleName) {
  const { column } = resolveBundle(bundleName);
  return deps.queryAll(
    `SELECT ${FEUILLET_SELECT}
       FROM gl_lore_feuillets f
      WHERE f.statut = 'actif' AND f.${column} = 1
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
 * Remet à une équipe les feuillets d'une liasse qui lui manquent.
 * @returns {Promise<string[]>} codes réellement attribués (vide si rien à faire)
 */
async function grantFeuilletBundleToTeam(
  deps,
  { gameId, teamId, bundle = 'ouverture', actorType = 'mj', actorId },
) {
  const { via } = resolveBundle(bundle);
  const feuillets = await loadBundleFeuillets(deps, bundle);
  if (!feuillets.length) return [];
  const found = await loadTeamFoundCodes(deps, gameId, teamId);
  const granted = [];

  for (const feuillet of feuillets) {
    const code = String(feuillet.feuillet_code);
    if (found.has(code)) continue;
    // Pas d'effet de vitalité ni d'effacement : un feuillet remis arrive entier.
    await upsertFeuilletState(deps, {
      gameId,
      teamId,
      feuilletCode: code,
      status: 'discovered',
      effacementPct: 0,
      unlockedVia: via,
      discoveredSource: via,
    });
    await recordFeuilletEvent(
      gameId,
      teamId,
      actorType,
      actorId != null ? String(actorId) : null,
      'feuillet_discovered',
      { feuilletCode: code, titre: feuillet.titre, effacementPct: 0, source: via },
    );
    granted.push(code);
  }
  return granted;
}

/**
 * Remet une liasse à **toutes** les équipes d'une partie.
 * Sans équipe, ne fait rien (celles créées ensuite reçoivent leur lot à la création).
 * @returns {Promise<{teams: number, granted: number}>}
 */
async function grantFeuilletBundleForGame(
  deps,
  { gameId, bundle = 'ouverture', actorType = 'mj', actorId },
) {
  const teams = await deps.queryAll('SELECT id FROM gl_teams WHERE game_id = ?', [gameId]);
  let granted = 0;
  for (const team of teams) {
    const codes = await grantFeuilletBundleToTeam(deps, {
      gameId,
      teamId: Number(team.id),
      bundle,
      actorType,
      actorId,
    });
    granted += codes.length;
  }
  return { teams: teams.length, granted };
}

/** Raccourci : liasse d'ouverture pour une équipe (démarrage, équipe créée ensuite). */
function grantStartingFeuilletsToTeam(deps, options) {
  return grantFeuilletBundleToTeam(deps, { ...options, bundle: 'ouverture' });
}

/** Raccourci : liasse d'ouverture pour toute la partie (passage en cours). */
function grantStartingFeuilletsForGame(deps, options) {
  return grantFeuilletBundleForGame(deps, { ...options, bundle: 'ouverture' });
}

/** Raccourci : liasse du copiste pour toute la partie (fin du voyage). */
function grantClosingFeuilletsForGame(deps, options) {
  return grantFeuilletBundleForGame(deps, { ...options, bundle: 'cloture' });
}

module.exports = {
  FEUILLET_BUNDLES,
  loadBundleFeuillets,
  grantFeuilletBundleToTeam,
  grantFeuilletBundleForGame,
  grantStartingFeuilletsToTeam,
  grantStartingFeuilletsForGame,
  grantClosingFeuilletsForGame,
};
