'use strict';

const { applyFeuilletVitalityEffects } = require('./glLoreFeuilletEffects');
const { getGameplaySettings } = require('./glSettings');
const {
  resolveLoreFeuilletRetrigger,
  resolveLoreBoolSetting,
} = require('./glLoreFeuilletRetrigger');

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

const PRESENT_EVENT_TYPE = 'feuillet_zone_presented';

async function hasFeuilletZoneEvent(deps, { gameId, teamId, zoneId }) {
  const events = await deps.queryAll(
    `SELECT team_id, payload_json
       FROM gl_game_events
      WHERE game_id = ?
        AND event_type = ?
      ORDER BY id ASC`,
    [gameId, PRESENT_EVENT_TYPE],
  );

  for (const evt of events) {
    let payload = {};
    try {
      payload = evt.payload_json ? JSON.parse(evt.payload_json) : {};
    } catch (_) {
      payload = {};
    }
    const evtZoneId = String(payload.zoneId || '').trim();
    if (evtZoneId !== String(zoneId).trim()) continue;
    if (Number(evt.team_id) === Number(teamId)) return true;
  }
  return false;
}

async function canPresentFeuilletZone(deps, { gameId, teamId, zoneId }) {
  const already = await hasFeuilletZoneEvent(deps, { gameId, teamId, zoneId });
  return !already;
}

async function listPresentedFeuilletZones(deps, { gameId, teamId }) {
  const events = await deps.queryAll(
    `SELECT payload_json
       FROM gl_game_events
      WHERE game_id = ?
        AND team_id = ?
        AND event_type = ?
      ORDER BY id ASC`,
    [gameId, teamId, PRESENT_EVENT_TYPE],
  );
  const zoneIds = [];
  for (const evt of events) {
    try {
      const payload = evt.payload_json ? JSON.parse(evt.payload_json) : {};
      const zoneId = String(payload.zoneId || '').trim();
      if (zoneId) zoneIds.push(zoneId);
    } catch (_) {
      /* ignore */
    }
  }
  return zoneIds;
}

async function presentFeuilletZone(
  deps,
  {
    gameId,
    teamId,
    zoneId,
    feuilletCode,
    plateau,
    titre,
    coutGemme,
    gainCoeur,
    actorType,
    actorId,
    gameRow,
  },
) {
  const canPresent = await canPresentFeuilletZone(deps, { gameId, teamId, zoneId });
  if (!canPresent) {
    return { error: { status: 409, message: 'Zone feuillet déjà présentée pour cette équipe' } };
  }

  const gameplaySettings = await getGameplaySettings();
  const loreSettings = resolveLoreSettings(gameRow, gameplaySettings);

  const feuilletPayload = {
    cout_gemme: Number(coutGemme) || 0,
    gain_coeur: Number(gainCoeur) || 0,
    titre: titre || feuilletCode || zoneId,
    feuillet_code: feuilletCode || null,
  };

  let vitalityPayload = null;
  const runTx = deps.withTransaction;
  if (typeof runTx !== 'function') {
    return { error: { status: 500, message: 'Transaction indisponible' } };
  }
  await runTx(async (tx) => {
    vitalityPayload = await applyFeuilletVitalityEffects(tx, {
      gameId,
      teamId,
      feuillet: feuilletPayload,
      settings: gameplaySettings,
      loreSettings,
      actorId: String(actorId),
      reason: feuilletPayload.titre,
    });
    await tx.execute(
      `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        gameId,
        teamId,
        actorType,
        String(actorId),
        PRESENT_EVENT_TYPE,
        JSON.stringify({
          zoneId: String(zoneId),
          feuilletCode: feuilletCode || null,
          plateau: plateau != null ? Number(plateau) : null,
        }),
      ],
    );
  });

  return {
    zoneId: String(zoneId),
    feuilletCode: feuilletCode || null,
    titre: feuilletPayload.titre,
    coutGemme: feuilletPayload.cout_gemme,
    gainCoeur: feuilletPayload.gain_coeur,
    vitality: vitalityPayload,
  };
}

module.exports = {
  PRESENT_EVENT_TYPE,
  canPresentFeuilletZone,
  hasFeuilletZoneEvent,
  listPresentedFeuilletZones,
  presentFeuilletZone,
};
