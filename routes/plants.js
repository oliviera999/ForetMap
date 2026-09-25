const express = require('express');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const {
  pool,
  queryAll,
  queryOne,
  execute,
  withTransaction,
  noteExternalDataWrite,
} = require('../database');
const { purgeResourceGatingRows } = require('../lib/learningGatingOrphans');
const { nowDbTimestamp } = require('../lib/shared/isoTimestamp');
const { requirePermission, requireAuth } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const asyncHandler = require('../lib/asyncHandler');
const { assertGatingSatisfiedForAcknowledge } = require('../lib/learningGatingAcknowledge');
const { loadLearnerLevel } = require('../lib/pedago/learnerLevel');
const { emitGardenChanged } = require('../lib/realtime');
const { saveBase64ToDisk } = require('../lib/uploads');
const { getNamedMemoryTtlCache } = require('../lib/memoryTtlCache');
const {
  PHOTO_FIELDS,
  PLANT_COLUMNS,
  MAX_PLANT_PHOTO_BYTES,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  IMPORT_STRATEGIES,
  asTrimmedString,
  asOptionalText,
  detectImageExtensionFromDataUrl,
  mergePlantPhotoUploadValue,
  validateHttpsPhotoLinks,
  parseWorkbookRowsFromBuffer,
  toGoogleSheetCsvUrl,
  buildPlantPayload,
  buildImportReportBase,
  validateImportPayloadRow,
  parsePlantIdsQueryParam,
} = require('../lib/plantsRouteHelpers');
const { hazardReviewInvalidated } = require('../lib/plantHazardReview');
const {
  buildSpeciesAutofill,
  parseAutofillSourcesQueryParam,
  sourcesAllowedCacheFingerprint,
} = require('../lib/speciesAutofill');
const { plantnetIdentifyFromImages } = require('../lib/speciesAutofillPlantnet');
const { enrichPlantRow } = require('../lib/biodivReadModel');
const {
  loadPlantMapIdsMap,
  loadPlantMapSiteNotesMap,
  syncPlantMaps,
  upsertMapSpeciesSiteNotes,
  normalizeMapIds,
} = require('../lib/speciesJunction');
const { logAudit } = require('../lib/auditLog');
const { z, validate } = require('../lib/validate');
const { matchGbifSpeciesProposal } = require('../lib/gbifMatch');

const dbApi = { queryAll, queryOne, execute, withTransaction };

const router = express.Router();

// O7 — `POST /:id/acknowledge-discovery` : remplace la validation manuelle
// `if (!req.body || req.body.confirm !== true) -> 400 'Confirmation explicite requise (confirm: true)'`.
// Le refine est au niveau racine (path vide) pour que `formatZodError` renvoie exactement
// le message d'origine, sans préfixe de chemin. `passthrough()` conserve le corps tel quel et
// le refine reproduit `req.body.confirm !== true` (rejette toute valeur != true booléen).
const acknowledgeDiscoveryBodySchema = z
  .object({
    confirm: z.unknown().optional(),
    // Clé d'idempotence (migration 296) : une observation renvoyée — réponse perdue, file hors
    // ligne rejouée — n'est comptée qu'une fois.
    client_uuid: z
      .string()
      .regex(/^[A-Za-z0-9-]{8,64}$/, 'client_uuid invalide')
      .optional(),
  })
  .passthrough()
  .refine((body) => body && body.confirm === true, {
    message: 'Confirmation explicite requise (confirm: true)',
  });
const plantsListCache = getNamedMemoryTtlCache('plants:list:v1', { ttlMs: 20000, maxEntries: 5 });
const plantsAutofillCache = getNamedMemoryTtlCache('plants:autofill:v1', {
  ttlMs: 10 * 60 * 1000,
  maxEntries: 120,
});
/**
 * Compteurs d'observation « tout le site », par fiche.
 *
 * Agrégat identique pour tous les utilisateurs, jusqu'ici recalculé à chaque ouverture
 * d'écran et par chaque élève (audit charge biodiversité 2026-09, B7). Le TTL court garde
 * un compteur vivant — un acquittement met de toute façon à jour l'affichage de son auteur
 * par la réponse de `POST /:id/acknowledge-discovery`.
 */
