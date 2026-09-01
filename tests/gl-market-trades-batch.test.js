'use strict';

// G1 (audit stabilité/perf 2026-09) — la page de marché GL se charge en requêtes GROUPÉES.
//
// Deux garanties, vérifiées SANS base (base factice en mémoire injectée via require.cache) :
//  1. le payload renvoyé par `listTradesForPlayer` est STRICTEMENT identique à celui de
//     l'algorithme historique (4 requêtes par échange), recopié ici comme référence ;
//  2. le nombre de requêtes SQL est CONSTANT quel que soit le nombre d'échanges de la page
//     (avant : 2 + 5N, soit jusqu'à 102 requêtes pour une page de 20).
const test = require('node:test');
const assert = require('node:assert');

// ---------------------------------------------------------------------------------------
// Base factice : tables en mémoire + mini-interpréteur des requêtes du module marché.
// ---------------------------------------------------------------------------------------

function makeData(tradeCount) {
  const players = [];
  const trades = [];
  const sides = [];
  const messages = [];
  const sideFeuillets = [];
  const feuillets = [];

  const selfId = 101;
  players.push({ id: selfId, pseudo: 'Alix', health_points: 4, power_points: 7 });

  for (let i = 1; i <= tradeCount; i += 1) {
    const peerId = 200 + i;
    players.push({
      id: peerId,
      pseudo: `Camarade ${i}`,
      health_points: (i % 6) + 1,
      power_points: (i * 2) % 10,
    });
    const low = Math.min(selfId, peerId);
    const high = Math.max(selfId, peerId);
    trades.push({
      id: i,
      class_id: 9,
      player_low_id: low,
      player_high_id: high,
      status: i % 3 === 0 ? 'completed' : 'negotiating',
      initiator_player_id: selfId,
      frozen_at: i % 4 === 0 ? `2026-08-0${(i % 9) + 1} 10:00:00` : null,
      created_at: `2026-08-01 09:00:${String(i).padStart(2, '0')}`,
      updated_at: `2026-08-02 09:00:${String(i).padStart(2, '0')}`,
      completed_at: i % 3 === 0 ? `2026-08-03 09:00:${String(i).padStart(2, '0')}` : null,
    });
    sides.push(
      {
        trade_id: i,
        player_id: low,
        offer_health: i % 3,
        offer_power: (i + 1) % 4,
        accepted: i % 2,
        accepted_at: i % 2 ? `2026-08-02 08:00:${String(i).padStart(2, '0')}` : null,
      },
      {
        trade_id: i,
        player_id: high,
        offer_health: (i + 2) % 3,
        offer_power: i % 5,
        accepted: 0,
        accepted_at: null,
      },
    );
    messages.push(
      {
        id: i * 10 + 1,
        trade_id: i,
        author_player_id: selfId,
        body: `offre ${i}`,
        created_at: `2026-08-02 07:00:${String(i).padStart(2, '0')}`,
      },
      {
        id: i * 10 + 2,
        trade_id: i,
        author_player_id: peerId,
        body: `réponse ${i}`,
        created_at: `2026-08-02 07:30:${String(i).padStart(2, '0')}`,
      },
    );
    // Un échange sur deux porte des feuillets, pour couvrir les deux cas.
    if (i % 2 === 1) {
      const codeA = `F${i}A`;
      const codeB = `F${i}B`;
      feuillets.push(
        { feuillet_code: codeA, titre: `Feuillet ${i}A`, ordre_voyage: 2 },
        { feuillet_code: codeB, titre: `Feuillet ${i}B`, ordre_voyage: 1 },
      );
      sideFeuillets.push(
        { trade_id: i, player_id: low, feuillet_code: codeA },
        { trade_id: i, player_id: high, feuillet_code: codeB },
      );
    }
  }
  return { players, trades, sides, messages, sideFeuillets, feuillets, selfId };
}

function statusRank(status) {
  return status === 'negotiating' ? 0 : 1;
}

function paramIds(params, sql) {
  // Les requêtes du module passent d'abord d'éventuels ids « métier » puis les bornes
  // LIMIT/OFFSET si elles sont paramétrées — on ne garde que ce que le IN consomme.
  const marks = (String(sql).match(/\?/g) || []).length;
  return params.slice(0, marks).map(Number);
}

