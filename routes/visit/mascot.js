'use strict';

// O10 — sous-routeur du sous-domaine « mascotte » de routes/visit.js.
// Monté sans préfixe via router.use(...) côté visit.js : chemins inchangés.
// N'importe AUCUN symbole de visit.js (zéro import circulaire) — uniquement lib/, database, middleware.
const express = require('express');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { v4: uuidv4 } = require('uuid');
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
const { resolveDefaultMapId } = require('../../lib/settings');
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
  mascotPackAllowedFramesPrefixesForMap,
  mapVisitMascotSpriteLibSqlError,
  buildVisitCatalogPackTemplate,
} = require('../../lib/visitMascotPackHelpers');
const {
  parseMascotPackZipBuffer,
  buildMascotPackZipBuffer,
  buildVisitExportArchive,
  analyzeVisitArchive,
  rewriteVisitPackForServerImport,
  slugifyArchiveFilename,
} = require('../../lib/mascotPackArchive');
const {
  contentLibraryUploadMiddleware,
  readAnalyzeUploadPayload,
} = require('../../lib/contentLibraryUpload');

const router = express.Router();

// Helpers partagés courts recopiés depuis visit.js (purs ou I/O triviale mono-requête) —
// laissés AUSSI dans visit.js car ses routes hors-mascotte les utilisent encore.
function nowIso() {
  return new Date().toISOString();
}

async function resolveVisitMapId(rawMapId) {
  const requested = String(rawMapId || '').trim();
  if (requested) return requested;
  return resolveDefaultMapId('visit');
}

async function mapExists(mapId) {
  const row = await queryOne('SELECT id FROM maps WHERE id = ? LIMIT 1', [mapId]);
  return !!row;
}

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

function listVisitMascotSpriteLibraryFilenamesFromDisk(mapId) {
  const relDir = visitMascotSpriteLibraryRelativeDir(mapId);
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

router.get(
  '/mascot-packs',
  requirePermission('visit.manage', { needsElevation: true }),
  async (req, res) => {
    try {
      const mapId = await resolveVisitMapId(req.query.map_id);
      if (!mapId) return res.status(400).json({ error: 'map_id requis' });
      if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });
      const rows = await queryAll(
        `SELECT id, map_id, catalog_id, label, pack_json, is_published, created_at, updated_at, created_by
       FROM visit_mascot_packs
       WHERE map_id = ?
       ORDER BY updated_at DESC, id ASC`,
        [mapId],
      );
      res.json({
        map_id: mapId,
        packs: rows.map(serializeVisitMascotPackRow),
        allowed_catalog_ids: listVisitMascotCatalogTemplateIds(),
      });
    } catch (err) {
      logRouteError(err, req);
      const mapped = mapVisitMascotPackSqlError(err);
      if (mapped) return jsonVisitMascotPackError(res, req, mapped.status, mapped.body);
      res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
    }
  },
);

