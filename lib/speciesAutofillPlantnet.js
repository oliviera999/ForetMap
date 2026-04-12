'use strict';

const logger = require('./logger');

/**
 * Pl@ntNet (https://my.plantnet.org/) — **désactivé par défaut**.
 * `PLANTNET_API_KEY` + `SPECIES_AUTOFILL_PLANTNET=1` activent l’**identification par image**
 * (`POST /v2/identify/{project}`) côté serveur ; la pré-saisie textuelle agrégée n’utilise plus Pl@ntNet.
 */

const PLANTNET_IDENTIFY_ORGANS = new Set([
  'auto',
  'leaf',
  'flower',
  'fruit',
  'bark',
  'habit',
  'scan',
  'branch',
  'sheet',
  'other',
  'drawing',
  'seed',
  'bud',
  'anatomy',
  'aerial',
]);

const MAX_IDENTIFY_IMAGES = 5;
const MAX_IMAGE_DECODED_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_DECODED_BYTES = 14 * 1024 * 1024;

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function asOptionalText(value) {
  const s = asTrimmedString(value);
  return s.length > 0 ? s : null;
}

function isPlantnetAutofillEnabled() {
  const flag = asTrimmedString(process.env.SPECIES_AUTOFILL_PLANTNET);
  const key = asTrimmedString(process.env.PLANTNET_API_KEY);
  return flag === '1' && key.length > 0;
}

/** URL de test connectivité + clé (GET, sans consommation identify). */
function buildPlantnetQuotaTestUrl() {
  const apiKey = asTrimmedString(process.env.PLANTNET_API_KEY);
  if (!apiKey) return null;
  return `https://my-api.plantnet.org/v2/quota?api-key=${encodeURIComponent(apiKey)}`;
}

function resolveFetchTimeoutMs(options = {}) {
  if (typeof options.getTimeoutMs === 'function') {
    const n = Number(options.getTimeoutMs());
    if (!Number.isFinite(n)) return 12000;
    return Math.min(20000, Math.max(200, n));
  }
  return Math.min(20000, Math.max(200, Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 14000));
}

/**
 * @param {string} imageData Data URL ou base64 nu
 * @returns {{ buffer: Buffer, contentType: string }|null}
 */
