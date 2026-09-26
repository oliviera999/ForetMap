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
  TEMPLATE_KEYS,
  TEMPLATE_DEFAULT_TITLES,
  TEMPLATE_LEVELS,
  collectStepReferences,
  resolveSteps,
  validateSteps,
  normalizeConfig,
  stepsForTemplate,
  defaultConfigForTemplate,
  serializeSessionRow,
  normalizeSlug,
  normalizeTemplateKey,
  normalizeLevel,
  parseJsonField,
  sessionDeepLink,
} = require('../lib/pedagoSessions');
const {
  recordRunStart,
  recordRunComplete,
  listRunsForUser,
  listRunsForSession,
  getRunStats,
  hasCompletedSession,
} = require('../lib/pedagoSessionRuns');
const { evaluateSessionRewards, announceableRewards } = require('../lib/rewards');
const { getScopedStudentIds } = require('../lib/groupScope');
const { resolveRouteBaseUrl } = require('../lib/mapRoutes');
const { requirePedagoModuleOrManager } = require('../lib/pedagoModuleGate');
// `qrcode` (MIT, https://github.com/soldair/node-qrcode) : déjà utilisé pour les parcours.
const QRCode = require('qrcode');

const router = express.Router();
const manageSessions = requirePermission('plants.manage');

// Module éteint (`ui.modules.pedago_sessions_enabled`) : fermé aux élèves, ouvert à
// `plants.manage` (`lib/pedagoModuleGate.js`). Usage élève (fermé) : catalogue GET `/`, détail
// GET `/:idOrSlug` (lien direct, QR), `me/runs`, `runs/start`, `runs/complete`. Gestion
// (ouverte au gestionnaire) : création, modification, `stats`, suivi `/:idOrSlug/runs`,
// partage — et les routes d'usage, pour préparer ou montrer une séance. Les tâches liées
// gardent leur lien en base (`tasks.pedago_session_id`).
router.use(requirePedagoModuleOrManager('pedago_sessions', 'Séances pédagogiques désactivées'));

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

/**
 * Contrôle à la publication d'une séance libre : chaque cible d'étape doit encore exister.
 * Les modèles gardent leurs placeholders « à choisir en séance » et ne sont pas contrôlés.
 */
