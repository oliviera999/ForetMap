import React, { useMemo } from 'react';

/**
 * Graphe SVG léger : nœuds en cercle, arêtes comme segments.
 */
export function FoodWebGraph({ items, onSelectEdge, selectedEdgeId, highlightPlantId, onOpenPlant }) {
  const { nodes, edges } = useMemo(() => {
    const nodeMap = new Map();
    for (const row of items || []) {
      if (row.from_id != null) {
        nodeMap.set(Number(row.from_id), {
          id: Number(row.from_id),
          name: row.from_name,
          emoji: row.from_emoji,
        });
      }
      if (row.to_id != null) {
        nodeMap.set(Number(row.to_id), {
          id: Number(row.to_id),
          name: row.to_name,
          emoji: row.to_emoji,
        });
      }
    }
    const nodesArr = [...nodeMap.values()];
    const edgesArr = (items || []).map((row) => ({
      id: row.id,
      fromId: row.from_id != null ? Number(row.from_id) : null,
      toId: row.to_id != null ? Number(row.to_id) : null,
      type: row.interaction_type,
    }));
    return { nodes: nodesArr, edges: edgesArr };
  }, [items]);

  const positions = useMemo(() => {
    const cx = 220;
    const cy = 180;
    const r = 130;
    const map = new Map();
    nodes.forEach((node, index) => {
      const angle = (2 * Math.PI * index) / Math.max(nodes.length, 1) - Math.PI / 2;
      map.set(node.id, {
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
      });
    });
    return map;
  }, [nodes]);

  if (nodes.length === 0) {
    return <p className="section-sub">Aucun nœud à afficher.</p>;
  }

  return (
    <svg className="pedago-foodweb-graph" viewBox="0 0 440 360" role="img" aria-label="Graphe du réseau trophique">
      {edges.map((edge) => {
        const from = edge.fromId != null ? positions.get(edge.fromId) : { x: 220, y: 30 };
        const to = edge.toId != null ? positions.get(edge.toId) : { x: 220, y: 330 };
        if (!from || !to) return null;
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        const active = selectedEdgeId === edge.id;
        return (
          <g key={edge.id}>
            <line
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              className={`pedago-foodweb-graph__line${active ? ' active' : ''}`}
            />
            <circle
              cx={midX}
              cy={midY}
              r={10}
              className={`pedago-foodweb-graph__edge-hit${active ? ' active' : ''}`}
              onClick={() => onSelectEdge?.(edge.id)}
            />
          </g>
        );
      })}
      {nodes.map((node) => {
        const pos = positions.get(node.id);
        if (!pos) return null;
        const highlighted = highlightPlantId != null && Number(highlightPlantId) === node.id;
        return (
          <g key={node.id} transform={`translate(${pos.x}, ${pos.y})`}>
            <circle
              r={18}
              className={`pedago-foodweb-graph__node${highlighted ? ' highlight' : ''}`}
              onClick={() => onOpenPlant?.(node.id)}
            />
            <text className="pedago-foodweb-graph__label" textAnchor="middle" y={32}>
              {(node.emoji ? `${node.emoji} ` : '') + (node.name || '').slice(0, 14)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