function createFakeDb(data) {
  const counter = { queries: 0 };

  function listVisibleTrades(pid) {
    return data.trades.filter(
      (t) =>
        (Number(t.player_low_id) === pid || Number(t.player_high_id) === pid) &&
        (t.status === 'negotiating' || t.status === 'completed'),
    );
  }

  async function queryAll(sql, params = []) {
    counter.queries += 1;
    const q = String(sql);

    if (/SELECT COUNT\(\*\) AS c FROM gl_market_trades/.test(q)) {
      return [{ c: listVisibleTrades(Number(params[0])).length }];
    }
    if (/SELECT id FROM gl_market_trades/.test(q)) {
      const rows = listVisibleTrades(Number(params[0])).sort(
        (a, b) =>
          statusRank(a.status) - statusRank(b.status) ||
          String(b.updated_at).localeCompare(String(a.updated_at)) ||
          b.id - a.id,
      );
      const limitMatch = q.match(/LIMIT\s+(\?|\d+)\s+OFFSET\s+(\?|\d+)/i);
      let limit = rows.length;
      let offset = 0;
      if (limitMatch) {
        const tail = params.slice(2).map(Number);
        limit = limitMatch[1] === '?' ? tail[0] : Number(limitMatch[1]);
        offset = limitMatch[2] === '?' ? tail[tail.length - 1] : Number(limitMatch[2]);
      }
      return rows.slice(offset, offset + limit).map((t) => ({ id: t.id }));
    }
    if (
      /FROM gl_market_trades\s+WHERE id (IN|=)/i.test(q) ||
      /FROM gl_market_trades WHERE id/.test(q)
    ) {
      const ids = paramIds(params, q);
      return data.trades.filter((t) => ids.includes(Number(t.id)));
    }
    if (/FROM gl_market_trade_sides/.test(q)) {
      const ids = paramIds(params, q);
      return data.sides
        .filter((s) => ids.includes(Number(s.trade_id)))
        .sort((a, b) => a.player_id - b.player_id);
    }
    if (/FROM gl_market_trade_messages/.test(q)) {
      const ids = paramIds(params, q);
      return data.messages
        .filter((m) => ids.includes(Number(m.trade_id)))
        .sort((a, b) => a.id - b.id);
    }
    if (/FROM gl_market_trade_side_feuillets/.test(q)) {
      const ids = paramIds(params, q);
      const byCode = new Map(data.feuillets.map((f) => [f.feuillet_code, f]));
      return data.sideFeuillets
        .filter((sf) => ids.includes(Number(sf.trade_id)))
        .map((sf) => ({
          trade_id: sf.trade_id,
          player_id: sf.player_id,
          feuillet_code: sf.feuillet_code,
          titre: byCode.get(sf.feuillet_code)?.titre ?? null,
          ordre_voyage: byCode.get(sf.feuillet_code)?.ordre_voyage ?? null,
        }))
        .sort(
          (a, b) =>
            (a.ordre_voyage ?? 0) - (b.ordre_voyage ?? 0) ||
            String(a.feuillet_code).localeCompare(String(b.feuillet_code)),
        );
    }
    if (/FROM gl_players/.test(q)) {
      const ids = paramIds(params, q);
      return data.players.filter((p) => ids.includes(Number(p.id)));
    }
    throw new Error(`Requête inattendue dans la base factice : ${q}`);
  }

  async function queryOne(sql, params = []) {
    const rows = await queryAll(sql, params);
    return rows[0] || null;
  }

  return {
    counter,
    exports: {
      queryAll,
      queryOne,
      execute: async () => {
        throw new Error('execute ne doit pas être appelé par la lecture du marché');
      },
      withTransaction: async () => {
        throw new Error('withTransaction ne doit pas être appelé par la lecture du marché');
      },
    },
  };
}

// ---------------------------------------------------------------------------------------
// Chargement de lib/glMarket avec la base factice injectée dans require.cache.
// ---------------------------------------------------------------------------------------

const RELOADED_MODULES = [
  '../lib/glMarket',
  '../lib/glMarketFeuillets',
  '../lib/glLoreFeuillets',
  '../lib/glVitality',
  '../lib/glSettings',
];