async function findMissingReferences(steps) {
  const refs = collectStepReferences(steps);
  const missing = [];
  if (refs.plantIds.length) {
    const rows = await queryAll(
      `SELECT id FROM plants WHERE id IN (${refs.plantIds.map(() => '?').join(',')})`,
      refs.plantIds,
    );
    const found = new Set(rows.map((r) => Number(r.id)));
    const lost = refs.plantIds.filter((id) => !found.has(id));
    if (lost.length) missing.push(`plante(s) introuvable(s) ${lost.join(', ')}`);
  }
  if (refs.individualIds.length) {
    const rows = await queryAll(
      `SELECT id FROM tracked_individuals WHERE id IN (${refs.individualIds.map(() => '?').join(',')})`,
      refs.individualIds,
    );
    const found = new Set(rows.map((r) => Number(r.id)));
    const lost = refs.individualIds.filter((id) => !found.has(id));
    if (lost.length) missing.push(`arbre(s) suivi(s) introuvable(s) ${lost.join(', ')}`);
  }
  for (const slug of refs.routeSlugs) {
    const row = await queryOne('SELECT id FROM map_routes WHERE slug = ? LIMIT 1', [slug]);
    if (!row) missing.push(`parcours « ${slug} » introuvable`);
  }
  for (const ref of refs.keyRefs) {
    const row = await queryOne('SELECT id FROM id_keys WHERE slug = ? OR id = ? LIMIT 1', [
      ref,
      Number(ref) || 0,
    ]);
    if (!row) missing.push(`clé « ${ref} » introuvable`);
  }
  return missing;
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

/**
 * Prérequis de séance (déblocage) : `config.requiresSessionId` doit avoir été terminée.
 * Les gestionnaires de séances ne sont jamais bloqués (préparation, démonstration).
 */
async function checkPrerequisite(req, row, userId) {
  const config = normalizeConfig(parseJsonField(row.config_json, {}));
  const requiredId = config.requiresSessionId;
  if (!requiredId || hasPermission(req.auth, 'plants.manage')) return { ok: true };
  if (await hasCompletedSession(userId, requiredId)) return { ok: true };
  const required = await queryOne('SELECT id, title FROM pedago_sessions WHERE id = ? LIMIT 1', [
    requiredId,
  ]);
  if (!required) return { ok: true };
  return {
    ok: false,
    body: {
      error: `Termine d’abord la séance « ${required.title} »`,
      locked: true,
      requiresSessionId: required.id,
      requiresSessionTitle: required.title,
    },
  };
}

function runHandler(kind) {
  return asyncHandler(async (req, res) => {
    const userId = String(req.auth?.userId || '').trim();
    if (!userId) return res.status(403).json({ error: 'Profil utilisateur invalide' });
    const row = await loadSessionByIdOrSlug(req.params.idOrSlug);
    if (!row || !row.is_published) {
      return res.status(404).json({ error: 'Séance introuvable' });
    }
    const gate = await checkPrerequisite(req, row, userId);
    if (!gate.ok) return res.status(403).json(gate.body);
    if (kind === 'start') {
      const run = await recordRunStart(row.id, userId);
      return res.json({ run });
    }
    const run = await recordRunComplete(row.id, userId);
    // Attribution toujours faite (rattrapage au rallumage) ; annonce seulement si le module
    // récompenses est allumé (`ui.modules.rewards_enabled`).
    const awarded = await evaluateSessionRewards(userId, { run, level: row.level });
    return res.json({ run, rewards: await announceableRewards(awarded) });
  });
}

router.post('/:idOrSlug/runs/start', requireAuth, runHandler('start'));
router.post('/:idOrSlug/runs/complete', requireAuth, runHandler('complete'));

router.get(
  '/:idOrSlug/runs',
  manageSessions,
  asyncHandler(async (req, res) => {
    const row = await loadSessionByIdOrSlug(req.params.idOrSlug);
    if (!row) return res.status(404).json({ error: 'Séance introuvable' });
    const groupId = String(req.query?.groupId || req.query?.group_id || '').trim() || null;
    const scope = await getScopedStudentIds(req.auth, { groupId });
    if (scope.unauthorizedGroup) {
      return res.status(403).json({ error: 'Groupe hors de votre périmètre' });
    }
    const students = await listRunsForSession(row.id, scope.all ? null : scope.studentIds);
    return res.json({ sessionId: row.id, groupId, students });
  }),
);

router.get(
  '/:idOrSlug/share',
  manageSessions,
  asyncHandler(async (req, res) => {
    const row = await loadSessionByIdOrSlug(req.params.idOrSlug);
    if (!row) return res.status(404).json({ error: 'Séance introuvable' });
    const baseUrl = resolveRouteBaseUrl({
      query: req.query?.base_url,
      request: `${req.protocol}://${req.get('host')}`,
    });
    const link = sessionDeepLink(baseUrl, row.slug);
    const qrDataUrl = await QRCode.toDataURL(link, { margin: 1, width: 320 });
    return res.json({ link, qrDataUrl, isPublished: !!row.is_published });
  }),
);

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
        .json({ error: `templateKey invalide (${[...TEMPLATE_KEYS].join(' | ')})` });
    }
    const steps =
      templateKey === 'custom' && Array.isArray(req.body?.steps)
        ? req.body.steps
        : stepsForTemplate(templateKey);
    const stepsCheck = validateSteps(steps);
    if (!stepsCheck.ok) return res.status(400).json({ error: stepsCheck.error });

    const title =
      String(req.body?.title || '').trim() || TEMPLATE_DEFAULT_TITLES[templateKey] || 'Séance';
    let slug = normalizeSlug(req.body?.slug);
    if (!slug) {
      slug = normalizeSlug(
        `${templateKey.replace(/_/g, '-')}-${Date.now().toString(36)}`.slice(0, 120),
      );
    }
    if (!slug) return res.status(400).json({ error: 'slug invalide' });

    const level = normalizeLevel(req.body?.level || TEMPLATE_LEVELS[templateKey]);
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
    if (isPublished && templateKey === 'custom') {
      const resolved = resolveSteps(stepsCheck.steps, config, { payloadFirst: true });
      const missing = await findMissingReferences(resolved);
      if (missing.length) {
        return res.status(400).json({ error: `Publication impossible : ${missing.join(' ; ')}` });
      }
    }
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
 * Mise à jour config prof (carte / clé / plantes / quiz / prérequis) + publication.
 * Les étapes (`steps`) ne sont modifiables que pour une séance libre (`custom`).
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
      individualId: pick('individualId', 'individualId', prevConfig.individualId),
      mapRouteSlug: pick('mapRouteSlug', 'mapRouteSlug', prevConfig.mapRouteSlug),
      requiresSessionId: pick(
        'requiresSessionId',
        'requiresSessionId',
        prevConfig.requiresSessionId,
      ),
    });

    let mapId = nextConfig.mapId;
    if (mapId) {
      const exists = await mapExists(mapId);
      if (!exists) return res.status(400).json({ error: 'Carte introuvable' });
    } else {
      mapId = null;
    }

    if (nextConfig.requiresSessionId) {
      if (nextConfig.requiresSessionId === row.id) {
        return res.status(400).json({ error: 'Une séance ne peut pas être son propre prérequis' });
      }
      const required = await queryOne('SELECT id FROM pedago_sessions WHERE id = ? LIMIT 1', [
        nextConfig.requiresSessionId,
      ]);
      if (!required) return res.status(400).json({ error: 'Séance prérequise introuvable' });
    }

    let stepsJson = row.steps_json;
    if (req.body?.steps !== undefined) {
      if (row.template_key !== 'custom') {
        return res.status(400).json({
          error: 'Les étapes d’un modèle sont figées : crée une séance libre pour les modifier',
        });
      }
      const stepsCheck = validateSteps(req.body.steps);
      if (!stepsCheck.ok) return res.status(400).json({ error: stepsCheck.error });
      stepsJson = JSON.stringify(stepsCheck.steps);
    }

    let isPublished = row.is_published ? 1 : 0;
    if (req.body?.isPublished !== undefined || req.body?.is_published !== undefined) {
      const raw = req.body.isPublished !== undefined ? req.body.isPublished : req.body.is_published;
      isPublished = raw === true || raw === 1 || raw === '1' ? 1 : 0;
    }

    if (isPublished && row.template_key === 'custom') {
      const check = validateSteps(parseJsonField(stepsJson, []));
      const resolved = check.ok
        ? resolveSteps(check.steps, nextConfig, { payloadFirst: true })
        : [];
      const missing = await findMissingReferences(resolved);
      if (missing.length) {
        return res.status(400).json({ error: `Publication impossible : ${missing.join(' ; ')}` });
      }
    }

    const sortOrder =
      req.body?.sortOrder != null && Number.isFinite(Number(req.body.sortOrder))
        ? Math.trunc(Number(req.body.sortOrder))
        : Number(row.sort_order) || 100;

    await execute(
      `UPDATE pedago_sessions
          SET title = ?, description = ?, level = ?, map_id = ?,
              config_json = ?, steps_json = ?, is_published = ?, sort_order = ?
        WHERE id = ?`,
      [
        title,
        description || null,
        level,
        mapId,
        JSON.stringify({ ...nextConfig, mapId }),
        stepsJson,
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
