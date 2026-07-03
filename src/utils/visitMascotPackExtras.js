import { validateMascotPackV1 } from './mascotPack.js';

/**
 * Une entrée catalogue visite à partir d’un pack déjà validé (studio / aperçu live).
 * @param {{ ok: true, pack: object, spriteCut: object }} validated
 * @param {string} catalogId
 * @param {string} [label]
 */
export function buildVisitMascotCatalogExtraFromValidated(validated, catalogId, label = '') {
  if (!validated?.ok) return null;
  const id = String(catalogId || validated.pack.id || '').trim();
  if (!id) return null;
  const ver = Number(validated.pack.mascotPackVersion) === 2 ? 2 : 1;
  return {
    id,
    label: String(label || validated.pack.label || id).trim() || id,
    renderer: 'sprite_cut',
    fallbackSilhouette: validated.pack.fallbackSilhouette || 'gnome',
    spriteCut: validated.spriteCut,
    ...(ver === 2 && validated.pack.interactionProfile
      ? { interactionProfile: validated.pack.interactionProfile }
      : {}),
    ...(ver === 2 && validated.pack.dialogProfile
      ? { dialogProfile: validated.pack.dialogProfile }
      : {}),
    ...(Array.isArray(validated.pack.customStates) && validated.pack.customStates.length
      ? { customStates: validated.pack.customStates }
      : {}),
    ...(Array.isArray(validated.pack.customTriggers) && validated.pack.customTriggers.length
      ? { customTriggers: validated.pack.customTriggers }
      : {}),
    mascotPackVersion: ver,
  };
}

/**
 * Construit des entrées catalogue visite (`sprite_cut`) à partir de `GET /api/visit/content` → `mascot_packs`.
 * @param {Array<{ catalog_id: string, label: string, pack: object }>} mascotPacks
 * @returns {Array<{ id: string, label: string, renderer: 'sprite_cut', fallbackSilhouette: string, spriteCut: object, interactionProfile?: object, dialogProfile?: object, mascotPackVersion?: number }>}
 */
export function buildVisitMascotCatalogExtrasFromContent(mascotPacks) {
  const rows = Array.isArray(mascotPacks) ? mascotPacks : [];
  const out = [];
  for (const row of rows) {
    const catalogId = String(row?.catalog_id || '').trim();
    const label = String(row?.label || '').trim();
    const pack = row?.pack;
    if (!catalogId || !pack || typeof pack !== 'object') continue;
    const relaxed = validateMascotPackV1(pack, { relaxAssetPrefix: true });
    if (!relaxed.ok) continue;
    const entry = buildVisitMascotCatalogExtraFromValidated(relaxed, catalogId, label);
    if (entry) out.push(entry);
  }
  return out;
}
