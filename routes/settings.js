const express = require('express');
const bcrypt = require('bcryptjs');
const { queryOne } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const { MFA_ENFORCEMENT_KEY } = require('../lib/auth/mfaPolicy');
const { isTotpKeyConfigured } = require('../lib/auth/totpCrypto');
const { isTotpEnabled } = require('../lib/auth/totpStore');
const { logRouteError, respondInternalError } = require('../lib/routeLog');
const asyncHandler = require('../lib/asyncHandler');
const { z, validate } = require('../lib/validate');
const { logAudit } = require('../lib/auditLog');
const { scopePublicSettings } = require('../lib/publicSettingsScope');
const { resolveSecureProductId } = require('../lib/surfaceAccess');
const { listMapsForAdmin } = require('../lib/terrain/mapService');
const {
  ACCESS_SECRET_HASH_KEYS,
  PLAN_ACCESS_SECRET_KEYS,
  validateAccessSecret,
} = require('../lib/accessSecret');

// `limit` : coercition permissive (repli sur le défaut côté handler si absent/non numérique) — jamais de 400.
const settingsMediaQuerySchema = z.object({ limit: z.coerce.number().optional().catch(undefined) });
// `lines` : coercition tolérante reproduisant `Number.isFinite(parseInt(lines, 10)) ? raw : 200` (0 conservé).
const settingsLogsQuerySchema = z.object({
  lines: z.preprocess((v) => parseInt(v, 10), z.number().finite().catch(200)),
});
const { tailLogLines, getBufferedLineCount, getMaxLines } = require('../lib/logBuffer');
const {
  saveMediaFromDataUrl,
  listMediaLibraryItems,
  executeMediaLibraryDeleteRequest,
} = require('../lib/mediaLibrary');
const {
  getSettings,
  setSetting,
  validateSettingCandidate,
  listAdminSettings,
  invalidateSettingsCache,
} = require('../lib/settings');
const {
  getHelpConfigFromDb,
  saveHelpConfigToDb,
  loadDefaultHelpConfig,
  normalizeHelpConfig,
} = require('../lib/helpContent');
const {
  getHelpNarratorFromDb,
  saveHelpNarratorToDb,
  loadDefaultNarratorConfig,
} = require('../lib/helpNarrator');
const {
  getTourRegistryFromDb,
  saveTourRegistryToDb,
  tourRegistrySchema,
} = require('../lib/tourContent');
const { runSpeciesAutofillProviderSelfTest } = require('../lib/speciesAutofillProviderSelfTest');
const { getRuntimeProcessSnapshot } = require('../lib/runtimeDiagnostics');
const logMetrics = require('../lib/logMetrics');

const router = express.Router();

router.get(
  '/public',
  asyncHandler(async (req, res) => {
    const settings = await getSettings('public');
    const { getSocketIoRealtimePublicConfig } = require('../lib/socketIoTransport');
    // Périmètre par produit (lot K de l'audit sécurité, constat S10) : le front de chaque
    // surface ne reçoit que les sections qu'il lit. `realtime` est ajouté avant le filtrage
    // pour qu'il soit soumis à la même liste que le reste.
    res.json({
      settings: scopePublicSettings(
        { ...settings.nested, realtime: getSocketIoRealtimePublicConfig() },
        // `resolveSecureProductId` et non `resolveProductFromRequest` : la surcharge
        // `X-Foretmap-Product` n'est lue qu'hors production (lot A). Sinon n'importe qui
        // rejouerait la requête sur les quatre produits et reconstituerait les 95 clés.
        resolveSecureProductId(req),
      ),
    });
  }),
);

router.get(
  '/admin',
  requirePermission('admin.settings.read'),
  asyncHandler(async (req, res) => {
    const [settingsRows, maps] = await Promise.all([listAdminSettings(), listMapsForAdmin()]);
    res.json({
      settings: settingsRows,
      maps,
    });
  }),
);

router.get(
  '/admin/help-content',
  requirePermission('admin.settings.read'),
  asyncHandler(async (_req, res) => {
    const config = await getHelpConfigFromDb();
    res.json(config);
  }),
);

