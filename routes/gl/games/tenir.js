'use strict';

/**
 * « Tenir à deux » v2 — état, profil, lignes d'Olu, retrait, mot de passe provisoire d'un élève.
 * Préfixe réel : `/api/gl/games/:id/tenir/*` (monté par routes/gl/games.js).
 */

const express = require('express');
const db = require('../../../database');
const { queryAll, queryOne, execute, withTransaction } = db;
const {
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
  parseOverrides,
} = require('../../../lib/glTenir');
const escalier = require('../../../lib/glEscalier');
const { viewerFromAuth, buildTenirBlock } = require('../../../lib/glTenirView');
const { getPlayerGameMembership } = require('../../../lib/gl/gamesRuntime');
const { buildGeneratedPassword } = require('../../../lib/gl/adminRouteHelpers');
const { setGlPlayerPassword } = require('../../../lib/glPlayerIdentity');
const { logAudit } = require('../../../lib/auditLog');

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
    } else if (viewer.kind === 'team') {
      teamOfViewer = viewer.teamId ?? null;
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
      return res.status(400).json({ error: 'Profil invalide (complet, court, ou null)' });
    }
    const checked = validateOverrides(req.body?.overrides);
    if (checked.error) return res.status(400).json({ error: checked.error });
    // L'escalier du chapitre 1 (M8) se coupe ou se remet ici ; son pas ne se choisit pas (il
    // avance à la clôture d'un tour ou par « Ouvrir la suite », et ne recule jamais).
    // Les surcharges se relisent et se réécrivent sous le verrou de la partie : sans lui, un
    // tour clos entre la lecture et l'écriture voyait son pas d'escalier remplacé par l'ancien.
    let resolved = null;
    await withTransaction(async (tx) => {
      const row = await tx.queryOne(
        'SELECT tenir_overrides_json FROM gl_games WHERE id = ? LIMIT 1 FOR UPDATE',
        [gameId],
      );
      const enBase = row ? row.tenir_overrides_json : game.tenir_overrides_json;
      const overrides =
        req.body?.overrides === undefined
          ? null
          : escalier.surchargesDuProf(checked.value, {
              actuelles: parseOverrides(enBase),
              toursClos: await escalier.toursClos(tx, gameId),
            });
      const nextGame = {
        ...game,
        tenir_profil: profil,
        tenir_overrides_json: overrides === null ? enBase : JSON.stringify(overrides),
      };
      resolved = resolveTenirSettings(settings, nextGame);
      await tx.execute(
        `UPDATE gl_games SET tenir_profil = ?, tenir_overrides_json = ?, tenir_surface = ?, updated_at = NOW() WHERE id = ?`,
        [profil, nextGame.tenir_overrides_json, resolved.surface, gameId],
      );
    });
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

/**
 * POST /tenir/escalier/suite { pas? } — MJ (ensemble unifié, M8). « Ouvrir la suite » :
 * l'escalier du chapitre 1 monte d'une marche tout de suite, sans attendre la clôture du tour.
 * Jamais de retour en arrière. `pas` = la séance que l'écran affichait : si l'escalier a déjà
 * avancé depuis (double appui, deux onglets, tour clos entre-temps), rien ne monte et la réponse
 * rend l'état courant (`deja: true`) — un appui n'ouvre jamais deux marches. 409
 * `ESCALIER_INACTIF` si la partie ne monte pas l'escalier, `ESCALIER_MONTE` s'il est déjà en haut.
 */
router.post(
  '/games/:id/tenir/escalier/suite',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    const ctx = await requireTenirGame(req, res, gameId);
    if (!ctx) return undefined;
    const avant = escalier.vueEscalier(resolveTenirSettings(ctx.settings, ctx.game));
    if (!avant) {
      return res
        .status(409)
        .json({ error: 'Cette partie ne monte pas l’escalier.', code: 'ESCALIER_INACTIF' });
    }
    if (avant.monte) {
      return res.status(409).json({ error: 'Tout est déjà ouvert.', code: 'ESCALIER_MONTE' });
    }
    const pasVu = req.body?.pas;
    if (pasVu != null && !(Number.isInteger(Number(pasVu)) && Number(pasVu) >= 1)) {
      return res.status(400).json({ error: 'Séance de l’escalier invalide' });
    }
    const events = [];
    let marche = null;
    await withTransaction(async (tx) => {
      marche = await escalier.avancerTx(tx, {
        gameId,
        motif: 'prof',
        actorId: String(req.glAuth.userId),
        roundNumber: Number(ctx.game.current_round_number) || null,
        depuis: pasVu != null ? Number(pasVu) : null,
      });
      if (!marche) return;
      events.push(...marche.events);
      // La page témoin arrive avec la séance 3 : si un tour est ouvert, elle se pose tout de
      // suite ; sinon l'ouverture du prochain tour s'en charge.
      const game = await tx.queryOne(GAME_SELECT, [gameId]);
      const round = await tx.queryOne(
        'SELECT phase FROM gl_game_rounds WHERE game_id = ? AND round_number = ? LIMIT 1',
        [gameId, Number(game.current_round_number) || 0],
      );
      if (round?.phase && round.phase !== 'clos') {
        const temoin = await escalier.poserPageTemoinTx(tx, {
          gameId,
          roundNumber: Number(game.current_round_number) || 0,
          resolved: resolveTenirSettings(ctx.settings, game),
        });
        if (temoin) events.push(temoin.event);
      }
    });
    const game = await loadGame(gameId);
    if (!marche) {
      const maintenant = escalier.vueEscalier(resolveTenirSettings(ctx.settings, game));
      // L'écran a dit d'où il partait et l'escalier a déjà avancé : l'appui est déjà servi.
      if (pasVu != null && maintenant && maintenant.pas > Number(pasVu)) {
        return res.json({ ok: true, deja: true, escalier: maintenant, ouvert: null });
      }
      return res.status(409).json({ error: 'Tout est déjà ouvert.', code: 'ESCALIER_MONTE' });
    }
    for (const evt of events) emitGlGameEvent(gameId, evt);
    return res.json({
      ok: true,
      escalier: escalier.vueEscalier(resolveTenirSettings(ctx.settings, game)),
      ouvert: { modules: marche.modules, sorts: marche.sorts },
    });
  }),
);

