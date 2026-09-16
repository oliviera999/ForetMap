import React from 'react';

import { PctOverlayCaption } from './PctOverlayCaption.jsx';

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
 * Le calque est décoratif (`aria-hidden`) : le nom accessible et la cible clavier restent
 * portés par le polygone (`PctZonesLayer`). Avec `onLabelClick`, l'étiquette devient en plus
 * une **cible tactile** pour sa zone : les polygones de production descendent à 13 × 25 px au
 * cadrage d'ouverture, très en dessous des 44 px de la règle maison, alors que les étiquettes
 * sont déjà résolues sans recouvrement — c'est donc une cible sûre, qui ne vole jamais le tap
 * d'une zone voisine (`docs/AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md` N12).
 *
 * @param {object} props
 * @param {Array<{ id: string, zoneId?: string, xp: number, yp: number, emoji?: string,
 *   name?: string, maxWidthPx?: number, active?: boolean }>} props.labels étiquettes déjà
 *   filtrées par le produit (résolution des collisions : `pctMapLabels.js`).
 * @param {((zoneId: string) => void)|null} [props.onLabelClick] tap sur l'étiquette → sa zone.
 * @param {string} [props.className]
 */
function PctLabelsLayerImpl({ labels, onLabelClick = null, className = 'fm-pct-labels' }) {
  return (
    <div className={className} aria-hidden>
      {(labels || []).map((label) => {
        const clickable = Boolean(onLabelClick && label.zoneId != null);
        const content = (
          <PctOverlayCaption
            emoji={label.emoji}
            name={label.name}
            emojiClassName="fm-pct-label__emoji"
            nameClassName="fm-pct-label__name"
          />
        );
        const style = {
          left: `${label.xp}%`,
          top: `${label.yp}%`,
          maxWidth: label.maxWidthPx ? `${label.maxWidthPx}px` : undefined,
        };
        const classes = `fm-pct-label${label.active ? ' is-active' : ''}${
          clickable ? ' is-clickable' : ''
        }`;
        if (!clickable) {
          return (
            <span key={label.id} className={classes} style={style}>
              {content}
            </span>
          );
        }
        return (
          <button
            key={label.id}
            type="button"
            // Cible de pointeur uniquement : le polygone porte déjà le nom accessible et le
            // parcours clavier — un second bouton ferait doublon au lecteur d'écran.
            tabIndex={-1}
            className={classes}
            style={style}
            onClick={() => onLabelClick(String(label.zoneId))}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

export const PctLabelsLayer = React.memo(PctLabelsLayerImpl);
PctLabelsLayer.displayName = 'PctLabelsLayer';
