import React from 'react';

/**
 * Calque « monde » de la carte (présentation) — extrait de `MapView` (O6).
 *
 * Conteneur positionné en absolu couvrant toute la zone monde
 * (`width`/`height`) sur lequel `MapView` applique la transformation de
 * zoom/déplacement via la ref. Il sert d'enveloppe aux calques enfants
 * (image de fond, SVG des zones, mascotte, repères) passés en `children`.
 * La logique de transformation reste dans `MapView` et n'est pas dupliquée ici.
 *
 * `will-change: transform` n'est **pas** posé ici : il est piloté impérativement par
 * `useMapGestures` (activé pendant les gestes pour la fluidité, retiré au repos pour
 * que le calque se re-pixellise net à l'échelle affichée — sinon le texte/emoji,
 * rendus dans une texture mise en cache à 1×, deviennent flous en zoomant).
 *
 * @param {object} props
 * @param {React.Ref<HTMLDivElement>} props.worldRef ref attachée au conteneur monde
 * @param {number} props.width largeur de la zone monde (px)
 * @param {number} props.height hauteur de la zone monde (px)
 * @param {React.ReactNode} [props.children] calques rendus à l'intérieur du monde
 */
export function MapViewWorldLayer({ worldRef, width, height, children }) {
  return (
    <div
      ref={worldRef}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width,
        height,
        transformOrigin: '0 0',
      }}
    >
      {children}
    </div>
  );
}
