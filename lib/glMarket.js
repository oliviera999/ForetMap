'use strict';

const { queryAll, queryOne, execute, withTransaction } = require('../database');
const { clampVitality, applyPlayerVitalityDelta, VITALITY_MAX } = require('./glVitality');

const MIN_MESSAGE_LEN = 2;
const MAX_MESSAGE_LEN = 2000;

function normalizePlayerPair(playerAId, playerBId) {
  const a = Number(playerAId);
  const b = Number(playerBId);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
    const err = new Error('INVALID_PLAYER_IDS');
    err.status = 400;
    throw err;
  }
  if (a === b) {
    const err = new Error('SAME_PLAYER');
    err.status = 400;
    throw err;
  }
  return a < b ? { low: a, high: b } : { low: b, high: a };
}

function parseOfferAmount(value) {
  if (value == null) return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    const err = new Error('INVALID_OFFER');
    err.status = 400;
    throw err;
  }
  return clampVitality(n);
}

function makeHttpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function resolveMarketError(err) {
  const map = {
    INVALID_PLAYER_IDS: { status: 400, error: 'Identifiants joueurs invalides' },
    SAME_PLAYER: { status: 400, error: 'Impossible d’échanger avec soi-même' },
    INVALID_OFFER: { status: 400, error: 'Montant d’offre invalide' },
    PLAYER_NOT_FOUND: { status: 404, error: 'Joueur introuvable' },
    PEER_NOT_FOUND: { status: 404, error: 'Camarade introuvable' },
    PEER_WRONG_CLASS: { status: 403, error: 'Ce joueur n’est pas dans ta classe' },
    TRADE_NOT_FOUND: { status: 404, error: 'Échange introuvable' },
    TRADE_NOT_NEGOTIATING: { status: 409, error: 'Cet échange n’est plus en cours' },
    TRADE_FROZEN: { status: 409, error: 'Les offres sont figées : décoche « J’accepte » pour les modifier' },
    ACTIVE_TRADE_EXISTS: { status: 409, error: 'Un échange est déjà en cours avec ce joueur' },
    EMPTY_TRADE: { status: 400, error: 'Au moins un joueur doit proposer des cœurs ou des gemmes' },
    INSUFFICIENT_BALANCE: { status: 409, error: 'Solde insuffisant pour finaliser l’échange' },
    NOT_PARTICIPANT: { status: 403, error: 'Tu ne participes pas à cet échange' },
    INVALID_MESSAGE: { status: 400, error: `Message invalide (${MIN_MESSAGE_LEN}-${MAX_MESSAGE_LEN} caractères)` },
    NO_CLASS: { status: 400, error: 'Classe introuvable pour ce joueur' },
  };
  if (err?.message && map[err.message]) return map[err.message];
  return null;
}

async function getPlayerRow(playerId) {
  const row = await queryOne(
    `SELECT id, class_id, pseudo, is_active, health_points, power_points
       FROM gl_players
      WHERE id = ?
      LIMIT 1`,
    [playerId]
  );
  if (!row) {
    throw makeHttpError('PLAYER_NOT_FOUND', 404);
  }
  return row;
}

async function assertPeerInSameClass(selfPlayerId, peerPlayerId) {
  const self = await getPlayerRow(selfPlayerId);
  if (!self.class_id) {
    throw makeHttpError('NO_CLASS', 400);
  }
  const peer = await getPlayerRow(peerPlayerId);
  if (!peer.is_active) {
    throw makeHttpError('PEER_NOT_FOUND', 404);
  }
  if (Number(peer.class_id) !== Number(self.class_id)) {
    throw makeHttpError('PEER_WRONG_CLASS', 403);
  }
  return { self, peer, classId: Number(self.class_id) };
}

function formatSideRow(row, playersById) {
  const player = playersById.get(Number(row.player_id)) || {};
  return {
    playerId: Number(row.player_id),
    pseudo: player.pseudo || null,
    offerHealth: Number(row.offer_health) || 0,
    offerPower: Number(row.offer_power) || 0,
    accepted: !!Number(row.accepted),
    acceptedAt: row.accepted_at || null,
    healthPoints: player.health_points != null ? clampVitality(player.health_points) : null,
    powerPoints: player.power_points != null ? clampVitality(player.power_points) : null,
  };
}

function formatMessageRow(row, playersById) {
  const player = playersById.get(Number(row.author_player_id)) || {};
  return {
    id: Number(row.id),
    authorPlayerId: Number(row.author_player_id),
    authorPseudo: player.pseudo || null,
    body: row.body,
    createdAt: row.created_at,
  };
}

