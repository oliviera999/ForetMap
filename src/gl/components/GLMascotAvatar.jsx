import { useState } from 'react';
import { useGLMascotCatalog } from '../context/GLMascotCatalogContext.jsx';
import { getGlMascotById } from '../utils/glMascotCatalog.js';
import { GLMascotFallbackSvg } from './GLMascotFallbackSvg.jsx';

/**
 * Première image fixe d'un pack `sprite_cut` : frame 0 de l'état `idle`, sinon du premier état
 * qui a des images. `null` si le pack n'en a aucune.
 */
export function firstMascotPackFrame(entry) {
  const frames = entry?.spriteCut?.stateFrames;
  if (!frames || typeof frames !== 'object') return null;
  const idle = Array.isArray(frames.idle?.srcs) ? frames.idle.srcs[0] : null;
  if (idle) return idle;
  for (const spec of Object.values(frames)) {
    if (Array.isArray(spec?.srcs) && spec.srcs[0]) return spec.srcs[0];
  }
  return null;
}

/**
 * Avatar mascotte G&L réutilisable.
 *
 * Si `mascotId` est un pack publié du catalogue chargé (`GLMascotCatalogContext`, packs du
 * studio ForêtMap), l'avatar affiche sa première image `idle`. Sinon (pack dépublié depuis,
 * ancien identifiant, catalogue pas encore chargé, image en erreur), il retombe sur
 * `GLMascotFallbackSvg`, au type de l'équipe (`fallbackType`) — jamais d'erreur.
 * `src/gl/utils/glMascotCatalog.js` ne sert plus qu'à colorer ce repli.
 *
 * Les `data-*` stables (`data-gl-mascot-id`, `data-gl-mascot-type`, `data-gl-mascot-render`)
 * servent aux tests.
 */
export function GLMascotAvatar({
  mascotId,
  size = 48,
  fallbackType,
  fallbackPrimaryColor,
  fallbackSecondaryColor,
  fallbackLabel,
}) {
  const { mascots } = useGLMascotCatalog();
  const id = String(mascotId || '').trim();
  const pack = id && Array.isArray(mascots) ? mascots.find((m) => m?.id === id) || null : null;
  const frame = firstMascotPackFrame(pack);
  const [brokenFrame, setBrokenFrame] = useState(null);
  const palette = getGlMascotById(mascotId);
  const type = pack?.type || palette?.type || fallbackType || 'gnome';
  const label = pack?.label || palette?.label || fallbackLabel || mascotId || 'mascotte';
  const showFrame = Boolean(frame) && brokenFrame !== frame;
  return (
    <span
      className="gl-mascot-avatar"
      data-gl-mascot-id={mascotId || ''}
      data-gl-mascot-type={type}
      data-gl-mascot-render={showFrame ? 'pack' : 'fallback'}
      title={label}
    >
      {showFrame ? (
        <img
          src={frame}
          alt={label}
          width={size}
          height={size}
          loading="lazy"
          onError={() => setBrokenFrame(frame)}
          style={{
            width: size,
            height: size,
            objectFit: 'contain',
            imageRendering: pack?.spriteCut?.pixelated === false ? 'auto' : 'pixelated',
          }}
        />
      ) : (
        <GLMascotFallbackSvg
          type={type}
          primaryColor={palette?.primaryColor || fallbackPrimaryColor || '#16a34a'}
          secondaryColor={palette?.secondaryColor || fallbackSecondaryColor || '#365314'}
          size={size}
          label={label}
        />
      )}
    </span>
  );
}
