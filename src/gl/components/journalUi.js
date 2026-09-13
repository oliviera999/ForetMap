import { GLButton } from './ui/GLButton.jsx';

/**
 * Habillage G&L du carnet partagé (`src/shared/journal/`) : préfixe `.gl-player-journal`,
 * surface `.gl-panel`, `GLButton`. Module séparé des composants pour pouvoir moquer ceux-ci
 * en test sans perdre l'habillage.
 */
export const GL_JOURNAL_UI = Object.freeze({
  classPrefix: 'gl-player-journal',
  cardClassName: 'gl-panel',
  hintClassName: 'gl-hint',
  actionsClassName: 'gl-inline-actions',
  toolbarClassName: 'gl-inline-actions',
  inputClassName: 'gl-input',
  Button: GLButton,
  buttonProps: { variant: 'secondary' },
});
