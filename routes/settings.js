const express = require('express');
const path = require('path');
const { queryAll, queryOne, execute } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const { logAudit } = require('./audit');
const { tailLogLines, getBufferedLineCount, getMaxLines } = require('../lib/logBuffer');
const { saveBase64ToDisk, deleteFile } = require('../lib/uploads');
const {
  getSettings,
  setSetting,
  listAdminSettings,
  validateCrossSettings,
} = require('../lib/settings');

const router = express.Router();

function normalizeMapImageUrl(mapId, mapImageUrl) {
  const raw = (mapImageUrl || '').trim();
  if (mapId === 'foret') {
    if (!raw || raw === '/maps/map-foret.png' || raw === '/maps/map-foret.svg' || raw === '/map.png') {
      return '/map.png';
    }
  }
  if (mapId === 'n3') {
    if (!raw || raw === '/maps/map-n3.png' || raw === '/maps/map-n3.svg' || raw === '/maps/plan n3.jpg') {
      return '/maps/plan%20n3.jpg';
    }
  }
  return raw || (mapId === 'n3' ? '/maps/plan%20n3.jpg' : '/map.png');
}

function parseBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

async function getMapById(id) {
  try {
    return await queryOne(
      'SELECT id, label, map_image_url, sort_order, frame_padding_px, is_active FROM maps WHERE id = ? LIMIT 1',
      [id]
    );
  } catch (e) {
    if (!(e && (e.errno === 1054 || e.code === 'ER_BAD_FIELD_ERROR'))) throw e;
    return queryOne(
      'SELECT id, label, map_image_url, sort_order, NULL AS frame_padding_px, 1 AS is_active FROM maps WHERE id = ? LIMIT 1',
      [id]
    );
  }
}

async function listMaps() {
  try {
    return await queryAll(
      'SELECT id, label, map_image_url, sort_order, frame_padding_px, is_active FROM maps ORDER BY sort_order ASC, label ASC'
    );
  } catch (e) {
    if (!(e && (e.errno === 1054 || e.code === 'ER_BAD_FIELD_ERROR'))) throw e;
    return queryAll(
      'SELECT id, label, map_image_url, sort_order, NULL AS frame_padding_px, 1 AS is_active FROM maps ORDER BY sort_order ASC, label ASC'
    );
  }
}

router.get('/public', async (req, res) => {
  try {
    const settings = await getSettings('public');
    res.json({ settings: settings.nested });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.get(
  '/admin',
  requirePermission('admin.settings.read', { needsElevation: true }),
  async (req, res) => {
    try {
      const [settingsRows, maps, progressionRoles] = await Promise.all([
        listAdminSettings(),
        listMaps(),
        queryAll(
          `SELECT id, slug, display_name, \`rank\` AS \`rank\`, is_system
             FROM roles
            WHERE LOWER(slug) NOT IN ('prof', 'admin')
            ORDER BY \`rank\` DESC, id ASC`
        ),
      ]);
      res.json({
        settings: settingsRows,
        progressionRoles: Array.isArray(progressionRoles) ? progressionRoles : [],
        maps: maps.map((row) => ({
          ...row,
          map_image_url: normalizeMapImageUrl(row.id, row.map_image_url),
          is_active: !!row.is_active,
        })),
      });
    } catch (e) {
      logRouteError(e, req);
      res.status(500).json({ error: e.message });
    }
  }
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
        ['ui.map.default_map_student', 'ui.map.default_map_teacher', 'ui.map.default_map_visit'].includes(key)
      ) {
        const exists = await queryOne('SELECT id FROM maps WHERE id = ? LIMIT 1', [String(value || '').trim()]);
        if (!exists) return res.status(400).json({ error: 'Carte par défaut introuvable' });
      }
      const updated = await setSetting(key, value, { userType: req.auth?.userType, userId: req.auth?.userId });
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
  }
);

router.put(
  '/admin/maps/:id',
  requirePermission('admin.settings.write', { needsElevation: true }),
  async (req, res) => {
    try {
      const map = await getMapById(req.params.id);
      if (!map) return res.status(404).json({ error: 'Carte introuvable' });
      const label = String(req.body?.label ?? map.label).trim();
      const mapImageUrl = normalizeMapImageUrl(map.id, String(req.body?.map_image_url ?? map.map_image_url).trim());
      const sortOrderRaw = parseInt(req.body?.sort_order, 10);
      const sortOrder = Number.isFinite(sortOrderRaw) ? Math.max(0, sortOrderRaw) : map.sort_order;
      const framePaddingRaw = req.body?.frame_padding_px;
      const framePadding = framePaddingRaw === null || framePaddingRaw === ''
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
          [label, mapImageUrl, sortOrder, framePadding, isActive ? 1 : 0, map.id]
        );
      } catch (e) {
        if (!(e && (e.errno === 1054 || e.code === 'ER_BAD_FIELD_ERROR'))) throw e;
        await execute(
          'UPDATE maps SET label = ?, map_image_url = ?, sort_order = ? WHERE id = ?',
          [label, mapImageUrl, sortOrder, map.id]
        );
      }
      const updated = await getMapById(map.id);
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
      res.json({
        ...updated,
        map_image_url: normalizeMapImageUrl(updated.id, updated.map_image_url),
        is_active: !!updated.is_active,
      });
    } catch (e) {
      logRouteError(e, req);
      res.status(500).json({ error: e.message });
    }
  }
);

