'use strict';

/**
 * Rattachement **pur** d'un feuillet aux chapitres (déduit, pas de colonne dédiée),
 * cohérent avec le pool d'acquisition (`glFeuilletChapterPool.js`). Un feuillet
 * appartient à un chapitre si :
 *   - son `biome_slug` ∈ biomes du chapitre, **ou**
 *   - son `plateau_number` = plateau du chapitre, **ou**
 *   - son `lien_pays` ∈ pays (1–5) couverts par les biomes du chapitre.
 *
 * Aucune I/O : sert la vue d'ensemble admin (répartition par chapitre) et ses tests.
 */

const { biomeToPays } = require('./glBiomePays');

function toNum(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pick(obj, snake, camel) {
  const v = obj?.[snake];
  if (v !== undefined && v !== null) return v;
  const c = obj?.[camel];
  return c === undefined ? null : c;
}

/** Ensemble des numéros de pays couverts par les biomes d'un chapitre. Pur. */
function chapterPaysSet(biomeSlugs = []) {
  const set = new Set();
  for (const slug of biomeSlugs) {
    const p = biomeToPays(slug);
    if (p != null) set.add(p);
  }
  return set;
}

/**
 * Chapitres auxquels un feuillet est rattaché.
 * @param {object} feuillet ligne feuillet (snake ou camel)
 * @param {Array<{id:number, name?:string, titre?:string, plateauNumber?:number, plateau_number?:number, biomeSlugs?:string[]}>} chapters
 * @returns {Array<{id:number, name:string|null}>}
 */
function feuilletChapters(feuillet, chapters = []) {
  if (!feuillet || !Array.isArray(chapters)) return [];
  const biome = String(pick(feuillet, 'biome_slug', 'biomeSlug') || '')
    .trim()
    .toLowerCase();
  const plateau = toNum(pick(feuillet, 'plateau_number', 'plateauNumber'));
  const pays = toNum(pick(feuillet, 'lien_pays', 'lienPays'));

  const out = [];
  for (const ch of chapters) {
    const chBiomes = (ch.biomeSlugs || [])
      .map((s) => String(s).trim().toLowerCase())
      .filter(Boolean);
    const chPlateau = toNum(pick(ch, 'plateau_number', 'plateauNumber'));
    const chPays = chapterPaysSet(chBiomes);

    let match = false;
    if (biome && chBiomes.includes(biome)) match = true;
    else if (plateau != null && chPlateau != null && plateau === chPlateau) match = true;
    else if (pays != null && chPays.has(pays)) match = true;

    if (match) out.push({ id: ch.id, name: ch.name ?? ch.titre ?? null });
  }
  return out;
}

module.exports = {
  chapterPaysSet,
  feuilletChapters,
};
