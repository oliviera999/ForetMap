'use strict';

// G1 (audit stabilité/perf 2026-09) — la page de marché GL se charge en requêtes GROUPÉES.
//
// Deux garanties, vérifiées SANS base (base factice en mémoire injectée via require.cache) :
//  1. le payload renvoyé par `listTradesForPlayer` est STRICTEMENT identique à celui de
//     l'algorithme historique (4 requêtes par échange), recopié ici comme référence ;
//  2. le nombre de requêtes SQL est CONSTANT quel que soit le nombre d'échanges de la page
//     (avant : 2 + 5N, soit jusqu'à 102 requêtes pour une page de 20).
//
// Ensemble unifié (M1, « une seule monnaie ») : la lecture consulte aussi les réglages
// (`gl_settings`), la classe du joueur (`gl_players`) et la partie la plus récente de la classe
// (`gl_games`) pour savoir si elle joue « Tenir à deux ». Les deux garanties sont donc rejouées
// dans trois situations (`MODES`) :
//  - mouture éteinte et classe sans partie « Tenir » : jeu classique, payload historique intact ;
//  - classe « Tenir » : même payload, SANS aucun cœur (`offerHealth`, `healthPoints`) ni aucun
//    solde (`powerPoints` : bourses privées), et un
//    échange resté en cœurs se ferme seul à la première lecture (deux écritures, une seule fois).
const test = require('node:test');
const assert = require('node:assert');

// ---------------------------------------------------------------------------------------
// Base factice : tables en mémoire + mini-interpréteur des requêtes du module marché.
// ---------------------------------------------------------------------------------------

const CLASS_ID = 9;
/** Échange « d'avant » d'une classe « Tenir » : encore en négociation, avec des cœurs. */
const STALE_TRADE_ID = 900;

/**
 * Les trois situations d'une classe. `settings` : lignes de `gl_settings` (vide = défauts,
 * mouture levée) ; `games` : parties de la classe ; `queries` / `queriesSuivantes` /
 * `emptyQueries` : nombre exact de requêtes d'une page pleine (première lecture, puis les
 * suivantes) et d'une page vide, détaillé à côté de chaque valeur.
 */
const MODES = [
  {
    key: 'eteinte',
    label: 'jeu classique, mouture éteinte',
    tenir: false,
    settings: [{ key: 'gameplay.tenir_enabled', value_json: 'false' }],
    games: [{ id: 1, class_id: CLASS_ID, status: 'live', tenir_profil: 'complet' }],
    // classe du joueur + réglages + total + page d'ids + échanges + côtés + messages + feuillets
    // + joueurs. Mouture éteinte : `gl_games` n'est jamais lue.
    queries: 9,
    // Deuxième lecture : les réglages viennent du cache.
    queriesSuivantes: 8,
    // classe du joueur + réglages + total + page d'ids.
    emptyQueries: 4,
  },
  {
    key: 'classique',
    label: 'jeu classique, classe sans partie « Tenir »',
    tenir: false,
    settings: [{ key: 'gameplay.market_hearts_enabled', value_json: 'true' }],
    games: [{ id: 1, class_id: CLASS_ID, status: 'live', tenir_profil: null }],
    // Les 9 précédentes + la partie la plus récente de la classe, lue deux fois (avant la
    // liste, puis au moment de composer les payloads).
    queries: 11,
    queriesSuivantes: 10,
    // Les 4 précédentes + la partie de la classe (une fois : aucun payload à composer).
    emptyQueries: 5,
  },
  {
    key: 'tenir',
    label: 'classe « Tenir à deux »',
    tenir: true,
    settings: [
      { key: 'gameplay.tenir_enabled', value_json: 'true' },
      // Même ouvert pour le jeu classique, ce réglage ne rend aucun cœur à une classe « Tenir ».
      { key: 'gameplay.market_hearts_enabled', value_json: 'true' },
    ],
    games: [
      { id: 1, class_id: CLASS_ID, status: 'finished', tenir_profil: null },
      { id: 2, class_id: CLASS_ID, status: 'live', tenir_profil: 'complet' },
    ],
    // Les 11 du jeu classique + les deux écritures qui ferment ce qui parlait encore de cœurs
    // (échanges en cours, annonces ouvertes) — à la première lecture seulement.
    queries: 13,
    // Deuxième lecture : plus d'écriture, et les réglages viennent du cache.
    queriesSuivantes: 10,
    emptyQueries: 7,
  },
];

