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
const { listTradableFeuilletsForPlayer } = require('../../lib/glMarketFeuillets');
const marketPlace = require('../../lib/glMarketPlace');
const { isPlayerEnRetrait, isTenirGame, resolveTenirSettings } = require('../../lib/glTenir');
const { getGameplaySettings } = require('../../lib/glSettings');
const { queryOne } = require('../../database');
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

/**
 * « Tenir à deux » (spec § 8-9) : un élève en retrait ne voit pas le Marché (403
 * `MARCHE_RETRAIT`) ; une partie en profil `prologue` (`marche: false`) le ferme aussi.
 */
router.use(
  asyncHandler(async (req, res, next) => {
    const playerId = Number(req.glAuth.userId);
    const live = await marketPlace.findLiveGameForClass(req.glAuth.classId);
    if (!live) return next();
    const settings = await getGameplaySettings();
    if (!isTenirGame(settings, live)) return next();
    if (resolveTenirSettings(settings, live).marche === false) {
      return res
        .status(403)
        .json({ error: 'Le Marché est fermé pour cette partie', code: 'MARCHE_FERME' });
    }
    if (await isPlayerEnRetrait({ queryOne }, Number(live.id), playerId)) {
      return res
        .status(403)
        .json({ error: 'En retrait jusqu’à nouvel ordre', code: 'MARCHE_RETRAIT' });
    }
    return next();
  }),
);

function handleMarketPlaceError(err, res) {
  const mapped = marketPlace.resolveMarketPlaceError(err) || resolveMarketError(err);
  if (mapped) return res.status(mapped.status).json({ error: mapped.error });
  if (err?.message === 'INVALID_AMOUNT') return res.status(400).json({ error: 'Montant invalide' });
  throw err;
}

/** Place publique : annonces ouvertes de la classe. */
router.get(
  '/annonces',
  asyncHandler(async (req, res) => {
    try {
      const items = await marketPlace.listAnnonces(Number(req.glAuth.userId));
      return res.json({ items });
    } catch (err) {
      return handleMarketPlaceError(err, res);
    }
  }),
);

router.post(
  '/annonces',
  asyncHandler(async (req, res) => {
    try {
      const annonce = await marketPlace.createAnnonce(Number(req.glAuth.userId), {
        type: req.body?.type,
        cherche: req.body?.cherche,
        offre: req.body?.offre,
      });
      emitGlMarketTradeChanged(req.glAuth.classId, { action: 'annonce', annonceId: annonce.id });
      return res.status(201).json(annonce);
    } catch (err) {
      return handleMarketPlaceError(err, res);
    }
  }),
);

router.delete(
  '/annonces/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
    try {
      await marketPlace.deleteAnnonce(Number(req.glAuth.userId), id);
      emitGlMarketTradeChanged(req.glAuth.classId, { action: 'annonce', annonceId: id });
      return res.json({ ok: true });
    } catch (err) {
      return handleMarketPlaceError(err, res);
    }
  }),
);

/** Répondre à une annonce → échange à deux pré-rempli. */
router.post(
  '/annonces/:id/repondre',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
    try {
      const trade = await marketPlace.repondreAnnonce(Number(req.glAuth.userId), id);
      emitGlMarketTradeChanged(trade.classId, { tradeId: trade.id, action: 'created' });
      return res.status(201).json(trade);
    } catch (err) {
      return handleMarketPlaceError(err, res);
    }
  }),
);

/** Don immédiat : une ressource ou une page à la fois. */
router.post(
  '/dons',
  asyncHandler(async (req, res) => {
    try {
      const result = await marketPlace.donner(Number(req.glAuth.userId), {
        receveurId: req.body?.receveurId,
        gemmes: req.body?.gemmes,
        coeurs: req.body?.coeurs,
        feuilletCode: req.body?.feuilletCode,
      });
      emitGlMarketTradeChanged(req.glAuth.classId, { action: 'don' });
      return res.status(201).json(result);
    } catch (err) {
      return handleMarketPlaceError(err, res);
    }
  }),
);

/** Comptoir des parures. */
router.get(
  '/parures',
  asyncHandler(async (req, res) => {
    try {
      return res.json(await marketPlace.listParures(Number(req.glAuth.userId)));
    } catch (err) {
      return handleMarketPlaceError(err, res);
    }
  }),
);

router.post(
  '/parures/:code/acheter',
  asyncHandler(async (req, res) => {
    try {
      const result = await marketPlace.acheterParure(
        Number(req.glAuth.userId),
        String(req.params.code || ''),
        req.body?.ressource,
      );
      emitGlMarketTradeChanged(req.glAuth.classId, { action: 'parure' });
      return res.status(201).json({
        id: result.id,
        code: result.code,
        teamId: result.teamId,
        prix: result.prix,
        ressource: result.ressource,
      });
    } catch (err) {
      return handleMarketPlaceError(err, res);
    }
  }),
);

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

router.get(
  '/classmates',
  asyncHandler(async (req, res) => {
    try {
      const items = await listClassmates(playerIdFromReq(req));
      return res.json({ items });
    } catch (err) {
      return handleMarketError(err, res);
    }
  }),
);

/** Feuillets que le joueur peut proposer (son carnet personnel). */
router.get(
  '/feuillets',
  asyncHandler(async (req, res) => {
    try {
      const items = await listTradableFeuilletsForPlayer(playerIdFromReq(req));
      return res.json({ items });
    } catch (err) {
      return handleMarketError(err, res);
    }
  }),
);

router.get(
  '/trades',
  validate({ query: glMarketTradesQuerySchema }),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = req.validatedQuery;
    const data = await listTradesForPlayer(playerIdFromReq(req), { page, pageSize });
    return res.json(data);
  }),
);

router.post(
  '/trades',
  asyncHandler(async (req, res) => {
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
  }),
);

router.get(
  '/trades/:id',
  asyncHandler(async (req, res) => {
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
      return handleMarketError(err, res);
    }
  }),
);

router.patch(
  '/trades/:id/offer',
  asyncHandler(async (req, res) => {
    try {
      const tradeId = Number(req.params.id);
      if (!Number.isFinite(tradeId)) {
        return res.status(400).json({ error: 'Identifiant invalide' });
      }
      const trade = await updateOffer(tradeId, playerIdFromReq(req), {
        offerHealth: req.body?.offerHealth,
        offerPower: req.body?.offerPower,
        offerFeuillets: req.body?.offerFeuillets,
      });
      emitGlMarketTradeChanged(trade.classId, { tradeId: trade.id, action: 'offer_updated' });
      return res.json(trade);
    } catch (err) {
      return handleMarketError(err, res);
    }
  }),
);

router.patch(
  '/trades/:id/accept',
  asyncHandler(async (req, res) => {
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
      return handleMarketError(err, res);
    }
  }),
);

router.post(
  '/trades/:id/messages',
  asyncHandler(async (req, res) => {
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
      return handleMarketError(err, res);
    }
  }),
);

router.post(
  '/trades/:id/cancel',
  asyncHandler(async (req, res) => {
    try {
      const tradeId = Number(req.params.id);
      if (!Number.isFinite(tradeId)) {
        return res.status(400).json({ error: 'Identifiant invalide' });
      }
      const { trade, classId } = await cancelTrade(tradeId, playerIdFromReq(req));
      emitGlMarketTradeChanged(classId, { tradeId: trade.id, action: 'cancelled' });
      return res.json(trade);
    } catch (err) {
      return handleMarketError(err, res);
    }
  }),
);

module.exports = router;
module.exports.glMarketTradesQuerySchema = glMarketTradesQuerySchema; // exporté pour test no-DB du contrat O7
