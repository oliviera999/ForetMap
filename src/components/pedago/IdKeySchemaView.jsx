import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveExternalImageUrl } from '../../shared/privacy/externalAssets.js';
import {
  LABEL_LINE_H,
  LABEL_W,
  coupletNodeId,
  layoutIdKeySchema,
} from '../../utils/idKeySchemaLayout.js';

const NODE_R = 22;
const PLANT_RX = 56;
const PLANT_RY = 28;
const BOX_W = 120;
const BOX_H = 36;
/** Hauteur minimale d'une zone de toucher (px, règle projet). */
const TAP_MIN_H = 44;

function leadPayload(edge) {
  return {
    id: edge.leadId,
    statement: edge.statement,
    image_url: edge.image_url,
    next_couplet_id: edge.next_couplet_id,
    plant_id: edge.plant_id,
    plant_name: edge.plant_name,
    plant_emoji: edge.plant_emoji,
  };
}

function onActivateKey(evt, action) {
  if (evt.key !== 'Enter' && evt.key !== ' ' && evt.key !== 'Spacebar') return;
  evt.preventDefault();
  action();
}

/** Zone de toucher d'une étiquette : vignette + étiquette, au moins 44 px de haut. */
function tapRect(edge) {
  const top = edge.imageBox ? edge.imageBox.y : edge.labelBox.y;
  const bottom = edge.labelBox.y + edge.labelBox.height;
  const extra = Math.max(0, TAP_MIN_H - (bottom - top)) / 2;
  return {
    x: edge.labelBox.x - 2,
    y: top - extra - 2,
    width: LABEL_W + 4,
    height: bottom - top + extra * 2 + 4,
  };
}

