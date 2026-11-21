import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import {
  filterStartSpecies,
  startSpeciesCandidates,
} from '../components/pedago/foodWebProfileModel.js';

/**
 * Espèces de départ du réseau « collège » (flux C3) : chaque espèce qui a un lien montré, les
 * **espèces phares** de la carte en tête (`is_featured` de `GET /api/maps/:id/species`), puis
 * une recherche par nom.
 *
 * Les espèces phares ne sont demandées qu'en mode collège et avec une carte choisie ; une
 * erreur de chargement laisse simplement la liste sans tête (la recherche reste possible).
 *
 * @param {{ enabled: boolean, mapId: string, shownItems: object[] }} options
 */
export function useFoodWebStartSpecies({ enabled, mapId, shownItems }) {
  const [featuredIds, setFeaturedIds] = useState([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!enabled || !mapId) {
      setFeaturedIds([]);
      return undefined;
    }
    let cancelled = false;
    api(`/api/maps/${encodeURIComponent(mapId)}/species`)
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.species) ? data.species : [];
        setFeaturedIds(list.filter((s) => s?.is_featured).map((s) => Number(s.plant_id)));
      })
      .catch(() => {
        if (!cancelled) setFeaturedIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, mapId]);

  // Changer de carte remet la recherche à zéro : elle portait sur une autre liste.
  useEffect(() => {
    setQuery('');
  }, [mapId]);

  const candidates = useMemo(
    () => (enabled ? startSpeciesCandidates(shownItems, { featuredIds }) : []),
    [enabled, shownItems, featuredIds],
  );
  const listed = useMemo(() => filterStartSpecies(candidates, query), [candidates, query]);

  return { candidates, query, setQuery, ...listed };
}
