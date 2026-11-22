import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Isolement d'espèces dans le graphe du réseau trophique (sorti de `FoodWebGraph.jsx`, flux
 * C3 du chantier collège) : sélection (un ensemble d'identifiants, lot F3), profondeur,
 * contexte estompé, mode « ajouter » (tablette).
 *
 * - arrivée depuis une fiche (`highlightPlantId`) : l'espèce est isolée d'emblée, une fois ;
 * - séance qui montre plusieurs espèces (`focusRequest = { ids, depth, nonce }`) : leur
 *   sous-réseau est isolé, une fois par `nonce` — la demande l'emporte sur la mise en avant ;
 * - un nœud disparu du jeu (carte, zone, filtre) sort de la sélection.
 *
 * @param {{ nodes: { id: number|string }[], highlightPlantId?: number|string|null,
 *   focusRequest?: { ids: number[], depth?: number, nonce?: unknown }|null }} options
 */
export function useFoodWebFocus({ nodes, highlightPlantId = null, focusRequest = null }) {
  const [focusIds, setFocusIds] = useState(() => new Set());
  const [focusDepth, setFocusDepth] = useState(1);
  /** Vrai : garder le reste du réseau estompé en fond plutôt que de le retirer. */
  const [showContext, setShowContext] = useState(false);
  /** Mode « ajouter » : un simple appui ajoute à la sélection (tablette). */
  const [addMode, setAddMode] = useState(false);

  /**
   * Isole une espèce. `additive` (⌘/Ctrl, mode « Ajouter », ⌘/Ctrl+Entrée)
   * l'ajoute à la sélection au lieu de la remplacer : c'est ce qui permet de
   * composer un réseau avec plusieurs espèces et d'exclure tout le reste.
   */
  const toggleFocus = useCallback((id, additive = false) => {
    setFocusIds((cur) => {
      const next = new Set(cur);
      if (additive) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }
      if (next.size === 1 && next.has(id)) return new Set();
      return new Set([id]);
    });
  }, []);

  const clearFocus = useCallback(() => {
    setFocusIds(new Set());
    setShowContext(false);
    setAddMode(false);
    setFocusDepth(1);
  }, []);

  /** Dernière espèce mise en avant déjà appliquée (évite de re-focaliser à chaque rendu). */
  const appliedHighlightRef = useRef(null);

  // Arrivée depuis une fiche plante (« Voir le réseau trophique ») : isoler d'emblée
  // le réseau de l'espèce. Sans cela, elle était seulement teintée parmi tous les
  // autres nœuds — introuvable sur un graphe fourni.
  useEffect(() => {
    if (highlightPlantId == null) {
      appliedHighlightRef.current = null;
      return;
    }
    const id = Number(highlightPlantId);
    if (!Number.isFinite(id) || appliedHighlightRef.current === id) return;
    if (!nodes.some((node) => node.id === id)) return;
    appliedHighlightRef.current = id;
    setFocusIds(new Set([id]));
  }, [highlightPlantId, nodes]);

  /** Dernière demande d'isolement appliquée (une fois par `nonce`). */
  const appliedFocusRequestRef = useRef(null);

  // Séance qui montre plusieurs espèces : isoler leur sous-réseau (profondeur 0 = leurs
  // liens mutuels). Déclaré après l'effet de mise en avant : la demande l'emporte.
  useEffect(() => {
    if (!focusRequest || !Array.isArray(focusRequest.ids)) return;
    const key = focusRequest.nonce ?? focusRequest.ids.join(',');
    if (appliedFocusRequestRef.current === key) return;
    const present = new Set(nodes.map((node) => node.id));
    const ids = focusRequest.ids.map(Number).filter((id) => present.has(id));
    if (ids.length === 0) return;
    appliedFocusRequestRef.current = key;
    setFocusIds(new Set(ids));
    if (Number.isFinite(Number(focusRequest.depth))) setFocusDepth(Number(focusRequest.depth));
  }, [focusRequest, nodes]);

  // Le jeu de données a changé (carte, zone, filtre de type) : un focus sur un nœud
  // disparu vidait la scène sans que rien ne l'explique.
  useEffect(() => {
    if (focusIds.size === 0) return;
    const present = new Set(nodes.map((node) => node.id));
    if ([...focusIds].every((id) => present.has(id))) return;
    setFocusIds((cur) => new Set([...cur].filter((id) => present.has(id))));
  }, [nodes, focusIds]);

  return {
    focusIds,
    focusDepth,
    setFocusDepth,
    showContext,
    setShowContext,
    addMode,
    setAddMode,
    toggleFocus,
    clearFocus,
  };
}
