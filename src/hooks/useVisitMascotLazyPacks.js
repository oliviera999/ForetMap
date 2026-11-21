import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { buildVisitMascotCatalogExtrasFromContent } from '../utils/visitMascotPackExtras.js';

/**
 * Guides de la Visite chargés **à la demande** (audit UI/UX du 19/11/2026, lot 2 point 3).
 *
 * `GET /api/visit/content` ne sert plus que le pack du guide par défaut (`mascot_packs`) et
 * une liste légère des guides proposés (`mascot_catalog` : `{ catalog_id, label, variant_of,
 * fallback_silhouette, thumbnail_url }`).
 * Ce hook :
 *
 *  - fabrique une entrée **provisoire** par guide pas encore chargé (même identifiant, même
 *    libellé, rendu `sprite_cut` sans images → silhouette de repli) : le sélecteur et la
 *    normalisation du choix mémorisé la reconnaissent, donc un choix fait lors d'une visite
 *    précédente n'est jamais écrasé par le guide par défaut le temps d'un chargement ;
 *  - charge le pack complet (`GET /api/visit/mascots/:catalogId`) quand on le demande
 *    (`ensurePack`) et remplace l'entrée provisoire ; cache au niveau du module (une requête
 *    par guide et par session, échec silencieux : la silhouette reste) ;
 *  - reporte sur chaque entrée, provisoire ou complète, la **vignette** du guide
 *    (`thumbnailUrl`, PNG ≤ 96 px) : le sélecteur montre tous les guides sans charger une
 *    seule planche de sprites.
 *
 * Mode inactif (`catalog` absent — ancien serveur) : renvoie `active: false` et l'appelant
 * garde le registre complet.
 */

/** @type {Map<string, object>} entrées complètes déjà chargées, par identifiant */
const loadedEntries = new Map();
/** @type {Map<string, Promise<object|null>>} */
const pendingLoads = new Map();

function loadPackEntry(catalogId) {
  const id = String(catalogId || '').trim();
  if (!id) return Promise.resolve(null);
  if (loadedEntries.has(id)) return Promise.resolve(loadedEntries.get(id));
  if (!pendingLoads.has(id)) {
    pendingLoads.set(
      id,
      api(`/api/visit/mascots/${encodeURIComponent(id)}`)
        .then((row) => {
          const [entry] = buildVisitMascotCatalogExtrasFromContent([row]);
          if (entry) loadedEntries.set(id, entry);
          return entry || null;
        })
        .catch(() => null)
        .finally(() => pendingLoads.delete(id)),
    );
  }
  return pendingLoads.get(id);
}

/** Vide le cache (tests). */
export function resetVisitMascotLazyPacksCache() {
  loadedEntries.clear();
  pendingLoads.clear();
}

/**
 * Entrée provisoire d'un guide pas encore chargé.
 * @param {{ catalog_id: string, label: string, variant_of?: string|null, fallback_silhouette?: string|null, thumbnail_url?: string|null }} row
 */
export function buildPlaceholderMascotEntry(row) {
  const id = String(row?.catalog_id || '').trim();
  const label = String(row?.label || id).trim() || id;
  return {
    id,
    label,
    renderer: 'sprite_cut',
    spriteCut: null,
    fallbackSilhouette: String(row?.fallback_silhouette || '').trim() || 'gnome',
    thumbnailUrl: normalizeThumbnailUrl(row?.thumbnail_url),
    isPlaceholder: true,
  };
}

/** Vignette servie par le contenu : chemin de l'application seulement, sinon `null`. */
function normalizeThumbnailUrl(value) {
  const url = String(value || '').trim();
  return url.startsWith('/api/visit/mascot-packs/') ? url : null;
}

/** Entrée complète enrichie de la vignette du catalogue (même objet s'il n'y en a pas). */
function withThumbnail(entry, row) {
  const thumbnailUrl = normalizeThumbnailUrl(row?.thumbnail_url);
  if (!thumbnailUrl || entry.thumbnailUrl === thumbnailUrl) return entry;
  return { ...entry, thumbnailUrl };
}

/**
 * @param {object} params
 * @param {Array<{ catalog_id: string, label: string, variant_of?: string|null }>|null|undefined} params.catalog
 *   liste légère servie par le contenu (`mascot_catalog`).
 * @param {Array<object>|undefined} params.contentPacks packs complets servis par le contenu.
 * @returns {{ active: boolean, extras: Array<object>, offeredIds: string[]|null,
 *   variantOfById: Map<string, string>, ensurePack: (id: string) => void }}
 */
export function useVisitMascotLazyPacks({ catalog, contentPacks }) {
  const active = Array.isArray(catalog);
  const [version, setVersion] = useState(0);

  const fromContent = useMemo(
    () => buildVisitMascotCatalogExtrasFromContent(contentPacks),
    [contentPacks],
  );
  useEffect(() => {
    for (const entry of fromContent) {
      const id = String(entry?.id || '').trim();
      if (id && !loadedEntries.has(id)) loadedEntries.set(id, entry);
    }
  }, [fromContent]);

  const extras = useMemo(() => {
    if (!active) return fromContent;
    const byId = new Map(fromContent.map((e) => [String(e.id), e]));
    const out = [];
    for (const row of catalog) {
      const id = String(row?.catalog_id || '').trim();
      if (!id) continue;
      const full = byId.get(id) || loadedEntries.get(id);
      out.push(full ? withThumbnail(full, row) : buildPlaceholderMascotEntry(row));
    }
    return out;
    // `version` : nouvel état du cache module après un chargement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, catalog, fromContent, version]);

  const offeredIds = useMemo(() => {
    if (!active || catalog.length === 0) return null;
    return catalog.map((row) => String(row?.catalog_id || '').trim()).filter(Boolean);
  }, [active, catalog]);

  const variantOfById = useMemo(() => {
    const map = new Map();
    if (!active) return map;
    const ids = new Set(catalog.map((row) => String(row?.catalog_id || '').trim()));
    for (const row of catalog) {
      const id = String(row?.catalog_id || '').trim();
      const base = String(row?.variant_of || '').trim();
      // Une variante dont la base n'est pas proposée redevient un guide à part entière.
      if (id && base && ids.has(base)) map.set(id, base);
    }
    return map;
  }, [active, catalog]);

  const ensurePack = useCallback(
    (catalogId) => {
      const id = String(catalogId || '').trim();
      if (!active || !id || loadedEntries.has(id)) return;
      if (!catalog.some((row) => String(row?.catalog_id || '').trim() === id)) return;
      loadPackEntry(id).then((entry) => {
        if (entry) setVersion((v) => v + 1);
      });
    },
    [active, catalog],
  );

  return { active, extras, offeredIds, variantOfById, ensurePack };
}
