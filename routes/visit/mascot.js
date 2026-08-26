'use strict';

// O10 — sous-routeur du sous-domaine « mascotte » de routes/visit.js.
// Monté sans préfixe via router.use(...) côté visit.js : chemins inchangés.
// N'importe AUCUN symbole de visit.js (zéro import circulaire) — uniquement lib/, database, middleware.
const express = require('express');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const crypto = require('node:crypto');
const { queryAll, queryOne, execute } = require('../../database');
const {
  requirePermission,
  authenticate,
  hasPermission,
} = require('../../middleware/requireTeacher');
const { logRouteError } = require('../../lib/routeLog');
const { saveBase64ToDisk, getAbsolutePath, deleteFile } = require('../../lib/uploads');
const {
  getMascotPackValidatorCandidates,
  getMascotPackLibProbe,
} = require('../../lib/mascotPackValidatorResolve');
const { nowIso } = require('../../lib/visitRouteShared');
const {
  verifyVisitMascotPackAssetPreview,
  appendPreviewTokenToAssetUrl,
} = require('../../lib/visitMascotPackAssetPreview');
const {
  visitMascotPackAssetRelativeDir,
  sanitizeMascotPackAssetFilename,
  buildDefaultVisitMascotPackJson,
  listVisitMascotCatalogTemplateIds,
  resolveVisitMascotImportPublishState,
  serializeVisitMascotPackRow,
  classifyMascotPackModuleError,
  mapVisitMascotPackSqlError,
  visitMascotSpriteLibraryRelativeDir,
  visitMascotSpriteLibraryAssetUrl,
  mascotPackAllowedFramesPrefixes,
  mapVisitMascotSpriteLibSqlError,
  buildVisitCatalogPackTemplate,
  visitMascotCatalogModelInfo,
  listVisitMascotCatalogModels,
} = require('../../lib/visitMascotPackHelpers');
const {
  parseMascotPackZipBuffer,
  buildMascotPackZipBuffer,
  buildVisitExportArchive,
  buildCatalogExportArchive,
  analyzeVisitArchive,
  rewriteVisitPackForServerImport,
  slugifyArchiveFilename,
} = require('../../lib/mascotPackArchive');
const {
  contentLibraryUploadMiddleware,
  readAnalyzeUploadPayload,
} = require('../../lib/contentLibraryUpload');
const {
  resolveVisitMascotSpriteLibraryRelPath,
} = require('../../lib/visitMascotSpriteLibraryFiles');
const {
  listVisitMascotRegistry,
  listStaticVisitMascotEntries,
  isVisitMascotOffered,
} = require('../../lib/visitMascotRegistry');
const {
  catalogEntryToPack,
  recordBuiltinMascotDeletion,
} = require('../../lib/visitMascotBuiltinSeed');
const { isValidVisitMascotId } = require('../../lib/settings');

const router = express.Router();

/** Fichiers PNG listables pour un pack (tri alpha), sans exposer de chemins absolus. */
function listVisitMascotPackAssetFilenames(packId) {
  const relDir = visitMascotPackAssetRelativeDir(packId);
  if (!relDir) return [];
  const absDir = getAbsolutePath(relDir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) return [];
  const names = fs.readdirSync(absDir);
  const out = [];
  for (const raw of names) {
    const safe = sanitizeMascotPackAssetFilename(raw);
    if (!safe || safe !== raw) continue;
    if (!/\.png$/i.test(safe)) continue;
    const fp = path.join(absDir, safe);
    try {
      if (fs.statSync(fp).isFile()) out.push(safe);
    } catch (_) {
      /* ignore */
    }
  }
  out.sort((a, b) => a.localeCompare(b, 'en'));
  return out;
}

/**
 * Valide un pack via ESM : `src/utils` en dev, sinon **`lib/visit-pack/`** (copie synchronisée au build,
 * présente sur les déploiements sans dossier `src/`).
 */
async function validateMascotPackForDb(raw, opts = {}) {
  const candidates = getMascotPackValidatorCandidates();
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return {
      ok: false,
      moduleError: new Error(
        'mascotPack validator introuvable: aucun candidat importable (src/utils ou lib/visit-pack miroir incomplet)',
      ),
    };
  }
  let lastErr;
  for (const abs of candidates) {
    try {
      const { validateMascotPackV1 } = await import(pathToFileURL(abs));
      return validateMascotPackV1(raw, opts);
    } catch (moduleErr) {
      lastErr = moduleErr;
    }
  }
  return {
    ok: false,
    moduleError:
      lastErr ||
      new Error(
        'mascotPack introuvable (exécuter `npm run build` ou `node scripts/sync-visit-pack-server-lib.js`)',
      ),
  };
}

function buildMascotPackModuleUnavailableBody(moduleErr) {
  const { reason, hint } = classifyMascotPackModuleError(moduleErr);
  const probe = getMascotPackLibProbe();
  return {
    error: `Validation des packs mascotte indisponible sur ce serveur. ${hint}`,
    code: 'mascot_pack_module_unavailable',
    details: {
      reason,
      message: String(moduleErr?.message || moduleErr || '').slice(0, 400),
      libMirrorOk: !!probe.libMirrorOk,
      candidatesCount: Number(probe.candidatesCount) || 0,
    },
  };
}

async function resolveVisitMascotPackCreatedBy(auth) {
  if (!auth || auth.userId == null) return null;
  const id = String(auth.userId).trim();
  if (!id) return null;
  const row = await queryOne('SELECT id FROM users WHERE id = ? LIMIT 1', [id]);
  return row ? id : null;
}

function jsonVisitMascotPackError(res, req, status, body) {
  return res.status(status).json({
    ...body,
    requestId: req.requestId || null,
  });
}

async function removeVisitMascotPackUploadDir(packId) {
  const rel = visitMascotPackAssetRelativeDir(packId);
  if (!rel) return;
  try {
    const abs = getAbsolutePath(rel);
    await fs.promises.rm(abs, { recursive: true, force: true });
  } catch (_) {
    /* dossier absent ou déjà supprimé */
  }
}

/**
 * Sert un PNG de la bibliothèque si une ligne existe pour ce nom de fichier.
 * Partagé par l'URL canonique et par l'URL historique par carte.
 */
async function serveVisitMascotSpriteLibraryFile(req, res, rawFilename) {
  try {
    const filename = sanitizeMascotPackAssetFilename(rawFilename);
    if (!filename) return res.status(400).json({ error: 'Paramètres invalides' });
    const row = await queryOne(
      'SELECT id FROM visit_mascot_sprite_library WHERE filename = ? LIMIT 1',
      [filename],
    );
    if (!row) return res.status(404).json({ error: 'Fichier introuvable' });
    const rel = resolveVisitMascotSpriteLibraryRelPath(filename);
    if (!rel) return res.status(404).json({ error: 'Fichier introuvable' });
    return res.type('image/png').sendFile(getAbsolutePath(rel), (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Fichier introuvable' });
    });
  } catch (err) {
    logRouteError(err, req);
    const mapped = mapVisitMascotSpriteLibSqlError(err);
    if (mapped) return jsonVisitMascotPackError(res, req, mapped.status, mapped.body);
    return res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
  }
}

