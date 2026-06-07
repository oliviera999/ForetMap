'use strict';

const MARKER_QUESTION_EVENT_TYPES = new Set(['question', 'quiz']);
const MARKER_QUESTION_RETRIGGER_MODES = new Set(['every_arrival', 'once_per_team', 'once_per_game']);
const MARKER_EVENT_TYPES = new Set([
  'question', 'quiz', 'start', 'story', 'point', 'narration', 'behavior',
  'event', 'souffle', 'trame', 'challenge', 'shortcut', 'frontier', 'finish',
]);
const MARKER_EVENT_TYPE_ALIASES = new Map([
  ['depart', 'start'], ['evenement', 'event'], ['defi', 'challenge'],
  ['raccourci', 'shortcut'], ['frontiere', 'frontier'], ['arrivee', 'finish'],
]);
const MARKER_PEOPLE_EFFECT_TYPES = new Set(['souffle', 'trame']);
const MARKER_EFFECT_EVENT_TYPES = new Set(['event', 'souffle', 'trame', 'challenge', 'shortcut', 'frontier', 'finish']);
const EFFECT_DELTA_MIN = -99;
const EFFECT_DELTA_MAX = 99;
const DEFAULT_QUESTION_POOL = Object.freeze({
  biomeMode: 'chapter', biomeSlugs: [], categorieSlugs: [], niveaux: [],
  difficulteMin: null, difficulteMax: null, searchQuery: '', selectedQuestionCodes: [],
});
const DEFAULT_LORE_QUESTION_POOL = Object.freeze({
  chapitreMode: 'chapter', chapitreSlugs: [], categorieSlugs: [], tierLore: [], niveaux: [],
  difficulteMin: null, difficulteMax: null, searchQuery: '', selectedQuestionCodes: [],
});
const DEFAULT_QUESTION_CONFIG = Object.freeze({
  set: 'biome', mode: 'random', fixedQuestionCode: null, pool: { ...DEFAULT_QUESTION_POOL },
});

