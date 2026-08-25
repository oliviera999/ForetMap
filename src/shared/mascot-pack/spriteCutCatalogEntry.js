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

/**
 * Entrée catalogue pour **n'importe lequel des trois moteurs** — la généralisation de
 * `buildSpriteCutCatalogEntry`, devenue nécessaire quand le format de pack a cessé d'être
 * réservé à `sprite_cut`.
 *
 * La clé où loger la configuration dépend du moteur (`spriteCut`, `spritesheet`, `rive`) : c'est
 * ce que `VisitMapMascotRenderer` va lire pour choisir son moteur. Se tromper de clé ne lève pas
 * d'erreur — la mascotte retombe simplement sur la silhouette SVG, en silence.
 *
 * @param {object} input
 * @param {string} input.id identifiant catalogue.
 * @param {'sprite_cut'|'spritesheet'|'rive'} input.renderer
 * @param {object} input.animation configuration du moteur (déjà expansée pour `sprite_cut`).
 * @returns {object|null} entrée catalogue, ou `null` si l'identifiant, le moteur ou la config manque.
 */
export function buildMascotCatalogEntry({
  id,
  renderer,
  animation,
  label = '',
  fallbackSilhouette = 'gnome',
  interactionProfile = null,
  dialogProfile = null,
  customStates = null,
  customTriggers = null,
  mascotPackVersion = null,
} = {}) {
  const entryId = String(id || '').trim();
  const configKey =
    renderer === 'sprite_cut' ? 'spriteCut' : renderer === 'spritesheet' ? 'spritesheet' : 'rive';
  if (!entryId || !animation || !['sprite_cut', 'spritesheet', 'rive'].includes(renderer)) {
    return null;
  }
  return {
    id: entryId,
    label: String(label || entryId).trim() || entryId,
    renderer,
    fallbackSilhouette: fallbackSilhouette || 'gnome',
    [configKey]: animation,
    ...(interactionProfile ? { interactionProfile } : {}),
    ...(dialogProfile ? { dialogProfile } : {}),
    ...(Array.isArray(customStates) && customStates.length ? { customStates } : {}),
    ...(Array.isArray(customTriggers) && customTriggers.length ? { customTriggers } : {}),
    ...(mascotPackVersion ? { mascotPackVersion } : {}),
  };
}
