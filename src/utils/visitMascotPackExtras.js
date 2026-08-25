import { validateMascotPackV1 } from './mascotPack.js';
import { buildMascotCatalogEntry } from '../shared/mascot-pack/spriteCutCatalogEntry.js';

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
  // Profils d'interaction/dialogue : réservés aux packs v2 (un pack v1 n'en porte pas).
  // `renderer`/`animation` plutôt que `spriteCut` : un pack peut désormais décrire les trois
  // moteurs, et n'en poser qu'un — se limiter à `spriteCut` rendrait `null` pour les deux autres,
  // donc une mascotte publiée qui n'arrive jamais au sélecteur, sans message.
  return buildMascotCatalogEntry({
    id,
    renderer: validated.renderer || validated.pack.renderer,
    animation: validated.animation ?? validated.spriteCut,
    label: label || validated.pack.label || id,
    fallbackSilhouette: validated.pack.fallbackSilhouette,
    interactionProfile: ver === 2 ? validated.pack.interactionProfile : null,
    dialogProfile: ver === 2 ? validated.pack.dialogProfile : null,
    customStates: validated.pack.customStates,
    customTriggers: validated.pack.customTriggers,
    mascotPackVersion: ver,
  });
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
