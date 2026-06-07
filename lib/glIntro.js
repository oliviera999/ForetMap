const fs = require('fs');
const path = require('path');
const { queryOne } = require('../database');
const { resolveMediaByStableKey } = require('./glAssetManifest');

const INTRO_SETTINGS_KEY = 'content.intro';
const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', 'data', 'gl', 'intro.default.json');

const SCENE_IDS = Object.freeze([
  'boite', 'copiste', 'carnet', 'miroir', 'selene', 'corbeau', 'souffle', 'seuil', 'bienvenue',
]);

const VOICES = new Set(['copiste', 'selene', 'passeur']);

let defaultConfigCache = null;

function loadDefaultIntroConfig() {
  if (!defaultConfigCache) {
    defaultConfigCache = JSON.parse(fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf8'));
  }
  return JSON.parse(JSON.stringify(defaultConfigCache));
}

function normalizeOptionalString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizeScene(raw, fallback) {
  const base = fallback || {};
  const id = normalizeOptionalString(raw?.id || base.id);
  if (!SCENE_IDS.includes(id)) return null;
  const voice = normalizeOptionalString(raw?.voice || base.voice || 'copiste');
  return {
    id,
    voice: VOICES.has(voice) ? voice : base.voice || 'copiste',
    kicker: normalizeOptionalString(raw?.kicker ?? base.kicker),
    text: String(raw?.text ?? base.text ?? ''),
    imageKey: normalizeOptionalString(raw?.imageKey ?? base.imageKey),
    hold: Number.isFinite(Number(raw?.hold)) ? Number(raw.hold) : Number(base.hold) || 2600,
    erase: raw?.erase === true || base.erase === true,
    finale: raw?.finale === true || base.finale === true,
    cta: raw?.cta === true || base.cta === true,
    kb: Array.isArray(raw?.kb) && raw.kb.length === 2 ? raw.kb.map(Number) : (base.kb || [0, 0]),
    kb0: Array.isArray(raw?.kb0) && raw.kb0.length === 2 ? raw.kb0.map(Number) : (base.kb0 || [0, 0]),
  };
}

function normalizeIntroConfig(raw) {
  const defaults = loadDefaultIntroConfig();
  const input = raw && typeof raw === 'object' ? raw : {};
  const defaultById = new Map((defaults.scenes || []).map((scene) => [scene.id, scene]));
  const inputById = new Map((Array.isArray(input.scenes) ? input.scenes : []).map((scene) => [scene.id, scene]));

  const scenes = SCENE_IDS.map((id) => normalizeScene(inputById.get(id) || {}, defaultById.get(id) || { id }))
    .filter(Boolean);

  return {
    enabled: input.enabled !== false,
    opening: {
      kicker: normalizeOptionalString(input.opening?.kicker ?? defaults.opening?.kicker),
      titleHtml: String(input.opening?.titleHtml ?? defaults.opening?.titleHtml ?? ''),
      credit: normalizeOptionalString(input.opening?.credit ?? defaults.opening?.credit),
      button: normalizeOptionalString(input.opening?.button ?? defaults.opening?.button),
      foot: normalizeOptionalString(input.opening?.foot ?? defaults.opening?.foot),
    },
    finale: {
      button: normalizeOptionalString(input.finale?.button ?? defaults.finale?.button),
    },
    audio: {
      loopKey: normalizeOptionalString(input.audio?.loopKey ?? defaults.audio?.loopKey),
      finalKey: normalizeOptionalString(input.audio?.finalKey ?? defaults.audio?.finalKey),
    },
    scenes,
  };
}

function resolveMediaUrl(stableKey, fallbackUrl) {
  const key = normalizeOptionalString(stableKey);
  if (!key) return fallbackUrl;
  const resolved = resolveMediaByStableKey(key);
  if (resolved?.url && String(resolved.url).startsWith('/uploads/')) {
    return resolved.url;
  }
  return fallbackUrl;
}

function buildPublicIntroPayload(config) {
  const normalized = normalizeIntroConfig(config);
  const images = {};
  const scenes = normalized.scenes.map((scene) => {
    const fallback = `/gl/intro/assets/img/${scene.id}.png`;
    const imageUrl = resolveMediaUrl(scene.imageKey, fallback);
    images[scene.id] = imageUrl;
    return {
      id: scene.id,
      voice: scene.voice,
      kicker: scene.kicker,
      text: scene.text,
      hold: scene.hold,
      erase: scene.erase,
      finale: scene.finale,
      cta: scene.cta,
    };
  });

  return {
    enabled: normalized.enabled,
    opening: normalized.opening,
    finale: normalized.finale,
    audio: {
      loopUrl: resolveMediaUrl(normalized.audio.loopKey, '/gl/intro/assets/audio/loop.mp3'),
      finalUrl: resolveMediaUrl(normalized.audio.finalKey, '/gl/intro/assets/audio/final.mp3'),
    },
    images,
    scenes,
  };
}

async function getIntroConfigFromDb() {
  const row = await queryOne(
    'SELECT value_json FROM gl_settings WHERE `key` = ? LIMIT 1',
    [INTRO_SETTINGS_KEY]
  );
  if (!row?.value_json) return loadDefaultIntroConfig();
  try {
    return normalizeIntroConfig(JSON.parse(row.value_json));
  } catch (_) {
    return loadDefaultIntroConfig();
  }
}

module.exports = {
  INTRO_SETTINGS_KEY,
  SCENE_IDS,
  loadDefaultIntroConfig,
  normalizeIntroConfig,
  buildPublicIntroPayload,
  getIntroConfigFromDb,
  resolveMediaUrl,
};
