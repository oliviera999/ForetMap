const express = require('express');
const path = require('path');
const { queryAll, queryOne, execute } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const { logRouteError, respondInternalError } = require('../lib/routeLog');
const asyncHandler = require('../lib/asyncHandler');
const { z, validate } = require('../lib/validate');
const { logAudit } = require('./audit');
const { invalidateMapsListCache } = require('./maps');

// `limit` : coercition permissive (repli sur le défaut côté handler si absent/non numérique) — jamais de 400.
const settingsMediaQuerySchema = z.object({ limit: z.coerce.number().optional().catch(undefined) });
// `lines` : coercition tolérante reproduisant `Number.isFinite(parseInt(lines, 10)) ? raw : 200` (0 conservé).
const settingsLogsQuerySchema = z.object({
  lines: z.preprocess((v) => parseInt(v, 10), z.number().finite().catch(200)),
});
const { tailLogLines, getBufferedLineCount, getMaxLines } = require('../lib/logBuffer');
const { saveBase64ToDisk, deleteFile } = require('../lib/uploads');
const {
  saveMediaFromDataUrl,
  listMediaLibraryItems,
  executeMediaLibraryDeleteRequest,
} = require('../lib/mediaLibrary');
const {
  getSettings,
  setSetting,
  listAdminSettings,
  validateCrossSettings,
  invalidateSettingsCache,
} = require('../lib/settings');
const {
  getHelpConfigFromDb,
  saveHelpConfigToDb,
  loadDefaultHelpConfig,
  normalizeHelpConfig,
} = require('../lib/helpContent');
const { runSpeciesAutofillProviderSelfTest } = require('../lib/speciesAutofillProviderSelfTest');
const { normalizeMapImageUrl } = require('../lib/mapImageUrl');
const { withMapGeoref, isValidAnchors, sanitizeAnchors } = require('../lib/mapGeoref');
const { MAP_SLUG_RE } = require('../lib/studentAffiliation');
const { getRuntimeProcessSnapshot } = require('../lib/runtimeDiagnostics');
const logMetrics = require('../lib/logMetrics');

const router = express.Router();

function parseBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

async function getMapById(id) {
  try {
    return await queryOne(
      'SELECT id, label, map_image_url, sort_order, frame_padding_px, is_active, geo_anchors_json, gps_enabled FROM maps WHERE id = ? LIMIT 1',
      [id],
    );
  } catch (e) {
    if (!(e && (e.errno === 1054 || e.code === 'ER_BAD_FIELD_ERROR'))) throw e;
    return queryOne(
      'SELECT id, label, map_image_url, sort_order, NULL AS frame_padding_px, 1 AS is_active, NULL AS geo_anchors_json, 0 AS gps_enabled FROM maps WHERE id = ? LIMIT 1',
      [id],
    );
  }
}

async function listMaps() {
  try {
    return await queryAll(
      'SELECT id, label, map_image_url, sort_order, frame_padding_px, is_active, geo_anchors_json, gps_enabled FROM maps ORDER BY sort_order ASC, label ASC',
    );
  } catch (e) {
    if (!(e && (e.errno === 1054 || e.code === 'ER_BAD_FIELD_ERROR'))) throw e;
    return queryAll(
      'SELECT id, label, map_image_url, sort_order, NULL AS frame_padding_px, 1 AS is_active, NULL AS geo_anchors_json, 0 AS gps_enabled FROM maps ORDER BY sort_order ASC, label ASC',
    );
  }
}

/** Sérialise une ligne `maps` pour l'API (URL image normalisée, booléens, géoréférencement). */
function serializeMap(row) {
  return withMapGeoref({
    ...row,
    map_image_url: normalizeMapImageUrl(row.id, row.map_image_url),
    is_active: !!row.is_active,
  });
}

router.get(
  '/public',
  asyncHandler(async (req, res) => {
    const settings = await getSettings('public');
    res.json({ settings: settings.nested });
  }),
);

