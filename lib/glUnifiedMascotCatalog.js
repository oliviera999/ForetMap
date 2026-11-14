'use strict';

const { loadPublishedVisitMascotPackCatalogEntries } = require('./visitMascotPackCatalog');

/**
 * Catalogue des mascottes proposées par G&L = **packs publiés du studio ForêtMap**
 * (`visit_mascot_packs.is_published = 1`, identifiants `srv-…`), et rien d'autre.
 *
 * Publier ou dépublier un pack au studio suffit à le faire apparaître ou disparaître dans G&L,
 * sans redéploiement : le catalogue est relu en base à chaque appel (aucun cache).
 *
 * Sources retirées en novembre 2026 : les mascottes SVG `gl-*` codées en dur
 * (`src/gl/utils/glMascotCatalog.js`, gardé comme simple palette du rendu de repli), les
 * mascottes livrées ForêtMap (supprimées au studio, mais que G&L ignorait) et la table
 * `gl_mascot_packs` (studio de packs GL, doublon du studio ForêtMap).
 *
 * Chaque entrée porte un `type` (`gnome` | `unicorn` | `null`) : `pack.type` s'il est fixé au
 * studio, sinon déduit du libellé (`lib/glMascotType.js`). Une entrée sans type reste
 * assignable à la main, mais n'est jamais choisie par défaut ni par la composition automatique.
 */
async function loadCatalog() {
  const entries = await loadPublishedVisitMascotPackCatalogEntries();
  return Array.isArray(entries) ? entries : [];
}

async function getGlUnifiedMascotCatalog() {
  const catalog = await loadCatalog();
  return catalog.map((entry) => ({ ...entry }));
}

async function getGlUnifiedMascotById(mascotId) {
  const id = String(mascotId || '').trim();
  if (!id) return null;
  const catalog = await loadCatalog();
  const row = catalog.find((item) => String(item.id) === id);
  return row ? { ...row } : null;
}

/** Conservé pour les tests : le catalogue n'a plus de cache, il n'y a rien à vider. */
function invalidateGlUnifiedMascotCatalogForTests() {}

module.exports = {
  getGlUnifiedMascotCatalog,
  getGlUnifiedMascotById,
  invalidateGlUnifiedMascotCatalogForTests,
};
