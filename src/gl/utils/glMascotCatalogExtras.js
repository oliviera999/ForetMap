/**
 * Extrait les entrées `sprite_cut` du catalogue GL (packs visit publiés) pour VisitMapMascotRenderer.
 * @param {Array<object>} mascots
 * @returns {Array<object>}
 */
export function buildGlMascotExtraCatalogEntries(mascots) {
  const rows = Array.isArray(mascots) ? mascots : [];
  const out = [];
  for (const row of rows) {
    if (!row || row.renderer !== 'sprite_cut' || !row.spriteCut) continue;
    const id = String(row.id || '').trim();
    if (!id) continue;
    out.push({
      id,
      label: String(row.label || id).trim(),
      renderer: 'sprite_cut',
      fallbackSilhouette: row.fallbackSilhouette || 'gnome',
      spriteCut: row.spriteCut,
      ...(row.interactionProfile ? { interactionProfile: row.interactionProfile } : {}),
      ...(row.dialogProfile ? { dialogProfile: row.dialogProfile } : {}),
      ...(Array.isArray(row.customStates) && row.customStates.length
        ? { customStates: row.customStates }
        : {}),
      ...(Array.isArray(row.customTriggers) && row.customTriggers.length
        ? { customTriggers: row.customTriggers }
        : {}),
      ...(row.mascotPackVersion ? { mascotPackVersion: row.mascotPackVersion } : {}),
    });
  }
  return out;
}
