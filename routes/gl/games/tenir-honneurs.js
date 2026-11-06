'use strict';

/**
 * « Tenir à deux » v2 — honneurs, missions, badges, Bestiaire des chimères, plumes (spec § 12
 * et § 13). Préfixe réel `/api/gl/games/:id/tenir/*` (monté par routes/gl/games.js).
 * Tout ce qui touche la réalité passe par `gl.game.manage`.
 */

const express = require('express');
const db = require('../../../database');
const { queryAll, queryOne, withTransaction } = db;
const {
  requireGlAuth,
  requireGlAuthOrProjection,
  requireGlPermission,
  isMj,
} = require('../../../middleware/requireGlAuth');
const { canAccessGlGame } = require('../../../lib/glGameAccess');
const { parseId, normalizeOptionalString } = require('../../../lib/shared/httpHelpers');
const asyncHandler = require('../../../lib/asyncHandler');
const { emitGlGameEvent } = require('../../../lib/realtime');
const { insertGameEvent } = require('../../../lib/glGameEvents');
const { getPlayerGameMembership } = require('../../../lib/gl/gamesRuntime');
const { enregistrerMissionTx, computeHonneurs } = require('../../../lib/glHonneurs');
const { awardBadgeProfTx, evaluateBadges } = require('../../../lib/glTenirBadges');
const { listPlumes, validerPlumeTx } = require('../../../lib/glVoyageurPlume');
const { findForbiddenString } = require('../../../lib/glTenirImport');
const { requireTenirGame } = require('./tenir');

const router = express.Router();

const MESSAGES = {
  MISSION_INTROUVABLE: 'Mission inconnue',
  MISSION_DEJA_SAISIE: 'Mission déjà saisie pour cette équipe',
  BADGE_INTROUVABLE: 'Badge inconnu',
  BADGE_RESERVE: 'Ce badge est réservé : il ne s’attribue pas',
  PLUME_INTROUVABLE: 'Page introuvable',
  PLUME_AUTRE_PARTIE: 'Cette page appartient à une autre partie',
  PLUME_DEJA_RELUE: 'Cette page a déjà été relue',
  CHIMERE_INTROUVABLE: 'Chimère introuvable',
};

function sendErr(res, err) {
  const message = MESSAGES[err?.message];
  if (message && err.status)
    return res.status(err.status).json({ error: message, code: err.message });
  throw err;
}

async function guard(req, res, gameId) {
  if (!gameId) {
    res.status(400).json({ error: 'Identifiant de partie invalide' });
    return null;
  }
  if (!(await canAccessGlGame(req.glAuth, gameId))) {
    res.status(403).json({ error: 'Accès partie refusé' });
    return null;
  }
  return requireTenirGame(req, res, gameId);
}

// ---------------------------------------------------------------------
// Honneurs (lecture) et missions (prof)
// ---------------------------------------------------------------------

router.get(
  '/games/:id/tenir/honneurs',
  requireGlAuthOrProjection,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const ctx = await guard(req, res, gameId);
    if (!ctx) return undefined;
    const rows = await queryAll(
      `SELECT h.id, h.team_id AS teamId, t.name AS teamName, h.honneur, h.titre_code AS titreCode, h.libelle,
              h.double_honneur AS doubleHonneur, h.mission_id AS missionId, h.created_at AS createdAt
         FROM gl_game_honneurs h INNER JOIN gl_teams t ON t.id = h.team_id WHERE h.game_id = ? ORDER BY h.id ASC`,
      [gameId],
    );
    // Aperçu (prof) : honneurs tels qu'ils seraient attribués maintenant — jamais un classement d'élèves.
    const apercu = isMj(req) ? await computeHonneurs(db, gameId) : null;
    return res.json({
      honneurs: rows.map((r) => ({ ...r, doubleHonneur: Number(r.doubleHonneur) === 1 })),
      ...(apercu ? { apercu: { honneurs: apercu.honneurs, sceaux: apercu.sceaux } } : {}),
    });
  }),
);

router.get(
  '/games/:id/tenir/missions',
  requireGlAuthOrProjection,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const ctx = await guard(req, res, gameId);
    if (!ctx) return undefined;
    const catalogue = isMj(req)
      ? await queryAll(
          'SELECT id, texte, type, titre_sceau AS titreSceau FROM gl_tenir_missions WHERE actif = 1 ORDER BY id ASC',
        )
      : [];
    const reussies = await queryAll(
      `SELECT m.team_id AS teamId, t.name AS teamName, m.mission_id AS missionId, m.titre_sceau AS titreSceau, m.created_at AS createdAt
         FROM gl_game_missions m INNER JOIN gl_teams t ON t.id = m.team_id WHERE m.game_id = ? ORDER BY m.id ASC`,
      [gameId],
    );
    return res.json({ missions: catalogue, reussies });
  }),
);

