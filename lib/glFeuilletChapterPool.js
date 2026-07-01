'use strict';

/**
 * Pool de feuillets d'un chapitre — ensemble des feuillets « rattachables » à un
 * chapitre pour l'acquisition en jeu (stratégie ③). Un feuillet appartient au pool si :
 *  - son `biome_slug` est un biome du chapitre, **ou**
 *  - son `plateau_number` correspond au plateau du chapitre, **ou**
 *  - son `lien_pays` correspond au pays (1–5, équateur→pôle) du chapitre.
 *
 * Volontairement large et piloté par la donnée : affiner le rattachement fin se fait
 * via le corpus (`biome_slug`, `plateau_number`, `lien_*`) sans toucher au code.
 */

const { FEUILLET_SELECT } = require('./glLoreFeuillets');
const { biomeToPays } = require('./glBiomePays');

/** Ensemble des numéros de pays (1–5) couverts par une liste de biomes. Pur. */
function chapterPaysFromBiomes(biomeSlugs = []) {
  const pays = new Set();
  for (const slug of biomeSlugs) {
    const p = biomeToPays(slug);
    if (p != null) pays.add(p);
  }
  return [...pays];
}

/** Charge (plateau, biomes, pays) d'un chapitre. */
async function loadChapterScope(deps, chapterId) {
  const chapter = await deps.queryOne(
    'SELECT id, plateau_number FROM gl_chapters WHERE id = ? LIMIT 1',
    [chapterId],
  );
  if (!chapter) return null;
  const biomeRows = await deps.queryAll(
    'SELECT biome_slug FROM gl_chapter_biomes WHERE chapter_id = ? ORDER BY order_index ASC',
    [chapterId],
  );
  const biomeSlugs = biomeRows.map((r) => String(r.biome_slug)).filter(Boolean);
  const plateau = chapter.plateau_number != null ? Number(chapter.plateau_number) : null;
  return { plateau, biomeSlugs, pays: chapterPaysFromBiomes(biomeSlugs) };
}

/**
 * Construit la clause SQL (fragment + params) sélectionnant les feuillets du pool.
 * Renvoie `null` si le chapitre n'a aucun critère exploitable (pool vide garanti).
 */
function buildChapterPoolClause({ plateau, biomeSlugs = [], pays = [] }) {
  const parts = [];
  const params = [];
  if (biomeSlugs.length) {
    parts.push(`f.biome_slug IN (${biomeSlugs.map(() => '?').join(', ')})`);
    params.push(...biomeSlugs);
  }
  if (plateau != null && Number.isFinite(plateau)) {
    parts.push('f.plateau_number = ?');
    params.push(plateau);
  }
  if (pays.length) {
    parts.push(`f.lien_pays IN (${pays.map(() => '?').join(', ')})`);
    params.push(...pays);
  }
  if (!parts.length) return null;
  return { clause: `(${parts.join(' OR ')})`, params };
}

/**
 * Feuillets actifs du pool d'un chapitre, ordonnés par ordre de voyage/liasse.
 * @returns {Promise<object[]>}
 */
async function resolveChapterFeuilletPool(deps, { chapterId }) {
  const scope = await loadChapterScope(deps, chapterId);
  if (!scope) return [];
  const built = buildChapterPoolClause(scope);
  if (!built) return [];
  return deps.queryAll(
    `SELECT ${FEUILLET_SELECT}
       FROM gl_lore_feuillets f
      WHERE f.statut = 'actif' AND ${built.clause}
      ORDER BY f.ordre_voyage ASC, f.ordre_liasse ASC, f.feuillet_code ASC`,
    built.params,
  );
}

module.exports = {
  chapterPaysFromBiomes,
  loadChapterScope,
  buildChapterPoolClause,
  resolveChapterFeuilletPool,
};
