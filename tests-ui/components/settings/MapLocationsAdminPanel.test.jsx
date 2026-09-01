import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../../src/services/api', () => ({ api: vi.fn(() => Promise.resolve([])) }));

import { api } from '../../../src/services/api';
import { MapLocationsAdminPanel } from '../../../src/components/settings/MapLocationsAdminPanel.jsx';

const MAPS = [
  { id: 'foret', label: 'Forêt' },
  { id: 'potager', label: 'Potager' },
];

const CATEGORIES = [
  { id: 'c1', label: 'Verger', applies_to: 'both', map_id: null, is_active: true },
  { id: 'c2', label: 'Salles', applies_to: 'both', map_id: 'potager', is_active: true },
];

const PLANTS = [
  { id: 1, name: 'Pommier', emoji: '🍎' },
  { id: 2, name: 'Sauge', emoji: '🌿' },
];

const ZONES = [
  {
    id: 'z1',
    map_id: 'foret',
    name: '🌳 Butte aux pommiers',
    description: 'Butte plantée en 2023',
    species: [{ id: '1', name: 'Pommier' }],
    living_beings_list: ['Pommier'],
    categories: [{ id: 'c1', label: 'Verger' }],
    category_ids: ['c1'],
  },
  {
    id: 'z2',
    map_id: 'potager',
    name: 'Carré des aromatiques',
    description: '',
    species: [],
    living_beings_list: [],
    categories: [],
    category_ids: [],
  },
];

const MARKERS = [
  {
    id: 'm1',
    map_id: 'foret',
    label: 'Ruches',
    emoji: '🐝',
    note: 'Trois ruches actives',
    x_pct: 10,
    y_pct: 20,
    species: [],
    living_beings_list: [],
    categories: [],
    category_ids: [],
  },
];

