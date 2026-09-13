'use strict';

const express = require('express');
const { queryOne, queryAll, execute } = require('../database');
const { requireAuth } = require('../middleware/requireTeacher');
const { writeBufferToDisk, deleteFile, getAbsolutePath } = require('../lib/uploads');
const { decodeUserContentImageBuffer } = require('../lib/userContentImages');
const { getSettingValue } = require('../lib/settings');
const asyncHandler = require('../lib/asyncHandler');
const { canAccessStudentId } = require('../lib/groupScope');
const { emitObservationsChanged } = require('../lib/realtime');
const {
  normalizeResourceType,
  normalizeResourceRef,
  FORETMAP_RESOURCE_TYPES,
} = require('../lib/shared/resourceQuestionGatingCore');
const {
  getArticlesForUser,
  getArticleDto,
  getArticleOwned,
  validateArticleBody,
  normalizeArticleTitle,
  countArticleAssets,
  getUserJournalLimits,
  userJournalUploadPrefix,
  getUserJournalImports,
  getUserJournalImportRefs,
  setArticlePinned,
  setImportPinned,
  resolveJournalEmbedTitles,
  hasLearnedResource,
  resourceExists,
  resolveResourceTitle,
  isImportableResourceType,
  migrateObservationLogsOnce,
} = require('../lib/fmUserJournal');

const router = express.Router();

async function ensureJournalModuleEnabled(res) {
  const enabled = await getSettingValue('ui.modules.observations_enabled', true);
  if (enabled === false || enabled === 'false' || enabled === 0 || enabled === '0') {
    res.status(503).json({ error: 'Le carnet est désactivé sur cette plateforme' });
    return false;
  }
  return true;
}

function authUserId(req) {
  const id = String(req.auth?.userId || '').trim();
  return id || null;
}

function parseArticleId(req, res) {
  const articleId = Number(req.params.articleId);
  if (!Number.isFinite(articleId)) {
    res.status(400).json({ error: 'Identifiant d’article invalide' });
    return null;
  }
  return articleId;
}

function parsePinned(req, res) {
  const value = req.body?.pinned;
  if (value !== true && value !== false) {
    res.status(400).json({ error: 'Le champ « pinned » doit être un booléen' });
    return null;
  }
  return value;
}

function canReadObservations(auth) {
  const perms = Array.isArray(auth?.permissions) ? auth.permissions : [];
  return perms.includes('observations.read.all') || perms.includes('observations.read.group');
}

async function assertCanReadUserJournal(auth, targetUserId) {
  const tid = String(targetUserId || '').trim();
  if (!tid) return { ok: false, status: 400, error: 'Identifiant invalide' };
  if (String(auth?.userId) === tid) return { ok: true };
  const perms = Array.isArray(auth?.permissions) ? auth.permissions : [];
  const canReadAll = perms.includes('observations.read.all');
  const canReadGroup = perms.includes('observations.read.group');
  if (!canReadAll && !canReadGroup) {
    return { ok: false, status: 403, error: 'Accès refusé à ce carnet' };
  }
  if (!canReadAll) {
    const allowed = await canAccessStudentId(auth, tid);
    if (!allowed) return { ok: false, status: 403, error: 'Accès refusé à ce carnet' };
  }
  const user = await queryOne('SELECT id FROM users WHERE id = ? LIMIT 1', [tid]);
  if (!user) return { ok: false, status: 404, error: 'Utilisateur introuvable' };
  return { ok: true };
}

router.use(requireAuth);

