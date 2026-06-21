'use strict';

const logger = require('./logger');

/**
 * Complément LLM OpenAI — **désactivé par défaut** (`SPECIES_AUTOFILL_OPENAI` ≠ `1`).
 * Clé serveur uniquement (`OPENAI_API_KEY`), jamais exposée au navigateur.
 */

const OPENAI_ALLOWED_FIELD_KEYS = [
  'name',
  'scientific_name',
  'description',
  'second_name',
  'group_1',
  'group_2',
  'group_3',
  'group_4',
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

/** Au-dessous de ce seuil, le contexte agrégé (Wikipedia, GBIF…) est jugé trop court : consignes assouplies pour éviter un JSON vide sur des requêtes courantes (« aubergine », « basilic »…). */
const OPENAI_LOW_CONTEXT_MAX_CHARS = 420;

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

function extractResponsesTextPayload(payload) {
  if (payload == null) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload?.text === 'string') return payload.text;
  if (typeof payload?.text?.value === 'string') return payload.text.value;
  if (typeof payload?.content === 'string') return payload.content;
  return '';
}

function extractResponsesOutputText(data) {
  if (typeof data?.output_text === 'string') return data.output_text.trim();
  const chunks = [];
  const output = Array.isArray(data?.output) ? data.output : [];
  for (const item of output) {
    if (!item) continue;
    const parts = Array.isArray(item.content) ? item.content : [item];
    for (const part of parts) {
      const txt = extractResponsesTextPayload(part);
      if (txt) chunks.push(txt);
    }
  }
  return chunks.join('\n').trim();
}

async function requestOpenAiJsonObject({
  apiKey,
  model,
  systemPrompt,
  userPayload,
  temperature,
  fetchImpl,
  timeoutMs,
}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const out = {
    parsed: null,
    via: null,
    chatStatus: null,
    responsesStatus: null,
    error: null,
  };
  try {
    try {
      const chatRes = await fetchImpl('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: ac.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPayload },
          ],
        }),
      });
      out.chatStatus = Number(chatRes?.status) || null;
      if (chatRes.ok) {
        const chatData = await chatRes.json();
        const content = chatData?.choices?.[0]?.message?.content;
        const parsed = pickJsonObjectFromContent(content);
        if (parsed) {
          out.parsed = parsed;
          out.via = 'chat';
          return out;
        }
      }
    } catch (err) {
      out.error = String(err?.message || err);
    }

    const responsesRes = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: ac.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        max_output_tokens: 600,
        instructions: systemPrompt,
        input: userPayload,
      }),
    });
    out.responsesStatus = Number(responsesRes?.status) || null;
    if (!responsesRes.ok) return out;
    const responsesData = await responsesRes.json();
    const responsesText = extractResponsesOutputText(responsesData);
    const parsed = pickJsonObjectFromContent(responsesText);
    if (!parsed) return out;
    out.parsed = parsed;
    out.via = 'responses';
    return out;
  } catch (err) {
    out.error = out.error || String(err?.message || err);
    return out;
  } finally {
    clearTimeout(timer);
  }
}

function sanitizeFields(obj) {
  const fields = {};
  if (!obj || typeof obj !== 'object') return fields;
  for (const key of OPENAI_ALLOWED_FIELD_KEYS) {
    const v = sanitizeOpenAiFieldValue(key, obj[key]);
    if (!v) continue;
    fields[key] = v;
  }
  return fields;
}

function sanitizeFieldsForKeys(obj, allowedKeys) {
  const fields = {};
  const allow = new Set((allowedKeys || []).map((k) => asTrimmedString(k)).filter(Boolean));
  if (!obj || typeof obj !== 'object' || allow.size === 0) return fields;
  for (const key of OPENAI_ALLOWED_FIELD_KEYS) {
    if (!allow.has(key)) continue;
    const v = sanitizeOpenAiFieldValue(key, obj[key]);
    if (!v) continue;
    fields[key] = v;
  }
  return fields;
}

function uniqKeys(keys) {
  return Array.from(new Set((keys || []).map((k) => asTrimmedString(k)).filter(Boolean)));
}

