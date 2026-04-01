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
    const focusables = dialog.querySelectorAll(FOCUSABLE_SELECTOR);
    const firstFocusable = focusables[0];
    const lastFocusable = focusables[focusables.length - 1];
    const target = firstFocusable || dialog;
    target.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
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
