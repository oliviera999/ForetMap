'use strict';

const logger = require('./logger');
const { isPlantnetAutofillEnabled, buildPlantnetQuotaTestUrl } = require('./speciesAutofillPlantnet');
const { isOpenAiAutofillEnabled } = require('./speciesAutofillOpenAi');

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

/**
 * Auto-test minimal des fournisseurs pré-saisie / extensions (clés lues depuis `process.env`).
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
    const url = buildPlantnetQuotaTestUrl();
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
            ? 'Quota Pl@ntNet OK (réponse HTTP 2xx).'
            : 'HTTP OK — activer SPECIES_AUTOFILL_PLANTNET=1 pour l’identification par image.';
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
};
