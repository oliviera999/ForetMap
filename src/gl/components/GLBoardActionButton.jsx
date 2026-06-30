import React, { forwardRef } from 'react';

function joinClassNames(...parts) {
  return parts.filter(Boolean).join(' ');
}

/**
 * Bouton d'action superposé à la carte plateau GL.
 * Rôles : primary (gameplay), display (plein écran), tool (dés, musique).
 */
export const GLBoardActionButton = forwardRef(function GLBoardActionButton(
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
    children,
    ...props
  },
  ref,
) {
  const roleClass = `gl-board-action--${role}`;
  const hasIcon = icon != null;
  // Boutons du plateau : icône seule (le libellé reste en title/aria pour l'accessibilité).
  const iconOnly = hasIcon && children == null;
  const stateClasses = [
    active ? 'is-active' : '',
    muted ? 'is-muted' : '',
    iconOnly ? 'gl-board-action--icon-only' : '',
  ].filter(Boolean);

  return (
    <button
      ref={ref}
      type="button"
      className={joinClassNames('gl-board-action', roleClass, ...stateClasses, className)}
      data-testid={testId}
      title={title ?? label}
      aria-label={ariaLabel ?? label}
      aria-expanded={ariaExpanded}
      aria-pressed={ariaPressed}
      aria-haspopup={ariaHaspopup}
      {...props}
    >
      {hasIcon ? (
        <span className="gl-board-action__icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      {children ??
        (hasIcon ? null : (
          <>
            {labelShort ? (
              <span className="gl-board-action__label gl-board-action__label--short">
                {labelShort}
              </span>
            ) : null}
            {label ? (
              <span
                className={joinClassNames(
                  'gl-board-action__label',
                  labelShort ? 'gl-board-action__label--long' : '',
                )}
              >
                {label}
              </span>
            ) : null}
          </>
        ))}
    </button>
  );
});