async function loadPlayersForTrade(trade) {
  const ids = [trade.player_low_id, trade.player_high_id];
  const rows = await queryAll(
    `SELECT id, pseudo, health_points, power_points
       FROM gl_players
      WHERE id IN (?, ?)`,
    ids
  );
  const map = new Map();
  for (const row of rows) {
    map.set(Number(row.id), row);
  }
  return map;
}

async function buildTradePayload(tradeId) {
  const trade = await queryOne('SELECT * FROM gl_market_trades WHERE id = ? LIMIT 1', [tradeId]);
  if (!trade) return null;

  const sides = await queryAll(
    'SELECT * FROM gl_market_trade_sides WHERE trade_id = ? ORDER BY player_id ASC',
    [tradeId]
  );
  const messages = await queryAll(
    'SELECT * FROM gl_market_trade_messages WHERE trade_id = ? ORDER BY id ASC',
    [tradeId]
  );
  const playersById = await loadPlayersForTrade(trade);

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
    sides: sides.map((row) => formatSideRow(row, playersById)),
    messages: messages.map((row) => formatMessageRow(row, playersById)),
  };
}

async function findActiveTradeForPair(classId, playerLowId, playerHighId) {
  return queryOne(
    `SELECT id FROM gl_market_trades
      WHERE class_id = ? AND player_low_id = ? AND player_high_id = ? AND status = 'negotiating'
      LIMIT 1`,
    [classId, playerLowId, playerHighId]
  );
}

async function settleTradeInTx(tx, tradeId) {
  const trade = await tx.queryOne(
    'SELECT * FROM gl_market_trades WHERE id = ? LIMIT 1 FOR UPDATE',
    [tradeId]
  );
  if (!trade || trade.status !== 'negotiating') {
    throw makeHttpError('TRADE_NOT_NEGOTIATING', 409);
  }

  const sides = await tx.queryAll(
    'SELECT * FROM gl_market_trade_sides WHERE trade_id = ? ORDER BY player_id ASC',
    [tradeId]
  );
  if (sides.length !== 2 || !sides.every((s) => Number(s.accepted) === 1)) {
    throw makeHttpError('TRADE_NOT_NEGOTIATING', 409);
  }

  const lowSide = sides.find((s) => Number(s.player_id) === Number(trade.player_low_id));
  const highSide = sides.find((s) => Number(s.player_id) === Number(trade.player_high_id));
  const lowHealth = Number(lowSide.offer_health) || 0;
  const lowPower = Number(lowSide.offer_power) || 0;
  const highHealth = Number(highSide.offer_health) || 0;
  const highPower = Number(highSide.offer_power) || 0;

  if (lowHealth + lowPower + highHealth + highPower === 0) {
    throw makeHttpError('EMPTY_TRADE', 400);
  }

  const playerLow = await tx.queryOne(
    'SELECT id, health_points, power_points FROM gl_players WHERE id = ? LIMIT 1 FOR UPDATE',
    [trade.player_low_id]
  );
  const playerHigh = await tx.queryOne(
    'SELECT id, health_points, power_points FROM gl_players WHERE id = ? LIMIT 1 FOR UPDATE',
    [trade.player_high_id]
  );

  if (!playerLow || !playerHigh) {
    throw makeHttpError('PLAYER_NOT_FOUND', 404);
  }

  if (
    clampVitality(playerLow.health_points) < lowHealth
    || clampVitality(playerLow.power_points) < lowPower
    || clampVitality(playerHigh.health_points) < highHealth
    || clampVitality(playerHigh.power_points) < highPower
  ) {
    throw makeHttpError('INSUFFICIENT_BALANCE', 409);
  }

  await applyPlayerVitalityDelta(tx, {
    playerId: trade.player_low_id,
    healthDelta: -lowHealth + highHealth,
    powerDelta: -lowPower + highPower,
  });
  await applyPlayerVitalityDelta(tx, {
    playerId: trade.player_high_id,
    healthDelta: -highHealth + lowHealth,
    powerDelta: -highPower + lowPower,
  });

  await tx.execute(
    `UPDATE gl_market_trades
        SET status = 'completed', completed_at = NOW(), updated_at = NOW()
      WHERE id = ?`,
    [tradeId]
  );
}

async function assertTradeParticipant(tradeId, playerId) {
  const trade = await queryOne('SELECT * FROM gl_market_trades WHERE id = ? LIMIT 1', [tradeId]);
  if (!trade) {
    throw makeHttpError('TRADE_NOT_FOUND', 404);
  }
  const pid = Number(playerId);
  if (pid !== Number(trade.player_low_id) && pid !== Number(trade.player_high_id)) {
    throw makeHttpError('NOT_PARTICIPANT', 403);
  }
  return trade;
}

