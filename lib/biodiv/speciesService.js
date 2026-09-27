'use strict';

/**
 * Service des fiches espèces (`plants`) — étape B3 de la piste B (audit du 25/09/2026,
 * § 2.2 et § 3.3 ligne 9).
 *
 * `routes/plants.js` ne garde que le HTTP (authentification, paramètres, statut de réponse) ;
 * ce module porte la logique : validation des fiches, revue des dangers (`hazard_reviewed*`),
 * préremplissage externe, import tabulaire en transaction (`withTransaction`), observations,
 * caches du catalogue et notifications temps réel. Le SQL vit dans
 * `lib/biodiv/speciesRepository.js`.
 *
 * Contrat de retour des opérations « de route » : `{ status, body }`, que la route renvoie
 * tel quel. Les erreurs inattendues sont levées et suivent le flux d'erreur de la route
 * (gestionnaire central ou `try/catch` historique, inchangés).
 *
 * Extraction sans changement de comportement : mêmes requêtes, même ordre, mêmes réponses
 * (caractérisation : `tests/plants-species-characterization.test.js`).
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { withTransaction, noteExternalDataWrite } = require('../../database');
const repo = require('./speciesRepository');
const { purgeResourceGatingRows } = require('../learningGatingOrphans');
const { nowDbTimestamp } = require('../shared/isoTimestamp');
const { assertGatingSatisfiedForAcknowledge } = require('../learningGatingAcknowledge');
const learningLinks = require('../pedago/learningLinks');
const { emitGardenChanged } = require('../realtime');
const { saveBase64ToDisk } = require('../uploads');
const { getNamedMemoryTtlCache } = require('../memoryTtlCache');
const {
  PHOTO_FIELDS,
  MAX_PLANT_PHOTO_BYTES,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  IMPORT_STRATEGIES,
  asTrimmedString,
  asOptionalText,
  detectImageExtensionFromDataUrl,
  validateHttpsPhotoLinks,
  parseWorkbookRowsFromBuffer,
  toGoogleSheetCsvUrl,
  buildPlantPayload,
  buildImportReportBase,
  validateImportPayloadRow,
  parsePlantIdsQueryParam,
} = require('../plantsRouteHelpers');
const { hazardReviewInvalidated } = require('../plantHazardReview');
const {
  buildSpeciesAutofill,
  parseAutofillSourcesQueryParam,
  sourcesAllowedCacheFingerprint,
} = require('../speciesAutofill');
const { plantnetIdentifyFromImages } = require('../speciesAutofillPlantnet');
const { enrichPlantRow } = require('../biodivReadModel');
const {
  loadPlantMapIdsMap,
  loadPlantMapSiteNotesMap,
  syncPlantMaps,
  upsertMapSpeciesSiteNotes,
  normalizeMapIds,
} = require('../speciesJunction');
const { logAudit } = require('../auditLog');
const { matchGbifSpeciesProposal } = require('../gbifMatch');
const speciesRelations = require('./speciesRelations');
const {
  resolvePlantPhotos,
  photoRowsFromColumns,
  mirrorColumnsFromPhotoRows,
  insertPhotoRow,
} = require('./plantPhotos');

const dbApi = repo.defaultDb;

// ─── Caches ──────────────────────────────────────────────────────────────────

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

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

// ─── Catalogue ───────────────────────────────────────────────────────────────

/**
 * Catalogue complet enrichi (taxonomie, plages, cartes, notes de site), mis en cache 20 s.
 * Le cache contient déjà les lignes enrichies : `enrichPlantRow` est idempotent, les
 * ré-enrichir à chaque hit reconstruisait tout le catalogue pour un résultat identique
 * (audit 2026-09, B5).
 */
async function listCatalog() {
  const cached = plantsListCache.get('all');
  if (cached) return cached;
  const rows = await repo.listAllPlants();
  const plantIds = rows.map((row) => row.id);
  const mapIdsByPlant = await loadPlantMapIdsMap(dbApi, plantIds);
  const siteNotesByPlant = await loadPlantMapSiteNotesMap(dbApi, plantIds);
  // Tables liées de la piste C (photos…) : une requête par table pour tout le catalogue.
  const relationsOf = await speciesRelations.loadRelationsForAll();
  const enriched = rows.map((row) => ({
    ...enrichPlantRow(row, relationsOf(row.id)),
    map_ids: mapIdsByPlant.get(Number(row.id)) || [],
    map_site_notes: siteNotesByPlant.get(Number(row.id)) || {},
  }));
  plantsListCache.set('all', enriched);
  return enriched;
}

