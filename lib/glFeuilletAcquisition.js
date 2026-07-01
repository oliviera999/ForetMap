'use strict';

/**
 * Socle d'acquisition des feuillets (stratégie ③).
 *
 * Principe : lorsqu'un joueur **consulte** un élément du site et **passe le QCM lié**
 * (gate assurée en amont par le flux d'acquittement `learning`), on lui attribue un
 * feuillet **du pool du chapitre**, **pour l'équipe**, en mémorisant **qui** l'a découvert.
 *
 * Choix de picking (data-driven, affinable via le corpus, sans toucher au code) :
 *   1. lien direct `lien_canal = <source>` + `lien_ref = <ref>` (feuillet dédié à cet élément) ;
 *   2. sinon, premier feuillet du **pool du chapitre** non encore trouvé par l'équipe.
 *
 * Pas de filet de clôture : l'exhaustivité n'est pas garantie (choix produit).
 */

const { withTransaction } = require('../database');
const { getGameplaySettings } = require('./glSettings');
const { FEUILLET_SELECT, formatFeuilletRow, upsertFeuilletState } = require('./glLoreFeuillets');
const { applyFeuilletVitalityEffects, computeEffacementPct } = require('./glLoreFeuilletEffects');
const {
  resolveLoreFeuilletRetrigger,
  resolveLoreBoolSetting,
} = require('./glLoreFeuilletRetrigger');
const { recordFeuilletEvent } = require('./glLoreFeuilletEvents');
const { resolveChapterFeuilletPool } = require('./glFeuilletChapterPool');

function resolveLoreSettings(gameRow, gameplaySettings) {
  return {
    retrigger: resolveLoreFeuilletRetrigger(gameRow, gameplaySettings),
    effacementEnabled: resolveLoreBoolSetting(
      gameRow,
      'lore_effacement_enabled',
      gameplaySettings,
      'loreEffacementEnabled',
      true,
    ),
    gemmeCostsEnabled: resolveLoreBoolSetting(
      gameRow,
      'lore_gemme_costs_enabled',
      gameplaySettings,
      'loreGemmeCostsEnabled',
      true,
    ),
    heartRewardsEnabled: resolveLoreBoolSetting(
      gameRow,
      'lore_heart_rewards_enabled',
      gameplaySettings,
      'loreHeartRewardsEnabled',
      true,
    ),
  };
}

/** Codes de feuillets déjà trouvés par l'équipe (découverts/lus/tenus/effacés). */
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
 * Choisit le feuillet à attribuer pour une consultation, ou `null` si rien de neuf.
 * @param {{queryOne:Function, queryAll:Function}} deps
 */
async function pickFeuilletForConsultation(deps, { gameId, teamId, chapterId, source, sourceRef }) {
  const found = await loadTeamFoundCodes(deps, gameId, teamId);

  // 1. Feuillet dédié à cet élément consultable (lien direct).
  if (source && sourceRef) {
    const linked = await deps.queryOne(
      `SELECT ${FEUILLET_SELECT}
         FROM gl_lore_feuillets f
        WHERE f.statut = 'actif' AND f.lien_canal = ? AND f.lien_ref = ?
        LIMIT 1`,
      [source, sourceRef],
    );
    if (linked && !found.has(String(linked.feuillet_code))) return linked;
  }

  // 2. Premier feuillet du pool du chapitre non encore trouvé.
  const pool = await resolveChapterFeuilletPool(deps, { chapterId });
  for (const row of pool) {
    if (!found.has(String(row.feuillet_code))) return row;
  }
  return null;
}

/**
 * Écrit la découverte d'un feuillet (effets vitalité + état + événement) avec attribution.
 * Chemin d'écriture unique, réutilisable par tous les canaux.
 */
async function commitFeuilletDiscovery(
  deps,
  { game, feuillet, gameId, teamId, playerId, playerName, source, isMj = false },
) {
  const gameplaySettings = await getGameplaySettings();
  const loreSettings = resolveLoreSettings(game, gameplaySettings);

  let effacementPct = 0;
  if (loreSettings.effacementEnabled) {
    const existing = await deps.queryOne(
      `SELECT effacement_pct FROM gl_game_feuillet_states
        WHERE game_id = ? AND team_id = ? AND feuillet_code = ? LIMIT 1`,
      [gameId, teamId, feuillet.feuillet_code],
    );
    effacementPct = computeEffacementPct(feuillet, existing?.effacement_pct || 0);
  }
  const status = effacementPct >= 100 ? 'effaced' : 'discovered';

  let vitalityPayload = null;
  await withTransaction(async (tx) => {
    vitalityPayload = await applyFeuilletVitalityEffects(tx, {
      gameId,
      teamId,
      feuillet,
      settings: gameplaySettings,
      loreSettings,
      actorId: String(playerId),
      reason: feuillet.titre || feuillet.feuillet_code,
    });
    await upsertFeuilletState(tx, {
      gameId,
      teamId,
      feuilletCode: feuillet.feuillet_code,
      status,
      effacementPct,
      unlockedVia: 'story',
      discoveredByPlayerId: playerId != null ? String(playerId) : null,
      discoveredByName: playerName || null,
      discoveredSource: source || null,
    });
  });

  await recordFeuilletEvent(
    gameId,
    teamId,
    isMj ? 'mj' : 'team',
    String(playerId),
    'feuillet_discovered',
    {
      feuilletCode: feuillet.feuillet_code,
      titre: feuillet.titre,
      effacementPct,
      source: source || null,
      discoveredBy: playerName || null,
      vitality: vitalityPayload,
    },
  );

  return formatFeuilletRow(feuillet, {
    isMj,
    progressStatus: status,
    effacementPct,
    discoveredBy: playerName || null,
    discoveredByPlayerId: playerId != null ? String(playerId) : null,
    discoveredSource: source || null,
  });
}

/**
 * Point d'entrée générique : tente d'attribuer un feuillet à l'équipe suite à la
 * consultation gatée d'un élément. Renvoie le feuillet formaté ou `null`.
 * @param {{queryOne:Function, queryAll:Function, execute:Function}} deps
 */
async function awardFeuilletFromConsultation(
  deps,
  { gameId, teamId, playerId, playerName, source, sourceRef, isMj = false },
) {
  const game = await deps.queryOne(
    `SELECT id, chapter_id, status, lore_feuillet_retrigger, lore_effacement_enabled,
            lore_gemme_costs_enabled, lore_heart_rewards_enabled
       FROM gl_games WHERE id = ? LIMIT 1`,
    [gameId],
  );
  if (!game || !game.chapter_id) return null;
  if (!['live', 'paused'].includes(String(game.status || '').toLowerCase())) return null;

  const feuillet = await pickFeuilletForConsultation(deps, {
    gameId,
    teamId,
    chapterId: game.chapter_id,
    source,
    sourceRef,
  });
  if (!feuillet) return null;

  return commitFeuilletDiscovery(deps, {
    game,
    feuillet,
    gameId,
    teamId,
    playerId,
    playerName,
    source,
    isMj,
  });
}

module.exports = {
  resolveLoreSettings,
  loadTeamFoundCodes,
  pickFeuilletForConsultation,
  commitFeuilletDiscovery,
  awardFeuilletFromConsultation,
};
