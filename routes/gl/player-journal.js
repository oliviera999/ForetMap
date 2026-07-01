'use strict';

const express = require('express');
const { queryOne, queryAll, execute } = require('../../database');
const { requireGlAuth, requireGlPermission } = require('../../middleware/requireGlAuth');
const { writeBufferToDisk, deleteFile } = require('../../lib/uploads');
const { decodeUserContentImageBuffer } = require('../../lib/userContentImages');
const { getGlModulesSettings } = require('../../lib/glSettings');
const {
  getArticlesForPlayer,
  getArticleDto,
  getArticleOwned,
  validateArticleBody,
  normalizeArticleTitle,
  countArticleAssets,
  getPlayerJournalLimits,
  playerJournalUploadPrefix,
  getPlayerJournalImports,
  getPlayerJournalImportRefs,
  setArticlePinned,
  setImportPinned,
  resolveJournalEmbedTitles,
  hasLearnedResource,
  canStaffAccessPlayer,
} = require('../../lib/glPlayerJournal');
const {
  normalizeResourceType,
  normalizeResourceRef,
  GL_RESOURCE_TYPES,
} = require('../../lib/shared/resourceQuestionGatingCore');
const {
  isLearnableResourceType,
  resourceExists,
  resolveResourceTitle,
} = require('../../lib/glLearnableResources');
const asyncHandler = require('../../lib/asyncHandler');

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

function parseArticleId(req, res) {
  const articleId = Number(req.params.articleId);
  if (!Number.isFinite(articleId)) {
    res.status(400).json({ error: 'Identifiant d’article invalide' });
    return null;
  }
  return articleId;
}

// Valide le corps `{ pinned: boolean }`. N'accepte QUE des booléens stricts (pas
// de coercition « truthy ») ; renvoie null et répond 400 sinon.
function parsePinned(req, res) {
  const value = req.body?.pinned;
  if (value !== true && value !== false) {
    res.status(400).json({ error: 'Le champ « pinned » doit être un booléen' });
    return null;
  }
  return value;
}

router.use(requireGlAuth);

// Liste des articles du carnet du joueur courant.
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    if (!(await ensurePlayerJournalModuleEnabled(res))) return;
    if (!requireGlPlayer(req, res)) return;
    const data = await getArticlesForPlayer(req.glAuth.userId);
    const imports = await getPlayerJournalImports(req.glAuth.userId);
    return res.json({ ...data, imports });
  }),
);

// Références légères des éléments déjà importés (type + ref), pour l'état « déjà
// dans mon journal » des boutons d'import sur les pages d'éléments. Volontairement
// séparé de /me (qui charge tout le carnet) pour rester peu coûteux.
router.get(
  '/me/imports/refs',
  asyncHandler(async (req, res) => {
    if (!(await ensurePlayerJournalModuleEnabled(res))) return;
    if (!requireGlPlayer(req, res)) return;
    const refs = await getPlayerJournalImportRefs(req.glAuth.userId);
    return res.json({ refs });
  }),
);

// Résolution batch des titres réels des encarts `gl-journal-embed` d'un article,
// pour l'affichage hydraté (le corps stocke seulement type + ref). Accessible aux
// joueurs comme au MJ (lecture des carnets), en lecture seule.
router.post(
  '/embeds/resolve',
  asyncHandler(async (req, res) => {
    if (!(await ensurePlayerJournalModuleEnabled(res))) return;
    const raw = Array.isArray(req.body?.embeds) ? req.body.embeds.slice(0, 200) : [];
    const titles = await resolveJournalEmbedTitles(raw);
    return res.json({ titles });
  }),
);

