/**
 * Garde-fou « sélection relâchée hors du popover ».
 *
 * Quand on enfonce le bouton dans un champ (ou ailleurs dans un dialogue), qu'on glisse pour
 * sélectionner du texte et qu'on relâche sur le fond, le navigateur émet un `click` sur
 * l'ancêtre commun des deux cibles : le fond de la modale. Les fonds qui ferment au clic
 * (`e.target === e.currentTarget`) prenaient alors ce geste pour une fermeture volontaire.
 *
 * Plutôt que de corriger chaque modale, on neutralise ce `click` en phase de capture sur
 * `window`, avant tout gestionnaire React — même règle que la fermeture « light dismiss »
 * des navigateurs, qui exige que l'appui **et** le relâchement aient lieu hors du dialogue.
 */

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"], [aria-modal="true"]';

/** Conteneur dont l'appui ne doit pas pouvoir déclencher un clic au-dehors, ou `null`. */
export function pressContainerOf(target) {
  if (!target || typeof target.closest !== 'function') return null;
  return target.closest(EDITABLE_SELECTOR) || target.closest(DIALOG_SELECTOR);
}

/**
 * Vrai si ce `click` est le reliquat d'un appui commencé dans un champ / dialogue et relâché
 * hors de lui. Les clics clavier ou programmatiques (`detail === 0`) ne sont jamais bloqués.
 */
export function shouldSuppressDragReleaseClick(pressTarget, clickEvent) {
  if (!pressTarget || !clickEvent || !(clickEvent.detail > 0)) return false;
  const container = pressContainerOf(pressTarget);
  if (!container) return false;
  const clickTarget = clickEvent.target;
  if (!clickTarget || typeof clickTarget !== 'object') return false;
  return !container.contains(clickTarget);
}

/** Installe le garde-fou sur `win` (une seule fois) ; renvoie la fonction de désinstallation. */
export function installDragReleaseClickGuard(win = typeof window !== 'undefined' ? window : null) {
  if (!win || win.__foretmapDragReleaseClickGuard) return () => {};
  let pressTarget = null;

  const onPointerDown = (event) => {
    pressTarget = event.target || null;
  };
  const onClick = (event) => {
    const target = pressTarget;
    pressTarget = null;
    if (shouldSuppressDragReleaseClick(target, event)) {
      event.stopPropagation();
      event.preventDefault();
    }
  };

  win.addEventListener('pointerdown', onPointerDown, true);
  win.addEventListener('click', onClick, true);
  win.__foretmapDragReleaseClickGuard = true;

  return () => {
    win.removeEventListener('pointerdown', onPointerDown, true);
    win.removeEventListener('click', onClick, true);
    delete win.__foretmapDragReleaseClickGuard;
  };
}