function loadGlMarketWithFakeDb(fakeDb) {
  const dbPath = require.resolve('../database');
  const modulePaths = RELOADED_MODULES.map((p) => require.resolve(p));
  const previousDb = require.cache[dbPath];
  const previousModules = modulePaths.map((p) => require.cache[p]);

  for (const p of modulePaths) delete require.cache[p];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb.exports };
  const glMarket = require('../lib/glMarket');

  return {
    glMarket,
    restore() {
      for (const p of modulePaths) delete require.cache[p];
      if (previousDb) require.cache[dbPath] = previousDb;
      else delete require.cache[dbPath];
      modulePaths.forEach((p, i) => {
        if (previousModules[i]) require.cache[p] = previousModules[i];
      });
    },
  };
}

// ---------------------------------------------------------------------------------------
// Référence : l'algorithme HISTORIQUE (4 requêtes par échange), recopié tel quel.
// Le payload groupé doit lui être strictement identique — le front ne change pas.
// ---------------------------------------------------------------------------------------

function clampVitalityRef(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(99, Math.floor(n)));
}

function legacyFormatSideRow(row, playersById, feuilletsByPlayer) {
  const player = playersById.get(Number(row.player_id)) || {};
  return {
    playerId: Number(row.player_id),
    pseudo: player.pseudo || null,
    offerHealth: Number(row.offer_health) || 0,
    offerPower: Number(row.offer_power) || 0,
    offerFeuillets: feuilletsByPlayer?.get(Number(row.player_id)) || [],
    accepted: !!Number(row.accepted),
    acceptedAt: row.accepted_at || null,
    healthPoints: player.health_points != null ? clampVitalityRef(player.health_points) : null,
    powerPoints: player.power_points != null ? clampVitalityRef(player.power_points) : null,
  };
}

function legacyFormatMessageRow(row, playersById) {
  const player = playersById.get(Number(row.author_player_id)) || {};
  return {
    id: Number(row.id),
    authorPlayerId: Number(row.author_player_id),
    authorPseudo: player.pseudo || null,
    body: row.body,
    createdAt: row.created_at,
  };
}

async function legacyBuildTradePayload(db, tradeId) {
  const trade = await db.queryOne('SELECT * FROM gl_market_trades WHERE id = ? LIMIT 1', [tradeId]);
  if (!trade) return null;
  const sides = await db.queryAll(
    'SELECT * FROM gl_market_trade_sides WHERE trade_id = ? ORDER BY player_id ASC',
    [tradeId],
  );
  const messages = await db.queryAll(
    'SELECT * FROM gl_market_trade_messages WHERE trade_id = ? ORDER BY id ASC',
    [tradeId],
  );
  const playerRows = await db.queryAll(
    'SELECT id, pseudo, health_points, power_points FROM gl_players WHERE id IN (?, ?)',
    [trade.player_low_id, trade.player_high_id],
  );
  const playersById = new Map(playerRows.map((row) => [Number(row.id), row]));
  const feuilletRows = await db.queryAll(
    `SELECT sf.player_id, sf.feuillet_code, f.titre
       FROM gl_market_trade_side_feuillets sf
       LEFT JOIN gl_lore_feuillets f ON f.feuillet_code = sf.feuillet_code
      WHERE sf.trade_id = ?
      ORDER BY f.ordre_voyage ASC, sf.feuillet_code ASC`,
    [tradeId],
  );
  const feuilletsByPlayer = new Map();
  for (const row of feuilletRows) {
    const key = Number(row.player_id);
    if (!feuilletsByPlayer.has(key)) feuilletsByPlayer.set(key, []);
    feuilletsByPlayer.get(key).push({ feuilletCode: row.feuillet_code, titre: row.titre || null });
  }
  return {
    id: Number(trade.id),
    classId: Number(trade.class_id),
    status: trade.status,
    frozen: !!trade.frozen_at,
    frozenAt: trade.frozen_at || null,
    initiatorPlayerId: Number(trade.initiator_player_id),
    createdAt: trade.created_at,
    updatedAt: trade.updated_at,
    completedAt: trade.completed_at || null,
    sides: sides.map((row) => legacyFormatSideRow(row, playersById, feuilletsByPlayer)),
    messages: messages.map((row) => legacyFormatMessageRow(row, playersById)),
  };
}

