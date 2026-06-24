import React, { useMemo } from 'react';
import { LEGEND_ENTRIES, edgeStyleForType } from '../../shared/foodWebEdgeStyle.js';
import { interactionTypeLabel } from '../../shared/foodWebTypes.js';

const SAMPLE_W = 44;
const SAMPLE_H = 14;

function LegendSample({ type, symmetric, active = false }) {
  const style = edgeStyleForType(type);
  const color = active ? '#16a34a' : style.color;
  const y = SAMPLE_H / 2;
  const x1 = symmetric ? 6 : 4;
  const x2 = symmetric ? SAMPLE_W - 6 : SAMPLE_W - 8;
  const markerId = `fw-legend-arrow-${type}${active ? '-active' : ''}`;

  return (
    <svg
      className="pedago-foodweb-legend__sample"
      width={SAMPLE_W}
      height={SAMPLE_H}
      viewBox={`0 0 ${SAMPLE_W} ${SAMPLE_H}`}
      aria-hidden="true"
    >
      <defs>
        <marker
          id={markerId}
          markerWidth="7"
          markerHeight="7"
          refX="6"
          refY="2.5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0,0 L6,2.5 L0,5 Z" fill={color} />
        </marker>
      </defs>
      <line
        x1={x1}
        y1={y}
        x2={x2}
        y2={y}
        stroke={color}
        strokeWidth={active ? 2.4 : style.width}
        strokeDasharray={style.dash || undefined}
        markerEnd={`url(#${markerId})`}
        markerStart={symmetric ? `url(#${markerId})` : undefined}
      />
    </svg>
  );
}

/**
 * Légende des types de relations du réseau trophique (couleurs + figurés).
 *
 * @param {{ presentTypes?: string[]|null, compact?: boolean }} props
 *   `presentTypes` : si fourni, n'affiche que les types présents dans le graphe.
 */
function LegendItem({ type, label, symmetric, hidden, onToggle }) {
  const interactive = typeof onToggle === 'function';
  const Tag = interactive ? 'button' : 'div';
  return (
    <Tag
      type={interactive ? 'button' : undefined}
      className={`pedago-foodweb-legend__item${hidden ? ' pedago-foodweb-legend__item--hidden' : ''}${interactive ? ' pedago-foodweb-legend__item--toggle' : ''}`}
      onClick={interactive ? () => onToggle(type) : undefined}
      aria-pressed={interactive ? !hidden : undefined}
      aria-label={interactive ? (hidden ? `Afficher : ${label}` : `Masquer : ${label}`) : undefined}
      title={interactive ? (hidden ? `Afficher : ${label}` : `Masquer : ${label}`) : undefined}
    >
      <LegendSample type={type} symmetric={symmetric} />
      <span className="pedago-foodweb-legend__label">{label}</span>
    </Tag>
  );
}

/**
 * @param {{ presentTypes?: string[]|null, compact?: boolean, hiddenTypes?: Set<string>, onToggleType?: (type: string) => void }} props
 */
export function FoodWebEdgeLegend({
  presentTypes = null,
  compact = false,
  hiddenTypes = null,
  onToggleType = null,
}) {
  const entries = useMemo(() => {
    if (!presentTypes || presentTypes.length === 0) return LEGEND_ENTRIES;
    const set = new Set(presentTypes.map((t) => String(t || '').toLowerCase()));
    const filtered = LEGEND_ENTRIES.filter((e) => set.has(e.type));
    return filtered.length > 0 ? filtered : LEGEND_ENTRIES;
  }, [presentTypes]);

  const directed = entries.filter((e) => !e.symmetric);
  const mutual = entries.filter((e) => e.symmetric);

  return (
    <div
      className={`pedago-foodweb-legend${compact ? ' pedago-foodweb-legend--compact' : ''}`}
      role="note"
      aria-label="Légende des types de relations"
    >
      <p className="pedago-foodweb-legend__title">Légende des relations</p>
      <p className="pedago-foodweb-legend__hint">
        Couleur et trait = type d&apos;interaction. La flèche suit le sens écologique («&nbsp;est
        mangée par&nbsp;» pour les flux trophiques).
        {onToggleType ? ' Clique une entrée pour l’afficher ou la masquer.' : ''}
      </p>

      {directed.length > 0 ? (
        <div className="pedago-foodweb-legend__group">
          <span className="pedago-foodweb-legend__group-label">Flèche simple →</span>
          <ul className="pedago-foodweb-legend__list">
            {directed.map(({ type, label, symmetric }) => (
              <li key={type}>
                <LegendItem
                  type={type}
                  label={label || interactionTypeLabel(type)}
                  symmetric={symmetric}
                  hidden={hiddenTypes?.has(type)}
                  onToggle={onToggleType}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {mutual.length > 0 ? (
        <div className="pedago-foodweb-legend__group">
          <span className="pedago-foodweb-legend__group-label">Double sens ↔</span>
          <ul className="pedago-foodweb-legend__list">
            {mutual.map(({ type, label, symmetric }) => (
              <li key={type}>
                <LegendItem
                  type={type}
                  label={label || interactionTypeLabel(type)}
                  symmetric={symmetric}
                  hidden={hiddenTypes?.has(type)}
                  onToggle={onToggleType}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
