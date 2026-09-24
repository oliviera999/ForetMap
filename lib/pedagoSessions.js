'use strict';

/**
 * Séances pédagogiques ForetMap — validation des actions et résolution config → étapes.
 * Les templates A/B orchestrent les onglets existants (clé, fiche, réseau, quiz).
 */

const ACTION_TYPES = new Set([
  'message',
  'open_id_key',
  'open_plant',
  'open_foodweb',
  'open_quiz',
  'open_glossary',
  'open_individual',
  'open_nested_groups',
  'open_map_route',
]);

const TEMPLATE_KEYS = new Set([
  'college_reconaitre',
  'college_qui_mange',
  'lycee_arbre',
  'lycee_classer',
  'custom',
]);

const TEMPLATE_DEFAULT_TITLES = Object.freeze({
  college_reconaitre: 'Reconnaître sans toucher',
  college_qui_mange: 'Qui mange qui sur le site',
  lycee_arbre: 'Un arbre qui grandit',
  lycee_classer: 'Classer pour de vrai',
  custom: 'Nouvelle séance',
});

const TEMPLATE_LEVELS = Object.freeze({
  lycee_arbre: 'lycee',
  lycee_classer: 'lycee',
});

const MAX_PLANT_IDS = 6;
const LEVELS = new Set(['college', 'lycee', 'universite']);

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{1,118}$/i;

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function normalizeOptionalString(raw, max = 255) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function normalizeOptionalInt(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function normalizePlantIds(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const id = normalizeOptionalInt(item);
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_PLANT_IDS) break;
  }
  return out;
}

/**
 * @returns {{ ok: true, type: string, payload: object } | { ok: false, error: string }}
 */
function validateAction(action) {
  if (!isPlainObject(action)) return { ok: false, error: 'action invalide' };
  const type = normalizeOptionalString(action.type, 40);
  if (!type || !ACTION_TYPES.has(type)) {
    return { ok: false, error: `action.type inconnu (${type || 'vide'})` };
  }
  const payload = isPlainObject(action.payload) ? { ...action.payload } : {};
  return { ok: true, type, payload };
}

/**
 * @returns {{ ok: true, steps: object[] } | { ok: false, error: string }}
 */
function validateSteps(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: 'steps doit être un tableau non vide' };
  }
  if (raw.length > 40) return { ok: false, error: 'trop d’étapes (max 40)' };
  const steps = [];
  for (let i = 0; i < raw.length; i += 1) {
    const row = raw[i];
    if (!isPlainObject(row)) {
      return { ok: false, error: `étape ${i + 1} invalide` };
    }
    const id = normalizeOptionalString(row.id, 64) || `step-${i + 1}`;
    const title = normalizeOptionalString(row.title, 180) || `Étape ${i + 1}`;
    const body = normalizeOptionalString(row.body, 4000) || '';
    const actionCheck = validateAction(row.action);
    if (!actionCheck.ok) {
      return { ok: false, error: `étape ${i + 1} : ${actionCheck.error}` };
    }
    const completeWhen = normalizeOptionalString(row.completeWhen, 32) || 'manual';
    if (completeWhen !== 'manual') {
      return { ok: false, error: `étape ${i + 1} : completeWhen non supporté (${completeWhen})` };
    }
    steps.push({
      id,
      title,
      body,
      action: { type: actionCheck.type, payload: actionCheck.payload },
      completeWhen,
    });
  }
  return { ok: true, steps };
}

/**
 * Normalise la config prof (carte / clé / plantes / quiz) sans toucher à la structure des étapes.
 */
function normalizeConfig(raw) {
  const src = isPlainObject(raw) ? raw : {};
  const plantIds = normalizePlantIds(src.plantIds);
  const plantId = normalizeOptionalInt(src.plantId) || plantIds[0] || null;
  return {
    mapId: normalizeOptionalString(src.mapId, 32),
    keyIdOrSlug: normalizeOptionalString(src.keyIdOrSlug, 120),
    plantId,
    plantIds,
    questionCode: normalizeOptionalString(src.questionCode, 32),
    notionId: normalizeOptionalString(src.notionId, 64),
    notionNiveau: normalizeOptionalString(src.notionNiveau, 32),
    termCode: normalizeOptionalString(src.termCode, 64),
    highlightPlantId: normalizeOptionalInt(src.highlightPlantId),
    individualId: normalizeOptionalInt(src.individualId),
    mapRouteSlug: normalizeOptionalString(src.mapRouteSlug, 120),
    requiresSessionId: normalizeOptionalString(src.requiresSessionId, 64),
  };
}

