'use strict';

const logger = require('./logger');

/**
 * Complément LLM OpenAI — **désactivé par défaut** (`SPECIES_AUTOFILL_OPENAI` ≠ `1`).
 * Clé serveur uniquement (`OPENAI_API_KEY`), jamais exposée au navigateur.
 */

const OPENAI_ALLOWED_FIELD_KEYS = [
  'description',
  'second_name',
  'habitat',
  'nutrition',
  'longevity',
  'size',
  'ideal_temperature_c',
  'optimal_ph',
  'geographic_origin',
  'human_utility',
  'planting_recommendations',
  'harvest_part',
  'ecosystem_role',
  'preferred_nutrients',
  'reproduction',
  'agroecosystem_category',
];

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function isOpenAiAutofillEnabled() {
  const flag = asTrimmedString(process.env.SPECIES_AUTOFILL_OPENAI);
  const key = asTrimmedString(process.env.OPENAI_API_KEY);
  return flag === '1' && key.length > 0;
}

function resolveFetchTimeoutMs(options = {}) {
  if (typeof options.getTimeoutMs === 'function') {
    const n = Number(options.getTimeoutMs());
    if (!Number.isFinite(n)) return 8000;
    return Math.min(8000, Math.max(500, n));
  }
  const fallback = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 8000;
  return Math.min(8000, Math.max(500, fallback));
}

function stripJsonFence(text) {
  let t = asTrimmedString(text);
  if (!t) return '';
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  return t.trim();
}

function pickJsonObjectFromContent(content) {
  const raw = stripJsonFence(content);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sanitizeFields(obj) {
  const fields = {};
  if (!obj || typeof obj !== 'object') return fields;
  for (const key of OPENAI_ALLOWED_FIELD_KEYS) {
    let v = asTrimmedString(obj[key]);
    if (!v) continue;
    if (key === 'second_name' && v.length > 118) v = `${v.slice(0, 115)}…`;
    fields[key] = v;
  }
  return fields;
}

/**
 * @param {{ query?: string, scientificName?: string|null, partialContext?: string|null }} ctx
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<object|null>}
 */
async function fetchOpenAiSpeciesTraits(ctx = {}, options = {}) {
  if (!isOpenAiAutofillEnabled()) return null;
  const apiKey = asTrimmedString(process.env.OPENAI_API_KEY);
  const model = asTrimmedString(process.env.SPECIES_AUTOFILL_OPENAI_MODEL) || 'gpt-4o-mini';
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') {
    logger.warn({ msg: 'species_autofill_openai_no_fetch' }, 'Pré-saisie OpenAI : fetch indisponible');
    return null;
  }

  const q = asTrimmedString(ctx.query);
  const sci = asTrimmedString(ctx.scientificName);
  const ctxSnippet = asTrimmedString(ctx.partialContext).slice(0, 3200);

  const system = [
    'Tu es un assistant pour compléter une fiche plante ou animal (lycée, France).',
    'Réponds uniquement par un objet JSON (pas de markdown).',
    `Clés autorisées (chaînes courtes, français) : ${OPENAI_ALLOWED_FIELD_KEYS.join(', ')}.`,
    'N\'invente pas de faits précis non présents dans le contexte fourni ; laisse absent ou chaîne vide les champs incertains.',
    'Pour second_name : un seul nom vernaculaire français, uniquement s\'il figure explicitement dans le contexte (libellé, liste de noms, Wikipedia) — sinon laisse vide.',
    'Priorité : combler habitat, culture (agroecosystem_category), plantation, nutriments, rôle écologique, reproduction, récolte — seulement si le contexte ou le nom scientifique le suggère clairement.',
    'Pas de clés hors liste ; pas de tableaux imbriqués.',
  ].join(' ');

  const userPayload = JSON.stringify({
    query: q,
    scientific_name: sci || null,
    contexte_resume: ctxSnippet || null,
  });

  const timeoutMs = resolveFetchTimeoutMs(options);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    logger.info(
      {
        msg: 'species_autofill_openai_request',
        model,
        queryLen: q.length,
        contextLen: ctxSnippet.length,
      },
      'Pré-saisie OpenAI : requête',
    );
    const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ac.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPayload },
        ],
      }),
    });
    if (!res.ok) {
      logger.warn({ msg: 'species_autofill_openai_http', status: res.status }, 'Pré-saisie OpenAI : HTTP en échec');
      return null;
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = pickJsonObjectFromContent(content);
    const fields = sanitizeFields(parsed?.fields && typeof parsed.fields === 'object' ? parsed.fields : parsed);
    if (Object.keys(fields).length === 0) {
      logger.warn({ msg: 'species_autofill_openai_empty' }, 'Pré-saisie OpenAI : JSON vide ou non mappé');
      return null;
    }
    return {
      source: 'openai',
      confidence: 0.22,
      source_url: null,
      fields,
      photos: [],
      warnings: [
        'Suggestion produite par un modèle de langage (OpenAI) : vérifier les informations avant publication.',
      ],
    };
  } catch (err) {
    logger.warn(
      { msg: 'species_autofill_openai_error', err: String(err?.message || err) },
      'Pré-saisie OpenAI : erreur',
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  fetchOpenAiSpeciesTraits,
  isOpenAiAutofillEnabled,
  OPENAI_ALLOWED_FIELD_KEYS,
};
