import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LearningQuizPopover } from '../../src/shared/components/LearningQuizPopover.jsx';

describe('LearningQuizPopover', () => {
  test('ne rend rien quand il est fermé', () => {
    const { container } = render(
      <LearningQuizPopover open={false}>
        <p>Question</p>
      </LearningQuizPopover>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('rend un dialogue accessible, en portail sous body', () => {
    const { container } = render(
      <LearningQuizPopover open ariaLabel="Contrôle de compréhension">
        <p>Que met-on dans le compost ?</p>
      </LearningQuizPopover>,
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
      <LearningQuizPopover open onClose={onClose}>
        <p>Question</p>
      </LearningQuizPopover>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  test('ferme au clic sur l’arrière-plan, pas sur le panneau', () => {
    const onClose = vi.fn();
    render(
      <LearningQuizPopover open onClose={onClose}>
        <p>Question</p>
      </LearningQuizPopover>,
    );
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(document.querySelector('.fm-quiz-popover'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('l’arrière-plan ne ferme pas quand c’est interdit', () => {
    const onClose = vi.fn();
    render(
      <LearningQuizPopover open onClose={onClose} closeOnOverlay={false}>
        <p>Question</p>
      </LearningQuizPopover>,
    );
    fireEvent.click(document.querySelector('.fm-quiz-popover'));
    expect(onClose).not.toHaveBeenCalled();
  });

  test('bouton de fermeture présent et désactivable pendant un envoi', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <LearningQuizPopover open onClose={onClose}>
        <p>Question</p>
      </LearningQuizPopover>,
    );
    const close = screen.getByRole('button', { name: 'Fermer' });
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalled();

    rerender(
      <LearningQuizPopover open onClose={onClose} closeButtonDisabled>
        <p>Question</p>
      </LearningQuizPopover>,
    );
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeDisabled();
  });

  test('porte le vocabulaire visuel du popover ForetMap', () => {
    render(
      <LearningQuizPopover open>
        <p>Question</p>
      </LearningQuizPopover>,
    );
    expect(document.querySelector('.fm-quiz-popover')).toBeTruthy();
    expect(document.querySelector('.fm-quiz-popover__panel')).toBeTruthy();
    expect(document.querySelector('.fm-quiz-popover__strip')).toBeTruthy();
  });
});