/**
 * Fusionne la config de séance dans les payloads d’action (placeholders / index plantes).
 * Modèles figés : la config du prof l'emporte. Séance libre (`payloadFirst`) : chaque étape
 * porte ses propres cibles, la config ne sert que de valeur par défaut.
 */
function resolveSteps(steps, config, { payloadFirst = false } = {}) {
  const cfg = normalizeConfig(config);
  const pick = (cfgValue, payloadValue) =>
    (payloadFirst ? payloadValue || cfgValue : cfgValue || payloadValue) || null;
  return (Array.isArray(steps) ? steps : []).map((step) => {
    const type = step?.action?.type;
    const payload = { ...(step?.action?.payload || {}) };
    if (type === 'open_id_key') {
      payload.keyIdOrSlug = pick(cfg.keyIdOrSlug, payload.keyIdOrSlug);
    } else if (type === 'open_plant') {
      const idx = Number(payload.plantIndex);
      if (Number.isInteger(idx) && idx >= 0 && cfg.plantIds.length > idx) {
        payload.plantId = cfg.plantIds[idx];
      } else {
        payload.plantId = pick(cfg.plantId, normalizeOptionalInt(payload.plantId));
      }
      delete payload.plantIndex;
    } else if (type === 'open_foodweb') {
      payload.mapId = pick(cfg.mapId, payload.mapId);
      payload.highlightPlantId =
        pick(cfg.highlightPlantId, normalizeOptionalInt(payload.highlightPlantId)) ||
        cfg.plantIds[0] ||
        null;
    } else if (type === 'open_quiz') {
      payload.questionCode = pick(cfg.questionCode, payload.questionCode);
      payload.notionId = pick(cfg.notionId, payload.notionId);
      payload.notionNiveau = pick(cfg.notionNiveau, payload.notionNiveau);
    } else if (type === 'open_glossary') {
      payload.termCode = pick(cfg.termCode, payload.termCode);
    } else if (type === 'open_individual') {
      payload.individualId = pick(cfg.individualId, normalizeOptionalInt(payload.individualId));
      payload.mapId = pick(cfg.mapId, payload.mapId);
    } else if (type === 'open_nested_groups') {
      const own = normalizePlantIds(payload.plantIds);
      payload.plantIds = payloadFirst
        ? own.length
          ? own
          : cfg.plantIds
        : cfg.plantIds.length
          ? cfg.plantIds
          : own;
      payload.mapId = pick(cfg.mapId, payload.mapId);
    } else if (type === 'open_map_route') {
      payload.routeSlug = pick(cfg.mapRouteSlug, payload.routeSlug);
      payload.mapId = pick(cfg.mapId, payload.mapId);
    }
    return {
      id: step.id,
      title: step.title,
      body: step.body || '',
      completeWhen: step.completeWhen || 'manual',
      action: { type, payload },
    };
  });
}

function templateStepsA() {
  return [
    {
      id: 'a1',
      title: 'Règle de visite',
      body: 'On décrit ce qu’on **voit**, sans cueillir ni manipuler. Pas de goût, pas de toucher : la clé repose sur des caractères observables à distance.',
      action: { type: 'message', payload: {} },
      completeWhen: 'manual',
    },
    {
      id: 'a2',
      title: 'Clé d’identification',
      body: 'Suis la clé étape par étape jusqu’à une espèce. Si aucune clé n’est configurée, ouvre l’onglet Clés et choisis-en une.',
      action: { type: 'open_id_key', payload: {} },
      completeWhen: 'manual',
    },
    {
      id: 'a3',
      title: 'Fiche espèce',
      body: 'Ouvre la fiche de l’espèce : danger, risque sanitaire, notes « sur ce site ».',
      action: { type: 'open_plant', payload: {} },
      completeWhen: 'manual',
    },
    {
      id: 'a4',
      title: 'Mini-quiz',
      body: 'Réponds à une question de classification ou d’identification (cycle 3 ou 4).',
      action: {
        type: 'open_quiz',
        payload: { notionNiveau: 'cycle4' },
      },
      completeWhen: 'manual',
    },
  ];
}