function isUnknownLikeValue(value) {
  const v = asTrimmedString(value).toLowerCase();
  if (!v) return true;
  return (
    v === '?' ||
    v === 'n/a' ||
    v === 'na' ||
    v === 'none' ||
    v === 'unknown' ||
    v === 'inconnu' ||
    v === 'non renseigné' ||
    v === 'non-renseigne'
  );
}

function sanitizeTemperatureLike(value) {
  const raw = asTrimmedString(value).replace(/°\s*c/gi, '').replace(/\s+/g, ' ');
  if (!raw) return '';
  const simpleOrRange = /^-?\d+(?:[.,]\d+)?(?:\s*[-/]\s*-?\d+(?:[.,]\d+)?)?$/.test(raw);
  if (!simpleOrRange) return '';
  return raw;
}

function sanitizePhLike(value) {
  const raw = asTrimmedString(value)
    .replace(/^ph\s*/i, '')
    .replace(/\s+/g, ' ');
  if (!raw) return '';
  const simpleOrRange = /^\d+(?:[.,]\d+)?(?:\s*[-/]\s*\d+(?:[.,]\d+)?)?$/.test(raw);
  if (!simpleOrRange) return '';
  return raw;
}

function sanitizeOpenAiFieldValue(key, value) {
  let v = asTrimmedString(value);
  if (!v || isUnknownLikeValue(v)) return '';
  switch (key) {
    case 'name':
      if (v.length > 160) v = `${v.slice(0, 157)}…`;
      return v;
    case 'scientific_name':
      // Autorise binôme/trinôme latin + hybrides simples (x / ×).
      if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(v)) return '';
      if (!/^[A-ZÀ-ÖØ-Þ][\wÀ-ÖØ-öø-ÿ.-]*(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ×x.-]+){1,4}$/.test(v)) return '';
      if (v.length > 200) v = v.slice(0, 200);
      return v;
    case 'group_1':
    case 'group_2':
    case 'group_3':
    case 'group_4':
      if (v.length > 120) v = `${v.slice(0, 117)}…`;
      return v;
    case 'second_name':
      if (v.length > 118) v = `${v.slice(0, 115)}…`;
      return v;
    case 'ideal_temperature_c':
      return sanitizeTemperatureLike(v);
    case 'optimal_ph':
      return sanitizePhLike(v);
    default:
      return v;
  }
}

/**
 * Passe OpenAI ciblée : uniquement les clés encore vides côté agrégation (appelée depuis speciesAutofill).
 * @param {{ query?: string, scientificName?: string|null, partialContext?: string|null, keysToFill?: string[], knownFields?: object, hintName?: string|null, hintScientific?: string|null, allowGeneralKnowledge?: boolean }} ctx
 */
