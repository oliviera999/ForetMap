import { memo } from 'react';

/**
 * Éléments SVG mémoïsés du graphe du réseau trophique (sortis de `FoodWebGraph.jsx`, flux C3
 * du chantier collège) et tabulation itinérante. Partagés avec G&L (`GLFoodWebPanel`) par
 * `FoodWebGraph`.
 */

export const NODE_R = 20;
/** Rayon de la cible de toucher (invisible) : 44 px de diamètre, règle tactile projet. */
export const HIT_R = 22;

/** Touches de la tabulation itinérante (un seul arrêt Tab par famille d'éléments). */
export const ROVING_NEXT = new Set(['ArrowRight', 'ArrowDown']);
export const ROVING_PREV = new Set(['ArrowLeft', 'ArrowUp']);

/** Élément voisin dans une liste pour la tabulation itinérante (null si touche sans effet). */
export function rovingTarget(key, ids, currentId) {
  if (!ids.length) return null;
  const idx = Math.max(0, ids.indexOf(currentId));
  if (ROVING_NEXT.has(key)) return ids[(idx + 1) % ids.length];
  if (ROVING_PREV.has(key)) return ids[(idx - 1 + ids.length) % ids.length];
  if (key === 'Home') return ids[0];
  if (key === 'End') return ids[ids.length - 1];
  return null;
}

/**
 * Flèche du graphe. Mémoïsée, avec des props primitives et des gestionnaires stables :
 * un survol ou le glissement d'un nœud ne redessinent que les flèches concernées.
 */
export const FoodWebEdgeView = memo(function FoodWebEdgeView({
  id,
  d,
  halo,
  haloColor,
  haloWidth,
  dash,
  lineClass,
  color,
  width,
  opacity,
  markerId,
  symmetric,
  midX,
  midY,
  ariaLabel,
  title,
  tabIndex,
  handlers,
}) {
  return (
    <g>
      {halo ? (
        <path
          d={d}
          className="pedago-foodweb-graph__line-halo"
          stroke={haloColor}
          strokeWidth={haloWidth}
          strokeDasharray={dash || undefined}
          aria-hidden="true"
        />
      ) : null}
      <path
        d={d}
        className={lineClass}
        stroke={color}
        strokeWidth={width}
        strokeDasharray={dash || undefined}
        opacity={opacity === 1 ? undefined : opacity}
        markerEnd={markerId}
        markerStart={symmetric ? markerId : undefined}
      />
      <circle
        cx={midX}
        cy={midY}
        r={HIT_R}
        className="pedago-foodweb-graph__edge-hit"
        tabIndex={tabIndex}
        role="button"
        aria-label={ariaLabel}
        data-fw-edge={id}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => handlers.click(id)}
        onKeyDown={(e) => handlers.keyDown(e, id)}
        onFocus={() => handlers.focus(id)}
        onBlur={handlers.blur}
        onMouseEnter={() => handlers.enter(id)}
        onMouseLeave={handlers.leave}
      >
        <title>{title}</title>
      </circle>
    </g>
  );
});

/** Nœud (espèce ou environnement) du graphe — mêmes principes que `FoodWebEdgeView`. */
export const FoodWebNodeView = memo(function FoodWebNodeView({
  id,
  x,
  y,
  circleClass,
  emoji,
  showLabel,
  labelClass,
  labelText,
  radial,
  flip,
  angle,
  title,
  ariaLabel,
  tabIndex,
  handlers,
}) {
  return (
    <g
      transform={`translate(${x}, ${y})`}
      className="pedago-foodweb-graph__node-group"
      tabIndex={tabIndex}
      role="button"
      aria-label={ariaLabel}
      data-fw-node={id}
      onPointerDown={(e) => handlers.pointerDown(e, id)}
      onPointerUp={(e) => handlers.pointerUp(e, id)}
      onKeyDown={(e) => handlers.keyDown(e, id)}
      onFocus={() => handlers.focus(id)}
      onBlur={handlers.blur}
      onMouseEnter={() => handlers.enter(id)}
      onMouseLeave={handlers.leave}
      onDoubleClick={() => handlers.open(id)}
      style={{ cursor: 'pointer' }}
    >
      <circle r={HIT_R} className="pedago-foodweb-graph__node-hit" aria-hidden="true" />
      <circle r={NODE_R} className={circleClass} />
      <text className="pedago-foodweb-graph__node-emoji" textAnchor="middle" y={5}>
        {emoji}
      </text>
      {showLabel ? (
        <text
          className={labelClass}
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
          {labelText}
        </text>
      ) : null}
      <title>{title}</title>
    </g>
  );
});