router.post(
  '/admin/maps/:id/image',
  requirePermission('admin.settings.write', { needsElevation: true }),
  async (req, res) => {
    try {
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
      await logAudit('settings_map_image_update', 'map', map.id, 'Image de plan changée', {
        req,
        payload: { map_id: map.id, map_image_url: nextUrl },
      });
      const updated = await getMapById(map.id);
      res.json({
        ...updated,
        map_image_url: normalizeMapImageUrl(updated.id, updated.map_image_url),
        is_active: !!updated.is_active,
      });
    } catch (e) {
      logRouteError(e, req);
      res.status(500).json({ error: e.message });
    }
  }
);

router.get(
  '/admin/system/logs',
  requirePermission('admin.settings.read', { needsElevation: true }),
  async (req, res) => {
    try {
      const settings = await getSettings('admin');
      if (!settings.flat['ops.allow_remote_logs']) {
        return res.status(403).json({ error: 'Consultation des logs désactivée' });
      }
      const raw = parseInt(req.query.lines, 10);
      const n = Number.isFinite(raw) ? raw : 200;
      const entries = tailLogLines(n);
      res.json({
        ok: true,
        returned: entries.length,
        bufferLines: getBufferedLineCount(),
        bufferMax: getMaxLines(),
        entries,
      });
    } catch (e) {
      logRouteError(e, req);
      res.status(500).json({ error: e.message });
    }
  }
);

router.get(
  '/admin/system/oauth-debug',
  requirePermission('admin.settings.read', { needsElevation: true }),
  async (req, res) => {
    try {
      const frontendOrigin = String(process.env.FRONTEND_ORIGIN || process.env.PASSWORD_RESET_BASE_URL || `${req.protocol}://${req.get('host')}`);
      const redirectUri = String(process.env.GOOGLE_OAUTH_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/auth/google/callback`);
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
    } catch (e) {
      logRouteError(e, req);
      res.status(500).json({ error: e.message });
    }
  }
);

router.post(
  '/admin/system/restart',
  requirePermission('admin.settings.secrets.write', { needsElevation: true }),
  async (req, res) => {
    try {
      const settings = await getSettings('admin');
      if (!settings.flat['ops.allow_remote_restart']) {
        return res.status(403).json({ error: 'Redémarrage distant désactivé' });
      }
      await logAudit('settings_system_restart', 'system', 'node-process', 'Redémarrage demandé via GUI admin', { req });
      res.json({ ok: true, message: 'Redémarrage dans 1s' });
      setTimeout(() => process.exit(0), 1000);
    } catch (e) {
      logRouteError(e, req);
      res.status(500).json({ error: e.message });
    }
  }
);

module.exports = router;
