import React from 'react';

/**
 * Image de fond de la carte (présentation) — extrait de `MapView` (O6).
 *
 * Rend l'élément `<img>` du plan, positionné en absolu sur toute la zone monde
 * (`width`/`height`), avec sa source, son texte alternatif et la gestion de
 * repli en cas d'erreur de chargement. La logique de sélection de source et de
 * repli (`onError`) reste dans `MapView` et est transmise via les props.
 * DOM/classes/styles/textes strictement inchangés.
 *
 * @param {object} props
 * @param {React.Ref<HTMLImageElement>} props.imgRef ref attachée à l'élément image
 * @param {string} props.src source de l'image du plan
 * @param {string} props.alt texte alternatif accessible de l'image
 * @param {number} props.width largeur de l'image (px)
 * @param {number} props.height hauteur de l'image (px)
 * @param {(e: React.SyntheticEvent<HTMLImageElement>) => void} props.onError repli quand l'image échoue
 */
export function MapViewBackgroundImage({ imgRef, src, alt, width, height, onError }) {
  return (
    <img
      ref={imgRef}
      src={src}
      draggable={false}
      alt={alt}
      fetchPriority="high"
      decoding="async"
      onError={onError}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width,
        height,
        userSelect: 'none',
        pointerEvents: 'none',
        boxShadow: '0 4px 24px rgba(0,0,0,.18)',
      }}
    />
  );
}
