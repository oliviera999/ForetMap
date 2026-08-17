/**
 * Forme d'une entrée catalogue `sprite_cut` — helper partagé **ForetMap / G&L**.
 *
 * Les deux produits alimentent le même renderer (`VisitMapMascotRenderer`) et
 * construisaient chacun le même objet, champ par champ : `buildVisitMascotCatalogExtraFromValidated`
 * (packs de visite) et `buildGlMascotExtraCatalogEntries` (catalogue GL unifié). Un champ
 * ajouté au pack devait être répercuté aux deux endroits — d'où des oublis (les
 * `customStates` / `customTriggers` d'un pack visite ne voyageaient pas côté GL).
 *
 * Les champs optionnels ne sont posés que s'ils portent une valeur : une entrée reste
 * comparable à l'identique avec les entrées du catalogue statique.
 *
 * @param {object} input
 * @param {string} input.id identifiant catalogue.
 * @param {string} [input.label] libellé affiché (défaut : l'identifiant).
 * @param {string} [input.fallbackSilhouette] silhouette SVG de secours.
 * @param {object} input.spriteCut configuration `sprite_cut` déjà expansée.
 * @param {object} [input.interactionProfile]
 * @param {object} [input.dialogProfile]
 * @param {Array} [input.customStates]
 * @param {Array} [input.customTriggers]
 * @param {number} [input.mascotPackVersion]
 * @returns {object|null} entrée catalogue, ou `null` si l'identifiant ou le `spriteCut` manque.
 */
export function buildSpriteCutCatalogEntry({
  id,
  label = '',
  fallbackSilhouette = 'gnome',
  spriteCut,
  interactionProfile = null,
  dialogProfile = null,
  customStates = null,
  customTriggers = null,
  mascotPackVersion = null,
} = {}) {
  const entryId = String(id || '').trim();
  if (!entryId || !spriteCut) return null;
  return {
    id: entryId,
    label: String(label || entryId).trim() || entryId,
    renderer: 'sprite_cut',
    fallbackSilhouette: fallbackSilhouette || 'gnome',
    spriteCut,
    ...(interactionProfile ? { interactionProfile } : {}),
    ...(dialogProfile ? { dialogProfile } : {}),
    ...(Array.isArray(customStates) && customStates.length ? { customStates } : {}),
    ...(Array.isArray(customTriggers) && customTriggers.length ? { customTriggers } : {}),
    ...(mascotPackVersion ? { mascotPackVersion } : {}),
  };
}
