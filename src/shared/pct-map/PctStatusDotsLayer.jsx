import React from 'react';

/**
 * Pastilles d'état d'un lieu sur une carte « % image » (noyau carte partagé).
 *
 * Neutre produit : une pastille est décrite par un **ton** (`variant`), un libellé accessible
 * et un coin (`placement`). C'est le produit qui décide de ce qu'elle signifie — ForetMap y
 * pose l'état des tâches d'une zone / d'un repère et, si l'admin l'active, le nombre de
 * tutoriels liés (`src/utils/mapLocationBadges.js`).
 *
 * Deux usages :
 * - `PctStatusDots` à l'intérieur d'un habillage déjà contre-échelonné (bouton repère) ;
 * - `PctStatusDotsLayer`, calque HTML posé sur des ancres en pourcentage (zones : le SVG des
 *   polygones est tracé en `preserveAspectRatio="none"`, il déformerait les pastilles).
 *
 * Le rendu est **décoratif** (`aria-hidden`) : le libellé est repris dans le nom accessible du
 * lieu (bouton repère, polygone de zone), sinon un lecteur d'écran annoncerait deux fois la
 * même information.
 *
 * @typedef {{ variant: string, label?: string,
 *   placement?: 'top-right'|'top-left'|'bottom-left'|'bottom-right' }} PctStatusDot
 */

/** Coins où une pastille peut se poser (repli : en haut à droite). */
const PLACEMENTS = new Set(['top-right', 'top-left', 'bottom-left', 'bottom-right']);

/** Libellé accessible cumulé d'une liste de pastilles (à joindre au nom du lieu). */
export function statusDotsLabel(dots) {
  return (dots || [])
    .map((dot) => String(dot?.label || '').trim())
    .filter(Boolean)
    .join(' — ');
}

/**
 * Groupe de pastilles centré sur son parent positionné.
 * @param {object} props
 * @param {Array<PctStatusDot>|null} props.dots
 * @param {string} [props.className]
 */
export function PctStatusDots({ dots, className = 'fm-pct-status-dots' }) {
  const list = (dots || []).filter((dot) => dot && String(dot.variant || '').trim());
  if (!list.length) return null;
  return (
    <span className={className} aria-hidden>
      {list.map((dot, index) => {
        const placement = PLACEMENTS.has(dot.placement) ? dot.placement : 'top-right';
        return (
          <span
            key={`${dot.variant}:${placement}:${index}`}
            className={`fm-pct-status-dot fm-pct-status-dot--${dot.variant} fm-pct-status-dot--${placement}`}
            title={String(dot.label || '').trim() || undefined}
          />
        );
      })}
    </span>
  );
}

/**
 * Calque des pastilles d'état posées à des ancres en pourcentage (zones).
 *
 * @param {object} props
 * @param {Array<{ id: string, xp: number, yp: number, dots: Array<PctStatusDot> }>} props.anchors
 * @param {string} [props.className]
 */
function PctStatusDotsLayerImpl({ anchors, className = 'fm-pct-status-anchors' }) {
  if (!(anchors || []).length) return null;
  return (
    <div className={className} aria-hidden>
      {anchors.map((anchor) => (
        <span
          key={anchor.id}
          className="fm-pct-status-anchor"
          style={{ left: `${anchor.xp}%`, top: `${anchor.yp}%` }}
        >
          <PctStatusDots dots={anchor.dots} />
        </span>
      ))}
    </div>
  );
}

export const PctStatusDotsLayer = React.memo(PctStatusDotsLayerImpl);
PctStatusDotsLayer.displayName = 'PctStatusDotsLayer';