function listPublicMascotStaticAssets() {
  const root = path.join(__dirname, '..', '..', 'public', 'assets', 'mascots');
  if (!fs.existsSync(root)) return [];
  /** @type {string[]} */
  const out = [];
  /** @param {string} dir */
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const lower = String(entry.name || '').toLowerCase();
      if (!/\.(png|jpg|jpeg|webp|gif|svg|riv)$/i.test(lower)) continue;
      const rel = path
        .relative(path.join(__dirname, '..', '..', 'public'), abs)
        .replace(/\\/g, '/');
      if (!rel || rel.startsWith('..')) continue;
      out.push(`/${rel.replace(/^\/+/, '')}`);
    }
  };
  walk(root);
  out.sort((a, b) => a.localeCompare(b, 'en'));
  return out;
}

const PUBLIC_MASCOT_ASSET_URL_PREFIX = '/assets/mascots/';
const PUBLIC_MASCOT_ASSET_EXT = /\.(png|jpg|jpeg|webp|gif|svg|riv)$/i;

/**
 * Valide une URL catalogue statique et retourne le chemin relatif sous `public/`.
 * @param {string} url
 * @returns {string | null}
 */
function resolvePublicMascotAssetRelativePath(url) {
  const raw = String(url || '').trim();
  if (!raw.startsWith(PUBLIC_MASCOT_ASSET_URL_PREFIX)) return null;
  const withoutQuery = raw.split('?')[0].split('#')[0];
  if (!PUBLIC_MASCOT_ASSET_EXT.test(withoutQuery)) return null;
  const relFromPublic = withoutQuery.replace(/^\/+/, '');
  const publicRoot = path.join(__dirname, '..', '..', 'public');
  const abs = path.resolve(publicRoot, relFromPublic);
  const mascotsRoot = path.resolve(publicRoot, 'assets', 'mascots');
  if (!abs.startsWith(mascotsRoot + path.sep) && abs !== mascotsRoot) return null;
  return relFromPublic.replace(/\\/g, '/');
}

async function copyVisitMascotPackAssetDirectory(fromPackId, toPackId) {
  const fromRel = visitMascotPackAssetRelativeDir(fromPackId);
  const toRel = visitMascotPackAssetRelativeDir(toPackId);
  if (!fromRel || !toRel) return;
  const fromAbs = getAbsolutePath(fromRel);
  const toAbs = getAbsolutePath(toRel);
  if (!fs.existsSync(fromAbs)) return;
  await fs.promises.mkdir(toAbs, { recursive: true });
  const names = listVisitMascotPackAssetFilenames(fromPackId);
  for (const name of names) {
    await fs.promises.copyFile(path.join(fromAbs, name), path.join(toAbs, name));
  }
}

function readVisitArchiveBufferFromRequest(req) {
  if (req.files?.archive?.[0]?.buffer) {
    return Buffer.from(req.files.archive[0].buffer);
  }
  const archive = req.body?.archive;
  if (archive && typeof archive === 'object') {
    const b64 = String(archive.fileDataBase64 || archive.dataBase64 || '').trim();
    if (b64) {
      try {
        return Buffer.from(b64, 'base64');
      } catch (_) {
        return null;
      }
    }
  }
  return null;
}

async function writeVisitArchiveAssetsFromMap(packUuid, assetsMap) {
  await removeVisitMascotPackUploadDir(packUuid);
  const relDir = visitMascotPackAssetRelativeDir(packUuid);
  if (!relDir) return;
  const absDir = getAbsolutePath(relDir);
  await fs.promises.mkdir(absDir, { recursive: true });
  for (const [zipPath, buffer] of assetsMap.entries()) {
    const filename = sanitizeMascotPackAssetFilename(path.basename(zipPath));
    if (!filename || !Buffer.isBuffer(buffer)) continue;
    await fs.promises.writeFile(path.join(absDir, filename), buffer);
  }
}

function canReadVisitMascotPackAsset(req, packId, filename, published) {
  if (published) return true;
  const previewToken = String(req.query.preview_token || '').trim();
  if (previewToken && verifyVisitMascotPackAssetPreview(previewToken, packId, filename)) {
    return true;
  }
  return !!(req.auth && hasPermission(req.auth, 'visit.manage', true));
}

router.get('/mascot-packs/:packId/assets/:filename', authenticate, async (req, res) => {
  try {
    const packId = String(req.params.packId || '').trim();
    const filename = sanitizeMascotPackAssetFilename(req.params.filename);
    if (!/^[0-9a-f-]{36}$/i.test(packId) || !filename) {
      return res.status(400).json({ error: 'Paramètres invalides' });
    }
    const row = await queryOne(
      'SELECT id, is_published FROM visit_mascot_packs WHERE id = ? LIMIT 1',
      [packId],
    );
    if (!row) return res.status(404).json({ error: 'Pack introuvable' });
    const published = !!Number(row.is_published);
    if (!canReadVisitMascotPackAsset(req, packId, filename, published)) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const rel = `${visitMascotPackAssetRelativeDir(packId)}/${filename}`;
    const abs = getAbsolutePath(rel);
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Fichier introuvable' });
    return res.type('image/png').sendFile(abs, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Fichier introuvable' });
    });
  } catch (err) {
    logRouteError(err, req);
    const mapped = mapVisitMascotPackSqlError(err);
    if (mapped) return jsonVisitMascotPackError(res, req, mapped.status, mapped.body);
    return res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
  }
});

/**
 * Registre public des mascottes de visite : catalogue livré + packs publiés
 * (toutes cartes confondues). Sert le panneau de réglages admin, le sélecteur de
 * profil et le catalogue du plan — une seule liste, deux origines traitées à égalité.
 * Public (aucun jeton) : les assets des packs publiés le sont déjà.
 */
router.get('/mascots', async (req, res) => {
  try {
    const mascots = await listVisitMascotRegistry();
    res.json({
      mascots: mascots.map((entry) => ({
        ...entry,
        // Alias de compatibilité : le front construit ses entrées catalogue depuis
        // `catalog_id`/`label`/`pack` (même forme que `mascot_packs` de /api/visit/content).
        catalog_id: entry.id,
      })),
    });
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
  }
});

/**
 * Préférence mascotte de l'utilisateur connecté — route **étroite** : elle n'écrit que
 * `users.visit_mascot_catalog_id`, sans mot de passe actuel (contrairement à
 * `PATCH …/profile`, qui reste le chemin d'édition complet du profil).
 *
 * Elle rend le choix **portable d'un appareil à l'autre** : un compte connecté n'utilise
 * plus le stockage local du navigateur (partagé sur une tablette de classe), sa mascotte
 * vit dans son compte. Corps `{ visit_mascot_catalog_id }` ; vide ou `null` efface la
 * préférence (retour à la mascotte par défaut de l'application).
 */
