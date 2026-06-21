import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

vi.mock('../../src/gl/hooks/useGLZoneMusic.js', () => ({
  useGLZoneMusic: () => ({ previewUrl: vi.fn(), stopAll: vi.fn() }),
}));

vi.mock('../../src/gl/components/GLPctMapCanvas.jsx', () => ({
  GLPctMapCanvas: ({ children, onMapClick }) => (
    <div
      data-testid="map-canvas"
      role="button"
      tabIndex={0}
      onClick={(e) => onMapClick?.({ x: 50, y: 50 }, e)}
      onKeyDown={() => {}}
    >
      {children}
    </div>
  ),
}));

vi.mock('../../src/gl/components/GLBoardMarkers.jsx', () => ({
  GLBoardMarkers: () => null,
}));

vi.mock('../../src/gl/components/GLMarkerEventEditor.jsx', () => ({
  GLMarkerEventEditor: () => null,
}));

vi.mock('../../src/gl/components/GLMarkerAppearanceEditor.jsx', () => ({
  GLMarkerAppearanceEditor: () => null,
  EMPTY_APPEARANCE_FORM: {},
  appearanceFormFromMarker: () => ({}),
  appearanceDefaultsForEventType: () => null,
  appearanceToPayload: () => ({}),
}));

import { GLChapterMapStudio } from '../../src/gl/components/GLChapterMapStudio.jsx';

describe('GLChapterMapStudio', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    apiGlMock.mockImplementation(async (url) => {
      if (String(url).includes('/api/gl/kingdom-map/zones')) {
        return {
          zones: [
            {
              id: 1,
              label: 'Zone test',
              color: '#22c55e',
              points: [
                { x: 10, y: 10 },
                { x: 20, y: 10 },
                { x: 15, y: 20 },
              ],
            },
          ],
        };
      }
      return { items: [] };
    });
  });

  test('affiche les toolbars repères et zones après chargement', async () => {
    render(
      <GLChapterMapStudio
        chapterId={42}
        chapterSlug="foret-magique"
        chapterTitle="Forêt magique"
        mapImageUrl="/maps/map-foret.svg"
        markers={[]}
        zoneMusicEnabled={false}
        onReload={vi.fn()}
        onError={vi.fn()}
        onInfo={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Dessiner une zone/i })).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: /Ajouter un repère/i })).toBeTruthy();
    expect(screen.getByText('Zone test')).toBeTruthy();
  });

  test('déplace un repère sélectionné au clic sur la carte', async () => {
    const onReload = vi.fn();
    const onInfo = vi.fn();
    render(
      <GLChapterMapStudio
        chapterId={42}
        chapterSlug="foret-magique"
        chapterTitle="Forêt magique"
        mapImageUrl="/maps/map-foret.svg"
        markers={[{ id: 9, label: 'Repère test', x_pct: 10, y_pct: 20, order_index: 0 }]}
        zoneMusicEnabled={false}
        onReload={onReload}
        onError={vi.fn()}
        onInfo={onInfo}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Repère test/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Repère test/i }));
    fireEvent.click(screen.getByTestId('map-canvas'));

    await waitFor(() => {
      expect(apiGlMock).toHaveBeenCalledWith(
        '/api/gl/chapters/admin/markers/9',
        'PUT',
        expect.objectContaining({ xPct: 50, yPct: 50 }),
      );
    });
    expect(onInfo).toHaveBeenCalledWith('Position du repère mise à jour');
  });

  test('affiche les numéros de parcours dans la liste des repères', async () => {
    render(
      <GLChapterMapStudio
        chapterId={42}
        chapterSlug="foret-magique"
        chapterTitle="Forêt magique"
        mapImageUrl="/maps/map-foret.svg"
        markers={[
          { id: 9, label: 'Repère B', x_pct: 10, y_pct: 20, order_index: 1 },
          { id: 8, label: 'Repère A', x_pct: 30, y_pct: 40, order_index: 0 },
        ]}
        zoneMusicEnabled={false}
        onReload={vi.fn()}
        onError={vi.fn()}
        onInfo={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Repère A/i })).toBeTruthy();
    });

    const numbers = document.querySelectorAll('.gl-markers-list__path-number');
    expect(numbers).toHaveLength(2);
    expect(numbers[0]?.textContent).toBe('1');
    expect(numbers[1]?.textContent).toBe('2');
    expect(screen.getByText('Repère A').closest('button')?.querySelector('.gl-markers-list__path-number')?.textContent).toBe('1');
    expect(screen.getByText('Repère B').closest('button')?.querySelector('.gl-markers-list__path-number')?.textContent).toBe('2');
  });

  test('duplique un repère depuis la liste', async () => {
    const onReload = vi.fn();
    const onInfo = vi.fn();
    render(
      <GLChapterMapStudio
        chapterId={42}
        chapterSlug="foret-magique"
        chapterTitle="Forêt magique"
        mapImageUrl="/maps/map-foret.svg"
        markers={[
          {
            id: 9,
            label: 'Repère test',
            x_pct: 10,
            y_pct: 20,
            order_index: 0,
            event_type: 'question',
            event_config: { version: 1 },
          },
        ]}
        zoneMusicEnabled={false}
        onReload={onReload}
        onError={vi.fn()}
        onInfo={onInfo}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Dupliquer$/i })).toBeTruthy();
    });

    fireEvent.click(screen.getAllByRole('button', { name: /^Dupliquer$/i })[0]);

    await waitFor(() => {
      expect(apiGlMock).toHaveBeenCalledWith(
        '/api/gl/chapters/admin/42/markers',
        'POST',
        expect.objectContaining({
          label: 'Repère test (copie)',
          xPct: 13,
          yPct: 23,
        }),
      );
    });
    expect(onInfo).toHaveBeenCalledWith('Repère dupliqué');
  });
});