// Création d'un nouvel article (titre optionnel, corps éventuellement vide → « média seul »).
router.post(
  '/me/articles',
  asyncHandler(async (req, res) => {
    if (!(await ensurePlayerJournalModuleEnabled(res))) return;
    if (!requireGlPlayer(req, res)) return;
    const playerId = Number(req.glAuth.userId);
    const title = normalizeArticleTitle(req.body?.title);
    const bodyMarkdown = req.body?.bodyMarkdown != null ? String(req.body.bodyMarkdown) : '';
    const validation = await validateArticleBody(bodyMarkdown, playerId);
    if (validation.error) return res.status(400).json({ error: validation.error });

    const result = await execute(
      `INSERT INTO gl_player_journal_articles (player_id, title, body_markdown, created_at, updated_at)
       VALUES (?, ?, ?, NOW(), NOW())`,
      [playerId, title, validation.bodyMarkdown],
    );
    const article = await getArticleDto(result.insertId);
    return res.status(201).json({ article });
  }),
);

// Mise à jour d'un article (titre + corps). Met à jour updated_at.
router.put(
  '/me/articles/:articleId',
  asyncHandler(async (req, res) => {
    if (!(await ensurePlayerJournalModuleEnabled(res))) return;
    if (!requireGlPlayer(req, res)) return;
    const playerId = Number(req.glAuth.userId);
    const articleId = parseArticleId(req, res);
    if (articleId == null) return;

    const owned = await getArticleOwned(articleId, playerId);
    if (!owned) return res.status(404).json({ error: 'Article introuvable' });

    const title = Object.prototype.hasOwnProperty.call(req.body || {}, 'title')
      ? normalizeArticleTitle(req.body.title)
      : owned.title;
    const bodyMarkdown = req.body?.bodyMarkdown != null ? String(req.body.bodyMarkdown) : '';
    const validation = await validateArticleBody(bodyMarkdown, playerId);
    if (validation.error) return res.status(400).json({ error: validation.error });

    await execute(
      `UPDATE gl_player_journal_articles
          SET title = ?, body_markdown = ?, updated_at = NOW()
        WHERE id = ? AND player_id = ?`,
      [title, validation.bodyMarkdown, articleId, playerId],
    );
    const article = await getArticleDto(articleId);
    return res.json({ article });
  }),
);

// Épinglage / désépinglage d'un article (propriétaire uniquement).
router.put(
  '/me/articles/:articleId/pin',
  asyncHandler(async (req, res) => {
    if (!(await ensurePlayerJournalModuleEnabled(res))) return;
    if (!requireGlPlayer(req, res)) return;
    const playerId = Number(req.glAuth.userId);
    const articleId = parseArticleId(req, res);
    if (articleId == null) return;
    const pinned = parsePinned(req, res);
    if (pinned == null) return;

    const affected = await setArticlePinned(articleId, playerId, pinned);
    if (!affected) return res.status(404).json({ error: 'Article introuvable' });
    return res.json({ ok: true, pinned });
  }),
);

// Suppression d'un article (et de ses médias sur disque).
router.delete(
  '/me/articles/:articleId',
  asyncHandler(async (req, res) => {
    if (!(await ensurePlayerJournalModuleEnabled(res))) return;
    if (!requireGlPlayer(req, res)) return;
    const playerId = Number(req.glAuth.userId);
    const articleId = parseArticleId(req, res);
    if (articleId == null) return;

    const owned = await getArticleOwned(articleId, playerId);
    if (!owned) return res.status(404).json({ error: 'Article introuvable' });

    const assets = await queryAll(
      'SELECT asset_path FROM gl_player_journal_article_assets WHERE article_id = ?',
      [articleId],
    );
    // La suppression de l'article cascade sur les lignes d'assets ; on retire ensuite les fichiers.
    await execute('DELETE FROM gl_player_journal_articles WHERE id = ? AND player_id = ?', [
      articleId,
      playerId,
    ]);
    for (const asset of assets) {
      if (asset.asset_path) deleteFile(asset.asset_path);
    }
    return res.json({ ok: true });
  }),
);

