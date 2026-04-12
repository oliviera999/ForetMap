const express = require('express');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const XLSX = require('xlsx');
const { pool, queryAll, queryOne, execute } = require('../database');
const { requirePermission, requireAuth } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const { emitGardenChanged } = require('../lib/realtime');
const { saveBase64ToDisk, deleteFile } = require('../lib/uploads');
const { getNamedMemoryTtlCache } = require('../lib/memoryTtlCache');
const { applyDerivedGroup4IfEmpty } = require('../lib/plantGroup4');
const { buildSpeciesAutofill } = require('../lib/speciesAutofill');

const router = express.Router();
const plantsListCache = getNamedMemoryTtlCache('plants:list:v1', { ttlMs: 20000, maxEntries: 5 });
const plantsAutofillCache = getNamedMemoryTtlCache('plants:autofill:v1', { ttlMs: 10 * 60 * 1000, maxEntries: 120 });
const PHOTO_FIELDS = [
  'photo',
  'photo_species',
  'photo_leaf',
  'photo_flower',
  'photo_fruit',
  'photo_harvest_part',
];
const PLANT_EXTRA_FIELDS = [
  'second_name',
  'scientific_name',
  'group_1',
  'group_2',
  'group_3',
  'group_4',
  'habitat',
  ...PHOTO_FIELDS,
  'nutrition',
  'agroecosystem_category',
  'longevity',
  'remark_1',
  'remark_2',
  'remark_3',
  'reproduction',
  'size',
  'sources',
  'ideal_temperature_c',
  'optimal_ph',
  'ecosystem_role',
  'geographic_origin',
  'human_utility',
  'harvest_part',
  'planting_recommendations',
  'preferred_nutrients',
];
const PLANT_COLUMNS = ['name', 'emoji', 'description', ...PLANT_EXTRA_FIELDS];
const MAX_PLANT_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_ROWS = 2000;
const IMPORT_STRATEGIES = new Set(['upsert_name', 'insert_only', 'replace_all']);

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function invalidatePlantsListCache() {
  plantsListCache.delete('all');
}

function asOptionalText(value) {
  const s = asTrimmedString(value);
  return s.length > 0 ? s : null;
}

