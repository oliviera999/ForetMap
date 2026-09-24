'use strict';

/**
 * Séances pédagogiques — lecture publique des publiées ; config / CRUD sous plants.manage.
 * Distinct des parcours géographiques (`map_routes`).
 */

const crypto = require('node:crypto');
const express = require('express');
const { queryAll, queryOne, execute } = require('../database');
const asyncHandler = require('../lib/asyncHandler');
const {
  requireAuth,
  requirePermission,
  hasPermission,
  parseBearerToken,
  hydrateAuthFromTokenClaims,
  JWT_SECRET,
} = require('../middleware/requireTeacher');
const { verifyJwtToken } = require('../lib/auth/jwtPipeline');
const { mapExists } = require('../lib/mapQueries');
const {
  validateSteps,
  normalizeConfig,
  stepsForTemplate,
  defaultConfigForTemplate,
  serializeSessionRow,
  normalizeSlug,
  normalizeTemplateKey,
  normalizeLevel,
  parseJsonField,
} = require('../lib/pedagoSessions');
const {
  recordRunStart,
  recordRunComplete,
  listRunsForUser,
  getRunStats,
} = require('../lib/pedagoSessionRuns');

const router = express.Router();
const manageSessions = requirePermission('plants.manage');

const SELECT_COLS = `id, slug, title, description, level, template_key, map_id,
  config_json, steps_json, is_published, sort_order, created_at, updated_at`;

async function tryResolveAuth(req) {
  try {
    const token = parseBearerToken(req);
    if (!token) return null;
    const claims = verifyJwtToken(token, JWT_SECRET);
    return await hydrateAuthFromTokenClaims(claims);
  } catch {
    return null;
  }
}

async function loadSessionByIdOrSlug(idOrSlug) {
  const key = String(idOrSlug || '').trim();
  if (!key) return null;
  return queryOne(`SELECT ${SELECT_COLS} FROM pedago_sessions WHERE id = ? OR slug = ? LIMIT 1`, [
    key,
    key,
  ]);
}

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const wantAll = String(req.query?.all || '') === '1';
    let includeDrafts = false;
    if (wantAll) {
      const auth = await tryResolveAuth(req);
      includeDrafts = hasPermission(auth, 'plants.manage');
      if (!includeDrafts) {
        return res.status(403).json({ error: 'Droit plants.manage requis pour ?all=1' });
      }
    }
    const rows = includeDrafts
      ? await queryAll(
          `SELECT ${SELECT_COLS} FROM pedago_sessions ORDER BY sort_order ASC, title ASC`,
        )
      : await queryAll(
          `SELECT ${SELECT_COLS} FROM pedago_sessions
            WHERE is_published = 1
            ORDER BY sort_order ASC, title ASC`,
        );
    return res.json({
      items: rows.map((row) => serializeSessionRow(row)),
    });
  }),
);

router.get(
  '/stats',
  manageSessions,
  asyncHandler(async (_req, res) => {
    const stats = await getRunStats();
    return res.json({ stats });
  }),
);

router.get(
  '/me/runs',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = String(req.auth?.userId || '').trim();
    if (!userId) return res.status(403).json({ error: 'Profil utilisateur invalide' });
    const runs = await listRunsForUser(userId);
    return res.json({ runs });
  }),
);

function runHandler(record) {
  return asyncHandler(async (req, res) => {
    const userId = String(req.auth?.userId || '').trim();
    if (!userId) return res.status(403).json({ error: 'Profil utilisateur invalide' });
    const row = await loadSessionByIdOrSlug(req.params.idOrSlug);
    if (!row || !row.is_published) {
      return res.status(404).json({ error: 'Séance introuvable' });
    }
    const run = await record(row.id, userId);
    return res.json({ run });
  });
}

router.post('/:idOrSlug/runs/start', requireAuth, runHandler(recordRunStart));
router.post('/:idOrSlug/runs/complete', requireAuth, runHandler(recordRunComplete));

router.get(
  '/:idOrSlug',
  asyncHandler(async (req, res) => {
    const row = await loadSessionByIdOrSlug(req.params.idOrSlug);
    if (!row) return res.status(404).json({ error: 'Séance introuvable' });
    if (!row.is_published) {
      const auth = await tryResolveAuth(req);
      if (!hasPermission(auth, 'plants.manage')) {
        return res.status(404).json({ error: 'Séance introuvable' });
      }
    }
    return res.json(serializeSessionRow(row));
  }),
);

