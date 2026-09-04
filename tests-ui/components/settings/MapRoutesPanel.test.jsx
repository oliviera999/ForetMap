import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { MapRoutesPanel } from '../../../src/components/settings/MapRoutesPanel.jsx';

const api = vi.fn(async () => []);
const downloadApiFile = vi.fn(async () => {});

vi.mock('../../../src/services/api.js', () => ({
  api: (...args) => api(...args),
}));

vi.mock('../../../src/utils/downloadApiFile.js', () => ({
  downloadApiFile: (...args) => downloadApiFile(...args),
}));

const MAPS = [{ id: 'lyautey', label: 'Lycée Lyautey', is_active: true }];

const ZONES = [{ id: 'z1', map_id: 'lyautey', name: 'Cour d’honneur', category_ids: [] }];
const MARKERS = [
  { id: 'm1', map_id: 'lyautey', label: 'Accueil', search_aliases: 'loge;secrétariat' },
];
const CATEGORIES = [{ id: 'c1', label: 'Bâtiments' }];

const ROUTE = {
  id: 'r1',
  map_id: 'lyautey',
  slug: 'portes-ouvertes',
  title: 'Portes ouvertes',
  description: '',
  audience: 'Familles',
  surfaces: ['plan'],
  is_published: true,
  sort_order: 10,
  steps: [{ position: 0, target_type: 'marker', target_id: 'm1', step_title: '', step_text: '' }],
};

/** Aiguillage des charges lues par le panneau (parcours + les trois listes de lieux). */
function routeApi(routes = []) {
  return async (path) => {
    if (path.startsWith('/api/map-routes/manage')) return routes;
    if (path === '/api/zones') return ZONES;
    if (path === '/api/map/markers') return MARKERS;
    if (path === '/api/map-categories') return CATEGORIES;
    return {};
  };
}

function renderPanel(props = {}) {
  const onError = vi.fn();
  const onMessage = vi.fn();
  const utils = render(
    <MapRoutesPanel maps={MAPS} onError={onError} onMessage={onMessage} {...props} />,
  );
  return { onError, onMessage, ...utils };
}

describe('MapRoutesPanel', () => {
  beforeEach(() => {
    api.mockReset();
    downloadApiFile.mockReset();
    api.mockImplementation(routeApi([ROUTE]));
  });

  test('charge les parcours de la première carte active', async () => {
    renderPanel();
    await screen.findByText('Portes ouvertes');
    expect(api).toHaveBeenCalledWith('/api/map-routes/manage?map_id=lyautey');
    expect(screen.getByText(/Publié · 1 étape · plan · Familles/)).toBeTruthy();
  });

  test('la recherche de lieux trouve un repère par son alias', async () => {
    renderPanel();
    await screen.findByText('Portes ouvertes');
    fireEvent.change(screen.getByLabelText('Ajouter un lieu'), { target: { value: 'loge' } });
    expect(await screen.findByRole('button', { name: /Accueil/ })).toBeTruthy();
  });

  test('ajouter un lieu crée une étape nommée d’après le lieu', async () => {
    renderPanel();
    await screen.findByText('Portes ouvertes');
    fireEvent.change(screen.getByLabelText('Ajouter un lieu'), { target: { value: 'cour' } });
    fireEvent.click(await screen.findByRole('button', { name: /Cour d’honneur/ }));
    expect(screen.getByLabelText('Titre de l’étape 1')).toBeTruthy();
    // Le nom du lieu tient lieu de libellé tant que l'étape n'a pas de titre propre.
    expect(screen.getByText('Cour d’honneur')).toBeTruthy();
  });

  test('les boutons ↑ ↓ réordonnent les étapes au clavier', async () => {
    renderPanel();
    await screen.findByText('Portes ouvertes');
    const search = screen.getByLabelText('Ajouter un lieu');
    fireEvent.change(search, { target: { value: 'cour' } });
    fireEvent.click(await screen.findByRole('button', { name: /Cour d’honneur/ }));
    fireEvent.change(search, { target: { value: 'accueil' } });
    fireEvent.click(await screen.findByRole('button', { name: /\+ Accueil/ }));

    const before = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(before[0]).toContain('Cour d’honneur');
    fireEvent.click(screen.getByLabelText('Descendre l’étape 1'));
    const after = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(after[0]).toContain('Accueil');
  });

  test('enregistrer envoie les étapes dans l’ordre affiché', async () => {
    renderPanel();
    await screen.findByText('Portes ouvertes');
    fireEvent.change(screen.getByLabelText('Titre *'), { target: { value: 'Le tour' } });
    fireEvent.change(screen.getByLabelText('Ajouter un lieu'), { target: { value: 'cour' } });
    fireEvent.click(await screen.findByRole('button', { name: /Cour d’honneur/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Créer le parcours' }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/api/map-routes',
        'POST',
        expect.objectContaining({
          title: 'Le tour',
          map_id: 'lyautey',
          steps: [{ target_type: 'zone', target_id: 'z1', step_title: '', step_text: '' }],
        }),
      ),
    );
  });

  test('un titre vide est refusé sans appel réseau', async () => {
    const { onError } = renderPanel();
    await screen.findByText('Portes ouvertes');
    api.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Créer le parcours' }));
    expect(onError).toHaveBeenCalledWith('Titre requis');
    expect(api).not.toHaveBeenCalledWith('/api/map-routes', 'POST', expect.anything());
  });

  test('éditer un parcours recharge son brouillon', async () => {
    renderPanel();
    await screen.findByText('Portes ouvertes');
    fireEvent.click(screen.getByRole('button', { name: 'Éditer' }));
    expect(screen.getByLabelText('Titre *').value).toBe('Portes ouvertes');
    expect(screen.getByLabelText('Identifiant du lien').value).toBe('portes-ouvertes');
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeTruthy();
  });

  test('l’affiche PDF passe par le téléchargement authentifié', async () => {
    renderPanel();
    await screen.findByText('Portes ouvertes');
    fireEvent.click(screen.getByRole('button', { name: 'Affiche PDF' }));
    await waitFor(() =>
      expect(downloadApiFile).toHaveBeenCalledWith(
        '/api/map-routes/r1/pdf',
        'parcours-portes-ouvertes.pdf',
      ),
    );
  });

  test('sans parcours, le panneau le dit', async () => {
    api.mockImplementation(routeApi([]));
    renderPanel();
    expect(await screen.findByText('Aucun parcours sur cette carte pour l’instant.')).toBeTruthy();
  });
});