function normalizeStringList(input) {
  if (input == null) return [];
  const raw = Array.isArray(input) ? input : [input];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const s = String(item || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}
function normalizeQuestionCode(value) {
  const s = String(value || '').trim().toUpperCase();
  return s.length > 0 ? s : null;
}
function normalizeDifficulte(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i >= 1 && i <= 5 ? i : null;
}
function normalizeEffectDelta(value) {
  if (value == null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(EFFECT_DELTA_MIN, Math.min(EFFECT_DELTA_MAX, Math.floor(n)));
}
function normalizeEffectBranch(input) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    label: String(src.label || '').trim() || null,
    deltaPv: normalizeEffectDelta(src.deltaPv ?? src.delta_pv ?? src.dpv),
    deltaGems: normalizeEffectDelta(src.deltaGems ?? src.delta_gemmes ?? src.dgem),
    deltaMove: normalizeEffectDelta(src.deltaMove ?? src.delta_mouvement ?? src.dmvt),
    passTurn: src.passTurn === true || src.pass_turn === true,
  };
}
function hasEffectBranchData(branch) {
  return Boolean(branch && (branch.label || branch.deltaPv || branch.deltaGems || branch.deltaMove || branch.passTurn));
}
function normalizeMarkerEffects(input) {
  if (input == null) return null;
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = {};
  const neutral = normalizeEffectBranch(src.neutral);
  const gnome = normalizeEffectBranch(src.gnome);
  const unicorn = normalizeEffectBranch(src.unicorn ?? src.licorne);
  if (hasEffectBranchData(neutral)) out.neutral = neutral;
  if (hasEffectBranchData(gnome)) out.gnome = gnome;
  if (hasEffectBranchData(unicorn)) out.unicorn = unicorn;
  return Object.keys(out).length > 0 ? out : null;
}
function normalizeEventMeta(input) {
  if (input == null) return null;
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const tonalite = String(src.tonalite || '').trim() || null;
  const rarete = String(src.rarete || '').trim() || null;
  return tonalite || rarete ? { tonalite, rarete } : null;
}
function normalizeQuestionSet(value) {
  return String(value || '').trim().toLowerCase() === 'lore' ? 'lore' : 'biome';
}
function normalizeLoreQuestionPool(input) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const chapitreMode = String(src.chapitreMode || 'chapter').trim().toLowerCase() === 'custom' ? 'custom' : 'chapter';
  return {
    chapitreMode,
    chapitreSlugs: normalizeStringList(src.chapitreSlugs),
    categorieSlugs: normalizeStringList(src.categorieSlugs),
    tierLore: normalizeStringList(src.tierLore).map((s) => s.toLowerCase()).filter((s) => s === 'cle' || s === 'recit'),
    niveaux: normalizeStringList(src.niveaux),
    difficulteMin: normalizeDifficulte(src.difficulteMin),
    difficulteMax: normalizeDifficulte(src.difficulteMax),
    searchQuery: String(src.searchQuery || '').trim(),
    selectedQuestionCodes: normalizeStringList(src.selectedQuestionCodes).map((c) => c.toUpperCase()),
  };
}
function normalizeQuestionPool(input) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const biomeMode = String(src.biomeMode || 'chapter').trim().toLowerCase() === 'custom' ? 'custom' : 'chapter';
  return {
    biomeMode,
    biomeSlugs: normalizeStringList(src.biomeSlugs),
    categorieSlugs: normalizeStringList(src.categorieSlugs),
    niveaux: normalizeStringList(src.niveaux),
    difficulteMin: normalizeDifficulte(src.difficulteMin),
    difficulteMax: normalizeDifficulte(src.difficulteMax),
    searchQuery: String(src.searchQuery || '').trim(),
    selectedQuestionCodes: normalizeStringList(src.selectedQuestionCodes).map((c) => c.toUpperCase()),
  };
}
function normalizeQuestionConfig(input) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const mode = String(src.mode || 'random').trim().toLowerCase() === 'fixed' ? 'fixed' : 'random';
  const set = normalizeQuestionSet(src.set);
  const pool = set === 'lore' ? normalizeLoreQuestionPool(src.pool) : normalizeQuestionPool(src.pool);
  return { set, mode, fixedQuestionCode: normalizeQuestionCode(src.fixedQuestionCode), pool };
}
function normalizeEventTypeAlias(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  const mapped = MARKER_EVENT_TYPE_ALIASES.get(raw) || raw;
  return MARKER_EVENT_TYPES.has(mapped) ? mapped : null;
}
function normalizeEventConfig(input) {
  if (input == null) return null;
  let src = input;
  if (typeof input === 'string') { try { src = JSON.parse(input); } catch (_) { return null; } }
  if (!src || typeof src !== 'object' || Array.isArray(src)) return null;
  const version = Number(src.version) || 1;
  const question = src.question != null ? normalizeQuestionConfig(src.question) : null;
  const effects = normalizeMarkerEffects(src.effects);
  const eventMeta = normalizeEventMeta(src.eventMeta);
  const out = { version: effects || eventMeta ? Math.max(version, 2) : version };
  if (question) out.question = question;
  if (effects) out.effects = effects;
  if (eventMeta) out.eventMeta = eventMeta;
  return question || effects || eventMeta ? out : null;
}
function defaultEventConfigForQuestion() {
  return {
    version: 2,
    question: { set: 'biome', mode: 'random', fixedQuestionCode: null, pool: { ...DEFAULT_QUESTION_POOL } },
  };
}
function buildEffectsFromFlatImport(row = {}) {
  return normalizeMarkerEffects({
    neutral: { deltaPv: row.delta_pv, deltaGems: row.delta_gemmes, deltaMove: row.delta_mouvement },
    gnome: { label: row.effet_gnome, deltaPv: row.dpv_gnome, deltaGems: row.dgem_gnome, deltaMove: row.dmvt_gnome },
    unicorn: { label: row.effet_licorne, deltaPv: row.dpv_licorne, deltaGems: row.dgem_licorne, deltaMove: row.dmvt_licorne },
  });
}
function mergeEventConfigWithImport(eventConfig, importExtras = {}) {
  const base = normalizeEventConfig(eventConfig) || {};
  const effectsFromImport = buildEffectsFromFlatImport(importExtras);
  const eventMeta = normalizeEventMeta({ tonalite: importExtras.tonalite, rarete: importExtras.rarete });
  let question = base.question || null;
  const categorie = String(importExtras.categorie_question || importExtras.qcm_categorie_slug || '').trim();
  const niveau = String(importExtras.niveau_question || '').trim();
  if (categorie || niveau) {
    const pool = normalizeQuestionPool(question?.pool || DEFAULT_QUESTION_POOL);
    if (categorie) pool.categorieSlugs = normalizeStringList([categorie]);
    if (niveau) pool.niveaux = normalizeStringList([niveau]);
    question = normalizeQuestionConfig({ mode: question?.mode || 'random', fixedQuestionCode: question?.fixedQuestionCode || importExtras.qcm_question_code || null, pool });
  }
  const out = { version: 2, ...(question ? { question } : {}), ...(effectsFromImport ? { effects: effectsFromImport } : (base.effects ? { effects: base.effects } : {})), ...(eventMeta ? { eventMeta } : (base.eventMeta ? { eventMeta: base.eventMeta } : {})) };
  return out.question || out.effects || out.eventMeta ? out : null;
}
function migrateLegacyMarkerQcmConfig(marker) {
  if (!marker) return null;
  const eventType = String(marker.event_type || '').trim().toLowerCase();
  if (!MARKER_QUESTION_EVENT_TYPES.has(eventType)) return null;
  const fixedCode = normalizeQuestionCode(marker.qcm_question_code);
  const categorieSlug = String(marker.qcm_categorie_slug || '').trim();
  const pool = { ...DEFAULT_QUESTION_POOL, ...(categorieSlug ? { categorieSlugs: [categorieSlug] } : {}) };
  const fixedSet = fixedCode && /^LQCM\d+$/i.test(fixedCode) ? 'lore' : 'biome';
  const lorePool = { ...DEFAULT_LORE_QUESTION_POOL, ...(categorieSlug ? { categorieSlugs: [categorieSlug] } : {}) };
  return fixedCode
    ? { version: 2, question: { set: fixedSet, mode: 'fixed', fixedQuestionCode: fixedCode, pool: fixedSet === 'lore' ? lorePool : pool } }
    : { version: 2, question: { set: 'biome', mode: 'random', fixedQuestionCode: null, pool } };
}
function resolveMarkerEventConfig(marker) {
  if (!marker) return null;
  return normalizeEventConfig(marker.event_config_json ?? marker.eventConfig ?? marker.event_config) || migrateLegacyMarkerQcmConfig(marker);
}
function isQuestionMarker(marker) {
  if (!marker) return false;
  if (MARKER_QUESTION_EVENT_TYPES.has(String(marker.event_type || '').trim().toLowerCase())) return true;
  return Boolean(resolveMarkerEventConfig(marker)?.question);
}
function isEffectMarker(marker) {
  if (!marker) return false;
  if (MARKER_EFFECT_EVENT_TYPES.has(String(marker.event_type || '').trim().toLowerCase())) return true;
  return Boolean(resolveMarkerEventConfig(marker)?.effects);
}
function usesPeopleSpecificEffects(marker) {
  return MARKER_PEOPLE_EFFECT_TYPES.has(String(marker?.event_type || '').trim().toLowerCase());
}
function eventConfigToLegacyMirror(eventConfig) {
  const question = eventConfig?.question;
  if (!question) return { qcmCategorieSlug: null, qcmQuestionCode: null };
  return question.mode === 'fixed' && question.fixedQuestionCode
    ? { qcmCategorieSlug: question.pool?.categorieSlugs?.[0] || null, qcmQuestionCode: question.fixedQuestionCode }
    : { qcmCategorieSlug: question.pool?.categorieSlugs?.[0] || null, qcmQuestionCode: null };
}
function serializeEventConfig(eventConfig) { const n = normalizeEventConfig(eventConfig); return n ? JSON.stringify(n) : null; }
function parseEventConfigJson(raw) { return raw ? normalizeEventConfig(raw) : null; }
function normalizeMarkerQuestionRetrigger(value) {
  const s = String(value || '').trim();
  return MARKER_QUESTION_RETRIGGER_MODES.has(s) ? s : 'every_arrival';
}
function resolveBiomeSlugsForPool(pool, chapterBiomeSlugs) {
  const chapterSlugs = normalizeStringList(chapterBiomeSlugs);
  const poolCfg = normalizeQuestionPool(pool);
  if (poolCfg.biomeMode === 'custom') {
    const merged = normalizeStringList([...chapterSlugs, ...poolCfg.biomeSlugs]);
    return merged.length > 0 ? merged : chapterSlugs;
  }
  return chapterSlugs;
}

