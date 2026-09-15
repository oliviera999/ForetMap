/**
 * Habillage ForetMap du carnet partagé (`src/shared/journal/`) : préfixe de classes
 * `.fm-journal`, surface `.card`, boutons du thème `.btn`, champs `.fm-journal-field`,
 * dialogues `.fm-journal-modal-head` / `.fm-journal-actions`. Module séparé des composants
 * pour pouvoir moquer ceux-ci en test sans perdre l'habillage.
 */
export const FM_JOURNAL_UI = Object.freeze({
  classPrefix: 'fm-journal',
  cardClassName: 'card',
  hintClassName: 'hint',
  errorClassName: 'auth-error',
  badgeClassName: 'badge',
  actionsClassName: '',
  toolbarClassName: '',
  inputClassName: '',
  fieldClassName: 'fm-journal-field',
  markdownClassName: 'fm-journal-markdown',
  modalHeadClassName: 'fm-journal-modal-head',
  modalActionsClassName: 'fm-journal-actions',
  modalBodyClassName: '',
  importClassPrefix: 'fm-journal-import',
  buttonProps: { size: 'sm', className: 'btn btn-secondary btn-sm' },
  modalButtonProps: { className: 'btn btn-secondary' },
  primaryButtonProps: { className: 'btn btn-primary' },
});
