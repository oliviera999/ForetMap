import { forwardRef } from 'react';

import { Tooltip } from '../../shared/components/Tooltip.jsx';

function joinClassNames(...parts) {
  return parts.filter(Boolean).join(' ');
}

/**
 * Bouton d'action superposé à la carte plateau GL.
 * Rôles : primary (gameplay), display (plein écran), tool (dés, musique).
 *
 * **Point de passage unique des commandes en icône seule du plateau** — dés, musique,
 * plein écran, actions de tour. C'est pourquoi l'infobulle se pose ici et pas sur
 * chaque appelant : une commande qui n'affiche qu'un pictogramme est indéchiffrable
 * pour qui la découvre.
 *
 * Elle remplace l'attribut `title` **sur ces boutons-là seulement** : l'infobulle
 * native met une à deux secondes à venir, ne s'affiche pas à la prise de focus clavier,
 * et jamais au toucher. Les deux ne coexistent pas — elles se superposeraient.
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
  // Boutons du plateau : icône seule — le libellé passe par l’infobulle et `aria-label`.
  const iconOnly = hasIcon && children == null;
  const stateClasses = [
    active ? 'is-active' : '',
    muted ? 'is-muted' : '',
    iconOnly ? 'gl-board-action--icon-only' : '',
  ].filter(Boolean);

  const hint = title ?? label;

  const button = (
    <button
      ref={ref}
      type="button"
      className={joinClassNames('gl-board-action', roleClass, ...stateClasses, className)}
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

  // Un bouton qui porte son libellé n'a rien à expliquer de plus : pas d'enrobage,
  // donc pas de nœud supplémentaire dans une barre d'outils déjà dense.
  if (!iconOnly || !hint) return button;
  return (
    <Tooltip text={hint} position="top">
      {button}
    </Tooltip>
  );
});
