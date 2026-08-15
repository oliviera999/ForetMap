'use strict';

const { z } = require('zod');
const { queryOne, execute } = require('../database');
const { resolveStoredConfig } = require('./shared/jsonDefaultsStore');
const { asTrimmedString } = require('./shared/stringHelpers');

/**
 * Configuration du **narrateur** de l'aide ForetMap (OLU) — nom du locuteur,
 * portraits par expression et interrupteur global.
 *
 * Voir `docs/MASCOT_NARRATEUR_OLU.md` §5.1 (arbitrage du réceptacle) et §5.2 (forme).
 *
 * Réglage **distinct** de `content.help.registry` (le corpus d'aide) : les deux
 * évoluent séparément et, surtout, réinitialiser le corpus
 * (`POST /admin/help-content/reset`, cf. §11.2) ne doit pas effacer les portraits.
 *
 * Contrairement au corpus, les défauts tiennent en quatre clés sans contenu
 * éditorial : ils sont déclarés ici plutôt que dans un `data/*.json`.
 */
const HELP_NARRATOR_KEY = 'content.help.narrator';

/** Expressions canoniques (§4.3). Miroir de `src/utils/mascotExpressions.js`. */
const NARRATOR_EXPRESSIONS = Object.freeze([
  'neutre',
  'parle',
  'montre',
  'content',
  'vigilant',
  'cherche',
  'grave',
  'complice',
]);

/** Cadrages (§4.4). `bust` est le seul indispensable. */
const NARRATOR_FRAMINGS = Object.freeze(['face', 'bust', 'body']);

/** Silhouettes de repli — miroir de `MASCOT_PACK_FALLBACK_SILHOUETTES`
 * (`src/utils/mascotPackEditorModel.js`), lui-même aligné sur `VisitMascotFallbackSvg`. */
const NARRATOR_SILHOUETTES = Object.freeze([
  'gnome',
  'gnome1',
  'sprout',
  'scrap',
  'olu',
  'tanBird',
  'backpackFox',
  'backpackFox2',
  'spore',
  'vine',
  'moss',
  'seed',
  'swarm',
]);

const DEFAULT_SPEAKER_NAME = 'OLU';
const DEFAULT_SILHOUETTE = 'olu';
const MAX_URL_LENGTH = 500;

const portraitSchema = z.object({
  face: z.string().max(MAX_URL_LENGTH).optional(),
  bust: z.string().max(MAX_URL_LENGTH).optional(),
  body: z.string().max(MAX_URL_LENGTH).optional(),
});

// `z.object(...).partial()` plutôt que `z.record(z.enum(...), …)` : en Zod 4 un record
// à clés d'énumération est **exhaustif** (les 8 expressions seraient exigées), alors
// qu'ici toute expression sans portrait doit pouvoir être simplement absente (§5.2).
const portraitsSchema = z
  .object(Object.fromEntries(NARRATOR_EXPRESSIONS.map((key) => [key, portraitSchema])))
  .partial();

const helpNarratorSchema = z.object({
  enabled: z.boolean(),
  speakerName: z.string().max(40),
  fallbackSilhouette: z.enum(NARRATOR_SILHOUETTES),
  portraits: portraitsSchema,
});

function loadDefaultNarratorConfig() {
  return {
    enabled: true,
    speakerName: DEFAULT_SPEAKER_NAME,
    fallbackSilhouette: DEFAULT_SILHOUETTE,
    portraits: {},
  };
}

/**
 * N'accepte qu'une URL de média servable telle quelle dans un `<img src>` :
 * chemin absolu du site (`/uploads/...`) ou URL `http(s)`. Tout le reste
 * (`data:`, `javascript:`, chemin relatif ambigu) est **écarté** plutôt que corrigé.
 * @returns {string} URL retenue, ou '' si la valeur est refusée
 */
function normalizePortraitUrl(raw) {
  const value = asTrimmedString(raw);
  if (!value || value.length > MAX_URL_LENGTH) return '';
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (/^https?:\/\//i.test(value)) return value;
  return '';
}

function normalizePortrait(raw) {
  const portrait = {};
  for (const framing of NARRATOR_FRAMINGS) {
    const url = normalizePortraitUrl(raw?.[framing]);
    if (url) portrait[framing] = url;
  }
  return portrait;
}

/**
 * Normalise la configuration narrateur. Toute valeur illisible retombe sur les
 * défauts ; aucune expression inconnue n'est conservée, et une expression sans
 * aucune URL retenue est omise (le front retombe alors sur `neutre` puis sur le
 * SVG de repli — §5.2).
 */
function normalizeHelpNarratorConfig(raw) {
  const defaults = loadDefaultNarratorConfig();
  const input = raw && typeof raw === 'object' ? raw : {};

  const silhouette = asTrimmedString(input.fallbackSilhouette);
  const portraits = {};
  for (const expression of NARRATOR_EXPRESSIONS) {
    const portrait = normalizePortrait(input.portraits?.[expression]);
    if (Object.keys(portrait).length > 0) portraits[expression] = portrait;
  }

  const normalized = {
    enabled: input.enabled !== false,
    speakerName: asTrimmedString(input.speakerName ?? defaults.speakerName).slice(0, 40),
    fallbackSilhouette: NARRATOR_SILHOUETTES.includes(silhouette)
      ? silhouette
      : defaults.fallbackSilhouette,
    portraits,
  };

  const parsed = helpNarratorSchema.safeParse(normalized);
  if (!parsed.success) return defaults;
  return parsed.data;
}

function buildPublicNarratorPayload(config) {
  return normalizeHelpNarratorConfig(config);
}

async function getHelpNarratorFromDb() {
  const row = await queryOne('SELECT value_json FROM app_settings WHERE `key` = ? LIMIT 1', [
    HELP_NARRATOR_KEY,
  ]);
  return resolveStoredConfig(row?.value_json, {
    loadDefaults: loadDefaultNarratorConfig,
    normalize: normalizeHelpNarratorConfig,
  });
}

async function saveHelpNarratorToDb(config, actor = {}) {
  const normalized = normalizeHelpNarratorConfig(config);
  await execute(
    `INSERT INTO app_settings
      (\`key\`, scope, value_json, updated_by_user_type, updated_by_user_id, updated_at)
     VALUES (?, 'public', ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
      value_json = VALUES(value_json),
      updated_by_user_type = VALUES(updated_by_user_type),
      updated_by_user_id = VALUES(updated_by_user_id),
      updated_at = NOW()`,
    [HELP_NARRATOR_KEY, JSON.stringify(normalized), actor.userType || null, actor.userId || null],
  );
  return normalized;
}

module.exports = {
  HELP_NARRATOR_KEY,
  NARRATOR_EXPRESSIONS,
  NARRATOR_FRAMINGS,
  NARRATOR_SILHOUETTES,
  loadDefaultNarratorConfig,
  normalizeHelpNarratorConfig,
  buildPublicNarratorPayload,
  getHelpNarratorFromDb,
  saveHelpNarratorToDb,
  helpNarratorSchema,
};