async function listClassmates(playerId) {
  const self = await getPlayerRow(playerId);
  if (!self.class_id) return [];
  const rows = await queryAll(
    `SELECT id, pseudo, health_points, power_points
       FROM gl_players
      WHERE class_id = ? AND is_active = 1 AND id <> ?
      ORDER BY pseudo ASC`,
    [self.class_id, playerId]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    pseudo: row.pseudo,
    healthPoints: clampVitality(row.health_points),
    powerPoints: clampVitality(row.power_points),
  }));
}

async function listTradesForPlayer(playerId, { page = 1, pageSize = 20 } = {}) {
  const offset = (Math.max(1, page) - 1) * pageSize;
  const pid = Number(playerId);
  const totalRow = await queryOne(
    `SELECT COUNT(*) AS c FROM gl_market_trades
      WHERE (player_low_id = ? OR player_high_id = ?)
        AND status IN ('negotiating', 'completed')`,
    [pid, pid]
  );
  const rows = await queryAll(
    `SELECT id FROM gl_market_trades
      WHERE (player_low_id = ? OR player_high_id = ?)
        AND status IN ('negotiating', 'completed')
      ORDER BY
        CASE status WHEN 'negotiating' THEN 0 ELSE 1 END,
        updated_at DESC,
        id DESC
      LIMIT ${Number(pageSize)} OFFSET ${offset}`,
    [pid, pid]
  );
  const items = [];
  for (const row of rows) {
    const payload = await buildTradePayload(row.id);
    if (payload) items.push(payload);
  }
  return {
    items,
    page: Math.max(1, page),
    pageSize,
    total: Number(totalRow?.c || 0),
  };
}

async function createTrade(initiatorPlayerId, peerPlayerId) {
  const { classId } = await assertPeerInSameClass(initiatorPlayerId, peerPlayerId);
  const { low, high } = normalizePlayerPair(initiatorPlayerId, peerPlayerId);

  const existing = await findActiveTradeForPair(classId, low, high);
  if (existing) {
    const payload = await buildTradePayload(existing.id);
    const err = makeHttpError('ACTIVE_TRADE_EXISTS', 409);
    err.trade = payload;
    throw err;
  }

  const result = await withTransaction(async (tx) => {
    const insert = await tx.execute(
      `INSERT INTO gl_market_trades
        (class_id, player_low_id, player_high_id, status, initiator_player_id, created_at, updated_at)
       VALUES (?, ?, ?, 'negotiating', ?, NOW(), NOW())`,
      [classId, low, high, initiatorPlayerId]
    );
    const tradeId = Number(insert.insertId);
    await tx.execute(
      `INSERT INTO gl_market_trade_sides (trade_id, player_id, offer_health, offer_power, accepted)
       VALUES (?, ?, 0, 0, 0), (?, ?, 0, 0, 0)`,
      [tradeId, low, tradeId, high]
    );
    return tradeId;
  });

  return buildTradePayload(result);
}

async function updateOffer(tradeId, playerId, { offerHealth, offerPower }) {
  const health = parseOfferAmount(offerHealth);
  const power = parseOfferAmount(offerPower);

  await withTransaction(async (tx) => {
    const trade = await tx.queryOne(
      'SELECT * FROM gl_market_trades WHERE id = ? LIMIT 1 FOR UPDATE',
      [tradeId]
    );
    if (!trade) throw makeHttpError('TRADE_NOT_FOUND', 404);
    if (trade.status !== 'negotiating') throw makeHttpError('TRADE_NOT_NEGOTIATING', 409);
    const pid = Number(playerId);
    if (pid !== Number(trade.player_low_id) && pid !== Number(trade.player_high_id)) {
      throw makeHttpError('NOT_PARTICIPANT', 403);
    }
    if (trade.frozen_at) {
      throw makeHttpError('TRADE_FROZEN', 409);
    }
    await tx.execute(
      `UPDATE gl_market_trade_sides
          SET offer_health = ?, offer_power = ?
        WHERE trade_id = ? AND player_id = ?`,
      [health, power, tradeId, playerId]
    );
    await tx.execute('UPDATE gl_market_trades SET updated_at = NOW() WHERE id = ?', [tradeId]);
  });

  return buildTradePayload(tradeId);
}

