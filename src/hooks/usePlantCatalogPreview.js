import { useCallback, useState } from 'react';

/**
 * État autonome de la modale d'aperçu fiche plante (extrait de App.jsx, O5).
 *
 * Regroupe l'unique état `plantCatalogPreview` et les deux ouvertures associées :
 * - `openPlantCatalogPreviewById` : retrouve la plante dans le catalogue par id
 *   (no-op si id invalide ou plante absente) ;
 * - `setPlantCatalogPreview` : conservé pour la fermeture (`onClose` de la modale).
 *
 * Concern strictement local à l'UI : aucune dépendance au cœur
 * fetchAll/polling/realtime/session. La seule entrée est la liste `plants`.
 * Iso-comportement avec l'ancien état inline d'App.jsx.
 *
 * @param {Array<{ id: number | string }>} [plants] Catalogue des plantes.
 */
export function usePlantCatalogPreview(plants) {
  const [plantCatalogPreview, setPlantCatalogPreview] = useState(null);

  const openPlantCatalogPreviewById = useCallback(
    (plantId) => {
      const id = Number(plantId);
      if (!Number.isFinite(id) || id <= 0) return;
      const p = (plants || []).find((x) => Number(x.id) === id);
      if (p) setPlantCatalogPreview(p);
    },
    [plants],
  );

  return {
    plantCatalogPreview,
    setPlantCatalogPreview,
    openPlantCatalogPreviewById,
  };
}
