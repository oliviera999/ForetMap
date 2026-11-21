'use strict';

/**
 * Mascottes servies avec le contenu de la Visite (`GET /api/visit/content`), allégées.
 *
 * Jusqu'au 20/11/2026, le contenu embarquait le JSON complet de **tous** les packs publiés
 * (plus de 30 états chacun) : l'essentiel des 319 Ko servis pour la carte `foret`
 * (`docs/AUDIT_UI_UX_2026-11-19.md`, U1 et lot 2 point 3). Désormais :
 *
 *  - `mascot_catalog` : liste **légère** des guides proposés dans la Visite
 *    (`{ catalog_id, label, variant_of, fallback_silhouette, thumbnail_url }`, sans JSON) —
 *    elle nourrit le sélecteur de la barre ;
 *  - `mascot_packs` : le **seul** pack du guide par défaut (même forme qu'avant :
 *    `{ catalog_id, label, pack }`), pour que la carte s'affiche avec son guide sans
 *    requête supplémentaire. Le pack d'un autre guide est chargé à la demande
 *    (`GET /api/visit/mascots/:catalogId`).
 *
 * Le guide par défaut est relu **à chaque réponse** (réglage `ui.visit.mascot.default_id`),
 * pas mémorisé dans le cache du contenu : changer de guide par défaut en administration prend
 * effet sans attendre une écriture de données.
 *
 * Repli documenté : si le réglage désigne un pack absent de la liste (non publié, retiré de
 * la Visite) ou est vide, le premier pack « de base » proposé est servi (le front, lui, sait
 * aussi retomber sur la mascotte livrée par défaut si aucun pack n'est proposé).
 */

/** Clé interne du cache : packs complets, retirée de toute réponse. */
const FULL_PACKS_KEY = '_mascot_packs_full';

const { visitMascotPackThumbnailUrlIfPresent } = require('./visitMascotPackThumbnail');

/**
 * `thumbnail_url` : petite image fixe du guide (PNG ≤ 96 px, `lib/visitMascotPackThumbnail.js`)
 * pour le sélecteur, `null` tant qu'elle n'a pas été générée. Relue **à chaque réponse** (un
 * test d'existence par pack, hors cache du contenu) : une vignette écrite juste après
 * l'enregistrement d'un pack apparaît sans attendre une nouvelle écriture de données.
 *
 * @param {Array<{ id: string, label: string, pack: object, variant_of?: string|null, pack_uuid?: string|null }>} packs
 * @param {(packUuid: string) => string|null} [thumbnailUrlFor]
 * @returns {Array<{ catalog_id: string, label: string, variant_of: string|null, fallback_silhouette: string|null, thumbnail_url: string|null }>}
 */
function buildVisitMascotCatalog(packs, thumbnailUrlFor = visitMascotPackThumbnailUrlIfPresent) {
  return (Array.isArray(packs) ? packs : [])
    .filter((p) => p && p.id)
    .map((p) => ({
      catalog_id: String(p.id),
      label: String(p.label || p.id),
      variant_of: p.variant_of ? String(p.variant_of) : null,
      // Silhouette de repli affichée le temps de charger le pack complet.
      fallback_silhouette:
        p.pack && typeof p.pack.fallbackSilhouette === 'string' ? p.pack.fallbackSilhouette : null,
      thumbnail_url: p.pack_uuid ? thumbnailUrlFor(String(p.pack_uuid)) || null : null,
    }));
}

/**
 * Pack du guide par défaut, ou repli sur le premier pack de base proposé.
 * @param {Array<{ id: string, label: string, pack: object, variant_of?: string|null }>} packs
 * @param {string} defaultId
 * @returns {{ id: string, label: string, pack: object }|null}
 */
function pickDefaultVisitMascotPack(packs, defaultId) {
  const list = (Array.isArray(packs) ? packs : []).filter((p) => p && p.id && p.pack);
  if (list.length === 0) return null;
  const wanted = String(defaultId || '').trim();
  if (wanted) {
    const found = list.find((p) => String(p.id) === wanted);
    if (found) return found;
  }
  return list.find((p) => !p.variant_of) || list[0];
}

/**
 * Projette les mascottes d'un contenu (en cache ou neuf) pour la réponse.
 * @param {object} payload contenu projeté pour le lecteur (porte `_mascot_packs_full`).
 * @param {string} defaultId réglage `ui.visit.mascot.default_id`.
 * @returns {object}
 */
function withVisitContentMascots(payload, defaultId) {
  if (!payload || typeof payload !== 'object') return payload;
  const { [FULL_PACKS_KEY]: full, ...rest } = payload;
  if (!Array.isArray(full)) return rest;
  const chosen = pickDefaultVisitMascotPack(full, defaultId);
  return {
    ...rest,
    mascot_catalog: buildVisitMascotCatalog(full),
    mascot_default_id: chosen ? String(chosen.id) : null,
    mascot_packs: chosen
      ? [{ catalog_id: String(chosen.id), label: chosen.label, pack: chosen.pack }]
      : [],
  };
}

module.exports = {
  FULL_PACKS_KEY,
  buildVisitMascotCatalog,
  pickDefaultVisitMascotPack,
  withVisitContentMascots,
};