function parseLinkCandidates(value) {
  const raw = asTrimmedString(value);
  if (!raw) return [];
  return raw
    .split(/\n|,\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const HEADER_ALIASES = new Map([
  ['nom', 'name'],
  ['nom_commun', 'name'],
  ['common_name', 'name'],
  ['description_courte', 'description'],
  ['nom_scientifique', 'scientific_name'],
  ['deuxieme_nom', 'second_name'],
  ['groupe_1', 'group_1'],
  ['groupe_2', 'group_2'],
  ['groupe_3', 'group_3'],
  ['groupe_4', 'group_4'],
  ['categorie_agrosysteme', 'agroecosystem_category'],
  ['temperature_ideale_c', 'ideal_temperature_c'],
  ['temperature_ideale', 'ideal_temperature_c'],
  ['ph_optimal', 'optimal_ph'],
  ['role_ecosysteme', 'ecosystem_role'],
  ['origine_geographique', 'geographic_origin'],
  ['utilite_humaine', 'human_utility'],
  ['partie_a_recolter', 'harvest_part'],
  ['recommandations_plantation', 'planting_recommendations'],
  ['nutriments_preferes', 'preferred_nutrients'],
  ['photo_espece', 'photo_species'],
  ['photo_feuille', 'photo_leaf'],
  ['photo_fleur', 'photo_flower'],
  ['photo_fruit', 'photo_fruit'],
  ['photo_partie_recoltee', 'photo_harvest_part'],
  ['sources_url', 'sources'],
]);

const NORMALIZED_CANONICAL_KEYS = new Map(
  PLANT_COLUMNS.map((k) => [normalizeHeader(k), k])
);

function mapImportRowToPlantShape(input = {}) {
  const out = {};
  for (const [rawKey, rawValue] of Object.entries(input || {})) {
    const nk = normalizeHeader(rawKey);
    const canonical = HEADER_ALIASES.get(nk) || NORMALIZED_CANONICAL_KEYS.get(nk);
    if (!canonical) continue;
    out[canonical] = rawValue;
  }
  return out;
}

function parseNumberish(value) {
  const s = asTrimmedString(value).replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function validateRangeText(value, min, max) {
  const s = asTrimmedString(value);
  if (!s) return null;

  const range = s.match(/^(-?\d+(?:[.,]\d+)?)\s*[-/]\s*(-?\d+(?:[.,]\d+)?)$/);
  if (range) {
    const a = Number(range[1].replace(',', '.'));
    const b = Number(range[2].replace(',', '.'));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 'valeur non numérique';
    if (a > b) return 'intervalle inversé';
    if (a < min || b > max) return `intervalle hors plage (${min}-${max})`;
    return null;
  }

  const n = parseNumberish(s);
  if (!Number.isFinite(n)) return 'valeur non numérique';
  if (n < min || n > max) return `valeur hors plage (${min}-${max})`;
  return null;
}

function detectImageExtensionFromDataUrl(dataUrl) {
  const m = /^data:image\/(png|jpe?g|webp|gif|bmp|avif);base64,/i.exec(dataUrl || '');
  if (!m) return null;
  const ext = String(m[1]).toLowerCase();
  return ext === 'jpeg' ? 'jpg' : ext;
}

function isLocalUploadsPath(value) {
  return /^\/uploads\/[^?#\s]+/i.test(asTrimmedString(value));
}

function isDirectImagePath(value) {
  const raw = asTrimmedString(value);
  return /\.(avif|bmp|gif|jpe?g|png|svg|webp)(?:$|\?)/i.test(raw);
}

function isDevLocalhostHttp(url) {
  if (!url || url.protocol !== 'http:') return false;
  return /^(localhost|127\.0\.0\.1)$/i.test(url.hostname);
}

function isDirectImageUrl(url) {
  const path = (url?.pathname || '').toLowerCase();
  if (/\.(avif|bmp|gif|jpe?g|png|svg|webp)$/.test(path)) return true;
  if (/\/wiki\/special:filepath\//.test(path)) return true;
  return false;
}

function extractUploadsRelativePath(value) {
  const raw = asTrimmedString(value);
  if (!raw) return null;
  if (raw.startsWith('/uploads/')) return raw.slice('/uploads/'.length);
  try {
    const u = new URL(raw);
    if (u.pathname.startsWith('/uploads/')) return u.pathname.slice('/uploads/'.length);
  } catch {
    return null;
  }
  return null;
}

function validateHttpsPhotoLinks(body = {}) {
  for (const field of PHOTO_FIELDS) {
    if (!hasOwn(body, field)) continue;
    const raw = asTrimmedString(body[field]);
    if (!raw) continue;
    const links = parseLinkCandidates(raw);
    for (const link of links) {
      if (isLocalUploadsPath(link)) {
        if (!isDirectImagePath(link)) {
          return `${field}: chemin local invalide (extension image requise)`;
        }
        continue;
      }
      let url;
      try {
        url = new URL(link);
      } catch {
        return `${field}: URL invalide`;
      }
      if (url.protocol !== 'https:' && !isDevLocalhostHttp(url)) {
        return `${field}: seules les URLs HTTPS (ou localhost en dev) sont autorisées`;
      }
      if (!isDirectImageUrl(url)) {
        return `${field}: URL d'image directe requise (.jpg/.png/... ou /wiki/Special:FilePath/...)`;
      }
    }
  }
  return null;
}

function parseWorkbookRowsFromBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false, cellDates: false });
  const first = wb.SheetNames[0];
  if (!first) return [];
  const ws = wb.Sheets[first];
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, blankrows: false });
}

function toGoogleSheetCsvUrl(rawUrl) {
  const value = asTrimmedString(rawUrl);
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!/^(?:docs\.)?google\.com$/i.test(url.hostname)) return null;
  const m = url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) return null;
  const sheetId = m[1];
  const gidFromQuery = asTrimmedString(url.searchParams.get('gid'));
  const gidFromHash = (url.hash.match(/gid=(\d+)/) || [])[1] || '';
  const gid = gidFromQuery || gidFromHash || '0';
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${encodeURIComponent(gid)}`;
}

function requestText(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error('URL invalide'));
      return;
    }
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(
      parsed,
      {
        method: 'GET',
        headers: { 'user-agent': 'ForetMap/1.0 (plants-import)' },
      },
      (res) => {
        const status = Number(res.statusCode || 0);
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`HTTP ${status}`));
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
          if (body.length > MAX_IMPORT_FILE_BYTES * 2) {
            req.destroy(new Error('Fichier distant trop volumineux'));
          }
        });
        res.on('end', () => resolve(body));
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timeout HTTP (${timeoutMs}ms)`)));
    req.on('error', reject);
    req.end();
  });
}

