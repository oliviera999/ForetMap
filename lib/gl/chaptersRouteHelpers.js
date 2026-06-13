'use strict';

/**
 * Logique pure de `routes/gl/chapters.js` (O10) : normalisation de slug
 * (`normalizeSlug`), coercitions numériques (`clampPercent`, `toPositiveInt`,
 * `parsePlateauNumber`), normalisation/parsing du cadre d'image de carte
 * (`normalizeMapImageFrame`, `parseMapImageFrameJson`) et attachements de
 * sous-objets sur un chapitre déjà chargé (`attachChapterTheme`,
 * `attachChapterBiomes`, `attachChapterSpells`). Déplacement byte-identique
 * depuis la route — aucune I/O directe, aucun accès req/res/DB. Les dépendances
 * sont réimportées depuis les mêmes sources que la route.
 */

const { normalizeGlImageFrame } = require('../glImageFrame');
const { parseChapterThemeJson } = require('../glBrand');

function normalizeSlug(value) {
  return String(value || '').trim().toLowerCase();
}

function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

function toPositiveInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function parsePlateauNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return Math.floor(n);
}

function normalizeMapImageFrame(value) {
  if (value == null) return normalizeGlImageFrame(null, 'chapter-map');
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  return normalizeGlImageFrame(value, 'chapter-map');
}

function parseMapImageFrameJson(value) {
  if (!value) return normalizeGlImageFrame(null, 'chapter-map');
  try {
    return normalizeGlImageFrame(JSON.parse(String(value)), 'chapter-map');
  } catch (_) {
    return normalizeGlImageFrame(null, 'chapter-map');
  }
}

function attachChapterTheme(chapter) {
  if (!chapter) return chapter;
  chapter.theme = parseChapterThemeJson(chapter.theme_json);
  delete chapter.theme_json;
  return chapter;
}

function attachChapterBiomes(chapter, biomesMap) {
  if (!chapter) return chapter;
  const biomes = biomesMap.get(Number(chapter.id)) || [];
  chapter.biomes = biomes;
  return chapter;
}

function attachChapterSpells(chapter, spellsMap) {
  if (!chapter) return chapter;
  chapter.spells = spellsMap.get(Number(chapter.id)) || [];
  return chapter;
}

module.exports = {
  normalizeSlug,
  clampPercent,
  toPositiveInt,
  parsePlateauNumber,
  normalizeMapImageFrame,
  parseMapImageFrameJson,
  attachChapterTheme,
  attachChapterBiomes,
  attachChapterSpells,
};
