'use strict';

/**
 * Nommage, couleurs et mascottes des équipes composées automatiquement — module PUR
 * (docs/GL_EQUIPES_AUTO_CONCEPTION.md § 4.4). Aucun accès base : l'orchestrateur fournit le
 * vocabulaire du chapitre (titre, plateau, biomes) et le catalogue GL typé.
 *
 * Vocabulaire figé : des noms courts et lisibles, jamais des jugements de valeur.
 */

/** Racines neutres pour compléter le vocabulaire du chapitre. */
const FALLBACK_TEAM_WORDS = Object.freeze([
  'Sente',
  'Source',
  'Clairière',
  'Ruisseau',
  'Lisière',
  'Bosquet',
  'Talus',
  'Tourbière',
  'Mare',
  'Verger',
  'Haie',
  'Prairie',
]);

/** Palette d'équipe (≥ 8 teintes contrastées, thème forêt). */
const TEAM_COLOR_PALETTE = Object.freeze([
  '#22c55e', // vert feuille
  '#3b82f6', // bleu ruisseau
  '#f59e0b', // ambre
  '#a855f7', // violet bruyère
  '#ef4444', // rouge baie
  '#14b8a6', // turquoise
  '#f97316', // orange écorce
  '#ec4899', // rose églantine
  '#84cc16', // vert lime
  '#0ea5e9', // bleu ciel
  '#eab308', // jaune genêt
  '#6366f1', // indigo
]);

/** Pénurie de mascottes typées : `teamCount` a été réduit, cf. conception § 4.4. */
const MASCOT_POOL_TOO_SMALL = 'MASCOT_POOL_TOO_SMALL';

function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function normalizeLabel(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Vocabulaire de nommage à partir du chapitre : titre, biomes, plateau. Pur.
 * @param {{ chapterTitle?: string, plateauNumber?: number|null, biomeNames?: string[] }} source
 * @returns {string[]} mots distincts, non vides
 */
function buildTeamVocabulary({ chapterTitle = '', plateauNumber = null, biomeNames = [] } = {}) {
  const words = [];
  for (const biome of Array.isArray(biomeNames) ? biomeNames : []) {
    const label = normalizeLabel(biome);
    if (label) words.push(label);
  }
  const title = normalizeLabel(chapterTitle);
  if (title) {
    // Mots « porteurs » du titre (≥ 4 lettres, hors articles) : « Les Sources du Nord » → Sources, Nord.
    for (const token of title.split(/[\s,;:'’\-–—]+/)) {
      const clean = token.replace(/[^\p{L}\p{N}]/gu, '');
      if (clean.length >= 4 && !/^(dans|avec|pour|sous|vers|chez|entre)$/i.test(clean)) {
        words.push(clean[0].toUpperCase() + clean.slice(1));
      }
    }
  }
  const plateau = Number(plateauNumber);
  if (Number.isFinite(plateau) && plateau > 0) words.push(`Plateau ${plateau}`);
  const seen = new Set();
  return words.filter((w) => {
    const key = w.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Noms d'équipe distincts. Priorité au vocabulaire du chapitre, repli sur les racines
 * neutres, dernier repli « Équipe N ». Les noms déjà pris (`exclude`) sont évités.
 */
function pickTeamNames({ count, vocabulary = [], rng, exclude = [] }) {
  const k = Math.max(0, Math.trunc(Number(count) || 0));
  if (k === 0) return [];
  const taken = new Set((exclude || []).map((n) => normalizeLabel(n).toLowerCase()));
  const candidates = [
    ...shuffle(vocabulary.filter(Boolean), rng),
    ...shuffle(FALLBACK_TEAM_WORDS, rng),
  ];
  const names = [];
  for (const candidate of candidates) {
    if (names.length >= k) break;
    const label = normalizeLabel(candidate);
    const key = label.toLowerCase();
    if (!label || taken.has(key)) continue;
    taken.add(key);
    names.push(label);
  }
  let n = 1;
  while (names.length < k) {
    const label = `Équipe ${n}`;
    n += 1;
    if (taken.has(label.toLowerCase())) continue;
    taken.add(label.toLowerCase());
    names.push(label);
  }
  return names;
}

/** Couleurs distinctes (palette mélangée, puis réutilisation si > palette). */
function pickTeamColors({ count, rng, exclude = [] }) {
  const k = Math.max(0, Math.trunc(Number(count) || 0));
  if (k === 0) return [];
  const taken = new Set((exclude || []).map((c) => String(c || '').toLowerCase()));
  const pool = shuffle(TEAM_COLOR_PALETTE, rng).filter((c) => !taken.has(c.toLowerCase()));
  const colors = [];
  for (let i = 0; i < k; i += 1) {
    colors.push(
      pool.length ? pool[i % pool.length] : TEAM_COLOR_PALETTE[i % TEAM_COLOR_PALETTE.length],
    );
  }
  return colors;
}

/**
 * Attribue une mascotte du bon peuple à chaque équipe, sans doublon dans la partie.
 *
 * @param {object} params
 * @param {string[]} params.types  peuple par équipe (`gnome` | `unicorn`)
 * @param {Array<{ id: string, type: string }>} params.catalog  catalogue GL typé
 * @param {Function} params.rng
 * @param {string[]} [params.exclude]  mascottes déjà prises dans la partie
 * @returns {{ mascotIds: Array<string|null>, warnings: string[], usableTypes: string[] }}
 *   Si le vivier manque pour un peuple, les équipes en trop de ce peuple sont RETIRÉES
 *   (`usableTypes` plus court que `types`) et `MASCOT_POOL_TOO_SMALL` est signalé.
 */
function pickMascots({ types, catalog, rng, exclude = [] }) {
  const wanted = (Array.isArray(types) ? types : []).map((t) => String(t || '').toLowerCase());
  const taken = new Set((exclude || []).map((id) => String(id)));
  const byType = new Map();
  for (const entry of Array.isArray(catalog) ? catalog : []) {
    const type = String(entry?.type || '').toLowerCase();
    const id = String(entry?.id || '');
    if (!id || !type || taken.has(id)) continue;
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(id);
  }
  for (const [type, list] of byType) byType.set(type, shuffle(list, rng));

  const mascotIds = [];
  const usableTypes = [];
  const warnings = new Set();
  for (const type of wanted) {
    const pool = byType.get(type) || [];
    if (!pool.length) {
      warnings.add(MASCOT_POOL_TOO_SMALL);
      continue;
    }
    mascotIds.push(pool.shift());
    usableTypes.push(type);
  }
  return { mascotIds, usableTypes, warnings: [...warnings] };
}

/**
 * Peuples alternés pour `count` équipes (gnome, unicorn, gnome…). Avec ≥ 2 équipes, chaque
 * peuple est représenté (les sorts « frappe adverse » ont besoin d'une cible).
 * `startWith` permet la rotation (lot v3).
 */
function alternateTeamTypes(count, startWith = 'gnome') {
  const k = Math.max(0, Math.trunc(Number(count) || 0));
  const first = String(startWith).toLowerCase() === 'unicorn' ? 'unicorn' : 'gnome';
  const second = first === 'gnome' ? 'unicorn' : 'gnome';
  return Array.from({ length: k }, (_, i) => (i % 2 === 0 ? first : second));
}

module.exports = {
  FALLBACK_TEAM_WORDS,
  TEAM_COLOR_PALETTE,
  MASCOT_POOL_TOO_SMALL,
  buildTeamVocabulary,
  pickTeamNames,
  pickTeamColors,
  pickMascots,
  alternateTeamTypes,
};
