import { forwardRef } from 'react';

import { MapActionButton } from '../../shared/ui/MapActionButton.jsx';

/** Classes G&L historiques (`gl-board-action…`, gl-theme.css), posées en plus des neutres. */
const GL_BOARD_ACTION_CLASS_NAMES = Object.freeze({
  root: 'gl-board-action',
  role: (role) => `gl-board-action--${role}`,
  icon: 'gl-board-action__icon',
  label: 'gl-board-action__label',
  labelShort: 'gl-board-action__label--short',
  labelLong: 'gl-board-action__label--long',
  iconOnly: 'gl-board-action--icon-only',
});

/**
 * Bouton d'action du plateau G&L — enveloppe du `MapActionButton` partagé (lot 3) : même
 * API (`role`, `active`, `muted`, `icon`, `label`, `labelShort`, `testId`, `title`,
 * `ariaLabel`…), infobulle sur les boutons en icône seule, classes G&L conservées.
 */
export const GLBoardActionButton = forwardRef(function GLBoardActionButton(props, ref) {
  return <MapActionButton ref={ref} classNames={GL_BOARD_ACTION_CLASS_NAMES} {...props} />;
});
