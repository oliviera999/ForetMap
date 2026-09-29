import { useState } from 'react';
import { ImageLightbox } from './ImageLightbox.jsx';
import { useImageLightbox } from './ImageLightboxProvider.jsx';
import { FallbackImage } from './FallbackImage.jsx';

/**
 * Vignette de photo cliquable, commune aux galeries (zones, repères, visite, fiches) :
 * bouton avec nom accessible, vignette légère affichée / original ouvert dans la lightbox,
 * chargement différé, boîte réservée par la classe (pas de saut de mise en page), repli
 * visible si l'image ne se charge pas.
 *
 * @param {object} props
 * @param {string} props.src vignette affichée (repli : `fullSrc`)
 * @param {string} [props.fullSrc] original ouvert dans la lightbox (défaut : `src`)
 * @param {string} [props.caption] légende (texte alternatif et légende de la lightbox)
 * @param {string} [props.label] nom accessible du bouton (défaut : « Agrandir la photo… »)
 * @param {{ src: string, caption?: string }[]} [props.gallery] galerie parcourue dans la lightbox
 * @param {number} [props.index] position de cette photo dans `gallery`
 * @param {string} [props.className] classe du bouton (dimensions)
 * @param {string} [props.imgClassName]
 * @param {import('react').CSSProperties} [props.style]
 * @param {import('react').CSSProperties} [props.imgStyle]
 * @param {'lazy'|'eager'} [props.loading]
 * @param {number} [props.thumbWidth] largeur voulue : vignette dérivée au lieu de l'original
 * @param {import('react').ReactNode} [props.fallback] contenu si l'image échoue
 */
export function PhotoThumb({
  src,
  fullSrc,
  caption = '',
  label,
  gallery = null,
  index = 0,
  className = '',
  imgClassName = '',
  style,
  imgStyle,
  loading = 'lazy',
  thumbWidth,
  fallback = null,
  ...buttonProps
}) {
  const openGlobal = useImageLightbox();
  const [localOpen, setLocalOpen] = useState(false);
  const thumb = String(src || fullSrc || '').trim();
  const original = String(fullSrc || src || '').trim();
  const text = String(caption || '').trim();
  const payload = { src: original, caption: text, gallery, index };

  function openLightbox() {
    if (!original) return;
    if (openGlobal) openGlobal(payload);
    else setLocalOpen(true);
  }

  return (
    <>
      <button
        type="button"
        className={`photo-thumb ${className}`.trim()}
        style={style}
        aria-label={label || (text ? `Agrandir la photo : ${text}` : 'Agrandir la photo')}
        onClick={openLightbox}
        {...buttonProps}
      >
        <FallbackImage
          src={original}
          thumbSrc={thumb !== original ? thumb : undefined}
          thumbWidth={thumbWidth}
          loading={loading}
          className={`photo-thumb__img ${imgClassName}`.trim()}
          style={imgStyle}
          fallback={
            <span className="photo-thumb__fallback" aria-hidden="true">
              {fallback ?? '🖼️'}
            </span>
          }
        />
      </button>
      {localOpen ? (
        <ImageLightbox
          src={original}
          caption={text}
          gallery={gallery}
          index={index}
          onClose={() => setLocalOpen(false)}
        />
      ) : null}
    </>
  );
}