const plantSiteObservationCountsCache = getNamedMemoryTtlCache('plants:site-observations:v1', {
  ttlMs: 15000,
  maxEntries: 32,
});

function invalidatePlantsListCache() {
  plantsListCache.delete('all');
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
      },
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
    if (buf.length > MAX_IMPORT_FILE_BYTES)
      throw new Error('Fichier import trop volumineux (max 8 Mo)');
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

/** Identifiants des fiches biodiversité pour lesquelles l’utilisateur connecté a au moins une observation enregistrée. */
router.get('/me/discovered-ids', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    if (userId == null || userId === '') {
      return res.status(403).json({ error: 'Profil utilisateur invalide' });
    }
    const rows = await queryAll(
      'SELECT DISTINCT plant_id FROM user_plant_observation_events WHERE user_id = ? ORDER BY plant_id ASC',
      [String(userId)],
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
    // Le volet « site » ne dépend pas de l'appelant : une classe entière qui ouvre le
    // catalogue demandait le même agrégat autant de fois qu'il y a d'élèves.
    const siteCacheKey = ids.join(',');
    const cachedSite = plantSiteObservationCountsCache.get(siteCacheKey);
    const [siteRows, myRows] = await Promise.all([
      cachedSite ||
        queryAll(
          `SELECT plant_id, COUNT(*) AS c FROM user_plant_observation_events WHERE plant_id IN (${placeholders}) GROUP BY plant_id`,
          ids,
        ),
      queryAll(
        `SELECT plant_id, COUNT(*) AS c FROM user_plant_observation_events WHERE user_id = ? AND plant_id IN (${placeholders}) GROUP BY plant_id`,
        [uid, ...ids],
      ),
    ]);
    if (!cachedSite) plantSiteObservationCountsCache.set(siteCacheKey, siteRows);
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

/** Observation déjà enregistrée sous cette clé d'idempotence (même utilisateur, même fiche). */
async function findObservationByClientUuid(userId, plantId, clientUuid) {
  return queryOne(
    `SELECT observed_at FROM user_plant_observation_events
      WHERE user_id = ? AND client_uuid = ? AND plant_id = ? LIMIT 1`,
    [String(userId), clientUuid, plantId],
  );
}

async function observationResponse(userId, plantId, event, replayed) {
  const myRow = await queryOne(
    'SELECT COUNT(*) AS c FROM user_plant_observation_events WHERE user_id = ? AND plant_id = ?',
    [String(userId), plantId],
  );
  const siteRow = await queryOne(
    'SELECT COUNT(*) AS c FROM user_plant_observation_events WHERE plant_id = ?',
    [plantId],
  );
  return {
    success: true,
    plant_id: plantId,
    observed_at: event.observed_at,
    my_observation_count: Number(myRow?.c) || 0,
    site_observation_count: Number(siteRow?.c) || 0,
    ...(replayed ? { replayed: true } : {}),
  };
}

/**
 * Enregistre une observation (engagement terrain + lecture de fiche) pour une entrée du catalogue plants.
 * Corps JSON : { "confirm": true } (obligatoire), `client_uuid` facultatif (clé d'idempotence :
 * un renvoi de la même clé rejoue la réponse, `replayed: true`, sans nouvelle ligne). Chaque
 * confirmation nouvelle ajoute une ligne (compteur incrémenté).
 */
router.post(
  '/:id/acknowledge-discovery',
  requireAuth,
  validate({ body: acknowledgeDiscoveryBodySchema }),
  async (req, res) => {
    try {
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

      const clientUuid = req.body?.client_uuid ? String(req.body.client_uuid) : null;
      if (clientUuid) {
        const already = await findObservationByClientUuid(userId, pid, clientUuid);
        if (already) return res.json(await observationResponse(userId, pid, already, true));
      }

      const priorRow = await queryOne(
        'SELECT COUNT(*) AS c FROM user_plant_observation_events WHERE user_id = ? AND plant_id = ?',
        [String(userId), pid],
      );
      const priorCount = Number(priorRow?.c) || 0;
      const gating = await assertGatingSatisfiedForAcknowledge(
        { queryAll, queryOne, execute },
        {
          product: 'fm',
          resourceType: 'plant',
          resourceRef: String(pid),
          userId,
          skipGating: priorCount > 0,
          learnerLevel: await loadLearnerLevel(userId),
        },
      );
      if (!gating.ok) {
        return res.status(gating.status || 403).json({
          error: gating.error,
          missing_question_codes: gating.missing_question_codes || [],
          cooldown: gating.cooldown,
        });
      }

      const now = nowDbTimestamp();
      try {
        await execute(
          'INSERT INTO user_plant_observation_events (user_id, plant_id, observed_at, client_uuid) VALUES (?, ?, ?, ?)',
          [String(userId), pid, now, clientUuid],
        );
      } catch (err) {
        // Deux envois simultanés de la même observation : le second rejoue le premier.
        if (!clientUuid || !(err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062)) throw err;
        const already = await findObservationByClientUuid(userId, pid, clientUuid);
        if (!already) throw err;
        return res.json(await observationResponse(userId, pid, already, true));
      }
      res.json(await observationResponse(userId, pid, { observed_at: now }, false));
    } catch (e) {
      logRouteError(e, req, 'Accusé découverte espèce en échec');
      if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146)) {
        return res.status(503).json({
          error:
            'Observations espèce indisponibles : la base doit être migrée (table user_plant_observation_events). Contactez l’administrateur.',
        });
      }
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },
);

router.post(
  '/:id/photo-upload',
  requirePermission('plants.manage'),
  asyncHandler(async (req, res) => {
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
    await saveBase64ToDisk(relativePath, imageData);
    const publicUrl = `/uploads/${relativePath}`;
    const position = asTrimmedString(req.body?.position) === 'prepend' ? 'prepend' : 'append';
    const nextPhotoValue = mergePlantPhotoUploadValue(plant[field], publicUrl, position);

    await execute(`UPDATE plants SET ${field} = ? WHERE id = ?`, [nextPhotoValue, plant.id]);
    const updated = await queryOne('SELECT * FROM plants WHERE id = ?', [plant.id]);
    invalidatePlantsListCache();
    emitGardenChanged({ reason: 'update_plant_photo', plantId: plant.id });
    res.json({ field, url: publicUrl, value: nextPhotoValue, plant: updated });
  }),
);

router.post(
  '/import',
  requirePermission('plants.manage'),
  asyncHandler(async (req, res) => {
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
        // INSERT multi-valeurs par lots au lieu d'un INSERT par ligne (cette branche ne dépend
        // d'aucun insertId). Lots bornés : 33 colonnes × MAX_IMPORT_ROWS dépasseraient la limite
        // de placeholders d'une requête préparée.
        const INSERT_CHUNK = 200;
        const rowPlaceholder = `(${PLANT_COLUMNS.map(() => '?').join(', ')})`;
        for (let i = 0; i < validRows.length; i += INSERT_CHUNK) {
          const chunk = validRows.slice(i, i + INSERT_CHUNK);
          const placeholders = chunk.map(() => rowPlaceholder).join(', ');
          const params = [];
          for (const payload of chunk) {
            for (const c of PLANT_COLUMNS) params.push(payload[c]);
          }
          await conn.execute(
            `INSERT INTO plants (${PLANT_COLUMNS.join(', ')}) VALUES ${placeholders}`,
            params,
          );
          report.totals.created += chunk.length;
        }
      } else {
        const [existingRows] = await conn.execute('SELECT id, name FROM plants');
        const existing = Array.isArray(existingRows) ? existingRows : [];
        const existingByName = new Map(
          existing.map((p) => [asTrimmedString(p.name).toLowerCase(), p]),
        );

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
          const [insertResult] = await conn.execute(
            insertSql,
            PLANT_COLUMNS.map((c) => payload[c]),
          );
          report.totals.created += 1;
          existingByName.set(key, { id: insertResult.insertId, name: payload.name });
        }
      }
      await conn.commit();
      // Import en connexion brute : signaler l'écriture aux caches / sync-state
      // (les helpers database.js ne l'ont pas vue passer).
      noteExternalDataWrite();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    invalidatePlantsListCache();
    emitGardenChanged({ reason: 'import_plants' });
    res.json({ report });
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const cached = plantsListCache.get('all');
    // Le cache contient déjà les lignes enrichies : les ré-enrichir reconstruisait tout le
    // catalogue (une centaine d'objets) à chaque hit, pour un résultat identique — `enrichPlantRow`
    // est idempotent (audit 2026-09, B5).
    if (cached) return res.json(cached);
    // Audit §2.4/§3.7 : SELECT * conservé volontairement. Le front ne refait PAS de GET /plants/:id
    // pour la fiche : la fiche complète, le formulaire d'édition (PlantEditForm) et les vues biodiv
    // (PlantMetaSections, FoodWebView…) sont rendus depuis les lignes de cette liste — toutes les
    // colonnes du catalogue (photos, remarques, écologie…) sont donc consommées. Table sans donnée sensible.
    const rows = await queryAll('SELECT * FROM plants ORDER BY name');
    const plantIds = rows.map((row) => row.id);
    const mapIdsByPlant = await loadPlantMapIdsMap(dbApi, plantIds);
    const siteNotesByPlant = await loadPlantMapSiteNotesMap(dbApi, plantIds);
    const enriched = rows.map((row) => ({
      ...enrichPlantRow(row),
      map_ids: mapIdsByPlant.get(Number(row.id)) || [],
      map_site_notes: siteNotesByPlant.get(Number(row.id)) || {},
    }));
    plantsListCache.set('all', enriched);
    res.json(enriched);
  }),
);