/** Identifiant de fiche d'un paramètre de route : entier strictement positif, sinon `null`. */
function parsePlantIdParam(raw) {
  const plantId = Number(raw);
  return Number.isInteger(plantId) && plantId > 0 ? plantId : null;
}

/** Contrôle commun des routes « par fiche » : id valide et fiche existante. */
async function loadPlantIdentityOr404(rawId) {
  const plantId = parsePlantIdParam(rawId);
  if (!plantId) return { error: { status: 400, body: { error: 'Identifiant invalide' } } };
  const plant = await repo.findPlantIdentity(plantId);
  if (!plant) return { error: { status: 404, body: { error: 'Plante introuvable' } } };
  return { plantId, plant };
}

async function getPlantInteractions(rawId) {
  const found = await loadPlantIdentityOr404(rawId);
  if (found.error) return found.error;
  const { plantId } = found;
  const asSource = await repo.listInteractionsFromPlant(plantId);
  const asTarget = await repo.listInteractionsToPlant(plantId);
  return { status: 200, body: { plantId, asSource, asTarget } };
}

async function getPlantGlossaryTerms(rawId) {
  const found = await loadPlantIdentityOr404(rawId);
  if (found.error) return found.error;
  const { plantId } = found;
  const terms = await repo.listActiveGlossaryTermsForPlant(plantId);
  return { status: 200, body: { plantId, terms } };
}

async function getPlantQuizQuestions(rawId) {
  const found = await loadPlantIdentityOr404(rawId);
  if (found.error) return found.error;
  const { plantId } = found;
  // Source unique `resource_question_links` (migration 300) : les liens approuvés de la
  // fiche, bloquants ou non — ceux que l'écran des liens montre et que le verrouillage lit.
  // `quiz_question_species` n'est plus lue (temps 1 du retrait, audit du 25/09/2026, § 3.5).
  const questions = await learningLinks.listQuestionsForResource(dbApi, {
    resourceType: 'plant',
    resourceRef: plantId,
    audience: 'sheet',
  });
  return { status: 200, body: { plantId, questions } };
}

// ─── Observations ────────────────────────────────────────────────────────────

/** Identifiants des fiches que l'utilisateur a observées au moins une fois. */
async function listObservedPlantIds(userId) {
  const rows = await repo.listObservedPlantIdsForUser(userId);
  return rows.map((r) => Number(r.plant_id)).filter((n) => Number.isFinite(n));
}