async function fetchOpenAiSpeciesGapFill(ctx = {}, options = {}) {
  if (!isOpenAiAutofillEnabled()) return null;
  const apiKey = asTrimmedString(process.env.OPENAI_API_KEY);
  const model = asTrimmedString(process.env.SPECIES_AUTOFILL_OPENAI_MODEL) || 'gpt-4o-mini';
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') return null;

  const keysToFill = uniqKeys(ctx.keysToFill).filter((k) => OPENAI_ALLOWED_FIELD_KEYS.includes(k));
  if (keysToFill.length === 0) return null;
  const allowGeneralKnowledge = ctx.allowGeneralKnowledge === true;

  const q = asTrimmedString(ctx.query);
  const sci = asTrimmedString(ctx.scientificName);
  const ctxSnippet = asTrimmedString(ctx.partialContext).slice(0, 3200);
  const known = ctx.knownFields && typeof ctx.knownFields === 'object' ? ctx.knownFields : {};

  const system = [
    'Tu complètes une fiche plante ou animal (lycée, France).',
    'Réponds uniquement par un objet JSON (pas de markdown).',
    `Inclus uniquement des clés parmi : ${keysToFill.join(', ')}. Omission ou chaîne vide si tu ne peux pas répondre sans inventer.`,
    "N'invente pas de faits précis sans lien avec le contexte fourni ou les champs déjà connus.",
    'Pour name/scientific_name/group_1..group_4 : renseigne seulement si la taxonomie est plausible avec la requête et le contexte ; sinon laisse vide.',
    "second_name : un seul nom vernaculaire français, seulement s'il figure explicitement dans le contexte ou les champs connus.",
    ...(allowGeneralKnowledge
      ? [
          'Contexte externe potentiellement absent : si le taxon est courant et identifiable par son nom (plante, insecte, oiseau, mammifère, champignon), tu peux proposer des formulations générales de niveau pédagogique pour les clés demandées.',
          'Évite les valeurs numériques précises non sourcées (température, pH, tailles exactes) ; privilégie des plages prudentes ou laisse vide.',
        ]
      : []),
    'Aucune autre clé que celles demandées.',
  ].join(' ');

  const userPayload = JSON.stringify({
    query: q,
    scientific_name: sci || null,
    indices_formulaire: {
      hint_name: asTrimmedString(ctx.hintName) || null,
      hint_scientific: asTrimmedString(ctx.hintScientific) || null,
    },
    champs_deja_connus: known,
    cles_a_remplir: keysToFill,
    contexte_resume: ctxSnippet || null,
  });

  const timeoutMs = resolveFetchTimeoutMs(options);
  try {
    logger.info(
      {
        msg: 'species_autofill_openai_gap_request',
        model,
        keysCount: keysToFill.length,
        queryLen: q.length,
      },
      'Pré-saisie OpenAI : passe « trous »',
    );
    const responsePack = await requestOpenAiJsonObject({
      apiKey,
      model,
      systemPrompt: system,
      userPayload,
      temperature: 0.25,
      fetchImpl,
      timeoutMs,
    });
    const parsed = responsePack.parsed;
    if (!parsed) {
      logger.warn(
        {
          msg: 'species_autofill_openai_gap_http',
          chatStatus: responsePack.chatStatus,
          responsesStatus: responsePack.responsesStatus,
          err: responsePack.error,
        },
        'Pré-saisie OpenAI (trous) : HTTP en échec',
      );
      return null;
    }
    const raw = parsed?.fields && typeof parsed.fields === 'object' ? parsed.fields : parsed;
    const fields = sanitizeFieldsForKeys(raw, keysToFill);
    if (Object.keys(fields).length === 0) {
      logger.warn(
        { msg: 'species_autofill_openai_gap_empty' },
        'Pré-saisie OpenAI (trous) : JSON vide',
      );
      return null;
    }
    return {
      source: 'openai_gap',
      fields,
      warnings: [
        'Complément OpenAI (champs vides uniquement) : vérifier chaque valeur avant publication.',
      ],
    };
  } catch (err) {
    logger.warn(
      { msg: 'species_autofill_openai_gap_error', err: String(err?.message || err) },
      'Pré-saisie OpenAI (trous) : erreur',
    );
    return null;
  }
}