router.put('/mascot-preference', authenticate, async (req, res) => {
  try {
    const auth = req.auth;
    if (!auth || !auth.userId) {
      return res.status(401).json({ error: 'Authentification requise' });
    }
    const raw = req.body?.visit_mascot_catalog_id;
    const value = raw == null ? '' : String(raw).trim();
    if (value) {
      if (!isValidVisitMascotId(value)) {
        return res.status(400).json({ error: 'Mascotte indisponible pour la visite' });
      }
      // La question est posée **au registre**, la même source que le sélecteur : une mascotte
      // visible est donc toujours choisissable, et une mascotte retirée de la visite l'est
      // vraiment. L'ancien contrôle interrogeait `ui.visit.mascot.allowed_ids`, qui pouvait
      // diverger du sélecteur — d'où des refus incompréhensibles.
      if (!(await isVisitMascotOffered(value))) {
        return res.status(400).json({ error: 'Mascotte indisponible pour la visite' });
      }
    }
    const stored = value || null;
    await execute('UPDATE users SET visit_mascot_catalog_id = ? WHERE id = ?', [
      stored,
      String(auth.userId),
    ]);
    res.json({ ok: true, visit_mascot_catalog_id: stored });
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
  }
});

/**
 * Liste **complète** des packs mascotte (brouillons compris) — une seule liste, sans
 * notion de carte : un pack est un objet global de la visite (cf. migration
 * `176_visit_mascot_packs_drop_map.sql`). Un éventuel `?map_id=` est ignoré.
 */
router.get('/mascot-packs', requirePermission('visit.manage'), async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT id, catalog_id, label, pack_json, is_published, origin, created_at, updated_at, created_by
       FROM visit_mascot_packs
       ORDER BY origin = 'builtin' ASC, updated_at DESC, id ASC`,
    );
    res.json({
      packs: rows.map(serializeVisitMascotPackRow),
      allowed_catalog_ids: listVisitMascotCatalogTemplateIds(),
    });
  } catch (err) {
    logRouteError(err, req);
    const mapped = mapVisitMascotPackSqlError(err);
    if (mapped) return jsonVisitMascotPackError(res, req, mapped.status, mapped.body);
    res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
  }
});

router.post('/mascot-packs', requirePermission('visit.manage'), async (req, res) => {
  try {
    const cloneFromPackId = String(req.body.clone_from_pack_id || '').trim();
    const cloneFromCatalogId = String(req.body.clone_from_catalog_id || '').trim();
    const packUuid = crypto.randomUUID();
    const catalogId = `srv-${packUuid}`;
    const prefixesForNew = mascotPackAllowedFramesPrefixes(packUuid);
    let packObj = req.body.pack;
    let sourcePackIdForCopy = null;

    if (cloneFromPackId && /^[0-9a-f-]{36}$/i.test(cloneFromPackId)) {
      const src = await queryOne(
        'SELECT id, pack_json FROM visit_mascot_packs WHERE id = ? LIMIT 1',
        [cloneFromPackId],
      );
      if (!src) return res.status(404).json({ error: 'Pack source introuvable' });
      let parsed = {};
      try {
        parsed = JSON.parse(src.pack_json);
      } catch (_) {
        parsed = {};
      }
      const oldApiPrefix = `/api/visit/mascot-packs/${cloneFromPackId}/assets/`;
      const newApiPrefix = `/api/visit/mascot-packs/${packUuid}/assets/`;
      packObj = {
        ...parsed,
        mascotPackVersion: Number(parsed.mascotPackVersion) === 2 ? 2 : 2,
        id: catalogId,
      };
      if (String(parsed.framesBase || '').startsWith(oldApiPrefix)) {
        packObj = { ...packObj, framesBase: newApiPrefix };
        sourcePackIdForCopy = cloneFromPackId;
      }
    } else if (cloneFromCatalogId) {
      const fromCatalog = buildVisitCatalogPackTemplate(cloneFromCatalogId, catalogId);
      if (!fromCatalog) {
        return res.status(400).json({
          error: 'clone_from_catalog_id invalide',
          allowed_catalog_ids: listVisitMascotCatalogTemplateIds(),
          requestId: req.requestId || null,
        });
      }
      packObj = { ...fromCatalog, clonedFromCatalogId: cloneFromCatalogId };
    } else if (packObj == null) {
      packObj = buildDefaultVisitMascotPackJson(catalogId);
    }

    const validated = await validateMascotPackForDb(packObj, {
      allowedFramesBasePrefixes: prefixesForNew,
    });
    if (validated.moduleError) {
      logRouteError(validated.moduleError, req, 'visit_mascot_packs: chargement mascotPack.js');
      return jsonVisitMascotPackError(
        res,
        req,
        503,
        buildMascotPackModuleUnavailableBody(validated.moduleError),
      );
    }
    if (!validated.ok) {
      return res.status(400).json({
        error: 'Pack JSON invalide',
        details: validated.error?.format ? validated.error.format() : String(validated.error),
        requestId: req.requestId || null,
      });
    }
    const label = String(req.body.label || validated.pack.label || 'Pack mascotte')
      .trim()
      .slice(0, 120);
    const isPublished = Number(req.body.is_published) === 1 ? 1 : 0;
    const now = nowIso();
    const createdBy = await resolveVisitMascotPackCreatedBy(req.auth);
    await execute(
      `INSERT INTO visit_mascot_packs (id, catalog_id, label, pack_json, is_published, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        packUuid,
        catalogId,
        label,
        JSON.stringify(validated.pack),
        isPublished,
        now,
        now,
        createdBy,
      ],
    );
    if (sourcePackIdForCopy) {
      await copyVisitMascotPackAssetDirectory(sourcePackIdForCopy, packUuid);
    }
    const row = await queryOne('SELECT * FROM visit_mascot_packs WHERE id = ? LIMIT 1', [packUuid]);
    res.status(201).json(serializeVisitMascotPackRow(row));
  } catch (err) {
    logRouteError(err, req);
    const mapped = mapVisitMascotPackSqlError(err);
    if (mapped) return jsonVisitMascotPackError(res, req, mapped.status, mapped.body);
    res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
  }
});