async function setAccepted(tradeId, playerId, accepted) {
  let classId = null;

  await withTransaction(async (tx) => {
    const trade = await tx.queryOne(
      'SELECT * FROM gl_market_trades WHERE id = ? LIMIT 1 FOR UPDATE',
      [tradeId]
    );
    if (!trade) throw makeHttpError('TRADE_NOT_FOUND', 404);
    if (trade.status !== 'negotiating') throw makeHttpError('TRADE_NOT_NEGOTIATING', 409);
    classId = Number(trade.class_id);

    const pid = Number(playerId);
    if (pid !== Number(trade.player_low_id) && pid !== Number(trade.player_high_id)) {
      throw makeHttpError('NOT_PARTICIPANT', 403);
    }

    if (accepted) {
      await tx.execute(
        `UPDATE gl_market_trade_sides
            SET accepted = 1, accepted_at = NOW()
          WHERE trade_id = ? AND player_id = ?`,
        [tradeId, playerId]
      );
    } else {
      await tx.execute(
        `UPDATE gl_market_trade_sides
            SET accepted = 0, accepted_at = NULL
          WHERE trade_id = ? AND player_id = ?`,
        [tradeId, playerId]
      );
    }

    const sides = await tx.queryAll(
      'SELECT accepted FROM gl_market_trade_sides WHERE trade_id = ?',
      [tradeId]
    );
    const anyAccepted = sides.some((s) => Number(s.accepted) === 1);
    const allAccepted = sides.length === 2 && sides.every((s) => Number(s.accepted) === 1);

    if (anyAccepted && !trade.frozen_at) {
      await tx.execute(
        'UPDATE gl_market_trades SET frozen_at = NOW(), updated_at = NOW() WHERE id = ?',
        [tradeId]
      );
    } else if (!anyAccepted && trade.frozen_at) {
      await tx.execute(
        'UPDATE gl_market_trades SET frozen_at = NULL, updated_at = NOW() WHERE id = ?',
        [tradeId]
      );
    } else {
      await tx.execute('UPDATE gl_market_trades SET updated_at = NOW() WHERE id = ?', [tradeId]);
    }

    if (allAccepted) {
      await settleTradeInTx(tx, tradeId);
    }
  });

  const payload = await buildTradePayload(tradeId);
  return { trade: payload, classId };
}

async function cancelTrade(tradeId, playerId) {
  let classId = null;
  await withTransaction(async (tx) => {
    const trade = await tx.queryOne(
      'SELECT * FROM gl_market_trades WHERE id = ? LIMIT 1 FOR UPDATE',
      [tradeId]
    );
    if (!trade) throw makeHttpError('TRADE_NOT_FOUND', 404);
    if (trade.status !== 'negotiating') throw makeHttpError('TRADE_NOT_NEGOTIATING', 409);
    classId = Number(trade.class_id);
    const pid = Number(playerId);
    if (pid !== Number(trade.player_low_id) && pid !== Number(trade.player_high_id)) {
      throw makeHttpError('NOT_PARTICIPANT', 403);
    }
    await tx.execute(
      `UPDATE gl_market_trades SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
      [tradeId]
    );
  });
  const payload = await buildTradePayload(tradeId);
  return { trade: payload, classId };
}

async function appendMessage(tradeId, playerId, bodyRaw) {
  const body = String(bodyRaw || '').trim();
  if (body.length < MIN_MESSAGE_LEN || body.length > MAX_MESSAGE_LEN) {
    throw makeHttpError('INVALID_MESSAGE', 400);
  }

  const trade = await assertTradeParticipant(tradeId, playerId);
  if (trade.status !== 'negotiating') {
    throw makeHttpError('TRADE_NOT_NEGOTIATING', 409);
  }

  const result = await execute(
    `INSERT INTO gl_market_trade_messages (trade_id, author_player_id, body, created_at)
     VALUES (?, ?, ?, NOW())`,
    [tradeId, playerId, body]
  );
  await execute('UPDATE gl_market_trades SET updated_at = NOW() WHERE id = ?', [tradeId]);

  const message = await queryOne(
    'SELECT * FROM gl_market_trade_messages WHERE id = ? LIMIT 1',
    [result.insertId]
  );
  const playersById = await loadPlayersForTrade(trade);
  return {
    tradeId: Number(tradeId),
    classId: Number(trade.class_id),
    message: formatMessageRow(message, playersById),
  };
}

module.exports = {
  VITALITY_MAX,
  MIN_MESSAGE_LEN,
  MAX_MESSAGE_LEN,
  normalizePlayerPair,
  parseOfferAmount,
  resolveMarketError,
  listClassmates,
  listTradesForPlayer,
  createTrade,
  buildTradePayload,
  assertTradeParticipant,
  updateOffer,
  setAccepted,
  appendMessage,
  cancelTrade,
};