router.get(
  '/admin',
  requirePermission('admin.settings.read', { needsElevation: true }),
  asyncHandler(async (req, res) => {
    const [settingsRows, maps] = await Promise.all([listAdminSettings(), listMaps()]);
    res.json({
      settings: settingsRows,
      maps: maps.map(serializeMap),
    });
  }),
);

router.get(
  '/admin/help-content',
  requirePermission('admin.settings.read', { needsElevation: true }),
  asyncHandler(async (_req, res) => {
    const config = await getHelpConfigFromDb();
    res.json(config);
  }),
);

router.put(
  '/admin/help-content',
  requirePermission('admin.settings.write', { needsElevation: true }),
  asyncHandler(async (req, res) => {
    const normalized = await saveHelpConfigToDb(req.body, {
      userType: req.auth?.userType,
      userId: req.auth?.userId,
    });
    invalidateSettingsCache();
    await logAudit(
      'settings_help_content_update',
      'setting',
      'content.help.registry',
      'Registre aide mis à jour',
      {
        req,
      },
    );
    res.json(normalized);
  }),
);

router.post(
  '/admin/help-content/reset',
  requirePermission('admin.settings.write', { needsElevation: true }),
  asyncHandler(async (req, res) => {
    const normalized = await saveHelpConfigToDb(loadDefaultHelpConfig(), {
      userType: req.auth?.userType,
      userId: req.auth?.userId,
    });
    invalidateSettingsCache();
    await logAudit(
      'settings_help_content_reset',
      'setting',
      'content.help.registry',
      'Registre aide réinitialisé',
      {
        req,
      },
    );
    res.json(normalized);
  }),
);

router.put(
  '/admin/:key',
  requirePermission('admin.settings.write', { needsElevation: true }),
  async (req, res) => {
    try {
      const key = String(req.params.key || '').trim();
      if (!key) return res.status(400).json({ error: 'Clé de réglage requise' });
      const value = req.body?.value;
      if (
        [
          'ui.map.default_map_student',
          'ui.map.default_map_teacher',
          'ui.map.default_map_visit',
        ].includes(key)
      ) {
        const exists = await queryOne('SELECT id FROM maps WHERE id = ? LIMIT 1', [
          String(value || '').trim(),
        ]);
        if (!exists) return res.status(400).json({ error: 'Carte par défaut introuvable' });
      }
      const updated = await setSetting(key, value, {
        userType: req.auth?.userType,
        userId: req.auth?.userId,
      });
      const all = await getSettings('admin');
      await validateCrossSettings(all.flat);
      await logAudit('settings_update', 'setting', key, 'Réglage mis à jour', {
        req,
        payload: { key, value: updated },
      });
      res.json({ ok: true, key, value: updated });
    } catch (e) {
      logRouteError(e, req);
      res.status(400).json({ error: e.message });
    }
  },
);

router.post(
  '/admin/maps',
  requirePermission('admin.settings.write', { needsElevation: true }),
  asyncHandler(async (req, res) => {
    const id = String(req.body?.id || '')
      .trim()
      .toLowerCase();
    const label = String(req.body?.label || '').trim();
    if (!id || !MAP_SLUG_RE.test(id)) {
      return res.status(400).json({
        error: 'Identifiant carte invalide (minuscules, chiffres, tirets ; 1 à 31 caractères)',
      });
    }
    if (id === 'both') {
      return res.status(400).json({ error: 'Identifiant réservé (both)' });
    }
    const dup = await queryOne('SELECT id FROM maps WHERE id = ? LIMIT 1', [id]);
    if (dup) return res.status(409).json({ error: 'Une carte avec cet identifiant existe déjà' });
    if (!label) return res.status(400).json({ error: 'Label requis' });
    const sortOrderRaw = parseInt(req.body?.sort_order, 10);
    const sortOrder = Number.isFinite(sortOrderRaw) ? Math.max(0, sortOrderRaw) : 999;
    const mapImageUrl = normalizeMapImageUrl(id, String(req.body?.map_image_url || '').trim());
    const isActive = parseBoolean(req.body?.is_active, true);
    try {
      await execute(
        `INSERT INTO maps (id, label, map_image_url, sort_order, frame_padding_px, is_active)
         VALUES (?, ?, ?, ?, NULL, ?)`,
        [id, label, mapImageUrl, sortOrder, isActive ? 1 : 0],
      );
    } catch (e) {
      if (!(e && (e.errno === 1054 || e.code === 'ER_BAD_FIELD_ERROR'))) throw e;
      await execute('INSERT INTO maps (id, label, map_image_url, sort_order) VALUES (?, ?, ?, ?)', [
        id,
        label,
        mapImageUrl,
        sortOrder,
      ]);
    }
    invalidateMapsListCache();
    const created = await getMapById(id);
    await logAudit('settings_map_create', 'map', id, 'Carte créée', {
      req,
      payload: { id, label, map_image_url: mapImageUrl, sort_order: sortOrder },
    });
    res.status(201).json(serializeMap(created));
  }),
);

