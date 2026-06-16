import React from 'react';
import VisitMapMascotRenderer from './VisitMapMascotRenderer.jsx';

/**
 * Mascotte (présentation) posée sur le plan de visite — extraite de `VisitView`
 * (O6). Affiche la mascotte animée à sa position (en %), orientée gauche/droite,
 * avec ses états visuels (marche / contente / mouvement réduit) et la bulle de
 * dialogue optionnelle. Le calcul de position, des états et du dialogue est
 * délégué au parent. DOM/classes/styles inline/attributs strictement inchangés.
 *
 * @param {object} props
 * @param {{ xp: number, yp: number }} props.renderPct position d'affichage (en % du plan)
 * @param {boolean} props.walking mascotte en déplacement (classe `--walking`)
 * @param {boolean} props.happy mascotte contente (classe `--happy`)
 * @param {boolean} props.prefersReducedMotion mouvement réduit (classe `--reduced-motion`)
 * @param {boolean} props.faceRight orientation : regarde vers la droite si vrai
 * @param {string} props.mascotState état d'animation transmis au rendu mascotte
 * @param {string} props.mascotId identifiant de la mascotte
 * @param {Array} props.extraCatalogEntries entrées de catalogue supplémentaires (packs)
 * @param {boolean} props.dialogVisible bulle de dialogue affichée
 * @param {string} props.dialog texte de la bulle de dialogue
 */
export function VisitMapMascot({
  renderPct,
  walking,
  happy,
  prefersReducedMotion,
  faceRight,
  mascotState,
  mascotId,
  extraCatalogEntries,
  dialogVisible,
  dialog,
}) {
  return (
    <div
      className={`visit-map-mascot${walking ? ' visit-map-mascot--walking' : ''}${happy ? ' visit-map-mascot--happy' : ''}${prefersReducedMotion ? ' visit-map-mascot--reduced-motion' : ''}`}
      style={{ left: `${renderPct.xp}%`, top: `${renderPct.yp}%` }}
      aria-hidden="true"
    >
      <div
        className="visit-map-mascot-inner"
        style={{
          transform: `translate(-50%, -100%) scaleX(${faceRight ? 1 : -1})`,
          '--visit-mascot-dialog-x': faceRight ? 1 : -1,
        }}
      >
        <VisitMapMascotRenderer
          mascotState={mascotState}
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