/** Compteurs d'observation (moi + tout le site) pour `plant_ids=1,2,3` (max 200). */
async function observationCounts(userId, rawPlantIds) {
  const ids = parsePlantIdsQueryParam(rawPlantIds);
  if (ids.length === 0) return {};
  // Le volet « site » ne dépend pas de l'appelant : une classe entière qui ouvre le
  // catalogue demandait le même agrégat autant de fois qu'il y a d'élèves.
  const siteCacheKey = ids.join(',');
  const cachedSite = plantSiteObservationCountsCache.get(siteCacheKey);
  const [siteRows, myRows] = await Promise.all([
    cachedSite || repo.countSiteObservationsByPlant(ids),
    repo.countUserObservationsByPlant(userId, ids),
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
  return counts;
}

async function observationResponse(userId, plantId, event, replayed) {
  const myRow = await repo.countUserObservationsOfPlant(userId, plantId);
  const siteRow = await repo.countSiteObservationsOfPlant(plantId);
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
 * Enregistre une observation (« Espèce observée »). La première observation d'une fiche
 * passe par le verrouillage de lecture ; les suivantes non. `clientUuid` (facultatif) rend
 * l'envoi idempotent : un renvoi rejoue la réponse (`replayed: true`) sans nouvelle ligne.
 *
 * @param {{ userId: string, rawPlantId: unknown, clientUuid: string|null,
 *   loadLearnerLevel: () => Promise<unknown> }} input
 */
async function recordObservation({ userId, rawPlantId, clientUuid, loadLearnerLevel }) {
  const pid = Number(rawPlantId);
  if (!Number.isFinite(pid) || pid <= 0) {
    return { status: 400, body: { error: 'Identifiant de fiche invalide' } };
  }
  const plant = await repo.findPlantIdOnly(pid);
  if (!plant) return { status: 404, body: { error: 'Fiche introuvable' } };

  if (clientUuid) {
    const already = await repo.findObservationByClientUuid(userId, pid, clientUuid);
    if (already)
      return { status: 200, body: await observationResponse(userId, pid, already, true) };
  }

  const priorRow = await repo.countUserObservationsOfPlant(userId, pid);
  const priorCount = Number(priorRow?.c) || 0;
  const gating = await assertGatingSatisfiedForAcknowledge(
    { queryAll: dbApi.queryAll, queryOne: dbApi.queryOne, execute: dbApi.execute },
    {
      product: 'fm',
      resourceType: 'plant',
      resourceRef: String(pid),
      userId,
      skipGating: priorCount > 0,
      learnerLevel: await loadLearnerLevel(),
    },
  );
  if (!gating.ok) {
    return {
      status: gating.status || 403,
      body: {
        error: gating.error,
        missing_question_codes: gating.missing_question_codes || [],
        cooldown: gating.cooldown,
      },
    };
  }

  const now = nowDbTimestamp();
  try {
    await repo.insertObservationEvent({ userId, plantId: pid, observedAt: now, clientUuid });
  } catch (err) {
    // Deux envois simultanés de la même observation : le second rejoue le premier.
    if (!clientUuid || !(err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062)) throw err;
    const already = await repo.findObservationByClientUuid(userId, pid, clientUuid);
    if (!already) throw err;
    return { status: 200, body: await observationResponse(userId, pid, already, true) };
  }
  return { status: 200, body: await observationResponse(userId, pid, { observed_at: now }, false) };
}

// ─── Photos téléversées ──────────────────────────────────────────────────────

/** Téléverse une image (data URL) dans un champ photo de la fiche, en tête ou en fin de liste. */
async function uploadPlantPhoto(rawPlantId, body = {}) {
  const plant = await repo.findPlantById(rawPlantId);
  if (!plant) return { status: 404, body: { error: 'Plante introuvable' } };

  const field = asTrimmedString(body?.field);
  const imageData = asTrimmedString(body?.imageData);
  if (!PHOTO_FIELDS.includes(field)) {
    return { status: 400, body: { error: 'Champ photo invalide' } };
  }
  if (!imageData) {
    return { status: 400, body: { error: 'Image requise' } };
  }

  const ext = detectImageExtensionFromDataUrl(imageData);
  if (!ext) {
    return { status: 400, body: { error: 'Format image invalide (png/jpg/webp/gif/bmp/avif)' } };
  }
  const base64Payload = imageData.includes(',') ? imageData.split(',')[1] : imageData;
  const bytes = Buffer.byteLength(base64Payload, 'base64');
  if (bytes > MAX_PLANT_PHOTO_BYTES) {
    return { status: 400, body: { error: 'Image trop lourde (max 5 Mo)' } };
  }

  const relativePath = `plants/${plant.id}/${field}-${Date.now()}.${ext}`;
  await saveBase64ToDisk(relativePath, imageData);
  const publicUrl = `/uploads/${relativePath}`;
  const position = asTrimmedString(body?.position) === 'prepend' ? 'prepend' : 'append';

  // Piste C (migration 303) : la photo devient une ligne de `plant_photos`, sans auteur ni
  // licence (à compléter depuis le formulaire) ; les colonnes miroir sont recalculées. Une
  // nouvelle photo principale (`prepend` sur `photo`) n'hérite plus du crédit de l'ancienne.
  const photos = await withTransaction(async (tx) => {
    const existingRows = await repo.listPhotoRowsForPlant(plant.id, tx);
    const current = resolvePlantPhotos(plant, existingRows);
    const baseRows =
      current.origin === 'table' ? existingRows : photoRowsFromColumns(plant, existingRows);
    const nextRows = insertPhotoRow(
      baseRows,
      {
        id: null,
        kind: field,
        url: publicUrl,
        credit: null,
        licence: null,
        source: 'televersement',
        source_url: null,
        sort_order: 0,
      },
      position,
    );
    await speciesRelations.replacePhotos(tx, plant.id, nextRows, existingRows);
    await repo.updatePlantPhotoMirror(plant.id, mirrorColumnsFromPhotoRows(nextRows), tx);
    return repo.listPhotoRowsForPlant(plant.id, tx);
  });
  const updated = await repo.findPlantById(plant.id);
  invalidatePlantsListCache();
  emitGardenChanged({ reason: 'update_plant_photo', plantId: plant.id });
  const view = enrichPlantRow(updated, { photos });
  return {
    status: 200,
    body: {
      field,
      url: publicUrl,
      value: updated[field],
      plant: updated,
      photos: view.photos,
    },
  };
}

// ─── Import tabulaire ────────────────────────────────────────────────────────

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

/** Lots d'`INSERT` multi-valeurs de « remplacer tout » (limite de paramètres préparés). */
const IMPORT_INSERT_CHUNK = 200;

/**
 * Écrit les lignes valides d'un import dans UNE transaction (`withTransaction`) : tout ou
 * rien. Stratégies : `replace_all` (vide puis insère par lots), `upsert_name` (met à jour la
 * fiche de même nom, insensible à la casse, sinon crée), `insert_only` (ignore les noms
 * existants).
 */
async function writeImportRows(strategy, validRows, report) {
  await withTransaction(async (tx) => {
    if (strategy === 'replace_all') {
      await repo.deleteAllPlants(tx);
      for (let i = 0; i < validRows.length; i += IMPORT_INSERT_CHUNK) {
        const chunk = validRows.slice(i, i + IMPORT_INSERT_CHUNK);
        await repo.insertPlantsBulk(chunk, tx);
        report.totals.created += chunk.length;
      }
      // Tables liées (piste C) recalculées depuis les colonnes importées : toutes les fiches
      // sont neuves, leurs lignes liées sont parties avec elles (clés étrangères).
      await speciesRelations.rebuildPhotosFromColumns(tx);
      return;
    }
    const existing = await repo.listPlantIdsAndNames(tx);
    const existingByName = new Map(existing.map((p) => [asTrimmedString(p.name).toLowerCase(), p]));
    // Un import porte les anciennes colonnes : la table des photos en est recalculée.
    const photoIntent = { mode: 'legacy' };
    for (const payload of validRows) {
      const key = asTrimmedString(payload.name).toLowerCase();
      const found = existingByName.get(key);
      if (found && strategy === 'insert_only') {
        report.totals.skipped_existing += 1;
        continue;
      }
      if (found && strategy === 'upsert_name') {
        await repo.updatePlant(found.id, payload, {}, tx);
        const related = await speciesRelations.loadRelationsForPlant(found.id, tx);
        await speciesRelations.writePhotos(tx, found.id, photoIntent, payload, related.photos);
        report.totals.updated += 1;
        continue;
      }
      const insertResult = await repo.insertPlant(payload, tx);
      await speciesRelations.writePhotos(tx, insertResult.insertId, photoIntent, payload, []);
      report.totals.created += 1;
      existingByName.set(key, { id: insertResult.insertId, name: payload.name });
    }
  });
  // Les clés étrangères propagent un « remplacer tout » aux jonctions (zones, repères,
  // tâches, cartes) : ces tables n'apparaissent pas dans le SQL écrit, le suivi par domaine
  // ne les verrait pas. Tout périmer, comme le faisait la connexion brute historique.
  noteExternalDataWrite();
}

/** Import de fiches (lignes JSON, fichier CSV/XLSX en base64 ou Google Sheet). */
async function importPlants(body = {}) {
  const strategy = asTrimmedString(body?.strategy) || 'upsert_name';
  const dryRun = !!body?.dryRun;
  const sourceType = asTrimmedString(body?.sourceType) || 'unknown';
  if (!IMPORT_STRATEGIES.has(strategy)) {
    return { status: 400, body: { error: 'Stratégie d’import invalide' } };
  }

  const rawRows = await resolveImportRows(body || {});
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return { status: 400, body: { error: 'Aucune ligne importable détectée' } };
  }
  if (rawRows.length > MAX_IMPORT_ROWS) {
    return { status: 400, body: { error: `Import limité à ${MAX_IMPORT_ROWS} lignes` } };
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
    return {
      status: 400,
      body: {
        error: 'Import interrompu: corrige les lignes invalides avant un remplacement complet',
        report,
      },
    };
  }
  if (dryRun || validRows.length === 0) {
    return { status: 200, body: { report } };
  }

  await writeImportRows(strategy, validRows, report);
  invalidatePlantsListCache();
  emitGardenChanged({ reason: 'import_plants' });
  return { status: 200, body: { report } };
}

// ─── Préremplissage externe (lecture seule, aucune écriture en base) ───────────

function hasAutofillFields(payload) {
  return Object.keys(payload?.fields || {}).some(
    (key) => asTrimmedString(payload?.fields?.[key]).length > 0,
  );
}

/**
 * Pré-saisie multi-sources (`GET /api/plants/autofill`), mise en cache 10 min par requête,
 * indices et sources. Les photos dont un lien n'est pas une image HTTPS directe sont
 * retirées en bloc, avec un avertissement.
 */
async function autofill(query = {}) {
  const q = asTrimmedString(query?.q);
  if (!q || q.length < 2) {
    return { status: 400, body: { error: 'Paramètre q requis (min 2 caractères)' } };
  }
  if (q.length > 120) {
    return { status: 400, body: { error: 'Paramètre q trop long (max 120 caractères)' } };
  }

  const hintScientific = asTrimmedString(query?.hint_scientific).slice(0, 120);
  const hintName = asTrimmedString(query?.hint_name).slice(0, 120);
  const sourcesAllowed = parseAutofillSourcesQueryParam(query?.sources);
  const sourcesFp = sourcesAllowedCacheFingerprint(sourcesAllowed);
  const openAiOnlyRequest = !!(
    sourcesAllowed instanceof Set &&
    sourcesAllowed.size === 1 &&
    sourcesAllowed.has('openai')
  );

  const hintsPart = `${hintScientific.toLowerCase()}\x1e${hintName.toLowerCase()}`;
  const cacheKey = crypto
    .createHash('sha256')
    .update(`${q.toLowerCase()}\x1e${hintsPart}\x1e${sourcesFp}`)
    .digest('hex')
    .slice(0, 48);
  const cached = plantsAutofillCache.get(cacheKey);
  if (cached && !(openAiOnlyRequest && !hasAutofillFields(cached))) {
    return { status: 200, body: cached };
  }

  // Budget global wall-clock (évite 503 HTML des proxies si Wikidata + sources s'enchaînent trop longtemps).
  const hints = {};
  if (hintScientific) hints.scientific_name = hintScientific;
  if (hintName) hints.name = hintName;
  const payload = await buildSpeciesAutofill(q, { budgetMs: 12000, hints, sourcesAllowed });
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
  return { status: 200, body: payload };
}

/** Identification Pl@ntNet (images) — proxy serveur, clé jamais exposée au client. */
async function plantnetIdentify(rawBody) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody : {};
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
    return { status, body: { error: out.error || 'Identification indisponible' } };
  }

  return {
    status: 200,
    body: {
      ...out.data,
      attribution:
        'Résultats fournis par le service Pl@ntNet — respecter les conditions d’usage (my.plantnet.org).',
    },
  };
}