router.get(
  '/:id/interactions',
  asyncHandler(async (req, res) => {
    const plantId = Number(req.params.id);
    if (!Number.isInteger(plantId) || plantId <= 0) {
      return res.status(400).json({ error: 'Identifiant invalide' });
    }
    const plant = await queryOne('SELECT id, name FROM plants WHERE id = ? LIMIT 1', [plantId]);
    if (!plant) return res.status(404).json({ error: 'Plante introuvable' });

    const asSource = await queryAll(
      `SELECT si.id, si.interaction_type, si.description,
              pt.id AS to_id, pt.name AS to_name, pt.emoji AS to_emoji
         FROM species_interactions si
         LEFT JOIN plants pt ON pt.id = si.to_plant_id
        WHERE si.from_plant_id = ?
        ORDER BY si.interaction_type ASC, pt.name ASC`,
      [plantId],
    );
    const asTarget = await queryAll(
      `SELECT si.id, si.interaction_type, si.description,
              pf.id AS from_id, pf.name AS from_name, pf.emoji AS from_emoji
         FROM species_interactions si
         JOIN plants pf ON pf.id = si.from_plant_id
        WHERE si.to_plant_id = ?
        ORDER BY si.interaction_type ASC, pf.name ASC`,
      [plantId],
    );

    return res.json({ plantId, asSource, asTarget });
  }),
);