router.put('/mascot-packs/:id', requirePermission('visit.manage'), async (req, res) => {
  try {
    const packId = String(req.params.id || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(packId)) return res.status(400).json({ error: 'Pack invalide' });
    const exists = await queryOne('SELECT * FROM visit_mascot_packs WHERE id = ? LIMIT 1', [
      packId,
    ]);
    if (!exists) return res.status(404).json({ error: 'Pack introuvable' });
    const label =
      req.body.label !== undefined
        ? String(req.body.label || '')
            .trim()
            .slice(0, 120)
        : exists.label;
    if (!label) return res.status(400).json({ error: 'label requis' });
    const isPublished =
      req.body.is_published !== undefined
        ? Number(req.body.is_published) === 1
          ? 1
          : 0
        : Number(exists.is_published);
    let packJson = exists.pack_json;
    if (req.body.pack !== undefined) {
      const validated = await validateMascotPackForDb(req.body.pack, {
        allowedFramesBasePrefixes: mascotPackAllowedFramesPrefixes(packId),
      });
      if (validated.moduleError) {
        logRouteError(validated.moduleError, req, 'visit_mascot_packs: chargement mascotPack.js');
        return jsonVisitMascotPackError(
          res,
          req,
          503,
          buildMascotPackModuleUnavailableBody(validated.moduleError),
        );
      }
      if (!validated.ok) {
        return res.status(400).json({
          error: 'Pack JSON invalide',
          details: validated.error?.format ? validated.error.format() : String(validated.error),
          requestId: req.requestId || null,
        });
      }
      packJson = JSON.stringify(validated.pack);
    }
    const now = nowIso();
    await execute(
      `UPDATE visit_mascot_packs SET label = ?, pack_json = ?, is_published = ?, updated_at = ? WHERE id = ?`,
      [label, packJson, isPublished, now, packId],
    );
    const row = await queryOne('SELECT * FROM visit_mascot_packs WHERE id = ? LIMIT 1', [packId]);
    res.json(serializeVisitMascotPackRow(row));
  } catch (err) {
    logRouteError(err, req);
    const mapped = mapVisitMascotPackSqlError(err);
    if (mapped) return jsonVisitMascotPackError(res, req, mapped.status, mapped.body);
    res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
  }
});

router.get('/mascot-packs/:id/export.zip', requirePermission('visit.manage'), async (req, res) => {
  try {
    const packId = String(req.params.id || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(packId)) return res.status(400).json({ error: 'Pack invalide' });
    const row = await queryOne('SELECT * FROM visit_mascot_packs WHERE id = ? LIMIT 1', [packId]);
    if (!row) return res.status(404).json({ error: 'Pack introuvable' });
    let packJson = {};
    try {
      packJson = row.pack_json ? JSON.parse(row.pack_json) : {};
    } catch (_) {
      packJson = {};
    }
    const unified = ['1', 'true', 'states', 'unified'].includes(
      String(req.query.unified || '')
        .trim()
        .toLowerCase(),
    );
    const built = buildVisitExportArchive({
      packRow: row,
      packJson,
      unified,
    });
    const zipBuffer = buildMascotPackZipBuffer({
      manifest: built.manifest,
      pack: built.pack,
      assetFiles: built.assetFiles,
    });
    const filename = `mascot-pack-${slugifyArchiveFilename(row.label)}-${packId.slice(0, 8)}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(zipBuffer);
  } catch (err) {
    logRouteError(err, req);
    if (Number.isFinite(err?.status)) {
      return jsonVisitMascotPackError(res, req, err.status, { error: err.message });
    }
    const mapped = mapVisitMascotPackSqlError(err);
    if (mapped) return jsonVisitMascotPackError(res, req, mapped.status, mapped.body);
    return res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
  }
});

/**
 * Fiches des **modèles catalogue** proposés au studio comme point de départ.
 *
 * `has_real_animation` distingue les mascottes qui portent de vraies trames de celles qui
 * retombent sur un modèle à image fixe — douze des seize font pointer leurs vingt et un états
 * sur la même image. Sans cette information, le studio les propose toutes à égalité et « partir
 * de ce modèle » promet une animation qui n'existe pas ; la déception n'arrive qu'à l'aperçu.
 *
 * `can_manage_visibility` a disparu de la réponse avec le réglage qu'il gardait
 * (`ui.visit.mascot.allowed_ids`) : proposer une mascotte aux visiteurs, c'est la publier, et
 * publier relève de `visit.manage` comme le reste du studio. Plus deux permissions pour un geste.
 */
router.get('/mascot-catalog/models', requirePermission('visit.manage'), async (req, res) => {
  try {
    return res.json({
      models: listVisitMascotCatalogModels().map((m) => ({
        catalog_id: m.id,
        label: m.label,
        fallback_silhouette: m.fallbackSilhouette,
        frame_count: m.frameCount,
        has_real_animation: m.hasRealAnimation,
      })),
    });
  } catch (err) {
    logRouteError(err, req);
    return res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
  }
});

/**
 * Archive ZIP d'un modèle catalogue, **sans passer par un pack serveur**.
 *
 * Jusqu'ici, exporter une mascotte livrée demandait de la cloner d'abord : on créait un pack pour
 * le jeter aussitôt. Le modèle se suffit à lui-même — ses trames sont sous `public/assets/`.
 */
router.get(
  '/mascot-catalog/:catalogId/export.zip',
  requirePermission('visit.manage'),
  async (req, res) => {
    try {
      const catalogId = String(req.params.catalogId || '').trim();
      const modelInfo = visitMascotCatalogModelInfo(catalogId);
      if (!modelInfo) {
        return res.status(404).json({
          error: 'Modèle catalogue inconnu',
          allowed_catalog_ids: listVisitMascotCatalogTemplateIds(),
          requestId: req.requestId || null,
        });
      }
      const pack = buildVisitCatalogPackTemplate(catalogId, catalogId);
      const built = buildCatalogExportArchive({ catalogId, pack, modelInfo });
      const zipBuffer = buildMascotPackZipBuffer({
        manifest: built.manifest,
        pack: built.pack,
        assetFiles: built.assetFiles,
      });
      const filename = `mascot-pack-${slugifyArchiveFilename(modelInfo.label)}.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(zipBuffer);
    } catch (err) {
      logRouteError(err, req);
      if (Number.isFinite(err?.status)) {
        return res
          .status(err.status)
          .json({ error: err.message, requestId: req.requestId || null });
      }
      return res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
    }
  },
);

