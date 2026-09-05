import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { INTERACTION_TYPES, interactionTypeLabel } from '../../shared/foodWebTypes.js';
import {
  buildEdgeExportCss,
  edgeStyleClass,
  resolveEdgeRenderStyle,
  TROPHIC_EDGE_TYPES,
} from '../../shared/foodWebEdgeStyle.js';
import { FoodWebEdgeLegend } from './FoodWebEdgeLegend.jsx';
import {
  ENV_NODE_ID,
  FOCUS_DEPTHS,
  buildGraphModel,
  computeCircleLayout,
  computeTrophicLayout,
  focusSubset,
  isEnvNodeId,
  neighborIds,
  parallelEdgeOffset,
  parallelEdgeRanks,
  truncateNodeLabel,
} from './foodWebGraphModel.js';
import {
  IconClose,
  IconDownload,
  IconImage,
  IconLeaf,
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
const ENV_POS = { x: BASE_W / 2, y: 28 };
const CLICK_MOVE_THRESHOLD = 4;

/** Styles embarqués pour l'export SVG/PNG (le CSS de la page ne s'applique pas hors DOM). */
const EXPORT_STYLE = `
  ${buildEdgeExportCss()}
  .pedago-foodweb-graph__node{fill:#dcfce7;stroke:#16a34a;stroke-width:1.5}
  .pedago-foodweb-graph__node.highlight{fill:#bbf7d0;stroke-width:2.5}
  .pedago-foodweb-graph__node.dim{opacity:.18}
  .pedago-foodweb-graph__node--env{fill:#f3f4f6;stroke:#94a3b8;stroke-dasharray:3 3}
  .pedago-foodweb-graph__node--outside{fill:#fff7ed;stroke:#ea9a5c;stroke-dasharray:5 3}
  .pedago-foodweb-graph__label{font:600 10px sans-serif;fill:#1f2937}
  .pedago-foodweb-graph__label.dim{opacity:.2}
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

  const [layout, setLayout] = useState('circle');
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const [overrides, setOverrides] = useState(() => new Map());
  const [hoverNode, setHoverNode] = useState(null);
  const [hoverEdge, setHoverEdge] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [focusDepth, setFocusDepth] = useState(FOCUS_DEPTHS[0]);
  const [search, setSearch] = useState('');
  const [hiddenTypes, setHiddenTypes] = useState(() => new Set());

  const { nodes, edges } = useMemo(() => buildGraphModel(items), [items]);

  const visibleEdges = useMemo(
    () => edges.filter((edge) => !hiddenTypes.has(String(edge.type || '').toLowerCase())),
    [edges, hiddenTypes],
  );

  /** Rang de chaque arête parmi ses parallèles, pour les écarter de l'axe. */
  const edgeRanks = useMemo(() => parallelEdgeRanks(visibleEdges), [visibleEdges]);

  const presentTrophicTypes = useMemo(
    () =>
      TROPHIC_EDGE_TYPES.filter((type) =>
        edges.some((e) => String(e.type || '').toLowerCase() === type),
      ),
    [edges],
  );

  const trophicVisible = useMemo(
    () =>
      presentTrophicTypes.length > 0 && presentTrophicTypes.every((type) => !hiddenTypes.has(type)),
    [presentTrophicTypes, hiddenTypes],
  );

  const toggleEdgeType = useCallback((type) => {
    const key = String(type || '').toLowerCase();
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleTrophicEdges = useCallback(() => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      const hideAll = presentTrophicTypes.every((type) => !next.has(type));
      for (const type of presentTrophicTypes) {
        if (hideAll) next.add(type);
        else next.delete(type);
      }
      return next;
    });
  }, [presentTrophicTypes]);

  const presentTypes = useMemo(
    () => [
      ...new Set((edges || []).map((e) => String(e.type || '').toLowerCase()).filter(Boolean)),
    ],
    [edges],
  );

  const baseLayout = useMemo(
    () =>
      layout === 'trophic'
        ? computeTrophicLayout(nodes, { width: BASE_W, height: BASE_H })
        : computeCircleLayout(nodes, { width: BASE_W, height: BASE_H }),
    [nodes, layout],
  );

  const posOf = useCallback(
    (id) => {
      if (id == null) return ENV_POS;
      return overrides.get(id) || baseLayout.get(id) || ENV_POS;
    },
    [overrides, baseLayout],
  );

  // Ensembles « actifs » (pleine opacité). Le reste est estompé.
  const { activeNodes, activeEdges, hasFilter } = useMemo(() => {
    if (focusId != null) {
      const subset = focusSubset(visibleEdges, focusId, focusDepth);
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
  }, [visibleEdges, focusId, focusDepth, hoverNode, hoverEdge]);

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
      const vbY = ((evt.clientY - rect.top) / rect.height) * BASE_H;
      return { x: (vbX - view.tx) / view.scale, y: (vbY - view.ty) / view.scale };
    },
    [view],
  );

  // --- Zoom ---
  const zoomBy = useCallback((factor, center) => {
    setView((v) => {
      const scale = Math.min(4, Math.max(0.4, v.scale * factor));
      const cx = center ? center.x : BASE_W / 2;
      const cy = center ? center.y : BASE_H / 2;
      // garde le point (cx,cy) fixe à l'écran
      const tx = cx - ((cx - v.tx) * scale) / v.scale;
      const ty = cy - ((cy - v.ty) * scale) / v.scale;
      return { scale, tx, ty };
    });
  }, []);

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
              y: ((evt.clientY - rect.top) / rect.height) * BASE_H,
            }
          : null;
      zoomBy(evt.deltaY < 0 ? 1.12 : 1 / 1.12, center);
    };
    svgEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => svgEl.removeEventListener('wheel', handleWheel);
  }, [svgEl, zoomBy]);

  const resetView = useCallback(() => {
    setView({ scale: 1, tx: 0, ty: 0 });
    setOverrides(new Map());
  }, []);

  /** Changer de disposition recompose la scène : les positions déplacées à la
   *  main sont abandonnées, sinon « Niveaux » laissait des nœuds au cercle. */
  const changeLayout = useCallback((next) => {
    setLayout((cur) => {
      if (cur !== next) setOverrides(new Map());
      return next;
    });
  }, []);

  // --- Zoom au pincement (les élèves travaillent sur tablette) ---
  // `touch-action: none` est nécessaire au déplacement mais neutralise le
  // pincement natif du navigateur : il faut donc le gérer nous-mêmes.
  const pointersRef = useRef(new Map());
  const pinchRef = useRef(null);

  const clientToViewbox = useCallback((clientX, clientY) => {
    const rect = svgRef.current?.getBoundingClientRect?.();
    if (!rect || !rect.width || !rect.height) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * BASE_W,
      y: ((clientY - rect.top) / rect.height) * BASE_H,
    };
  }, []);

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
        const dy = ((evt.clientY - drag.startClient.y) / rect.height) * BASE_H;
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
    [clientToBase, commitPendingDrag, handlePinchMove],
  );

  const onPointerUp = useCallback(
    (evt) => {
      releasePointer(evt);
      flushPendingDrag();
      dragRef.current = null;
    },
    [flushPendingDrag, releasePointer],
  );

  const toggleFocus = useCallback((id) => {
    setFocusId((cur) => (cur === id ? null : id));
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
    setFocusId(id);
  }, [highlightPlantId, nodes]);

  // Le jeu de données a changé (carte, zone, filtre de type) : un focus sur un nœud
  // disparu vidait la scène sans que rien ne l'explique.
  useEffect(() => {
    if (focusId == null) return;
    if (!nodes.some((node) => node.id === focusId)) setFocusId(null);
  }, [nodes, focusId]);

  const onNodePointerUp = useCallback(
    (evt, id) => {
      const wasPinching = Boolean(pinchRef.current);
      releasePointer(evt);
      flushPendingDrag();
      const drag = dragRef.current;
      const moved = drag?.kind === 'node' && drag.moved;
      dragRef.current = null;
      // Lever un doigt d'un pincement ne doit pas être compris comme un clic.
      if (!moved && !wasPinching) toggleFocus(id);
    },
    [flushPendingDrag, releasePointer, toggleFocus],
  );

  /** Le nœud « environnement » n'a pas de fiche espèce à ouvrir. */
  const openNodePlant = useCallback(
    (id) => {
      if (isEnvNodeId(id)) return;
      onOpenPlant?.(id);
    },
    [onOpenPlant],
  );

  // Clavier : Entrée/Espace isole le réseau du nœud, Maj+Entrée ouvre sa fiche.
  const onNodeKeyDown = useCallback(
    (evt, id) => {
      if (evt.key !== 'Enter' && evt.key !== ' ' && evt.key !== 'Spacebar') return;
      evt.preventDefault();
      if (evt.shiftKey) openNodePlant(id);
      else toggleFocus(id);
    },
    [openNodePlant, toggleFocus],
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
      setFocusId(first.id);
      setSearch('');
    },
    [searchMatches],
  );

  // --- Intitulés (infobulle souris + nom accessible clavier/lecteur d'écran) ---

  const nodeTitle = useCallback((node) => {
    if (isEnvNodeId(node.id)) {
      return `${node.name} (sol, air, lumière) — clic : isoler ses liens`;
    }
    const scope = node.outOfScope ? ' — hors du périmètre filtré' : '';
    return `${node.name}${node.role ? ` (${node.role})` : ''}${scope} — clic : focus, double-clic : fiche`;
  }, []);

  const nodeAriaLabel = useCallback((node) => {
    if (isEnvNodeId(node.id)) {
      return `${node.name} — Entrée : isoler ses liens`;
    }
    const scope = node.outOfScope ? ', hors du périmètre filtré' : '';
    return `${node.name}${node.role ? `, ${node.role}` : ''}${scope} — Entrée : isoler son réseau, Maj+Entrée : ouvrir la fiche`;
  }, []);

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
    clone.setAttribute('height', String(BASE_H));
    // neutralise pan/zoom pour un export cadré
    const inner = clone.querySelector('[data-fw-viewport]');
    if (inner) inner.setAttribute('transform', 'translate(0,0) scale(1)');
    const style = document.createElement('style');
    style.textContent = EXPORT_STYLE;
    clone.insertBefore(style, clone.firstChild);
    return new window.XMLSerializer().serializeToString(clone);
  }, []);

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
      canvas.height = BASE_H * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) download(blob, 'reseau-trophique.png');
      }, 'image/png');
    };
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(str)))}`;
  }, [serializeSvg]);

  if (nodes.length === 0) {
    return <p className="section-sub">Aucun nœud à afficher.</p>;
  }

  const transform = `translate(${view.tx}, ${view.ty}) scale(${view.scale})`;

  return (
    <div className="pedago-foodweb-graph__wrap">
      <div className="pedago-foodweb-graph__toolbar" role="toolbar" aria-label="Outils du graphe">
        <div className="pedago-foodweb-graph__tbgroup" role="group" aria-label="Disposition">
          <button
            type="button"
            className={`pedago-foodweb-graph__tbtn${layout === 'circle' ? ' active' : ''}`}
            onClick={() => changeLayout('circle')}
            aria-pressed={layout === 'circle'}
          >
            <IconTarget size={14} /> Cercle
          </button>
          <button
            type="button"
            className={`pedago-foodweb-graph__tbtn${layout === 'trophic' ? ' active' : ''}`}
            onClick={() => changeLayout('trophic')}
            aria-pressed={layout === 'trophic'}
            title="Producteurs → consommateurs → décomposeurs"
          >
            <IconStats size={14} /> Niveaux
          </button>
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
        {presentTrophicTypes.length > 0 ? (
          <div className="pedago-foodweb-graph__tbgroup" role="group" aria-label="Flux trophiques">
            <button
              type="button"
              className={`pedago-foodweb-graph__tbtn${trophicVisible ? ' active' : ''}`}
              onClick={toggleTrophicEdges}
              aria-pressed={trophicVisible}
              title="Afficher ou masquer herbivorie, prédation et décomposition"
            >
              <IconLeaf size={14} /> Flux trophiques
            </button>
          </div>
        ) : null}
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
            <IconSearch size={14} /> Isoler
          </button>
        </form>
        {focusId != null ? (
          <div
            className="pedago-foodweb-graph__tbgroup"
            role="group"
            aria-label="Étendue du réseau isolé"
          >
            {FOCUS_DEPTHS.map((depth) => (
              <button
                key={depth}
                type="button"
                className={`pedago-foodweb-graph__tbtn${focusDepth === depth ? ' active' : ''}`}
                onClick={() => setFocusDepth(depth)}
                aria-pressed={focusDepth === depth}
                title={
                  depth === 1
                    ? 'Voisins directs de l’espèce'
                    : 'Deux crans : la chaîne alimentaire autour de l’espèce'
                }
              >
                {depth === 1 ? 'Voisins' : 'Chaîne'}
              </button>
            ))}
          </div>
        ) : null}
        {focusId != null ? (
          <button
            type="button"
            className="pedago-foodweb-graph__tbtn pedago-foodweb-graph__tbtn--focus"
            onClick={() => setFocusId(null)}
          >
            <IconClose size={14} /> Tout afficher
          </button>
        ) : null}
        <div className="pedago-foodweb-graph__tbgroup" role="group" aria-label="Export">
          <button type="button" className="pedago-foodweb-graph__tbtn" onClick={exportPng}>
            <IconImage size={14} /> PNG
          </button>
          <button type="button" className="pedago-foodweb-graph__tbtn" onClick={exportSvg}>
            <IconDownload size={14} /> SVG
          </button>
        </div>
      </div>

      <svg
        ref={attachSvg}
        className="pedago-foodweb-graph"
        viewBox={`0 0 ${BASE_W} ${BASE_H}`}
        role="group"
        aria-label="Graphe interactif du réseau trophique"
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <defs>
          {INTERACTION_TYPES.map((type) => (
            <React.Fragment key={type}>
              <marker
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
              <marker
                id={`fw-arrow-${type}-active`}
                markerWidth="11"
                markerHeight="11"
                refX="8"
                refY="3.5"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M0,0 L9,3.5 L0,7 Z" className="pedago-foodweb-graph__arrowhead active" />
              </marker>
            </React.Fragment>
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
          <marker
            id="fw-arrow-default-active"
            markerWidth="11"
            markerHeight="11"
            refX="8"
            refY="3.5"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0 L9,3.5 L0,7 Z" className="pedago-foodweb-graph__arrowhead active" />
          </marker>
        </defs>

        <g data-fw-viewport transform={transform}>
          {visibleEdges.map((edge) => {
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
            const markerId = active
              ? `url(#fw-arrow-${markerKey}-active)`
              : `url(#fw-arrow-${markerKey})`;
            const renderStyle = resolveEdgeRenderStyle(edge.type, { active });
            return (
              <g key={edge.id}>
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

          {nodes.map((node) => {
            const pos = posOf(node.id);
            if (!pos) return null;
            const isEnv = isEnvNodeId(node.id);
            const highlighted =
              !isEnv && highlightPlantId != null && Number(highlightPlantId) === node.id;
            const focused = focusId === node.id;
            const dim = nodeDimmed(node.id);
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
                <text
                  className={`pedago-foodweb-graph__label${dim ? ' dim' : ''}`}
                  textAnchor="middle"
                  y={NODE_R + 14}
                >
                  {truncateNodeLabel(node.name)}
                </text>
                <title>{nodeTitle(node)}</title>
              </g>
            );
          })}
        </g>
      </svg>

      <FoodWebEdgeLegend
        presentTypes={presentTypes}
        hiddenTypes={hiddenTypes}
        onToggleType={toggleEdgeType}
        compact={legendCompact}
      />

      <p className="pedago-foodweb-graph__hint section-sub">
        Clique une espèce pour isoler son réseau, double-clique pour sa fiche. Molette : zoom ·
        glisser : déplacer.
      </p>
    </div>
  );
}
