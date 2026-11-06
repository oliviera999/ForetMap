'use strict';

/**
 * « Tenir à deux » v2 — état, profil, lignes d'Olu, retrait, tour à phases.
 * Préfixe réel : `/api/gl/games/:id/tenir/*` (monté par routes/gl/games.js).
 */

const express = require('express');
const db = require('../../../database');
const { queryAll, queryOne, execute, withTransaction } = db;
const {
  requireGlAuth,
  requireGlAuthOrProjection,
  requireGlPermission,
} = require('../../../middleware/requireGlAuth');
const { canAccessGlGame } = require('../../../lib/glGameAccess');
const { getGameplaySettings } = require('../../../lib/glSettings');
const { insertGameEvent } = require('../../../lib/glGameEvents');
const { emitGlGameEvent } = require('../../../lib/realtime');
const { parseId, normalizeOptionalString } = require('../../../lib/shared/httpHelpers');
const asyncHandler = require('../../../lib/asyncHandler');
const {
  TENIR_PROFILS,
  isTenirEnabled,
  isTenirGame,
  validateOverrides,
  resolveTenirSettings,
  isPlayerEnRetrait,
} = require('../../../lib/glTenir');
const { viewerFromAuth, buildTenirBlock } = require('../../../lib/glTenirView');
const { getPlayerGameMembership } = require('../../../lib/gl/gamesRuntime');

const router = express.Router();

const GAME_SELECT = `SELECT g.id, g.class_id, g.chapter_id, g.status, g.current_round_number,
       g.tenir_profil, g.tenir_overrides_json, g.tenir_surface, g.board_movement_mode,
       g.board_path_start_index, ch.plateau_number, ch.biome AS chapter_biome
  FROM gl_games g
  LEFT JOIN gl_chapters ch ON ch.id = g.chapter_id
 WHERE g.id = ? LIMIT 1`;

async function loadGame(gameId) {
  return queryOne(GAME_SELECT, [gameId]);
}

/** Partie en mode tenir, ou 409 `TENIR_DISABLED`. */
async function requireTenirGame(req, res, gameId) {
  const game = await loadGame(gameId);
  if (!game) {
    res.status(404).json({ error: 'Partie introuvable' });
    return null;
  }
  const settings = await getGameplaySettings();
  if (!isTenirGame(settings, game)) {
    res
      .status(409)
      .json({ error: 'La partie ne joue pas « Tenir à deux »', code: 'TENIR_DISABLED' });
    return null;
  }
  return { game, settings };
}

/** GET /tenir — état complet (réglages résolus, permissions, retraits visibles, bourses filtrées). */
router.get(
  '/games/:id/tenir',
  requireGlAuthOrProjection,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    if (!(await canAccessGlGame(req.glAuth, gameId))) {
      return res.status(403).json({ error: 'Accès partie refusé' });
    }
    const game = await loadGame(gameId);
    if (!game) return res.status(404).json({ error: 'Partie introuvable' });
    const settings = await getGameplaySettings();
    const viewer = viewerFromAuth(req.glAuth);
    let teamOfViewer = null;
    if (viewer.kind === 'player') {
      const membership = await getPlayerGameMembership(gameId, viewer.playerId);
      teamOfViewer = membership?.team_id != null ? Number(membership.team_id) : null;
    }
    const tenir = await buildTenirBlock(
      { queryOne, queryAll, execute },
      { game, settings, viewer, teamOfViewer },
    );
    return res.json({
      gameId,
      status: game.status,
      plateauNumber: game.plateau_number != null ? Number(game.plateau_number) : null,
      teamId: teamOfViewer,
      ...tenir,
    });
  }),
);

/** PUT /tenir/profil { profil, overrides } — MJ. */
router.put(
  '/games/:id/tenir/profil',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    const game = await loadGame(gameId);
    if (!game) return res.status(404).json({ error: 'Partie introuvable' });
    const settings = await getGameplaySettings();
    if (!isTenirEnabled(settings)) {
      return res
        .status(409)
        .json({ error: 'Mouture « Tenir à deux » désactivée', code: 'TENIR_DISABLED' });
    }
    const rawProfil = req.body?.profil;
    // `profil: null` explicite = retour aux règles classiques (`tenir_profil` remis à NULL) ;
    // absent = profil inchangé (ou `complet` si la partie n'en avait pas).
    let profil;
    if (rawProfil === null) profil = null;
    else if (rawProfil === undefined) profil = game.tenir_profil || 'complet';
    else profil = String(rawProfil).trim().toLowerCase();
    if (profil !== null && !TENIR_PROFILS.includes(profil)) {
      return res.status(400).json({ error: 'Profil invalide (complet, prologue, ou null)' });
    }
    const checked = validateOverrides(req.body?.overrides);
    if (checked.error) return res.status(400).json({ error: checked.error });
    const overrides = req.body?.overrides === undefined ? null : checked.value;
    const nextGame = {
      ...game,
      tenir_profil: profil,
      tenir_overrides_json:
        overrides === null ? game.tenir_overrides_json : JSON.stringify(overrides),
    };
    const resolved = resolveTenirSettings(settings, nextGame);
    await execute(
      `UPDATE gl_games SET tenir_profil = ?, tenir_overrides_json = ?, tenir_surface = ?, updated_at = NOW() WHERE id = ?`,
      [profil, nextGame.tenir_overrides_json, resolved.surface, gameId],
    );
    const evt = await insertGameEvent(db, {
      gameId,
      actorType: 'mj',
      actorId: String(req.glAuth.userId),
      eventType: 'tenir_profil',
      payload: { profil, surface: resolved.surface, overrides: resolved.overrides },
    });
    emitGlGameEvent(gameId, evt);
    return res.json({ ok: true, profil, surface: resolved.surface, settings: resolved });
  }),
);

