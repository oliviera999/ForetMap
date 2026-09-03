import { forwardRef } from 'react';

import { Tooltip } from '../components/Tooltip.jsx';

function joinClassNames(...parts) {
  return parts.filter(Boolean).join(' ');
}

/** Classes neutres (feuille `src/shared/styles/map-action.css`, chargée par les deux entrées). */
export const MAP_ACTION_CLASS_NAMES = Object.freeze({
  root: 'fm-map-action',
  role: (role) => `fm-map-action--${role}`,
  icon: 'fm-map-action__icon',
  label: 'fm-map-action__label',
  labelShort: 'fm-map-action__label--short',
  labelLong: 'fm-map-action__label--long',
  iconOnly: 'fm-map-action--icon-only',
  active: 'is-active',
  muted: 'is-muted',
});

/**
 * Bouton d'action superposé à une carte (kit d'interface, lot 3) — issu de
 * `GLBoardActionButton` (plateaux G&L), pour la barre de la carte ForetMap et le plan.
 * Rôles : `primary` (action principale), `display` (plein écran…), `tool` (bascules).
 *
 * Point de passage unique des commandes en icône seule : l'infobulle (`Tooltip`) se pose ici,
 * remplace l'attribut `title` natif (lent, absent au clavier et au toucher) et double
 * `aria-label`. Un bouton qui porte son libellé n'est pas enrobé.
 *
 * `classNames` permet à un produit de conserver ses classes historiques (G&L :
 * `gl-board-action…`) — les classes neutres restent posées en plus.
 */
export const MapActionButton = forwardRef(function MapActionButton(
  {
    role = 'tool',
    active = false,
    muted = false,
    icon = null,
    label,
    labelShort = null,
    testId,
    title,
    ariaLabel,
    ariaExpanded,
    ariaPressed,
    ariaHaspopup,
    className = '',
    classNames = null,
    tooltipPosition = 'top',
    children,
    ...props
  },
  ref,
) {
  const base = MAP_ACTION_CLASS_NAMES;
  const extra = classNames || null;
  const hasIcon = icon != null;
  const iconOnly = hasIcon && children == null;
  const hint = title ?? label;

  const rootClass = joinClassNames(
    base.root,
    base.role(role),
    active ? base.active : '',
    muted ? base.muted : '',
    iconOnly ? base.iconOnly : '',
    extra?.root,
    extra?.role ? extra.role(role) : '',
    iconOnly ? extra?.iconOnly : '',
    className,
  );

  const button = (
    <button
      ref={ref}
      type="button"
      className={rootClass}
      data-testid={testId}
      // Le `title` natif ne subsiste que là où l'infobulle ne prend pas le relais.
      title={iconOnly ? undefined : hint}
      aria-label={ariaLabel ?? label}
      aria-expanded={ariaExpanded}
      aria-pressed={ariaPressed}
      aria-haspopup={ariaHaspopup}
      {...props}
    >
      {hasIcon ? (
        <span className={joinClassNames(base.icon, extra?.icon)} aria-hidden>
          {icon}
        </span>
      ) : null}
      {children ??
        (hasIcon ? null : (
          <>
            {labelShort ? (
              <span
                className={joinClassNames(
                  base.label,
                  base.labelShort,
                  extra?.label,
                  extra?.labelShort,
                )}
              >
                {labelShort}
              </span>
            ) : null}
            {label ? (
              <span
                className={joinClassNames(
                  base.label,
                  labelShort ? base.labelLong : '',
                  extra?.label,
                  labelShort ? extra?.labelLong : '',
                )}
              >
                {label}
              </span>
            ) : null}
          </>
        ))}
    </button>
  );

  if (!iconOnly || !hint) return button;
  return (
    <Tooltip text={hint} position={tooltipPosition}>
      {button}
    </Tooltip>
  );
});