router.put(
  '/admin/maps/:id',
  requirePermission('admin.settings.write', { needsElevation: true }),
  asyncHandler(async (req, res) => {
    const map = await getMapById(req.params.id);
    if (!map) return res.status(404).json({ error: 'Carte introuvable' });
    const label = String(req.body?.label ?? map.label).trim();
    const mapImageUrl = normalizeMapImageUrl(
      map.id,
      String(req.body?.map_image_url ?? map.map_image_url).trim(),
    );
    const sortOrderRaw = parseInt(req.body?.sort_order, 10);
    const sortOrder = Number.isFinite(sortOrderRaw) ? Math.max(0, sortOrderRaw) : map.sort_order;
    const framePaddingRaw = req.body?.frame_padding_px;
    const framePadding =
      framePaddingRaw === null || framePaddingRaw === ''
        ? null
        : (() => {
            const n = parseInt(framePaddingRaw, 10);
            if (!Number.isFinite(n)) return map.frame_padding_px;
            return Math.min(Math.max(n, 0), 32);
          })();
    const isActive = parseBoolean(req.body?.is_active, !!map.is_active);
    if (!label) return res.status(400).json({ error: 'Label requis' });
    try {
      await execute(
        `UPDATE maps
            SET label = ?, map_image_url = ?, sort_order = ?, frame_padding_px = ?, is_active = ?
          WHERE id = ?`,
        [label, mapImageUrl, sortOrder, framePadding, isActive ? 1 : 0, map.id],
      );
    } catch (e) {
      if (!(e && (e.errno === 1054 || e.code === 'ER_BAD_FIELD_ERROR'))) throw e;
      await execute('UPDATE maps SET label = ?, map_image_url = ?, sort_order = ? WHERE id = ?', [
        label,
        mapImageUrl,
        sortOrder,
        map.id,
      ]);
    }
    const updated = await getMapById(map.id);
    invalidateMapsListCache();
    await logAudit('settings_map_update', 'map', map.id, 'Carte mise à jour', {
      req,
      payload: {
        label: updated.label,
        map_image_url: updated.map_image_url,
        sort_order: updated.sort_order,
        frame_padding_px: updated.frame_padding_px,
        is_active: !!updated.is_active,
      },
    });
    res.json(serializeMap(updated));
  }),
);

router.post(
  '/admin/maps/:id/image',
  requirePermission('admin.settings.write', { needsElevation: true }),
  asyncHandler(async (req, res) => {
    const map = await getMapById(req.params.id);
    if (!map) return res.status(404).json({ error: 'Carte introuvable' });
    const imageData = String(req.body?.image_data || '').trim();
    if (!imageData) return res.status(400).json({ error: 'image_data requis' });
    const filename = `${map.id}-${Date.now()}.jpg`;
    const relativePath = path.join('maps', filename).replace(/\\/g, '/');
    saveBase64ToDisk(relativePath, imageData);
    const nextUrl = `/uploads/${relativePath}`;
    const oldUrl = String(map.map_image_url || '').trim();
    await execute('UPDATE maps SET map_image_url = ? WHERE id = ?', [nextUrl, map.id]);
    if (oldUrl.startsWith('/uploads/maps/')) {
      deleteFile(oldUrl.replace('/uploads/', ''));
    }
    invalidateMapsListCache();
    await logAudit('settings_map_image_update', 'map', map.id, 'Image de plan changée', {
      req,
      payload: { map_id: map.id, map_image_url: nextUrl },
    });
    const updated = await getMapById(map.id);
    res.json(serializeMap(updated));
  }),
);

