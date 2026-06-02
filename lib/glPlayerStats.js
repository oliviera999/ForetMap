'use strict';

const { clampVitality } = require('./glVitality');

function emptyVitalityFlows() {
  return {
    heartsGained: 0,
    heartsLost: 0,
    gemsGained: 0,
    gemsLost: 0,
  };
}

function ensurePlayerFlows(map, playerId) {
  const id = Number(playerId);
  if (!Number.isFinite(id) || id <= 0) return null;
  if (!map[id]) map[id] = emptyVitalityFlows();
  return map[id];
}

function applyDelta(flows, heartsDelta, gemsDelta) {
  if (heartsDelta > 0) flows.heartsGained += heartsDelta;
  else if (heartsDelta < 0) flows.heartsLost += Math.abs(heartsDelta);
  if (gemsDelta > 0) flows.gemsGained += gemsDelta;
  else if (gemsDelta < 0) flows.gemsLost += Math.abs(gemsDelta);
}

function parsePayloadJson(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

function applyVitalityChangeEvent(flowsByPlayer, payload) {
  if (!payload) return;
  const healthDelta = Number(payload.healthDelta) || 0;
  const powerDelta = Number(payload.powerDelta) || 0;
  const results = Array.isArray(payload.results) ? payload.results : [];
  for (const r of results) {
    const flows = ensurePlayerFlows(flowsByPlayer, r.playerId);
    if (!flows) continue;
    applyDelta(flows, healthDelta, powerDelta);
  }
}

function applySpellCastEvent(flowsByPlayer, payload) {
  if (!payload) return;
  const contributions = Array.isArray(payload.contributions) ? payload.contributions : [];
  for (const c of contributions) {
    const flows = ensurePlayerFlows(flowsByPlayer, c.playerId);
    if (!flows) continue;
    const hearts = Number(c.hearts) || 0;
    const gems = Number(c.gems) || 0;
    if (hearts > 0) flows.heartsLost += hearts;
    if (gems > 0) flows.gemsLost += gems;
  }
}

function applyMarketTrade(flowsByPlayer, trade, sides) {
  const lowId = Number(trade.player_low_id);
  const highId = Number(trade.player_high_id);
  const lowSide = sides.find((s) => Number(s.player_id) === lowId);
  const highSide = sides.find((s) => Number(s.player_id) === highId);
  if (!lowSide || !highSide) return;

  const lowHealth = Number(lowSide.offer_health) || 0;
  const lowPower = Number(lowSide.offer_power) || 0;
  const highHealth = Number(highSide.offer_health) || 0;
  const highPower = Number(highSide.offer_power) || 0;

  const lowFlows = ensurePlayerFlows(flowsByPlayer, lowId);
  const highFlows = ensurePlayerFlows(flowsByPlayer, highId);
  if (!lowFlows || !highFlows) return;

  applyDelta(lowFlows, -lowHealth + highHealth, -lowPower + highPower);
  applyDelta(highFlows, -highHealth + lowHealth, -highPower + lowPower);
}

async function aggregateVitalityFlowsForClass(queryAll, classId) {
  const flowsByPlayer = {};
  const cid = Number(classId);
  if (!Number.isFinite(cid) || cid <= 0) return flowsByPlayer;

  const games = await queryAll('SELECT id FROM gl_games WHERE class_id = ?', [cid]);
  const gameIds = games.map((g) => Number(g.id)).filter(Boolean);

  if (gameIds.length > 0) {
    const placeholders = gameIds.map(() => '?').join(',');
    const events = await queryAll(
      `SELECT event_type, payload_json
         FROM gl_game_events
        WHERE game_id IN (${placeholders})
          AND event_type IN ('vitality_change', 'spell_cast')`,
      gameIds
    );
    for (const ev of events) {
      const payload = parsePayloadJson(ev.payload_json);
      if (ev.event_type === 'vitality_change') {
        applyVitalityChangeEvent(flowsByPlayer, payload);
      } else if (ev.event_type === 'spell_cast') {
        applySpellCastEvent(flowsByPlayer, payload);
      }
    }
  }

  const tradeRows = await queryAll(
    `SELECT t.id, t.player_low_id, t.player_high_id,
            s.player_id, s.offer_health, s.offer_power
       FROM gl_market_trades t
       JOIN gl_market_trade_sides s ON s.trade_id = t.id
      WHERE t.class_id = ? AND t.status = 'completed'
      ORDER BY t.id ASC, s.player_id ASC`,
    [cid]
  );
  const tradesById = new Map();
  for (const row of tradeRows) {
    const tradeId = Number(row.id);
    if (!tradesById.has(tradeId)) {
      tradesById.set(tradeId, {
        trade: { id: tradeId, player_low_id: row.player_low_id, player_high_id: row.player_high_id },
        sides: [],
      });
    }
    tradesById.get(tradeId).sides.push({
      player_id: row.player_id,
      offer_health: row.offer_health,
      offer_power: row.offer_power,
    });
  }
  for (const { trade, sides } of tradesById.values()) {
    applyMarketTrade(flowsByPlayer, trade, sides);
  }

  return flowsByPlayer;
}

async function getCatalogTotals(queryAll) {
  const [speciesRow, glossaryRow, tutorialsRow] = await Promise.all([
    queryAll("SELECT COUNT(*) AS c FROM gl_species WHERE statut = 'actif'"),
    queryAll("SELECT COUNT(*) AS c FROM gl_glossary_terms WHERE statut = 'actif'"),
    queryAll('SELECT COUNT(*) AS c FROM gl_tutorials'),
  ]);
  return {
    species_total: Number(speciesRow?.[0]?.c) || 0,
    glossary_total: Number(glossaryRow?.[0]?.c) || 0,
    tutorials_total: Number(tutorialsRow?.[0]?.c) || 0,
  };
}

async function aggregateLearningForClass(queryAll, classId) {
  const cid = Number(classId);
  const catalogTotals = await getCatalogTotals(queryAll);
  const byPlayerId = {};

  const players = await queryAll(
    'SELECT id FROM gl_players WHERE class_id = ? AND is_active = 1',
    [cid]
  );
  const playerIds = players.map((p) => String(p.id));
  if (playerIds.length === 0) {
    return { byPlayerId, catalogTotals };
  }

  const placeholders = playerIds.map(() => '?').join(',');
  const rows = await queryAll(
    `SELECT reader_user_id, target_type, COUNT(*) AS cnt
       FROM gl_learning_acknowledgements
      WHERE reader_user_type = 'gl_player'
        AND reader_user_id IN (${placeholders})
      GROUP BY reader_user_id, target_type`,
    playerIds
  );

  for (const row of rows) {
    const id = Number(row.reader_user_id);
    if (!byPlayerId[id]) {
      byPlayerId[id] = { species_learned: 0, glossary_learned: 0, tutorials_read: 0 };
    }
    const type = String(row.target_type || '').toLowerCase();
    const cnt = Number(row.cnt) || 0;
    if (type === 'species') byPlayerId[id].species_learned = cnt;
    else if (type === 'glossary') byPlayerId[id].glossary_learned = cnt;
    else if (type === 'tutorial') byPlayerId[id].tutorials_read = cnt;
  }

  return { byPlayerId, catalogTotals };
}

function buildPlayerStatsRow(player, vitalityFlows, learning, vitalityEnabled) {
  const learningStats = {
    species_learned: learning?.species_learned ?? 0,
    glossary_learned: learning?.glossary_learned ?? 0,
    tutorials_read: learning?.tutorials_read ?? 0,
  };
  const vitalityStats = vitalityEnabled
    ? {
      hearts: clampVitality(player.health_points),
      gems: clampVitality(player.power_points),
      hearts_gained: vitalityFlows?.heartsGained ?? 0,
      hearts_lost: vitalityFlows?.heartsLost ?? 0,
      gems_gained: vitalityFlows?.gemsGained ?? 0,
      gems_lost: vitalityFlows?.gemsLost ?? 0,
    }
    : {};

  return {
    id: Number(player.id),
    pseudo: player.pseudo,
    first_name: player.first_name,
    last_name: player.last_name,
    last_seen: player.last_seen || null,
    stats: {
      ...vitalityStats,
      ...learningStats,
    },
  };
}

function computeClassTotals(playerRows, catalogTotals, vitalityEnabled) {
  const totals = {
    species_learned: 0,
    glossary_learned: 0,
    tutorials_read: 0,
    active_players: playerRows.length,
  };
  if (vitalityEnabled) {
    totals.hearts = 0;
    totals.gems = 0;
    totals.hearts_gained = 0;
    totals.hearts_lost = 0;
    totals.gems_gained = 0;
    totals.gems_lost = 0;
  }
  for (const row of playerRows) {
    const s = row.stats || {};
    totals.species_learned += Number(s.species_learned) || 0;
    totals.glossary_learned += Number(s.glossary_learned) || 0;
    totals.tutorials_read += Number(s.tutorials_read) || 0;
    if (vitalityEnabled) {
      totals.hearts += Number(s.hearts) || 0;
      totals.gems += Number(s.gems) || 0;
      totals.hearts_gained += Number(s.hearts_gained) || 0;
      totals.hearts_lost += Number(s.hearts_lost) || 0;
      totals.gems_gained += Number(s.gems_gained) || 0;
      totals.gems_lost += Number(s.gems_lost) || 0;
    }
  }
  return { ...totals, catalog: catalogTotals };
}

async function buildClassStats(db, classId, { vitalityEnabled = false } = {}) {
  const cid = Number(classId);
  const players = await db.queryAll(
    `SELECT id, pseudo, first_name, last_name, health_points, power_points, last_seen
       FROM gl_players
      WHERE class_id = ? AND is_active = 1
      ORDER BY pseudo ASC`,
    [cid]
  );

  const [vitalityFlows, learningAgg] = await Promise.all([
    vitalityEnabled ? aggregateVitalityFlowsForClass(db.queryAll, cid) : Promise.resolve({}),
    aggregateLearningForClass(db.queryAll, cid),
  ]);

  const playerRows = players.map((p) => {
    const id = Number(p.id);
    return buildPlayerStatsRow(
      p,
      vitalityFlows[id] || emptyVitalityFlows(),
      learningAgg.byPlayerId[id],
      vitalityEnabled
    );
  });

  return {
    classId: cid,
    players: playerRows,
    classTotals: computeClassTotals(playerRows, learningAgg.catalogTotals, vitalityEnabled),
    catalogTotals: learningAgg.catalogTotals,
    vitalityEnabled: !!vitalityEnabled,
  };
}

async function buildPlayerStats(db, playerId, { vitalityEnabled = false } = {}) {
  const pid = Number(playerId);
  const player = await db.queryOne(
    `SELECT id, class_id, pseudo, first_name, last_name, health_points, power_points, last_seen
       FROM gl_players
      WHERE id = ? AND is_active = 1
      LIMIT 1`,
    [pid]
  );
  if (!player) return null;

  const classId = Number(player.class_id);
  const [vitalityFlows, learningAgg] = await Promise.all([
    vitalityEnabled ? aggregateVitalityFlowsForClass(db.queryAll, classId) : Promise.resolve({}),
    aggregateLearningForClass(db.queryAll, classId),
  ]);

  const row = buildPlayerStatsRow(
    player,
    vitalityFlows[pid] || emptyVitalityFlows(),
    learningAgg.byPlayerId[pid],
    vitalityEnabled
  );

  return {
    ...row,
    classId,
    catalogTotals: learningAgg.catalogTotals,
    vitalityEnabled: !!vitalityEnabled,
  };
}

async function getPlayerVitalitySnapshot(queryOne, playerId) {
  const row = await queryOne(
    'SELECT health_points, power_points FROM gl_players WHERE id = ? LIMIT 1',
    [Number(playerId)]
  );
  if (!row) return null;
  return {
    hearts: clampVitality(row.health_points),
    gems: clampVitality(row.power_points),
  };
}

module.exports = {
  emptyVitalityFlows,
  applyDelta,
  applyVitalityChangeEvent,
  applySpellCastEvent,
  applyMarketTrade,
  aggregateVitalityFlowsForClass,
  aggregateLearningForClass,
  getCatalogTotals,
  buildClassStats,
  buildPlayerStats,
  getPlayerVitalitySnapshot,
};