/**
 * @param {{ query?: string, scientificName?: string|null, partialContext?: string|null, allowGeneralKnowledge?: boolean }} ctx
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
    logger.warn(
      { msg: 'species_autofill_openai_no_fetch' },
      'Pré-saisie OpenAI : fetch indisponible',
    );
    return null;
  }

  const q = asTrimmedString(ctx.query);
  const sci = asTrimmedString(ctx.scientificName);
  const ctxSnippet = asTrimmedString(ctx.partialContext).slice(0, 3200);
  const hintName = asTrimmedString(ctx.hintName);
  const hintScientific = asTrimmedString(ctx.hintScientific);
  const lowContextMode = ctxSnippet.length < OPENAI_LOW_CONTEXT_MAX_CHARS;
  const allowGeneralKnowledge = ctx.allowGeneralKnowledge === true;

  const systemParts = [
    'Tu es un assistant pour compléter une fiche plante ou animal (lycée, France).',
    'Réponds uniquement par un objet JSON (pas de markdown).',
    `Clés autorisées (chaînes courtes, français) : ${OPENAI_ALLOWED_FIELD_KEYS.join(', ')}.`,
    'Pas de clés hors liste ; pas de tableaux imbriqués.',
    'Pour name/scientific_name/group_1..group_4 : ne remplir que si cohérent avec la requête et/ou les indices taxonomiques.',
  ];
  if (lowContextMode) {
    systemParts.push(
      'Contexte documentaire agrégé **court ou absent** (souvent une seule requête vernaculaire). Active le mode **indicatif pédagogique** : pour une plante potagère, aromatique ou fruitière **courante** en France métropolitaine dont le nom figure dans la requête ou les indices (ex. tomate, aubergine, courgette, basilic), tu peux remplir plusieurs champs autorisés avec des formulations **générales** de manuel scolaire (culture maraîchère, besoins typiques, cycle de culture simplifié, partie comestible usuelle, rôle écologique très générique).',
      "N'invente **pas** de valeurs chiffrées précises pour la température ou le pH (laisse ces champs absents ou vides si tu n'as pas de chiffres fournis dans le JSON utilisateur). Évite les aires géographiques très détaillées si incertain.",
      "Pour second_name : un seul nom vernaculaire, uniquement si c'est un **synonyme évident** par rapport au texte fourni (requête ou indices) ; sinon laisse vide.",
    );
    if (allowGeneralKnowledge) {
      systemParts.push(
        'Extension du mode indicatif : quand la requête vise un organisme non végétal courant (insecte, oiseau, mammifère, champignon…), tu peux aussi proposer une description d’identification, un habitat et des informations biologiques **générales** (nutrition, longévité, reproduction, taille) avec prudence.',
        'Si le rang taxonomique exact est incertain, renseigne des groupes larges (ex. Animalia, Arthropoda, Insecta) plutôt que des niveaux trop spécifiques.',
      );
    }
  } else {
    systemParts.push(
      "N'invente pas de faits précis non présents dans le contexte fourni ; laisse absent ou chaîne vide les champs incertains.",
      "Pour second_name : un seul nom vernaculaire français, uniquement s'il figure explicitement dans le contexte (libellé, liste de noms, Wikipedia) — sinon laisse vide.",
      'Priorité : combler habitat, culture (agroecosystem_category), plantation, nutriments, rôle écologique, reproduction, récolte — seulement si le contexte ou le nom scientifique le suggère clairement.',
    );
  }
  const system = systemParts.join(' ');

  const userPayload = JSON.stringify({
    query: q,
    scientific_name: sci || null,
    indices_formulaire: {
      hint_name: hintName || null,
      hint_scientific: hintScientific || null,
    },
    contexte_resume: ctxSnippet || null,
    mode_contexte: lowContextMode ? 'court_indicatif' : 'agrege',
  });

  const timeoutMs = resolveFetchTimeoutMs(options);
  try {
    logger.info(
      {
        msg: 'species_autofill_openai_request',
        model,
        queryLen: q.length,
        contextLen: ctxSnippet.length,
        lowContextMode,
      },
      'Pré-saisie OpenAI : requête',
    );
    const responsePack = await requestOpenAiJsonObject({
      apiKey,
      model,
      systemPrompt: system,
      userPayload,
      temperature: lowContextMode ? 0.33 : 0.2,
      fetchImpl,
      timeoutMs,
    });
    if (!responsePack.parsed) {
      logger.warn(
        {
          msg: 'species_autofill_openai_http',
          chatStatus: responsePack.chatStatus,
          responsesStatus: responsePack.responsesStatus,
          err: responsePack.error,
        },
        'Pré-saisie OpenAI : HTTP en échec',
      );
      return null;
    }
    const parsed = responsePack.parsed;
    const fields = sanitizeFields(
      parsed?.fields && typeof parsed.fields === 'object' ? parsed.fields : parsed,
    );
    if (Object.keys(fields).length === 0) {
      logger.warn(
        { msg: 'species_autofill_openai_empty' },
        'Pré-saisie OpenAI : JSON vide ou non mappé',
      );
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
        ...(lowContextMode
          ? [
              'Contexte externe limité : propositions en mode indicatif pédagogique — recouper avec des sources taxonomiques (GBIF, Wikidata…) si possible.',
            ]
          : []),
      ],
    };
  } catch (err) {
    logger.warn(
      { msg: 'species_autofill_openai_error', err: String(err?.message || err) },
      'Pré-saisie OpenAI : erreur',
    );
    return null;
  }
}

module.exports = {
  fetchOpenAiSpeciesTraits,
  fetchOpenAiSpeciesGapFill,
  isOpenAiAutofillEnabled,
  OPENAI_ALLOWED_FIELD_KEYS,
};
