/**
 * Médias et blocs éditoriaux « visite » des modales de lieu (MarkerModal / ZoneInfoModal).
 * Mutualise le chargement (photos du lieu + médias visite), le tri (`sortVisitMedia`),
 * la dérivation des blocs image et l'association d'une photo à la visite — logique
 * copiée 4× avant l'audit §5.3 (comparateur strictement identique des deux côtés).
 */
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { computeMarkerVisitImageBlocks } from '../../utils/markerModalForm.js';
import { parseVisitEditorialBlocksFromJson } from '../../utils/visitEditorialBlocks.js';

/** Tri des médias visite : `sort_order` croissant puis `id` croissant (copie triée). */
export function sortVisitMedia(list) {
  return [...(list || [])].sort(
    (a, b) =>
      (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || Number(a.id) - Number(b.id),
  );
}

/** Spécificités par type de lieu : endpoint photos et collection dans /api/visit/content. */
const VISIT_TARGETS = {
  marker: { photosUrl: (id) => `/api/map/markers/${id}/photos`, collection: 'markers' },
  zone: { photosUrl: (id) => `/api/zones/${id}/photos`, collection: 'zones' },
};

/**
 * État « médias + blocs image de visite » d'un lieu (zone ou repère).
 *
 * @param {'marker'|'zone'} targetType - type de lieu (`target_type` de /api/visit/media)
 * @param {string|number} targetId - id du lieu
 * @param {string|number} mapId - carte du lieu (filtre /api/visit/content)
 * @param {string} visitBodyJson - JSON brut des blocs éditoriaux du lieu
 * @param {boolean} enabled - false (repère en création) : pas de chargement ni de recalcul
 * @param {Function} onToast - affichage des toasts de l'association photo
 */
export function useVisitMediaBlocks({
  targetType,
  targetId,
  mapId,
  visitBodyJson,
  enabled = true,
  onToast,
}) {
  const target = VISIT_TARGETS[targetType];
  const [visitEditorialBlocks, setVisitEditorialBlocks] = useState(() =>
    parseVisitEditorialBlocksFromJson(visitBodyJson),
  );
  const [visitMediaOptions, setVisitMediaOptions] = useState([]);
  const [photoOptions, setPhotoOptions] = useState([]);

  useEffect(() => {
    if (!enabled || !targetId) {
      setVisitMediaOptions([]);
      setPhotoOptions([]);
      return;
    }
    let cancel = false;
    (async () => {
      try {
        const [photos, content] = await Promise.all([
          api(target.photosUrl(targetId)),
          api(`/api/visit/content?map_id=${encodeURIComponent(mapId || '')}`),
        ]);
        if (cancel) return;
        const entityVisit = (content?.[target.collection] || []).find(
          (x) => String(x.id) === String(targetId),
        );
        setVisitMediaOptions(sortVisitMedia(entityVisit?.visit_media));
        setPhotoOptions(Array.isArray(photos) ? photos : []);
      } catch (_) {
        if (!cancel) {
          setVisitMediaOptions([]);
          setPhotoOptions([]);
        }
      }
    })();
    return () => {
      cancel = true;
    };
    // `target` dérive de targetType (constante module) : dépendre du type suffit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, targetType, targetId, mapId]);

  useEffect(() => {
    if (!enabled) return;
    setVisitEditorialBlocks(computeMarkerVisitImageBlocks(visitBodyJson, visitMediaOptions));
  }, [enabled, visitBodyJson, targetId, visitMediaOptions]);

  const imageBlocks = useMemo(
    () => visitEditorialBlocks.filter((b) => b.type === 'image'),
    [visitEditorialBlocks],
  );
  const addImageBlock = () => {
    const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setVisitEditorialBlocks((prev) => [
      ...prev,
      {
        id,
        type: 'image',
        media_ids: [],
        layout: 'single',
        size: 'md',
        align: 'center',
        caption: '',
      },
    ]);
  };
  const updateImageBlock = (id, patch) => {
    setVisitEditorialBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };
  const removeImageBlock = (id) => {
    setVisitEditorialBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  /** Associe une photo du lieu aux médias visite puis recharge la liste triée. */
  const attachPhotoToVisit = async (photo) => {
    if (!photo?.image_url || !targetId) return;
    try {
      await api('/api/visit/media', 'POST', {
        target_type: targetType,
        target_id: targetId,
        image_url: String(photo.image_url || '').trim(),
        caption: String(photo.caption || '').trim(),
      });
      const content = await api(`/api/visit/content?map_id=${encodeURIComponent(mapId || '')}`);
      const entityVisit = (content?.[target.collection] || []).find(
        (x) => String(x.id) === String(targetId),
      );
      setVisitMediaOptions(sortVisitMedia(entityVisit?.visit_media));
      onToast?.('Photo associée à la visite ✓');
    } catch (e) {
      onToast?.(e?.message || 'Erreur association photo');
    }
  };

  return {
    visitEditorialBlocks,
    visitMediaOptions,
    photoOptions,
    imageBlocks,
    addImageBlock,
    updateImageBlock,
    removeImageBlock,
    attachPhotoToVisit,
  };
}
