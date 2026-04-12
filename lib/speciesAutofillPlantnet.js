'use strict';

const logger = require('./logger');

/**
 * Pl@ntNet API (https://my.plantnet.org/) — **désactivé par défaut**.
 * Nécessite `PLANTNET_API_KEY` et `SPECIES_AUTOFILL_PLANTNET=1`.
 *
 * Pipeline :
 * 1) `GET …/species/align` (synonymes, langue, authorship) → nom accepté, famille, genre, IDs externes ;
 * 2) `GET …/species?prefix=…&images=true` (optionnel) → noms vernaculaires + illustrations par organe
 *    (les images peuvent exiger un plan « pro » : en cas d’échec ou de liste vide, on conserve l’alignement).
 */

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

function resolveFetchTimeoutMs(options = {}) {
  if (typeof options.getTimeoutMs === 'function') {
    const n = Number(options.getTimeoutMs());
    if (!Number.isFinite(n)) return 5200;
    return Math.min(5200, Math.max(200, n));
  }
  return Math.min(5200, Math.max(200, Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 6000));
}

/** Extrait « Genre espèce » depuis un épithète binominal « Genre espèce Auteur ». */
function binomialFromAcceptedName(acceptedName) {
  const raw = asTrimmedString(acceptedName);
  if (!raw) return '';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  let i = 0;
  if (parts[0] === '×' || parts[0].startsWith('×')) {
    if (parts.length >= 3) return `${parts[0]}${parts[0] === '×' ? ' ' : ''}${parts[1]} ${parts[2]}`.replace(/^×\s*/, '× ');
    return raw;
  }
  if (parts.length >= 2) return `${parts[0]} ${parts[1]}`;
  return parts[0];
}

function normalizeBinomialKey(name) {
  return asTrimmedString(name).toLowerCase().replace(/\s+/g, ' ');
}

function nameLikelyHasBotanicalAuthorship(name) {
  const s = asTrimmedString(name);
  if (!s) return false;
  if (process.env.PLANTNET_ALIGN_AUTHORSHIP === '1') return true;
  if (process.env.PLANTNET_ALIGN_AUTHORSHIP === '0') return false;
  const parts = s.split(/\s+/);
  if (parts.length < 3) return false;
  const last = parts[parts.length - 1];
  return /^[A-Z][a-z0-9.]+$/.test(last) || /^[A-Z]\.$/.test(last);
}

function pickCommonNameForLang(commonNames, lang) {
  const list = Array.isArray(commonNames) ? commonNames.map((x) => asTrimmedString(x)).filter(Boolean) : [];
  if (!list.length) return null;
  const lc = asTrimmedString(lang).toLowerCase() || 'fr';
  if (lc.startsWith('fr')) {
    const frHint = (s) => /[àâäéèêëïîôùûüçœæ]/i.test(s) || /\b(l'|d'|de la |des |le |la |les |du |au )\b/i.test(` ${s} `);
    const scored = list.map((s) => ({ s, score: frHint(s) ? 2 : 0 }));
    scored.sort((a, b) => b.score - a.score);
    if (scored[0].score > 0) return scored[0].s;
  }
  return list[0];
}

function mapOrganToPhotoField(organ) {
  const o = asTrimmedString(organ).toLowerCase();
  if (o === 'flower' || o === 'inflorescence') return 'photo_flower';
  if (o === 'leaf') return 'photo_leaf';
  if (o === 'fruit' || o === 'seed') return 'photo_fruit';
  if (o === 'bark' || o === 'habit' || o === 'branch' || o === 'whole' || o === 'other' || !o) return 'photo_species';
  return 'photo_species';
}

function pickImageUrl(imageBlock) {
  if (!imageBlock || typeof imageBlock !== 'object') return null;
  const u = imageBlock.url && typeof imageBlock.url === 'object' ? imageBlock.url : imageBlock;
  const medium = asOptionalText(u.m || u.M);
  const orig = asOptionalText(u.o || u.O);
  const small = asOptionalText(u.s || u.S);
  return medium || orig || small;
}

function pickSpeciesRow(rows, binomialKey) {
  if (!Array.isArray(rows) || !binomialKey) return null;
  const want = normalizeBinomialKey(binomialKey);
  const exact = rows.find((row) => {
    const w = asOptionalText(row?.scientificNameWithoutAuthor);
    return w && normalizeBinomialKey(w) === want;
  });
  if (exact) return exact;
  if (rows.length === 1 && rows[0] && typeof rows[0] === 'object') return rows[0];
  return null;
}

function shouldSkipSpeciesImagesFetch() {
  return asTrimmedString(process.env.SPECIES_AUTOFILL_PLANTNET_NO_IMAGES) === '1';
}

/**
 * @param {string|null|undefined} scientificName
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<object|null>}
 */
