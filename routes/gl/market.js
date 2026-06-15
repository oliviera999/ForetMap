'use strict';

const express = require('express');
const { requireGlAuth } = require('../../middleware/requireGlAuth');
const { requireGlMarket, requireGlPlayer } = require('../../middleware/requireGlMarket');
const { emitGlMarketTradeChanged } = require('../../lib/realtime');
const {
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
} = require('../../lib/glMarket');
const { parsePageQuery } = require('../../lib/shared/httpHelpers');
const { z, validate } = require('../../lib/validate');
const asyncHandler = require('../../lib/asyncHandler');

const router = express.Router();

// O7 — pagination de GET /trades : coercition permissive (jamais de 400 pour une query
// invalide) reproduisant exactement `parsePageQuery` : `page` ≥ 1 (repli 1), `page_size`
// borné à [1, 50] (repli 20), `offset` dérivé (non utilisé par le handler, qui transmet
// page/pageSize à listTradesForPlayer).
const glMarketTradesQuerySchema = z
  .object({ page: z.unknown().optional(), page_size: z.unknown().optional() })
  .transform((q) => parsePageQuery(q, { defaultPageSize: 20, maxPageSize: 50 }));

router.use(requireGlAuth);
router.use(requireGlMarket);
router.use(requireGlPlayer);

function handleMarketError(err, res) {
  const mapped = resolveMarketError(err);
  if (mapped) {
    const body = { error: mapped.error };
    if (err.trade) body.trade = err.trade;
    return res.status(mapped.status).json(body);
  }
  throw err;
}

function playerIdFromReq(req) {
  return Number(req.glAuth.userId);
}

router.get('/classmates', asyncHandler(async (req, res) => {
  try {
    const items = await listClassmates(playerIdFromReq(req));
    return res.json({ items });
  } catch (err) {
    const mapped = resolveMarketError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
    throw err;
  }
}));

router.get('/trades', validate({ query: glMarketTradesQuerySchema }), asyncHandler(async (req, res) => {
  const { page, pageSize } = req.validatedQuery;
  const data = await listTradesForPlayer(playerIdFromReq(req), { page, pageSize });
  return res.json(data);
}));

router.post('/trades', asyncHandler(async (req, res) => {
  try {
    const peerPlayerId = Number(req.body?.peerPlayerId);
    if (!Number.isFinite(peerPlayerId) || peerPlayerId <= 0) {
      return res.status(400).json({ error: 'peerPlayerId invalide' });
    }
    const trade = await createTrade(playerIdFromReq(req), peerPlayerId);
    emitGlMarketTradeChanged(trade.classId, { tradeId: trade.id, action: 'created' });
    return res.status(201).json(trade);
  } catch (err) {
    return handleMarketError(err, res);
  }
}));

router.get('/trades/:id', asyncHandler(async (req, res) => {
  try {
    const tradeId = Number(req.params.id);
    if (!Number.isFinite(tradeId)) {
      return res.status(400).json({ error: 'Identifiant invalide' });
    }
    await assertTradeParticipant(tradeId, playerIdFromReq(req));
    const trade = await buildTradePayload(tradeId);
    if (!trade) return res.status(404).json({ error: 'Échange introuvable' });
    return res.json(trade);
  } catch (err) {
    const mapped = resolveMarketError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
    throw err;
  }
}));

router.patch('/trades/:id/offer', asyncHandler(async (req, res) => {
  try {
    const tradeId = Number(req.params.id);
    if (!Number.isFinite(tradeId)) {
      return res.status(400).json({ error: 'Identifiant invalide' });
    }
    const trade = await updateOffer(tradeId, playerIdFromReq(req), {
      offerHealth: req.body?.offerHealth,
      offerPower: req.body?.offerPower,
    });
    emitGlMarketTradeChanged(trade.classId, { tradeId: trade.id, action: 'offer_updated' });
    return res.json(trade);
  } catch (err) {
    const mapped = resolveMarketError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
    throw err;
  }
}));

router.patch('/trades/:id/accept', asyncHandler(async (req, res) => {
  try {
    const tradeId = Number(req.params.id);
    if (!Number.isFinite(tradeId)) {
      return res.status(400).json({ error: 'Identifiant invalide' });
    }
    const accepted = req.body?.accepted === true;
    const { trade, classId } = await setAccepted(tradeId, playerIdFromReq(req), accepted);
    emitGlMarketTradeChanged(classId, {
      tradeId: trade.id,
      action: trade.status === 'completed' ? 'completed' : 'accept_updated',
    });
    return res.json(trade);
  } catch (err) {
    const mapped = resolveMarketError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
    throw err;
  }
}));

router.post('/trades/:id/messages', asyncHandler(async (req, res) => {
  try {
    const tradeId = Number(req.params.id);
    if (!Number.isFinite(tradeId)) {
      return res.status(400).json({ error: 'Identifiant invalide' });
    }
    const result = await appendMessage(tradeId, playerIdFromReq(req), req.body?.body);
    emitGlMarketTradeChanged(result.classId, { tradeId, action: 'message' });
    const trade = await buildTradePayload(tradeId);
    return res.status(201).json({ message: result.message, trade });
  } catch (err) {
    const mapped = resolveMarketError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
    throw err;
  }
}));

router.post('/trades/:id/cancel', asyncHandler(async (req, res) => {
  try {
    const tradeId = Number(req.params.id);
    if (!Number.isFinite(tradeId)) {
      return res.status(400).json({ error: 'Identifiant invalide' });
    }
    const { trade, classId } = await cancelTrade(tradeId, playerIdFromReq(req));
    emitGlMarketTradeChanged(classId, { tradeId: trade.id, action: 'cancelled' });
    return res.json(trade);
  } catch (err) {
    const mapped = resolveMarketError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
    throw err;
  }
}));

module.exports = router;
module.exports.glMarketTradesQuerySchema = glMarketTradesQuerySchema; // exporté pour test no-DB du contrat O7
