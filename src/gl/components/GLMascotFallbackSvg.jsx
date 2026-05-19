import React from 'react';

/**
 * SVG de secours pour les mascottes Gnomes & Licornes (Lot 2C).
 *
 * Variants gnome : tunique + bonnet pointu, couleurs primaire/secondaire.
 * Variants licorne : corps + crinière + corne, couleurs primaire/secondaire.
 *
 * Si l'entrée du catalogue est inconnue, un disque coloré générique est rendu.
 */
export function GLMascotFallbackSvg({
  type = 'gnome',
  primaryColor = '#16a34a',
  secondaryColor = '#365314',
  size = 64,
  label = '',
}) {
  const normalizedType = String(type || '').toLowerCase() === 'unicorn' ? 'unicorn' : 'gnome';
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label={label || (normalizedType === 'unicorn' ? 'Licorne' : 'Gnome')}
      className="gl-mascot-svg"
    >
      {normalizedType === 'gnome' ? (
        <g>
          <ellipse cx="32" cy="50" rx="18" ry="10" fill={primaryColor} />
          <circle cx="32" cy="34" r="11" fill="#fde68a" />
          <path
            d={`M 18 32 L 32 6 L 46 32 Z`}
            fill={secondaryColor}
            stroke={secondaryColor}
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <circle cx="28" cy="36" r="1.2" fill="#0f172a" />
          <circle cx="36" cy="36" r="1.2" fill="#0f172a" />
          <path d="M 26 40 Q 32 44 38 40" stroke="#0f172a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </g>
      ) : (
        <g>
          <ellipse cx="32" cy="50" rx="20" ry="10" fill={primaryColor} />
          <circle cx="32" cy="32" r="14" fill="#fff" stroke={primaryColor} strokeWidth="1.5" />
          <path
            d="M 18 30 Q 14 20 24 22 Q 26 18 32 20 Q 38 18 40 22 Q 50 20 46 30 Q 40 26 32 28 Q 24 26 18 30 Z"
            fill={secondaryColor}
          />
          <path
            d="M 32 18 L 30 8 L 34 14 Z"
            fill="#fef3c7"
            stroke={secondaryColor}
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <circle cx="28" cy="32" r="1.2" fill="#0f172a" />
          <circle cx="36" cy="32" r="1.2" fill="#0f172a" />
          <path d="M 28 40 Q 32 43 36 40" stroke="#0f172a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
