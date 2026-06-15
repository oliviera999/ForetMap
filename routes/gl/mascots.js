'use strict';

const express = require('express');
const crypto = require('crypto');
const { queryOne, queryAll, execute, withTransaction } = require('../../database');
const { requireGlAuth, requireGlPermission } = require('../../middleware/requireGlAuth');
const { getGlUnifiedMascotCatalog, getGlUnifiedMascotById } = require('../../lib/glUnifiedMascotCatalog');
const { validateGlMascotPack } = require('../../lib/gl-pack/mascotPack');
const { saveBase64ToDisk, deleteFile } = require('../../lib/uploads');

const router = express.Router();

function sanitizeFilename(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned.length > 0 ? cleaned : null;
}

const { normalizeOptionalString } = require('../../lib/shared/httpHelpers');
const { z, validate } = require('../../lib/validate');
const asyncHandler = require('../../lib/asyncHandler');

// O7 — query friction-free (coercition permissive, jamais de 400) :
// `gameId` reproduit l'ancien `Number(raw)` gardé par `Number.isFinite(gameId) && gameId > 0`
// (sinon : pas de chargement des assignations) ;
// `chapterId` reproduit l'ancien `raw != null ? Number(raw) : null` + branche `Number.isFinite`.
const glMascotsCatalogQuerySchema = z.object({
  gameId: z.preprocess(
    (v) => (v == null ? null : Number(v)),
    z.number().finite().positive().nullable().catch(null)
  ),
});
const glMascotsChapterQuerySchema = z.object({
  chapterId: z.preprocess(
    (v) => (v == null ? null : Number(v)),
    z.number().finite().nullable().catch(null)
  ),
});

function toAssetUrl(relativePath) {
  return `/uploads/${String(relativePath).replace(/\\/g, '/')}`;
}

/** GET /api/gl/mascots — catalogue complet (auth GL requise, joueur ou MJ). */
router.get('/', requireGlAuth, validate({ query: glMascotsCatalogQuerySchema }), asyncHandler(async (req, res) => {
  const catalog = await getGlUnifiedMascotCatalog();
  let assignments = [];
  const gameId = req.validatedQuery?.gameId;
  if (gameId != null) {
    assignments = await queryAll(
      `SELECT team_id, mascot_id
         FROM gl_mascot_assignments
        WHERE game_id = ?`,
      [gameId]
    );
  }
  return res.json({ mascots: catalog, assignments });
}));

/**
 * POST /api/gl/mascots/assign — assigne une mascotte à une équipe.
 *
 * Transactionnel : applique la même `mascot_id` sur `gl_teams` et insère/
 * met à jour la ligne `gl_mascot_assignments` (clé unique `(game_id, team_id)`).
 * Refuse `409` si la mascotte est déjà utilisée par une autre équipe de la
 * même partie.
 */
