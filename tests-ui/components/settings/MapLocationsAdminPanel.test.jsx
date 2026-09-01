import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../../src/services/api', () => ({ api: vi.fn(() => Promise.resolve([])) }));

import { api } from '../../../src/services/api';
import { MapLocationsAdminPanel } from '../../../src/components/settings/MapLocationsAdminPanel.jsx';

const MAPS = [
  { id: 'foret', label: 'Forêt' },
  { id: 'potager', label: 'Potager' },
];

const ZONES = [
  {
    id: 'z1',
    map_id: 'foret',
    name: '🌳 Butte aux pommiers',
    description: 'Butte plantée en 2023',
    species: [{ id: '1', name: 'Pommier' }],
    categories: [{ id: 'c1', label: 'Verger' }],
  },
  {
    id: 'z2',
    map_id: 'potager',
    name: 'Carré des aromatiques',
    description: '',
    species: [],
    categories: [],
  },
];

const MARKERS = [
  {
    id: 'm1',
    map_id: 'foret',
    label: 'Ruches',
    emoji: '🐝',
    note: 'Trois ruches actives',
    species: [],
    categories: [],
  },
];

/** Répartit les fixtures selon l'URL demandée par le panneau. */
function mockApiData({ zones = ZONES, markers = MARKERS } = {}) {
  api.mockImplementation((path) => {
    if (path === '/api/zones') return Promise.resolve(zones);
    if (path === '/api/map/markers') return Promise.resolve(markers);
    return Promise.resolve({});
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiData();
});

describe('MapLocationsAdminPanel', () => {
  test('liste zones et repères avec compteur, carte et catégories', async () => {
    render(<MapLocationsAdminPanel maps={MAPS} />);
    expect(await screen.findByText('Butte aux pommiers')).toBeTruthy();
    expect(screen.getByText('Carré des aromatiques')).toBeTruthy();
    expect(screen.getByText('Ruches')).toBeTruthy();
    expect(screen.getByText('2 zone(s) · 1 repère(s)')).toBeTruthy();
    // Sous-titre : type, carte, catégories et nombre d'espèces.
    expect(screen.getByText(/Zone · Forêt · Verger · 1 espèce\(s\)/)).toBeTruthy();
    expect(screen.getByText(/Repère · Forêt/)).toBeTruthy();
  });

  test('la recherche libre filtre par nom, espèce ou note', async () => {
    render(<MapLocationsAdminPanel maps={MAPS} />);
    await screen.findByText('Butte aux pommiers');

    fireEvent.change(screen.getByLabelText('Recherche'), { target: { value: 'ruches' } });
    expect(screen.queryByText('Butte aux pommiers')).toBeNull();
    expect(screen.getByText('Ruches')).toBeTruthy();
    expect(screen.getByText('0 zone(s) · 1 repère(s)')).toBeTruthy();

    // Une espèce d'une zone est indexée comme sur la carte.
    fireEvent.change(screen.getByLabelText('Recherche'), { target: { value: 'pommier' } });
    expect(screen.getByText('Butte aux pommiers')).toBeTruthy();
    expect(screen.queryByText('Ruches')).toBeNull();
  });

  test('les filtres type et carte restreignent la liste', async () => {
    render(<MapLocationsAdminPanel maps={MAPS} />);
    await screen.findByText('Butte aux pommiers');

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'zones' } });
    expect(screen.queryByText('Ruches')).toBeNull();
    expect(screen.getByText('2 zone(s) · 0 repère(s)')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Carte'), { target: { value: 'potager' } });
    expect(screen.queryByText('Butte aux pommiers')).toBeNull();
    expect(screen.getByText('Carré des aromatiques')).toBeTruthy();
  });

  test('édition rapide d’une zone : PUT partiel nom + description puis rechargement', async () => {
    const onMessage = vi.fn();
    render(<MapLocationsAdminPanel maps={MAPS} onMessage={onMessage} />);
    await screen.findByText('Carré des aromatiques');

    // Ouvre l'éditeur de la 2e zone (liste triée : Butte, Carré, Ruches).
    fireEvent.click(screen.getAllByRole('button', { name: 'Modifier' })[1]);
    fireEvent.change(screen.getByLabelText('Nom *'), {
      target: { value: 'Carré des simples' },
    });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Renommé pour l’inventaire' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/zones/z2', 'PUT', {
        name: 'Carré des simples',
        description: 'Renommé pour l’inventaire',
      }),
    );
    expect(onMessage).toHaveBeenCalledWith('Zone mise à jour');
  });

  test('édition rapide d’un repère : PUT libellé + emoji + note', async () => {
    render(<MapLocationsAdminPanel maps={MAPS} />);
    await screen.findByText('Ruches');

    fireEvent.click(screen.getAllByRole('button', { name: 'Modifier' })[2]);
    fireEvent.change(screen.getByLabelText('Libellé *'), { target: { value: 'Rucher' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Quatre ruches' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/map/markers/m1', 'PUT', {
        label: 'Rucher',
        emoji: '🐝',
        note: 'Quatre ruches',
      }),
    );
  });

  test('un nom de zone vidé est refusé sans appel réseau', async () => {
    const onError = vi.fn();
    render(<MapLocationsAdminPanel maps={MAPS} onError={onError} />);
    await screen.findByText('Butte aux pommiers');

    fireEvent.click(screen.getAllByRole('button', { name: 'Modifier' })[0]);
    fireEvent.change(screen.getByLabelText('Nom *'), { target: { value: '   ' } });
    api.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(onError).toHaveBeenCalledWith('Nom requis');
    expect(api).not.toHaveBeenCalled();
  });
});
