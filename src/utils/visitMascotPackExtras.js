import { validateMascotPackV1 } from './mascotPack.js';

/**
 * Construit des entrées catalogue visite (`sprite_cut`) à partir de `GET /api/visit/content` → `mascot_packs`.
 * @param {Array<{ catalog_id: string, label: string, pack: object }>} mascotPacks
 * @returns {Array<{ id: string, label: string, renderer: 'sprite_cut', fallbackSilhouette: string, spriteCut: object, interactionProfile?: object, mascotPackVersion?: number }>}
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
    const ver = Number(relaxed.pack.mascotPackVersion) === 2 ? 2 : 1;
    out.push({
      id: catalogId,
      label: label || relaxed.pack.label,
      renderer: 'sprite_cut',
      fallbackSilhouette: relaxed.pack.fallbackSilhouette || 'gnome',
      spriteCut: relaxed.spriteCut,
      ...(ver === 2 && relaxed.pack.interactionProfile
        ? { interactionProfile: relaxed.pack.interactionProfile }
        : {}),
      mascotPackVersion: ver,
    });
  }
  return out;
}