async function resolveImportRows(body = {}) {
  if (Array.isArray(body.rows)) {
    return body.rows;
  }

  const fileData = asTrimmedString(body.fileDataBase64);
  if (fileData) {
    const raw = fileData.includes(',') ? fileData.split(',')[1] : fileData;
    const buf = Buffer.from(raw, 'base64');
    if (!buf || buf.length === 0) throw new Error('Fichier import vide');
    if (buf.length > MAX_IMPORT_FILE_BYTES) throw new Error('Fichier import trop volumineux (max 8 Mo)');
    return parseWorkbookRowsFromBuffer(buf);
  }

  const gsheetUrl = asTrimmedString(body.gsheetUrl);
  if (gsheetUrl) {
    const csvUrl = toGoogleSheetCsvUrl(gsheetUrl);
    if (!csvUrl) throw new Error('URL Google Sheet invalide');
    const csvText = await requestText(csvUrl);
    const buf = Buffer.from(csvText, 'utf8');
    return parseWorkbookRowsFromBuffer(buf);
  }

  throw new Error('Aucune source d’import fournie');
}

function buildPlantPayload(body, fallback = {}) {
  const payload = {};
  const rawName = hasOwn(body, 'name') ? body.name : fallback.name;
  const rawEmoji = hasOwn(body, 'emoji') ? body.emoji : fallback.emoji;
  const rawDescription = hasOwn(body, 'description') ? body.description : fallback.description;
  payload.name = asTrimmedString(rawName);
  payload.emoji = asTrimmedString(rawEmoji) || '🌱';
  payload.description = asTrimmedString(rawDescription);
  for (const field of PLANT_EXTRA_FIELDS) {
    const sourceValue = hasOwn(body, field) ? body[field] : fallback[field];
    payload[field] = asOptionalText(sourceValue);
  }
  applyDerivedGroup4IfEmpty(payload);
  return payload;
}

function buildImportReportBase(strategy, dryRun, sourceType, rowsCount) {
  return {
    strategy,
    dryRun,
    sourceType,
    totals: {
      received: rowsCount,
      valid: 0,
      created: 0,
      updated: 0,
      skipped_existing: 0,
      skipped_invalid: 0,
    },
    preview: [],
    errors: [],
  };
}

function validateImportPayloadRow(row, rowNumber) {
  const mapped = mapImportRowToPlantShape(row);
  const payload = buildPlantPayload(mapped);
  if (!payload.name) {
    return {
      payload: null,
      errors: [{ row: rowNumber, field: 'name', error: 'Nom requis' }],
    };
  }

  const errors = [];
  const photoErr = validateHttpsPhotoLinks(payload);
  if (photoErr) {
    const [field, ...rest] = photoErr.split(':');
    errors.push({ row: rowNumber, field: (field || 'photo').trim(), error: rest.join(':').trim() || photoErr });
  }

  const tempErr = validateRangeText(payload.ideal_temperature_c, -20, 80);
  if (tempErr) errors.push({ row: rowNumber, field: 'ideal_temperature_c', error: tempErr });
  const phErr = validateRangeText(payload.optimal_ph, 0, 14);
  if (phErr) errors.push({ row: rowNumber, field: 'optimal_ph', error: phErr });

  return { payload, errors };
}

const MAX_PLANT_OBSERVATION_COUNT_IDS = 200;

/** Parse `plant_ids` query (comma-separated positive ints), dédupliqué, max MAX_PLANT_OBSERVATION_COUNT_IDS. */
function parsePlantIdsQueryParam(raw) {
  const s = asTrimmedString(raw);
  if (!s) return [];
  const seen = new Set();
  const out = [];
  for (const part of s.split(/[,;\s]+/)) {
    const n = Number(String(part).trim());
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= MAX_PLANT_OBSERVATION_COUNT_IDS) break;
  }
  return out;
}

