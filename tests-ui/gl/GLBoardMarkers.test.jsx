import React from 'react';
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GLBoardMarkers } from '../../src/gl/components/GLBoardMarkers.jsx';

describe('GLBoardMarkers', () => {
  test('affiche le label en mode texte', () => {
    render(
      <GLBoardMarkers
        markers={[{
          id: 1,
          label: 'Départ',
          x_pct: 10,
          y_pct: 20,
          event_type: 'start',
          display_mode: 'label',
        }]}
      />
    );
    expect(screen.getByRole('button', { name: 'Départ' })).toHaveTextContent('Départ');
    expect(document.querySelector('.gl-board-marker--label')).toBeTruthy();
  });

  test('affiche emoji en mode question avec aria-label sur le label', () => {
    render(
      <GLBoardMarkers
        markers={[{
          id: 2,
          label: 'Question foret',
          x_pct: 40,
          y_pct: 55,
          event_type: 'question',
          display_mode: 'emoji',
          emoji: '❓',
        }]}
      />
    );
    const btn = screen.getByRole('button', { name: 'Question foret' });
    expect(btn).toHaveTextContent('❓');
    expect(btn).not.toHaveTextContent('Question foret');
    expect(document.querySelector('.gl-board-marker--emoji')).toBeTruthy();
  });

  test('affiche icône en mode icon', () => {
    render(
      <GLBoardMarkers
        markers={[{
          id: 3,
          label: 'Trésor',
          x_pct: 70,
          y_pct: 30,
          event_type: 'point',
          display_mode: 'icon',
          icon_url: '/uploads/media-library/image/test.png',
        }]}
      />
    );
    const btn = screen.getByRole('button', { name: 'Trésor' });
    expect(btn.querySelector('.gl-board-marker__icon')).toBeTruthy();
    expect(document.querySelector('.gl-board-marker--icon')).toBeTruthy();
  });
});