/** GET /tenir/olu — lignes d'Olu actives (cache 5 min). */
let oluCache = { at: 0, lignes: null };
const OLU_CACHE_MS = 5 * 60 * 1000;

async function loadOluLignes() {
  if (oluCache.lignes && Date.now() - oluCache.at < OLU_CACHE_MS) return oluCache.lignes;
  let rows = [];
  try {
    rows = await queryAll(
      'SELECT id, moment, expression, texte, variables_json, correction FROM gl_tenir_olu_lignes WHERE actif = 1 ORDER BY id ASC',
    );
  } catch (_) {
    rows = [];
  }
  const lignes = rows.map((r) => ({
    id: String(r.id),
    moment: String(r.moment),
    expression: String(r.expression || 'neutre'),
    texte: String(r.texte || ''),
    variables: safeArray(r.variables_json),
    // La correction d'une erreur volontaire n'est jamais servie au client avant qu'une
    // équipe corrige : elle voyage par l'événement `olu_corrige`.
  }));
  oluCache = { at: Date.now(), lignes };
  return lignes;
}

function safeArray(raw) {
  try {
    const v = JSON.parse(String(raw || '[]'));
    return Array.isArray(v) ? v : [];
  } catch (_) {
    return [];
  }
}

function invalidateOluCache() {
  oluCache = { at: 0, lignes: null };
}

router.get(
  '/games/:id/tenir/olu',
  requireGlAuthOrProjection,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    if (!(await canAccessGlGame(req.glAuth, gameId))) {
      return res.status(403).json({ error: 'Accès partie refusé' });
    }
    const lignes = await loadOluLignes();
    const { EVENT_MOMENTS } = require('../../../lib/glTenirOlu');
    res.set('Cache-Control', 'private, max-age=300');
    return res.json({ lignes, moments: EVENT_MOMENTS });
  }),
);

/**
 * POST /tenir/retrait { playerId, entree: true|false, motif } — MJ.
 * Conduite, hors économie : aucune bourse touchée ; le motif n'entre jamais dans un payload.
 */
router.post(
  '/games/:id/tenir/retrait',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const playerId = parseId(req.body?.playerId);
    if (!gameId || !playerId) return res.status(400).json({ error: 'gameId et playerId requis' });
    const ctx = await requireTenirGame(req, res, gameId);
    if (!ctx) return undefined;
    const entree = req.body?.entree !== false;
    const motif = normalizeOptionalString(req.body?.motif);
    const member = await queryOne(
      `SELECT p.id FROM gl_players p INNER JOIN gl_games g ON g.class_id = p.class_id WHERE p.id = ? AND g.id = ? LIMIT 1`,
      [playerId, gameId],
    );
    if (!member)
      return res
        .status(409)
        .json({ error: 'Le joueur n’appartient pas à la classe de cette partie' });
    const already = await isPlayerEnRetrait(db, gameId, playerId);
    if (entree && already) return res.status(409).json({ error: 'Joueur déjà en retrait' });
    if (!entree && !already) return res.status(409).json({ error: 'Joueur non en retrait' });
    let evt = null;
    await withTransaction(async (tx) => {
      if (entree) {
        await tx.execute(
          'INSERT INTO gl_game_retraits (game_id, player_id, motif, entree_at) VALUES (?, ?, ?, NOW())',
          [gameId, playerId, motif],
        );
      } else {
        await tx.execute(
          'UPDATE gl_game_retraits SET sortie_at = NOW() WHERE game_id = ? AND player_id = ? AND sortie_at IS NULL',
          [gameId, playerId],
        );
      }
      evt = await insertGameEvent(tx, {
        gameId,
        actorType: 'mj',
        actorId: String(req.glAuth.userId),
        eventType: 'retrait',
        // `private` : seul le prof voit l'identité ; les élèves ne reçoivent que `entree`.
        payload: { playerId, entree, private: true, publicKeys: ['entree'] },
      });
    });
    emitGlGameEvent(gameId, { ...evt, payload: { entree, redacted: true } });
    return res.json({ ok: true, playerId, entree });
  }),
);

module.exports = router;
module.exports.loadOluLignes = loadOluLignes;
module.exports.invalidateOluCache = invalidateOluCache;
module.exports.requireTenirGame = requireTenirGame;
module.exports.GAME_SELECT = GAME_SELECT;
