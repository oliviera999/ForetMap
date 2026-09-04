import { forwardRef } from 'react';

function joinClassNames(...parts) {
  return parts
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' ');
}

/** Variantes connues (toute autre valeur retombe sur `secondary`). */
export const BUTTON_VARIANTS = Object.freeze(['primary', 'secondary', 'ghost', 'danger']);

/**
 * Bouton partagé ForetMap / G&L / plan (kit d'interface, lot 3) — issu de `GLButton`
 * (variantes, taille `sm`, état `loading`, focus visible). Il rend les classes neutres
 * `shared-btn shared-btn--<variante>` (`src/shared/styles/shared-controls.css`, chargée par les
 * deux entrées) ; un produit ajoute ses classes de thème via `className` (`.gl-btn…` côté G&L,
 * `.btn…` côté ForetMap) : elles sont additives, jamais requises.
 *
 * @param {object} props
 * @param {'primary'|'secondary'|'ghost'|'danger'} [props.variant='secondary']
 * @param {'md'|'sm'} [props.size='md']
 * @param {boolean} [props.loading=false] désactive le bouton et annonce l'attente (`aria-busy`).
 * @param {string} [props.loadingLabel='Chargement…'] libellé affiché pendant `loading`.
 * @param {boolean} [props.block=false] pleine largeur.
 * @param {import('react').ReactNode} [props.icon] pictogramme (décoratif) avant le libellé.
 */
export const Button = forwardRef(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    loadingLabel = 'Chargement…',
    block = false,
    icon = null,
    className = '',
    children,
    type = 'button',
    disabled = false,
    ...props
  },
  ref,
) {
  const safeVariant = BUTTON_VARIANTS.includes(variant) ? variant : 'secondary';
  return (
    <button
      ref={ref}
      type={type}
      className={joinClassNames(
        'shared-btn',
        `shared-btn--${safeVariant}`,
        size === 'sm' ? 'shared-btn--sm' : '',
        block ? 'shared-btn--block' : '',
        loading ? 'is-loading' : '',
        className,
      )}
      disabled={loading || disabled}
      aria-busy={loading || undefined}
      {...props}
    >
      {icon != null && !loading ? (
        <span className="shared-btn__icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      {loading ? loadingLabel : children}
    </button>
  );
});
