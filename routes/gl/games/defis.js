'use strict';

/**
 * « Tenir à deux », lot 3, § 8.4 — défis de la Trame. Préfixe réel `/api/gl/games/:id/defis`
 * (monté par routes/gl/games.js).
 *
 * - `GET  /games/:id/defis` : défis disponibles selon le peuple, le plateau, la progression, et
 *   le compteur hebdomadaire de pages ;
 * - `POST /games/:id/defis { type, unite, mode, teamId? }` : crée ou reprend ;
 * - `GET  /games/:id/defis/suivi` (prof, `?format=csv`) : unités réussies et indices par élève ;
 * - `GET  /games/:id/defis/:defiId` : l'état et le modèle **sans les solutions** ;
 * - `PUT  /games/:id/defis/:defiId { revision, etat }` : sauvegarde stricte (409 `edit_conflict`) ;
 * - `POST /games/:id/defis/:defiId/indice` : l'indice suivant.
 *
 * Qui joue : un élève avec son compte (mode `individuel`, à tout moment) ; le prof ou une
 * tablette d'équipe **hors tour ouvert** pour une équipe (mode `equipe`). Le serveur rejoue
 * les droits ; aucune ressource n'est jamais créée.
 */

const express = require('express');
const db = require('../../../database');
const {
  requireGlAuthOrTeam,
  requireGlPermission,
  isMj,
} = require('../../../middleware/requireGlAuth');
const { canAccessGlGame } = require('../../../lib/glGameAccess');
const { parseId } = require('../../../lib/shared/httpHelpers');
const asyncHandler = require('../../../lib/asyncHandler');
const { emitGlGameEvent } = require('../../../lib/realtime');
const { resolveTenirSettings } = require('../../../lib/glTenir');
const { actorOf } = require('../../../lib/glActeur');
const { queueGlRewards } = require('../../../lib/glRewardsHooks');
const { requireTenirGame } = require('./tenir');
const defis = require('../../../lib/glTrameDefis');

const router = express.Router();

const MESSAGES = Object.freeze({
  DEFIS_FERMES: 'Les défis de la Trame ne sont pas ouverts pour cette partie.',
  DEFIS_EQUIPE_FERMES: 'Les défis en équipe ne sont pas ouverts pour cette partie.',
  DEFI_TYPE_INCONNU: 'Défi inconnu.',
  DEFI_MODE_INCONNU: 'Mode de défi inconnu.',
  DEFI_AUTRE_PEUPLE: 'Ce défi est celui de l’autre peuple.',
  DEFI_UNITE_INCONNUE: 'Ce défi n’existe pas sur ce plateau.',
  DEFI_NIVEAU_FERME: 'Ce niveau s’ouvre quand le précédent est tissé.',
  DEFI_INTROUVABLE: 'Défi introuvable dans cette partie.',
  DEFI_AUTRE_PORTEUR: 'Ce défi est celui de quelqu’un d’autre.',
  DEFI_EQUIPE_RESERVE: 'Un défi en équipe se lance avec le prof ou sur la tablette de l’équipe.',
  DEFI_TOUR_OUVERT: 'Le tour est ouvert : les défis attendent la fin du tour.',
  DEFI_COMPTE_REQUIS: 'Compte requis pour ce défi.',
  edit_conflict: 'Ce défi a été modifié ailleurs : il est rechargé.',
});

function refuser(res, err) {
  const message = MESSAGES[err?.message];
  if (!message || !err.status) throw err;
  return res.status(err.status).json({
    error: message,
    code: err.message,
    ...(err.revision != null ? { revision: err.revision } : {}),
  });
}

function refus(code, status) {
  const err = new Error(code);
  err.status = status;
  return err;
}

