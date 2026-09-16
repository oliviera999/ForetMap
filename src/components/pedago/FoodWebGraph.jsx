import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  INTERACTION_TYPES,
  interactionMatterFlow,
  interactionTypeLabel,
} from '../../shared/foodWebTypes.js';
import {
  buildEdgeExportCss,
  edgeStyleClass,
  resolveEdgeRenderStyle,
} from '../../shared/foodWebEdgeStyle.js';
import { FoodWebEdgeLegend } from './FoodWebEdgeLegend.jsx';
import {
  ENV_NODE_ID,
  FOCUS_DEPTHS,
  FOCUS_DEPTH_LABELS,
  FOCUS_DEPTH_TITLES,
  GRAPH_PRESET_LABELS,
  LABEL_CROWD_THRESHOLD,
  TROPHIC_COLUMN_LABELS,
  buildGraphModel,
  circleLayoutSize,
  computeChainLayout,
  computeCircleLayout,
  computeEnvAnchor,
  computeTrophicLayout,
  computeTrophicLevelLayout,
  computeTrophicLevels,
  focusSubset,
  isEnvNodeId,
  itemsForPreset,
  neighborIds,
  parallelEdgeOffset,
  parallelEdgeRanks,
  trophicColumnXs,
  trophicLevelTitle,
  truncateNodeLabel,
} from './foodWebGraphModel.js';
import {
  IconAdd,
  IconClose,
  IconFoodweb,
  IconDownload,
  IconImage,
  IconStats,
  IconSearch,
  IconTarget,
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
} from '../../shared/icons.jsx';

const BASE_W = 880;
const BASE_H = 560;
const NODE_R = 20;
const CLICK_MOVE_THRESHOLD = 4;

/** Clé de mémorisation de la disposition choisie (par produit). */
const LAYOUT_STORAGE_KEY = 'foretmap.foodweb.layout';

/** Dispositions proposées. `levels` retombe sur les rôles faute de niveaux calculables. */
const LAYOUT_CIRCLE = 'circle';
const LAYOUT_LEVELS = 'levels';
const LAYOUT_CHAIN = 'chain';

/** Lecture tolérante du dernier choix de disposition (stockage indisponible, valeur inconnue). */
function readStoredLayout(variant) {
  try {
    const raw = window.localStorage.getItem(`${LAYOUT_STORAGE_KEY}.${variant}`);
    return raw === LAYOUT_CIRCLE || raw === LAYOUT_LEVELS ? raw : null;
  } catch (_) {
    return null;
  }
}

function storeLayout(variant, value) {
  try {
    window.localStorage.setItem(`${LAYOUT_STORAGE_KEY}.${variant}`, value);
  } catch (_) {
    /* stockage indisponible (navigation privée, quota) : sans conséquence */
  }
}

