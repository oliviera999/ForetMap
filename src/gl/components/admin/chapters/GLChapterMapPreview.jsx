import React from 'react';
import { GLPctMapCanvas } from '../../GLPctMapCanvas.jsx';
import { GLBoardMarkers } from '../../GLBoardMarkers.jsx';

/**
 * Aperçu de la carte du chapitre (image résolue + repères) affiché dans le
 * formulaire d'édition. Composant feuille prop-driven ; la condition d'affichage
 * reste dans le parent.
 *
 * @param {string} pendingMapPreviewUrl URL locale d'un fichier en attente d'envoi
 * @param {string} mapImageUrl URL de carte saisie dans le formulaire
 * @param {string} resolvedMapImageUrl URL d'image résolue (conventions incluses)
 * @param {object} previewMapGestures gestes de la carte d'aperçu
 * @param {object} mapPreviewStyle style d'image (cadre)
 * @param {Array} markers repères à afficher sur la carte
 */
export function GLChapterMapPreview({
  pendingMapPreviewUrl,
  mapImageUrl,
  resolvedMapImageUrl,
  previewMapGestures,
  mapPreviewStyle,
  markers,
}) {
  return (
    <div className="gl-map-url-preview">
      <p className="gl-hint">
        Aperçu de la carte
        {pendingMapPreviewUrl && !mapImageUrl ? ' (fichier local, en attente d’envoi)' : ''}
      </p>
      <GLPctMapCanvas
        imageUrl={resolvedMapImageUrl}
        imageAlt="Aperçu carte chapitre"
        mapGestures={previewMapGestures}
        className="gl-board gl-board--mini"
        imageStyle={mapPreviewStyle}
      >
        <GLBoardMarkers markers={markers} />
      </GLPctMapCanvas>
    </div>
  );
}
