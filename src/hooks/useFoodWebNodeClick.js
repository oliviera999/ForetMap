import { useCallback, useEffect, useRef, useState } from 'react';
import { isEnvNodeId } from '../components/pedago/foodWebGraphModel.js';

/** Modes du clic simple sur un nœud du graphe. */
export const NODE_CLICK_MODES = Object.freeze(['isolate', 'panel']);

/**
 * Effet d'un clic simple (ou d'Entrée) sur un nœud, selon le mode du graphe :
 *
 * - `'isolate'` (défaut, lycée et G&L) : isoler le réseau de l'espèce (`'isolate'`), ou
 *   l'ajouter à la sélection isolée avec ⌘/Ctrl ou le mode « Ajouter » (`'isolate-add'`) ;
 * - `'panel'` (collège, décision 3 du 22/11/2026) : ouvrir le petit panneau de l'espèce
 *   (`'panel'`) ; le nœud « environnement », sans fiche ni sélection, ne fait rien (`'none'`).
 *
 * @param {string} mode
 * @param {{ additive?: boolean, isEnv?: boolean }} [options]
 * @returns {'isolate'|'isolate-add'|'panel'|'none'}
 */
export function nodeActivation(mode, { additive = false, isEnv = false } = {}) {
  if (mode === 'panel') return isEnv ? 'none' : 'panel';
  return additive ? 'isolate-add' : 'isolate';
}

/**
 * Gestion du clic de nœud du réseau trophique (sortie de `FoodWebGraph.jsx`, chantier collège
 * du 22/11/2026, lots 2 et 7) : dispatch du clic et de l'Entrée selon `mode`, ouverture de la
 * fiche (Maj+Entrée, double-clic, bouton du panneau), état du panneau et retour du focus au
 * nœud à sa fermeture.
 *
 * @param {{ mode?: 'isolate'|'panel', toggleFocus: (id: unknown, additive?: boolean) => void,
 *   addMode?: boolean, onOpenPlant?: ((id: unknown) => void)|null,
 *   focusNode?: ((id: unknown) => void)|null, nodeIds?: unknown[] }} options
 */
export function useFoodWebNodeClick({
  mode = 'isolate',
  toggleFocus,
  addMode = false,
  onOpenPlant = null,
  focusNode = null,
  nodeIds = null,
}) {
  const [panelNodeId, setPanelNodeId] = useState(null);
  const panelRef = useRef(null);
  useEffect(() => {
    panelRef.current = panelNodeId;
  }, [panelNodeId]);

  const activate = useCallback(
    (id, evt = null) => {
      const additive = Boolean(addMode || evt?.ctrlKey || evt?.metaKey);
      const action = nodeActivation(mode, { additive, isEnv: isEnvNodeId(id) });
      if (action === 'panel') setPanelNodeId(id);
      else if (action !== 'none') toggleFocus(id, action === 'isolate-add');
    },
    [mode, addMode, toggleFocus],
  );

  /** Le nœud « environnement » n'a pas de fiche espèce à ouvrir. */
  const openPlant = useCallback(
    (id) => {
      if (isEnvNodeId(id)) return;
      onOpenPlant?.(id);
    },
    [onOpenPlant],
  );

  const closePanel = useCallback(() => {
    const current = panelRef.current;
    setPanelNodeId(null);
    if (current != null) focusNode?.(current);
  }, [focusNode]);

  /**
   * Clavier sur un nœud : Entrée/Espace active (isoler ou panneau), Maj+Entrée ouvre la fiche.
   * @returns {boolean} vrai si la touche a été traitée
   */
  const onActivateKey = useCallback(
    (evt, id) => {
      if (evt.key !== 'Enter' && evt.key !== ' ' && evt.key !== 'Spacebar') return false;
      evt.preventDefault();
      if (evt.shiftKey) openPlant(id);
      else activate(id, evt);
      return true;
    },
    [openPlant, activate],
  );

  // Le nœud du panneau a disparu (sélection, carte, cadrage) : le panneau se ferme.
  useEffect(() => {
    if (panelNodeId == null || !Array.isArray(nodeIds)) return;
    if (!nodeIds.includes(panelNodeId)) setPanelNodeId(null);
  }, [panelNodeId, nodeIds]);

  return { panelNodeId, setPanelNodeId, activate, openPlant, closePanel, onActivateKey };
}