router.put(
  '/admin/maps/:id/georef',
  requirePermission('admin.settings.write', { needsElevation: true }),
  asyncHandler(async (req, res) => {
    const map = await getMapById(req.params.id);
    if (!map) return res.status(404).json({ error: 'Carte introuvable' });

    const rawAnchors = req.body?.anchors;
    const hasAnchors =
      rawAnchors != null && !(Array.isArray(rawAnchors) && rawAnchors.length === 0);
    let anchorsJson = null;
    if (hasAnchors) {
      if (!isValidAnchors(rawAnchors)) {
        return res.status(400).json({
          error: 'Calage GPS invalide : 3 points distincts requis (xp/yp en %, lat/lng valides).',
        });
      }
      anchorsJson = JSON.stringify(sanitizeAnchors(rawAnchors));
    }
    const gpsEnabled = parseBoolean(req.body?.gps_enabled, false) && !!anchorsJson;

    await execute('UPDATE maps SET geo_anchors_json = ?, gps_enabled = ? WHERE id = ?', [
      anchorsJson,
      gpsEnabled ? 1 : 0,
      map.id,
    ]);
    invalidateMapsListCache();
    const updated = await getMapById(map.id);
    await logAudit('settings_map_georef', 'map', map.id, 'Calage GPS du plan mis à jour', {
      req,
      payload: { map_id: map.id, gps_enabled: gpsEnabled, has_anchors: !!anchorsJson },
    });
    res.json(serializeMap(updated));
  }),
);

router.get(
  '/admin/media-library',
  requirePermission('admin.settings.read', { needsElevation: true }),
  validate({ query: settingsMediaQuerySchema }),
  asyncHandler(async (req, res) => {
    const limit = req.validatedQuery?.limit;
    const items = listMediaLibraryItems(Number.isFinite(limit) ? limit : 300, { app: 'foretmap' });
    res.json({ items });
  }),
);

router.post(
  '/admin/media-library',
  requirePermission('admin.settings.write', { needsElevation: true }),
  asyncHandler(async (req, res) => {
    const mediaData = String(req.body?.media_data || '').trim();
    if (!mediaData) return res.status(400).json({ error: 'media_data requis' });
    const originalName =
      String(req.body?.original_name || req.body?.originalName || '').trim() || null;
    const saved = saveMediaFromDataUrl(mediaData, { originalName, app: 'foretmap' });
    await logAudit('settings_media_upload', 'media', saved.relativePath, 'Média uploadé', {
      req,
      payload: {
        media_type: saved.mediaType,
        mime_type: saved.mimeType,
        size: saved.size,
        url: saved.url,
      },
    });
    res.status(201).json(saved);
  }),
);

router.delete(
  '/admin/media-library',
  requirePermission('admin.settings.write', { needsElevation: true }),
  asyncHandler(async (req, res) => {
    const payload = executeMediaLibraryDeleteRequest(req.body || {});
    await logAudit('settings_media_delete', 'media', 'bulk', 'Média(s) supprimé(s)', {
      req,
      payload: {
        deleted: payload.deleted,
        failed: payload.failed,
        total: payload.total,
      },
    });
    res.json(payload);
  }),
);