function truncatePlantName(name, max = 14) {
  const s = String(name || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/**
 * Schéma SVG interactif d’une clé dichotomique.
 * Seules les propositions du couplet courant sont actionnables (souris, toucher,
 * clavier) ; la liste sous le schéma les reprend en toutes lettres.
 *
 * @param {object} props
 * @param {number[]} [props.pathLeadIds] — propositions déjà choisies (chemin parcouru)
 * @param {boolean} [props.revealPlants] — faux : espèces masquées tant qu'elles ne sont pas atteintes
 * @param {boolean} [props.authorMode] — affiche les défauts de construction (couplets non reliés…)
 */
export function IdKeySchemaView({
  keyBundle,
  currentCoupletId,
  history = [],
  pathLeadIds = null,
  onChooseLead,
  onOpenPlant,
  revealPlants = true,
  authorMode = false,
}) {
  const layout = useMemo(() => layoutIdKeySchema(keyBundle), [keyBundle]);
  const scrollRef = useRef(null);
  const [fit, setFit] = useState(false);

  const currentNodeId = coupletNodeId(currentCoupletId);

  /** Propositions du chemin : fournies par le lecteur, sinon déduites de l'historique. */
  const pathEdgeIds = useMemo(() => {
    const set = new Set();
    if (Array.isArray(pathLeadIds)) {
      for (const id of pathLeadIds) set.add(`lead:${id}`);
      return set;
    }
    const start = (keyBundle?.couplets || []).find((c) => Number(c.number) === 1);
    const chain = [Number((start || keyBundle?.couplets?.[0])?.id)];
    for (const h of history || []) chain.push(Number(h));
    for (let i = 0; i < chain.length - 1; i += 1) {
      const edge = layout.edges.find(
        (e) => Number(e.fromCoupletId) === chain[i] && Number(e.next_couplet_id) === chain[i + 1],
      );
      if (edge) set.add(edge.id);
    }
    return set;
  }, [pathLeadIds, keyBundle, history, layout.edges]);

  const pathNodeIds = useMemo(() => {
    const set = new Set([layout.rootId, currentNodeId]);
    for (const edge of layout.edges) {
      if (!pathEdgeIds.has(edge.id)) continue;
      set.add(edge.fromId);
      set.add(edge.toId);
      if (edge.next_couplet_id != null) set.add(coupletNodeId(edge.next_couplet_id));
    }
    return set;
  }, [layout, pathEdgeIds, currentNodeId]);

  const activeEdges = useMemo(
    () => layout.edges.filter((e) => Number(e.fromCoupletId) === Number(currentCoupletId)),
    [layout.edges, currentCoupletId],
  );
  const activeTargets = useMemo(() => new Set(activeEdges.map((e) => e.toId)), [activeEdges]);

  /** Tracé dans l'ordre : estompé, puis chemin, puis branches actives par-dessus. */
  const orderedEdges = useMemo(() => {
    const rank = (e) =>
      Number(e.fromCoupletId) === Number(currentCoupletId) ? 2 : pathEdgeIds.has(e.id) ? 1 : 0;
    return [...layout.edges].sort((a, b) => rank(a) - rank(b));
  }, [layout.edges, currentCoupletId, pathEdgeIds]);

  // Après chaque choix, ramener le couplet courant au centre de la zone défilante :
  // une clé de 16 espèces fait plus de 3 000 px de large.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || fit) return;
    const node = layout.nodes.find((n) => n.id === currentNodeId);
    if (!node) return;
    const left = Math.max(0, node.x - (el.clientWidth || 0) / 2);
    const top = Math.max(0, node.y - (el.clientHeight || 0) / 3);
    if (typeof el.scrollTo === 'function') el.scrollTo({ left, top, behavior: 'smooth' });
    else {
      el.scrollLeft = left;
      el.scrollTop = top;
    }
  }, [currentNodeId, layout.nodes, fit]);

  if (!layout.nodes.length) {
    return <p className="form-error">Cette clé n’a pas encore de couplet de départ.</p>;
  }

  const currentNode = layout.nodes.find((n) => n.id === currentNodeId);
  const missingCount = layout.edges.filter((e) => !e.usable).length;

  return (
    <div className="id-key-schema">
      <div className="id-key-schema__tools">
        <button
          type="button"
          className="btn btn-sm"
          aria-pressed={fit}
          onClick={() => setFit((on) => !on)}
        >
          {fit ? 'Taille réelle' : 'Ajuster à l’écran'}
        </button>
      </div>
      <div
        className={`id-key-schema__scroll${fit ? ' id-key-schema__scroll--fit' : ''}`}
        ref={scrollRef}
      >
        <svg
          className={`id-key-schema__svg${fit ? ' id-key-schema__svg--fit' : ''}`}
          width={fit ? undefined : layout.width}
          height={fit ? undefined : layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="group"
          aria-label={`Schéma de la clé d’identification${currentNode ? ` — couplet ${currentNode.number} en cours` : ''}`}
        >
          {orderedEdges.map((edge) => {
            const fromCurrent = Number(edge.fromCoupletId) === Number(currentCoupletId);
            const onPath = pathEdgeIds.has(edge.id);
            const dim = !fromCurrent && !onPath;
            const clickable = fromCurrent && edge.usable;
            const className = [
              'id-key-schema__edge',
              fromCurrent ? 'id-key-schema__edge--active' : '',
              onPath ? 'id-key-schema__edge--path' : '',
              dim ? 'id-key-schema__edge--dim' : '',
              clickable ? 'id-key-schema__edge--clickable' : '',
              edge.usable ? '' : 'id-key-schema__edge--missing',
            ]
              .filter(Boolean)
              .join(' ');
            const choose = () => onChooseLead?.(leadPayload(edge));
            const tap = tapRect(edge);
            const { labelBox } = edge;
            return (
              <g key={edge.id} className={className}>
                <path d={edge.path} className="id-key-schema__edge-line" aria-hidden="true" />
                <g
                  className="id-key-schema__edge-label"
                  {...(clickable
                    ? {
                        role: 'button',
                        tabIndex: 0,
                        'aria-label': `Choisir : ${edge.statement}`,
                        onClick: choose,
                        onKeyDown: (evt) => onActivateKey(evt, choose),
                      }
                    : {})}
                >
                  <title>{edge.statement || 'Proposition sans énoncé'}</title>
                  {edge.imageBox ? (
                    <image
                      href={resolveExternalImageUrl(edge.image_url)}
                      x={edge.imageBox.x}
                      y={edge.imageBox.y}
                      width={edge.imageBox.width}
                      height={edge.imageBox.height}
                      preserveAspectRatio="xMidYMid slice"
                      className="id-key-schema__edge-img"
                    />
                  ) : null}
                  <rect
                    x={labelBox.x}
                    y={labelBox.y}
                    width={labelBox.width}
                    height={labelBox.height}
                    rx={6}
                    className="id-key-schema__edge-label-bg"
                  />
                  <text textAnchor="middle" className="id-key-schema__edge-label-text">
                    {edge.labelLines.map((line, i) => (
                      <tspan key={i} x={edge.midX} y={labelBox.y + 3 + LABEL_LINE_H * (i + 1)}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                  {clickable ? (
                    <rect
                      x={tap.x}
                      y={tap.y}
                      width={tap.width}
                      height={tap.height}
                      rx={8}
                      className="id-key-schema__edge-tap"
                    />
                  ) : null}
                </g>
              </g>
            );
          })}

          {layout.nodes.map((node) => {
            const isCurrent = node.id === currentNodeId;
            const onPath = pathNodeIds.has(node.id);
            const dim = !isCurrent && !onPath && !activeTargets.has(node.id);
            const baseClass = ['id-key-schema__node', `id-key-schema__node--${node.type}`];
            if (dim) baseClass.push('id-key-schema__node--dim');

            if (node.type === 'plant') {
              const revealed = revealPlants || onPath;
              if (!revealed) baseClass.push('id-key-schema__node--hidden');
              const openable = revealed && typeof onOpenPlant === 'function' && node.plantId;
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  className={baseClass.join(' ')}
                  {...(openable
                    ? {
                        role: 'button',
                        tabIndex: 0,
                        'aria-label': `Ouvrir la fiche ${node.name}`,
                        onClick: () => onOpenPlant(node.plantId),
                        onKeyDown: (evt) => onActivateKey(evt, () => onOpenPlant(node.plantId)),
                      }
                    : { 'aria-hidden': revealed ? undefined : 'true' })}
                >
                  <ellipse rx={PLANT_RX} ry={PLANT_RY} className="id-key-schema__node-shape" />
                  <text y={-4} textAnchor="middle" className="id-key-schema__node-emoji">
                    {revealed ? node.emoji || '🌿' : '?'}
                  </text>
                  <text y={14} textAnchor="middle" className="id-key-schema__node-label">
                    {revealed ? truncatePlantName(node.name) : 'À trouver'}
                  </text>
                  {revealed ? <title>{node.name}</title> : null}
                </g>
              );
            }
            if (node.type === 'ref' || node.type === 'missing') {
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  className={baseClass.join(' ')}
                >
                  <rect
                    x={-BOX_W / 2}
                    y={-BOX_H / 2}
                    width={BOX_W}
                    height={BOX_H}
                    rx={10}
                    className="id-key-schema__node-shape"
                  />
                  <text y={5} textAnchor="middle" className="id-key-schema__node-label">
                    {node.type === 'ref' ? `→ ${node.label}` : node.label}
                  </text>
                  <title>
                    {node.type === 'ref'
                      ? `Cette proposition renvoie au ${node.label}, dessiné ailleurs dans le schéma`
                      : 'Proposition incomplète : ni couplet suivant, ni espèce'}
                  </title>
                </g>
              );
            }
            if (isCurrent) baseClass.push('id-key-schema__node--current');
            if (onPath) baseClass.push('id-key-schema__node--path');
            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                className={baseClass.join(' ')}
                data-node-id={node.id}
              >
                {isCurrent ? (
                  <circle r={NODE_R + 7} className="id-key-schema__node-ring" aria-hidden="true" />
                ) : null}
                <circle r={NODE_R} className="id-key-schema__node-shape" />
                <text y={5} textAnchor="middle" className="id-key-schema__node-number">
                  {node.number || '?'}
                </text>
                <title>{isCurrent ? `${node.label} — en cours` : node.label}</title>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="id-key-schema__hint muted">
        Le couplet en cours est entouré d’un double cercle foncé. Touchez l’une de ses propositions
        encadrées — ou choisissez-la dans la liste ci-dessous — pour avancer. Survolez un énoncé
        pour le lire en entier.
      </p>
      {activeEdges.length ? (
        <div className="id-key-schema__current">
          <p className="id-key-schema__current-title">
            Propositions du couplet {currentNode?.number ?? '?'} :
          </p>
          <ul className="id-key-leads">
            {activeEdges.map((edge) => (
              <li key={edge.id}>
                <button
                  type="button"
                  className="btn id-key-lead-btn"
                  disabled={!edge.usable}
                  onClick={() => onChooseLead?.(leadPayload(edge))}
                >
                  <span>{edge.statement || 'Proposition sans énoncé'}</span>
                  {!edge.usable ? <span className="muted"> (à compléter)</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {authorMode && (layout.orphanNumbers.length || missingCount) ? (
        <p className="id-key-schema__author-note">
          {layout.orphanNumbers.length
            ? `Couplets non reliés à la clé (les élèves ne les verront pas) : ${layout.orphanNumbers.join(', ')}. `
            : ''}
          {missingCount
            ? `${missingCount} proposition${missingCount > 1 ? 's' : ''} sans suite ni espèce.`
            : ''}
        </p>
      ) : null}
    </div>
  );
}