router.post(
  '/mascot-packs/import/analyze',
  requirePermission('visit.manage'),
  contentLibraryUploadMiddleware,
  async (req, res) => {
    try {
      let buffer = readVisitArchiveBufferFromRequest(req);
      if (!buffer) {
        const payload = readAnalyzeUploadPayload(req);
        if (payload.archive?.buffer) buffer = payload.archive.buffer;
      }
      if (!buffer)
        return res.status(400).json({ error: 'Archive ZIP requise (archive ou fileDataBase64)' });
      const parsed = parseMascotPackZipBuffer(buffer);
      if (parsed.manifest.variant !== 'visit') {
        return res.status(400).json({ error: 'Archive GL — importez depuis le studio GL' });
      }
      const validated = await validateMascotPackForDb(parsed.pack, {
        relaxAssetPrefix: true,
        // Import souple : les comportements personnalisés non déclarés à la source sont créés.
        autoDeclareCustomStates: true,
      });
      if (validated.moduleError) {
        return jsonVisitMascotPackError(
          res,
          req,
          503,
          buildMascotPackModuleUnavailableBody(validated.moduleError),
        );
      }
      const analysis = analyzeVisitArchive(parsed);
      if (!validated.ok) {
        return res.json({
          ...analysis,
          ok: false,
          validationError: validated.error?.format
            ? validated.error.format()
            : String(validated.error || 'Pack invalide'),
        });
      }
      const autoDeclared = Array.isArray(validated.autoDeclaredStates)
        ? validated.autoDeclaredStates
        : [];
      if (autoDeclared.length) {
        analysis.autoDeclaredStates = autoDeclared;
        analysis.warnings = [
          ...analysis.warnings,
          `${autoDeclared.length} comportement(s) personnalisé(s) seront créés à l'import : ${autoDeclared
            .map((s) => s.key)
            .join(', ')}.`,
        ];
      }
      return res.json(analysis);
    } catch (err) {
      logRouteError(err, req);
      if (Number.isFinite(err?.status)) {
        return jsonVisitMascotPackError(res, req, err.status, { error: err.message });
      }
      return res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
    }
  },
);

