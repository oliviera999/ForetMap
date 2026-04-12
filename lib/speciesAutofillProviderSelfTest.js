'use strict';

const logger = require('./logger');
const { isPlantnetAutofillEnabled } = require('./speciesAutofillPlantnet');
const { isOpenAiAutofillEnabled } = require('./speciesAutofillOpenAi');

const TEST_BINOMIAL = 'Solanum lycopersicum';

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

/** Aligné sur `speciesAutofillPlantnet.js` pour le paramètre `authorship` de l’URL d’align. */
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

function buildPlantnetAlignTestUrl() {
  const apiKey = asTrimmedString(process.env.PLANTNET_API_KEY);
  if (!apiKey) return null;
  const project = asTrimmedString(process.env.PLANTNET_PROJECT) || 'k-world-flora';
  const lang = asTrimmedString(process.env.PLANTNET_LANG) || 'fr';
  const alignBase = `https://my-api.plantnet.org/v2/projects/${encodeURIComponent(project)}/species/align`;
  const name = TEST_BINOMIAL;
  const authorship = nameLikelyHasBotanicalAuthorship(name) ? 'true' : 'false';
  return `${alignBase}?api-key=${encodeURIComponent(apiKey)}&name=${encodeURIComponent(name)}&authorship=${authorship}&synonyms=true&lang=${encodeURIComponent(lang)}`;
}

/**
 * Auto-test minimal des fournisseurs pré-saisie (clés lues depuis `process.env`).
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, plantnet: object, openai: object }>}
 */
async function runSpeciesAutofillProviderSelfTest(options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  const timeoutMs = Math.min(8000, Math.max(2000, Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 4500));

  const plantnetKeyPresent = asTrimmedString(process.env.PLANTNET_API_KEY).length > 0;
  const plantnetFlagOn = asTrimmedString(process.env.SPECIES_AUTOFILL_PLANTNET) === '1';
  const plantnetConfigured = isPlantnetAutofillEnabled();

  const openaiKeyPresent = asTrimmedString(process.env.OPENAI_API_KEY).length > 0;
  const openaiFlagOn = asTrimmedString(process.env.SPECIES_AUTOFILL_OPENAI) === '1';
  const openaiConfigured = isOpenAiAutofillEnabled();

  const plantnet = {
    configuredForAutofill: plantnetConfigured,
    keyPresent: plantnetKeyPresent,
    moduleFlagOn: plantnetFlagOn,
    tested: false,
    ok: null,
    httpStatus: null,
    latencyMs: null,
    message: '',
    error: null,
  };

  if (!plantnetKeyPresent) {
    plantnet.message = 'Aucune clé PLANTNET_API_KEY dans l’environnement du processus.';
  } else {
    plantnet.tested = true;
    const url = buildPlantnetAlignTestUrl();
    if (!url) {
      plantnet.ok = false;
      plantnet.error = 'URL Pl@ntNet invalide';
    } else if (typeof fetchImpl !== 'function') {
      plantnet.ok = false;
      plantnet.error = 'fetch indisponible';
    } else {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      const t0 = Date.now();
      try {
        const res = await fetchImpl(url, {
          method: 'GET',
          signal: ac.signal,
          headers: {
            accept: 'application/json',
            'user-agent': 'ForetMap/1.0 (species-autofill-selftest)',
          },
        });
        plantnet.latencyMs = Date.now() - t0;
        plantnet.httpStatus = res.status;
        plantnet.ok = res.ok;
        if (res.ok) {
          plantnet.message = plantnetConfigured
            ? 'Align Pl@ntNet OK (réponse HTTP 2xx).'
            : 'HTTP OK — activer SPECIES_AUTOFILL_PLANTNET=1 pour la pré-saisie.';
        } else {
          plantnet.error = `HTTP ${res.status}`;
        }
      } catch (err) {
        plantnet.latencyMs = Date.now() - t0;
        plantnet.ok = false;
        plantnet.error = asTrimmedString(err?.message) || 'Erreur réseau';
      } finally {
        clearTimeout(timer);
      }
    }
  }

  const openai = {
    configuredForAutofill: openaiConfigured,
    keyPresent: openaiKeyPresent,
    moduleFlagOn: openaiFlagOn,
    tested: false,
    ok: null,
    httpStatus: null,
    latencyMs: null,
    message: '',
    error: null,
  };

  if (!openaiKeyPresent) {
    openai.message = 'Aucune clé OPENAI_API_KEY dans l’environnement du processus.';
  } else {
    openai.tested = true;
    const apiKey = asTrimmedString(process.env.OPENAI_API_KEY);
    const modelsUrl = 'https://api.openai.com/v1/models?limit=1';
    if (typeof fetchImpl !== 'function') {
      openai.ok = false;
      openai.error = 'fetch indisponible';
    } else {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      const t0 = Date.now();
      try {
        const res = await fetchImpl(modelsUrl, {
          method: 'GET',
          signal: ac.signal,
          headers: {
            authorization: `Bearer ${apiKey}`,
            'user-agent': 'ForetMap/1.0 (species-autofill-selftest)',
          },
        });
        openai.latencyMs = Date.now() - t0;
        openai.httpStatus = res.status;
        openai.ok = res.ok;
        if (res.ok) {
          openai.message = openaiConfigured
            ? 'Clé OpenAI valide (liste modèles HTTP 2xx).'
            : 'HTTP OK — activer SPECIES_AUTOFILL_OPENAI=1 pour la pré-saisie.';
        } else {
          openai.error = `HTTP ${res.status}`;
        }
      } catch (err) {
        openai.latencyMs = Date.now() - t0;
        openai.ok = false;
        openai.error = asTrimmedString(err?.message) || 'Erreur réseau';
      } finally {
        clearTimeout(timer);
      }
    }
  }

  const ok =
    (!plantnet.tested || plantnet.ok === true)
    && (!openai.tested || openai.ok === true);

  logger.info(
    {
      msg: 'species_autofill_provider_selftest',
      ok,
      plantnetHttp: plantnet.httpStatus,
      plantnetMs: plantnet.latencyMs,
      openaiHttp: openai.httpStatus,
      openaiMs: openai.latencyMs,
    },
    'Auto-test fournisseurs pré-saisie (admin)',
  );

  return { ok, plantnet, openai };
}

module.exports = {
  runSpeciesAutofillProviderSelfTest,
  buildPlantnetAlignTestUrl,
};