/** Partie « Tenir » accessible, avec son plateau et ses réglages résolus. */
async function contexte(req, res) {
  const gameId = parseId(req.params.id);
  if (!gameId) {
    res.status(400).json({ error: 'Identifiant de partie invalide' });
    return null;
  }
  if (!(await canAccessGlGame(req.glAuth, gameId))) {
    res.status(403).json({ error: 'Accès partie refusé' });
    return null;
  }
  const ctx = await requireTenirGame(req, res, gameId);
  if (!ctx) return null;
  return { gameId, game: ctx.game, resolved: resolveTenirSettings(ctx.settings, ctx.game) };
}

/**
 * Qui porte le défi : `{ mode, team, playerId }`. Un élève joue pour lui ; une tablette d'équipe
 * (hors tour ouvert) et le prof jouent pour une équipe.
 */
async function porteur(req, ctx, { teamIdDemande = null } = {}) {
  const actor = actorOf(req);
  if (actor.kind === 'player') {
    const membre = await db.queryOne(
      'SELECT team_id FROM gl_team_members WHERE game_id = ? AND player_id = ? LIMIT 1',
      [ctx.gameId, actor.playerId],
    );
    if (!membre?.team_id) throw refus('DEFI_COMPTE_REQUIS', 403);
    return {
      mode: 'individuel',
      playerId: Number(actor.playerId),
      team: await defis.loadTeam(db, ctx.gameId, membre.team_id),
    };
  }
  if (actor.kind === 'team') {
    if (Number(actor.gameId) !== Number(ctx.gameId)) throw refus('DEFI_COMPTE_REQUIS', 403);
    if (await defis.tourOuvert(db, ctx.gameId)) throw refus('DEFI_TOUR_OUVERT', 409);
    return {
      mode: 'equipe',
      playerId: null,
      team: await defis.loadTeam(db, ctx.gameId, actor.teamId),
    };
  }
  if (isMj(req)) {
    const team = teamIdDemande ? await defis.loadTeam(db, ctx.gameId, teamIdDemande) : null;
    return { mode: 'equipe', playerId: null, team, prof: true };
  }
  throw refus('DEFI_COMPTE_REQUIS', 403);
}

/** Le défi `row` est-il celui de l'acteur ? (le prof lit tout, et joue les défis d'équipe) */
async function assertPorteurDuDefi(req, ctx, row, { ecriture = false } = {}) {
  if (isMj(req)) {
    if (ecriture && String(row.mode) !== 'equipe') throw refus('DEFI_AUTRE_PORTEUR', 403);
    return;
  }
  const p = await porteur(req, ctx);
  const attendu = defis.porteurDe(p.mode, { playerId: p.playerId, teamId: p.team?.id });
  if (String(row.porteur) !== attendu) throw refus('DEFI_AUTRE_PORTEUR', 403);
}

router.get(
  '/games/:id/defis',
  requireGlAuthOrTeam,
  asyncHandler(async (req, res) => {
    const ctx = await contexte(req, res);
    if (!ctx) return undefined;
    try {
      // Une tablette d'équipe lit la liste même pendant un tour (elle n'y joue qu'après).
      const actor = actorOf(req);
      const p =
        actor.kind === 'team'
          ? {
              mode: 'equipe',
              playerId: null,
              team: await defis.loadTeam(db, ctx.gameId, actor.teamId),
            }
          : await porteur(req, ctx, { teamIdDemande: parseId(req.query.teamId) });
      const liste = await defis.listDefis(db, {
        game: ctx.game,
        resolved: ctx.resolved,
        team: p.team,
        playerId: p.playerId,
        mode: p.mode,
      });
      return res.json({
        ...liste,
        mode: p.mode,
        teamId: p.team ? Number(p.team.id) : null,
        tourOuvert: await defis.tourOuvert(db, ctx.gameId),
      });
    } catch (err) {
      return refuser(res, err);
    }
  }),
);

