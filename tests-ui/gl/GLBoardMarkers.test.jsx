import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GLBoardMarkers } from '../../src/gl/components/GLBoardMarkers.jsx';

describe('GLBoardMarkers', () => {
  test('affiche le label en mode texte', () => {
    render(
      <GLBoardMarkers
        markers={[
          {
            id: 1,
            label: 'Départ',
            x_pct: 10,
            y_pct: 20,
            event_type: 'start',
            display_mode: 'label',
          },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Départ' })).toHaveTextContent('Départ');
    expect(document.querySelector('.gl-board-marker--label')).toBeTruthy();
  });

  test('affiche emoji en mode question avec aria-label sur le label', () => {
    render(
      <GLBoardMarkers
        markers={[
          {
            id: 2,
            label: 'Question foret',
            x_pct: 40,
            y_pct: 55,
            event_type: 'question',
            display_mode: 'emoji',
            emoji: '❓',
          },
        ]}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Question foret' });
    expect(btn).toHaveTextContent('❓');
    expect(btn).not.toHaveTextContent('Question foret');
    expect(document.querySelector('.gl-board-marker--emoji')).toBeTruthy();
    expect(document.querySelector('.foretmap-emoji-text-mixed')).toBeNull();
  });

  test('affiche emoji rameau sans classe foretmap-emoji-text-mixed', () => {
    render(
      <GLBoardMarkers
        markers={[
          {
            id: 4,
            label: 'Repère nature',
            x_pct: 20,
            y_pct: 40,
            event_type: 'point',
            display_mode: 'emoji',
            emoji: '🌿',
          },
        ]}
      />,
    );
    const emojiSpan = document.querySelector('.gl-board-marker__emoji');
    expect(emojiSpan).toBeTruthy();
    expect(emojiSpan.textContent).toContain('🌿');
    expect(emojiSpan.classList.contains('foretmap-emoji-text-mixed')).toBe(false);
  });

  test('affiche le numéro de parcours quand markerPathNumbers est fourni', () => {
    const pathNumbers = new Map([
      [1, 1],
      [2, 2],
    ]);
    render(
      <GLBoardMarkers
        markers={[
          { id: 1, label: 'Départ', x_pct: 10, y_pct: 20, order_index: 0 },
          { id: 2, label: 'Arrivée', x_pct: 80, y_pct: 70, order_index: 1 },
        ]}
        markerPathNumbers={pathNumbers}
      />,
    );
    expect(screen.getByRole('button', { name: 'Repère 1 — Départ' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Repère 2 — Arrivée' })).toBeTruthy();
    expect(document.querySelectorAll('.gl-board-marker__path-number')).toHaveLength(2);
    expect(document.querySelector('.gl-board-marker__path-number')?.textContent).toBe('1');
  });

  test('affiche icône en mode icon', () => {
    render(
      <GLBoardMarkers
        markers={[
          {
            id: 3,
            label: 'Trésor',
            x_pct: 70,
            y_pct: 30,
            event_type: 'point',
            display_mode: 'icon',
            icon_url: '/uploads/media-library/image/test.png',
          },
        ]}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Trésor' });
    expect(btn.querySelector('.gl-board-marker__icon')).toBeTruthy();
    expect(document.querySelector('.gl-board-marker--icon')).toBeTruthy();
  });

  // Chantier « écrans de séance », étape 3 : au tableau, rien ne se touche.
  test('statique (projection) : la case se lit, ce n’est plus un bouton', () => {
    const clics = [];
    render(
      <GLBoardMarkers
        statique
        onMarkerClick={(m) => clics.push(m.id)}
        markerPathNumbers={new Map([[1, 3]])}
        markers={[
          {
            id: 1,
            label: 'Étape',
            x_pct: 10,
            y_pct: 20,
            event_type: 'point',
            display_mode: 'label',
          },
        ]}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    const repere = screen.getByRole('img', { name: 'Repère 3 — Étape' });
    expect(repere.tagName).toBe('SPAN');
    expect(repere.getAttribute('type')).toBeNull();
    expect(repere.className).toBe(
      'gl-board-marker gl-board-marker--label gl-board-marker--statique',
    );
    // Même place et même contenu que le bouton : seul le geste disparaît.
    expect(repere.style.left).toBe('10%');
    expect(repere.style.top).toBe('20%');
    expect(repere).toHaveTextContent('Étape');
    expect(repere.dataset.pathNumber).toBe('3');
    repere.click();
    expect(clics).toEqual([]);
  });
});