router.get(
  '/:id/glossary-terms',
  asyncHandler(async (req, res) => {
    const plantId = Number(req.params.id);
    if (!Number.isInteger(plantId) || plantId <= 0) {
      return res.status(400).json({ error: 'Identifiant invalide' });
    }
    const plant = await queryOne('SELECT id, name FROM plants WHERE id = ? LIMIT 1', [plantId]);
    if (!plant) return res.status(404).json({ error: 'Plante introuvable' });

    const terms = await queryAll(
      `SELECT g.glossary_code, g.terme, g.variantes, g.categorie, g.niveau, g.definition_courte
         FROM glossary_term_species gts
         JOIN glossary_terms g ON g.glossary_code = gts.glossary_code
        WHERE gts.plant_id = ? AND g.statut = 'actif'
        ORDER BY g.terme ASC`,
      [plantId],
    );
    return res.json({ plantId, terms });
  }),
);

router.get(
  '/:id/quiz-questions',
  asyncHandler(async (req, res) => {
    const plantId = Number(req.params.id);
    if (!Number.isInteger(plantId) || plantId <= 0) {
      return res.status(400).json({ error: 'Identifiant invalide' });
    }
    const plant = await queryOne('SELECT id, name FROM plants WHERE id = ? LIMIT 1', [plantId]);
    if (!plant) return res.status(404).json({ error: 'Plante introuvable' });

    const questions = await queryAll(
      `SELECT qq.question_code, qq.question, qq.categorie_slug, qq.niveau, qq.difficulte,
              qq.photo_url, qq.photo_legende
         FROM quiz_question_species qqs
         JOIN quiz_questions qq ON qq.question_code = qqs.question_code
        WHERE qqs.plant_id = ? AND qq.statut = 'actif'
        ORDER BY qq.categorie_slug ASC, qq.numero_dans_categorie ASC`,
      [plantId],
    );
    return res.json({ plantId, questions });
  }),
);

