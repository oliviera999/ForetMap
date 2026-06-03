'use strict';

const express = require('express');
const { queryOne, execute } = require('../../database');
const { requireGlAuth, requireGlPermission } = require('../../middleware/requireGlAuth');
const { logRouteError, respondInternalError } = require('../../lib/routeLog');
const { writeBufferToDisk, deleteFile } = require('../../lib/uploads');
const { decodeUserContentImageBuffer } = require('../../lib/userContentImages');
const { getGlModulesSettings } = require('../../lib/glSettings');
const {
  getJournalForPlayer,
  validateJournalBody,
  countPlayerJournalAssets,
  getPlayerJournalLimits,
  playerJournalUploadPrefix,
  canStaffAccessPlayer,
} = require('../../lib/glPlayerJournal');

const router = express.Router();

async function ensurePlayerJournalModuleEnabled(res) {
  const modules = await getGlModulesSettings();
  if (modules.playerJournalEnabled !== true) {
    res.status(503).json({ error: 'Le carnet personnel est désactivé sur cette plateforme' });
    return false;
  }
  return true;
}

function requireGlPlayer(req, res) {
  if (req.glAuth?.userType !== 'gl_player') {
    res.status(403).json({ error: 'Réservé aux joueurs GL' });
    return false;
  }
  return true;
}

router.use(requireGlAuth);

router.get('/me', async (req, res) => {
  try {
    if (!(await ensurePlayerJournalModuleEnabled(res))) return;
    if (!requireGlPlayer(req, res)) return;
    const data = await getJournalForPlayer(req.glAuth.userId);
    return res.json(data);
  } catch (e) {
    logRouteError(e, req, 'gl_player_journal_me_get');
    return respondInternalError(res, req, e);
  }
});

router.put('/me', async (req, res) => {
  try {
    if (!(await ensurePlayerJournalModuleEnabled(res))) return;
    if (!requireGlPlayer(req, res)) return;
    const playerId = Number(req.glAuth.userId);
    const bodyMarkdown = req.body?.bodyMarkdown != null ? String(req.body.bodyMarkdown) : '';
    const validation = await validateJournalBody(bodyMarkdown, playerId);
    if (validation.error) return res.status(400).json({ error: validation.error });

    await execute(
      `INSERT INTO gl_player_journals (player_id, body_markdown, updated_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE body_markdown = VALUES(body_markdown), updated_at = NOW()`,
      [playerId, validation.bodyMarkdown]
    );
    const data = await getJournalForPlayer(playerId);
    return res.json(data);
  } catch (e) {
    logRouteError(e, req, 'gl_player_journal_me_put');
    return respondInternalError(res, req, e);
  }
});

router.post('/me/assets', async (req, res) => {
  try {
    if (!(await ensurePlayerJournalModuleEnabled(res))) return;
    if (!requireGlPlayer(req, res)) return;
    const playerId = Number(req.glAuth.userId);
    const limits = await getPlayerJournalLimits();
    const current = await countPlayerJournalAssets(playerId);
    if (current >= limits.maxAssets) {
      return res.status(400).json({
        error: `Nombre maximum d’illustrations atteint (${limits.maxAssets})`,
      });
    }

    const decoded = decodeUserContentImageBuffer(req.body?.imageData);
    if (decoded.error) return res.status(400).json({ error: decoded.error });

    const prefix = playerJournalUploadPrefix(playerId);
    const rel = `${prefix}/${Date.now()}-${current}.${decoded.ext}`;
    writeBufferToDisk(rel, decoded.buffer);

    const mimeType = decoded.ext === 'jpg' ? 'image/jpeg' : `image/${decoded.ext}`;
    const result = await execute(
      `INSERT INTO gl_player_journal_assets (player_id, asset_path, mime_type, byte_size, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [playerId, rel, mimeType, decoded.buffer.length]
    );
    const asset = await queryOne(
      'SELECT id, asset_path, mime_type, byte_size, created_at FROM gl_player_journal_assets WHERE id = ? LIMIT 1',
      [result.insertId]
    );
    return res.status(201).json({
      asset: {
        id: Number(asset.id),
        url: `/uploads/${asset.asset_path}`,
        mimeType: asset.mime_type,
        byteSize: Number(asset.byte_size) || 0,
        createdAt: asset.created_at,
      },
      usage: {
        assetCount: current + 1,
        maxAssets: limits.maxAssets,
      },
    });
  } catch (e) {
    logRouteError(e, req, 'gl_player_journal_asset_post');
    return respondInternalError(res, req, e);
  }
});

router.delete('/me/assets/:assetId', async (req, res) => {
  try {
    if (!(await ensurePlayerJournalModuleEnabled(res))) return;
    if (!requireGlPlayer(req, res)) return;
    const playerId = Number(req.glAuth.userId);
    const assetId = Number(req.params.assetId);
    if (!Number.isFinite(assetId)) return res.status(400).json({ error: 'Identifiant invalide' });

    const asset = await queryOne(
      'SELECT id, asset_path FROM gl_player_journal_assets WHERE id = ? AND player_id = ? LIMIT 1',
      [assetId, playerId]
    );
    if (!asset) return res.status(404).json({ error: 'Illustration introuvable' });

    await execute('DELETE FROM gl_player_journal_assets WHERE id = ? AND player_id = ?', [assetId, playerId]);
    if (asset.asset_path) deleteFile(asset.asset_path);

    const limits = await getPlayerJournalLimits();
    const assetCount = await countPlayerJournalAssets(playerId);
    return res.json({
      ok: true,
      usage: { assetCount, maxAssets: limits.maxAssets },
    });
  } catch (e) {
    logRouteError(e, req, 'gl_player_journal_asset_delete');
    return respondInternalError(res, req, e);
  }
});

router.get('/players/:playerId', requireGlPermission('gl.players.manage'), async (req, res) => {
  try {
    if (!(await ensurePlayerJournalModuleEnabled(res))) return;
    const targetId = Number(req.params.playerId);
    if (!Number.isFinite(targetId)) return res.status(400).json({ error: 'Identifiant joueur invalide' });
    if (!(await canStaffAccessPlayer(req.glAuth, targetId))) {
      return res.status(404).json({ error: 'Joueur introuvable' });
    }
    const data = await getJournalForPlayer(targetId);
    const player = await queryOne(
      'SELECT id, pseudo, first_name, last_name FROM gl_players WHERE id = ? LIMIT 1',
      [targetId]
    );
    return res.json({
      ...data,
      player: player
        ? {
          id: Number(player.id),
          pseudo: player.pseudo,
          firstName: player.first_name,
          lastName: player.last_name,
        }
        : null,
    });
  } catch (e) {
    logRouteError(e, req, 'gl_player_journal_staff_get');
    return respondInternalError(res, req, e);
  }
});

module.exports = router;
