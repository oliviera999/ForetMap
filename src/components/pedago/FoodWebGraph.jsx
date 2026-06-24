import React, { useCallback, useMemo, useRef, useState } from 'react';
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
  buildGraphModel,
  computeCircleLayout,
  computeTrophicLayout,
  focusSubset,
  neighborIds,
} from './foodWebGraphModel.js';

const BASE_W = 640;
const BASE_H = 440;
const NODE_R = 20;
const ENV_POS = { x: BASE_W / 2, y: 28 };
const CLICK_MOVE_THRESHOLD = 4;

/** Styles embarqués pour l'export SVG/PNG (le CSS de la page ne s'applique pas hors DOM). */
const EXPORT_STYLE = `
  ${buildEdgeExportCss()}
  .pedago-foodweb-graph__node{fill:#dcfce7;stroke:#16a34a;stroke-width:1.5}
  .pedago-foodweb-graph__node.highlight{fill:#bbf7d0;stroke-width:2.6}
  .pedago-foodweb-graph__node.dim{opacity:.18}
  .pedago-foodweb-graph__node--env{fill:#f3f4f6;stroke:#94a3b8;stroke-dasharray:3 3}
  .pedago-foodweb-graph__label{font:600 10px sans-serif;fill:#1f2937}
  .pedago-foodweb-graph__label.dim{opacity:.2}
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
}) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);

  const [layout, setLayout] = useState('circle');
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const [overrides, setOverrides] = useState(() => new Map());
  const [hoverNode, setHoverNode] = useState(null);
  const [hoverEdge, setHoverEdge] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [hiddenTypes, setHiddenTypes] = useState(() => new Set());

  const { nodes, edges } = useMemo(() => buildGraphModel(items), [items]);

  const visibleEdges = useMemo(
    () => edges.filter((edge) => !hiddenTypes.has(String(edge.type || '').toLowerCase())),
    [edges, hiddenTypes],
  );

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
      if (id === ENV_NODE_ID || id == null) return ENV_POS;
      return overrides.get(id) || baseLayout.get(id) || ENV_POS;
    },
    [overrides, baseLayout],
  );

  // Ensembles « actifs » (pleine opacité). Le reste est estompé.
  const { activeNodes, activeEdges, hasFilter } = useMemo(() => {
    if (focusId != null) {
      const subset = focusSubset(visibleEdges, focusId);
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
  }, [visibleEdges, focusId, hoverNode, hoverEdge]);

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

  const onWheel = useCallback(
    (evt) => {
      evt.preventDefault();
      const svg = svgRef.current;
      const rect = svg?.getBoundingClientRect?.();
      const center = rect
        ? {
            x: ((evt.clientX - rect.left) / rect.width) * BASE_W,
            y: ((evt.clientY - rect.top) / rect.height) * BASE_H,
          }
        : null;
      zoomBy(evt.deltaY < 0 ? 1.12 : 1 / 1.12, center);
    },
    [zoomBy],
  );

  const resetView = useCallback(() => {
    setView({ scale: 1, tx: 0, ty: 0 });
    setOverrides(new Map());
  }, []);

  // --- Drag nœud / pan fond ---
  const onNodePointerDown = useCallback(
    (evt, id) => {
      evt.stopPropagation();
      const start = clientToBase(evt);
      dragRef.current = { kind: 'node', id, moved: false, last: start };
      evt.currentTarget.setPointerCapture?.(evt.pointerId);
    },
    [clientToBase],
  );

  const onBackgroundPointerDown = useCallback(
    (evt) => {
      dragRef.current = {
        kind: 'pan',
        moved: false,
        startClient: { x: evt.clientX, y: evt.clientY },
        startView: view,
      };
    },
    [view],
  );

  const onPointerMove = useCallback(
    (evt) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.kind === 'node') {
        const p = clientToBase(evt);
        if (!p || !drag.last) return;
        if (Math.abs(p.x - drag.last.x) > CLICK_MOVE_THRESHOLD || drag.moved) drag.moved = true;
        setOverrides((prev) => {
          const next = new Map(prev);
          next.set(drag.id, { x: p.x, y: p.y });
          return next;
        });
      } else if (drag.kind === 'pan') {
        const svg = svgRef.current;
        const rect = svg?.getBoundingClientRect?.();
        if (!rect) return;
        const dx = ((evt.clientX - drag.startClient.x) / rect.width) * BASE_W;
        const dy = ((evt.clientY - drag.startClient.y) / rect.height) * BASE_H;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true;
        setView({
          scale: drag.startView.scale,
          tx: drag.startView.tx + dx,
          ty: drag.startView.ty + dy,
        });
      }
    },
    [clientToBase],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const toggleFocus = useCallback((id) => {
    setFocusId((cur) => (cur === id ? null : id));
  }, []);

  const onNodePointerUp = useCallback(
    (evt, id) => {
      const drag = dragRef.current;
      const moved = drag?.kind === 'node' && drag.moved;
      dragRef.current = null;
      if (!moved) toggleFocus(id);
    },
    [toggleFocus],
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
            onClick={() => setLayout('circle')}
            aria-pressed={layout === 'circle'}
          >
            ⭕ Cercle
          </button>
          <button
            type="button"
            className={`pedago-foodweb-graph__tbtn${layout === 'trophic' ? ' active' : ''}`}
            onClick={() => setLayout('trophic')}
            aria-pressed={layout === 'trophic'}
            title="Producteurs → consommateurs → décomposeurs"
          >
            📊 Niveaux
          </button>
        </div>
        <div className="pedago-foodweb-graph__tbgroup" role="group" aria-label="Zoom">
          <button
            type="button"
            className="pedago-foodweb-graph__tbtn"
            onClick={() => zoomBy(1 / 1.2)}
            aria-label="Dézoomer"
          >
            −
          </button>
          <button
            type="button"
            className="pedago-foodweb-graph__tbtn"
            onClick={resetView}
            title="Réinitialiser la vue et les positions"
          >
            ⟳
          </button>
          <button
            type="button"
            className="pedago-foodweb-graph__tbtn"
            onClick={() => zoomBy(1.2)}
            aria-label="Zoomer"
          >
            +
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
              🍃 Flux trophiques
            </button>
          </div>
        ) : null}
        {focusId != null ? (
          <button
            type="button"
            className="pedago-foodweb-graph__tbtn pedago-foodweb-graph__tbtn--focus"
            onClick={() => setFocusId(null)}
          >
            ✕ Tout afficher
          </button>
        ) : null}
        <div className="pedago-foodweb-graph__tbgroup" role="group" aria-label="Export">
          <button type="button" className="pedago-foodweb-graph__tbtn" onClick={exportPng}>
            🖼️ PNG
          </button>
          <button type="button" className="pedago-foodweb-graph__tbtn" onClick={exportSvg}>
            ⬇️ SVG
          </button>
        </div>
      </div>

      <svg
        ref={svgRef}
        className="pedago-foodweb-graph"
        viewBox={`0 0 ${BASE_W} ${BASE_H}`}
        role="img"
        aria-label="Graphe interactif du réseau trophique"
        onWheel={onWheel}
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
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
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
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
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
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onSelectEdge?.(edge.id)}
                  onMouseEnter={() => setHoverEdge(edge.id)}
                  onMouseLeave={() => setHoverEdge(null)}
                >
                  <title>
                    {`${interactionTypeLabel(edge.type)} — ${edge.relation}${
                      edge.description ? ` : ${edge.description}` : ''
                    }`}
                  </title>
                </circle>
              </g>
            );
          })}

          {nodes.map((node) => {
            const pos = posOf(node.id);
            if (!pos) return null;
            const highlighted = highlightPlantId != null && Number(highlightPlantId) === node.id;
            const focused = focusId === node.id;
            const dim = nodeDimmed(node.id);
            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                className="pedago-foodweb-graph__node-group"
                onPointerDown={(e) => onNodePointerDown(e, node.id)}
                onPointerUp={(e) => onNodePointerUp(e, node.id)}
                onPointerMove={onPointerMove}
                onMouseEnter={() => setHoverNode(node.id)}
                onMouseLeave={() => setHoverNode(null)}
                onDoubleClick={() => onOpenPlant?.(node.id)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  r={NODE_R}
                  className={`pedago-foodweb-graph__node${highlighted || focused ? ' highlight' : ''}${dim ? ' dim' : ''}`}
                />
                <text className="pedago-foodweb-graph__node-emoji" textAnchor="middle" y={5}>
                  {node.emoji || '🌱'}
                </text>
                <text
                  className={`pedago-foodweb-graph__label${dim ? ' dim' : ''}`}
                  textAnchor="middle"
                  y={NODE_R + 14}
                >
                  {(node.name || '').slice(0, 16)}
                </text>
                <title>{`${node.name}${node.role ? ` (${node.role})` : ''} — clic : focus, double-clic : fiche`}</title>
              </g>
            );
          })}
        </g>
      </svg>

      <FoodWebEdgeLegend
        presentTypes={presentTypes}
        hiddenTypes={hiddenTypes}
        onToggleType={toggleEdgeType}
      />

      <p className="pedago-foodweb-graph__hint section-sub">
        Clique une espèce pour isoler son réseau, double-clique pour sa fiche. Molette : zoom ·
        glisser : déplacer.
      </p>
    </div>
  );
}
