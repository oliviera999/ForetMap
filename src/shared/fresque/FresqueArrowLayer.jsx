import { useMemo } from 'react';

import { LINK_CATEGORY_MARKS } from './fresqueCore.js';
import { SVG_W, SVG_H, arrowSegment, arrowOffsets, markAnchor } from './fresqueGeometry.js';

const TONES = ['default', 'found', 'reversed', 'shortcut', 'trap', 'discuss', 'missing', 'preview'];

function toneOf(category) {
  return LINK_CATEGORY_MARKS[category]?.tone || 'default';
}

/**
 * Flèches cause → effet au-dessus de la scène : SVG en unités 160 × 100, du bord d'une carte
 * au bord de l'autre, marqueur de pointe, halo, zone de toucher large invisible, décalage des
 * paires A → B / B → A. Le repère de catégorie (icône + couleur) se place à mi-chemin, hors des
 * cartes. Chaque flèche est focalisable : `Suppr` la retire, `Entrée` ouvre sa bulle.
 */
export function FresqueArrowLayer({
  links,
  positions,
  categories = null,
  showMarks = false,
  missing = [],
  preview = null,
  selectedLinkId = null,
  arrowColorHex = null,
  readOnly = false,
  onLinkTap,
  onLinkDelete,
}) {
  const offsets = useMemo(() => arrowOffsets(links), [links]);
  const drawn = useMemo(() => {
    return links
      .map((link) => {
        const seg = arrowSegment(positions[link.from], positions[link.to], {
          offset: offsets[link.id] || 0,
        });
        if (!seg) return null;
        const category = categories?.[link.id] || null;
        const tone = category ? toneOf(category) : link.revealed ? 'missing' : 'default';
        return { link, seg, category, tone, anchor: markAnchor(seg) };
      })
      .filter(Boolean);
  }, [links, positions, offsets, categories]);
  const missingDrawn = useMemo(
    () =>
      missing
        .map((l) => ({
          key: `${l.from}>${l.to}`,
          seg: arrowSegment(positions[l.from], positions[l.to]),
        }))
        .filter((m) => m.seg),
    [missing, positions],
  );

  return (
    <svg
      className="fm-fresque-arrows"
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      preserveAspectRatio="none"
      aria-hidden={links.length === 0 && missingDrawn.length === 0 ? 'true' : undefined}
      data-testid="fm-fresque-arrows"
    >
      <defs>
        {TONES.map((tone) => (
          <marker
            key={tone}
            id={`fm-fresque-head-${tone}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        ))}
      </defs>
      {missingDrawn.map(({ key, seg }) => (
        <g
          key={`missing-${key}`}
          className="fm-fresque-arrow fm-fresque-arrow--missing"
          data-testid="fm-fresque-missing"
        >
          <line
            className="fm-fresque-arrow__line"
            x1={seg.x1}
            y1={seg.y1}
            x2={seg.x2}
            y2={seg.y2}
            markerEnd="url(#fm-fresque-head-missing)"
          />
        </g>
      ))}
      {drawn.map(({ link, seg, category, tone, anchor }) => {
        const style =
          !category && arrowColorHex && tone === 'default' ? { color: arrowColorHex } : undefined;
        const label = `Flèche de la carte ${link.from} vers la carte ${link.to}${
          category ? ` — ${LINK_CATEGORY_MARKS[category]?.label || category}` : ''
        }`;
        return (
          <g
            key={link.id}
            className={[
              'fm-fresque-arrow',
              `fm-fresque-arrow--${tone}`,
              link.revealed ? 'fm-fresque-arrow--revealed' : '',
              selectedLinkId === link.id ? 'fm-fresque-arrow--selected' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={style}
            tabIndex={0}
            role="button"
            aria-label={label}
            data-link-id={link.id}
            data-testid={`fm-fresque-arrow-${link.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onLinkTap?.(link, { clientX: e.clientX, clientY: e.clientY });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Delete' || e.key === 'Backspace') {
                if (readOnly) return;
                e.preventDefault();
                onLinkDelete?.(link);
              } else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                onLinkTap?.(link, { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
              }
            }}
          >
            <line
              className="fm-fresque-arrow__halo"
              x1={seg.x1}
              y1={seg.y1}
              x2={seg.x2}
              y2={seg.y2}
            />
            <line
              className="fm-fresque-arrow__line"
              x1={seg.x1}
              y1={seg.y1}
              x2={seg.x2}
              y2={seg.y2}
              markerEnd={`url(#fm-fresque-head-${tone})`}
            />
            <line
              className="fm-fresque-arrow__hit"
              x1={seg.x1}
              y1={seg.y1}
              x2={seg.x2}
              y2={seg.y2}
            />
            {showMarks && category && anchor ? (
              <g
                className="fm-fresque-arrow__mark"
                transform={`translate(${anchor.x} ${anchor.y})`}
              >
                <circle r="2.6" />
                <text>{LINK_CATEGORY_MARKS[category]?.icon || '?'}</text>
              </g>
            ) : null}
          </g>
        );
      })}
      {preview ? (
        <g className="fm-fresque-arrow fm-fresque-arrow--preview" aria-hidden="true">
          <line
            className="fm-fresque-arrow__line"
            x1={preview.x1}
            y1={preview.y1}
            x2={preview.x2}
            y2={preview.y2}
            markerEnd="url(#fm-fresque-head-preview)"
          />
        </g>
      ) : null}
    </svg>
  );
}
