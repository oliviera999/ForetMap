import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GLZoneContentPopover } from '../../src/gl/components/GLZoneContentPopover.jsx';

function renderPopover(props = {}) {
  const onClose = vi.fn();
  const utils = render(
    <GLZoneContentPopover
      open
      zone={{ id: 1, label: 'Clairière' }}
      popoverMarkdown="**Bienvenue** dans la clairière."
      popoverImages={[{ url: '/uploads/media-library/image/test.png', caption: 'Vue' }]}
      onClose={onClose}
      {...props}
    />,
  );
  return { ...utils, onClose };
}

describe('GLZoneContentPopover', () => {
  it('affiche le titre, le markdown et la galerie ; se referme en fondu', async () => {
    const { onClose } = renderPopover();
    const dialog = screen.getByRole('dialog', { name: /Zone : Clairière/i });
    expect(screen.getByText(/Bienvenue/)).toBeTruthy();
    expect(screen.getByText('Vue')).toBeTruthy();
    const closeButtons = screen.getAllByRole('button', { name: 'Fermer' });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    // Fermeture animée : classe de sortie posée, `onClose` à la fin de l'animation.
    expect(dialog).toHaveClass('fm-is-exiting');
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('prend le focus à l’ouverture et le rend au déclencheur à la fermeture', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const { rerender, onClose } = renderPopover();
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    rerender(
      <GLZoneContentPopover open={false} zone={{ id: 1, label: 'Clairière' }} onClose={onClose} />,
    );
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('Échap passe par la pile des surcouches', async () => {
    const { onClose } = renderPopover();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