function templateStepsB() {
  return [
    {
      id: 'b1',
      title: 'Trois fiches du site',
      body: 'Avant le réseau : ouvre trois fiches présentes sur la carte de la sortie (notes de site si renseignées). Commence par la première.',
      action: { type: 'open_plant', payload: { plantIndex: 0 } },
      completeWhen: 'manual',
    },
    {
      id: 'b1b',
      title: 'Deuxième fiche',
      body: 'Ouvre la deuxième espèce choisie pour la séance.',
      action: { type: 'open_plant', payload: { plantIndex: 1 } },
      completeWhen: 'manual',
    },
    {
      id: 'b1c',
      title: 'Troisième fiche',
      body: 'Ouvre la troisième espèce, puis passe au réseau.',
      action: { type: 'open_plant', payload: { plantIndex: 2 } },
      completeWhen: 'manual',
    },
    {
      id: 'b2',
      title: 'Réseau de la carte',
      body: 'Observe le réseau filtré sur la carte de la séance. Au collège, concentre-toi sur prédation, herbivorie et pollinisation.',
      action: { type: 'open_foodweb', payload: {} },
      completeWhen: 'manual',
    },
    {
      id: 'b3',
      title: 'Mini-quiz écologie',
      body: 'Mini-quiz sur une notion d’écologie / réseaux (cycle 4).',
      action: {
        type: 'open_quiz',
        payload: { notionNiveau: 'cycle4' },
      },
      completeWhen: 'manual',
    },
  ];
}

function templateStepsC() {
  return [
    {
      id: 'c1',
      title: 'Un arbre qui grandit',
      body: 'Objectif : suivre un arbre identifié du site. On mesure la **circonférence à 1,30 m** du sol (et la hauteur si possible), puis on relie la croissance au carbone stocké.',
      action: { type: 'message', payload: {} },
      completeWhen: 'manual',
    },
    {
      id: 'c2',
      title: 'Mesurer l’arbre suivi',
      body: 'Ouvre l’arbre suivi et saisis la circonférence (et la hauteur si possible) dans une nouvelle mesure.',
      action: { type: 'open_individual', payload: {} },
      completeWhen: 'manual',
    },
    {
      id: 'c3',
      title: 'Lire la croissance',
      body: 'Lis le graphique de croissance, puis ouvre le volet « ordre de grandeur » (biomasse, carbone, CO₂). Discutez des limites : la formule vient d’arbres tropicaux.',
      action: { type: 'open_individual', payload: {} },
      completeWhen: 'manual',
    },
    {
      id: 'c4',
      title: 'Mini-quiz climat / carbone',
      body: 'Relie la mesure à une notion du programme (climat, carbone, agrosystèmes).',
      action: { type: 'open_quiz', payload: { notionNiveau: 'lycee' } },
      completeWhen: 'manual',
    },
  ];
}

function templateStepsD() {
  return [
    {
      id: 'd1',
      title: 'Classer pour de vrai',
      body: 'Chaque boîte correspond à un groupe d’êtres vivants qui partagent un **caractère**. Place chaque espèce dans la plus petite boîte qui la contient.',
      action: { type: 'message', payload: {} },
      completeWhen: 'manual',
    },
    {
      id: 'd2',
      title: 'Boîtes emboîtées',
      body: 'Place les six espèces dans les boîtes, puis clique sur « Vérifier ».',
      action: { type: 'open_nested_groups', payload: {} },
      completeWhen: 'manual',
    },
    {
      id: 'd3',
      title: 'Correction et discussion',
      body: 'Pour chaque groupe, quel est le caractère partagé ? Pourquoi une espèce mal placée l’a-t-elle été ?',
      action: { type: 'message', payload: {} },
      completeWhen: 'manual',
    },
    {
      id: 'd4',
      title: 'Mini-quiz classification',
      body: 'Mini-quiz sur la classification et la biodiversité.',
      action: { type: 'open_quiz', payload: { notionNiveau: 'lycee' } },
      completeWhen: 'manual',
    },
  ];
}

function templateStepsCustom() {
  return [
    {
      id: 's1',
      title: 'Consigne',
      body: 'Présente l’objectif de la séance.',
      action: { type: 'message', payload: {} },
      completeWhen: 'manual',
    },
  ];
}

