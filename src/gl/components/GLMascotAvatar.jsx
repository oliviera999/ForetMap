import React from 'react';
import { getGlMascotById } from '../../utils/glMascotCatalog.js';
import { GLMascotFallbackSvg } from './GLMascotFallbackSvg.jsx';

/**
 * Avatar mascotte G&L réutilisable.
 *
 * Tant qu'aucune mascotte n'est rendue par Rive/spritesheet, ce composant
 * délègue le rendu à `GLMascotFallbackSvg`. Il expose des `data-*`
 * stables (`data-gl-mascot-id`, `data-gl-mascot-type`) utiles pour les
 * tests e2e (`e2e/gl-mascots.spec.js`).
 */
export function GLMascotAvatar({
  mascotId,
  size = 48,
  fallbackType,
  fallbackPrimaryColor,
  fallbackSecondaryColor,
  fallbackLabel,
}) {
  const entry = getGlMascotById(mascotId);
  const type = entry?.type || fallbackType || 'gnome';
  const primary = entry?.primaryColor || fallbackPrimaryColor || '#16a34a';
  const secondary = entry?.secondaryColor || fallbackSecondaryColor || '#365314';
  const label = entry?.label || fallbackLabel || mascotId || 'mascotte';
  return (
    <span
      className="gl-mascot-avatar"
      data-gl-mascot-id={mascotId || ''}
      data-gl-mascot-type={type}
      title={label}
    >
      <GLMascotFallbackSvg
        type={type}
        primaryColor={primary}
        secondaryColor={secondary}
        size={size}
        label={label}
      />
    </span>
  );
}