router.post(
  '/games/:id/defis',
  requireGlAuthOrTeam,
  asyncHandler(async (req, res) => {
    const ctx = await contexte(req, res);
    if (!ctx) return undefined;
    try {
      const p = await porteur(req, ctx, { teamIdDemande: parseId(req.body?.teamId) });
      const mode = String(req.body?.mode || p.mode);
      // Le mode découle de l'acteur : un élève ne lance pas un défi d'équipe depuis son compte.
      if (mode !== p.mode) {
        throw refus(mode === 'equipe' ? 'DEFI_EQUIPE_RESERVE' : 'DEFI_MODE_INCONNU', 403);
      }
      if (!p.team) return res.status(400).json({ error: 'teamId requis pour le prof' });
      const defi = await defis.creerOuReprendre(db, {
        game: ctx.game,
        resolved: ctx.resolved,
        team: p.team,
        playerId: p.playerId,
        mode: p.mode,
        type: String(req.body?.type || ''),
        unite: String(req.body?.unite || ''),
      });
      return res.status(201).json({ defi });
    } catch (err) {
      return refuser(res, err);
    }
  }),
);

router.get(
  '/games/:id/defis/suivi',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const ctx = await contexte(req, res);
    if (!ctx) return undefined;
    const data = await defis.suivi(db, ctx.gameId);
    if (String(req.query.format || '') === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="defis-trame-${ctx.gameId}.csv"`);
      return res.send(`﻿${defis.suiviCsv(data)}`);
    }
    return res.json(data);
  }),
);

router.get(
  '/games/:id/defis/:defiId',
  requireGlAuthOrTeam,
  asyncHandler(async (req, res) => {
    const ctx = await contexte(req, res);
    if (!ctx) return undefined;
    const defiId = parseId(req.params.defiId);
    if (!defiId) return res.status(400).json({ error: 'Identifiant de défi invalide' });
    try {
      const row = await defis.loadDefi(db, ctx.gameId, defiId);
      await assertPorteurDuDefi(req, ctx, row);
      return res.json({ defi: await defis.lireDefi(db, { gameId: ctx.gameId, row }) });
    } catch (err) {
      return refuser(res, err);
    }
  }),
);

router.put(
  '/games/:id/defis/:defiId',
  requireGlAuthOrTeam,
  asyncHandler(async (req, res) => {
    const ctx = await contexte(req, res);
    if (!ctx) return undefined;
    const defiId = parseId(req.params.defiId);
    if (!defiId) return res.status(400).json({ error: 'Identifiant de défi invalide' });
    if (!Number.isInteger(req.body?.revision) || req.body.revision < 0) {
      return res.status(400).json({ error: 'revision (entier) requise' });
    }
    try {
      const row = await defis.loadDefi(db, ctx.gameId, defiId);
      await assertPorteurDuDefi(req, ctx, row, { ecriture: true });
      const result = await defis.enregistrer(db, {
        game: ctx.game,
        resolved: ctx.resolved,
        defiId,
        revision: req.body.revision,
        etat: req.body?.etat,
      });
      for (const evt of result.events) emitGlGameEvent(ctx.gameId, evt);
      // Badges de la Trame : hors transaction, jamais bloquant.
      if (result.premiers.length) {
        queueGlRewards(result.premiers, {
          families: ['trame'],
          source: { type: 'defi_trame', ref: String(defiId) },
          reason: 'defi_trame',
        });
      }
      return res.json({ defi: result.defi, reussite: result.reussite });
    } catch (err) {
      return refuser(res, err);
    }
  }),
);

router.post(
  '/games/:id/defis/:defiId/indice',
  requireGlAuthOrTeam,
  asyncHandler(async (req, res) => {
    const ctx = await contexte(req, res);
    if (!ctx) return undefined;
    const defiId = parseId(req.params.defiId);
    if (!defiId) return res.status(400).json({ error: 'Identifiant de défi invalide' });
    try {
      const row = await defis.loadDefi(db, ctx.gameId, defiId);
      await assertPorteurDuDefi(req, ctx, row, { ecriture: true });
      return res.json(await defis.demanderIndice(db, { game: ctx.game, defiId }));
    } catch (err) {
      return refuser(res, err);
    }
  }),
);

module.exports = router;
