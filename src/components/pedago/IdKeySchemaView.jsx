import { useMemo } from 'react';
import { coupletNodeId, layoutIdKeySchema } from '../../utils/idKeySchemaLayout.js';

const NODE_R = 22;
const PLANT_RX = 56;
const PLANT_RY = 28;

/**
 * Schéma SVG interactif d’une clé dichotomique.
 * Seules les arêtes issues du couplet courant sont cliquables.
 */
export function IdKeySchemaView({
  keyBundle,
  currentCoupletId,
  history = [],
  onChooseLead,
  onOpenPlant,
}) {
  const layout = useMemo(() => layoutIdKeySchema(keyBundle), [keyBundle]);

  const pathCoupletIds = useMemo(() => {
    const ids = new Set();
    const couplets = keyBundle?.couplets || [];
    const startC = couplets.find((c) => Number(c.number) === 1) || couplets[0];
    if (startC) ids.add(Number(startC.id));
    if (currentCoupletId != null) ids.add(Number(currentCoupletId));
    for (const h of history || []) ids.add(Number(h));
    return ids;
  }, [keyBundle, currentCoupletId, history]);

  const pathNodeIds = useMemo(() => {
    const set = new Set();
    for (const id of pathCoupletIds) set.add(coupletNodeId(id));
    return set;
  }, [pathCoupletIds]);

  const pathEdgeIds = useMemo(() => {
    // Arêtes entre couplets successifs : départ → history[0] → … → courant
    const chain = [];
    const couplets = keyBundle?.couplets || [];
    const startC = couplets.find((c) => Number(c.number) === 1) || couplets[0];
    if (startC) chain.push(Number(startC.id));
    for (const h of history || []) chain.push(Number(h));

    const edgeSet = new Set();
    for (let i = 0; i < chain.length - 1; i += 1) {
      const from = chain[i];
      const to = chain[i + 1];
      const edge = layout.edges.find(
        (e) => Number(e.fromCoupletId) === from && Number(e.next_couplet_id) === to,
      );
      if (edge) edgeSet.add(edge.id);
    }
    return edgeSet;
  }, [keyBundle, history, layout.edges]);

  if (!layout.nodes.length) {
    return <p className="form-error">Cette clé n’a pas encore de couplet de départ.</p>;
  }

  const currentNodeId = coupletNodeId(currentCoupletId);

  return (
    <div className="id-key-schema" role="img" aria-label="Schéma de la clé d’identification">
      <div className="id-key-schema__scroll">
        <svg
          className="id-key-schema__svg"
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
        >
          {layout.edges.map((edge) => {
            const fromCurrent = Number(edge.fromCoupletId) === Number(currentCoupletId);
            const onPath = pathEdgeIds.has(edge.id);
            const dim = !fromCurrent && !onPath;
            const clickable = fromCurrent;
            const className = [
              'id-key-schema__edge',
              fromCurrent ? 'id-key-schema__edge--active' : '',
              onPath ? 'id-key-schema__edge--path' : '',
              dim ? 'id-key-schema__edge--dim' : '',
              clickable ? 'id-key-schema__edge--clickable' : '',
            ]
              .filter(Boolean)
              .join(' ');

            const hit = (
              <path
                d={`M ${edge.x1} ${edge.y1} L ${edge.x2} ${edge.y2}`}
                className="id-key-schema__edge-hit"
                pointerEvents={clickable ? 'stroke' : 'none'}
                onClick={
                  clickable
                    ? () =>
                        onChooseLead?.({
                          id: edge.leadId,
                          statement: edge.statement,
                          image_url: edge.image_url,
                          next_couplet_id: edge.next_couplet_id,
                          plant_id: edge.plant_id,
                          plant_name: edge.plant_name,
                          plant_emoji: edge.plant_emoji,
                        })
                    : undefined
                }
              />
            );

            return (
              <g key={edge.id} className={className}>
                <line
                  x1={edge.x1}
                  y1={edge.y1}
                  x2={edge.x2}
                  y2={edge.y2}
                  className="id-key-schema__edge-line"
                />
                {hit}
                <g
                  transform={`translate(${edge.midX}, ${edge.midY})`}
                  className="id-key-schema__edge-label"
                >
                  {edge.image_url ? (
                    <image
                      href={edge.image_url}
                      x={-20}
                      y={-48}
                      width={40}
                      height={40}
                      preserveAspectRatio="xMidYMid slice"
                      className="id-key-schema__edge-img"
                    />
                  ) : null}
                  <rect
                    x={-70}
                    y={edge.image_url ? -4 : -12}
                    width={140}
                    height={28}
                    rx={6}
                    className="id-key-schema__edge-label-bg"
                  />
                  <text
                    y={edge.image_url ? 14 : 6}
                    textAnchor="middle"
                    className="id-key-schema__edge-label-text"
                  >
                    {edge.label || '—'}
                  </text>
                  {clickable ? (
                    <rect
                      x={-72}
                      y={edge.image_url ? -52 : -22}
                      width={144}
                      height={edge.image_url ? 80 : 44}
                      rx={8}
                      className="id-key-schema__edge-tap"
                      onClick={() =>
                        onChooseLead?.({
                          id: edge.leadId,
                          statement: edge.statement,
                          image_url: edge.image_url,
                          next_couplet_id: edge.next_couplet_id,
                          plant_id: edge.plant_id,
                          plant_name: edge.plant_name,
                          plant_emoji: edge.plant_emoji,
                        })
                      }
                    />
                  ) : null}
                </g>
              </g>
            );
          })}

          {layout.nodes.map((node) => {
            const isCurrent = node.id === currentNodeId;
            const onPath = pathNodeIds.has(node.id);
            const isActiveTarget = layout.edges.some(
              (e) => Number(e.fromCoupletId) === Number(currentCoupletId) && e.toId === node.id,
            );
            const dim = !isCurrent && !onPath && !isActiveTarget;
            if (node.type === 'plant') {
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  className={[
                    'id-key-schema__node',
                    'id-key-schema__node--plant',
                    dim ? 'id-key-schema__node--dim' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <ellipse rx={PLANT_RX} ry={PLANT_RY} className="id-key-schema__node-shape" />
                  <text y={-4} textAnchor="middle" className="id-key-schema__node-emoji">
                    {node.emoji || '🌿'}
                  </text>
                  <text y={14} textAnchor="middle" className="id-key-schema__node-label">
                    {truncatePlantName(node.name)}
                  </text>
                  {typeof onOpenPlant === 'function' && node.plantId ? (
                    <ellipse
                      rx={PLANT_RX}
                      ry={PLANT_RY}
                      className="id-key-schema__node-tap"
                      onClick={() => onOpenPlant(node.plantId)}
                    />
                  ) : null}
                </g>
              );
            }
            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                className={[
                  'id-key-schema__node',
                  'id-key-schema__node--couplet',
                  isCurrent ? 'id-key-schema__node--current' : '',
                  onPath ? 'id-key-schema__node--path' : '',
                  dim ? 'id-key-schema__node--dim' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <circle r={NODE_R} className="id-key-schema__node-shape" />
                <text y={5} textAnchor="middle" className="id-key-schema__node-number">
                  {node.number || '?'}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="id-key-schema__hint muted">
        Touchez une branche depuis le couplet mis en évidence (nœud plein) pour avancer.
      </p>
    </div>
  );
}

function truncatePlantName(name, max = 14) {
  const s = String(name || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
