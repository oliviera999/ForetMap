import React from 'react';

import VisitMapMascotRenderer from './VisitMapMascotRenderer.jsx';

/**
 * Calque mascotte (présentation) de la carte — extrait de `MapView` (O6).
 *
 * Positionne la mascotte sur la carte (`left`/`top` en %), applique la
 * transformation d'échelle/orientation et affiche la bulle de dialogue
 * éventuelle. Ne rend rien si la mascotte n'est pas visible.
 * DOM/classes/styles/textes strictement inchangés.
 *
 * @param {object} props
 * @param {boolean} props.show affiche le calque mascotte quand vrai
 * @param {string} props.mascotClassName classe racine du calque mascotte
 * @param {boolean} [props.embedded] ajoute la classe variante « embedded »
 * @param {{ xp: number, yp: number }} props.renderPct position en pourcentage (left/top)
 * @param {number} props.fitScale facteur d'échelle appliqué à la mascotte
 * @param {boolean} props.faceRight oriente la mascotte vers la droite quand vrai
 * @param {string} props.animationState état d'animation transmis au renderer
 * @param {string} props.mascotId identifiant de la mascotte à rendre
 * @param {Array<object>} [props.extraCatalogEntries] entrées catalogue serveur (packs importés)
 * @param {boolean} props.dialogVisible affiche la bulle de dialogue quand vrai
 * @param {React.ReactNode} [props.dialog] contenu de la bulle de dialogue
 */
export function MapViewMascotOverlay({
  show,
  mascotClassName,
  embedded = false,
  renderPct,
  fitScale,
  faceRight,
  animationState,
  mascotId,
  extraCatalogEntries = [],
  dialogVisible,
  dialog,
}) {
  if (!show) return null;
  return (
    <div
      className={`${mascotClassName}${embedded ? ' map-view-forest-mascot--embedded' : ''}`}
      style={{ left: `${renderPct.xp}%`, top: `${renderPct.yp}%` }}
      aria-hidden="true"
    >
      <div
        className="visit-map-mascot-inner"
        style={{
          transform: `translate(-50%, -100%) scale(${fitScale}) scaleX(${faceRight ? 1 : -1})`,
          '--visit-mascot-dialog-x': faceRight ? 1 : -1,
        }}
      >
        <VisitMapMascotRenderer
          mascotState={animationState}
          mascotId={mascotId}
          extraCatalogEntries={extraCatalogEntries}
        />
        {dialogVisible && dialog ? (
          <div className="visit-map-mascot-dialog" role="status" aria-live="polite">
            {dialog}
          </div>
        ) : null}
      </div>
    </div>
  );
}