router.get(
  '/assets/:assetId/file',
  asyncHandler(async (req, res) => {
    if (!(await ensureJournalModuleEnabled(res))) return;
    const assetId = Number(req.params.assetId);
    if (!Number.isFinite(assetId)) return res.status(400).json({ error: 'Identifiant invalide' });
    const asset = await queryOne(
      `SELECT id, user_id, asset_path FROM user_journal_article_assets WHERE id = ? LIMIT 1`,
      [assetId],
    );
    if (!asset?.asset_path) return res.status(404).json({ error: 'Illustration introuvable' });
    const access = await assertCanReadUserJournal(req.auth, asset.user_id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    const absolutePath = getAbsolutePath(asset.asset_path);
    res.sendFile(absolutePath, { dotfiles: 'allow' }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Fichier introuvable' });
    });
  }),
);

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    if (!(await ensureJournalModuleEnabled(res))) return;
    const userId = authUserId(req);
    if (!userId) return res.status(403).json({ error: 'Profil utilisateur invalide' });
    const data = await getArticlesForUser(userId);
    const imports = await getUserJournalImports(userId);
    return res.json({ ...data, imports });
  }),
);

router.get(
  '/me/imports/refs',
  asyncHandler(async (req, res) => {
    if (!(await ensureJournalModuleEnabled(res))) return;
    const userId = authUserId(req);
    if (!userId) return res.status(403).json({ error: 'Profil utilisateur invalide' });
    const refs = await getUserJournalImportRefs(userId);
    return res.json({ refs });
  }),
);

router.post(
  '/embeds/resolve',
  asyncHandler(async (req, res) => {
    if (!(await ensureJournalModuleEnabled(res))) return;
    const raw = Array.isArray(req.body?.embeds) ? req.body.embeds.slice(0, 200) : [];
    const titles = await resolveJournalEmbedTitles(raw);
    return res.json({ titles });
  }),
);

