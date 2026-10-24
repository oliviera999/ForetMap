import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useDialogA11y } from '../../src/shared/platform/useDialogA11y.js';
import { DialogShell } from '../../src/shared/components/DialogShell.jsx';

/**
 * Bouton « retour » du navigateur / smartphone : chaque surcouche ouverte via
 * `useDialogA11y` (donc `DialogShell`, `BottomSheet`, lightbox, popovers) pose UNE entrée
 * d'historique, et un retour la ferme au lieu de quitter l'écran.
 */

const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

function pressBack() {
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  });
}

function Overlay({ onClose, historyBack }) {
  const ref = useDialogA11y(onClose, { historyBack });
  return (
    <div ref={ref} role="dialog" aria-label="Fenêtre">
      <button type="button">ok</button>
    </div>
  );
}

function ShellWithOwnRef({ onClose }) {
  const ref = useDialogA11y(onClose);
  return (
    <DialogShell open onClose={onClose} dialogRef={ref} ariaLabel="Fenêtre">
      <button type="button">ok</button>
    </DialogShell>
  );
}

describe('useDialogA11y — retour navigateur', () => {
  let pushSpy;

  beforeEach(() => {
    pushSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
    // Recul programmatique : rejoue le `popstate` que le navigateur émettrait.
    vi.spyOn(window.history, 'go').mockImplementation((delta) => {
      for (let i = 0; i < Math.abs(delta); i += 1) {
        window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
      }
    });
  });

  afterEach(async () => {
    cleanup();
    await flush();
    vi.restoreAllMocks();
  });

  test('ouvrir une surcouche pose une entrée, « retour » la ferme', () => {
    const onClose = vi.fn();
    render(<Overlay onClose={onClose} />);
    expect(pushSpy).toHaveBeenCalledTimes(1);
    pressBack();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('deux surcouches empilées : le retour ferme d’abord celle du dessus', () => {
    const closeBelow = vi.fn();
    const closeAbove = vi.fn();
    render(
      <>
        <Overlay onClose={closeBelow} />
        <Overlay onClose={closeAbove} />
      </>,
    );
    pressBack();
    expect(closeAbove).toHaveBeenCalledTimes(1);
    expect(closeBelow).not.toHaveBeenCalled();
  });

  test('DialogShell avec un dialogRef fourni n’empile qu’une seule entrée', () => {
    render(<ShellWithOwnRef onClose={() => {}} />);
    expect(pushSpy).toHaveBeenCalledTimes(1);
  });

  test('historyBack: false (formulaires avec appareil photo) : aucune entrée', () => {
    const onClose = vi.fn();
    render(<Overlay onClose={onClose} historyBack={false} />);
    expect(pushSpy).not.toHaveBeenCalled();
    pressBack();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('fermeture par l’interface : l’entrée d’historique est rendue', async () => {
    const goSpy = window.history.go;
    const { unmount } = render(<Overlay onClose={() => {}} />);
    unmount();
    await flush();
    expect(goSpy).toHaveBeenCalledWith(-1);
  });
});