// Ajout d'une illustration à un article.
router.post(
  '/me/articles/:articleId/assets',
  asyncHandler(async (req, res) => {
    if (!(await ensurePlayerJournalModuleEnabled(res))) return;
    if (!requireGlPlayer(req, res)) return;
    const playerId = Number(req.glAuth.userId);
    const articleId = parseArticleId(req, res);
    if (articleId == null) return;

    const owned = await getArticleOwned(articleId, playerId);
    if (!owned) return res.status(404).json({ error: 'Article introuvable' });

    const limits = await getPlayerJournalLimits();
    const current = await countArticleAssets(articleId);
    // maxAssets = 0 → illimité : aucun plafond d'illustrations n'est appliqué.
    if (limits.maxAssets > 0 && current >= limits.maxAssets) {
      return res.status(400).json({
        error: `Nombre maximum d’illustrations atteint (${limits.maxAssets})`,
      });
    }

    const decoded = decodeUserContentImageBuffer(req.body?.imageData);
    if (decoded.error) return res.status(400).json({ error: decoded.error });

    const prefix = playerJournalUploadPrefix(playerId);
    const rel = `${prefix}/${articleId}-${Date.now()}-${current}.${decoded.ext}`;
    writeBufferToDisk(rel, decoded.buffer);

    const mimeType = decoded.ext === 'jpg' ? 'image/jpeg' : `image/${decoded.ext}`;
    const result = await execute(
      `INSERT INTO gl_player_journal_article_assets (article_id, player_id, asset_path, mime_type, byte_size, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [articleId, playerId, rel, mimeType, decoded.buffer.length],
    );
    const asset = await queryOne(
      'SELECT id, asset_path, mime_type, byte_size, created_at FROM gl_player_journal_article_assets WHERE id = ? LIMIT 1',
      [result.insertId],
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
  }),
);

// Suppression d'une illustration d'un article.
router.delete(
  '/me/articles/:articleId/assets/:assetId',
  asyncHandler(async (req, res) => {
    if (!(await ensurePlayerJournalModuleEnabled(res))) return;
    if (!requireGlPlayer(req, res)) return;
    const playerId = Number(req.glAuth.userId);
    const articleId = parseArticleId(req, res);
    if (articleId == null) return;
    const assetId = Number(req.params.assetId);
    if (!Number.isFinite(assetId)) return res.status(400).json({ error: 'Identifiant invalide' });

    const asset = await queryOne(
      `SELECT id, asset_path FROM gl_player_journal_article_assets
        WHERE id = ? AND article_id = ? AND player_id = ? LIMIT 1`,
      [assetId, articleId, playerId],
    );
    if (!asset) return res.status(404).json({ error: 'Illustration introuvable' });

    await execute('DELETE FROM gl_player_journal_article_assets WHERE id = ? AND player_id = ?', [
      assetId,
      playerId,
    ]);
    if (asset.asset_path) deleteFile(asset.asset_path);

    const limits = await getPlayerJournalLimits();
    const assetCount = await countArticleAssets(articleId);
    return res.json({
      ok: true,
      usage: { assetCount, maxAssets: limits.maxAssets },
    });
  }),
);

function normalizeImportTitle(raw) {
  const s = raw == null ? '' : String(raw).trim();
  if (!s) return null;
  return [...s].slice(0, 255).join('');
}

// Import d'un élément du site (appris au préalable) dans le carnet.
router.post(
  '/me/imports',
  asyncHandler(async (req, res) => {
    if (!(await ensurePlayerJournalModuleEnabled(res))) return;
    if (!requireGlPlayer(req, res)) return;
    const playerId = Number(req.glAuth.userId);
    const resourceType = normalizeResourceType(req.body?.resourceType, GL_RESOURCE_TYPES);
    const resourceRef = normalizeResourceRef(req.body?.resourceRef);
    if (!resourceType || !resourceRef || !isLearnableResourceType(resourceType)) {
      return res.status(400).json({ error: 'Ressource invalide' });
    }
    const db = { queryOne };
    if (!(await resourceExists(db, resourceType, resourceRef))) {
      return res.status(404).json({ error: 'Ressource introuvable' });
    }
    if (!(await hasLearnedResource(playerId, resourceType, resourceRef))) {
      return res
        .status(403)
        .json({ error: 'Marque d’abord cet élément comme appris pour l’importer' });
    }
    const clientTitle = normalizeImportTitle(req.body?.title);
    const title =
      clientTitle ||
      (await resolveResourceTitle(db, resourceType, resourceRef)) ||
      `${resourceType} · ${resourceRef}`;
    await execute(
      `INSERT INTO gl_player_journal_imports (player_id, resource_type, resource_ref, title, created_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE title = VALUES(title)`,
      [playerId, resourceType, resourceRef, title],
    );
    const row = await queryOne(
      `SELECT id, resource_type, resource_ref, title, created_at
         FROM gl_player_journal_imports
        WHERE player_id = ? AND resource_type = ? AND resource_ref = ? LIMIT 1`,
      [playerId, resourceType, resourceRef],
    );
    return res.status(201).json({
      import: {
        id: Number(row.id),
        resourceType: row.resource_type,
        resourceRef: row.resource_ref,
        title: row.title || '',
        createdAt: row.created_at,
      },
    });
  }),
);

// Retrait d'un élément importé du carnet.
router.delete(
  '/me/imports/:importId',
  asyncHandler(async (req, res) => {
    if (!(await ensurePlayerJournalModuleEnabled(res))) return;
    if (!requireGlPlayer(req, res)) return;
    const playerId = Number(req.glAuth.userId);
    const importId = Number(req.params.importId);
    if (!Number.isFinite(importId)) return res.status(400).json({ error: 'Identifiant invalide' });
    const row = await queryOne(
      'SELECT id FROM gl_player_journal_imports WHERE id = ? AND player_id = ? LIMIT 1',
      [importId, playerId],
    );
    if (!row) return res.status(404).json({ error: 'Import introuvable' });
    await execute('DELETE FROM gl_player_journal_imports WHERE id = ? AND player_id = ?', [
      importId,
      playerId,
    ]);
    return res.json({ ok: true });
  }),
);

// Épinglage / désépinglage d'un import (propriétaire uniquement).
router.put(
  '/me/imports/:importId/pin',
  asyncHandler(async (req, res) => {
    if (!(await ensurePlayerJournalModuleEnabled(res))) return;
    if (!requireGlPlayer(req, res)) return;
    const playerId = Number(req.glAuth.userId);
    const importId = Number(req.params.importId);
    if (!Number.isFinite(importId)) return res.status(400).json({ error: 'Identifiant invalide' });
    const pinned = parsePinned(req, res);
    if (pinned == null) return;

    const affected = await setImportPinned(importId, playerId, pinned);
    if (!affected) return res.status(404).json({ error: 'Import introuvable' });
    return res.json({ ok: true, pinned });
  }),
);

// Lecture (MJ) des articles du carnet d'un joueur.
router.get(
  '/players/:playerId',
  requireGlPermission('gl.players.manage'),
  asyncHandler(async (req, res) => {
    if (!(await ensurePlayerJournalModuleEnabled(res))) return;
    const targetId = Number(req.params.playerId);
    if (!Number.isFinite(targetId))
      return res.status(400).json({ error: 'Identifiant joueur invalide' });
    if (!(await canStaffAccessPlayer(req.glAuth, targetId))) {
      return res.status(404).json({ error: 'Joueur introuvable' });
    }
    const data = await getArticlesForPlayer(targetId);
    const imports = await getPlayerJournalImports(targetId);
    const player = await queryOne(
      'SELECT id, pseudo, first_name, last_name FROM gl_players WHERE id = ? LIMIT 1',
      [targetId],
    );
    return res.json({
      ...data,
      imports,
      player: player
        ? {
            id: Number(player.id),
            pseudo: player.pseudo,
            firstName: player.first_name,
            lastName: player.last_name,
          }
        : null,
    });
  }),
);

module.exports = router;