function makeData(tradeCount, mode = MODES[0]) {
  const players = [];
  const trades = [];
  const sides = [];
  const messages = [];
  const sideFeuillets = [];
  const feuillets = [];

  const selfId = 101;
  players.push({
    id: selfId,
    class_id: CLASS_ID,
    pseudo: 'Alix',
    health_points: 4,
    power_points: 7,
  });

  for (let i = 1; i <= tradeCount; i += 1) {
    const peerId = 200 + i;
    players.push({
      id: peerId,
      class_id: CLASS_ID,
      pseudo: `Camarade ${i}`,
      health_points: (i % 6) + 1,
      power_points: (i * 2) % 10,
    });
    const low = Math.min(selfId, peerId);
    const high = Math.max(selfId, peerId);
    const status = i % 3 === 0 ? 'completed' : 'negotiating';
    // Classe « Tenir » : plus aucun échange en cours ne porte de cœurs (ils ne peuvent plus y
    // entrer) ; seuls les échanges conclus « avant » en gardent la trace en base — elle ne doit
    // pas être servie pour autant.
    const sansCoeurs = mode.tenir && status === 'negotiating';
    trades.push({
      id: i,
      class_id: CLASS_ID,
      player_low_id: low,
      player_high_id: high,
      status,
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
        offer_health: sansCoeurs ? 0 : i % 3,
        offer_power: (i + 1) % 4,
        accepted: i % 2,
        accepted_at: i % 2 ? `2026-08-02 08:00:${String(i).padStart(2, '0')}` : null,
      },
      {
        trade_id: i,
        player_id: high,
        offer_health: sansCoeurs ? 0 : (i + 2) % 3,
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
  if (mode.tenir && tradeCount > 0) {
    // Un échange « d'avant », resté en négociation avec des cœurs : la première lecture d'une
    // classe « Tenir » l'annule, il ne doit plus ni compter ni s'afficher.
    const peerId = 990;
    players.push({
      id: peerId,
      class_id: CLASS_ID,
      pseudo: 'Camarade d’avant',
      health_points: 5,
      power_points: 5,
    });
    trades.push({
      id: STALE_TRADE_ID,
      class_id: CLASS_ID,
      player_low_id: selfId,
      player_high_id: peerId,
      status: 'negotiating',
      initiator_player_id: peerId,
      frozen_at: null,
      created_at: '2026-07-01 09:00:00',
      updated_at: '2026-09-01 09:00:00',
      completed_at: null,
    });
    sides.push(
      {
        trade_id: STALE_TRADE_ID,
        player_id: selfId,
        offer_health: 0,
        offer_power: 1,
        accepted: 0,
        accepted_at: null,
      },
      {
        trade_id: STALE_TRADE_ID,
        player_id: peerId,
        offer_health: 2,
        offer_power: 0,
        accepted: 0,
        accepted_at: null,
      },
    );
  }
  return {
    players,
    trades,
    sides,
    messages,
    sideFeuillets,
    feuillets,
    selfId,
    settings: mode.settings.map((row) => ({ ...row })),
    games: mode.games.map((row) => ({ ...row })),
    tenir: mode.tenir,
  };
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
  // `queries` : toute requête (lecture ou écriture) ; `writes` : les écritures seules ;
  // `log` : le SQL de chaque requête, pour vérifier ce qui a été lu.
  const counter = { queries: 0, writes: 0, log: [] };

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
    counter.log.push(q);

    if (/FROM `?gl_settings`?/.test(q)) {
      const keys = new Set(params.map(String));
      return data.settings.filter((row) => keys.has(row.key));
    }
    if (/SELECT tenir_profil FROM gl_games\s+WHERE class_id = \?/.test(q)) {
      // La partie la plus récente de la classe : celle en cours d'abord, puis la dernière créée.
      const rows = data.games
        .filter((g) => Number(g.class_id) === Number(params[0]))
        .sort(
          (a, b) => (b.status === 'live' ? 1 : 0) - (a.status === 'live' ? 1 : 0) || b.id - a.id,
        );
      return rows.slice(0, 1).map((g) => ({ tenir_profil: g.tenir_profil }));
    }
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

  // Écritures : la lecture du marché n'en fait AUCUNE en jeu classique. Dans une classe
  // « Tenir », elle ferme une fois ce qui parlait encore de cœurs — et rien d'autre.
  async function execute(sql, params = []) {
    const q = String(sql);
    if (!data.tenir) {
      throw new Error(`execute ne doit pas être appelé par la lecture du marché : ${q}`);
    }
    counter.queries += 1;
    counter.writes += 1;
    counter.log.push(q);
    if (/UPDATE gl_market_trades t SET t\.status = 'cancelled'/.test(q)) {
      const classId = Number(params[0]);
      let affectedRows = 0;
      for (const trade of data.trades) {
        const enCoeurs = data.sides.some(
          (s) => Number(s.trade_id) === Number(trade.id) && Number(s.offer_health) > 0,
        );
        if (Number(trade.class_id) === classId && trade.status === 'negotiating' && enCoeurs) {
          trade.status = 'cancelled';
          affectedRows += 1;
        }
      }
      return { affectedRows };
    }
    if (/UPDATE gl_market_annonces SET statut = 'expiree'/.test(q)) {
      return { affectedRows: 0 };
    }
    throw new Error(`Écriture inattendue dans la base factice : ${q}`);
  }

  return {
    counter,
    exports: {
      queryAll,
      queryOne,
      execute,
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

/** Référence d'une classe « Tenir » : le payload historique, sans aucun cœur. */
function sansCoeurs(reference) {
  return {
    ...reference,
    items: reference.items.map((item) => ({
      ...item,
      sides: item.sides.map((side) => {
        const {
          offerHealth: _offerHealth,
          healthPoints: _healthPoints,
          powerPoints: _powerPoints,
          ...rest
        } = side;
        return rest;
      }),
    })),
  };
}

async function runListForTradeCount(tradeCount, options, mode = MODES[0]) {
  const data = makeData(tradeCount, mode);
  const fakeDb = createFakeDb(data);
  const loaded = loadGlMarketWithFakeDb(fakeDb);
  try {
    const result = await loaded.glMarket.listTradesForPlayer(data.selfId, options);
    const { queries, writes } = fakeDb.counter;
    const log = [...fakeDb.counter.log];
    // Deuxième lecture, même processus : les écritures d'une classe « Tenir » ne se rejouent pas.
    fakeDb.counter.queries = 0;
    fakeDb.counter.writes = 0;
    const again = await loaded.glMarket.listTradesForPlayer(data.selfId, options);
    const queriesSuivantes = fakeDb.counter.queries;
    const writesSuivantes = fakeDb.counter.writes;
    // La référence est calculée APRÈS la lecture : elle voit la base telle que la lecture l'a
    // laissée (un échange « d'avant » en cœurs annulé dans une classe « Tenir »).
    const legacy = await legacyListTrades(fakeDb.exports, data.selfId, options);
    const reference = mode.tenir ? sansCoeurs(legacy) : legacy;
    return {
      data,
      result,
      again,
      reference,
      queries,
      writes,
      queriesSuivantes,
      writesSuivantes,
      log,
    };
  } finally {
    loaded.restore();
  }
}

for (const mode of MODES) {
  for (const tradeCount of [1, 5, 20]) {
    test(`listTradesForPlayer — payload strictement identique à l'algorithme historique (${tradeCount} échanges ; ${mode.label})`, async () => {
      const { result, again, reference } = await runListForTradeCount(
        tradeCount,
        { page: 1, pageSize: 20 },
        mode,
      );
      assert.strictEqual(result.items.length, Math.min(tradeCount, 20));
      assert.strictEqual(result.total, tradeCount);
      assert.deepStrictEqual(result, reference);
      assert.deepStrictEqual(again, reference, 'une deuxième lecture rend le même payload');
      const sides = result.items.flatMap((item) => item.sides);
      if (mode.tenir) {
        // Une seule monnaie : aucun cœur servi, même pour un échange conclu « avant ».
        for (const side of sides) {
          assert.ok(!('offerHealth' in side), 'aucune offre en cœurs servie');
          assert.ok(!('healthPoints' in side), 'aucune bourse de cœurs servie');
          // Bourses privées : le solde du partenaire (peut-être d'une autre équipe) n'est pas
          // servi non plus — seule l'offre l'est.
          assert.ok(!('powerPoints' in side), 'aucun solde servi dans un échange');
          assert.strictEqual(typeof side.offerPower, 'number');
        }
      } else {
        // Jeu classique : les cœurs restent servis, comme avant.
        for (const side of sides) {
          assert.strictEqual(typeof side.offerHealth, 'number');
          assert.strictEqual(typeof side.healthPoints, 'number');
        }
        assert.ok(
          tradeCount < 2 || sides.some((side) => side.offerHealth > 0),
          'le jeu de données porte bien des offres en cœurs',
        );
      }
    });
  }

  test(`listTradesForPlayer — nombre de requêtes SQL constant pour 1, 5 et 20 échanges (${mode.label})`, async () => {
    const counts = new Map();
    const suivantes = new Map();
    for (const tradeCount of [1, 5, 20]) {
      const run = await runListForTradeCount(tradeCount, { page: 1, pageSize: 20 }, mode);
      counts.set(tradeCount, run.queries);
      suivantes.set(tradeCount, run.queriesSuivantes);
      assert.strictEqual(
        run.writes,
        mode.tenir ? 2 : 0,
        `écritures de la première lecture (${tradeCount} échanges)`,
      );
      assert.strictEqual(
        run.writesSuivantes,
        0,
        `aucune écriture à la deuxième lecture (${tradeCount} échanges)`,
      );
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
    assert.strictEqual(suivantes.get(5), suivantes.get(1), 'deuxième lecture : 5 comme 1');
    assert.strictEqual(suivantes.get(20), suivantes.get(1), 'deuxième lecture : 20 comme 1');
    // Compte attendu (détaillé dans `MODES`) : classe du joueur + réglages + total + page d'ids
    // + échanges + côtés + messages + feuillets + joueurs, plus la partie de la classe quand la
    // mouture est levée, plus les deux écritures d'une classe « Tenir » (première lecture).
    assert.ok(
      counts.get(20) <= mode.queries,
      `le chargement groupé ne doit pas dépasser ${mode.queries} requêtes (mesuré : ${counts.get(20)})`,
    );
    assert.ok(
      suivantes.get(20) <= mode.queriesSuivantes,
      `une deuxième lecture ne doit pas dépasser ${mode.queriesSuivantes} requêtes (mesuré : ${suivantes.get(20)})`,
    );
  });

  test(`listTradesForPlayer — page vide : payload identique, aucune requête de détail (${mode.label})`, async () => {
    const { result, reference, queries, log } = await runListForTradeCount(
      0,
      { page: 1, pageSize: 20 },
      mode,
    );
    assert.deepStrictEqual(result, reference);
    assert.deepStrictEqual(result.items, []);
    assert.ok(
      queries <= mode.emptyQueries,
      `une page vide coûte au plus ${mode.emptyQueries} requêtes (mesuré : ${queries})`,
    );
    const detail = log.filter((q) =>
      /gl_market_trade_sides|gl_market_trade_messages|gl_market_trade_side_feuillets|FROM gl_market_trades\s+WHERE id/.test(
        q,
      ),
    );
    // La purge d'une classe « Tenir » nomme `gl_market_trade_sides` dans un UPDATE : ce n'est
    // pas une requête de détail.
    assert.deepStrictEqual(
      detail.filter((q) => !/^\s*UPDATE /.test(q)),
      [],
      'aucune requête de détail sur une page vide',
    );
  });

  // G5 : LIMIT/OFFSET sont désormais des paramètres SQL — la pagination doit rester exacte.
  test(`listTradesForPlayer — pagination identique à la référence (page 2, pageSize 2 ; ${mode.label})`, async () => {
    const { result, reference } = await runListForTradeCount(5, { page: 2, pageSize: 2 }, mode);
    assert.strictEqual(result.items.length, 2);
    assert.strictEqual(result.page, 2);
    assert.strictEqual(result.total, 5);
    assert.deepStrictEqual(result, reference);
  });
}

test('listTradesForPlayer — classe « Tenir » : un échange resté en cœurs est annulé avant le décompte, il ne s’affiche plus', async () => {
  const mode = MODES.find((m) => m.key === 'tenir');
  const { data, result, log } = await runListForTradeCount(5, { page: 1, pageSize: 20 }, mode);
  const stale = data.trades.find((t) => t.id === STALE_TRADE_ID);
  assert.strictEqual(stale.status, 'cancelled', 'l’échange « d’avant » est annulé');
  assert.ok(!result.items.some((item) => item.id === STALE_TRADE_ID));
  assert.strictEqual(result.total, 5, 'il ne compte plus dans le total');
  // La fermeture passe AVANT le décompte : sinon le total compterait un échange disparu.
  const purge = log.findIndex((q) =>
    /UPDATE gl_market_trades t SET t\.status = 'cancelled'/.test(q),
  );
  const total = log.findIndex((q) => /SELECT COUNT\(\*\) AS c FROM gl_market_trades/.test(q));
  assert.ok(purge >= 0 && total >= 0 && purge < total, 'purge avant le total');
  // Les échanges en cours sans cœurs, eux, ne sont pas touchés.
  assert.ok(
    data.trades.filter((t) => t.id !== STALE_TRADE_ID).every((t) => t.status !== 'cancelled'),
  );
});
