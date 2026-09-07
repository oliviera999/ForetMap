import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function useDialogA11y(onClose) {
  const dialogRef = useRef(null);
  // Ne pas mettre onClose dans les deps de l'effet ci-dessous : les parents passent souvent
  // une fonction inline, donc chaque re-render réexécutait le focus initial (1er focusable)
  // et faisait remonter le défilement des modales longues pendant la saisie.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const previousActive = document.activeElement;
    const initialFocusables = dialog.querySelectorAll(FOCUSABLE_SELECTOR);
    const target = initialFocusables[0] || dialog;
    target.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
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
  }, []);

  return dialogRef;
}

export { useDialogA11y };
