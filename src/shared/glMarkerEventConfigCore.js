const MARKER_QUESTION_EVENT_TYPES = new Set(['question', 'quiz']);
const MARKER_QUESTION_RETRIGGER_MODES = new Set(['every_arrival', 'once_per_team', 'once_per_game']);
const MARKER_EVENT_TYPES = new Set(['question', 'quiz', 'start', 'story', 'point', 'narration', 'behavior']);

const DEFAULT_QUESTION_POOL = Object.freeze({
  biomeMode: 'chapter',
  biomeSlugs: [],
  categorieSlugs: [],
  niveaux: [],
  difficulteMin: null,
  difficulteMax: null,
  searchQuery: '',
  selectedQuestionCodes: [],
});

const DEFAULT_QUESTION_CONFIG = Object.freeze({
  mode: 'random',
  fixedQuestionCode: null,
  pool: { ...DEFAULT_QUESTION_POOL },
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
  if (i < 1 || i > 5) return null;
  return i;
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
  return {
    mode,
    fixedQuestionCode: normalizeQuestionCode(src.fixedQuestionCode),
    pool: normalizeQuestionPool(src.pool),
  };
}

function normalizeEventConfig(input) {
  if (input == null) return null;
  let src = input;
  if (typeof input === 'string') {
    try {
      src = JSON.parse(input);
    } catch (_) {
      return null;
    }
  }
  if (!src || typeof src !== 'object' || Array.isArray(src)) return null;
  const version = Number(src.version) || 1;
  const question = src.question != null ? normalizeQuestionConfig(src.question) : null;
  return {
    version,
    ...(question ? { question } : {}),
  };
}

function defaultEventConfigForQuestion() {
  return {
    version: 1,
    question: {
      mode: 'random',
      fixedQuestionCode: null,
      pool: { ...DEFAULT_QUESTION_POOL },
    },
  };
}

function migrateLegacyMarkerQcmConfig(marker) {
  if (!marker) return null;
  const eventType = String(marker.event_type || '').trim().toLowerCase();
  if (!MARKER_QUESTION_EVENT_TYPES.has(eventType)) return null;

  const fixedCode = normalizeQuestionCode(marker.qcm_question_code);
  const categorieSlug = String(marker.qcm_categorie_slug || '').trim();

  if (fixedCode) {
    return {
      version: 1,
      question: {
        mode: 'fixed',
        fixedQuestionCode: fixedCode,
        pool: {
          ...DEFAULT_QUESTION_POOL,
          ...(categorieSlug ? { categorieSlugs: [categorieSlug] } : {}),
        },
      },
    };
  }

  return {
    version: 1,
    question: {
      mode: 'random',
      fixedQuestionCode: null,
      pool: {
        ...DEFAULT_QUESTION_POOL,
        ...(categorieSlug ? { categorieSlugs: [categorieSlug] } : {}),
      },
    },
  };
}

function resolveMarkerEventConfig(marker) {
  if (!marker) return null;
  const parsed = normalizeEventConfig(marker.event_config_json ?? marker.eventConfig ?? marker.event_config);
  if (parsed) return parsed;
  return migrateLegacyMarkerQcmConfig(marker);
}

function isQuestionMarker(marker) {
  if (!marker) return false;
  const eventType = String(marker.event_type || '').trim().toLowerCase();
  if (MARKER_QUESTION_EVENT_TYPES.has(eventType)) return true;
  const cfg = resolveMarkerEventConfig(marker);
  return Boolean(cfg?.question);
}

function eventConfigToLegacyMirror(eventConfig) {
  const question = eventConfig?.question;
  if (!question) {
    return { qcmCategorieSlug: null, qcmQuestionCode: null };
  }
  if (question.mode === 'fixed' && question.fixedQuestionCode) {
    return {
      qcmCategorieSlug: question.pool?.categorieSlugs?.[0] || null,
      qcmQuestionCode: question.fixedQuestionCode,
    };
  }
  return {
    qcmCategorieSlug: question.pool?.categorieSlugs?.[0] || null,
    qcmQuestionCode: null,
  };
}

function serializeEventConfig(eventConfig) {
  const normalized = normalizeEventConfig(eventConfig);
  if (!normalized) return null;
  return JSON.stringify(normalized);
}

function parseEventConfigJson(raw) {
  if (!raw) return null;
  return normalizeEventConfig(raw);
}

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

export {
  MARKER_QUESTION_EVENT_TYPES,
  MARKER_QUESTION_RETRIGGER_MODES,
  MARKER_EVENT_TYPES,
  DEFAULT_QUESTION_POOL,
  DEFAULT_QUESTION_CONFIG,
  normalizeStringList,
  normalizeQuestionCode,
  normalizeQuestionPool,
  normalizeQuestionConfig,
  normalizeEventConfig,
  defaultEventConfigForQuestion,
  migrateLegacyMarkerQcmConfig,
  resolveMarkerEventConfig,
  isQuestionMarker,
  eventConfigToLegacyMirror,
  serializeEventConfig,
  parseEventConfigJson,
  normalizeMarkerQuestionRetrigger,
  resolveBiomeSlugsForPool,
};
