import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { buildVisitMascotCatalogExtrasFromContent } from '../utils/visitMascotPackExtras.js';

/**
 * Récupère les packs mascotte **serveur publiés** d'une carte (via `GET /api/visit/content`)
 * et construit les entrées catalogue (`extras`) attendues par le renderer / la résolution de
 * mascotte. Permet à la carte d'afficher une mascotte issue d'un pack **importé** (catalog_id
 * `srv-…`), au lieu de retomber sur le catalogue statique.
 *
 * Même source que la visite publique (`/api/visit/content` → `mascot_packs`, `is_published = 1`)
 * : aucun token requis (assets publics). Renvoie `[]` tant que désactivé / en erreur.
 *
 * @param {{ mapId?: string, enabled?: boolean }} [params]
 * @returns {Array<object>} entrées catalogue `sprite_cut`
 */
export default function useVisitMascotCatalogExtras({ mapId, enabled = true } = {}) {
  const [extras, setExtras] = useState([]);

  useEffect(() => {
    const mid = String(mapId || '').trim();
    if (!enabled || !mid) {
      setExtras([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api(`/api/visit/content?map_id=${encodeURIComponent(mid)}`);
        const packs = Array.isArray(res?.mascot_packs) ? res.mascot_packs : [];
        const next = buildVisitMascotCatalogExtrasFromContent(packs);
        if (!cancelled) setExtras(next);
      } catch (_) {
        if (!cancelled) setExtras([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mapId, enabled]);

  return extras;
}