router.get(
  '/admin/system/diagnostics',
  requirePermission('admin.settings.read', { needsElevation: true }),
  asyncHandler(async (req, res) => {
    const settings = await getSettings('admin');
    if (!settings.flat['ops.allow_remote_logs']) {
      return res.status(403).json({ error: 'Diagnostics système désactivés' });
    }
    const toMb = (n) => Math.round((n / 1024 / 1024) * 100) / 100;
    const mem = process.memoryUsage();
    const t0 = Date.now();
    let database = { ok: false };
    try {
      await queryOne('SELECT 1 AS ok');
      database = { ok: true, latencyMs: Date.now() - t0 };
    } catch (_) {
      database = { ok: false, error: 'Database unavailable' };
    }
    res.json({
      ok: true,
      ts: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV || null,
      nodeVersion: process.version,
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        rssMb: toMb(mem.rss),
        heapUsedMb: toMb(mem.heapUsed),
        heapTotalMb: toMb(mem.heapTotal),
      },
      database,
      logBuffer: {
        linesCount: getBufferedLineCount(),
        maxLines: getMaxLines(),
      },
      metrics: logMetrics.getMetrics(),
      runtimeProcess: getRuntimeProcessSnapshot(),
    });
  }),
);

router.get(
  '/admin/system/logs',
  requirePermission('admin.settings.read', { needsElevation: true }),
  validate({ query: settingsLogsQuerySchema }),
  asyncHandler(async (req, res) => {
    const settings = await getSettings('admin');
    if (!settings.flat['ops.allow_remote_logs']) {
      return res.status(403).json({ error: 'Consultation des logs désactivée' });
    }
    const n = req.validatedQuery.lines;
    const entries = tailLogLines(n);
    res.json({
      ok: true,
      returned: entries.length,
      bufferLines: getBufferedLineCount(),
      bufferMax: getMaxLines(),
      entries,
    });
  }),
);

router.get(
  '/admin/system/species-autofill-providers-test',
  requirePermission('admin.settings.read', { needsElevation: true }),
  async (req, res) => {
    try {
      const payload = await runSpeciesAutofillProviderSelfTest();
      res.json(payload);
    } catch (e) {
      respondInternalError(res, req, e, 'Auto-test fournisseurs en échec');
    }
  },
);

router.get(
  '/admin/system/oauth-debug',
  requirePermission('admin.settings.read', { needsElevation: true }),
  asyncHandler(async (req, res) => {
    const frontendOrigin = String(
      process.env.FRONTEND_ORIGIN ||
        process.env.PASSWORD_RESET_BASE_URL ||
        `${req.protocol}://${req.get('host')}`,
    );
    const redirectUri = String(
      process.env.GOOGLE_OAUTH_REDIRECT_URI ||
        `${req.protocol}://${req.get('host')}/api/auth/google/callback`,
    );
    res.json({
      ok: true,
      runtime: {
        nodeEnv: process.env.NODE_ENV || null,
        host: req.get('host') || null,
        protocol: req.protocol || null,
      },
      oauth: {
        googleClientIdSet: !!String(process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim(),
        googleClientSecretSet: !!String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim(),
        resolvedFrontendOrigin: frontendOrigin,
        resolvedGoogleRedirectUri: redirectUri,
        allowedDomains: String(process.env.GOOGLE_OAUTH_ALLOWED_DOMAINS || ''),
        allowedEmails: String(process.env.GOOGLE_OAUTH_ALLOWED_EMAILS || ''),
      },
    });
  }),
);

router.post(
  '/admin/system/restart',
  requirePermission('admin.settings.secrets.write', { needsElevation: true }),
  asyncHandler(async (req, res) => {
    const settings = await getSettings('admin');
    if (!settings.flat['ops.allow_remote_restart']) {
      return res.status(403).json({ error: 'Redémarrage distant désactivé' });
    }
    await logAudit(
      'settings_system_restart',
      'system',
      'node-process',
      'Redémarrage demandé via GUI admin',
      { req },
    );
    res.json({ ok: true, message: 'Redémarrage dans 1s' });
    setTimeout(() => process.exit(0), 1000);
  }),
);

module.exports = router;
// Exportés pour les tests no-DB du contrat de validation O7.
module.exports.settingsMediaQuerySchema = settingsMediaQuerySchema;
module.exports.settingsLogsQuerySchema = settingsLogsQuerySchema;