/** Proposition GBIF (lecture seule) — le client applique via `PUT` après confirmation. */
async function gbifMatch(rawQuery) {
  const q = asTrimmedString(rawQuery);
  if (!q || q.length < 2) {
    return { status: 400, body: { error: 'Paramètre q requis (min 2 caractères)' } };
  }
  if (q.length > 120) {
    return { status: 400, body: { error: 'Paramètre q trop long (max 120 caractères)' } };
  }
  const result = await matchGbifSpeciesProposal(q, { timeoutMs: 8000 });
  return { status: 200, body: result };
}

// ─── Notes de site ───────────────────────────────────────────────────────────

async function updateMapSiteNotes(rawPlantId, rawMapId, body) {
  const plantId = Number(rawPlantId);
  const mapId = asTrimmedString(rawMapId);
  if (!Number.isInteger(plantId) || plantId <= 0 || !mapId) {
    return { status: 400, body: { error: 'Identifiants invalides' } };
  }
  const siteNotes = hasOwn(body, 'site_notes') ? body.site_notes : undefined;
  if (siteNotes === undefined) {
    return { status: 400, body: { error: 'Champ site_notes requis' } };
  }
  const out = await upsertMapSpeciesSiteNotes(dbApi, plantId, mapId, siteNotes);
  if (!out.ok) {
    return { status: out.status || 400, body: { error: out.error || 'Mise à jour impossible' } };
  }
  invalidatePlantsListCache();
  emitGardenChanged({ reason: 'update_plant_map_notes', plantId, mapId });
  return { status: 200, body: out };
}