function decodeImageDataToBuffer(imageData) {
  const s = asTrimmedString(imageData);
  if (!s) return null;
  let b64 = s;
  let contentType = 'image/jpeg';
  if (s.toLowerCase().startsWith('data:')) {
    const m = /^data:([^;]+);base64,(.+)$/is.exec(s);
    if (m) {
      contentType = asTrimmedString(m[1]) || 'image/jpeg';
      b64 = asTrimmedString(m[2]).replace(/\s+/g, '');
    }
  }
  let buffer;
  try {
    buffer = Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
  if (!buffer || buffer.length === 0 || buffer.length > MAX_IMAGE_DECODED_BYTES) return null;
  return { buffer, contentType };
}

function pickGenusName(genus) {
  if (!genus || typeof genus !== 'object') return null;
  return asOptionalText(genus.scientificNameWithoutAuthor || genus.scientificName);
}

function pickFamilyName(family) {
  if (!family || typeof family !== 'object') return null;
  return asOptionalText(family.scientificNameWithoutAuthor || family.scientificName);
}

/**
 * Normalise la réponse JSON `POST /v2/identify/…` pour le client ForetMap.
 * @param {object} data
 * @returns {{ predictions: object[], bestMatch: string|null, version: string|null, remainingIdentificationRequests: number|null }}
 */
function normalizePlantnetIdentifyResponse(data) {
  const rawList = Array.isArray(data?.results) ? data.results : [];
  const predictions = [];
  for (const row of rawList) {
    if (!row || typeof row !== 'object') continue;
    const sp = row.species && typeof row.species === 'object' ? row.species : {};
    const without = asOptionalText(sp.scientificNameWithoutAuthor);
    const auth = asOptionalText(sp.scientificNameAuthorship);
    const fullSci = asOptionalText(sp.scientificName)
      || (without && auth ? `${without} ${auth}`.trim() : without);
    const commonNames = Array.isArray(sp.commonNames)
      ? sp.commonNames.map((x) => asTrimmedString(x)).filter(Boolean).slice(0, 24)
      : [];
    predictions.push({
      score: typeof row.score === 'number' && Number.isFinite(row.score) ? row.score : null,
      scientificName: fullSci || without,
      scientificNameWithoutAuthor: without,
      scientificNameAuthorship: auth,
      commonNames,
      genus: pickGenusName(sp.genus),
      family: pickFamilyName(sp.family),
    });
    if (predictions.length >= 32) break;
  }
  return {
    predictions,
    bestMatch: asOptionalText(data?.bestMatch),
    version: asOptionalText(data?.version),
    remainingIdentificationRequests: typeof data?.remainingIdentificationRequests === 'number'
      ? data.remainingIdentificationRequests
      : null,
  };
}

/**
 * Identification Pl@ntNet (multipart) — même garde d’environnement que l’ancien module autofill.
 * @param {object} params
 * @param {Array<{ organ: string, imageData: string }>} params.images
 * @param {string} [params.project]
 * @param {number} [params.nbResults]
 * @param {string} [params.lang]
 * @param {typeof fetch} [params.fetchImpl]
 * @param {number} [params.timeoutMs]
 * @returns {Promise<{ ok: true, data: ReturnType<typeof normalizePlantnetIdentifyResponse> }|{ ok: false, error: string, httpStatus?: number }>}
 */
async function plantnetIdentifyFromImages(params = {}) {
  if (!isPlantnetAutofillEnabled()) {
    return { ok: false, error: 'Pl@ntNet désactivé (SPECIES_AUTOFILL_PLANTNET=1 et PLANTNET_API_KEY requis).' };
  }
  const apiKey = asTrimmedString(process.env.PLANTNET_API_KEY);
  const list = Array.isArray(params.images) ? params.images : [];
  if (list.length === 0 || list.length > MAX_IDENTIFY_IMAGES) {
    return { ok: false, error: `Indiquez entre 1 et ${MAX_IDENTIFY_IMAGES} images.` };
  }

  const project = asTrimmedString(params.project)
    || asTrimmedString(process.env.PLANTNET_PROJECT)
    || 'all';
  const lang = asTrimmedString(params.lang) || asTrimmedString(process.env.PLANTNET_LANG) || 'fr';
  const nbResultsRaw = Number(params.nbResults);
  const nbResults = Number.isFinite(nbResultsRaw)
    ? Math.min(20, Math.max(1, Math.floor(nbResultsRaw)))
    : 10;

  const fetchImpl = params.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') {
    return { ok: false, error: 'fetch indisponible' };
  }

  let totalBytes = 0;
  const parts = [];
  for (let i = 0; i < list.length; i += 1) {
    const entry = list[i] || {};
    const organ = asTrimmedString(entry.organ).toLowerCase() || 'auto';
    if (!PLANTNET_IDENTIFY_ORGANS.has(organ)) {
      return { ok: false, error: `Organe invalide pour l’image ${i + 1} : ${organ}` };
    }
    const decoded = decodeImageDataToBuffer(entry.imageData);
    if (!decoded) {
      return { ok: false, error: `Image ${i + 1} : données image invalides ou trop volumineuses.` };
    }
    totalBytes += decoded.buffer.length;
    if (totalBytes > MAX_TOTAL_DECODED_BYTES) {
      return { ok: false, error: 'Volume total des images trop important.' };
    }
    parts.push({ organ, ...decoded });
  }

  const timeoutMs = resolveFetchTimeoutMs(params);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  const query = new URLSearchParams();
  query.set('api-key', apiKey);
  query.set('nb-results', String(nbResults));
  query.set('lang', lang.slice(0, 8));

  const url = `https://my-api.plantnet.org/v2/identify/${encodeURIComponent(project)}?${query.toString()}`;

  try {
    const FormDataCtor = global.FormData;
    const BlobCtor = global.Blob;
    if (typeof FormDataCtor !== 'function' || typeof BlobCtor !== 'function') {
      return { ok: false, error: 'FormData/Blob indisponibles (Node 18+ requis).' };
    }
    const form = new FormDataCtor();
    for (const p of parts) {
      const ext = (p.contentType || '').includes('png') ? 'png' : 'jpg';
      const blob = new BlobCtor([p.buffer], { type: p.contentType || 'image/jpeg' });
      form.append('images', blob, `plant.${ext}`);
      form.append('organs', p.organ);
    }

    const res = await fetchImpl(url, {
      method: 'POST',
      body: form,
      signal: ac.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'ForetMap/1.0 (plantnet-identify)',
      },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = asOptionalText(json?.message) || asOptionalText(json?.error) || `HTTP ${res.status}`;
      logger.warn({ msg: 'plantnet_identify_http', status: res.status }, 'Pl@ntNet identify : HTTP en échec');
      return { ok: false, error: msg, httpStatus: res.status };
    }
    const data = normalizePlantnetIdentifyResponse(json);
    return { ok: true, data };
  } catch (err) {
    logger.warn({ msg: 'plantnet_identify_err', err: String(err?.message || err) }, 'Pl@ntNet identify : erreur');
    return { ok: false, error: asTrimmedString(err?.message) || 'Erreur réseau' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  isPlantnetAutofillEnabled,
  plantnetIdentifyFromImages,
  normalizePlantnetIdentifyResponse,
  decodeImageDataToBuffer,
  buildPlantnetQuotaTestUrl,
  PLANTNET_IDENTIFY_ORGANS,
  MAX_IDENTIFY_IMAGES,
};
