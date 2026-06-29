import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { DiscoveryTour } from '../../src/components/DiscoveryTour';

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
    expect(screen.getByText('Première')).toBeInTheDocument();
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
    render(<DiscoveryTour active={active} isTeacher />);
    expect(screen.getByText('prof')).toBeInTheDocument();
  });
});
