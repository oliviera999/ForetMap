import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';

/**
 * Relation sélectionnée du réseau trophique et ses termes de glossaire (sorti de
 * `FoodWebView.jsx`, flux C3). Une relation sélectionnée puis filtrée hors de la vue est
 * désélectionnée : sinon le panneau décrivait une relation devenue invisible.
 *
 * @param {{ shownItems: object[], loading: boolean }} options
 */
export function useFoodWebEdgeSelection({ shownItems, loading }) {
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [edgeGlossary, setEdgeGlossary] = useState([]);
  const [edgeLoading, setEdgeLoading] = useState(false);

  const selectedRow = useMemo(
    () =>
      selectedEdgeId == null
        ? null
        : (shownItems || []).find((row) => row.id === selectedEdgeId) || null,
    [shownItems, selectedEdgeId],
  );

  const clearSelection = useCallback(() => {
    setSelectedEdgeId(null);
    setEdgeGlossary([]);
  }, []);

  useEffect(() => {
    if (selectedEdgeId == null || loading) return;
    if (!selectedRow) clearSelection();
  }, [loading, selectedEdgeId, selectedRow, clearSelection]);

  const selectEdge = useCallback(
    async (interactionId) => {
      if (selectedEdgeId === interactionId) {
        clearSelection();
        return;
      }
      setSelectedEdgeId(interactionId);
      setEdgeLoading(true);
      setEdgeGlossary([]);
      try {
        const data = await api(`/api/food-web/interactions/${interactionId}/glossary`);
        setEdgeGlossary(Array.isArray(data?.terms) ? data.terms : []);
      } catch (_) {
        setEdgeGlossary([]);
      } finally {
        setEdgeLoading(false);
      }
    },
    [selectedEdgeId, clearSelection],
  );

  /** Après une suppression : la relation supprimée ne reste pas sélectionnée. */
  const forgetEdge = useCallback(
    (interactionId) => {
      if (selectedEdgeId === interactionId) clearSelection();
    },
    [selectedEdgeId, clearSelection],
  );

  return { selectedEdgeId, selectedRow, edgeGlossary, edgeLoading, selectEdge, forgetEdge };
}