router.post('/assign', requireGlPermission('gl.team.manage'), asyncHandler(async (req, res) => {
  const gameId = Number(req.body?.gameId);
  const teamId = Number(req.body?.teamId);
  const mascotId = String(req.body?.mascotId || '').trim();
  if (!Number.isFinite(gameId) || gameId <= 0) {
    return res.status(400).json({ error: 'gameId invalide' });
  }
  if (!Number.isFinite(teamId) || teamId <= 0) {
    return res.status(400).json({ error: 'teamId invalide' });
  }
  if (!mascotId) {
    return res.status(400).json({ error: 'mascotId requis' });
  }
  const mascot = await getGlUnifiedMascotById(mascotId);
  if (!mascot) {
    return res.status(404).json({ error: 'Mascotte inconnue dans le catalogue GL/ForetMap' });
  }
  const team = await queryOne(
    'SELECT id, game_id FROM gl_teams WHERE id = ? LIMIT 1',
    [teamId]
  );
  if (!team) return res.status(404).json({ error: 'Équipe introuvable' });
  if (Number(team.game_id) !== gameId) {
    return res.status(400).json({ error: 'team_id n\'appartient pas à la partie spécifiée' });
  }

  const collision = await queryOne(
    `SELECT team_id
       FROM gl_mascot_assignments
      WHERE game_id = ? AND mascot_id = ? AND team_id <> ?
      LIMIT 1`,
    [gameId, mascotId, teamId]
  );
  if (collision) {
    return res.status(409).json({ error: 'Mascotte déjà utilisée par une autre équipe de cette partie' });
  }

  await withTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO gl_mascot_assignments (game_id, team_id, mascot_id, created_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE mascot_id = VALUES(mascot_id), created_at = VALUES(created_at)`,
      [gameId, teamId, mascotId]
    );
    await tx.execute(
      'UPDATE gl_teams SET mascot_id = ?, updated_at = NOW() WHERE id = ?',
      [mascotId, teamId]
    );
  });

  const row = await queryOne(
    `SELECT game_id, team_id, mascot_id, created_at
       FROM gl_mascot_assignments
      WHERE game_id = ? AND team_id = ?
      LIMIT 1`,
    [gameId, teamId]
  );
  return res.status(200).json({ assignment: row, mascot });
}));

router.get('/packs', requireGlPermission('gl.content.manage'), validate({ query: glMascotsChapterQuerySchema }), asyncHandler(async (req, res) => {
  const chapterId = req.validatedQuery?.chapterId;
  const rows = Number.isFinite(chapterId)
    ? await queryAll(
      `SELECT id, chapter_id, name, version, payload_json, updated_at
         FROM gl_mascot_packs
        WHERE chapter_id = ?
        ORDER BY updated_at DESC, id DESC`,
      [chapterId]
    )
    : await queryAll(
      `SELECT id, chapter_id, name, version, payload_json, updated_at
         FROM gl_mascot_packs
        ORDER BY updated_at DESC, id DESC`
    );
  const packs = rows.map((row) => {
    let payload = {};
    try {
      payload = row.payload_json ? JSON.parse(row.payload_json) : {};
    } catch (_) {
      payload = {};
    }
    return {
      id: Number(row.id),
      chapter_id: row.chapter_id == null ? null : Number(row.chapter_id),
      name: row.name,
      version: row.version,
      payload,
      updated_at: row.updated_at,
    };
  });
  return res.json({ packs });
}));

router.post('/packs', requireGlPermission('gl.content.manage'), asyncHandler(async (req, res) => {
  const name = normalizeOptionalString(req.body?.name);
  const version = normalizeOptionalString(req.body?.version) || '1.0';
  const chapterId = req.body?.chapterId == null ? null : Number(req.body.chapterId);
  const payload = req.body?.payload ?? {};
  if (!name) return res.status(400).json({ error: 'Nom de pack requis' });
  const parsed = validateGlMascotPack(payload);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Pack invalide', details: parsed.error.issues || [] });
  }
  if (chapterId != null && !Number.isFinite(chapterId)) {
    return res.status(400).json({ error: 'chapterId invalide' });
  }
  const result = await execute(
    `INSERT INTO gl_mascot_packs (chapter_id, name, version, payload_json, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
    [chapterId, name, version, JSON.stringify(parsed.data), req.glAuth.userId]
  );
  const insertId = Number(result?.insertId);
  if (!Number.isFinite(insertId) || insertId <= 0) {
    return res.status(500).json({ error: 'Création pack impossible' });
  }
  const created = await queryOne(
    'SELECT id, chapter_id, name, version, payload_json, updated_at FROM gl_mascot_packs WHERE id = ? LIMIT 1',
    [insertId]
  );
  return res.status(201).json({
    pack: {
      id: Number(created.id),
      chapter_id: created.chapter_id == null ? null : Number(created.chapter_id),
      name: created.name,
      version: created.version,
      payload: JSON.parse(created.payload_json),
      updated_at: created.updated_at,
    },
  });
}));

router.put('/packs/:id', requireGlPermission('gl.content.manage'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  const existing = await queryOne('SELECT id FROM gl_mascot_packs WHERE id = ? LIMIT 1', [id]);
  if (!existing) return res.status(404).json({ error: 'Pack introuvable' });
  const name = normalizeOptionalString(req.body?.name);
  const version = normalizeOptionalString(req.body?.version);
  const chapterId = req.body?.chapterId == null ? null : Number(req.body.chapterId);
  let parsedPayload = null;
  if (req.body?.payload != null) {
    const parsed = validateGlMascotPack(req.body.payload);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Pack invalide', details: parsed.error.issues || [] });
    }
    parsedPayload = parsed.data;
  }
  if (chapterId != null && !Number.isFinite(chapterId)) {
    return res.status(400).json({ error: 'chapterId invalide' });
  }
  await execute(
    `UPDATE gl_mascot_packs
        SET chapter_id = COALESCE(?, chapter_id),
            name = COALESCE(?, name),
            version = COALESCE(?, version),
            payload_json = COALESCE(?, payload_json),
            updated_at = NOW()
      WHERE id = ?`,
    [chapterId, name, version, parsedPayload == null ? null : JSON.stringify(parsedPayload), id]
  );
  const updated = await queryOne(
    'SELECT id, chapter_id, name, version, payload_json, updated_at FROM gl_mascot_packs WHERE id = ? LIMIT 1',
    [id]
  );
  return res.json({
    pack: {
      id: Number(updated.id),
      chapter_id: updated.chapter_id == null ? null : Number(updated.chapter_id),
      name: updated.name,
      version: updated.version,
      payload: JSON.parse(updated.payload_json),
      updated_at: updated.updated_at,
    },
  });
}));