router.get('/autofill', requirePermission('plants.manage'), async (req, res) => {
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
    const sourcesAllowed = parseAutofillSourcesQueryParam(req.query?.sources);
    const sourcesFp = sourcesAllowedCacheFingerprint(sourcesAllowed);
    const openAiOnlyRequest = !!(
      sourcesAllowed instanceof Set &&
      sourcesAllowed.size === 1 &&
      sourcesAllowed.has('openai')
    );
    const hasAutofillFields = (payload) =>
      Object.keys(payload?.fields || {}).some(
        (key) => asTrimmedString(payload?.fields?.[key]).length > 0,
      );

    const hintsPart = `${hintScientific.toLowerCase()}\x1e${hintName.toLowerCase()}`;
    const cacheKey = crypto
      .createHash('sha256')
      .update(`${query.toLowerCase()}\x1e${hintsPart}\x1e${sourcesFp}`)
      .digest('hex')
      .slice(0, 48);
    const cached = plantsAutofillCache.get(cacheKey);
    if (cached && !(openAiOnlyRequest && !hasAutofillFields(cached))) return res.json(cached);

    /** Budget global wall-clock (évite 503 HTML des proxies si Wikidata + sources s’enchaînent trop longtemps). */
    const hints = {};
    if (hintScientific) hints.scientific_name = hintScientific;
    if (hintName) hints.name = hintName;
    const payload = await buildSpeciesAutofill(query, { budgetMs: 12000, hints, sourcesAllowed });
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
      payload.warnings = Array.from(
        new Set([...(payload.warnings || []), `Photos filtrées: ${photoErr}`]),
      );
      payload.photos = [];
    }
    // Évite de figer 10 min un « 0% » quand la requête est OpenAI-only et vide.
    if (!(openAiOnlyRequest && !hasAutofillFields(payload))) {
      plantsAutofillCache.set(cacheKey, payload);
    }
    res.json(payload);
  } catch (e) {
    logRouteError(e, req, 'Pré-saisie biodiversité externe en échec');
    res.status(502).json({ error: 'Impossible de récupérer une pré-saisie pour le moment' });
  }
});

/**
 * Identification d’espèce via Pl@ntNet (images) — proxy serveur, clé jamais exposée au client.
 * Corps JSON : { images: [{ organ, imageData }], project?, nbResults?, lang? }
 */
router.post('/plantnet-identify', requirePermission('plants.manage'), async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const images = Array.isArray(body.images) ? body.images : [];
    const project = asOptionalText(body.project);
    const nbResults = body.nbResults != null ? Number(body.nbResults) : undefined;
    const lang = asOptionalText(body.lang);

    const out = await plantnetIdentifyFromImages({
      images,
      project: project || undefined,
      nbResults,
      lang: lang || undefined,
      timeoutMs: 16000,
    });

    if (!out.ok) {
      const hs = Number(out.httpStatus);
      const status = Number.isFinite(hs) && hs >= 400 && hs < 600 ? hs : 400;
      return res.status(status).json({
        error: out.error || 'Identification indisponible',
      });
    }

    res.json({
      ...out.data,
      attribution:
        'Résultats fournis par le service Pl@ntNet — respecter les conditions d’usage (my.plantnet.org).',
    });
  } catch (e) {
    logRouteError(e, req, 'Identification Pl@ntNet en échec');
    res.status(502).json({ error: 'Identification Pl@ntNet temporairement indisponible' });
  }
});

/**
 * Proposition GBIF (lecture seule) — le client applique via PUT /api/plants/:id après confirmation.
 */