router.post(
  '/games/:id/tenir/missions',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const ctx = await guard(req, res, gameId);
    if (!ctx) return undefined;
    const teamId = parseId(req.body?.teamId);
    const missionCode = normalizeOptionalString(req.body?.missionCode || req.body?.missionId);
    if (!teamId || !missionCode)
      return res.status(400).json({ error: 'teamId et missionCode requis' });
    const team = await queryOne('SELECT id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [
      teamId,
      gameId,
    ]);
    if (!team) return res.status(404).json({ error: 'Équipe introuvable dans cette partie' });
    try {
      const result = await withTransaction((tx) =>
        enregistrerMissionTx(tx, {
          gameId,
          teamId,
          missionId: missionCode,
          actorId: req.glAuth.userId,
        }),
      );
      emitGlGameEvent(gameId, result.event);
      return res.status(201).json({ missionId: result.missionId, titre: result.titre });
    } catch (err) {
      return sendErr(res, err);
    }
  }),
);

// ---------------------------------------------------------------------
// Badges (prof : saisie ; joueur : réévaluation de ses propres badges)
// ---------------------------------------------------------------------

router.post(
  '/games/:id/tenir/badges',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const ctx = await guard(req, res, gameId);
    if (!ctx) return undefined;
    const playerId = parseId(req.body?.playerId);
    const badgeCode = normalizeOptionalString(req.body?.badgeCode);
    if (!playerId || !badgeCode)
      return res.status(400).json({ error: 'playerId et badgeCode requis' });
    const membership = await getPlayerGameMembership(gameId, playerId);
    if (!membership) return res.status(404).json({ error: 'Joueur non rattaché à cette partie' });
    try {
      const result = await withTransaction((tx) =>
        awardBadgeProfTx(tx, { playerId, badgeCode, gameId, actorId: req.glAuth.userId }),
      );
      if (result.awarded) {
        const evt = await withTransaction((tx) =>
          insertGameEvent(tx, {
            gameId,
            actorType: 'mj',
            actorId: String(req.glAuth.userId),
            eventType: 'badge',
            payload: {
              playerId,
              badgeCode: result.code,
              nom: result.nom,
              private: true,
              publicKeys: ['badgeCode', 'nom'],
            },
          }),
        );
        emitGlGameEvent(gameId, evt);
      }
      return res.status(result.awarded ? 201 : 200).json(result);
    } catch (err) {
      return sendErr(res, err);
    }
  }),
);

router.post(
  '/games/:id/tenir/badges/evaluer',
  requireGlAuth,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const ctx = await guard(req, res, gameId);
    if (!ctx) return undefined;
    let playerId = null;
    if (req.glAuth.userType === 'gl_player') playerId = Number(req.glAuth.userId);
    else if (isMj(req)) playerId = parseId(req.body?.playerId);
    if (!playerId) return res.status(400).json({ error: 'playerId requis' });
    const badges = await evaluateBadges(db, playerId, { gameId });
    return res.json({ playerId, badges: badges.filter((b) => b.awarded || b.valeur > 0) });
  }),
);

// ---------------------------------------------------------------------
// Bestiaire des chimères (élève propose, prof valide)
// ---------------------------------------------------------------------

function formatChimere(row, { mj = false } = {}) {
  return {
    id: Number(row.id),
    nom: row.nom,
    histoire: row.histoire,
    imageUrl: row.image_url || null,
    statut: row.statut,
    proposeePar: row.pseudo || null,
    chapterId: row.chapter_id != null ? Number(row.chapter_id) : null,
    createdAt: row.created_at,
    ...(mj
      ? {
          proposeeParPlayerId:
            row.proposee_par_player_id != null ? Number(row.proposee_par_player_id) : null,
        }
      : {}),
  };
}

router.get(
  '/games/:id/tenir/chimeres',
  requireGlAuthOrProjection,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const ctx = await guard(req, res, gameId);
    if (!ctx) return undefined;
    const mj = isMj(req);
    const playerId = req.glAuth.userType === 'gl_player' ? Number(req.glAuth.userId) : null;
    const rows = await queryAll(
      `SELECT c.*, p.pseudo FROM gl_game_chimeres c LEFT JOIN gl_players p ON p.id = c.proposee_par_player_id
        WHERE c.game_id = ? AND (c.statut = 'validee' ${mj ? 'OR 1 = 1' : playerId != null ? 'OR c.proposee_par_player_id = ?' : ''})
        ORDER BY c.id ASC`,
      mj || playerId == null ? [gameId] : [gameId, playerId],
    );
    return res.json({ chimeres: rows.map((r) => formatChimere(r, { mj })) });
  }),
);