router.post(
  '/mascot-packs/import',
  requirePermission('visit.manage'),
  contentLibraryUploadMiddleware,
  async (req, res) => {
    try {
      const mode = String(req.body?.mode || 'create').trim();
      const targetPackId = String(req.body?.target_pack_id || '').trim();
      if (mode !== 'create' && mode !== 'replace') {
        return res.status(400).json({ error: 'mode invalide (create ou replace)' });
      }
      let buffer = readVisitArchiveBufferFromRequest(req);
      if (!buffer) {
        const payload = readAnalyzeUploadPayload(req);
        if (payload.archive?.buffer) buffer = payload.archive.buffer;
      }
      if (!buffer) return res.status(400).json({ error: 'Archive ZIP requise' });

      const parsed = parseMascotPackZipBuffer(buffer);
      if (parsed.manifest.variant !== 'visit') {
        return res.status(400).json({ error: 'Archive GL — importez depuis le studio GL' });
      }

      let packUuid;
      let catalogId;
      let existingRow = null;
      if (mode === 'replace') {
        if (!/^[0-9a-f-]{36}$/i.test(targetPackId)) {
          return res.status(400).json({ error: 'target_pack_id requis en mode replace' });
        }
        existingRow = await queryOne('SELECT * FROM visit_mascot_packs WHERE id = ? LIMIT 1', [
          targetPackId,
        ]);
        if (!existingRow) return res.status(404).json({ error: 'Pack cible introuvable' });
        packUuid = targetPackId;
        catalogId = existingRow.catalog_id;
      } else {
        packUuid = crypto.randomUUID();
        catalogId = `srv-${packUuid}`;
      }

      const serverPack = rewriteVisitPackForServerImport(parsed.pack, packUuid);
      serverPack.id = catalogId;
      const validated = await validateMascotPackForDb(serverPack, {
        allowedFramesBasePrefixes: mascotPackAllowedFramesPrefixes(packUuid),
        // Import souple : crée les comportements personnalisés implicites (états non déclarés).
        autoDeclareCustomStates: true,
      });
      if (validated.moduleError) {
        return jsonVisitMascotPackError(
          res,
          req,
          503,
          buildMascotPackModuleUnavailableBody(validated.moduleError),
        );
      }
      if (!validated.ok) {
        return res.status(400).json({
          error: 'Pack JSON invalide',
          details: validated.error?.format ? validated.error.format() : String(validated.error),
          requestId: req.requestId || null,
        });
      }

      const label = String(
        req.body?.label || parsed.pack?.label || parsed.manifest?.source?.label || 'Pack importé',
      )
        .trim()
        .slice(0, 120);
      // Import publié par défaut (create) → le pack est immédiatement visible en visite ;
      // replace conserve l'état du pack cible. Override : `is_published` du corps de requête.
      const isPublished = resolveVisitMascotImportPublishState({
        mode,
        existingPublished: existingRow ? Number(existingRow.is_published) : null,
        requested: req.body?.is_published,
      });
      const now = nowIso();
      const createdBy = await resolveVisitMascotPackCreatedBy(req.auth);

      await writeVisitArchiveAssetsFromMap(packUuid, parsed.assets);

      if (mode === 'replace') {
        await execute(
          `UPDATE visit_mascot_packs SET label = ?, pack_json = ?, updated_at = ? WHERE id = ?`,
          [label, JSON.stringify(validated.pack), now, packUuid],
        );
      } else {
        await execute(
          `INSERT INTO visit_mascot_packs (id, catalog_id, label, pack_json, is_published, created_at, updated_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            packUuid,
            catalogId,
            label,
            JSON.stringify(validated.pack),
            isPublished,
            now,
            now,
            createdBy,
          ],
        );
      }

      const row = await queryOne('SELECT * FROM visit_mascot_packs WHERE id = ? LIMIT 1', [
        packUuid,
      ]);
      const autoDeclared = Array.isArray(validated.autoDeclaredStates)
        ? validated.autoDeclaredStates
        : [];
      const warnings = [...analyzeVisitArchive(parsed).warnings];
      if (autoDeclared.length) {
        warnings.push(
          `${autoDeclared.length} comportement(s) personnalisé(s) créé(s) à l'import : ${autoDeclared
            .map((s) => s.key)
            .join(', ')}.`,
        );
      }
      return res.status(mode === 'replace' ? 200 : 201).json({
        ...serializeVisitMascotPackRow(row),
        warnings,
        autoDeclaredStates: autoDeclared,
      });
    } catch (err) {
      logRouteError(err, req);
      if (Number.isFinite(err?.status)) {
        return jsonVisitMascotPackError(res, req, err.status, { error: err.message });
      }
      const mapped = mapVisitMascotPackSqlError(err);
      if (mapped) return jsonVisitMascotPackError(res, req, mapped.status, mapped.body);
      return res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
    }
  },
);

/**
 * Suppression d'un pack — **y compris une mascotte livrée**.
 *
 * Elle était refusée sur `origin = 'builtin'`, pour une raison réelle : le semis réinsère toute
 * mascotte livrée absente de la table, donc la suppression se serait annulée toute seule au
 * prochain `npm run db:migrate`. Un bouton qui rend la main puis défait son effet des semaines
 * plus tard est pire qu'un bouton absent.
 *
 * Ce n'était pourtant pas une fatalité, seulement une mémoire qui manquait : la suppression est
 * désormais **enregistrée** (`visit_mascot_pack_deletions`), et le semis la respecte. Le studio
 * n'a donc plus qu'une seule liste, dont toutes les lignes se suppriment de la même façon.
 *
 * Ce que la suppression coûte, elle le coûte pour de bon : les images téléversées partent avec.
 * `npm run visit:mascots:restore` rend les mascottes livrées effacées — leur apparence d'origine,
 * pas les modifications qu'on leur avait apportées.
 */
router.delete('/mascot-packs/:id', requirePermission('visit.manage'), async (req, res) => {
  try {
    const packId = String(req.params.id || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(packId)) return res.status(400).json({ error: 'Pack invalide' });
    const row = await queryOne(
      'SELECT id, origin, catalog_id FROM visit_mascot_packs WHERE id = ? LIMIT 1',
      [packId],
    );
    if (!row) return res.status(404).json({ error: 'Pack introuvable' });
    const estLivree = String(row.origin || 'custom') === 'builtin';
    // La pierre tombale **avant** la suppression : si elle échoue (table absente sur une base en
    // retard de migration), on refuse plutôt que de supprimer une ligne que le semis ferait
    // revenir. Mieux vaut ne rien faire et le dire que réussir à moitié.
    if (estLivree) {
      // `deleted_by` est une **clé étrangère vers `users`** : le même piège que `created_by` sur
      // le semis. Le résolveur rend `null` plutôt qu'un identifiant qui n'existe plus en base.
      const supprimePar = await resolveVisitMascotPackCreatedBy(req.auth);
      try {
        await recordBuiltinMascotDeletion(String(row.catalog_id || '').trim(), supprimePar);
      } catch (err) {
        if (err?.errno === 1146) {
          return res.status(503).json({
            error:
              'Le schéma de la base est en retard : la table qui retient les suppressions de mascottes livrées manque. Lancez « npm run db:migrate » puis redémarrez avant de réessayer.',
            code: 'visit_mascot_pack_deletions_missing',
            requestId: req.requestId || null,
          });
        }
        throw err;
      }
    }
    await removeVisitMascotPackUploadDir(packId);
    await execute('DELETE FROM visit_mascot_packs WHERE id = ?', [packId]);
    res.json({ ok: true, origin: estLivree ? 'builtin' : 'custom' });
  } catch (err) {
    logRouteError(err, req);
    const mapped = mapVisitMascotPackSqlError(err);
    if (mapped) return jsonVisitMascotPackError(res, req, mapped.status, mapped.body);
    res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
  }
});

/**
 * **Réinitialiser une mascotte livrée depuis son origine.**
 *
 * C'est le geste qui rend l'édition des mascottes livrées sans risque : on peut tout casser et
 * revenir en arrière. Le catalogue en code reste la **graine** — il n'est plus servi à l'écran
 * (la ligne en base l'emporte depuis l'étape 2), mais il reste la référence à laquelle revenir.
 *
 * On **met à jour** la ligne plutôt que de la supprimer pour la re-semer : l'identifiant du pack
 * ne change pas, les images téléversées dessus survivent, et un `is_published` à 0 (mascotte
 * masquée) n'est pas réactivé dans le dos de l'administrateur. Réinitialiser rend l'apparence
 * d'origine, pas la visibilité d'origine — ce sont deux décisions distinctes.
 */
router.post('/mascot-packs/:id/reset', requirePermission('visit.manage'), async (req, res) => {
  try {
    const packId = String(req.params.id || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(packId)) return res.status(400).json({ error: 'Pack invalide' });
    const row = await queryOne('SELECT * FROM visit_mascot_packs WHERE id = ? LIMIT 1', [packId]);
    if (!row) return res.status(404).json({ error: 'Pack introuvable' });
    if (String(row.origin || 'custom') !== 'builtin') {
      return res.status(409).json({
        error:
          'Cette mascotte n’a pas d’origine à laquelle revenir : elle a été créée ou importée ici.',
        code: 'visit_mascot_pack_not_builtin',
        requestId: req.requestId || null,
      });
    }

    const catalogId = String(row.catalog_id || '').trim();
    const entries = await listStaticVisitMascotEntries();
    const entry = entries.find((e) => String(e?.id || '').trim() === catalogId);
    const pack = entry ? catalogEntryToPack(entry) : null;
    if (!pack) {
      // Le cas où la graine a disparu : mascotte retirée du catalogue par une mise à jour. On
      // ne touche à rien — la ligne en base est alors la **seule** copie qui reste.
      return res.status(409).json({
        error:
          'Aucune version d’origine disponible pour cette mascotte : elle ne figure plus dans le catalogue livré. La version enregistrée ici est désormais la seule.',
        code: 'visit_mascot_pack_origin_gone',
        requestId: req.requestId || null,
      });
    }

    const now = nowIso();
    await execute(
      'UPDATE visit_mascot_packs SET label = ?, pack_json = ?, updated_at = ? WHERE id = ?',
      [String(pack.label || catalogId), JSON.stringify(pack), now, packId],
    );
    const fresh = await queryOne('SELECT * FROM visit_mascot_packs WHERE id = ? LIMIT 1', [packId]);
    return res.json(serializeVisitMascotPackRow(fresh));
  } catch (err) {
    logRouteError(err, req);
    const mapped = mapVisitMascotPackSqlError(err);
    if (mapped) return jsonVisitMascotPackError(res, req, mapped.status, mapped.body);
    return res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
  }
});

router.get('/mascot-packs/:id/assets', requirePermission('visit.manage'), async (req, res) => {
  try {
    const packId = String(req.params.id || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(packId)) return res.status(400).json({ error: 'Pack invalide' });
    const row = await queryOne('SELECT id FROM visit_mascot_packs WHERE id = ? LIMIT 1', [packId]);
    if (!row) return res.status(404).json({ error: 'Pack introuvable' });
    const filenames = listVisitMascotPackAssetFilenames(packId);
    const assets = filenames.map((filename) => {
      const url = `/api/visit/mascot-packs/${packId}/assets/${encodeURIComponent(filename)}`;
      return {
        filename,
        url,
        preview_url: appendPreviewTokenToAssetUrl(url, packId, filename),
      };
    });
    res.json({ pack_id: packId, assets });
  } catch (err) {
    logRouteError(err, req);
    const mapped = mapVisitMascotPackSqlError(err);
    if (mapped) return jsonVisitMascotPackError(res, req, mapped.status, mapped.body);
    res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
  }
});

router.post('/mascot-packs/:id/assets', requirePermission('visit.manage'), async (req, res) => {
  try {
    const packId = String(req.params.id || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(packId)) return res.status(400).json({ error: 'Pack invalide' });
    const row = await queryOne('SELECT id FROM visit_mascot_packs WHERE id = ? LIMIT 1', [packId]);
    if (!row) return res.status(404).json({ error: 'Pack introuvable' });
    const filename = sanitizeMascotPackAssetFilename(req.body.filename);
    const imageDataRaw = req.body.image_data;
    const imageData =
      imageDataRaw !== undefined && imageDataRaw !== null ? String(imageDataRaw).trim() : '';
    if (!filename || !imageData) {
      return res.status(400).json({ error: 'filename et image_data requis' });
    }
    const rel = `${visitMascotPackAssetRelativeDir(packId)}/${filename}`;
    try {
      saveBase64ToDisk(rel, imageData);
    } catch (fileErr) {
      logRouteError(fileErr, req);
      return res.status(400).json({ error: 'Image invalide ou trop volumineuse' });
    }
    const publicUrl = `/api/visit/mascot-packs/${packId}/assets/${encodeURIComponent(filename)}`;
    res.status(201).json({
      ok: true,
      url: publicUrl,
      preview_url: appendPreviewTokenToAssetUrl(publicUrl, packId, filename),
      filename,
    });
  } catch (err) {
    logRouteError(err, req);
    const mapped = mapVisitMascotPackSqlError(err);
    if (mapped) return jsonVisitMascotPackError(res, req, mapped.status, mapped.body);
    res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
  }
});

router.delete(
  '/mascot-packs/:id/assets/:filename',
  requirePermission('visit.manage'),
  async (req, res) => {
    try {
      const packId = String(req.params.id || '').trim();
      const filename = sanitizeMascotPackAssetFilename(req.params.filename);
      if (!/^[0-9a-f-]{36}$/i.test(packId) || !filename) {
        return res.status(400).json({ error: 'Paramètres invalides' });
      }
      const row = await queryOne('SELECT id FROM visit_mascot_packs WHERE id = ? LIMIT 1', [
        packId,
      ]);
      if (!row) return res.status(404).json({ error: 'Pack introuvable' });
      const rel = `${visitMascotPackAssetRelativeDir(packId)}/${filename}`;
      deleteFile(rel);
      res.json({ ok: true });
    } catch (err) {
      logRouteError(err, req);
      const mapped = mapVisitMascotPackSqlError(err);
      if (mapped) return jsonVisitMascotPackError(res, req, mapped.status, mapped.body);
      res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
    }
  },
);

router.patch(
  '/mascot-packs/:id/assets/:filename',
  requirePermission('visit.manage'),
  async (req, res) => {
    try {
      const packId = String(req.params.id || '').trim();
      const filename = sanitizeMascotPackAssetFilename(req.params.filename);
      const newFilename = sanitizeMascotPackAssetFilename(req.body?.new_filename);
      if (!/^[0-9a-f-]{36}$/i.test(packId) || !filename || !newFilename) {
        return res.status(400).json({ error: 'Paramètres invalides' });
      }
      if (filename === newFilename) {
        return res.status(400).json({ error: 'Le nouveau nom est identique à l’actuel' });
      }
      const row = await queryOne('SELECT id FROM visit_mascot_packs WHERE id = ? LIMIT 1', [
        packId,
      ]);
      if (!row) return res.status(404).json({ error: 'Pack introuvable' });
      const relDir = visitMascotPackAssetRelativeDir(packId);
      const relFrom = `${relDir}/${filename}`;
      const relTo = `${relDir}/${newFilename}`;
      const absFrom = getAbsolutePath(relFrom);
      const absTo = getAbsolutePath(relTo);
      if (!fs.existsSync(absFrom)) {
        return res.status(404).json({ error: 'Fichier introuvable' });
      }
      if (fs.existsSync(absTo)) {
        return res.status(409).json({ error: 'Un fichier porte déjà ce nom' });
      }
      await fs.promises.rename(absFrom, absTo);
      const publicUrl = `/api/visit/mascot-packs/${packId}/assets/${encodeURIComponent(newFilename)}`;
      res.json({
        ok: true,
        filename: newFilename,
        url: publicUrl,
        preview_url: appendPreviewTokenToAssetUrl(publicUrl, packId, newFilename),
        previous_filename: filename,
      });
    } catch (err) {
      logRouteError(err, req);
      const mapped = mapVisitMascotPackSqlError(err);
      if (mapped) return jsonVisitMascotPackError(res, req, mapped.status, mapped.body);
      res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
    }
  },
);

/** PNG bibliothèque sprites (public si la ligne existe — utilisé par les packs publiés). */
router.get('/mascot-assets', requirePermission('visit.manage'), async (req, res) => {
  try {
    const publicAssets = listPublicMascotStaticAssets().map((url, idx) => ({
      id: `public:${idx}:${url}`,
      source: 'public',
      filename: String(url).split('/').pop() || '',
      url,
    }));

    const packRows = await queryAll(
      `SELECT id, catalog_id, label
         FROM visit_mascot_packs
         ORDER BY updated_at DESC, id ASC`,
    );
    const packAssets = [];
    for (const row of packRows) {
      const filenames = listVisitMascotPackAssetFilenames(row.id);
      for (const filename of filenames) {
        packAssets.push({
          id: `pack:${row.id}:${filename}`,
          source: 'pack',
          pack_id: row.id,
          pack_catalog_id: row.catalog_id,
          pack_label: row.label,
          filename,
          url: `/api/visit/mascot-packs/${row.id}/assets/${encodeURIComponent(filename)}`,
        });
      }
    }

    const libraryRows = await queryAll(
      `SELECT filename
         FROM visit_mascot_sprite_library
         ORDER BY filename ASC`,
    );
    const libraryAssets = libraryRows.map((row) => ({
      id: `library:${row.filename}`,
      source: 'library',
      filename: row.filename,
      url: visitMascotSpriteLibraryAssetUrl(row.filename),
    }));

    const assets = [...publicAssets, ...packAssets, ...libraryAssets];
    res.json({
      assets,
      counts: {
        total: assets.length,
        public: publicAssets.length,
        pack: packAssets.length,
        library: libraryAssets.length,
      },
    });
  } catch (err) {
    logRouteError(err, req);
    const mapped = mapVisitMascotPackSqlError(err) || mapVisitMascotSpriteLibSqlError(err);
    if (mapped) return jsonVisitMascotPackError(res, req, mapped.status, mapped.body);
    return res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
  }
});

router.delete('/mascot-assets/public', requirePermission('visit.manage'), async (req, res) => {
  try {
    const rel = resolvePublicMascotAssetRelativePath(req.body?.url);
    if (!rel) {
      return res.status(400).json({ error: 'URL invalide pour un asset catalogue statique' });
    }
    const publicRoot = path.join(__dirname, '..', '..', 'public');
    const abs = path.resolve(publicRoot, rel);
    if (!fs.existsSync(abs)) {
      return res.status(404).json({ error: 'Fichier introuvable' });
    }
    await fs.promises.unlink(abs);
    return res.json({ ok: true, url: `/${rel.replace(/^\/+/, '')}` });
  } catch (err) {
    logRouteError(err, req);
    return res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
  }
});

/**
 * PNG de la bibliothèque partagée — **public si la ligne existe** (les packs publiés
 * référencent ces URLs). Aucun contrôle de rôle : seuls les profs peuvent créer une
 * entrée, la protection tient à cela et à la discrétion des URLs.
 */
router.get('/mascot-sprite-library/assets/:filename', async (req, res) => {
  return serveVisitMascotSpriteLibraryFile(req, res, req.params.filename);
});

/**
 * Compatibilité : URL historique par carte
 * (`/api/visit/mascot-sprite-library/<map_id>/assets/<fichier>`) référencée dans le
 * `framesBase` des packs créés avant la migration `176_visit_mascot_packs_drop_map.sql`.
 * Le segment carte est ignoré : seul le nom de fichier compte désormais.
 */
router.get('/mascot-sprite-library/:legacyMapId/assets/:filename', async (req, res) => {
  return serveVisitMascotSpriteLibraryFile(req, res, req.params.filename);
});

router.get('/mascot-sprite-library/assets', requirePermission('visit.manage'), async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT id, filename, created_at
         FROM visit_mascot_sprite_library
         ORDER BY filename ASC`,
    );
    const assets = (rows || []).map((r) => ({
      id: r.id,
      filename: r.filename,
      url: visitMascotSpriteLibraryAssetUrl(r.filename),
      created_at: r.created_at,
    }));
    res.json({ assets });
  } catch (err) {
    logRouteError(err, req);
    const mapped = mapVisitMascotSpriteLibSqlError(err);
    if (mapped) return jsonVisitMascotPackError(res, req, mapped.status, mapped.body);
    res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
  }
});

