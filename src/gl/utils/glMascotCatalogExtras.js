import { buildSpriteCutCatalogEntry } from '../../shared/mascot-pack/spriteCutCatalogEntry.js';

/**
 * Extrait les entrées `sprite_cut` du catalogue GL (packs visit publiés) pour VisitMapMascotRenderer.
 * La forme de l'entrée est celle du helper partagé FM/GL (`buildSpriteCutCatalogEntry`).
 * @param {Array<object>} mascots
 * @returns {Array<object>}
 */
export function buildGlMascotExtraCatalogEntries(mascots) {
  const rows = Array.isArray(mascots) ? mascots : [];
  const out = [];
  for (const row of rows) {
    if (!row || row.renderer !== 'sprite_cut' || !row.spriteCut) continue;
    const entry = buildSpriteCutCatalogEntry({
      id: row.id,
      label: row.label,
      fallbackSilhouette: row.fallbackSilhouette,
      spriteCut: row.spriteCut,
      interactionProfile: row.interactionProfile,
      dialogProfile: row.dialogProfile,
      customStates: row.customStates,
      customTriggers: row.customTriggers,
      mascotPackVersion: row.mascotPackVersion,
    });
    if (entry) out.push(entry);
  }
  return out;
}