/** GET des quatre ressources + PUT/DELETE echo (item fusionné avec le corps). */
function mockApiData({ zones = ZONES, markers = MARKERS } = {}) {
  api.mockImplementation((path, method, body) => {
    if (method === 'PUT') {
      const id = decodeURIComponent(path.split('/').pop());
      const source = path.includes('/markers/') ? markers : zones;
      const item = source.find((it) => String(it.id) === id) || { id };
      return Promise.resolve({ ...item, ...body, id });
    }
    if (method === 'DELETE') return Promise.resolve({ ok: true });
    if (path === '/api/zones') return Promise.resolve(zones);
    if (path === '/api/map/markers') return Promise.resolve(markers);
    if (path === '/api/plants') return Promise.resolve(PLANTS);
    if (path === '/api/map-categories') return Promise.resolve(CATEGORIES);
    return Promise.resolve([]);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiData();
});

describe('MapLocationsAdminPanel (grille à édition directe)', () => {
  test('liste zones et repères, compteur, champs directement éditables', async () => {
    render(<MapLocationsAdminPanel maps={MAPS} />);
    expect(await screen.findByText('2 zone(s) · 1 repère(s)')).toBeTruthy();
    // Les noms sont des champs de saisie, pas du texte statique.
    expect(screen.getByLabelText('Nom de Butte aux pommiers').value).toBe('Butte aux pommiers');
    expect(screen.getByLabelText('Nom de Ruches').value).toBe('Ruches');
    expect(screen.getByLabelText('Description de Ruches').value).toBe('Trois ruches actives');
  });

  test('renommer une zone : blur → PUT du nom recomposé avec son emoji', async () => {
    const onMessage = vi.fn();
    render(<MapLocationsAdminPanel maps={MAPS} onMessage={onMessage} />);
    const input = await screen.findByLabelText('Nom de Butte aux pommiers');
    fireEvent.change(input, { target: { value: 'Butte aux poiriers' } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/zones/z1', 'PUT', {
        name: '🌳 Butte aux poiriers',
      }),
    );
    expect(onMessage).toHaveBeenCalledWith('Zone mise à jour');
  });

  test('un blur sans modification ne déclenche aucun enregistrement', async () => {
    render(<MapLocationsAdminPanel maps={MAPS} />);
    const input = await screen.findByLabelText('Nom de Ruches');
    api.mockClear();
    fireEvent.blur(input);
    expect(api).not.toHaveBeenCalled();
  });

  test('pastille de catégorie : un clic pose/retire la catégorie', async () => {
    render(<MapLocationsAdminPanel maps={MAPS} />);
    await screen.findByLabelText('Nom de Ruches');
    // Le repère (carte Forêt) ne voit que la catégorie globale « Verger ».
    const chips = screen.getAllByRole('button', { name: 'Verger', pressed: false });
    fireEvent.click(chips[chips.length - 1]);
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/map/markers/m1', 'PUT', { category_ids: ['c1'] }),
    );
  });

  test('ajout d’une espèce par le champ à suggestions', async () => {
    render(<MapLocationsAdminPanel maps={MAPS} />);
    await screen.findByLabelText('Nom de Butte aux pommiers');
    const input = screen.getByLabelText('Ajouter une espèce (Butte aux pommiers)');
    fireEvent.change(input, { target: { value: 'Sauge' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/zones/z1', 'PUT', {
        living_beings: ['Pommier', 'Sauge'],
      }),
    );
  });

  test('action par lot : ajouter une catégorie aux lieux sélectionnés (doublon ignoré)', async () => {
    const onMessage = vi.fn();
    render(<MapLocationsAdminPanel maps={MAPS} onMessage={onMessage} />);
    await screen.findByLabelText('Nom de Ruches');
    fireEvent.click(screen.getByLabelText(/Tout sélectionner/));
    fireEvent.change(screen.getByLabelText('Action par lot'), {
      target: { value: 'add_category' },
    });
    fireEvent.change(screen.getByLabelText('Catégorie du lot'), { target: { value: 'c1' } });
    // z1 porte déjà c1 → 2 lieux concernés sur 3 sélectionnés.
    const apply = screen.getByRole('button', { name: 'Appliquer (2 concerné(s))' });
    fireEvent.click(apply);
    await waitFor(() =>
      expect(onMessage).toHaveBeenCalledWith(
        '2 lieu(x) mis à jour · 1 déjà conforme(s) ou non concerné(s)',
      ),
    );
    expect(api).toHaveBeenCalledWith('/api/zones/z2', 'PUT', { category_ids: ['c1'] });
    expect(api).toHaveBeenCalledWith('/api/map/markers/m1', 'PUT', { category_ids: ['c1'] });
  });

  test('rechercher / remplacer par lot sur les noms', async () => {
    render(<MapLocationsAdminPanel maps={MAPS} />);
    await screen.findByLabelText('Nom de Ruches');
    fireEvent.click(screen.getByLabelText(/Tout sélectionner/));
    fireEvent.change(screen.getByLabelText('Action par lot'), {
      target: { value: 'find_replace' },
    });
    fireEvent.change(screen.getByLabelText('Texte à rechercher'), {
      target: { value: 'aromatiques' },
    });
    fireEvent.change(screen.getByLabelText('Texte de remplacement'), {
      target: { value: 'simples' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer (1 concerné(s))' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/zones/z2', 'PUT', { name: 'Carré des simples' }),
    );
  });

  test('suppression par lot : confirmation puis DELETE et retrait de la liste', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    render(<MapLocationsAdminPanel maps={MAPS} />);
    await screen.findByLabelText('Nom de Ruches');
    fireEvent.click(screen.getByLabelText('Sélectionner Ruches'));
    fireEvent.change(screen.getByLabelText('Action par lot'), { target: { value: 'delete' } });
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer (1 concerné(s))' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/api/map/markers/m1', 'DELETE'));
    await waitFor(() => expect(screen.queryByLabelText('Nom de Ruches')).toBeNull());
    expect(confirm).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  test('textes visite : édition directe dans le dépliant « Visite & détails »', async () => {
    render(<MapLocationsAdminPanel maps={MAPS} />);
    await screen.findByLabelText('Nom de Ruches');
    fireEvent.click(screen.getAllByRole('button', { name: '▸ Visite & détails' })[2]);
    const sub = screen.getByLabelText('Sous-titre visite de Ruches');
    fireEvent.change(sub, { target: { value: 'Nos abeilles' } });
    fireEvent.blur(sub);
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/map/markers/m1', 'PUT', {
        visit_subtitle: 'Nos abeilles',
      }),
    );
  });
});