router.post(
  '/mascot-sprite-library/assets',
  requirePermission('visit.manage'),
  async (req, res) => {
    try {
      const filename = sanitizeMascotPackAssetFilename(req.body.filename);
      const imageDataRaw = req.body.image_data;
      const imageData =
        imageDataRaw !== undefined && imageDataRaw !== null ? String(imageDataRaw).trim() : '';
      if (!filename || !imageData) {
        return res.status(400).json({ error: 'filename et image_data requis' });
      }
      // Réécriture en place d'un fichier historique (sous-dossier carte) plutôt que
      // création d'un doublon à plat : l'URL déjà référencée par les packs reste valide.
      const rel =
        resolveVisitMascotSpriteLibraryRelPath(filename) ||
        `${visitMascotSpriteLibraryRelativeDir()}/${filename}`;
      try {
        saveBase64ToDisk(rel, imageData);
      } catch (fileErr) {
        logRouteError(fileErr, req);
        return res.status(400).json({ error: 'Image invalide ou trop volumineuse' });
      }
      const now = nowIso();
      const createdBy = await resolveVisitMascotPackCreatedBy(req.auth);
      const existing = await queryOne(
        'SELECT id FROM visit_mascot_sprite_library WHERE filename = ? LIMIT 1',
        [filename],
      );
      if (existing) {
        await execute(
          'UPDATE visit_mascot_sprite_library SET created_at = ?, created_by = ? WHERE id = ?',
          [now, createdBy, existing.id],
        );
      } else {
        const rowId = crypto.randomUUID();
        await execute(
          `INSERT INTO visit_mascot_sprite_library (id, filename, created_at, created_by)
           VALUES (?, ?, ?, ?)`,
          [rowId, filename, now, createdBy],
        );
      }
      res.status(201).json({ ok: true, url: visitMascotSpriteLibraryAssetUrl(filename), filename });
    } catch (err) {
      logRouteError(err, req);
      const mapped = mapVisitMascotSpriteLibSqlError(err);
      if (mapped) return jsonVisitMascotPackError(res, req, mapped.status, mapped.body);
      res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
    }
  },
);

