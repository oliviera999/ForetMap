import { GLButton } from './ui/GLButton.jsx';
import { GLField } from './ui/GLField.jsx';
import { GLSelect } from './ui/GLSelect.jsx';

/**
 * Habillage G&L du carnet partagé (`src/shared/journal/`) : préfixe `.gl-player-journal`,
 * surface `.gl-panel`, `GLButton` / `GLField` / `GLSelect`, dialogues `.gl-profile-modal-*`.
 * Module séparé des composants pour pouvoir moquer ceux-ci en test sans perdre l'habillage.
 */
export const GL_JOURNAL_UI = Object.freeze({
  classPrefix: 'gl-player-journal',
  cardClassName: 'gl-panel',
  hintClassName: 'gl-hint',
  errorClassName: 'gl-error',
  badgeClassName: 'gl-badge',
  actionsClassName: 'gl-inline-actions',
  toolbarClassName: 'gl-inline-actions',
  inputClassName: 'gl-input',
  fieldClassName: '',
  markdownClassName: 'gl-markdown gl-player-journal-preview',
  modalHeadClassName: 'gl-profile-modal-head',
  modalActionsClassName: 'gl-inline-actions',
  modalBodyClassName: 'gl-profile-modal-body',
  importClassPrefix: 'gl-journal-import',
  Button: GLButton,
  Field: GLField,
  Select: GLSelect,
  buttonProps: { variant: 'secondary' },
  modalButtonProps: { variant: 'secondary' },
  primaryButtonProps: { variant: 'primary' },
});