function defaultConfigForTemplate(templateKey) {
  if (templateKey === 'college_qui_mange') {
    return normalizeConfig({
      mapId: null,
      plantIds: [],
      notionNiveau: 'cycle4',
    });
  }
  if (templateKey === 'lycee_arbre' || templateKey === 'lycee_classer') {
    return normalizeConfig({ notionNiveau: 'lycee' });
  }
  if (templateKey === 'custom') return normalizeConfig({});
  return normalizeConfig({
    keyIdOrSlug: null,
    plantId: null,
    notionNiveau: 'cycle4',
  });
}

function stepsForTemplate(templateKey) {
  if (templateKey === 'college_qui_mange') return templateStepsB();
  if (templateKey === 'college_reconaitre') return templateStepsA();
  if (templateKey === 'lycee_arbre') return templateStepsC();
  if (templateKey === 'lycee_classer') return templateStepsD();
  if (templateKey === 'custom') return templateStepsCustom();
  return null;
}

/**
 * Références d'une séance à vérifier avant publication (plantes, individus, parcours, clé).
 * @returns {{ plantIds: number[], individualIds: number[], routeSlugs: string[], keyRefs: string[] }}
 */
function collectStepReferences(steps) {
  const plantIds = new Set();
  const individualIds = new Set();
  const routeSlugs = new Set();
  const keyRefs = new Set();
  for (const step of Array.isArray(steps) ? steps : []) {
    const p = step?.action?.payload || {};
    for (const raw of [
      p.plantId,
      p.highlightPlantId,
      ...(Array.isArray(p.plantIds) ? p.plantIds : []),
    ]) {
      const id = normalizeOptionalInt(raw);
      if (id) plantIds.add(id);
    }
    const iid = normalizeOptionalInt(p.individualId);
    if (iid) individualIds.add(iid);
    if (p.routeSlug) routeSlugs.add(String(p.routeSlug));
    if (p.keyIdOrSlug) keyRefs.add(String(p.keyIdOrSlug));
  }
  return {
    plantIds: [...plantIds],
    individualIds: [...individualIds],
    routeSlugs: [...routeSlugs],
    keyRefs: [...keyRefs],
  };
}

function parseJsonField(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

function serializeSessionRow(row, { resolve = true } = {}) {
  if (!row) return null;
  const config = normalizeConfig(parseJsonField(row.config_json, {}));
  const rawSteps = parseJsonField(row.steps_json, []);
  const stepsCheck = validateSteps(rawSteps);
  const steps = stepsCheck.ok
    ? resolve
      ? resolveSteps(stepsCheck.steps, config, { payloadFirst: row.template_key === 'custom' })
      : stepsCheck.steps
    : [];
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description || '',
    level: row.level,
    templateKey: row.template_key,
    mapId: row.map_id || config.mapId || null,
    config,
    steps,
    isPublished: !!row.is_published,
    sortOrder: Number(row.sort_order) || 100,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function normalizeSlug(raw) {
  const s = normalizeOptionalString(raw, 120);
  if (!s || !SLUG_RE.test(s)) return null;
  return s.toLowerCase();
}

function normalizeTemplateKey(raw) {
  const s = normalizeOptionalString(raw, 64);
  return s && TEMPLATE_KEYS.has(s) ? s : null;
}

/** Lien direct qui ouvre l'application et démarre la séance (QR code, affiche). */
function sessionDeepLink(baseUrl, slug) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  return `${base}/?seance=${encodeURIComponent(String(slug || ''))}`;
}

function normalizeLevel(raw) {
  const s = normalizeOptionalString(raw, 32);
  return s && LEVELS.has(s) ? s : 'college';
}

module.exports = {
  ACTION_TYPES,
  TEMPLATE_KEYS,
  TEMPLATE_DEFAULT_TITLES,
  TEMPLATE_LEVELS,
  MAX_PLANT_IDS,
  LEVELS,
  collectStepReferences,
  validateAction,
  validateSteps,
  normalizeConfig,
  resolveSteps,
  stepsForTemplate,
  defaultConfigForTemplate,
  serializeSessionRow,
  normalizeSlug,
  normalizeTemplateKey,
  normalizeLevel,
  parseJsonField,
  sessionDeepLink,
};