async function fetchPlantnetSpeciesTraits(scientificName, options = {}) {
  if (!isPlantnetAutofillEnabled()) return null;
  const apiKey = asTrimmedString(process.env.PLANTNET_API_KEY);
  const name = asTrimmedString(scientificName);
  if (!name) return null;

  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') return null;

  const project = asTrimmedString(process.env.PLANTNET_PROJECT) || 'k-world-flora';
  const lang = asTrimmedString(process.env.PLANTNET_LANG) || 'fr';
  const alignBase = `https://my-api.plantnet.org/v2/projects/${encodeURIComponent(project)}/species/align`;

  const budgetMs = resolveFetchTimeoutMs(options);
  const alignTimeout = Math.min(4800, Math.max(400, Math.floor(budgetMs * 0.55)));
  const speciesTimeout = Math.min(4000, Math.max(300, budgetMs - alignTimeout - 80));

  const acAlign = new AbortController();
  const tAlign = setTimeout(() => acAlign.abort(), alignTimeout);
  let data;
  try {
    const authorship = nameLikelyHasBotanicalAuthorship(name) ? 'true' : 'false';
    /** `lang` sur align a été retiré (API v2 : paramètre refusé, HTTP 400). `PLANTNET_LANG` sert encore à `…/species` et au choix du vernaculaire. */
    const alignUrl = `${alignBase}?api-key=${encodeURIComponent(apiKey)}&name=${encodeURIComponent(name)}&authorship=${authorship}&synonyms=true`;
    const res = await fetchImpl(alignUrl, {
      method: 'GET',
      signal: acAlign.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'ForetMap/1.0 (species-autofill)',
      },
    });
    data = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger.warn({ msg: 'plantnet_autofill_http', status: res.status }, 'Pré-saisie PlantNet : HTTP en échec (align)');
      return null;
    }
  } catch (err) {
    logger.warn({ msg: 'plantnet_autofill_err', err: String(err?.message || err) }, 'Pré-saisie PlantNet : erreur (align)');
    return null;
  } finally {
    clearTimeout(tAlign);
  }

  const match = data?.bestMatch && typeof data.bestMatch === 'object' ? data.bestMatch : data;
  const accepted = asOptionalText(match?.acceptedName || data?.acceptedName || match?.matchingName || data?.matchingName);
  const family = asOptionalText(match?.family || data?.family);
  const genus = asOptionalText(match?.genus || data?.genus);
  const legacyCommon = asOptionalText(match?.commonName || match?.common_name || data?.commonName);

  const fields = {};
  const photos = [];
  const warnings = ['Pl@ntNet : suggestions issues du référentiel projet — vérifier avant publication.'];

  const binomial = accepted ? binomialFromAcceptedName(accepted) : binomialFromAcceptedName(name);
  const binomialKey = normalizeBinomialKey(binomial);

  if (legacyCommon && legacyCommon.length < 120) fields.second_name = legacyCommon;
  if (family && family.length < 200) fields.group_3 = family;
  if (genus && genus.length < 120) fields.group_4 = genus;

  if (accepted && normalizeBinomialKey(name) !== normalizeBinomialKey(accepted)) {
    if (accepted.length < 200) fields.scientific_name = accepted;
  }

  const sourceUrl = `${alignBase}`;

  if (!shouldSkipSpeciesImagesFetch() && binomial && speciesTimeout >= 250) {
    const speciesListUrl = `https://my-api.plantnet.org/v2/projects/${encodeURIComponent(project)}/species?api-key=${encodeURIComponent(apiKey)}&prefix=${encodeURIComponent(binomial)}&images=true&pageSize=8&page=1&lang=${encodeURIComponent(lang)}`;
    const acSp = new AbortController();
    const tSp = setTimeout(() => acSp.abort(), speciesTimeout);
    try {
      const res2 = await fetchImpl(speciesListUrl, {
        method: 'GET',
        signal: acSp.signal,
        headers: {
          accept: 'application/json',
          'user-agent': 'ForetMap/1.0 (species-autofill)',
        },
      });
      const rows = await res2.json().catch(() => []);
      if (!res2.ok) {
        if (res2.status === 402 || res2.status === 403) {
          warnings.push('Pl@ntNet : illustrations indisponibles (quota ou offre « pro ») — noms et taxonomie conservés.');
        } else {
          logger.warn({ msg: 'plantnet_autofill_http', status: res2.status }, 'Pré-saisie PlantNet : HTTP en échec (species)');
        }
      } else if (Array.isArray(rows)) {
        const row = pickSpeciesRow(rows, binomialKey);
        if (row) {
          const vern = pickCommonNameForLang(row.commonNames, lang);
          if (vern && vern.length < 120) fields.second_name = vern;

          const iucn = asOptionalText(row.iucnCategory);
          if (iucn && iucn.length < 12) {
            fields.ecosystem_role = `Catégorie UICN (Pl@ntNet) : ${iucn} — indicatif, à recouper.`;
          }

          const imgs = Array.isArray(row.images) ? row.images : [];
          const seen = new Set();
          for (const im of imgs) {
            const url = pickImageUrl(im);
            if (!url || !/^https:\/\//i.test(url)) continue;
            if (seen.has(url)) continue;
            seen.add(url);
            const field = mapOrganToPhotoField(im?.organ);
            const credit = asOptionalText(im?.citation) || asOptionalText(im?.author) || 'Pl@ntNet';
            const license = asOptionalText(im?.license);
            photos.push({
              field,
              url,
              license,
              credit,
              source_url: sourceUrl,
              source: 'plantnet',
              confidence: 0.58,
            });
            if (photos.length >= 12) break;
          }
        }
      }
    } catch (err) {
      logger.warn({ msg: 'plantnet_autofill_err', err: String(err?.message || err) }, 'Pré-saisie PlantNet : erreur (species/images)');
    } finally {
      clearTimeout(tSp);
    }
  }

  if (Object.keys(fields).length === 0 && photos.length === 0) return null;

  const fieldConfidence = photos.length > 0 ? 0.46 : 0.42;

  return {
    source: 'plantnet',
    confidence: fieldConfidence,
    source_url: sourceUrl,
    fields,
    photos,
    warnings,
  };
}

module.exports = {
  fetchPlantnetSpeciesTraits,
  isPlantnetAutofillEnabled,
};
