import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { GuidedTourOverlay as DiscoveryTour } from '../../src/shared/components/GuidedTourOverlay';

/**
 * Le corps de l'étape est rendu par `SpeechBubble` (machine à écrire) : le texte
 * y est réparti entre la portion révélée et la portion en attente. On interroge
 * donc la bulle, pas un nœud de texte unique.
 */
function bubble() {
  return document.querySelector('.discovery-tour__bubble');
}

function makeActive(index = 0) {
  return {
    tab: 'map',
    index,
    steps: [
      {
        target: null,
        title: 'Étape une',
        body: 'Première',
        bodyTeacher: null,
        placement: 'center',
      },
      {
        target: null,
        title: 'Étape deux',
        body: 'Deuxième',
        bodyTeacher: null,
        placement: 'center',
      },
    ],
  };
}

describe('DiscoveryTour', () => {
  afterEach(() => cleanup());

  it('ne rend rien sans parcours actif', () => {
    const { container } = render(<DiscoveryTour active={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(document.querySelector('.discovery-tour')).toBeNull();
  });

  it('affiche le titre, le corps et la progression de l’étape courante', () => {
    render(<DiscoveryTour active={makeActive(0)} />);
    expect(screen.getByText('Étape une')).toBeInTheDocument();
    expect(bubble()).toHaveTextContent('Première');
    expect(screen.getByText('Étape 1 / 2')).toBeInTheDocument();
  });

  it('appelle onNext et onStop via les boutons', () => {
    const onNext = vi.fn();
    const onStop = vi.fn();
    render(<DiscoveryTour active={makeActive(0)} onNext={onNext} onStop={onStop} />);

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(onNext).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Passer' }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('affiche Précédent et Terminer sur la dernière étape', () => {
    const onPrev = vi.fn();
    render(<DiscoveryTour active={makeActive(1)} onPrev={onPrev} />);
    expect(screen.getByText('Étape 2 / 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Terminer' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }));
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('utilise le texte prof quand isTeacher est vrai', () => {
    const active = {
      tab: 'map',
      index: 0,
      steps: [
        { target: null, title: 'T', body: 'élève', bodyTeacher: 'prof', placement: 'center' },
      ],
    };
    render(<DiscoveryTour active={active} isStaff />);
    expect(bubble()).toHaveTextContent('prof');
  });

  it('affiche le corps dans une bulle en cours de frappe, sans région live', () => {
    render(<DiscoveryTour active={makeActive(0)} />);
    expect(bubble()).toHaveAttribute('data-typing', 'true');
    // §9.1 : jamais d'aria-live sur un texte écrit lettre par lettre.
    expect(document.querySelector('.discovery-tour [aria-live]')).toBeNull();
  });

  it('la première validation termine le texte, la seconde avance', () => {
    vi.useFakeTimers();
    try {
      const onNext = vi.fn();
      render(<DiscoveryTour active={makeActive(0)} onNext={onNext} />);
      expect(bubble()).toHaveAttribute('data-typing', 'true');

      act(() => {
        fireEvent.keyDown(window, { key: 'Enter' });
      });
      expect(onNext).not.toHaveBeenCalled();
      expect(bubble()).toHaveAttribute('data-typing', 'false');

      act(() => {
        fireEvent.keyDown(window, { key: 'Enter' });
      });
      expect(onNext).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('le bouton Suivant avance même pendant la frappe', () => {
    const onNext = vi.fn();
    render(<DiscoveryTour active={makeActive(0)} onNext={onNext} />);
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('affiche l’étiquette de locuteur seulement si un nom est fourni', () => {
    const { unmount } = render(<DiscoveryTour active={makeActive(0)} />);
    expect(document.querySelector('[data-speech-bubble-speaker]')).toBeNull();
    unmount();

    render(<DiscoveryTour active={makeActive(0)} speakerName="OLU" />);
    expect(document.querySelector('[data-speech-bubble-speaker]')).toHaveTextContent('OLU');
  });

  it('Échap arrête le parcours même pendant la frappe', () => {
    const onStop = vi.fn();
    render(<DiscoveryTour active={makeActive(0)} onStop={onStop} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