router.get('/gbif-match', requirePermission('plants.manage'), async (req, res) => {
  try {
    const query = asTrimmedString(req.query?.q);
    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Paramètre q requis (min 2 caractères)' });
    }
    if (query.length > 120) {
      return res.status(400).json({ error: 'Paramètre q trop long (max 120 caractères)' });
    }
    const result = await matchGbifSpeciesProposal(query, { timeoutMs: 8000 });
    res.json(result);
  } catch (e) {
    logRouteError(e, req, 'Correspondance GBIF en échec');
    res.status(502).json({ error: 'Impossible d’interroger GBIF pour le moment' });
  }
});

router.put(
  '/:id/map-species/:mapId',
  requirePermission('plants.manage'),
  asyncHandler(async (req, res) => {
    const plantId = Number(req.params.id);
    const mapId = asTrimmedString(req.params.mapId);
    if (!Number.isInteger(plantId) || plantId <= 0 || !mapId) {
      return res.status(400).json({ error: 'Identifiants invalides' });
    }
    const siteNotes = Object.prototype.hasOwnProperty.call(req.body || {}, 'site_notes')
      ? req.body.site_notes
      : undefined;
    if (siteNotes === undefined) {
      return res.status(400).json({ error: 'Champ site_notes requis' });
    }
    const out = await upsertMapSpeciesSiteNotes(dbApi, plantId, mapId, siteNotes);
    if (!out.ok) {
      return res.status(out.status || 400).json({ error: out.error || 'Mise à jour impossible' });
    }
    invalidatePlantsListCache();
    emitGardenChanged({ reason: 'update_plant_map_notes', plantId, mapId });
    res.json(out);
  }),
);

/**
 * Valide la relecture des dangers d'une fiche (`hazard_reviewed` + qui, + quand).
 *
 * Permission dédiée `plants.hazards.validate`, distincte de `plants.manage` : renseigner un
 * danger et certifier qu'il a été relu ne sont pas le même geste, et le pré-remplissage
 * bibliographique de la migration 251 arrive précisément non relu. Accordée à l'admin et au
 * prof, pas au prof de classe.
 *
 * Corps optionnel `{ "reviewed": false }` pour retirer la validation (une relecture peut
 * conclure que la fiche est à revoir).
 */
router.post(
  '/:id/validate-hazard',
  requirePermission('plants.hazards.validate'),
  asyncHandler(async (req, res) => {
    const plantId = Number(req.params.id);
    if (!Number.isInteger(plantId) || plantId <= 0) {
      return res.status(400).json({ error: 'Identifiant invalide' });
    }
    const plant = await queryOne('SELECT * FROM plants WHERE id = ?', [plantId]);
    if (!plant) return res.status(404).json({ error: 'Plante introuvable' });

    const reviewed = req.body?.reviewed === false ? 0 : 1;
    const reviewerId = reviewed ? String(req.auth?.userId || '') || null : null;
    const reviewedAt = reviewed ? nowDbTimestamp() : null;
    await execute(
      'UPDATE plants SET hazard_reviewed = ?, hazard_reviewed_by = ?, hazard_reviewed_at = ? WHERE id = ?',
      [reviewed, reviewerId, reviewedAt, plantId],
    );

    const updated = await queryOne('SELECT * FROM plants WHERE id = ?', [plantId]);
    invalidatePlantsListCache();
    emitGardenChanged({ reason: 'update_plant', plantId });
    await logAudit(
      reviewed ? 'validate_plant_hazard' : 'invalidate_plant_hazard',
      'plant',
      plantId,
      `${reviewed ? 'Validation' : 'Retrait de validation'} des dangers — ${plant.name || plantId}`,
      { req, payload: { toxicity_level: plant.toxicity_level || null } },
    );
    res.json(enrichPlantRow(updated));
  }),
);

