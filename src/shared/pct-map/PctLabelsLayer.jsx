import React from 'react';

/**
 * Calque HTML des étiquettes de zones d'une carte « % image » (noyau carte partagé).
 *
 * Pourquoi en HTML et non dans le SVG des polygones : ce dernier est tracé en
 * `viewBox="0 0 100 100"` avec `preserveAspectRatio="none"`, ce qui convient aux **contours**
 * (les points sont en pourcentage sur deux axes indépendants) mais **déforme le texte** —
 * 16 % de compression horizontale sur le fond de Lyautey
 * (`docs/AUDIT_PLAN_AFFICHAGE_2026-09.md` C1). Posées en HTML, les étiquettes gardent leur
 * dessin, se tronquent proprement (`text-overflow`) et se contre-échelonnent avec la variable
 * CSS `--pct-inv`, donc gardent une taille constante à l'écran quel que soit le zoom (B5).
 *
 * Le calque est décoratif (`aria-hidden`) et ne capte aucun pointeur : le nom accessible et la
 * cible de clic restent portés par le polygone (`PctZonesLayer`).
 *
 * @param {object} props
 * @param {Array<{ id: string, xp: number, yp: number, emoji?: string, name?: string,
 *   maxWidthPx?: number, active?: boolean }>} props.labels étiquettes déjà filtrées par le
 *   produit (résolution des collisions : `pctMapLabels.js`).
 * @param {string} [props.className]
 */
function PctLabelsLayerImpl({ labels, className = 'fm-pct-labels' }) {
  return (
    <div className={className} aria-hidden>
      {(labels || []).map((label) => (
        <span
          key={label.id}
          className={`fm-pct-label${label.active ? ' is-active' : ''}`}
          style={{
            left: `${label.xp}%`,
            top: `${label.yp}%`,
            maxWidth: label.maxWidthPx ? `${label.maxWidthPx}px` : undefined,
          }}
        >
          {label.emoji ? <span className="fm-pct-label__emoji">{label.emoji}</span> : null}
          {label.name ? <span className="fm-pct-label__name">{label.name}</span> : null}
        </span>
      ))}
    </div>
  );
}

export const PctLabelsLayer = React.memo(PctLabelsLayerImpl);
PctLabelsLayer.displayName = 'PctLabelsLayer';
