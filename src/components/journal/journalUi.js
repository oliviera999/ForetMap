/**
 * Habillage ForetMap du carnet partagé (`src/shared/journal/`) : préfixe de classes
 * `.fm-journal`, surface `.card`, boutons du thème `.btn`. Module séparé des composants pour
 * pouvoir moquer ceux-ci en test sans perdre l'habillage.
 */
export const FM_JOURNAL_UI = Object.freeze({
  classPrefix: 'fm-journal',
  cardClassName: 'card',
  hintClassName: 'hint',
  actionsClassName: '',
  toolbarClassName: '',
  inputClassName: '',
  buttonProps: { size: 'sm', className: 'btn btn-secondary btn-sm' },
});