router.post(
  '/games/:id/tenir/chimeres',
  requireGlAuth,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const ctx = await guard(req, res, gameId);
    if (!ctx) return undefined;
    const nom = normalizeOptionalString(req.body?.nom);
    const histoire = String(req.body?.histoire || '').trim();
    const imageUrl = normalizeOptionalString(req.body?.imageUrl);
    if (!nom || nom.length > 120)
      return res.status(400).json({ error: 'Nom requis (120 caractères max.)' });
    if (histoire.length < 10 || histoire.length > 4000)
      return res.status(400).json({ error: 'Histoire requise (10 à 4000 caractères)' });
    if (imageUrl && !/^\/?(uploads|gl|media)\//.test(imageUrl) && !/^https?:\/\//.test(imageUrl)) {
      return res.status(400).json({ error: 'Image : chemin de la médiathèque ou URL attendu' });
    }
    const forbidden = findForbiddenString(`${nom} ${histoire}`);
    if (forbidden)
      return res.status(400).json({ error: `Mot à éviter dans une chimère : ${forbidden}` });
    const mj = isMj(req);
    const playerId = req.glAuth.userType === 'gl_player' ? Number(req.glAuth.userId) : null;
    if (playerId != null && !(await getPlayerGameMembership(gameId, playerId))) {
      return res.status(403).json({ error: 'Joueur non rattaché à cette partie' });
    }
    const r = await db.execute(
      `INSERT INTO gl_game_chimeres (game_id, chapter_id, nom, histoire, image_url, proposee_par_player_id, proposee_par_actor, statut, valide_par, valide_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${mj ? 'NOW()' : 'NULL'}, NOW(), NOW())`,
      [
        gameId,
        ctx.game.chapter_id || null,
        nom,
        histoire,
        imageUrl || null,
        playerId,
        String(req.glAuth.userId),
        mj ? 'validee' : 'proposee',
        mj ? String(req.glAuth.userId) : null,
      ],
    );
    const row = await queryOne(
      'SELECT c.*, p.pseudo FROM gl_game_chimeres c LEFT JOIN gl_players p ON p.id = c.proposee_par_player_id WHERE c.id = ?',
      [r.insertId],
    );
    if (mj) {
      const evt = await withTransaction((tx) =>
        insertGameEvent(tx, {
          gameId,
          actorType: 'mj',
          actorId: String(req.glAuth.userId),
          eventType: 'chimere_validee',
          payload: { chimereId: Number(r.insertId), nom },
        }),
      );
      emitGlGameEvent(gameId, evt);
    }
    return res.status(201).json({ chimere: formatChimere(row, { mj }) });
  }),
);

router.put(
  '/games/:id/tenir/chimeres/:chimereId',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const chimereId = parseId(req.params.chimereId);
    const ctx = await guard(req, res, gameId);
    if (!ctx) return undefined;
    const row = await queryOne(
      'SELECT * FROM gl_game_chimeres WHERE id = ? AND game_id = ? LIMIT 1',
      [chimereId, gameId],
    );
    if (!row) return res.status(404).json({ error: MESSAGES.CHIMERE_INTROUVABLE });
    const decision = String(req.body?.decision || 'valider');
    const statut = decision === 'refuser' ? 'refusee' : 'validee';
    const nom = normalizeOptionalString(req.body?.nom) || row.nom;
    const histoire = String(req.body?.histoire || row.histoire).trim();
    const forbidden = findForbiddenString(`${nom} ${histoire}`);
    if (forbidden)
      return res.status(400).json({ error: `Mot à éviter dans une chimère : ${forbidden}` });
    await db.execute(
      'UPDATE gl_game_chimeres SET nom = ?, histoire = ?, statut = ?, valide_par = ?, valide_at = NOW(), updated_at = NOW() WHERE id = ?',
      [nom, histoire, statut, String(req.glAuth.userId), chimereId],
    );
    if (statut === 'validee' && String(row.statut) !== 'validee') {
      const evt = await withTransaction((tx) =>
        insertGameEvent(tx, {
          gameId,
          actorType: 'mj',
          actorId: String(req.glAuth.userId),
          eventType: 'chimere_validee',
          payload: { chimereId, nom },
        }),
      );
      emitGlGameEvent(gameId, evt);
    }
    const updated = await queryOne(
      'SELECT c.*, p.pseudo FROM gl_game_chimeres c LEFT JOIN gl_players p ON p.id = c.proposee_par_player_id WHERE c.id = ?',
      [chimereId],
    );
    return res.json({ chimere: formatChimere(updated, { mj: true }) });
  }),
);

// ---------------------------------------------------------------------
// Plumes / Lettres (relecture du prof)
// ---------------------------------------------------------------------

router.get(
  '/games/:id/tenir/plumes',
  requireGlAuth,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const ctx = await guard(req, res, gameId);
    if (!ctx) return undefined;
    const mj = isMj(req);
    const plumes = await listPlumes(db, {
      gameId,
      playerId: mj ? null : Number(req.glAuth.userId),
    });
    return res.json({ plumes: plumes.map((p) => (mj ? p : { ...p, texte: p.texte })) });
  }),
);

router.put(
  '/games/:id/tenir/plumes/:plumeId',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const plumeId = parseId(req.params.plumeId);
    const ctx = await guard(req, res, gameId);
    if (!ctx || !plumeId)
      return ctx ? res.status(400).json({ error: 'Identifiant invalide' }) : undefined;
    try {
      const result = await withTransaction((tx) =>
        validerPlumeTx(tx, {
          plumeId,
          gameId,
          decision: String(req.body?.decision || 'valider'),
          actorId: req.glAuth.userId,
        }),
      );
      for (const evt of result.events || []) emitGlGameEvent(gameId, evt);
      const { events, ...rest } = result; // eslint-disable-line no-unused-vars
      return res.json(rest);
    } catch (err) {
      return sendErr(res, err);
    }
  }),
);

module.exports = router;