router.post(
  '/mascot-packs',
  requirePermission('visit.manage', { needsElevation: true }),
  async (req, res) => {
    try {
      const mapId = String(req.body.map_id || '').trim();
      if (!mapId) return res.status(400).json({ error: 'map_id requis' });
      if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });
      const cloneFromPackId = String(req.body.clone_from_pack_id || '').trim();
      const cloneFromCatalogId = String(req.body.clone_from_catalog_id || '').trim();
      const packUuid = uuidv4();
      const catalogId = `srv-${packUuid}`;
      const prefixesForNew = mascotPackAllowedFramesPrefixesForMap(mapId, packUuid);
      let packObj = req.body.pack;
      let sourcePackIdForCopy = null;

      if (cloneFromPackId && /^[0-9a-f-]{36}$/i.test(cloneFromPackId)) {
        const src = await queryOne(
          'SELECT id, pack_json FROM visit_mascot_packs WHERE id = ? AND map_id = ? LIMIT 1',
          [cloneFromPackId, mapId],
        );
        if (!src) return res.status(404).json({ error: 'Pack source introuvable sur cette carte' });
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
        `INSERT INTO visit_mascot_packs (id, map_id, catalog_id, label, pack_json, is_published, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          packUuid,
          mapId,
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
      const row = await queryOne('SELECT * FROM visit_mascot_packs WHERE id = ? LIMIT 1', [
        packUuid,
      ]);
      res.status(201).json(serializeVisitMascotPackRow(row));
    } catch (err) {
      logRouteError(err, req);
      const mapped = mapVisitMascotPackSqlError(err);
      if (mapped) return jsonVisitMascotPackError(res, req, mapped.status, mapped.body);
      res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
    }
  },
);

router.put(
  '/mascot-packs/:id',
  requirePermission('visit.manage', { needsElevation: true }),
  async (req, res) => {
    try {
      const packId = String(req.params.id || '').trim();
      if (!/^[0-9a-f-]{36}$/i.test(packId)) return res.status(400).json({ error: 'Pack invalide' });
      const exists = await queryOne('SELECT * FROM visit_mascot_packs WHERE id = ? LIMIT 1', [
        packId,
      ]);
      if (!exists) return res.status(404).json({ error: 'Pack introuvable' });
      const mapId = String(req.body.map_id || exists.map_id).trim();
      if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });
      if (mapId !== exists.map_id) {
        return res.status(400).json({ error: 'Changer de carte non supporté pour ce pack' });
      }
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
          allowedFramesBasePrefixes: mascotPackAllowedFramesPrefixesForMap(mapId, packId),
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
  },
);

router.get(
  '/mascot-packs/:id/export.zip',
  requirePermission('visit.manage', { needsElevation: true }),
  async (req, res) => {
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
      const built = buildVisitExportArchive({
        packRow: row,
        packJson,
        mapId: row.map_id,
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
  },
);

router.post(
  '/mascot-packs/import/analyze',
  requirePermission('visit.manage', { needsElevation: true }),
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
  requirePermission('visit.manage', { needsElevation: true }),
  contentLibraryUploadMiddleware,
  async (req, res) => {
    try {
      const mapId = String(req.body?.map_id || '').trim();
      const mode = String(req.body?.mode || 'create').trim();
      const targetPackId = String(req.body?.target_pack_id || '').trim();
      if (!mapId) return res.status(400).json({ error: 'map_id requis' });
      if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });
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
        if (String(existingRow.map_id) !== mapId) {
          return res.status(400).json({ error: 'Le pack cible appartient à une autre carte' });
        }
        packUuid = targetPackId;
        catalogId = existingRow.catalog_id;
      } else {
        packUuid = uuidv4();
        catalogId = `srv-${packUuid}`;
      }

      const serverPack = rewriteVisitPackForServerImport(parsed.pack, packUuid);
      serverPack.id = catalogId;
      const validated = await validateMascotPackForDb(serverPack, {
        allowedFramesBasePrefixes: mascotPackAllowedFramesPrefixesForMap(mapId, packUuid),
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
          `INSERT INTO visit_mascot_packs (id, map_id, catalog_id, label, pack_json, is_published, created_at, updated_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            packUuid,
            mapId,
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
      return res.status(mode === 'replace' ? 200 : 201).json({
        ...serializeVisitMascotPackRow(row),
        warnings: analyzeVisitArchive(parsed).warnings,
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

router.delete(
  '/mascot-packs/:id',
  requirePermission('visit.manage', { needsElevation: true }),
  async (req, res) => {
    try {
      const packId = String(req.params.id || '').trim();
      if (!/^[0-9a-f-]{36}$/i.test(packId)) return res.status(400).json({ error: 'Pack invalide' });
      const row = await queryOne('SELECT id FROM visit_mascot_packs WHERE id = ? LIMIT 1', [
        packId,
      ]);
      if (!row) return res.status(404).json({ error: 'Pack introuvable' });
      await removeVisitMascotPackUploadDir(packId);
      await execute('DELETE FROM visit_mascot_packs WHERE id = ?', [packId]);
      res.json({ ok: true });
    } catch (err) {
      logRouteError(err, req);
      const mapped = mapVisitMascotPackSqlError(err);
      if (mapped) return jsonVisitMascotPackError(res, req, mapped.status, mapped.body);
      res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
    }
  },
);

router.get(
  '/mascot-packs/:id/assets',
  requirePermission('visit.manage', { needsElevation: true }),
  async (req, res) => {
    try {
      const packId = String(req.params.id || '').trim();
      if (!/^[0-9a-f-]{36}$/i.test(packId)) return res.status(400).json({ error: 'Pack invalide' });
      const row = await queryOne('SELECT id FROM visit_mascot_packs WHERE id = ? LIMIT 1', [
        packId,
      ]);
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
  },
);

router.post(
  '/mascot-packs/:id/assets',
  requirePermission('visit.manage', { needsElevation: true }),
  async (req, res) => {
    try {
      const packId = String(req.params.id || '').trim();
      if (!/^[0-9a-f-]{36}$/i.test(packId)) return res.status(400).json({ error: 'Pack invalide' });
      const row = await queryOne('SELECT id FROM visit_mascot_packs WHERE id = ? LIMIT 1', [
        packId,
      ]);
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
  },
);

router.delete(
  '/mascot-packs/:id/assets/:filename',
  requirePermission('visit.manage', { needsElevation: true }),
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

/** PNG bibliothèque sprites (public si la ligne existe — utilisé par les packs publiés). */
router.get(
  '/mascot-assets',
  requirePermission('visit.manage', { needsElevation: true }),
  async (req, res) => {
    try {
      const publicAssets = listPublicMascotStaticAssets().map((url, idx) => ({
        id: `public:${idx}:${url}`,
        source: 'public',
        filename: String(url).split('/').pop() || '',
        url,
      }));

      const packRows = await queryAll(
        `SELECT id, map_id, catalog_id, label
         FROM visit_mascot_packs
         ORDER BY map_id ASC, updated_at DESC, id ASC`,
      );
      const packAssets = [];
      for (const row of packRows) {
        const filenames = listVisitMascotPackAssetFilenames(row.id);
        for (const filename of filenames) {
          packAssets.push({
            id: `pack:${row.id}:${filename}`,
            source: 'pack',
            map_id: row.map_id,
            pack_id: row.id,
            pack_catalog_id: row.catalog_id,
            pack_label: row.label,
            filename,
            url: `/api/visit/mascot-packs/${row.id}/assets/${encodeURIComponent(filename)}`,
          });
        }
      }

      const libraryRows = await queryAll(
        `SELECT map_id, filename
         FROM visit_mascot_sprite_library
         ORDER BY map_id ASC, filename ASC`,
      );
      const libraryAssets = libraryRows.map((row) => ({
        id: `library:${row.map_id}:${row.filename}`,
        source: 'library',
        map_id: row.map_id,
        filename: row.filename,
        url: `/api/visit/mascot-sprite-library/${row.map_id}/assets/${encodeURIComponent(row.filename)}`,
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
  },
);

router.delete(
  '/mascot-assets/public',
  requirePermission('visit.manage', { needsElevation: true }),
  async (req, res) => {
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
  },
);

router.get('/mascot-sprite-library/:mapId/assets/:filename', async (req, res) => {
  try {
    const mapId = String(req.params.mapId || '').trim();
    const filename = sanitizeMascotPackAssetFilename(req.params.filename);
    if (!visitMascotSpriteLibraryRelativeDir(mapId) || !filename) {
      return res.status(400).json({ error: 'Paramètres invalides' });
    }
    if (!(await mapExists(mapId))) return res.status(404).json({ error: 'Carte introuvable' });
    const row = await queryOne(
      'SELECT id FROM visit_mascot_sprite_library WHERE map_id = ? AND filename = ? LIMIT 1',
      [mapId, filename],
    );
    if (!row) return res.status(404).json({ error: 'Fichier introuvable' });
    const rel = `${visitMascotSpriteLibraryRelativeDir(mapId)}/${filename}`;
    const abs = getAbsolutePath(rel);
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Fichier introuvable' });
    return res.type('image/png').sendFile(abs, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Fichier introuvable' });
    });
  } catch (err) {
    logRouteError(err, req);
    const mapped = mapVisitMascotSpriteLibSqlError(err);
    if (mapped) return jsonVisitMascotPackError(res, req, mapped.status, mapped.body);
    return res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
  }
});

router.get(
  '/mascot-sprite-library/:mapId/assets',
  requirePermission('visit.manage', { needsElevation: true }),
  async (req, res) => {
    try {
      const mapId = String(req.params.mapId || '').trim();
      if (!visitMascotSpriteLibraryRelativeDir(mapId)) {
        return res.status(400).json({ error: 'map_id invalide' });
      }
      if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });
      const rows = await queryAll(
        `SELECT id, filename, created_at
         FROM visit_mascot_sprite_library
         WHERE map_id = ?
         ORDER BY filename ASC`,
        [mapId],
      );
      const assets = (rows || []).map((r) => ({
        id: r.id,
        filename: r.filename,
        url: `/api/visit/mascot-sprite-library/${mapId}/assets/${encodeURIComponent(r.filename)}`,
        created_at: r.created_at,
      }));
      res.json({ map_id: mapId, assets });
    } catch (err) {
      logRouteError(err, req);
      const mapped = mapVisitMascotSpriteLibSqlError(err);
      if (mapped) return jsonVisitMascotPackError(res, req, mapped.status, mapped.body);
      res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
    }
  },
);

router.post(
  '/mascot-sprite-library/:mapId/assets',
  requirePermission('visit.manage', { needsElevation: true }),
  async (req, res) => {
    try {
      const mapId = String(req.params.mapId || '').trim();
      if (!visitMascotSpriteLibraryRelativeDir(mapId)) {
        return res.status(400).json({ error: 'map_id invalide' });
      }
      if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });
      const filename = sanitizeMascotPackAssetFilename(req.body.filename);
      const imageDataRaw = req.body.image_data;
      const imageData =
        imageDataRaw !== undefined && imageDataRaw !== null ? String(imageDataRaw).trim() : '';
      if (!filename || !imageData) {
        return res.status(400).json({ error: 'filename et image_data requis' });
      }
      const relDir = visitMascotSpriteLibraryRelativeDir(mapId);
      const rel = `${relDir}/${filename}`;
      try {
        saveBase64ToDisk(rel, imageData);
      } catch (fileErr) {
        logRouteError(fileErr, req);
        return res.status(400).json({ error: 'Image invalide ou trop volumineuse' });
      }
      const now = nowIso();
      const createdBy = await resolveVisitMascotPackCreatedBy(req.auth);
      const existing = await queryOne(
        'SELECT id FROM visit_mascot_sprite_library WHERE map_id = ? AND filename = ? LIMIT 1',
        [mapId, filename],
      );
      if (existing) {
        await execute(
          'UPDATE visit_mascot_sprite_library SET created_at = ?, created_by = ? WHERE id = ?',
          [now, createdBy, existing.id],
        );
      } else {
        const rowId = uuidv4();
        await execute(
          `INSERT INTO visit_mascot_sprite_library (id, map_id, filename, created_at, created_by)
           VALUES (?, ?, ?, ?, ?)`,
          [rowId, mapId, filename, now, createdBy],
        );
      }
      const publicUrl = `/api/visit/mascot-sprite-library/${mapId}/assets/${encodeURIComponent(filename)}`;
      res.status(201).json({ ok: true, url: publicUrl, filename });
    } catch (err) {
      logRouteError(err, req);
      const mapped = mapVisitMascotSpriteLibSqlError(err);
      if (mapped) return jsonVisitMascotPackError(res, req, mapped.status, mapped.body);
      res.status(500).json({ error: 'Erreur serveur', requestId: req.requestId || null });
    }
  },
);

router.delete(
  '/mascot-sprite-library/:mapId/assets/:filename',
  requirePermission('visit.manage', { needsElevation: true }),
  async (req, res) => {
    try {
      const mapId = String(req.params.mapId || '').trim();
      const filename = sanitizeMascotPackAssetFilename(req.params.filename);
      if (!visitMascotSpriteLibraryRelativeDir(mapId) || !filename) {
        return res.status(400).json({ error: 'Paramètres invalides' });
      }
      const row = await queryOne(
        'SELECT id FROM visit_mascot_sprite_library WHERE map_id = ? AND filename = ? LIMIT 1',
        [mapId, filename],
      );
      if (!row) return res.status(404).json({ error: 'Entrée introuvable' });
      const rel = `${visitMascotSpriteLibraryRelativeDir(mapId)}/${filename}`;
      deleteFile(rel);
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

module.exports = router;