function resolveChapitreSlugsForPool(pool, chapterPlateauNumber) {
  const poolCfg = normalizeLoreQuestionPool(pool);
  if (poolCfg.chapitreMode === 'custom') {
    const merged = normalizeStringList([...poolCfg.chapitreSlugs, 'tous']);
    return merged.length > 0 ? merged : ['tous'];
  }
  const slugs = ['tous'];
  const pn = chapterPlateauNumber != null ? Number(chapterPlateauNumber) : null;
  if (Number.isFinite(pn)) {
    slugs.push(`ch${Math.floor(pn)}`);
  }
  return slugs;
}

module.exports = {
  MARKER_QUESTION_EVENT_TYPES, MARKER_QUESTION_RETRIGGER_MODES, MARKER_EVENT_TYPES, MARKER_EVENT_TYPE_ALIASES,
  MARKER_PEOPLE_EFFECT_TYPES, MARKER_EFFECT_EVENT_TYPES, EFFECT_DELTA_MIN, EFFECT_DELTA_MAX,
  DEFAULT_QUESTION_POOL, DEFAULT_LORE_QUESTION_POOL, DEFAULT_QUESTION_CONFIG, normalizeStringList, normalizeQuestionCode,
  normalizeQuestionSet, normalizeQuestionPool, normalizeLoreQuestionPool, normalizeQuestionConfig, normalizeEffectDelta, normalizeEffectBranch,
  normalizeMarkerEffects, normalizeEventMeta, normalizeEventTypeAlias, normalizeEventConfig,
  defaultEventConfigForQuestion, buildEffectsFromFlatImport, mergeEventConfigWithImport,
  migrateLegacyMarkerQcmConfig, resolveMarkerEventConfig, isQuestionMarker, isEffectMarker,
  usesPeopleSpecificEffects, eventConfigToLegacyMirror, serializeEventConfig, parseEventConfigJson,
  normalizeMarkerQuestionRetrigger, resolveBiomeSlugsForPool, resolveChapitreSlugsForPool,
};
