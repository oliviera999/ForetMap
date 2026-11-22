import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import {
  addToSelection,
  defaultSelectionDepth,
  filterSelectionCandidates,
  readStoredSelection,
  removeFromSelection,
  selectionCandidates,
  toggleInSelection,
  writeStoredSelection,
} from '../components/pedago/foodWebSelectionModel.js';
import { normalizeSeedIds } from '../components/pedago/foodWebProfileModel.js';

/** `sessionStorage` du navigateur, ou `null` (rendu serveur, accès refusé). */
function sessionStore() {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/**
 * Sélection d'espèces du réseau trophique au collège (chantier collège du 22/11/2026, lot 2 ;
 * remplace l'« espèce de départ » unique et `useFoodWebStartSpecies`).
 *
 * - `selection` : liste ordonnée d'identifiants ; `toggle` / `add` / `remove` / `clear` ;
 * - pré-remplie par une demande (séance `plantIds` / `highlightPlantId`, « Voir le réseau »
 *   d'une fiche), appliquée une fois par `requestKey`, et **toujours modifiable** ensuite ;
 * - conservée au changement de carte (une espèce absente de la nouvelle carte reste, grisée) ;
 * - mémoire de session légère par carte (`sessionStorage`, lectures et écritures protégées) ;
 * - profondeur : choix de l'élève, sinon défaut (`defaultSelectionDepth`) ; « seulement les
 *   liens entre mes espèces » (0) n'existe qu'à partir de deux espèces ;
 * - candidats : liens filtrés par profil **avant cadrage**, espèces phares de la carte en tête
 *   (`GET /api/maps/:id/species`), recherche sans accents, espèces sans lien trouvables.
 *
 * @param {{ enabled: boolean, mapId: string, requested: number[], requestKey?: unknown,
 *   profileItems: object[], plants?: object[] }} options
 */
export function useFoodWebSelection({
  enabled,
  mapId,
  requested,
  requestKey = null,
  profileItems,
  plants = [],
}) {
  const [selection, setSelection] = useState(() => {
    const asked = normalizeSeedIds(requested);
    if (asked.length) return asked;
    return enabled ? readStoredSelection(sessionStore(), mapId) : [];
  });
  const [depthChoice, setDepthChoice] = useState(null);
  const [featuredIds, setFeaturedIds] = useState([]);
  const [query, setQuery] = useState('');

  // Demande extérieure (fiche, séance) : elle remplace la sélection, une fois par clé.
  const appliedRequestRef = useRef(null);
  useEffect(() => {
    const asked = normalizeSeedIds(requested);
    const key = `${requestKey ?? ''}|${asked.join(',')}`;
    if (appliedRequestRef.current === key) return;
    appliedRequestRef.current = key;
    if (asked.length === 0) return;
    setSelection(asked);
    setDepthChoice(null);
  }, [requested, requestKey]);

  // Mémoire de session par carte (confort seulement).
  useEffect(() => {
    if (!enabled) return;
    writeStoredSelection(sessionStore(), mapId, selection);
  }, [enabled, mapId, selection]);

  // Espèces phares de la carte, en tête des candidats.
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

  const toggle = useCallback((id) => setSelection((cur) => toggleInSelection(cur, id)), []);
  const add = useCallback((id) => setSelection((cur) => addToSelection(cur, id)), []);
  const remove = useCallback((id) => setSelection((cur) => removeFromSelection(cur, id)), []);
  const clear = useCallback(() => {
    setSelection([]);
    setDepthChoice(null);
  }, []);
  const has = useCallback((id) => selection.includes(Number(id)), [selection]);

  const fallbackDepth = useMemo(
    () => defaultSelectionDepth(profileItems, selection),
    [profileItems, selection],
  );
  const depth =
    depthChoice == null || (depthChoice === 0 && selection.length < 2)
      ? fallbackDepth
      : depthChoice;

  const candidates = useMemo(
    () => (enabled ? selectionCandidates(profileItems, { featuredIds, plants }) : []),
    [enabled, profileItems, featuredIds, plants],
  );
  const listed = useMemo(() => filterSelectionCandidates(candidates, query), [candidates, query]);

  return {
    selection,
    toggle,
    add,
    remove,
    clear,
    has,
    depth,
    setDepth: setDepthChoice,
    candidates,
    query,
    setQuery,
    ...listed,
  };
}
