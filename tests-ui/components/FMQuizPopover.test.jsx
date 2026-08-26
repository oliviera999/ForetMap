import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FMQuizPopover } from '../../src/components/pedago/FMQuizPopover.jsx';

describe('FMQuizPopover', () => {
  test('ne rend rien quand il est fermé', () => {
    const { container } = render(
      <FMQuizPopover open={false}>
        <p>Question</p>
      </FMQuizPopover>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('rend un dialogue accessible, en portail sous body', () => {
    const { container } = render(
      <FMQuizPopover open ariaLabel="Contrôle de compréhension">
        <p>Que met-on dans le compost ?</p>
      </FMQuizPopover>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Contrôle de compréhension');
    // Portail : le contenu ne vit pas dans le conteneur de rendu.
    expect(container).toBeEmptyDOMElement();
    expect(screen.getByText('Que met-on dans le compost ?')).toBeInTheDocument();
  });

  test('ferme sur Échap', () => {
    const onClose = vi.fn();
    render(
      <FMQuizPopover open onClose={onClose}>
        <p>Question</p>
      </FMQuizPopover>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  test('ferme au clic sur l’arrière-plan, pas sur le panneau', () => {
    const onClose = vi.fn();
    render(
      <FMQuizPopover open onClose={onClose}>
        <p>Question</p>
      </FMQuizPopover>,
    );
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(document.querySelector('.fm-quiz-popover'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('l’arrière-plan ne ferme pas quand c’est interdit', () => {
    const onClose = vi.fn();
    render(
      <FMQuizPopover open onClose={onClose} closeOnOverlay={false}>
        <p>Question</p>
      </FMQuizPopover>,
    );
    fireEvent.click(document.querySelector('.fm-quiz-popover'));
    expect(onClose).not.toHaveBeenCalled();
  });

  test('bouton de fermeture présent et désactivable pendant un envoi', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <FMQuizPopover open onClose={onClose}>
        <p>Question</p>
      </FMQuizPopover>,
    );
    const close = screen.getByRole('button', { name: 'Fermer' });
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalled();

    rerender(
      <FMQuizPopover open onClose={onClose} closeButtonDisabled>
        <p>Question</p>
      </FMQuizPopover>,
    );
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeDisabled();
  });

  test('porte le vocabulaire visuel du popover ForetMap', () => {
    render(
      <FMQuizPopover open>
        <p>Question</p>
      </FMQuizPopover>,
    );
    expect(document.querySelector('.fm-quiz-popover')).toBeTruthy();
    expect(document.querySelector('.fm-quiz-popover__panel')).toBeTruthy();
    expect(document.querySelector('.fm-quiz-popover__strip')).toBeTruthy();
  });
});
