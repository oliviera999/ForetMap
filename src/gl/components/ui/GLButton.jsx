import { forwardRef } from 'react';

import { Button } from '../../../shared/ui/Button.jsx';

function joinClassNames(...parts) {
  return parts.filter(Boolean).join(' ');
}

/**
 * Bouton G&L — enveloppe du `Button` partagé (lot 3) : même API (`variant`, `size`,
 * `loading`, `className`), classes `gl-btn gl-btn--<variante>` conservées pour le thème G&L
 * (gl-theme.css), posées en plus des classes neutres `shared-btn…`.
 */
export const GLButton = forwardRef(function GLButton(
  { variant = 'primary', size = 'md', className = '', ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      className={joinClassNames(
        'gl-btn',
        `gl-btn--${variant}`,
        size === 'sm' ? 'gl-btn--sm' : '',
        className,
      )}
      {...props}
    />
  );
});
