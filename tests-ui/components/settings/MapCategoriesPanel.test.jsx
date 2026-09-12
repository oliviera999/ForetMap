import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { MapCategoriesPanel } from '../../../src/components/settings/MapCategoriesPanel.jsx';

const api = vi.fn(async () => []);

vi.mock('../../../src/services/api.js', () => ({
  api: (...args) => api(...args),
}));

const MAPS = [
  { id: 'foret', label: 'Forêt comestible' },
  { id: 'n3', label: 'N3' },
];

function renderPanel(props = {}) {
  const onError = vi.fn();
  const onMessage = vi.fn();
  const utils = render(
    <MapCategoriesPanel maps={MAPS} onError={onError} onMessage={onMessage} {...props} />,
  );
  return { onError, onMessage, ...utils };
}

/** Le sélecteur natif : seul `input[type=color]` du panneau. */
function colorPicker() {
  return screen.getByLabelText('Choisir la teinte');
}

function hexField() {
  return screen.getByPlaceholderText('#86efac90');
}

describe('MapCategoriesPanel — champ couleur', () => {
  beforeEach(() => {
    api.mockClear();
    api.mockResolvedValue([]);
  });

  test('affiche le sélecteur de couleur à côté du champ hexadécimal', async () => {
    renderPanel();
    await waitFor(() => expect(colorPicker()).toBeTruthy());
    expect(colorPicker().type).toBe('color');
    expect(hexField()).toBeTruthy();
  });

  test('le sélecteur reflète la teinte de la valeur courante, alpha exclu', async () => {
    renderPanel();
    await waitFor(() => expect(colorPicker()).toBeTruthy());
    // Valeur initiale du brouillon : #86efac90
    expect(colorPicker().value).toBe('#86efac');
  });

  test('choisir une teinte préserve la transparence saisie', async () => {
    renderPanel();
    await waitFor(() => expect(colorPicker()).toBeTruthy());
    fireEvent.change(colorPicker(), { target: { value: '#fca5a5' } });
    expect(hexField().value).toBe('#fca5a590');
  });

  test('le champ hexadécimal reste éditable et pilote le sélecteur', async () => {
    renderPanel();
    await waitFor(() => expect(hexField()).toBeTruthy());
    fireEvent.change(hexField(), { target: { value: '#93c5fd40' } });
    expect(colorPicker().value).toBe('#93c5fd');
  });

  test('une saisie hexadécimale incomplète ne casse pas le sélecteur', async () => {
    renderPanel();
    await waitFor(() => expect(hexField()).toBeTruthy());
    fireEvent.change(hexField(), { target: { value: '#93c' } });
    // #93c est une forme courte valide → développée pour le sélecteur natif.
    expect(colorPicker().value).toBe('#9933cc');
    fireEvent.change(hexField(), { target: { value: '#93' } });
    expect(colorPicker().value).toBe('#86efac');
  });

  test('la couleur choisie part dans le payload de création', async () => {
    renderPanel();
    await waitFor(() => expect(colorPicker()).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText(/Ex : Verger/), {
      target: { value: 'Verger' },
    });
    fireEvent.change(colorPicker(), { target: { value: '#fca5a5' } });
    api.mockClear();
    api.mockResolvedValue({ id: 'c1' });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(api).toHaveBeenCalled());
    const [path, method, payload] = api.mock.calls[0];
    expect(path).toBe('/api/map-categories');
    expect(method).toBe('POST');
    expect(payload.color).toBe('#fca5a590');
  });
});

describe('MapCategoriesPanel — réordonnancement', () => {
  const CATS = [
    {
      id: 'c1',
      label: 'Alpha',
      emoji: '🅰️',
      color: '#86efac90',
      sort_order: 0,
      applies_to: 'both',
      is_active: true,
    },
    {
      id: 'c2',
      label: 'Beta',
      emoji: '🅱️',
      color: '#fca5a590',
      sort_order: 1,
      applies_to: 'both',
      is_active: true,
    },
  ];

  beforeEach(() => {
    api.mockReset();
    api.mockImplementation(async (path) => {
      if (path === '/api/map-categories/manage') return CATS;
      return { ok: true };
    });
  });

  test('affiche les boutons monter/descendre et appelle reorder', async () => {
    const { onMessage } = renderPanel();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Descendre « Alpha »/ })).toBeTruthy(),
    );
    expect(screen.getByText(/Ordre 0/)).toBeTruthy();
    expect(screen.getByText(/Ordre 1/)).toBeTruthy();

    const down = screen.getByRole('button', { name: /Descendre « Alpha »/ });
    api.mockClear();
    api.mockImplementation(async (path) => {
      if (path === '/api/map-categories/manage') return CATS;
      if (path === '/api/map-categories/reorder') return { ok: true, category_ids: ['c2', 'c1'] };
      return { ok: true };
    });
    fireEvent.click(down);

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/map-categories/reorder', 'PUT', {
        category_ids: ['c2', 'c1'],
      }),
    );
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith('Ordre des catégories mis à jour'));
  });

  test('le premier ne peut pas monter, le dernier ne peut pas descendre', async () => {
    renderPanel();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Monter « Alpha »/ })).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: /Monter « Alpha »/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Descendre « Beta »/ })).toBeDisabled();
  });
});