/** Identifiants des fiches biodiversité pour lesquelles l’utilisateur connecté a au moins une observation enregistrée. */
router.get('/me/discovered-ids', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    if (userId == null || userId === '') {
      return res.status(403).json({ error: 'Profil utilisateur invalide' });
    }
    const rows = await queryAll(
      'SELECT DISTINCT plant_id FROM user_plant_observation_events WHERE user_id = ? ORDER BY plant_id ASC',
      [String(userId)]
    );
    res.json({ plant_ids: rows.map((r) => Number(r.plant_id)).filter((n) => Number.isFinite(n)) });
  } catch (e) {
    logRouteError(e, req, 'Liste découvertes biodiversité en échec');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Compteurs d’observations par fiche (moi + tout le site) pour une liste d’identifiants.
 * Query : plant_ids=1,2,3 (max 200, entiers positifs).
 */
router.get('/me/observation-counts', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    if (userId == null || userId === '') {
      return res.status(403).json({ error: 'Profil utilisateur invalide' });
    }
    const ids = parsePlantIdsQueryParam(req.query.plant_ids);
    if (ids.length === 0) {
      return res.json({ counts: {} });
    }
    const placeholders = ids.map(() => '?').join(',');
    const uid = String(userId);
    const [siteRows, myRows] = await Promise.all([
      queryAll(
        `SELECT plant_id, COUNT(*) AS c FROM user_plant_observation_events WHERE plant_id IN (${placeholders}) GROUP BY plant_id`,
        ids
      ),
      queryAll(
        `SELECT plant_id, COUNT(*) AS c FROM user_plant_observation_events WHERE user_id = ? AND plant_id IN (${placeholders}) GROUP BY plant_id`,
        [uid, ...ids]
      ),
    ]);
    const siteByPlant = new Map(siteRows.map((r) => [Number(r.plant_id), Number(r.c) || 0]));
    const myByPlant = new Map(myRows.map((r) => [Number(r.plant_id), Number(r.c) || 0]));
    const counts = {};
    for (const pid of ids) {
      counts[String(pid)] = {
        my_observation_count: myByPlant.get(pid) || 0,
        site_observation_count: siteByPlant.get(pid) || 0,
      };
    }
    res.json({ counts });
  } catch (e) {
    logRouteError(e, req, 'Compteurs observations biodiversité en échec');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Enregistre une observation (engagement terrain + lecture de fiche) pour une entrée du catalogue plants.
 * Corps JSON : { "confirm": true } (obligatoire). Chaque confirmation ajoute une ligne (compteur incrémenté).
 */
router.post('/:id/acknowledge-discovery', requireAuth, async (req, res) => {
  try {
    if (!req.body || req.body.confirm !== true) {
      return res.status(400).json({ error: 'Confirmation explicite requise (confirm: true)' });
    }
    const userId = req.auth.userId;
    if (userId == null || userId === '') {
      return res.status(403).json({ error: 'Profil utilisateur invalide' });
    }
    const pid = Number(req.params.id);
    if (!Number.isFinite(pid) || pid <= 0) {
      return res.status(400).json({ error: 'Identifiant de fiche invalide' });
    }
    const plant = await queryOne('SELECT id FROM plants WHERE id = ?', [pid]);
    if (!plant) return res.status(404).json({ error: 'Fiche introuvable' });
    const now = new Date().toISOString();
    await execute(
      'INSERT INTO user_plant_observation_events (user_id, plant_id, observed_at) VALUES (?, ?, ?)',
      [String(userId), pid, now]
    );
    const myRow = await queryOne(
      'SELECT COUNT(*) AS c FROM user_plant_observation_events WHERE user_id = ? AND plant_id = ?',
      [String(userId), pid]
    );
    const siteRow = await queryOne(
      'SELECT COUNT(*) AS c FROM user_plant_observation_events WHERE plant_id = ?',
      [pid]
    );
    res.json({
      success: true,
      plant_id: pid,
      observed_at: now,
      my_observation_count: Number(myRow?.c) || 0,
      site_observation_count: Number(siteRow?.c) || 0,
    });
  } catch (e) {
    logRouteError(e, req, 'Accusé découverte espèce en échec');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/:id/photo-upload', requirePermission('plants.manage', { needsElevation: true }), async (req, res) => {
  try {
    const plant = await queryOne('SELECT * FROM plants WHERE id = ?', [req.params.id]);
    if (!plant) return res.status(404).json({ error: 'Plante introuvable' });

    const field = asTrimmedString(req.body?.field);
    const imageData = asTrimmedString(req.body?.imageData);
    if (!PHOTO_FIELDS.includes(field)) {
      return res.status(400).json({ error: 'Champ photo invalide' });
    }
    if (!imageData) {
      return res.status(400).json({ error: 'Image requise' });
    }

    const ext = detectImageExtensionFromDataUrl(imageData);
    if (!ext) {
      return res.status(400).json({ error: 'Format image invalide (png/jpg/webp/gif/bmp/avif)' });
    }
    const base64Payload = imageData.includes(',') ? imageData.split(',')[1] : imageData;
    const bytes = Buffer.byteLength(base64Payload, 'base64');
    if (bytes > MAX_PLANT_PHOTO_BYTES) {
      return res.status(400).json({ error: 'Image trop lourde (max 5 Mo)' });
    }

    const relativePath = `plants/${plant.id}/${field}-${Date.now()}.${ext}`;
    saveBase64ToDisk(relativePath, imageData);
    const publicUrl = `/uploads/${relativePath}`;

    const previousRelativePath = extractUploadsRelativePath(plant[field]);
    if (previousRelativePath && previousRelativePath !== relativePath) {
      deleteFile(previousRelativePath);
    }

    await execute(`UPDATE plants SET ${field} = ? WHERE id = ?`, [publicUrl, plant.id]);
    const updated = await queryOne('SELECT * FROM plants WHERE id = ?', [plant.id]);
    invalidatePlantsListCache();
    emitGardenChanged({ reason: 'update_plant_photo', plantId: plant.id });
    res.json({ field, url: publicUrl, plant: updated });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.post('/import', requirePermission('plants.manage', { needsElevation: true }), async (req, res) => {
  try {
    const strategy = asTrimmedString(req.body?.strategy) || 'upsert_name';
    const dryRun = !!req.body?.dryRun;
    const sourceType = asTrimmedString(req.body?.sourceType) || 'unknown';
    if (!IMPORT_STRATEGIES.has(strategy)) {
      return res.status(400).json({ error: 'Stratégie d’import invalide' });
    }

    const rawRows = await resolveImportRows(req.body || {});
    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      return res.status(400).json({ error: 'Aucune ligne importable détectée' });
    }
    if (rawRows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({ error: `Import limité à ${MAX_IMPORT_ROWS} lignes` });
    }

    const report = buildImportReportBase(strategy, dryRun, sourceType, rawRows.length);
    const validRows = [];

    rawRows.forEach((rawRow, idx) => {
      const rowNumber = idx + 2;
      const { payload, errors } = validateImportPayloadRow(rawRow, rowNumber);
      if (!payload || errors.length > 0) {
        report.totals.skipped_invalid += 1;
        report.errors.push(...errors);
        return;
      }
      validRows.push(payload);
      if (report.preview.length < 10) {
        report.preview.push({
          row: rowNumber,
          name: payload.name,
          scientific_name: payload.scientific_name || null,
        });
      }
    });

    report.totals.valid = validRows.length;
    if (strategy === 'replace_all' && report.errors.length > 0 && !dryRun) {
      return res.status(400).json({
        error: 'Import interrompu: corrige les lignes invalides avant un remplacement complet',
        report,
      });
    }
    if (dryRun || validRows.length === 0) {
      return res.json({ report });
    }

    const insertSql = `INSERT INTO plants (${PLANT_COLUMNS.join(', ')}) VALUES (${PLANT_COLUMNS.map(() => '?').join(', ')})`;
    const updateSql = `UPDATE plants SET ${PLANT_COLUMNS.map((c) => `${c}=?`).join(', ')} WHERE id=?`;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (strategy === 'replace_all') {
        await conn.execute('DELETE FROM plants');
        for (const payload of validRows) {
          await conn.execute(insertSql, PLANT_COLUMNS.map((c) => payload[c]));
          report.totals.created += 1;
        }
      } else {
        const [existingRows] = await conn.execute('SELECT id, name FROM plants');
        const existing = Array.isArray(existingRows) ? existingRows : [];
        const existingByName = new Map(existing.map((p) => [asTrimmedString(p.name).toLowerCase(), p]));

        for (const payload of validRows) {
          const key = asTrimmedString(payload.name).toLowerCase();
          const found = existingByName.get(key);
          if (found && strategy === 'insert_only') {
            report.totals.skipped_existing += 1;
            continue;
          }
          if (found && strategy === 'upsert_name') {
            await conn.execute(updateSql, [...PLANT_COLUMNS.map((c) => payload[c]), found.id]);
            report.totals.updated += 1;
            continue;
          }
          const [insertResult] = await conn.execute(insertSql, PLANT_COLUMNS.map((c) => payload[c]));
          report.totals.created += 1;
          existingByName.set(key, { id: insertResult.insertId, name: payload.name });
        }
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    invalidatePlantsListCache();
    emitGardenChanged({ reason: 'import_plants' });
    res.json({ report });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const cached = plantsListCache.get('all');
    if (cached) return res.json(cached);
    const rows = await queryAll('SELECT * FROM plants ORDER BY name');
    plantsListCache.set('all', rows);
    res.json(rows);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.get('/autofill', requirePermission('plants.manage', { needsElevation: true }), async (req, res) => {
  try {
    const query = asTrimmedString(req.query?.q);
    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Paramètre q requis (min 2 caractères)' });
    }
    if (query.length > 120) {
      return res.status(400).json({ error: 'Paramètre q trop long (max 120 caractères)' });
    }

    const hintScientific = asTrimmedString(req.query?.hint_scientific).slice(0, 120);
    const hintName = asTrimmedString(req.query?.hint_name).slice(0, 120);

    const hintsPart = `${hintScientific.toLowerCase()}\x1e${hintName.toLowerCase()}`;
    const cacheKey = crypto.createHash('sha256').update(`${query.toLowerCase()}\x1e${hintsPart}`).digest('hex').slice(0, 48);
    const cached = plantsAutofillCache.get(cacheKey);
    if (cached) return res.json(cached);

    /** Budget global wall-clock (évite 503 HTML des proxies si Wikidata + sources s’enchaînent trop longtemps). */
    const hints = {};
    if (hintScientific) hints.scientific_name = hintScientific;
    if (hintName) hints.name = hintName;
    const payload = await buildSpeciesAutofill(query, { budgetMs: 12000, hints });
    const photoValidationPayload = {};
    for (const photo of payload?.photos || []) {
      if (!PHOTO_FIELDS.includes(photo.field)) continue;
      if (photoValidationPayload[photo.field]) {
        photoValidationPayload[photo.field] += `\n${photo.url}`;
      } else {
        photoValidationPayload[photo.field] = photo.url;
      }
    }
    const photoErr = validateHttpsPhotoLinks(photoValidationPayload);
    if (photoErr) {
      payload.warnings = Array.from(new Set([...(payload.warnings || []), `Photos filtrées: ${photoErr}`]));
      payload.photos = [];
    }
    plantsAutofillCache.set(cacheKey, payload);
    res.json(payload);
  } catch (e) {
    logRouteError(e, req, 'Pré-saisie biodiversité externe en échec');
    res.status(502).json({ error: 'Impossible de récupérer une pré-saisie pour le moment' });
  }
});

router.post('/', requirePermission('plants.manage', { needsElevation: true }), async (req, res) => {
  try {
    const photoError = validateHttpsPhotoLinks(req.body);
    if (photoError) return res.status(400).json({ error: photoError });
    const payload = buildPlantPayload(req.body);
    if (!payload.name) return res.status(400).json({ error: 'Nom requis' });
    const placeholders = PLANT_COLUMNS.map(() => '?').join(', ');
    const values = PLANT_COLUMNS.map(col => payload[col]);
    const result = await execute(
      `INSERT INTO plants (${PLANT_COLUMNS.join(', ')}) VALUES (${placeholders})`,
      values
    );
    const plant = await queryOne('SELECT * FROM plants WHERE id = ?', [result.insertId]);
    invalidatePlantsListCache();
    emitGardenChanged({ reason: 'create_plant', plantId: result.insertId });
    res.status(201).json(plant);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', requirePermission('plants.manage', { needsElevation: true }), async (req, res) => {
  try {
    const plant = await queryOne('SELECT * FROM plants WHERE id = ?', [req.params.id]);
    if (!plant) return res.status(404).json({ error: 'Plante introuvable' });
    const photoError = validateHttpsPhotoLinks(req.body);
    if (photoError) return res.status(400).json({ error: photoError });
    const payload = buildPlantPayload(req.body, plant);
    if (!payload.name) return res.status(400).json({ error: 'Nom requis' });
    const setClause = PLANT_COLUMNS.map(col => `${col}=?`).join(', ');
    const values = [...PLANT_COLUMNS.map(col => payload[col]), plant.id];
    await execute(
      `UPDATE plants SET ${setClause} WHERE id=?`,
      values
    );
    const updated = await queryOne('SELECT * FROM plants WHERE id = ?', [plant.id]);
    invalidatePlantsListCache();
    emitGardenChanged({ reason: 'update_plant', plantId: plant.id });
    res.json(updated);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requirePermission('plants.manage', { needsElevation: true }), async (req, res) => {
  try {
    const plant = await queryOne('SELECT * FROM plants WHERE id = ?', [req.params.id]);
    if (!plant) return res.status(404).json({ error: 'Plante introuvable' });
    await execute('DELETE FROM plants WHERE id = ?', [req.params.id]);
    invalidatePlantsListCache();
    emitGardenChanged({ reason: 'delete_plant', plantId: req.params.id });
    res.json({ success: true });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