router.post(
  '/',
  manageSessions,
  asyncHandler(async (req, res) => {
    const templateKey = normalizeTemplateKey(req.body?.templateKey || req.body?.template_key);
    if (!templateKey) {
      return res
        .status(400)
        .json({ error: 'templateKey invalide (college_reconaitre | college_qui_mange)' });
    }
    const steps = stepsForTemplate(templateKey);
    const stepsCheck = validateSteps(steps);
    if (!stepsCheck.ok) return res.status(400).json({ error: stepsCheck.error });

    const title =
      String(req.body?.title || '').trim() ||
      (templateKey === 'college_qui_mange'
        ? 'Qui mange qui sur le site'
        : 'Reconnaître sans toucher');
    let slug = normalizeSlug(req.body?.slug);
    if (!slug) {
      slug = normalizeSlug(
        `${templateKey.replace(/_/g, '-')}-${Date.now().toString(36)}`.slice(0, 120),
      );
    }
    if (!slug) return res.status(400).json({ error: 'slug invalide' });

    const level = normalizeLevel(req.body?.level);
    const config = normalizeConfig({
      ...defaultConfigForTemplate(templateKey),
      ...(isPlainObject(req.body?.config) ? req.body.config : {}),
      mapId: req.body?.mapId ?? req.body?.config?.mapId,
    });
    let mapId = config.mapId;
    if (mapId) {
      const exists = await mapExists(mapId);
      if (!exists) return res.status(400).json({ error: 'Carte introuvable' });
    } else {
      mapId = null;
    }

    const id = crypto.randomUUID();
    const description = req.body?.description != null ? String(req.body.description).trim() : '';
    const isPublished = req.body?.isPublished === true || req.body?.is_published === true ? 1 : 0;
    const sortOrder = Number.isFinite(Number(req.body?.sortOrder))
      ? Math.trunc(Number(req.body.sortOrder))
      : 100;

    try {
      await execute(
        `INSERT INTO pedago_sessions
          (id, slug, title, description, level, template_key, map_id,
           config_json, steps_json, is_published, sort_order, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          slug,
          title.slice(0, 180),
          description || null,
          level,
          templateKey,
          mapId,
          JSON.stringify({ ...config, mapId }),
          JSON.stringify(stepsCheck.steps),
          isPublished,
          sortOrder,
          req.auth?.userId || null,
        ],
      );
    } catch (err) {
      if (err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062)) {
        return res.status(409).json({ error: 'Ce slug existe déjà' });
      }
      throw err;
    }

    const row = await loadSessionByIdOrSlug(id);
    return res.status(201).json(serializeSessionRow(row));
  }),
);

/**
 * Mise à jour config prof (carte / clé / plantes / quiz) + publication — sans éditer la structure.
 */
router.put(
  '/:idOrSlug',
  manageSessions,
  asyncHandler(async (req, res) => {
    const row = await loadSessionByIdOrSlug(req.params.idOrSlug);
    if (!row) return res.status(404).json({ error: 'Séance introuvable' });

    const title = req.body?.title != null ? String(req.body.title).trim().slice(0, 180) : row.title;
    if (!title) return res.status(400).json({ error: 'title requis' });

    const description =
      req.body?.description != null ? String(req.body.description).trim() : row.description || '';

    const level = req.body?.level != null ? normalizeLevel(req.body.level) : row.level || 'college';

    const prevConfig = normalizeConfig(parseJsonField(row.config_json, {}));
    const bodyConfig = isPlainObject(req.body?.config) ? req.body.config : {};
    const pick = (bodyKey, configKey, prev) => {
      if (req.body?.[bodyKey] !== undefined) return req.body[bodyKey];
      if (bodyConfig[configKey] !== undefined) return bodyConfig[configKey];
      return prev;
    };

    const nextConfig = normalizeConfig({
      ...prevConfig,
      ...bodyConfig,
      mapId: pick('mapId', 'mapId', prevConfig.mapId),
      keyIdOrSlug: pick('keyIdOrSlug', 'keyIdOrSlug', prevConfig.keyIdOrSlug),
      plantId: pick('plantId', 'plantId', prevConfig.plantId),
      plantIds: pick('plantIds', 'plantIds', prevConfig.plantIds),
      notionNiveau: pick('notionNiveau', 'notionNiveau', prevConfig.notionNiveau),
      notionId: pick('notionId', 'notionId', prevConfig.notionId),
      questionCode: pick('questionCode', 'questionCode', prevConfig.questionCode),
    });

    let mapId = nextConfig.mapId;
    if (mapId) {
      const exists = await mapExists(mapId);
      if (!exists) return res.status(400).json({ error: 'Carte introuvable' });
    } else {
      mapId = null;
    }

    let isPublished = row.is_published ? 1 : 0;
    if (req.body?.isPublished !== undefined || req.body?.is_published !== undefined) {
      const raw = req.body.isPublished !== undefined ? req.body.isPublished : req.body.is_published;
      isPublished = raw === true || raw === 1 || raw === '1' ? 1 : 0;
    }

    const sortOrder =
      req.body?.sortOrder != null && Number.isFinite(Number(req.body.sortOrder))
        ? Math.trunc(Number(req.body.sortOrder))
        : Number(row.sort_order) || 100;

    await execute(
      `UPDATE pedago_sessions
          SET title = ?, description = ?, level = ?, map_id = ?,
              config_json = ?, is_published = ?, sort_order = ?
        WHERE id = ?`,
      [
        title,
        description || null,
        level,
        mapId,
        JSON.stringify({ ...nextConfig, mapId }),
        isPublished,
        sortOrder,
        row.id,
      ],
    );

    const updated = await loadSessionByIdOrSlug(row.id);
    return res.json(serializeSessionRow(updated));
  }),
);

module.exports = router;