router.delete(
  '/mascot-sprite-library/assets/:filename',
  requirePermission('visit.manage'),
  async (req, res) => {
    try {
      const filename = sanitizeMascotPackAssetFilename(req.params.filename);
      if (!filename) return res.status(400).json({ error: 'Paramètres invalides' });
      const row = await queryOne(
        'SELECT id FROM visit_mascot_sprite_library WHERE filename = ? LIMIT 1',
        [filename],
      );
      if (!row) return res.status(404).json({ error: 'Entrée introuvable' });
      const rel = resolveVisitMascotSpriteLibraryRelPath(filename);
      if (rel) deleteFile(rel);
      await execute('DELETE FROM visit_mascot_sprite_library WHERE id = ?', [row.id]);
      res.json({ ok: true });
    } catch (err) {
      logRouteError(err, req);
      const mapped = mapVisitMascotSpriteLibSqlError(err);
      if (mapped) return jsonVisitMascotPackError(res, req, mapped.status, mapped.body);
      res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
    }
  },
);

router.patch(
  '/mascot-sprite-library/assets/:filename',
  requirePermission('visit.manage'),
  async (req, res) => {
    try {
      const filename = sanitizeMascotPackAssetFilename(req.params.filename);
      const newFilename = sanitizeMascotPackAssetFilename(req.body?.new_filename);
      if (!filename || !newFilename) {
        return res.status(400).json({ error: 'Paramètres invalides' });
      }
      if (filename === newFilename) {
        return res.status(400).json({ error: 'Le nouveau nom est identique à l’actuel' });
      }
      const row = await queryOne(
        'SELECT id FROM visit_mascot_sprite_library WHERE filename = ? LIMIT 1',
        [filename],
      );
      if (!row) return res.status(404).json({ error: 'Entrée introuvable' });
      const collision = await queryOne(
        'SELECT id FROM visit_mascot_sprite_library WHERE filename = ? LIMIT 1',
        [newFilename],
      );
      if (collision) {
        return res.status(409).json({ error: 'Un fichier porte déjà ce nom' });
      }
      const relFrom = resolveVisitMascotSpriteLibraryRelPath(filename);
      if (!relFrom) return res.status(404).json({ error: 'Fichier introuvable' });
      // Renommage **dans le dossier d'origine** (à plat, ou sous-dossier historique).
      const relTo = `${relFrom.slice(0, relFrom.lastIndexOf('/'))}/${newFilename}`;
      const absFrom = getAbsolutePath(relFrom);
      const absTo = getAbsolutePath(relTo);
      if (fs.existsSync(absTo)) {
        return res.status(409).json({ error: 'Un fichier porte déjà ce nom' });
      }
      await fs.promises.rename(absFrom, absTo);
      await execute('UPDATE visit_mascot_sprite_library SET filename = ? WHERE id = ?', [
        newFilename,
        row.id,
      ]);
      res.json({
        ok: true,
        filename: newFilename,
        url: visitMascotSpriteLibraryAssetUrl(newFilename),
        previous_filename: filename,
      });
    } catch (err) {
      logRouteError(err, req);
      const mapped = mapVisitMascotSpriteLibSqlError(err);
      if (mapped) return jsonVisitMascotPackError(res, req, mapped.status, mapped.body);
      res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
    }
  },
);

module.exports = router;