// ─── Revue des dangers ───────────────────────────────────────────────────────

/**
 * Valide (ou retire) la relecture des dangers d'une fiche : drapeau, relecteur, date.
 *
 * Seule écriture de `hazard_reviewed*` : le formulaire et l'import ne les écrivent pas
 * (`PLANT_COLUMNS` les exclut), et une modification du danger remet la fiche « à valider »
 * (`updatePlant`). La permission dédiée `plants.hazards.validate` est vérifiée par la route.
 *
 * @param {unknown} rawPlantId
 * @param {{ reviewed: boolean, reviewerId: string|null }} decision
 * @param {{ req?: object }} [ctx] contexte d'audit (auteur, adresse)
 */
async function validateHazardReview(rawPlantId, { reviewed, reviewerId }, ctx = {}) {
  const plantId = parsePlantIdParam(rawPlantId);
  if (!plantId) return { status: 400, body: { error: 'Identifiant invalide' } };
  const plant = await repo.findPlantById(plantId);
  if (!plant) return { status: 404, body: { error: 'Plante introuvable' } };

  const flag = reviewed ? 1 : 0;
  await repo.setHazardReview(plantId, {
    reviewed: flag,
    reviewerId: flag ? reviewerId || null : null,
    reviewedAt: flag ? nowDbTimestamp() : null,
  });

  const updated = await repo.findPlantById(plantId);
  const related = await speciesRelations.loadRelationsForPlant(plantId);
  invalidatePlantsListCache();
  emitGardenChanged({ reason: 'update_plant', plantId });
  await logAudit(
    flag ? 'validate_plant_hazard' : 'invalidate_plant_hazard',
    'plant',
    plantId,
    `${flag ? 'Validation' : 'Retrait de validation'} des dangers — ${plant.name || plantId}`,
    { req: ctx.req, payload: { toxicity_level: plant.toxicity_level || null } },
  );
  return { status: 200, body: enrichPlantRow(updated, related) };
}

