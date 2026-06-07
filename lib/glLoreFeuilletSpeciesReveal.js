'use strict';

const { withTransaction } = require('../database');
const { getGameplaySettings } = require('./glSettings');
const {
  FEUILLET_SELECT,
  formatFeuilletRow,
  upsertFeuilletState,
} = require('./glLoreFeuillets');
const {
  applyFeuilletVitalityEffects,
  computeEffacementPct,
} = require('./glLoreFeuilletEffects');
const { resolveLoreFeuilletRetrigger, resolveLoreBoolSetting } = require('./glLoreFeuilletRetrigger');
const { recordFeuilletEvent } = require('./glLoreFeuilletEvents');

const BIOME_TO_PAYS = Object.freeze({
  jungle_afc: 1,
  savane: 1,
  sahara: 2,
  foret_mediterraneenne: 2,
  foret_caducifoliee: 3,
  landes: 3,
  taiga: 4,
  desert_froid: 4,
  toundra: 5,
});

function biomeToPays(biomeSlug) {
  const slug = String(biomeSlug || '').trim().toLowerCase();
  if (!slug) return null;
  return BIOME_TO_PAYS[slug] ?? null;
}

function resolveLoreSettings(gameRow, gameplaySettings) {
  return {
    retrigger: resolveLoreFeuilletRetrigger(gameRow, gameplaySettings),
    effacementEnabled: resolveLoreBoolSetting(
      gameRow, 'lore_effacement_enabled', gameplaySettings, 'loreEffacementEnabled', true
    ),
    gemmeCostsEnabled: resolveLoreBoolSetting(
      gameRow, 'lore_gemme_costs_enabled', gameplaySettings, 'loreGemmeCostsEnabled', true
    ),
    heartRewardsEnabled: resolveLoreBoolSetting(
      gameRow, 'lore_heart_rewards_enabled', gameplaySettings, 'loreHeartRewardsEnabled', true
    ),
  };
}

async function isFeuilletRevealedForTeam(deps, gameId, teamId, feuilletCode) {
  const row = await deps.queryOne(
    `SELECT status, discovered_at
       FROM gl_game_feuillet_states
      WHERE game_id = ? AND team_id = ? AND feuillet_code = ?
      LIMIT 1`,
    [gameId, teamId, feuilletCode]
  );
  if (!row) return false;
  if (row.discovered_at) return true;
  return String(row.status || '') !== 'locked';
}

async function findSpeciesLinkedFeuillet(deps, gameId, teamId, speciesCode) {
  const row = await deps.queryOne(
    `SELECT ${FEUILLET_SELECT}
       FROM gl_lore_feuillets f
      WHERE f.statut = 'actif'
        AND f.lien_canal = 'espece'
        AND f.lien_ref = ?
      LIMIT 1`,
    [speciesCode]
  );
  if (!row) return null;
  const revealed = await isFeuilletRevealedForTeam(deps, gameId, teamId, row.feuillet_code);
  return revealed ? null : row;
}

async function findNextPaysFeuillet(deps, gameId, teamId, pays) {
  const rows = await deps.queryAll(
    `SELECT ${FEUILLET_SELECT}
       FROM gl_lore_feuillets f
      WHERE f.statut = 'actif'
        AND f.lien_canal = 'espece_pays'
        AND f.lien_pays = ?
        AND NOT EXISTS (
          SELECT 1 FROM gl_game_feuillet_states s
           WHERE s.game_id = ? AND s.team_id = ? AND s.feuillet_code = f.feuillet_code
             AND (s.discovered_at IS NOT NULL OR s.status <> 'locked')
        )
      ORDER BY f.lien_ordre_recit ASC, f.feuillet_code ASC
      LIMIT 1`,
    [pays, gameId, teamId]
  );
  return rows[0] || null;
}

async function pickFeuilletForSpeciesStudy(deps, { gameId, teamId, speciesCode, biomeSlug }) {
  const direct = await findSpeciesLinkedFeuillet(deps, gameId, teamId, speciesCode);
  if (direct) return direct;
  const pays = biomeToPays(biomeSlug);
  if (pays == null) return null;
  return findNextPaysFeuillet(deps, gameId, teamId, pays);
}

async function revealFeuilletForSpeciesStudy(deps, {
  gameId,
  teamId,
  speciesCode,
  biomeSlug,
  actorType,
  actorId,
  isMj = false,
}) {
  const feuillet = await pickFeuilletForSpeciesStudy(deps, {
    gameId,
    teamId,
    speciesCode,
    biomeSlug,
  });
  if (!feuillet) return null;

  const game = await deps.queryOne(
    `SELECT id, chapter_id, status, lore_feuillet_retrigger, lore_effacement_enabled,
            lore_gemme_costs_enabled, lore_heart_rewards_enabled
       FROM gl_games WHERE id = ? LIMIT 1`,
    [gameId]
  );
  if (!game) return null;

  const gameplaySettings = await getGameplaySettings();
  const loreSettings = resolveLoreSettings(game, gameplaySettings);

  let effacementPct = 0;
  if (loreSettings.effacementEnabled) {
    const existing = await deps.queryOne(
      `SELECT effacement_pct FROM gl_game_feuillet_states
        WHERE game_id = ? AND team_id = ? AND feuillet_code = ? LIMIT 1`,
      [gameId, teamId, feuillet.feuillet_code]
    );
    effacementPct = computeEffacementPct(feuillet, existing?.effacement_pct || 0);
  }

  let vitalityPayload = null;
  await withTransaction(async (tx) => {
    vitalityPayload = await applyFeuilletVitalityEffects(tx, {
      gameId,
      teamId,
      feuillet,
      settings: gameplaySettings,
      loreSettings,
      actorId: String(actorId),
      reason: feuillet.titre || feuillet.feuillet_code,
    });
    await upsertFeuilletState(tx, {
      gameId,
      teamId,
      feuilletCode: feuillet.feuillet_code,
      status: effacementPct >= 100 ? 'effaced' : 'discovered',
      effacementPct,
      unlockedVia: 'espece',
      kingdomZoneId: null,
    });
  });

  await recordFeuilletEvent(gameId, teamId, actorType, String(actorId), 'feuillet_discovered', {
    feuilletCode: feuillet.feuillet_code,
    titre: feuillet.titre,
    effacementPct,
    source: 'espece',
    speciesCode,
    vitality: vitalityPayload,
  });

  return formatFeuilletRow(feuillet, {
    isMj,
    progressStatus: effacementPct >= 100 ? 'effaced' : 'discovered',
    effacementPct,
  });
}

module.exports = {
  BIOME_TO_PAYS,
  biomeToPays,
  pickFeuilletForSpeciesStudy,
  revealFeuilletForSpeciesStudy,
};
