import { forwardRef } from 'react';

/**
 * Image de fond d'une carte « % image » (noyau carte partagé, lot 4).
 *
 * Se place dans le calque « fit » du moteur (`usePctMapViewport`, mode `stage`) : l'image
 * remplit ce calque, dont le rectangle épouse déjà le rendu `object-fit: contain`. Les
 * couches en pourcentage (zones, repères) partagent donc exactement le même repère.
 *
 * @param {object} props
 * @param {string} props.src source de l'image du plan.
 * @param {string} props.alt texte alternatif (nom du plan).
 * @param {string} [props.className]
 * @param {() => void} [props.onError] repli produit quand l'image ne charge pas.
 */
export const PctImageLayer = forwardRef(function PctImageLayer(
  { src, alt, className = 'fm-pct-map-img', onError = null, ...props },
  ref,
) {
  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      className={className}
      draggable={false}
      onError={onError || undefined}
      {...props}
    />
  );
});