// ─── Création, modification, suppression ─────────────────────────────────────

/**
 * Crée une fiche. Écriture en une transaction : colonnes de `plants`, tables liées de la
 * piste C (photos…) et rattachement direct aux cartes (`map_ids`).
 */
async function createPlant(body = {}, ctx = {}) {
  const photoError = speciesRelations.validatePhotoInput(body);
  if (photoError) return { status: 400, body: { error: photoError } };
  const payload = buildPlantPayload(body);
  if (!payload.name) return { status: 400, body: { error: 'Nom requis' } };
  const photoIntent = speciesRelations.readPhotoIntent(body);
  speciesRelations.applyPhotoMirrorToPayload(payload, photoIntent);
  const { plantId, mapIds } = await withTransaction(async (tx) => {
    const result = await repo.insertPlant(payload, tx);
    await speciesRelations.writePhotos(tx, result.insertId, photoIntent, payload, []);
    let ids = [];
    if (hasOwn(body, 'map_ids')) {
      ({ mapIds: ids } = await syncPlantMaps(tx, result.insertId, body.map_ids));
    }
    return { plantId: result.insertId, mapIds: ids };
  });
  const plant = await repo.findPlantById(plantId);
  const related = await speciesRelations.loadRelationsForPlant(plantId);
  invalidatePlantsListCache();
  emitGardenChanged({ reason: 'create_plant', plantId });
  await logAudit('create_plant', 'plant', plantId, payload.name, {
    req: ctx.req,
    payload: { name: payload.name },
  });
  return {
    status: 201,
    body: { ...enrichPlantRow(plant, related), map_ids: mapIds, map_site_notes: {} },
  };
}