/** Styles embarqués pour l'export SVG/PNG (le CSS de la page ne s'applique pas hors DOM). */
const EXPORT_STYLE = `
  ${buildEdgeExportCss()}
  .pedago-foodweb-graph__node{fill:#dcfce7;stroke:#16a34a;stroke-width:1.5}
  .pedago-foodweb-graph__node.highlight{fill:#bbf7d0;stroke-width:2.5}
  .pedago-foodweb-graph__node.dim{opacity:.18}
  .pedago-foodweb-graph__node--env{fill:#f3f4f6;stroke:#94a3b8;stroke-dasharray:3 3}
  .pedago-foodweb-graph__node--outside{fill:#fff7ed;stroke:#ea9a5c;stroke-dasharray:5 3}
  .pedago-foodweb-graph__label{font:600 10px sans-serif;fill:#1f2937;paint-order:stroke;stroke:#ffffff;stroke-width:2.5px;stroke-linejoin:round}
  .pedago-foodweb-graph__label.dim{opacity:.2}
  .pedago-foodweb-graph__col-label{font:600 11px sans-serif;fill:#4b5563}
  .pedago-foodweb-graph__band-label{font:600 11px sans-serif;fill:#4b5563}
  .pedago-foodweb-graph__band-rule{stroke:#d7e3da;stroke-width:1;stroke-dasharray:4 4}
  .pedago-foodweb-graph__node-emoji{font:16px sans-serif}
`;

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Graphe SVG interactif du réseau trophique.
 *
 * Flèches orientées selon le sens écologique (« est mangée par »), zoom/pan,
 * nœuds déplaçables, mise en évidence au survol, mode focus (réseau simplifié
 * autour d'une espèce), disposition par niveau trophique et export image.
 */
export function FoodWebGraph({
  items,
  onSelectEdge,
  selectedEdgeId,
  highlightPlantId,
  onOpenPlant,
  legendCompact = false,
  variant = 'foretmap',
  /** Preset contrôlé par le parent (liste + graphe partagent le même cadrage). */
  preset: presetProp = null,
  onPresetChange = null,
}) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  /** Élément SVG en state (et pas seulement en ref) : l'effet « molette » doit se
   *  relancer au montage réel du SVG, qui suit le premier rendu (cas « aucun nœud »). */
  const [svgEl, setSvgEl] = useState(null);
  const attachSvg = useCallback((node) => {
    svgRef.current = node;
    setSvgEl(node);
  }, []);

  // Disposition : le dernier choix explicite est mémorisé (un prof qui projette
  // en niveaux ne doit pas le redemander à chaque séance). À défaut, le défaut
  // dépend du cadrage — voir `defaultLayout` plus bas.
  const [storedLayout] = useState(() => readStoredLayout(variant));
  const [layout, setLayout] = useState(storedLayout);
  const [internalPreset, setInternalPreset] = useState('alimentaire');
  const presetControlled = presetProp != null;
  const preset = presetControlled ? presetProp : internalPreset;
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const [overrides, setOverrides] = useState(() => new Map());
  const [hoverNode, setHoverNode] = useState(null);
  const [hoverEdge, setHoverEdge] = useState(null);
  /** Sélection d'espèces isolées : un ensemble, pas un identifiant (lot F3). */
  const [focusIds, setFocusIds] = useState(() => new Set());
  const [focusDepth, setFocusDepth] = useState(1);
  /** Vrai : garder le reste du réseau estompé en fond plutôt que de le retirer. */
  const [showContext, setShowContext] = useState(false);
  /** Mode « ajouter » : un simple appui ajoute à la sélection (tablette). */
  const [addMode, setAddMode] = useState(false);
  const [search, setSearch] = useState('');
  const [hiddenTypes, setHiddenTypes] = useState(() => new Set());
  const [moreOpen, setMoreOpen] = useState(false);

  const changePreset = useCallback(
    (key) => {
      if (!presetControlled) setInternalPreset(key);
      onPresetChange?.(key);
      setOverrides(new Map());
      setHiddenTypes(new Set());
    },
    [presetControlled, onPresetChange],
  );

  const presetItems = useMemo(() => itemsForPreset(items, preset), [items, preset]);
  const { nodes, edges } = useMemo(() => buildGraphModel(presetItems), [presetItems]);

  const visibleEdges = useMemo(
    () => edges.filter((edge) => !hiddenTypes.has(String(edge.type || '').toLowerCase())),
    [edges, hiddenTypes],
  );

  /** Rang de chaque arête parmi ses parallèles, pour les écarter de l'axe. */
  const edgeRanks = useMemo(() => parallelEdgeRanks(visibleEdges), [visibleEdges]);

  const toggleEdgeType = useCallback((type) => {
    const key = String(type || '').toLowerCase();
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const presentTypes = useMemo(
    () => [
      ...new Set((edges || []).map((e) => String(e.type || '').toLowerCase()).filter(Boolean)),
    ],
    [edges],
  );

  const trophicLabelXs = useMemo(() => trophicColumnXs({ width: BASE_W }), []);

  /**
   * Position trophique calculée sur le réseau **affiché** (lot F4) : elle change
   * avec la carte, la zone et le cadrage, et l'interface le dit.
   */
  const trophicLevels = useMemo(() => computeTrophicLevels(nodes, edges), [nodes, edges]);

  const focusActive = focusIds.size > 0;
  const soleFocusId = focusIds.size === 1 ? [...focusIds][0] : null;

  const focusNode = useMemo(
    () => (soleFocusId == null ? null : nodes.find((n) => n.id === soleFocusId) || null),
    [nodes, soleFocusId],
  );

  /** Sous-réseau isolé (null hors focus). */
  const subset = useMemo(
    () => (focusActive ? focusSubset(visibleEdges, focusIds, focusDepth) : null),
    [focusActive, visibleEdges, focusIds, focusDepth],
  );

  /**
   * Isoler **recompose** la scène : sans cela, les voisins restaient dispersés
   * aux quatre coins d'un cercle peuplé de fantômes estompés (constat D3).
   * « Garder le reste en fond » rétablit l'ancien comportement à la demande.
   */
  const recomposed = focusActive && !showContext;

  const layoutNodes = useMemo(
    () => (recomposed && subset ? nodes.filter((node) => subset.visibleNodes.has(node.id)) : nodes),
    [recomposed, subset, nodes],
  );

  const layoutEdges = useMemo(
    () =>
      recomposed && subset
        ? visibleEdges.filter((edge) => subset.visibleEdges.has(edge.id))
        : visibleEdges,
    [recomposed, subset, visibleEdges],
  );

  /** Défaut : les niveaux quand le cadrage porte un flux de matière, sinon le cercle. */
  const defaultLayout = trophicLevels.size > 0 ? LAYOUT_LEVELS : LAYOUT_CIRCLE;
  const requestedLayout = layout || defaultLayout;
  /** La « fiche » n'a de sens que sur une espèce isolée. */
  const chainAvailable = soleFocusId != null && !isEnvNodeId(soleFocusId);
  const layoutKind =
    requestedLayout === LAYOUT_CHAIN && !chainAvailable ? defaultLayout : requestedLayout;

  const scene = useMemo(() => {
    if (layoutKind === LAYOUT_CHAIN && chainAvailable) {
      const chain = computeChainLayout(layoutNodes, layoutEdges, soleFocusId, {
        width: BASE_W,
        height: BASE_H,
      });
      return { ...chain, bands: [], lanes: [], kind: LAYOUT_CHAIN };
    }
    if (layoutKind === LAYOUT_LEVELS) {
      const levels = computeTrophicLevelLayout(layoutNodes, trophicLevels, {
        width: BASE_W,
        height: BASE_H,
      });
      // Aucun niveau calculable (cadrage « Autres relations ») : on retombe sur
      // les colonnes de rôles, qui restent justes — il n'y a alors pas de niveau.
      if (levels.bands.length === 0) {
        return {
          positions: computeTrophicLayout(layoutNodes, { width: BASE_W, height: BASE_H }),
          height: BASE_H,
          bands: [],
          lanes: [],
          columns: [],
          kind: 'roles',
        };
      }
      return { ...levels, columns: [], kind: LAYOUT_LEVELS };
    }
    // Le cercle réserve la couronne des étiquettes radiales : sa hauteur suit
    // donc le nombre d'espèces, comme celle des bandes suit les rangées.
    const size = circleLayoutSize(layoutNodes.filter((node) => !isEnvNodeId(node.id)).length);
    return {
      positions: computeCircleLayout(layoutNodes, {
        width: BASE_W,
        height: size.height,
        radius: size.radius,
      }),
      height: size.height,
      bands: [],
      lanes: [],
      columns: [],
      kind: LAYOUT_CIRCLE,
    };
  }, [layoutKind, chainAvailable, layoutNodes, layoutEdges, soleFocusId, trophicLevels]);

  const baseLayout = scene.positions;
  const sceneHeight = scene.height || BASE_H;

  /**
   * Ancrage du nœud « environnement » quand la disposition ne le place pas :
   * sur le cercle, il tombait à 2 px du premier nœud, étiquette par-dessus la
   * pastille (constat D4). Il passe au centre, libre par construction.
   */
  const envAnchor = useMemo(
    () => computeEnvAnchor(scene.kind, { width: BASE_W, height: sceneHeight }),
    [scene.kind, sceneHeight],
  );

  const posOf = useCallback(
    (id) => {
      if (id == null) return envAnchor;
      return overrides.get(id) || baseLayout.get(id) || envAnchor;
    },
    [overrides, baseLayout, envAnchor],
  );

  // Ensembles « actifs » (pleine opacité). Le reste est estompé — ou retiré.
  const { activeNodes, activeEdges, hasFilter } = useMemo(() => {
    if (subset) {
      return {
        activeNodes: subset.visibleNodes,
        activeEdges: subset.visibleEdges,
        hasFilter: true,
      };
    }
    if (hoverNode != null) {
      const ns = neighborIds(visibleEdges, hoverNode);
      ns.add(hoverNode);
      const es = new Set(
        visibleEdges
          .filter((e) => e.tailId === hoverNode || e.headId === hoverNode)
          .map((e) => e.id),
      );
      return { activeNodes: ns, activeEdges: es, hasFilter: true };
    }
    if (hoverEdge != null) {
      const edge = visibleEdges.find((e) => e.id === hoverEdge);
      const ns = new Set(edge ? [edge.tailId, edge.headId] : []);
      return { activeNodes: ns, activeEdges: new Set(edge ? [edge.id] : []), hasFilter: true };
    }
    return { activeNodes: null, activeEdges: null, hasFilter: false };
  }, [visibleEdges, subset, hoverNode, hoverEdge]);

  /**
   * Nœuds et arêtes réellement dessinés. En mode recomposé, le hors-sujet n'est
   * pas estompé mais **retiré** : il ne prend plus de place, ne capte plus les
   * clics et sort de la séquence de tabulation.
   */
  const renderedNodes = useMemo(
    () => (recomposed && subset ? nodes.filter((n) => subset.visibleNodes.has(n.id)) : nodes),
    [recomposed, subset, nodes],
  );
  const renderedEdges = useMemo(
    () =>
      recomposed && subset
        ? visibleEdges.filter((e) => subset.visibleEdges.has(e.id))
        : visibleEdges,
    [recomposed, subset, visibleEdges],
  );

  /**
   * Au-delà du seuil de saturation, seules les étiquettes des nœuds actifs sont
   * tracées : un nom illisible parce qu'empilé sur trois autres n'apprend rien.
   */
  const labelsAlwaysVisible = renderedNodes.length <= LABEL_CROWD_THRESHOLD;
  const labelVisible = useCallback(
    (id) =>
      labelsAlwaysVisible ||
      hoverNode === id ||
      focusIds.has(id) ||
      (activeNodes?.has(id) ?? false),
    [labelsAlwaysVisible, hoverNode, focusIds, activeNodes],
  );

  const nodeLabelById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node.name || 'Espèce'])),
    [nodes],
  );

  const nodeDimmed = useCallback(
    (id) => hasFilter && !(activeNodes && activeNodes.has(id)),
    [hasFilter, activeNodes],
  );
  const edgeDimmed = useCallback(
    (id) => hasFilter && !(activeEdges && activeEdges.has(id)),
    [hasFilter, activeEdges],
  );

  // --- Conversion coordonnées client → repère de base (annule pan/zoom) ---
  const clientToBase = useCallback(
    (evt) => {
      const svg = svgRef.current;
      if (!svg || typeof svg.getBoundingClientRect !== 'function') return null;
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const vbX = ((evt.clientX - rect.left) / rect.width) * BASE_W;
      const vbY = ((evt.clientY - rect.top) / rect.height) * sceneHeight;
      return { x: (vbX - view.tx) / view.scale, y: (vbY - view.ty) / view.scale };
    },
    [view, sceneHeight],
  );

  // --- Zoom ---
  const zoomBy = useCallback(
    (factor, center) => {
      setView((v) => {
        const scale = Math.min(4, Math.max(0.4, v.scale * factor));
        const cx = center ? center.x : BASE_W / 2;
        const cy = center ? center.y : sceneHeight / 2;
        // garde le point (cx,cy) fixe à l'écran
        const tx = cx - ((cx - v.tx) * scale) / v.scale;
        const ty = cy - ((cy - v.ty) * scale) / v.scale;
        return { scale, tx, ty };
      });
    },
    [sceneHeight],
  );

  // React enregistre `wheel` en écouteur **passif** sur la racine : un `onWheel`
  // JSX ne peut donc pas annuler le défilement de la page pendant le zoom. On pose
  // l'écouteur à la main, en `passive: false`, sur le SVG lui-même.
  useEffect(() => {
    if (!svgEl?.addEventListener) return undefined;
    const handleWheel = (evt) => {
      evt.preventDefault();
      const rect = svgEl.getBoundingClientRect?.();
      const center =
        rect && rect.width && rect.height
          ? {
              x: ((evt.clientX - rect.left) / rect.width) * BASE_W,
              y: ((evt.clientY - rect.top) / rect.height) * sceneHeight,
            }
          : null;
      zoomBy(evt.deltaY < 0 ? 1.12 : 1 / 1.12, center);
    };
    svgEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => svgEl.removeEventListener('wheel', handleWheel);
  }, [svgEl, zoomBy, sceneHeight]);

  const resetView = useCallback(() => {
    setView({ scale: 1, tx: 0, ty: 0 });
    setOverrides(new Map());
  }, []);

  /** Changer de disposition recompose la scène : les positions déplacées à la
   *  main sont abandonnées, sinon « Niveaux » laissait des nœuds au cercle. */
  const changeLayout = useCallback(
    (next) => {
      setLayout((cur) => {
        if (cur !== next) setOverrides(new Map());
        return next;
      });
      // Seule la « fiche » reste contextuelle : elle dépend d'une espèce isolée
      // et n'a pas à devenir le défaut de la prochaine séance.
      if (next !== LAYOUT_CHAIN) storeLayout(variant, next);
    },
    [variant],
  );

  // --- Zoom au pincement (les élèves travaillent sur tablette) ---
  // `touch-action: none` est nécessaire au déplacement mais neutralise le
  // pincement natif du navigateur : il faut donc le gérer nous-mêmes.
  const pointersRef = useRef(new Map());
  const pinchRef = useRef(null);

  const clientToViewbox = useCallback(
    (clientX, clientY) => {
      const rect = svgRef.current?.getBoundingClientRect?.();
      if (!rect || !rect.width || !rect.height) return null;
      return {
        x: ((clientX - rect.left) / rect.width) * BASE_W,
        y: ((clientY - rect.top) / rect.height) * sceneHeight,
      };
    },
    [sceneHeight],
  );

  /** Enregistre un doigt ; au deuxième, bascule en pincement et annule tout glissement. */
  const trackPointer = useCallback((evt) => {
    pointersRef.current.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
      dragRef.current = null;
    }
  }, []);

  const releasePointer = useCallback((evt) => {
    if (evt?.pointerId != null) pointersRef.current.delete(evt.pointerId);
    else pointersRef.current.clear();
    if (pointersRef.current.size < 2) pinchRef.current = null;
  }, []);

  /** @returns {boolean} vrai si le mouvement a été consommé par un pincement. */
  const handlePinchMove = useCallback(
    (evt) => {
      if (!pointersRef.current.has(evt.pointerId)) return false;
      pointersRef.current.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
      const pinch = pinchRef.current;
      if (!pinch || pointersRef.current.size < 2) return false;
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      zoomBy(dist / pinch.dist, clientToViewbox((a.x + b.x) / 2, (a.y + b.y) / 2));
      pinch.dist = dist;
      return true;
    },
    [clientToViewbox, zoomBy],
  );

  // --- Drag nœud / pan fond ---
  const onNodePointerDown = useCallback(
    (evt, id) => {
      evt.stopPropagation();
      trackPointer(evt);
      if (pinchRef.current) return;
      const start = clientToBase(evt);
      dragRef.current = { kind: 'node', id, moved: false, last: start };
      evt.currentTarget.setPointerCapture?.(evt.pointerId);
    },
    [clientToBase, trackPointer],
  );

  const onBackgroundPointerDown = useCallback(
    (evt) => {
      trackPointer(evt);
      if (pinchRef.current) return;
      dragRef.current = {
        kind: 'pan',
        moved: false,
        startClient: { x: evt.clientX, y: evt.clientY },
        startView: view,
      };
    },
    [view, trackPointer],
  );

  // Commit du drag throttlé à un setState par frame (requestAnimationFrame) :
  // le pointermove ne fait plus qu'un calcul léger et synchrone (seuils inchangés),
  // la position en attente est stockée dans dragRef et appliquée au prochain frame.
  const dragRafRef = useRef(0);

  const commitPendingDrag = useCallback(() => {
    dragRafRef.current = 0;
    const drag = dragRef.current;
    if (!drag || !drag.pending) return;
    const pending = drag.pending;
    drag.pending = null;
    if (drag.kind === 'node') {
      setOverrides((prev) => {
        const next = new Map(prev);
        next.set(drag.id, pending);
        return next;
      });
    } else if (drag.kind === 'pan') {
      setView(pending);
    }
  }, []);

  /** Applique immédiatement le déplacement en attente (fin de drag) pour ne pas perdre le dernier move. */
  const flushPendingDrag = useCallback(() => {
    if (dragRafRef.current) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = 0;
    }
    commitPendingDrag();
  }, [commitPendingDrag]);

  useEffect(
    () => () => {
      if (dragRafRef.current) cancelAnimationFrame(dragRafRef.current);
    },
    [],
  );

  const onPointerMove = useCallback(
    (evt) => {
      if (handlePinchMove(evt)) return;
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.kind === 'node') {
        const p = clientToBase(evt);
        if (!p || !drag.last) return;
        if (Math.hypot(p.x - drag.last.x, p.y - drag.last.y) > CLICK_MOVE_THRESHOLD || drag.moved)
          drag.moved = true;
        drag.pending = { x: p.x, y: p.y };
      } else if (drag.kind === 'pan') {
        const svg = svgRef.current;
        const rect = svg?.getBoundingClientRect?.();
        if (!rect) return;
        const dx = ((evt.clientX - drag.startClient.x) / rect.width) * BASE_W;
        const dy = ((evt.clientY - drag.startClient.y) / rect.height) * sceneHeight;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true;
        drag.pending = {
          scale: drag.startView.scale,
          tx: drag.startView.tx + dx,
          ty: drag.startView.ty + dy,
        };
      } else {
        return;
      }
      if (!dragRafRef.current) dragRafRef.current = requestAnimationFrame(commitPendingDrag);
    },
    [clientToBase, commitPendingDrag, handlePinchMove, sceneHeight],
  );

  const onPointerUp = useCallback(
    (evt) => {
      releasePointer(evt);
      flushPendingDrag();
      dragRef.current = null;
    },
    [flushPendingDrag, releasePointer],
  );

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

  // Le jeu de données a changé (carte, zone, filtre de type) : un focus sur un nœud
  // disparu vidait la scène sans que rien ne l'explique.
  useEffect(() => {
    if (focusIds.size === 0) return;
    const present = new Set(nodes.map((node) => node.id));
    if ([...focusIds].every((id) => present.has(id))) return;
    setFocusIds((cur) => new Set([...cur].filter((id) => present.has(id))));
  }, [nodes, focusIds]);

  const onNodePointerUp = useCallback(
    (evt, id) => {
      const wasPinching = Boolean(pinchRef.current);
      releasePointer(evt);
      flushPendingDrag();
      const drag = dragRef.current;
      const moved = drag?.kind === 'node' && drag.moved;
      dragRef.current = null;
      // Lever un doigt d'un pincement ne doit pas être compris comme un clic.
      if (!moved && !wasPinching) toggleFocus(id, addMode || evt.ctrlKey || evt.metaKey);
    },
    [flushPendingDrag, releasePointer, toggleFocus, addMode],
  );

  /** Le nœud « environnement » n'a pas de fiche espèce à ouvrir. */
  const openNodePlant = useCallback(
    (id) => {
      if (isEnvNodeId(id)) return;
      onOpenPlant?.(id);
    },
    [onOpenPlant],
  );

  // Clavier : Entrée/Espace isole le réseau du nœud, Maj+Entrée ouvre sa fiche,
  // ⌘/Ctrl+Entrée ajoute (ou retire) l'espèce de la sélection.
  const onNodeKeyDown = useCallback(
    (evt, id) => {
      if (evt.key !== 'Enter' && evt.key !== ' ' && evt.key !== 'Spacebar') return;
      evt.preventDefault();
      if (evt.shiftKey) openNodePlant(id);
      else toggleFocus(id, addMode || evt.ctrlKey || evt.metaKey);
    },
    [openNodePlant, toggleFocus, addMode],
  );

  const onEdgeKeyDown = useCallback(
    (evt, id) => {
      if (evt.key !== 'Enter' && evt.key !== ' ' && evt.key !== 'Spacebar') return;
      evt.preventDefault();
      onSelectEdge?.(id);
    },
    [onSelectEdge],
  );

  /** Espèces proposées par la recherche (hors nœud environnement). */
  const searchMatches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return [];
    return nodes
      .filter(
        (node) =>
          !isEnvNodeId(node.id) &&
          String(node.name || '')
            .toLowerCase()
            .includes(needle),
      )
      .slice(0, 8);
  }, [nodes, search]);

  /** Focalise la première espèce trouvée (soumission du champ de recherche). */
  const submitSearch = useCallback(
    (evt) => {
      evt.preventDefault();
      const first = searchMatches[0];
      if (!first) return;
      // Le champ sert aussi à composer une sélection : en mode « Ajouter »,
      // « Isoler » empile au lieu de remplacer.
      toggleFocus(first.id, addMode && !focusIds.has(first.id));
      setSearch('');
    },
    [searchMatches, toggleFocus, addMode, focusIds],
  );

  // --- Intitulés (infobulle souris + nom accessible clavier/lecteur d'écran) ---

  const nodeTitle = useCallback(
    (node) => {
      if (isEnvNodeId(node.id)) {
        return `${node.name} (sol, air, lumière) — clic : isoler ses liens`;
      }
      const scope = node.outOfScope ? ' — hors du périmètre filtré' : '';
      const level = trophicLevels.get(node.id);
      const levelPart = Number.isFinite(level) ? ` — ${trophicLevelTitle(level)}` : '';
      return `${node.name}${node.role ? ` (${node.role})` : ''}${levelPart}${scope} — clic : focus, double-clic : fiche`;
    },
    [trophicLevels],
  );

  const nodeAriaLabel = useCallback(
    (node) => {
      if (isEnvNodeId(node.id)) {
        return `${node.name} — Entrée : isoler ses liens`;
      }
      const scope = node.outOfScope ? ', hors du périmètre filtré' : '';
      const level = trophicLevels.get(node.id);
      const levelPart = Number.isFinite(level) ? `, ${trophicLevelTitle(level)}` : '';
      const selected = focusIds.has(node.id) ? ', sélectionnée' : '';
      return `${node.name}${node.role ? `, ${node.role}` : ''}${levelPart}${scope}${selected} — Entrée : isoler son réseau, Ctrl+Entrée : ajouter à la sélection, Maj+Entrée : ouvrir la fiche`;
    },
    [trophicLevels, focusIds],
  );

  /** Espèces de la sélection, dans l'ordre d'affichage des puces. */
  const selectedNodes = useMemo(
    () =>
      nodes
        .filter((node) => focusIds.has(node.id))
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fr')),
    [nodes, focusIds],
  );

  /**
   * Résumé texte de l'espèce isolée (« mange … · est mangée par … ») : la
   * phrase que l'élève doit produire, lisible par un lecteur d'écran et
   * recopiable dans un cahier, même quand la scène reste chargée.
   */
  const focusSummary = useMemo(() => {
    if (soleFocusId == null || isEnvNodeId(soleFocusId)) return null;
    const node = nodes.find((n) => n.id === soleFocusId);
    if (!node) return null;
    const eats = [];
    const eatenBy = [];
    const others = [];
    for (const edge of visibleEdges) {
      const trophic = interactionMatterFlow(edge.type) === 'to_from';
      if (edge.headId === soleFocusId) {
        (trophic ? eats : others).push(nodeLabelById.get(edge.tailId) || 'Espèce');
      } else if (edge.tailId === soleFocusId) {
        (trophic ? eatenBy : others).push(nodeLabelById.get(edge.headId) || 'Espèce');
      }
    }
    const uniq = (list) => [...new Set(list)];
    return {
      name: node.name,
      emoji: node.emoji,
      level: trophicLevels.get(node.id),
      eats: uniq(eats),
      eatenBy: uniq(eatenBy),
      others: uniq(others),
    };
  }, [soleFocusId, nodes, visibleEdges, nodeLabelById, trophicLevels]);

  /** Phrase de l'arête : « Prédation : Lapin est mangée par Renard ». */
  const edgeSentence = useCallback(
    (edge) => {
      const tail = nodeLabelById.get(edge.tailId) || 'Espèce';
      const head = nodeLabelById.get(edge.headId) || 'Espèce';
      return `${interactionTypeLabel(edge.type)} : ${tail} ${edge.relation} ${head}`;
    },
    [nodeLabelById],
  );

  const edgeTitle = useCallback(
    (edge) => `${edgeSentence(edge)}${edge.description ? ` — ${edge.description}` : ''}`,
    [edgeSentence],
  );

  const edgeAriaLabel = useCallback(
    (edge) => `${edgeTitle(edge)}. Entrée : voir les termes de glossaire liés`,
    [edgeTitle],
  );

  // --- Export ---
  const serializeSvg = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return '';
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(BASE_W));
    clone.setAttribute('height', String(sceneHeight));
    // neutralise pan/zoom pour un export cadré
    const inner = clone.querySelector('[data-fw-viewport]');
    if (inner) inner.setAttribute('transform', 'translate(0,0) scale(1)');
    const style = document.createElement('style');
    style.textContent = EXPORT_STYLE;
    clone.insertBefore(style, clone.firstChild);
    return new window.XMLSerializer().serializeToString(clone);
  }, [sceneHeight]);

  const exportSvg = useCallback(() => {
    const str = serializeSvg();
    if (!str) return;
    download(new Blob([str], { type: 'image/svg+xml;charset=utf-8' }), 'reseau-trophique.svg');
  }, [serializeSvg]);

  const exportPng = useCallback(() => {
    const str = serializeSvg();
    if (!str) return;
    const scale = 2;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = BASE_W * scale;
      canvas.height = sceneHeight * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) download(blob, 'reseau-trophique.png');
      }, 'image/png');
    };
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(str)))}`;
  }, [serializeSvg, sceneHeight]);

  if ((items || []).length === 0) {
    return <p className="section-sub">Aucun nœud à afficher.</p>;
  }

  const transform = `translate(${view.tx}, ${view.ty}) scale(${view.scale})`;

  return (
    <div
      className={`pedago-foodweb-graph__wrap${variant === 'gl' ? ' pedago-foodweb-graph__wrap--gl' : ''}`}
    >
      <div className="pedago-foodweb-graph__toolbar" role="toolbar" aria-label="Outils du graphe">
        {!presetControlled ? (
          <div className="pedago-foodweb-graph__tbgroup" role="group" aria-label="Type de graphe">
            {['alimentaire', 'relations', 'all'].map((key) => (
              <button
                key={key}
                type="button"
                className={`pedago-foodweb-graph__tbtn${preset === key ? ' active' : ''}`}
                onClick={() => changePreset(key)}
                aria-pressed={preset === key}
              >
                {GRAPH_PRESET_LABELS[key]}
              </button>
            ))}
          </div>
        ) : null}
        <div className="pedago-foodweb-graph__tbgroup" role="group" aria-label="Disposition">
          <button
            type="button"
            className={`pedago-foodweb-graph__tbtn${layoutKind === LAYOUT_CIRCLE ? ' active' : ''}`}
            onClick={() => changeLayout(LAYOUT_CIRCLE)}
            aria-pressed={layoutKind === LAYOUT_CIRCLE}
            title="Toutes les espèces sur un anneau, groupées par rôle"
          >
            <IconTarget size={14} /> Cercle
          </button>
          <button
            type="button"
            className={`pedago-foodweb-graph__tbtn${layoutKind === LAYOUT_LEVELS || scene.kind === 'roles' ? ' active' : ''}`}
            onClick={() => changeLayout(LAYOUT_LEVELS)}
            aria-pressed={layoutKind === LAYOUT_LEVELS}
            title="Producteurs en bas, consommateurs au-dessus — décomposeurs à part"
          >
            <IconStats size={14} /> Niveaux
          </button>
          {chainAvailable ? (
            <button
              type="button"
              className={`pedago-foodweb-graph__tbtn${layoutKind === LAYOUT_CHAIN ? ' active' : ''}`}
              onClick={() => changeLayout(LAYOUT_CHAIN)}
              aria-pressed={layoutKind === LAYOUT_CHAIN}
              title="Ce qu’elle mange à gauche, ce qui la mange à droite"
            >
              <IconFoodweb size={14} /> Fiche
            </button>
          ) : null}
        </div>
        <div className="pedago-foodweb-graph__tbgroup" role="group" aria-label="Zoom">
          <button
            type="button"
            className="pedago-foodweb-graph__tbtn"
            onClick={() => zoomBy(1 / 1.2)}
            aria-label="Dézoomer"
            title="Dézoomer"
          >
            <IconZoomOut size={14} />
          </button>
          <button
            type="button"
            className="pedago-foodweb-graph__tbtn"
            onClick={resetView}
            aria-label="Réinitialiser la vue et les positions"
            title="Réinitialiser la vue et les positions"
          >
            <IconZoomReset size={14} />
          </button>
          <button
            type="button"
            className="pedago-foodweb-graph__tbtn"
            onClick={() => zoomBy(1.2)}
            aria-label="Zoomer"
            title="Zoomer"
          >
            <IconZoomIn size={14} />
          </button>
        </div>
        <form
          className="pedago-foodweb-graph__search"
          onSubmit={submitSearch}
          role="search"
          aria-label="Recherche dans le graphe"
        >
          <input
            type="search"
            className="pedago-foodweb-graph__search-input"
            placeholder="Rechercher une espèce…"
            aria-label="Rechercher une espèce"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            list="fw-graph-search-list"
            autoComplete="off"
          />
          <datalist id="fw-graph-search-list">
            {searchMatches.map((node) => (
              <option key={node.id} value={node.name} />
            ))}
          </datalist>
          <button
            type="submit"
            className="pedago-foodweb-graph__tbtn"
            disabled={searchMatches.length === 0}
          >
            <IconSearch size={14} /> {addMode ? 'Ajouter' : 'Isoler'}
          </button>
        </form>
        <button
          type="button"
          className={`pedago-foodweb-graph__tbtn${addMode ? ' active' : ''}`}
          onClick={() => setAddMode((mode) => !mode)}
          aria-pressed={addMode}
          title="Un appui ajoute l’espèce à la sélection au lieu de la remplacer (⌘/Ctrl + clic fait de même)"
        >
          <IconAdd size={14} /> Ajouter à la sélection
        </button>
        {focusActive ? (
          <div
            className="pedago-foodweb-graph__tbgroup"
            role="group"
            aria-label="Étendue du réseau isolé"
          >
            {FOCUS_DEPTHS.filter((depth) => depth > 0 || focusIds.size > 1).map((depth) => (
              <button
                key={depth}
                type="button"
                className={`pedago-foodweb-graph__tbtn${focusDepth === depth ? ' active' : ''}`}
                onClick={() => setFocusDepth(depth)}
                aria-pressed={focusDepth === depth}
                title={FOCUS_DEPTH_TITLES[depth]}
              >
                {FOCUS_DEPTH_LABELS[depth]}
              </button>
            ))}
          </div>
        ) : null}
        {focusActive ? (
          <button
            type="button"
            className={`pedago-foodweb-graph__tbtn${showContext ? ' active' : ''}`}
            onClick={() => setShowContext((on) => !on)}
            aria-pressed={showContext}
            title="Remettre le reste du réseau en fond, estompé, au lieu de le retirer"
          >
            Reste en fond
          </button>
        ) : null}
        {focusActive ? (
          <button
            type="button"
            className="pedago-foodweb-graph__tbtn pedago-foodweb-graph__tbtn--focus"
            onClick={clearFocus}
          >
            <IconClose size={14} /> Tout afficher
          </button>
        ) : null}
        {focusNode && !isEnvNodeId(focusNode.id) && onOpenPlant ? (
          <button
            type="button"
            className="pedago-foodweb-graph__tbtn"
            onClick={() => openNodePlant(focusNode.id)}
          >
            Voir la fiche
          </button>
        ) : null}
        <div
          className="pedago-foodweb-graph__tbgroup pedago-foodweb-graph__export--desktop"
          role="group"
          aria-label="Export"
        >
          <button type="button" className="pedago-foodweb-graph__tbtn" onClick={exportPng}>
            <IconImage size={14} /> PNG
          </button>
          <button type="button" className="pedago-foodweb-graph__tbtn" onClick={exportSvg}>
            <IconDownload size={14} /> SVG
          </button>
        </div>
        <div className="pedago-foodweb-graph__more pedago-foodweb-graph__export--mobile">
          <button
            type="button"
            className="pedago-foodweb-graph__tbtn"
            aria-expanded={moreOpen}
            aria-haspopup="true"
            onClick={() => setMoreOpen((o) => !o)}
          >
            Plus…
          </button>
          {moreOpen ? (
            <div className="pedago-foodweb-graph__more-menu" role="menu">
              <button
                type="button"
                className="pedago-foodweb-graph__tbtn"
                role="menuitem"
                onClick={() => {
                  exportPng();
                  setMoreOpen(false);
                }}
              >
                <IconImage size={14} /> PNG
              </button>
              <button
                type="button"
                className="pedago-foodweb-graph__tbtn"
                role="menuitem"
                onClick={() => {
                  exportSvg();
                  setMoreOpen(false);
                }}
              >
                <IconDownload size={14} /> SVG
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {nodes.length === 0 ? (
        <p className="section-sub">Aucun nœud à afficher dans cette vue.</p>
      ) : null}

      <svg
        ref={attachSvg}
        className="pedago-foodweb-graph"
        viewBox={`0 0 ${BASE_W} ${sceneHeight}`}
        role="group"
        aria-label="Graphe interactif du réseau trophique"
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <defs>
          {INTERACTION_TYPES.map((type) => (
            <marker
              key={type}
              id={`fw-arrow-${type}`}
              markerWidth="9"
              markerHeight="9"
              refX="7.5"
              refY="3"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path
                d="M0,0 L8,3 L0,6 Z"
                className={`pedago-foodweb-graph__arrowhead pedago-foodweb-graph__arrowhead--${type}`}
              />
            </marker>
          ))}
          <marker
            id="fw-arrow-default"
            markerWidth="9"
            markerHeight="9"
            refX="7.5"
            refY="3"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path
              d="M0,0 L8,3 L0,6 Z"
              className="pedago-foodweb-graph__arrowhead pedago-foodweb-graph__arrowhead--default"
            />
          </marker>
        </defs>

        <g data-fw-viewport transform={transform}>
          {scene.kind === 'roles'
            ? TROPHIC_COLUMN_LABELS.map((label, col) => (
                <text
                  key={label}
                  className="pedago-foodweb-graph__col-label"
                  x={trophicLabelXs[col]}
                  y={22}
                  textAnchor="middle"
                >
                  {label}
                </text>
              ))
            : null}
          {/* Bandes de niveau : producteurs en bas, chaque étage nommé. */}
          {scene.bands.map((band) => (
            <g key={`band-${band.level}`}>
              <line
                className="pedago-foodweb-graph__band-rule"
                x1={8}
                y1={band.top}
                x2={scene.laneLeft ?? BASE_W - 8}
                y2={band.top}
                aria-hidden="true"
              />
              <text className="pedago-foodweb-graph__band-label" x={12} y={band.labelY}>
                {band.label}
              </text>
            </g>
          ))}
          {/* Voies hors échelle : décomposeurs, espèces sans niveau connu. */}
          {scene.laneLeft != null ? (
            <line
              className="pedago-foodweb-graph__band-rule"
              x1={scene.laneLeft}
              y1={16}
              x2={scene.laneLeft}
              y2={sceneHeight - 12}
              aria-hidden="true"
            />
          ) : null}
          {scene.lanes.map((lane) => (
            <text
              key={`lane-${lane.key}`}
              className="pedago-foodweb-graph__band-label"
              x={lane.x}
              y={lane.labelY}
              textAnchor="middle"
            >
              {lane.label}
            </text>
          ))}
          {/* Fiche trophique : les trois colonnes de lecture. */}
          {scene.columns.map((column) => (
            <text
              key={`col-${column.key}`}
              className="pedago-foodweb-graph__col-label"
              x={column.x}
              y={28}
              textAnchor="middle"
            >
              {column.label}
            </text>
          ))}
          {scene.othersLabel ? (
            <text
              className="pedago-foodweb-graph__col-label"
              x={BASE_W / 2}
              y={scene.othersY}
              textAnchor="middle"
            >
              {scene.othersLabel}
            </text>
          ) : null}
          {renderedEdges.map((edge) => {
            const from = posOf(edge.tailId);
            const to = posOf(edge.headId);
            if (!from || !to) return null;
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            const tailOff = edge.tailId === ENV_NODE_ID ? 8 : NODE_R + 4;
            const headOff = edge.headId === ENV_NODE_ID ? 10 : NODE_R + 8;
            const x1 = from.x + ux * tailOff;
            const y1 = from.y + uy * tailOff;
            const x2 = to.x - ux * headOff;
            const y2 = to.y - uy * headOff;
            // #1 — deux relations entre les mêmes espèces se superposaient trait
            // pour trait : chacune est écartée de l'axe d'un cran.
            const offset = parallelEdgeOffset(edgeRanks.get(edge.id));
            const px = -uy;
            const py = ux;
            const straightMidX = (x1 + x2) / 2;
            const straightMidY = (y1 + y2) / 2;
            const midX = straightMidX + px * offset;
            const midY = straightMidY + py * offset;
            const d = offset
              ? `M ${x1},${y1} Q ${straightMidX + px * offset * 2},${straightMidY + py * offset * 2} ${x2},${y2}`
              : `M ${x1},${y1} L ${x2},${y2}`;
            const active = selectedEdgeId === edge.id;
            const dim = edgeDimmed(edge.id);
            const edgeType = String(edge.type || '').toLowerCase();
            const markerKey = INTERACTION_TYPES.includes(edgeType) ? edgeType : 'default';
            const markerId = `url(#fw-arrow-${markerKey})`;
            const renderStyle = resolveEdgeRenderStyle(edge.type, { active });
            return (
              <g key={edge.id}>
                {renderStyle.halo ? (
                  <path
                    d={d}
                    className="pedago-foodweb-graph__line-halo"
                    stroke={renderStyle.haloColor}
                    strokeWidth={renderStyle.haloWidth}
                    strokeDasharray={renderStyle.dash || undefined}
                    aria-hidden="true"
                  />
                ) : null}
                <path
                  d={d}
                  className={`pedago-foodweb-graph__line ${edgeStyleClass(edge.type)}${active ? ' active' : ''}${dim ? ' dim' : ''}`}
                  stroke={renderStyle.color}
                  strokeWidth={renderStyle.width}
                  strokeDasharray={renderStyle.dash || undefined}
                  markerEnd={markerId}
                  markerStart={edge.symmetric ? markerId : undefined}
                />
                <circle
                  cx={midX}
                  cy={midY}
                  r={12}
                  className="pedago-foodweb-graph__edge-hit"
                  tabIndex={0}
                  role="button"
                  aria-label={edgeAriaLabel(edge)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onSelectEdge?.(edge.id)}
                  onKeyDown={(e) => onEdgeKeyDown(e, edge.id)}
                  onFocus={() => setHoverEdge(edge.id)}
                  onBlur={() => setHoverEdge(null)}
                  onMouseEnter={() => setHoverEdge(edge.id)}
                  onMouseLeave={() => setHoverEdge(null)}
                >
                  <title>{edgeTitle(edge)}</title>
                </circle>
              </g>
            );
          })}

          {renderedNodes.map((node) => {
            const pos = posOf(node.id);
            if (!pos) return null;
            const isEnv = isEnvNodeId(node.id);
            const highlighted =
              !isEnv && highlightPlantId != null && Number(highlightPlantId) === node.id;
            const focused = focusIds.has(node.id);
            const dim = nodeDimmed(node.id);
            const showLabel = labelVisible(node.id);
            // Sur le cercle, l'étiquette part **en rayon** vers l'extérieur : posée
            // sous la pastille, elle n'a que le pas de l'anneau (49 px à 27 espèces)
            // pour ~88 px de large. En rayon, elle n'occupe que sa hauteur.
            const radial = scene.kind === LAYOUT_CIRCLE && !isEnv;
            const angle = radial
              ? (Math.atan2(pos.y - sceneHeight / 2, pos.x - BASE_W / 2) * 180) / Math.PI
              : 0;
            const flip = radial && (angle > 90 || angle < -90);
            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                className="pedago-foodweb-graph__node-group"
                tabIndex={0}
                role="button"
                aria-label={nodeAriaLabel(node)}
                onPointerDown={(e) => onNodePointerDown(e, node.id)}
                onPointerUp={(e) => onNodePointerUp(e, node.id)}
                onKeyDown={(e) => onNodeKeyDown(e, node.id)}
                onFocus={() => setHoverNode(node.id)}
                onBlur={() => setHoverNode(null)}
                onMouseEnter={() => setHoverNode(node.id)}
                onMouseLeave={() => setHoverNode(null)}
                onDoubleClick={() => openNodePlant(node.id)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  r={NODE_R}
                  className={`pedago-foodweb-graph__node${isEnv ? ' pedago-foodweb-graph__node--env' : ''}${node.outOfScope ? ' pedago-foodweb-graph__node--outside' : ''}${highlighted || focused ? ' highlight' : ''}${dim ? ' dim' : ''}`}
                />
                <text className="pedago-foodweb-graph__node-emoji" textAnchor="middle" y={5}>
                  {node.emoji || '🌱'}
                </text>
                {showLabel ? (
                  <text
                    className={`pedago-foodweb-graph__label${dim ? ' dim' : ''}`}
                    textAnchor={radial ? (flip ? 'end' : 'start') : 'middle'}
                    x={radial ? 0 : undefined}
                    y={radial ? 0 : NODE_R + 14}
                    dy={radial ? '0.32em' : undefined}
                    transform={
                      radial
                        ? `rotate(${flip ? angle + 180 : angle}) translate(${flip ? -(NODE_R + 8) : NODE_R + 8}, 0)`
                        : undefined
                    }
                  >
                    {truncateNodeLabel(node.name)}
                  </text>
                ) : null}
                <title>{nodeTitle(node)}</title>
              </g>
            );
          })}
        </g>
      </svg>

      {focusActive ? (
        <div className="pedago-foodweb-graph__selection" aria-label="Espèces isolées">
          <span className="pedago-foodweb-graph__selection-title">
            {focusIds.size === 1 ? 'Espèce isolée' : `${focusIds.size} espèces isolées`}
          </span>
          {selectedNodes.map((node) => (
            <button
              key={node.id}
              type="button"
              className="pedago-foodweb-graph__chip"
              onClick={() => toggleFocus(node.id, true)}
              title={`Retirer ${node.name} de la sélection`}
              aria-label={`Retirer ${node.name} de la sélection`}
            >
              <span aria-hidden="true">{node.emoji || '🌱'}</span> {node.name}
              <IconClose size={12} />
            </button>
          ))}
        </div>
      ) : null}

      {focusSummary ? (
        <p className="pedago-foodweb-graph__summary section-sub">
          <strong>
            {focusSummary.emoji ? `${focusSummary.emoji} ` : ''}
            {focusSummary.name}
          </strong>
          {Number.isFinite(focusSummary.level) ? ` — ${trophicLevelTitle(focusSummary.level)}` : ''}
          {' · '}
          <span>mange&nbsp;: {focusSummary.eats.length ? focusSummary.eats.join(', ') : '—'}</span>
          {' · '}
          <span>
            est mangée par&nbsp;:{' '}
            {focusSummary.eatenBy.length ? focusSummary.eatenBy.join(', ') : '—'}
          </span>
          {focusSummary.others.length
            ? ` · autres relations : ${focusSummary.others.join(', ')}`
            : ''}
        </p>
      ) : null}

      <FoodWebEdgeLegend
        presentTypes={presentTypes}
        hiddenTypes={hiddenTypes}
        onToggleType={toggleEdgeType}
        compact={legendCompact}
      />

      <p className="pedago-foodweb-graph__hint section-sub">
        Clique une espèce pour isoler son réseau — la scène se recompose autour d’elle (Voisins /
        Chaîne). ⌘/Ctrl + clic, ou le bouton « Ajouter à la sélection », en isole plusieurs à la
        fois ; « Sélection » ne garde alors qu’elles. « Voir la fiche » ouvre la fiche espèce (ou
        Maj+Entrée au clavier). Clique une flèche pour le détail de la relation. Molette ou
        pincement : zoom · glisser : déplacer.
      </p>
    </div>
  );
}
