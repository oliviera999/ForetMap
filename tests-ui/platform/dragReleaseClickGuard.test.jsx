import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DialogShell } from '../../src/shared/components/DialogShell.jsx';
import {
  installDragReleaseClickGuard,
  shouldSuppressDragReleaseClick,
} from '../../src/shared/platform/dragReleaseClickGuard.js';

/**
 * Sélection à la souris dans un champ de popover, relâchée sur le fond : le navigateur émet
 * le `click` sur le fond (ancêtre commun) et la modale se fermait.
 */

function press(target) {
  target.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
}

function clickOn(target, detail = 1) {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail }));
}

describe('dragReleaseClickGuard', () => {
  let uninstall;
  let onClose;

  beforeEach(() => {
    uninstall = installDragReleaseClickGuard(window);
    onClose = vi.fn();
    render(
      <DialogShell onClose={onClose} ariaLabel="Popover de test" historyBack={false}>
        <input aria-label="Champ" defaultValue="du texte à sélectionner" />
        <p>Paragraphe</p>
      </DialogShell>,
    );
  });

  afterEach(() => {
    cleanup();
    uninstall();
  });

  const overlay = () => screen.getByRole('dialog').parentElement;

  test('appui dans le champ, relâchement sur le fond : la modale reste ouverte', () => {
    press(screen.getByLabelText('Champ'));
    clickOn(overlay());
    expect(onClose).not.toHaveBeenCalled();
  });

  test('appui sur du texte du dialogue, relâchement sur le fond : reste ouverte', () => {
    press(screen.getByText('Paragraphe'));
    clickOn(overlay());
    expect(onClose).not.toHaveBeenCalled();
  });

  test('vrai clic sur le fond : la modale se ferme toujours', () => {
    press(overlay());
    clickOn(overlay());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('un appui ancien ne bloque pas un clic clavier ultérieur', () => {
    press(screen.getByLabelText('Champ'));
    clickOn(overlay(), 0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('règle pure : clic hors conteneur seulement', () => {
    const input = screen.getByLabelText('Champ');
    expect(shouldSuppressDragReleaseClick(input, { detail: 1, target: overlay() })).toBe(true);
    expect(shouldSuppressDragReleaseClick(input, { detail: 1, target: input })).toBe(false);
    expect(shouldSuppressDragReleaseClick(null, { detail: 1, target: overlay() })).toBe(false);
  });
});
