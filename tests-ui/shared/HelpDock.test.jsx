import { describe, expect, test, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { HelpDock } from '../../src/shared/help/HelpDock.jsx';

beforeEach(() => {
  window.localStorage.clear();
});

const BODY = <p>Voici comment faire.</p>;

describe('HelpDock — dock d’aide partagé', () => {
  test('un bouton « ? » ouvre l’aide, qui n’est pas affichée avant', () => {
    render(<HelpDock helpKey="plan:home" title="Aide du plan" body={BODY} />);
    expect(screen.queryByText('Voici comment faire.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: "Ouvrir l'aide : Aide du plan" }));
    expect(screen.getByText('Voici comment faire.')).toBeTruthy();
  });

  test('le bouton pulse jusqu’à la première ouverture, puis s’en souvient', () => {
    const { unmount } = render(<HelpDock helpKey="plan:home" title="Aide" body={BODY} />);
    const button = screen.getByRole('button', { name: /Ouvrir l'aide/ });
    expect(button.className).toContain('is-pulsing');
    fireEvent.click(button);
    expect(button.className).not.toContain('is-pulsing');
    unmount();

    render(<HelpDock helpKey="plan:home" title="Aide" body={BODY} />);
    expect(screen.getByRole('button', { name: /Ouvrir l'aide/ }).className).not.toContain(
      'is-pulsing',
    );
  });

  test('la mémoire est par clé et par préfixe : une autre aide pulse encore', () => {
    const { unmount } = render(<HelpDock helpKey="a" title="A" body={BODY} />);
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir l'aide/ }));
    unmount();
    render(<HelpDock helpKey="b" title="B" body={BODY} />);
    expect(screen.getByRole('button', { name: /Ouvrir l'aide/ }).className).toContain('is-pulsing');
  });

  test('visite guidée : bouton proposé seulement quand un parcours existe', () => {
    const onStartTour = vi.fn();
    const { rerender } = render(
      <HelpDock helpKey="k" title="T" body={BODY} onStartTour={onStartTour} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir l'aide/ }));
    fireEvent.click(screen.getByRole('button', { name: '▶ Visite guidée' }));
    expect(onStartTour).toHaveBeenCalled();
    expect(screen.queryByText('Voici comment faire.')).toBeNull();

    rerender(<HelpDock helpKey="k" title="T" body={BODY} />);
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir l'aide/ }));
    expect(screen.queryByRole('button', { name: '▶ Visite guidée' })).toBeNull();
  });

  test('classes de produit ajoutées aux classes neutres', () => {
    const { container } = render(
      <HelpDock
        helpKey="k"
        title="T"
        body={BODY}
        className={null}
        buttonClassName="gl-help-btn"
        classNames={{ body: 'gl-help-dialog__body' }}
      />,
    );
    expect(container.querySelector('.gl-help-btn')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir l'aide/ }));
    const body = document.querySelector('.fm-help-dialog__body');
    expect(body.className).toContain('gl-help-dialog__body');
  });

  test('sans corps d’aide, aucun bouton (rien à ouvrir)', () => {
    const { container } = render(<HelpDock helpKey="k" title="T" body="" />);
    expect(container.querySelector('button')).toBeNull();
  });

  test('crochet de métriques appelé à l’ouverture (ForetMap)', () => {
    const onOpen = vi.fn();
    render(<HelpDock helpKey="tasks" title="T" body={BODY} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir l'aide/ }));
    expect(onOpen).toHaveBeenCalledWith('tasks');
  });
});