/**
 * Modifie une fiche : les champs absents du corps gardent leur valeur. Une modification du
 * danger ou du risque sanitaire remet la relecture des dangers à zéro. Même transaction que
 * la création.
 */
async function updatePlant(rawPlantId, body = {}, ctx = {}) {
  const plant = await repo.findPlantById(rawPlantId);
  if (!plant) return { status: 404, body: { error: 'Plante introuvable' } };
  const photoError = speciesRelations.validatePhotoInput(body);
  if (photoError) return { status: 400, body: { error: photoError } };
  const payload = buildPlantPayload(body, plant);
  if (!payload.name) return { status: 400, body: { error: 'Nom requis' } };
  const photoIntent = speciesRelations.readPhotoIntent(body);
  speciesRelations.applyPhotoMirrorToPayload(payload, photoIntent);
  // Une modification du danger ou du risque sanitaire annule la relecture : la coche
  // certifierait sinon un texte qui n'existe plus (cf. lib/plantHazardReview.js).
  const resetHazardReview = hazardReviewInvalidated(plant, payload);
  const mapIds = await withTransaction(async (tx) => {
    await repo.updatePlant(plant.id, payload, { resetHazardReview }, tx);
    const existing = await speciesRelations.loadRelationsForPlant(plant.id, tx);
    await speciesRelations.writePhotos(tx, plant.id, photoIntent, payload, existing.photos);
    if (hasOwn(body, 'map_ids')) {
      const { mapIds: ids } = await syncPlantMaps(tx, plant.id, body.map_ids);
      return ids;
    }
    const current = await loadPlantMapIdsMap(tx, [plant.id]);
    return current.get(Number(plant.id)) || [];
  });
  const updated = await repo.findPlantById(plant.id);
  const related = await speciesRelations.loadRelationsForPlant(plant.id);
  invalidatePlantsListCache();
  emitGardenChanged({ reason: 'update_plant', plantId: plant.id });
  await logAudit('update_plant', 'plant', plant.id, payload.name, {
    req: ctx.req,
    payload: { name: payload.name },
  });
  return {
    status: 200,
    body: { ...enrichPlantRow(updated, related), map_ids: normalizeMapIds(mapIds) },
  };
}

async function deletePlant(rawPlantId, ctx = {}) {
  const plant = await repo.findPlantById(rawPlantId);
  if (!plant) return { status: 404, body: { error: 'Plante introuvable' } };
  await repo.deletePlant(rawPlantId);
  // Liens, politique et verrous du conditionnement désignent la plante par référence
  // polymorphe (pas de clé étrangère) : sans cette purge, ils survivaient à la fiche (C7).
  await purgeResourceGatingRows(
    { execute: dbApi.execute },
    { product: 'fm', resourceType: 'plant', resourceRef: String(rawPlantId) },
  );
  invalidatePlantsListCache();
  emitGardenChanged({ reason: 'delete_plant', plantId: rawPlantId });
  await logAudit(
    'delete_plant',
    'plant',
    rawPlantId,
    `Suppression plante ${plant.name || rawPlantId}`,
    {
      req: ctx.req,
      payload: { name: plant.name || null },
    },
  );
  return { status: 200, body: { success: true } };
}

module.exports = {
  invalidatePlantsListCache,
  listCatalog,
  getPlantInteractions,
  getPlantGlossaryTerms,
  getPlantQuizQuestions,
  listObservedPlantIds,
  observationCounts,
  recordObservation,
  uploadPlantPhoto,
  importPlants,
  resolveImportRows,
  autofill,
  plantnetIdentify,
  gbifMatch,
  updateMapSiteNotes,
  validateHazardReview,
  createPlant,
  updatePlant,
  deletePlant,
};
