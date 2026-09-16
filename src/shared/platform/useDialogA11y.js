import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Accessibilité d'une surcouche : Échap, et — seulement si elle est **modale** — focus
 * initial, piège de tabulation et restauration du focus à la fermeture.
 *
 * `manageFocus: false` sert aux feuilles **non bloquantes** (carte du Plan encore utilisable
 * derrière) : y prendre le focus arrachait le curseur du champ de recherche qui venait de
 * l'ouvrir, et piéger la tabulation empêchait d'y revenir
 * (`docs/AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md` N1).
 *
 * `active` dit si la surcouche est **ouverte**. Une surcouche écrite en `open={monEtat}` reste
 * montée quand elle est fermée : l'effet s'exécutait alors une seule fois, au montage, avec un
 * ref encore nul — il en sortait aussitôt et ne se rejouait jamais, si bien qu'à l'ouverture il
 * n'y avait ni Échap, ni focus initial, ni piège de tabulation, ni restauration du focus
 * (`docs/AUDIT_UI_2026-09-16.md` B1). L'effet dépend donc de `active` : il s'arme à l'ouverture
 * et se désarme à la fermeture, en rendant le focus au déclencheur. Valeur par défaut `true`
 * (comportement inchangé) pour les surcouches qui ne sont montées que lorsqu'elles s'affichent.
 *
 * @param {() => void} onClose
 * @param {{ manageFocus?: boolean, active?: boolean }} [options]
 */
function useDialogA11y(onClose, options = {}) {
  const { manageFocus = true, active = true } = options;
  const dialogRef = useRef(null);
  const manageFocusRef = useRef(manageFocus);
  manageFocusRef.current = manageFocus;
  // Ne pas mettre onClose dans les deps de l'effet ci-dessous : les parents passent souvent
  // une fonction inline, donc chaque re-render réexécutait le focus initial (1er focusable)
  // et faisait remonter le défilement des modales longues pendant la saisie.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return undefined;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const managed = manageFocusRef.current;
    const previousActive = managed ? document.activeElement : null;
    if (managed) {
      const initialFocusables = dialog.querySelectorAll(FOCUSABLE_SELECTOR);
      const target = initialFocusables[0] || dialog;
      target.focus();
    }

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !manageFocusRef.current) return;
      // Recalculé à chaque Tab, pas capturé au montage : le contenu d'une fenêtre change
      // (chargement → question → réponse → confirmation) et les bornes du piège avec lui.
      // Figées au montage, elles pointaient sur des éléments démontés et le focus
      // s'échappait de la fenêtre (docs/AUDIT_VALIDATION_QUIZ_2026-09.md, D1).
      const focusables = dialog.querySelectorAll(FOCUSABLE_SELECTOR);
      const firstFocusable = focusables[0];
      const lastFocusable = focusables[focusables.length - 1];
      if (!firstFocusable || !lastFocusable) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      if (e.shiftKey && document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable.focus();
        return;
      }
      if (!e.shiftKey && document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previousActive && typeof previousActive.focus === 'function') {
        previousActive.focus();
      }
    };
  }, [active]);

  return dialogRef;
}

export { useDialogA11y };