router.post(
  '/',
  requirePermission('plants.manage'),
  asyncHandler(async (req, res) => {
    const photoError = validateHttpsPhotoLinks(req.body);
    if (photoError) return res.status(400).json({ error: photoError });
    const payload = buildPlantPayload(req.body);
    if (!payload.name) return res.status(400).json({ error: 'Nom requis' });
    const placeholders = PLANT_COLUMNS.map(() => '?').join(', ');
    const values = PLANT_COLUMNS.map((col) => payload[col]);
    const result = await execute(
      `INSERT INTO plants (${PLANT_COLUMNS.join(', ')}) VALUES (${placeholders})`,
      values,
    );
    let mapIds = [];
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'map_ids')) {
      ({ mapIds } = await syncPlantMaps(dbApi, result.insertId, req.body.map_ids));
    }
    const plant = await queryOne('SELECT * FROM plants WHERE id = ?', [result.insertId]);
    invalidatePlantsListCache();
    emitGardenChanged({ reason: 'create_plant', plantId: result.insertId });
    await logAudit('create_plant', 'plant', result.insertId, payload.name, {
      req,
      payload: { name: payload.name },
    });
    res.status(201).json({ ...enrichPlantRow(plant), map_ids: mapIds, map_site_notes: {} });
  }),
);

router.put(
  '/:id',
  requirePermission('plants.manage'),
  asyncHandler(async (req, res) => {
    const plant = await queryOne('SELECT * FROM plants WHERE id = ?', [req.params.id]);
    if (!plant) return res.status(404).json({ error: 'Plante introuvable' });
    const photoError = validateHttpsPhotoLinks(req.body);
    if (photoError) return res.status(400).json({ error: photoError });
    const payload = buildPlantPayload(req.body, plant);
    if (!payload.name) return res.status(400).json({ error: 'Nom requis' });
    // Une modification du danger ou du risque sanitaire annule la relecture : la coche
    // certifierait sinon un texte qui n'existe plus (cf. lib/plantHazardReview.js).
    const reviewInvalidated = hazardReviewInvalidated(plant, payload);
    const setClause = [
      ...PLANT_COLUMNS.map((col) => `${col}=?`),
      ...(reviewInvalidated
        ? ['hazard_reviewed=0', 'hazard_reviewed_by=NULL', 'hazard_reviewed_at=NULL']
        : []),
    ].join(', ');
    const values = [...PLANT_COLUMNS.map((col) => payload[col]), plant.id];
    await execute(`UPDATE plants SET ${setClause} WHERE id=?`, values);
    let mapIds;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'map_ids')) {
      ({ mapIds } = await syncPlantMaps(dbApi, plant.id, req.body.map_ids));
    } else {
      const existing = await loadPlantMapIdsMap(dbApi, [plant.id]);
      mapIds = existing.get(Number(plant.id)) || [];
    }
    const updated = await queryOne('SELECT * FROM plants WHERE id = ?', [plant.id]);
    invalidatePlantsListCache();
    emitGardenChanged({ reason: 'update_plant', plantId: plant.id });
    await logAudit('update_plant', 'plant', plant.id, payload.name, {
      req,
      payload: { name: payload.name },
    });
    res.json({ ...enrichPlantRow(updated), map_ids: normalizeMapIds(mapIds) });
  }),
);

router.delete(
  '/:id',
  requirePermission('plants.manage'),
  asyncHandler(async (req, res) => {
    const plant = await queryOne('SELECT * FROM plants WHERE id = ?', [req.params.id]);
    if (!plant) return res.status(404).json({ error: 'Plante introuvable' });
    await execute('DELETE FROM plants WHERE id = ?', [req.params.id]);
    // Liens, politique et verrous du conditionnement désignent la plante par référence
    // polymorphe (pas de clé étrangère) : sans cette purge, ils survivaient à la fiche (C7).
    await purgeResourceGatingRows(
      { execute },
      { product: 'fm', resourceType: 'plant', resourceRef: String(req.params.id) },
    );
    invalidatePlantsListCache();
    emitGardenChanged({ reason: 'delete_plant', plantId: req.params.id });
    await logAudit(
      'delete_plant',
      'plant',
      req.params.id,
      `Suppression plante ${plant.name || req.params.id}`,
      {
        req,
        payload: { name: plant.name || null },
      },
    );
    res.json({ success: true });
  }),
);

module.exports = router;
// Exporté pour le test no-DB du contrat de validation O7.
module.exports.acknowledgeDiscoveryBodySchema = acknowledgeDiscoveryBodySchema;