router.put(
  '/admin/help-content',
  requirePermission('admin.settings.write'),
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
  requirePermission('admin.settings.write'),
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

// Visites guidées — surcharges de texte `content.tour.registry`.
//
// Sous `tours.manage` et non `admin.settings.write` : réécrire une bulle de parcours
// est un geste éditorial, il n'a pas à ouvrir toute la console de réglages. L'admin
// la détient d'office et peut l'attribuer à un profil prof depuis « Profils RBAC ».
router.get(
  '/admin/tour-content',
  requirePermission('tours.manage'),
  asyncHandler(async (_req, res) => {
    const registry = await getTourRegistryFromDb();
    res.json({ registry });
  }),
);

router.put(
  '/admin/tour-content',
  requirePermission('tours.manage'),
  asyncHandler(async (req, res) => {
    const parsed = tourRegistrySchema.safeParse(req.body?.registry ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Registre de visites guidées invalide' });
    }
    const registry = await saveTourRegistryToDb(parsed.data, {
      userType: req.auth?.userType,
      userId: req.auth?.userId,
    });
    invalidateSettingsCache();
    await logAudit(
      'settings_tour_content_update',
      'setting',
      'content.tour.registry',
      'Textes des visites guidées mis à jour',
      { req },
    );
    res.json({ registry });
  }),
);

router.post(
  '/admin/tour-content/reset',
  requirePermission('tours.manage'),
  asyncHandler(async (req, res) => {
    // Le corpus par défaut vit en code : réinitialiser, c'est effacer la surcharge.
    const registry = await saveTourRegistryToDb(
      {},
      { userType: req.auth?.userType, userId: req.auth?.userId },
    );
    invalidateSettingsCache();
    await logAudit(
      'settings_tour_content_reset',
      'setting',
      'content.tour.registry',
      'Textes des visites guidées réinitialisés',
      { req },
    );
    res.json({ registry });
  }),
);

// Narrateur de l'aide (OLU) — réglage `content.help.narrator`, distinct du corpus
// `content.help.registry` : réinitialiser l'un ne doit pas effacer l'autre (§11.2).
router.get(
  '/admin/help-narrator',
  requirePermission('admin.settings.read'),
  asyncHandler(async (_req, res) => {
    const config = await getHelpNarratorFromDb();
    res.json(config);
  }),
);

router.put(
  '/admin/help-narrator',
  requirePermission('admin.settings.write'),
  asyncHandler(async (req, res) => {
    const normalized = await saveHelpNarratorToDb(req.body, {
      userType: req.auth?.userType,
      userId: req.auth?.userId,
    });
    invalidateSettingsCache();
    await logAudit(
      'settings_help_narrator_update',
      'setting',
      'content.help.narrator',
      'Narrateur aide mis à jour',
      {
        req,
      },
    );
    res.json(normalized);
  }),
);

router.post(
  '/admin/help-narrator/reset',
  requirePermission('admin.settings.write'),
  asyncHandler(async (req, res) => {
    const normalized = await saveHelpNarratorToDb(loadDefaultNarratorConfig(), {
      userType: req.auth?.userType,
      userId: req.auth?.userId,
    });
    invalidateSettingsCache();
    await logAudit(
      'settings_help_narrator_reset',
      'setting',
      'content.help.narrator',
      'Narrateur aide réinitialisé',
      {
        req,
      },
    );
    res.json(normalized);
  }),
);

/**
 * Codes d'accès et mots de passe des trois plans : jamais stockés en clair, seulement leur
 * empreinte bcrypt. Ils passent par une route dédiée plutôt que par `PUT /admin/:key`, qui
 * écrirait la valeur telle quelle — la garde plus bas refuse d'ailleurs explicitement ces clés.
 *
 * Règles d'enregistrement (`lib/accessSecret.js`) : 12 à 64 caractères ; un mot de passe mêle
 * en plus lettres et chiffres. Les secrets déjà enregistrés restent valides jusqu'à leur
 * remplacement : un secret n'est connu du serveur que par son empreinte, sa forme ne peut pas
 * être relue.
 */
const ACCESS_SECRET_ROUTES = Object.freeze([
  { path: 'plan-access-code', surface: 'plan', kind: 'code', label: 'Code d’accès du plan' },
  {
    path: 'staff-plan-access-code',
    surface: 'staff',
    kind: 'code',
    label: 'Code d’accès du plan des personnels',
  },
  {
    path: 'enov-plan-access-code',
    surface: 'enov',
    kind: 'code',
    label: 'Code d’accès du plan e-nov',
  },
  {
    path: 'plan-access-password',
    surface: 'plan',
    kind: 'password',
    label: 'Mot de passe du plan',
  },
  {
    path: 'staff-plan-access-password',
    surface: 'staff',
    kind: 'password',
    label: 'Mot de passe du plan des personnels',
  },
  {
    path: 'enov-plan-access-password',
    surface: 'enov',
    kind: 'password',
    label: 'Mot de passe du plan e-nov',
  },
]);

/** Route dédiée de chaque clé d'empreinte (message de refus de `PUT /admin/:key`). */
const ACCESS_SECRET_ROUTE_BY_KEY = Object.freeze(
  Object.fromEntries(
    ACCESS_SECRET_ROUTES.map((route) => [
      PLAN_ACCESS_SECRET_KEYS[route.surface][route.kind],
      route,
    ]),
  ),
);

function accessSecretHandler({ surface, kind, label }) {
  const key = PLAN_ACCESS_SECRET_KEYS[surface][kind];
  return asyncHandler(async (req, res) => {
    // Corps `{ code }` pour les deux natures : un mot de passe est un secret comme un autre.
    const secret = String(req.body?.code ?? '').trim();
    const invalid = validateAccessSecret(kind, secret);
    if (invalid) return res.status(400).json({ error: invalid });
    const hash = secret ? await bcrypt.hash(secret, 10) : '';
    const updated = await setSetting(key, hash, {
      userType: req.auth?.userType,
      userId: req.auth?.userId,
    });
    await logAudit(
      'settings_update',
      'setting',
      key,
      secret ? `${label} défini` : `${label} effacé`,
      { req, payload: { key, kind, cleared: !secret } },
    );
    res.json({ ok: true, key, kind, hasCode: Boolean(updated) });
  });
}

for (const route of ACCESS_SECRET_ROUTES) {
  router.post(
    `/admin/${route.path}`,
    requirePermission('admin.settings.write'),
    accessSecretHandler(route),
  );
}

router.put(
  '/admin/:key',
  requirePermission('admin.settings.write'),
  asyncHandler(async (req, res) => {
    const key = String(req.params.key || '').trim();
    if (!key) return res.status(400).json({ error: 'Clé de réglage requise' });
    if (ACCESS_SECRET_HASH_KEYS.includes(key)) {
      const route = ACCESS_SECRET_ROUTE_BY_KEY[key];
      const what = route.label.charAt(0).toLowerCase() + route.label.slice(1);
      return res.status(400).json({
        error: `Utilisez POST /api/settings/admin/${route.path} pour définir le ${what}`,
      });
    }
    const value = req.body?.value;
    // Double authentification obligatoire : jamais sans clé de chiffrement (personne ne
    // pourrait s'enrôler), et seulement par un administrateur qui a lui-même activé et validé
    // son second facteur — sinon il s'enfermerait dehors avec tous les autres.
    if (key === MFA_ENFORCEMENT_KEY && String(value ?? '').trim() === 'required') {
      if (!isTotpKeyConfigured()) {
        return res.status(400).json({
          error:
            'Clé de chiffrement TOTP_ENCRYPTION_KEY absente ou invalide : la double authentification ne peut pas être rendue obligatoire.',
          code: 'TOTP_KEY_MISSING',
        });
      }
      if (req.auth?.impersonating || !req.auth?.mfa || !(await isTotpEnabled(req.auth?.userId))) {
        return res.status(403).json({
          error:
            'Activez d’abord votre propre double authentification et reconnectez-vous avec votre code.',
          code: 'MFA_SESSION_REQUIRED',
        });
      }
    }
    // Couleurs du halo e-nov (deux niveaux) : un `#rrggbb` ou rien — une valeur quelconque
    // serait injectée telle quelle dans le style du plan.
    if (
      (key === 'ui.enov_plan.highlight_color' || key === 'ui.enov_plan.secondary_color') &&
      !/^#[0-9a-f]{6}$/i.test(String(value ?? '').trim())
    ) {
      return res.status(400).json({ error: 'Couleur invalide (format #rrggbb)' });
    }
    if (
      [
        'ui.map.default_map_student',
        'ui.map.default_map_teacher',
        'ui.map.default_map_visit',
        'ui.plan.map_id',
      ].includes(key)
    ) {
      const exists = await queryOne('SELECT id FROM maps WHERE id = ? LIMIT 1', [
        String(value || '').trim(),
      ]);
      if (!exists) return res.status(400).json({ error: 'Carte par défaut introuvable' });
    }
    // Validation complète (normalisation + cohérence croisée) AVANT persistance :
    // un 400 ne doit jamais être renvoyé après que la valeur a été enregistrée.
    let normalized;
    try {
      normalized = await validateSettingCandidate(key, value);
    } catch (e) {
      logRouteError(e, req);
      return res.status(400).json({ error: e.message });
    }
    const updated = await setSetting(key, normalized, {
      userType: req.auth?.userType,
      userId: req.auth?.userId,
    });
    await logAudit('settings_update', 'setting', key, 'Réglage mis à jour', {
      req,
      payload: { key, value: updated },
    });
    res.json({ ok: true, key, value: updated });
  }),
);

// CRUD des cartes (création, modification, image de fond, calage GPS) : sorti vers
// `lib/terrain/mapService.js` (étape B4 de l'audit du 25/09/2026, § 3.1), mêmes URL.
router.use('/admin/maps', require('./maps-admin'));

router.get(
  '/admin/media-library',
  requirePermission('admin.settings.read'),
  validate({ query: settingsMediaQuerySchema }),
  asyncHandler(async (req, res) => {
    const limit = req.validatedQuery?.limit;
    const items = listMediaLibraryItems(Number.isFinite(limit) ? limit : 300, { app: 'foretmap' });
    res.json({ items });
  }),
);

router.post(
  '/admin/media-library',
  requirePermission('admin.settings.write'),
  asyncHandler(async (req, res) => {
    const mediaData = String(req.body?.media_data || '').trim();
    if (!mediaData) return res.status(400).json({ error: 'media_data requis' });
    const originalName =
      String(req.body?.original_name || req.body?.originalName || '').trim() || null;
    const saved = await saveMediaFromDataUrl(mediaData, { originalName, app: 'foretmap' });
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
  requirePermission('admin.settings.write'),
  asyncHandler(async (req, res) => {
    const payload = executeMediaLibraryDeleteRequest(req.body || {}, { app: 'foretmap' });
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
  requirePermission('admin.settings.read'),
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
      runtimeProcess: {
        ...getRuntimeProcessSnapshot(),
        realtime: require('../lib/realtime').getRealtimeSnapshot(),
      },
    });
  }),
);

router.get(
  '/admin/system/logs',
  requirePermission('admin.settings.read'),
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
  requirePermission('admin.settings.read'),
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
  requirePermission('admin.settings.read'),
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
  requirePermission('admin.settings.secrets.write'),
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
    // Même sémantique d'arrêt que /api/admin/restart : drain HTTP + Socket.IO + pool MySQL
    // via gracefulShutdown (injecté par server.js) — process.exit brut en dernier recours.
    setTimeout(() => {
      if (restartShutdownHandler) restartShutdownHandler('restart-gui');
      else process.exit(0);
    }, 1000);
  }),
);

// Injection par server.js (le cycle de vie du serveur HTTP reste sa responsabilité,
// comme pour createAdminOpsRouter).
let restartShutdownHandler = null;
router.setRestartShutdownHandler = (fn) => {
  restartShutdownHandler = typeof fn === 'function' ? fn : null;
};

module.exports = router;
// Exportés pour les tests no-DB du contrat de validation O7.
module.exports.settingsMediaQuerySchema = settingsMediaQuerySchema;
module.exports.settingsLogsQuerySchema = settingsLogsQuerySchema;
