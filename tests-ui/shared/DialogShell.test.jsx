import { createRef } from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DialogShell } from '../../src/shared/components/DialogShell.jsx';

/** Monte le shell avec deux champs focusables pour vérifier le piégeage du focus. */
function renderTwoFields(props = {}) {
  return render(
    <DialogShell ariaLabel="Boîte de test" {...props}>
      <input aria-label="Premier" />
      <input aria-label="Dernier" />
    </DialogShell>,
  );
}

describe('DialogShell', () => {
  test('rend un portail sous document.body avec role="dialog" et aria-modal', () => {
    const { container } = render(
      <DialogShell ariaLabel="Boîte de test" ariaDescribedBy="desc-1">
        <p id="desc-1">Contenu</p>
      </DialogShell>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Boîte de test' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-describedby', 'desc-1');
    // Portail : le panneau est hors de l'arbre du conteneur de rendu, directement sous body.
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
    expect(dialog.parentElement).toHaveAttribute('role', 'presentation');
  });

  test('aria-labelledby relie le titre au dialogue', () => {
    render(
      <DialogShell ariaLabelledBy="titre-1">
        <h2 id="titre-1">Titre du dialogue</h2>
      </DialogShell>,
    );
    expect(screen.getByRole('dialog', { name: 'Titre du dialogue' })).toBeInTheDocument();
  });

  test('open=false ne rend rien', () => {
    render(
      <DialogShell open={false} ariaLabel="Fermée">
        <p>Invisible</p>
      </DialogShell>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Invisible')).not.toBeInTheDocument();
  });

  test('clic sur l’overlay → onClose (closeOnOverlay par défaut)', () => {
    const onClose = vi.fn();
    render(
      <DialogShell ariaLabel="Boîte" onClose={onClose}>
        <p>Contenu</p>
      </DialogShell>,
    );

    fireEvent.click(screen.getByRole('presentation'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('clic sur le panneau ou un enfant ne ferme pas (stopPropagation)', () => {
    const onClose = vi.fn();
    render(
      <DialogShell ariaLabel="Boîte" onClose={onClose}>
        <p>Contenu</p>
      </DialogShell>,
    );

    fireEvent.click(screen.getByRole('dialog'));
    fireEvent.click(screen.getByText('Contenu'));
    expect(onClose).not.toHaveBeenCalled();
  });

  test('closeOnOverlay=false : le clic overlay est ignoré', () => {
    const onClose = vi.fn();
    render(
      <DialogShell ariaLabel="Boîte" onClose={onClose} closeOnOverlay={false}>
        <p>Contenu</p>
      </DialogShell>,
    );

    fireEvent.click(screen.getByRole('presentation'));
    expect(onClose).not.toHaveBeenCalled();
  });

  test('pas de bouton fermer par défaut', () => {
    render(
      <DialogShell ariaLabel="Boîte">
        <p>Contenu</p>
      </DialogShell>,
    );
    expect(screen.queryByRole('button', { name: 'Fermer' })).not.toBeInTheDocument();
  });

  test('showCloseButton : bouton « Fermer » qui appelle onClose', () => {
    const onClose = vi.fn();
    render(
      <DialogShell ariaLabel="Boîte" onClose={onClose} showCloseButton>
        <p>Contenu</p>
      </DialogShell>,
    );

    const button = screen.getByRole('button', { name: 'Fermer' });
    expect(button).toHaveClass('modal-close');
    fireEvent.click(button);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('bouton fermer : libellé, classe et état désactivé personnalisables', () => {
    const onClose = vi.fn();
    render(
      <DialogShell
        ariaLabel="Boîte"
        onClose={onClose}
        showCloseButton
        closeButtonLabel="Quitter"
        closeButtonClassName="ma-croix"
        closeButtonDisabled
      >
        <p>Contenu</p>
      </DialogShell>,
    );

    const button = screen.getByRole('button', { name: 'Quitter' });
    expect(button).toBeDisabled();
    expect(button).toHaveClass('ma-croix');
    fireEvent.click(button);
    expect(onClose).not.toHaveBeenCalled();
  });

  test('classes et style du panneau / overlay', () => {
    render(
      <DialogShell
        ariaLabel="Boîte"
        overlayClassName="mon-overlay"
        dialogClassName="  mon-panneau  "
        dialogStyle={{ maxWidth: '320px' }}
      >
        <p>Contenu</p>
      </DialogShell>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toBe('mon-panneau');
    expect(dialog).toHaveStyle({ maxWidth: '320px' });
    expect(screen.getByRole('presentation')).toHaveClass('mon-overlay');
  });

  test('focus initial sur le premier élément focusable', () => {
    renderTwoFields();
    expect(screen.getByLabelText('Premier')).toHaveFocus();
  });

  test('sans élément focusable, le panneau lui-même reçoit le focus', () => {
    render(
      <DialogShell ariaLabel="Boîte">
        <p>Texte seul</p>
      </DialogShell>,
    );
    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  test('Tab depuis le dernier focusable boucle sur le premier', () => {
    renderTwoFields();
    const last = screen.getByLabelText('Dernier');
    last.focus();
    expect(last).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByLabelText('Premier')).toHaveFocus();
  });

  test('Shift+Tab depuis le premier focusable boucle sur le dernier', () => {
    renderTwoFields();
    expect(screen.getByLabelText('Premier')).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(screen.getByLabelText('Dernier')).toHaveFocus();
  });

  test('Escape → onClose', () => {
    const onClose = vi.fn();
    renderTwoFields({ onClose });

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Escape utilise toujours le dernier onClose fourni (ref stable)', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderTwoFields({ onClose: first });
    rerender(
      <DialogShell ariaLabel="Boîte de test" onClose={second}>
        <input aria-label="Premier" />
        <input aria-label="Dernier" />
      </DialogShell>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  test('le focus revient sur l’élément déclencheur au démontage', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Ouvrir';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(trigger).toHaveFocus();

    const { unmount } = renderTwoFields();
    expect(screen.getByLabelText('Premier')).toHaveFocus();

    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  test('l’écouteur clavier est retiré au démontage', () => {
    const onClose = vi.fn();
    const { unmount } = renderTwoFields({ onClose });
    unmount();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  test('dialogRef externe : le panneau est exposé au parent', () => {
    const ref = createRef();
    render(
      <DialogShell ariaLabel="Boîte" dialogRef={ref}>
        <p>Contenu</p>
      </DialogShell>,
    );
    expect(ref.current).toBe(screen.getByRole('dialog'));
  });
});