router.delete('/packs/:id', requireGlPermission('gl.content.manage'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  const assets = await queryAll('SELECT asset_path FROM gl_mascot_pack_assets WHERE pack_id = ?', [id]);
  await execute('DELETE FROM gl_mascot_packs WHERE id = ?', [id]);
  for (const asset of assets) {
    if (asset?.asset_path) deleteFile(asset.asset_path);
  }
  return res.json({ ok: true });
}));

router.get('/packs/:id/assets', requireGlPermission('gl.content.manage'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  const rows = await queryAll(
    'SELECT id, filename, mime_type, asset_path, created_at FROM gl_mascot_pack_assets WHERE pack_id = ? ORDER BY id ASC',
    [id]
  );
  return res.json({
    assets: rows.map((row) => ({
      id: Number(row.id),
      filename: row.filename,
      mime_type: row.mime_type,
      asset_path: row.asset_path,
      url: toAssetUrl(row.asset_path),
      created_at: row.created_at,
    })),
  });
}));

router.post('/packs/:id/assets', requireGlPermission('gl.content.manage'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const filename = sanitizeFilename(req.body?.filename);
  const mimeType = normalizeOptionalString(req.body?.mimeType) || 'application/octet-stream';
  const dataBase64 = normalizeOptionalString(req.body?.dataBase64);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  if (!filename || !dataBase64) {
    return res.status(400).json({ error: 'filename et dataBase64 requis' });
  }
  const folder = `gl-mascot-packs/${id}`;
  const hashedPrefix = crypto.createHash('sha1').update(filename).digest('hex').slice(0, 12);
  const diskFilename = `${hashedPrefix}-${filename}`;
  const relativePath = `${folder}/${diskFilename}`;
  saveBase64ToDisk(relativePath, dataBase64);
  await execute(
    `INSERT INTO gl_mascot_pack_assets (pack_id, filename, mime_type, asset_path, created_at)
     VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE mime_type = VALUES(mime_type), asset_path = VALUES(asset_path), created_at = NOW()`,
    [id, filename, mimeType, relativePath]
  );
  const asset = await queryOne(
    'SELECT id, filename, mime_type, asset_path, created_at FROM gl_mascot_pack_assets WHERE pack_id = ? AND filename = ? LIMIT 1',
    [id, filename]
  );
  return res.status(201).json({
    asset: {
      id: Number(asset.id),
      filename: asset.filename,
      mime_type: asset.mime_type,
      asset_path: asset.asset_path,
      url: toAssetUrl(asset.asset_path),
      created_at: asset.created_at,
    },
  });
}));

router.delete('/packs/:id/assets/:filename', requireGlPermission('gl.content.manage'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const filename = sanitizeFilename(req.params.filename);
  if (!Number.isFinite(id) || !filename) return res.status(400).json({ error: 'Paramètres invalides' });
  const asset = await queryOne(
    'SELECT asset_path FROM gl_mascot_pack_assets WHERE pack_id = ? AND filename = ? LIMIT 1',
    [id, filename]
  );
  await execute('DELETE FROM gl_mascot_pack_assets WHERE pack_id = ? AND filename = ?', [id, filename]);
  if (asset?.asset_path) deleteFile(asset.asset_path);
  return res.json({ ok: true });
}));