router.post(
  '/me/articles',
  asyncHandler(async (req, res) => {
    if (!(await ensureJournalModuleEnabled(res))) return;
    const userId = authUserId(req);
    if (!userId) return res.status(403).json({ error: 'Profil utilisateur invalide' });
    const title = normalizeArticleTitle(req.body?.title);
    const bodyMarkdown = req.body?.bodyMarkdown != null ? String(req.body.bodyMarkdown) : '';
    const validation = await validateArticleBody(bodyMarkdown, userId);
    if (validation.error) return res.status(400).json({ error: validation.error });

    let zoneId = null;
    if (req.body?.zoneId != null && String(req.body.zoneId).trim() !== '') {
      zoneId = String(req.body.zoneId).trim();
      const zone = await queryOne('SELECT id FROM zones WHERE id = ?', [zoneId]);
      if (!zone) return res.status(400).json({ error: 'Zone introuvable' });
    }

    const result = await execute(
      `INSERT INTO user_journal_articles (user_id, title, body_markdown, zone_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [userId, title, validation.bodyMarkdown, zoneId],
    );
    const article = await getArticleDto(result.insertId);
    emitObservationsChanged({
      reason: 'journal_article_created',
      articleId: result.insertId,
      userId,
    });
    return res.status(201).json({ article });
  }),
);

router.put(
  '/me/articles/:articleId',
  asyncHandler(async (req, res) => {
    if (!(await ensureJournalModuleEnabled(res))) return;
    const userId = authUserId(req);
    if (!userId) return res.status(403).json({ error: 'Profil utilisateur invalide' });
    const articleId = parseArticleId(req, res);
    if (articleId == null) return;

    const owned = await getArticleOwned(articleId, userId);
    if (!owned) return res.status(404).json({ error: 'Article introuvable' });

    const title = Object.prototype.hasOwnProperty.call(req.body || {}, 'title')
      ? normalizeArticleTitle(req.body.title)
      : owned.title;
    const bodyMarkdown = req.body?.bodyMarkdown != null ? String(req.body.bodyMarkdown) : '';
    const validation = await validateArticleBody(bodyMarkdown, userId);
    if (validation.error) return res.status(400).json({ error: validation.error });

    let zoneId = owned.zone_id;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'zoneId')) {
      if (req.body.zoneId == null || String(req.body.zoneId).trim() === '') {
        zoneId = null;
      } else {
        zoneId = String(req.body.zoneId).trim();
        const zone = await queryOne('SELECT id FROM zones WHERE id = ?', [zoneId]);
        if (!zone) return res.status(400).json({ error: 'Zone introuvable' });
      }
    }

    await execute(
      `UPDATE user_journal_articles
          SET title = ?, body_markdown = ?, zone_id = ?, updated_at = NOW()
        WHERE id = ? AND user_id = ?`,
      [title, validation.bodyMarkdown, zoneId, articleId, userId],
    );
    const article = await getArticleDto(articleId);
    emitObservationsChanged({ reason: 'journal_article_updated', articleId, userId });
    return res.json({ article });
  }),
);

router.put(
  '/me/articles/:articleId/pin',
  asyncHandler(async (req, res) => {
    if (!(await ensureJournalModuleEnabled(res))) return;
    const userId = authUserId(req);
    if (!userId) return res.status(403).json({ error: 'Profil utilisateur invalide' });
    const articleId = parseArticleId(req, res);
    if (articleId == null) return;
    const pinned = parsePinned(req, res);
    if (pinned == null) return;

    const affected = await setArticlePinned(articleId, userId, pinned);
    if (!affected) return res.status(404).json({ error: 'Article introuvable' });
    return res.json({ ok: true, pinned });
  }),
);

router.delete(
  '/me/articles/:articleId',
  asyncHandler(async (req, res) => {
    if (!(await ensureJournalModuleEnabled(res))) return;
    const userId = authUserId(req);
    if (!userId) return res.status(403).json({ error: 'Profil utilisateur invalide' });
    const articleId = parseArticleId(req, res);
    if (articleId == null) return;

    const owned = await getArticleOwned(articleId, userId);
    if (!owned) return res.status(404).json({ error: 'Article introuvable' });

    const assets = await queryAll(
      'SELECT asset_path FROM user_journal_article_assets WHERE article_id = ?',
      [articleId],
    );
    await execute('DELETE FROM user_journal_articles WHERE id = ? AND user_id = ?', [
      articleId,
      userId,
    ]);
    for (const asset of assets) {
      // Ne pas supprimer les fichiers legacy observations/… partagés avec observation_logs
      if (asset.asset_path && !String(asset.asset_path).startsWith('observations/')) {
        deleteFile(asset.asset_path);
      }
    }
    emitObservationsChanged({ reason: 'journal_article_deleted', articleId, userId });
    return res.json({ ok: true });
  }),
);

router.post(
  '/me/articles/:articleId/assets',
  asyncHandler(async (req, res) => {
    if (!(await ensureJournalModuleEnabled(res))) return;
    const userId = authUserId(req);
    if (!userId) return res.status(403).json({ error: 'Profil utilisateur invalide' });
    const articleId = parseArticleId(req, res);
    if (articleId == null) return;

    const owned = await getArticleOwned(articleId, userId);
    if (!owned) return res.status(404).json({ error: 'Article introuvable' });

    const limits = await getUserJournalLimits();
    const current = await countArticleAssets(articleId);
    if (limits.maxAssets > 0 && current >= limits.maxAssets) {
      return res.status(400).json({
        error: `Nombre maximum d’illustrations atteint (${limits.maxAssets})`,
      });
    }

    const decoded = decodeUserContentImageBuffer(req.body?.imageData);
    if (decoded.error) return res.status(400).json({ error: decoded.error });

    const prefix = userJournalUploadPrefix(userId);
    const rel = `${prefix}/${articleId}-${Date.now()}-${current}.${decoded.ext}`;
    await writeBufferToDisk(rel, decoded.buffer);

    const mimeType = decoded.ext === 'jpg' ? 'image/jpeg' : `image/${decoded.ext}`;
    const result = await execute(
      `INSERT INTO user_journal_article_assets (article_id, user_id, asset_path, mime_type, byte_size, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [articleId, userId, rel, mimeType, decoded.buffer.length],
    );
    const asset = await queryOne(
      'SELECT id, asset_path, mime_type, byte_size, created_at FROM user_journal_article_assets WHERE id = ? LIMIT 1',
      [result.insertId],
    );
    emitObservationsChanged({ reason: 'journal_asset_added', articleId, userId });
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

router.delete(
  '/me/articles/:articleId/assets/:assetId',
  asyncHandler(async (req, res) => {
    if (!(await ensureJournalModuleEnabled(res))) return;
    const userId = authUserId(req);
    if (!userId) return res.status(403).json({ error: 'Profil utilisateur invalide' });
    const articleId = parseArticleId(req, res);
    if (articleId == null) return;
    const assetId = Number(req.params.assetId);
    if (!Number.isFinite(assetId)) return res.status(400).json({ error: 'Identifiant invalide' });

    const asset = await queryOne(
      `SELECT id, asset_path FROM user_journal_article_assets
        WHERE id = ? AND article_id = ? AND user_id = ? LIMIT 1`,
      [assetId, articleId, userId],
    );
    if (!asset) return res.status(404).json({ error: 'Illustration introuvable' });

    await execute('DELETE FROM user_journal_article_assets WHERE id = ? AND user_id = ?', [
      assetId,
      userId,
    ]);
    if (asset.asset_path && !String(asset.asset_path).startsWith('observations/')) {
      deleteFile(asset.asset_path);
    }

    const limits = await getUserJournalLimits();
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

router.post(
  '/me/imports',
  asyncHandler(async (req, res) => {
    if (!(await ensureJournalModuleEnabled(res))) return;
    const userId = authUserId(req);
    if (!userId) return res.status(403).json({ error: 'Profil utilisateur invalide' });
    const resourceType = normalizeResourceType(req.body?.resourceType, FORETMAP_RESOURCE_TYPES);
    const resourceRef = normalizeResourceRef(req.body?.resourceRef);
    if (!resourceType || !resourceRef || !isImportableResourceType(resourceType)) {
      return res.status(400).json({ error: 'Ressource invalide' });
    }
    if (!(await resourceExists(resourceType, resourceRef))) {
      return res.status(404).json({ error: 'Ressource introuvable' });
    }
    if (!(await hasLearnedResource(userId, resourceType, resourceRef))) {
      return res
        .status(403)
        .json({ error: 'Marque d’abord cet élément comme appris pour l’importer' });
    }
    const clientTitle = normalizeImportTitle(req.body?.title);
    const title =
      clientTitle ||
      (await resolveResourceTitle(resourceType, resourceRef)) ||
      `${resourceType} · ${resourceRef}`;
    await execute(
      `INSERT INTO user_journal_imports (user_id, resource_type, resource_ref, title, created_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE title = VALUES(title)`,
      [userId, resourceType, resourceRef, title],
    );
    const row = await queryOne(
      `SELECT id, resource_type, resource_ref, title, pinned, created_at
         FROM user_journal_imports
        WHERE user_id = ? AND resource_type = ? AND resource_ref = ? LIMIT 1`,
      [userId, resourceType, resourceRef],
    );
    emitObservationsChanged({ reason: 'journal_import_added', userId });
    return res.status(201).json({
      import: {
        id: Number(row.id),
        resourceType: row.resource_type,
        resourceRef: row.resource_ref,
        title: row.title || '',
        pinned: !!row.pinned,
        createdAt: row.created_at,
      },
    });
  }),
);

router.delete(
  '/me/imports/:importId',
  asyncHandler(async (req, res) => {
    if (!(await ensureJournalModuleEnabled(res))) return;
    const userId = authUserId(req);
    if (!userId) return res.status(403).json({ error: 'Profil utilisateur invalide' });
    const importId = Number(req.params.importId);
    if (!Number.isFinite(importId)) return res.status(400).json({ error: 'Identifiant invalide' });
    const row = await queryOne(
      'SELECT id FROM user_journal_imports WHERE id = ? AND user_id = ? LIMIT 1',
      [importId, userId],
    );
    if (!row) return res.status(404).json({ error: 'Import introuvable' });
    await execute('DELETE FROM user_journal_imports WHERE id = ? AND user_id = ?', [
      importId,
      userId,
    ]);
    emitObservationsChanged({ reason: 'journal_import_deleted', userId });
    return res.json({ ok: true });
  }),
);

router.put(
  '/me/imports/:importId/pin',
  asyncHandler(async (req, res) => {
    if (!(await ensureJournalModuleEnabled(res))) return;
    const userId = authUserId(req);
    if (!userId) return res.status(403).json({ error: 'Profil utilisateur invalide' });
    const importId = Number(req.params.importId);
    if (!Number.isFinite(importId)) return res.status(400).json({ error: 'Identifiant invalide' });
    const pinned = parsePinned(req, res);
    if (pinned == null) return;

    const affected = await setImportPinned(importId, userId, pinned);
    if (!affected) return res.status(404).json({ error: 'Import introuvable' });
    return res.json({ ok: true, pinned });
  }),
);

router.get(
  '/feed',
  asyncHandler(async (req, res) => {
    if (!(await ensureJournalModuleEnabled(res))) return;
    const perms = Array.isArray(req.auth?.permissions) ? req.auth.permissions : [];
    const canReadAll = perms.includes('observations.read.all');
    const canReadGroup = perms.includes('observations.read.group');
    if (!canReadAll && !canReadGroup) {
      return res.status(403).json({ error: 'Permission insuffisante' });
    }
    await migrateObservationLogsOnce();
    const { getScopedStudentIds } = require('../lib/groupScope');
    const requestedGroupId = String(req.query?.group_id || '').trim();
    const scope = await getScopedStudentIds(req.auth, { groupId: requestedGroupId || null });
    if (scope.unauthorizedGroup) return res.status(403).json({ error: 'Groupe hors périmètre' });

    const where = scope.all
      ? ''
      : scope.studentIds.length > 0
        ? `WHERE a.user_id IN (${scope.studentIds.map(() => '?').join(',')})`
        : 'WHERE 1 = 0';
    const rows = await queryAll(
      `SELECT a.id, a.user_id, a.title, a.body_markdown, a.zone_id, a.pinned, a.created_at, a.updated_at,
              z.name AS zone_name, u.first_name, u.last_name
         FROM user_journal_articles a
         LEFT JOIN zones z ON z.id = a.zone_id
         LEFT JOIN users u ON u.id = a.user_id
         ${where}
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT 100`,
      scope.all ? [] : scope.studentIds,
    );
    return res.json({
      articles: rows.map((r) => ({
        id: Number(r.id),
        userId: String(r.user_id),
        title: r.title || '',
        bodyMarkdown: r.body_markdown || '',
        zoneId: r.zone_id != null ? String(r.zone_id) : null,
        zoneName: r.zone_name || null,
        pinned: !!r.pinned,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        firstName: r.first_name,
        lastName: r.last_name,
      })),
    });
  }),
);

router.get(
  '/users/:userId',
  asyncHandler(async (req, res) => {
    if (!(await ensureJournalModuleEnabled(res))) return;
    if (!canReadObservations(req.auth) && Number(req.auth?.userId) !== Number(req.params.userId)) {
      return res.status(403).json({ error: 'Permission insuffisante' });
    }
    const access = await assertCanReadUserJournal(req.auth, req.params.userId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    await migrateObservationLogsOnce();
    const targetId = String(req.params.userId);
    const data = await getArticlesForUser(targetId);
    const imports = await getUserJournalImports(targetId);
    const user = await queryOne(
      'SELECT id, first_name, last_name, pseudo, user_type FROM users WHERE id = ? LIMIT 1',
      [targetId],
    );
    return res.json({
      ...data,
      imports,
      user: user
        ? {
            id: String(user.id),
            firstName: user.first_name,
            lastName: user.last_name,
            pseudo: user.pseudo,
            userType: user.user_type,
          }
        : null,
    });
  }),
);

module.exports = router;