async function legacyListTrades(db, playerId, { page = 1, pageSize = 20 } = {}) {
  const offset = (Math.max(1, page) - 1) * pageSize;
  const pid = Number(playerId);
  const totalRow = await db.queryOne(
    `SELECT COUNT(*) AS c FROM gl_market_trades
      WHERE (player_low_id = ? OR player_high_id = ?)
        AND status IN ('negotiating', 'completed')`,
    [pid, pid],
  );
  const rows = await db.queryAll(
    `SELECT id FROM gl_market_trades
      WHERE (player_low_id = ? OR player_high_id = ?)
        AND status IN ('negotiating', 'completed')
      ORDER BY
        CASE status WHEN 'negotiating' THEN 0 ELSE 1 END,
        updated_at DESC,
        id DESC
      LIMIT ${Number(pageSize)} OFFSET ${offset}`,
    [pid, pid],
  );
  const items = [];
  for (const row of rows) {
    const payload = await legacyBuildTradePayload(db, row.id);
    if (payload) items.push(payload);
  }
  return { items, page: Math.max(1, page), pageSize, total: Number(totalRow?.c || 0) };
}

// ---------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------

async function runListForTradeCount(tradeCount, options) {
  const data = makeData(tradeCount);
  const fakeDb = createFakeDb(data);
  const loaded = loadGlMarketWithFakeDb(fakeDb);
  try {
    fakeDb.counter.queries = 0;
    const result = await loaded.glMarket.listTradesForPlayer(data.selfId, options);
    const queries = fakeDb.counter.queries;
    const reference = await legacyListTrades(fakeDb.exports, data.selfId, options);
    return { result, reference, queries };
  } finally {
    loaded.restore();
  }
}

for (const tradeCount of [1, 5, 20]) {
  test(`listTradesForPlayer — payload strictement identique à l'algorithme historique (${tradeCount} échanges)`, async () => {
    const { result, reference } = await runListForTradeCount(tradeCount, { page: 1, pageSize: 20 });
    assert.strictEqual(result.items.length, Math.min(tradeCount, 20));
    assert.deepStrictEqual(result, reference);
  });
}

test('listTradesForPlayer — nombre de requêtes SQL constant pour 1, 5 et 20 échanges', async () => {
  const counts = new Map();
  for (const tradeCount of [1, 5, 20]) {
    const { queries } = await runListForTradeCount(tradeCount, { page: 1, pageSize: 20 });
    counts.set(tradeCount, queries);
  }
  assert.strictEqual(
    counts.get(5),
    counts.get(1),
    `5 échanges (${counts.get(5)} requêtes) doivent coûter autant que 1 (${counts.get(1)})`,
  );
  assert.strictEqual(
    counts.get(20),
    counts.get(1),
    `20 échanges (${counts.get(20)} requêtes) doivent coûter autant que 1 (${counts.get(1)})`,
  );
  // Compte attendu : total + page d'ids + échanges + côtés + messages + feuillets + joueurs.
  assert.ok(
    counts.get(20) <= 7,
    `le chargement groupé ne doit pas dépasser 7 requêtes (mesuré : ${counts.get(20)})`,
  );
});

test('listTradesForPlayer — page vide : payload identique, aucune requête de détail', async () => {
  const { result, reference, queries } = await runListForTradeCount(0, { page: 1, pageSize: 20 });
  assert.deepStrictEqual(result, reference);
  assert.deepStrictEqual(result.items, []);
  assert.ok(queries <= 2, `une page vide coûte au plus 2 requêtes (mesuré : ${queries})`);
});

// G5 : LIMIT/OFFSET sont désormais des paramètres SQL — la pagination doit rester exacte.
test('listTradesForPlayer — pagination identique à la référence (page 2, pageSize 2)', async () => {
  const { result, reference } = await runListForTradeCount(5, { page: 2, pageSize: 2 });
  assert.strictEqual(result.items.length, 2);
  assert.strictEqual(result.page, 2);
  assert.strictEqual(result.total, 5);
  assert.deepStrictEqual(result, reference);
});