/**
 * GET /tenir/ce-qui-change — « Ce qui change » (ensemble unifié, M8) : au camp, trois lignes pour
 * le chapitre suivant (ton peuple, tes nouveaux sorts, le plateau), calculées depuis les sorts
 * rattachés aux chapitres et les réglages résolus. Un élève ou une tablette d'équipe reçoit les
 * lignes de son équipe ; le prof et la projection, celles de la classe. `ceQuiChange: null` au
 * dernier plateau. Lecture seule, aucune donnée d'élève.
 */
router.get(
  '/games/:id/tenir/ce-qui-change',
  requireGlAuthOrProjection,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    if (!(await canAccessGlGame(req.glAuth, gameId))) {
      return res.status(403).json({ error: 'Accès partie refusé' });
    }
    const ctx = await requireTenirGame(req, res, gameId);
    if (!ctx) return undefined;
    const viewer = viewerFromAuth(req.glAuth);
    let teamId = null;
    if (viewer.kind === 'player') {
      const membership = await getPlayerGameMembership(gameId, viewer.playerId);
      teamId = membership?.team_id != null ? Number(membership.team_id) : null;
    } else if (viewer.kind === 'team') {
      teamId = viewer.teamId ?? null;
    }
    const team = teamId
      ? await queryOne('SELECT type FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [
          teamId,
          gameId,
        ])
      : null;
    const { ceQuiChange } = require('../../../lib/glCeQuiChange');
    return res.json({
      gameId,
      auCamp: String(ctx.game.status) === 'ended',
      ceQuiChange: await ceQuiChange(
        { queryAll, queryOne },
        { game: ctx.game, settings: ctx.settings, teamType: team?.type || null },
      ),
    });
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
      'SELECT id, moment, expression, texte, variables_json FROM gl_tenir_olu_lignes WHERE actif = 1 ORDER BY id ASC',
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

/**
 * POST /tenir/players/:playerId/mot-de-passe — MJ (ensemble unifié, M14).
 * « Mot de passe oublié » en un appui depuis la console : un mot de passe provisoire est tiré,
 * rendu **une seule fois** dans la réponse, à changer à la première connexion. Il n'entre ni
 * dans un évènement de partie, ni dans le journal d'audit, ni dans un log.
 *
 * Même garde que `POST /api/gl/admin/players/:id/reset-password` : droit `gl.players.manage`, et
 * jamais sur un joueur rattaché à un vrai compte ForêtMap (403 `GL_PLAYER_REAL_ACCOUNT`).
 */
router.post(
  '/games/:id/tenir/players/:playerId/mot-de-passe',
  requireGlPermission('gl.players.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const playerId = parseId(req.params.playerId);
    if (!gameId || !playerId) return res.status(400).json({ error: 'gameId et playerId requis' });
    if (!(await canAccessGlGame(req.glAuth, gameId))) {
      return res.status(403).json({ error: 'Accès partie refusé' });
    }
    const joueur = await queryOne(
      `SELECT p.id, u.auth_provider
         FROM gl_players p
         INNER JOIN gl_games g ON g.class_id = p.class_id
         LEFT JOIN users u ON u.id = p.linked_foretmap_user_id
        WHERE p.id = ? AND g.id = ? LIMIT 1`,
      [playerId, gameId],
    );
    if (!joueur) {
      return res
        .status(404)
        .json({ error: 'Le joueur n’appartient pas à la classe de cette partie' });
    }
    if (joueur.auth_provider && joueur.auth_provider !== 'gl_bridge') {
      return res.status(403).json({
        error:
          'Cet élève utilise son compte ForetMap : mot de passe à réinitialiser depuis ForetMap ou par « mot de passe oublié »',
        code: 'GL_PLAYER_REAL_ACCOUNT',
      });
    }
    const motDePasse = buildGeneratedPassword();
    // Source unique `users` ; révoque les sessions en cours du joueur.
    await setGlPlayerPassword(playerId, { password: motDePasse, mustReset: true });
    await logAudit(
      'gl_player_reset_password',
      'gl_player',
      String(playerId),
      'Mot de passe provisoire (console du tour)',
      { req, payload: { must_reset: true, game_id: gameId, generated: true } },
    );
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, playerId, motDePasse });
  }),
);

module.exports = router;
module.exports.loadOluLignes = loadOluLignes;
module.exports.invalidateOluCache = invalidateOluCache;
module.exports.requireTenirGame = requireTenirGame;
module.exports.GAME_SELECT = GAME_SELECT;