router.get('/sprite-library', requireGlPermission('gl.content.manage'), validate({ query: glMascotsChapterQuerySchema }), asyncHandler(async (req, res) => {
  const chapterId = req.validatedQuery?.chapterId;
  const rows = Number.isFinite(chapterId)
    ? await queryAll(
      `SELECT id, chapter_id, filename, mime_type, asset_path, created_at
         FROM gl_mascot_sprite_library
        WHERE chapter_id = ?
        ORDER BY id DESC`,
      [chapterId]
    )
    : await queryAll(
      `SELECT id, chapter_id, filename, mime_type, asset_path, created_at
         FROM gl_mascot_sprite_library
        ORDER BY id DESC`
    );
  return res.json({
    assets: rows.map((row) => ({
      id: Number(row.id),
      chapter_id: row.chapter_id == null ? null : Number(row.chapter_id),
      filename: row.filename,
      mime_type: row.mime_type,
      asset_path: row.asset_path,
      url: toAssetUrl(row.asset_path),
      created_at: row.created_at,
    })),
  });
}));

router.post('/sprite-library', requireGlPermission('gl.content.manage'), asyncHandler(async (req, res) => {
  const chapterId = req.body?.chapterId == null ? null : Number(req.body.chapterId);
  const filename = sanitizeFilename(req.body?.filename);
  const mimeType = normalizeOptionalString(req.body?.mimeType) || 'application/octet-stream';
  const dataBase64 = normalizeOptionalString(req.body?.dataBase64);
  if (!filename || !dataBase64) {
    return res.status(400).json({ error: 'filename et dataBase64 requis' });
  }
  if (chapterId != null && !Number.isFinite(chapterId)) {
    return res.status(400).json({ error: 'chapterId invalide' });
  }
  const folder = chapterId == null
    ? 'gl-mascot-sprite-library/global'
    : `gl-mascot-sprite-library/chapter-${chapterId}`;
  const hashedPrefix = crypto.createHash('sha1').update(filename).digest('hex').slice(0, 12);
  const diskFilename = `${hashedPrefix}-${filename}`;
  const relativePath = `${folder}/${diskFilename}`;
  saveBase64ToDisk(relativePath, dataBase64);
  await execute(
    `INSERT INTO gl_mascot_sprite_library (chapter_id, filename, mime_type, asset_path, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE mime_type = VALUES(mime_type), asset_path = VALUES(asset_path), created_by = VALUES(created_by), created_at = NOW()`,
    [chapterId, filename, mimeType, relativePath, req.glAuth.userId]
  );
  const row = await queryOne(
    `SELECT id, chapter_id, filename, mime_type, asset_path, created_at
       FROM gl_mascot_sprite_library
      WHERE chapter_id <=> ? AND filename = ?
      LIMIT 1`,
    [chapterId, filename]
  );
  return res.status(201).json({
    asset: {
      id: Number(row.id),
      chapter_id: row.chapter_id == null ? null : Number(row.chapter_id),
      filename: row.filename,
      mime_type: row.mime_type,
      asset_path: row.asset_path,
      url: toAssetUrl(row.asset_path),
      created_at: row.created_at,
    },
  });
}));

router.delete('/sprite-library/:id', requireGlPermission('gl.content.manage'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  const row = await queryOne('SELECT asset_path FROM gl_mascot_sprite_library WHERE id = ? LIMIT 1', [id]);
  await execute('DELETE FROM gl_mascot_sprite_library WHERE id = ?', [id]);
  if (row?.asset_path) deleteFile(row.asset_path);
  return res.json({ ok: true });
}));

module.exports = router;
// exportés pour test no-DB du contrat O7
module.exports.glMascotsCatalogQuerySchema = glMascotsCatalogQuerySchema;
module.exports.glMascotsChapterQuerySchema = glMascotsChapterQuerySchema;
