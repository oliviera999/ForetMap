// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

/**
 * Audit affichage / navigation du réseau trophique : la vue ne doit pas garder
 * de filtre ni de sélection périmés, et le clic sur une relation doit produire
 * un détail lisible à côté du graphe.
 */

const apiMock = vi.fn();
vi.mock('../../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
  getAuthToken: () => '',
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

vi.mock('../../../src/hooks/useGlossaryLinkIndex.js', () => ({
  useGlossaryLinkIndex: () => [],
  resetGlossaryLinkIndexCache: () => {},
}));

// Le graphe SVG est testé à part : ici on n'a besoin que du déclencheur de sélection.
vi.mock('../../../src/components/pedago/FoodWebGraph.jsx', () => ({
  FoodWebGraph: ({ items = [], onSelectEdge }) => (
    <ul data-testid="foodweb-graph">
      {items.map((row) => (
        <li key={row.id}>
          <button type="button" onClick={() => onSelectEdge?.(row.id)}>
            {`arête ${row.id}`}
          </button>
        </li>
      ))}
    </ul>
  ),
}));

import { FoodWebView } from '../../../src/components/pedago/FoodWebView.jsx';

const PREDATION = {
  id: 1,
  interaction_type: 'predation',
  from_id: 10,
  from_name: 'Renard',
  from_emoji: '🦊',
  to_id: 20,
  to_name: 'Lapin',
  to_emoji: '🐰',
  description: 'chasse au crépuscule',
};

const POLLINISATION = {
  id: 2,
  interaction_type: 'pollinisation',
  from_id: 30,
  from_name: 'Abeille',
  from_emoji: '🐝',
  to_id: 40,
  to_name: 'Pommier',
  to_emoji: '🍎',
  description: '',
};

function mockFoodWeb(byPath) {
  apiMock.mockImplementation((path) => {
    if (path.startsWith('/api/zones')) return Promise.resolve([]);
    if (path.startsWith('/api/plants')) return Promise.resolve([]);
    if (String(path).includes('/glossary')) return Promise.resolve({ terms: [] });
    for (const [prefix, items] of byPath) {
      if (String(path).startsWith(prefix)) return Promise.resolve({ items });
    }
    return Promise.resolve({ items: [] });
  });
}

beforeEach(() => {
  apiMock.mockReset();
});

describe('FoodWebView — détail de la relation sélectionnée', () => {
  it('affiche le type, le sens écologique et la description à côté du graphe', async () => {
    mockFoodWeb([['/api/food-web', [PREDATION]]]);
    const { container } = render(<FoodWebView />);

    await waitFor(() => expect(screen.getByText('arête 1')).toBeTruthy());
    fireEvent.click(screen.getByText('arête 1'));

    await waitFor(() =>
      expect(container.querySelector('.pedago-foodweb__selected-title')).toBeTruthy(),
    );
    expect(container.querySelector('.pedago-foodweb__selected-title').textContent).toMatch(
      /Prédation/,
    );
    // Sens écologique : la flèche va de la proie vers le prédateur.
    const sentence = container.querySelector('.pedago-foodweb__selected-sentence');
    expect(sentence.textContent).toMatch(/Lapin.*est mangée par.*Renard/);
    expect(screen.getByText(/chasse au crépuscule/)).toBeTruthy();

    // Le panneau est dans la colonne du graphe, pas dans la colonne latérale défilante.
    expect(
      container.querySelector('.pedago-foodweb__graph-column .pedago-foodweb__selected'),
    ).toBeTruthy();
    expect(container.querySelector('.pedago-foodweb__aside .pedago-foodweb__selected')).toBeNull();
  });

  it('abandonne la sélection quand la relation sort du jeu filtré', async () => {
    mockFoodWeb([['/api/food-web', [PREDATION, POLLINISATION]]]);
    const { container } = render(<FoodWebView />);

    await waitFor(() => expect(screen.getByText('arête 1')).toBeTruthy());
    fireEvent.click(screen.getByText('arête 1'));
    await waitFor(() => expect(container.querySelector('.pedago-foodweb__selected')).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Type d'interaction"), {
      target: { value: 'pollinisation' },
    });

    await waitFor(() => expect(container.querySelector('.pedago-foodweb__selected')).toBeNull());
  });
});

describe('FoodWebView — filtres périmés', () => {
  it('remet à zéro un type d’interaction absent de la nouvelle carte', async () => {
    mockFoodWeb([
      ['/api/food-web?mapId=m1', [POLLINISATION]],
      ['/api/food-web', [PREDATION, POLLINISATION]],
    ]);
    render(<FoodWebView maps={[{ id: 'm1', label: 'Forêt' }]} />);

    // Le menu est re-interrogé à chaque assertion : le composant se re-rend
    // plusieurs fois pendant les chargements.
    const typeSelect = () => screen.getByLabelText("Type d'interaction");

    await waitFor(() => expect(screen.getByText('arête 1')).toBeTruthy());
    fireEvent.change(typeSelect(), { target: { value: 'predation' } });
    await waitFor(() => expect(typeSelect().value).toBe('predation'));

    fireEvent.change(screen.getByLabelText('Carte'), { target: { value: 'm1' } });

    // La prédation n'existe plus sur cette carte : le filtre revient à « Tous »
    // au lieu d'afficher un menu vide et « Aucune interaction enregistrée ».
    await waitFor(() => expect(typeSelect().value).toBe(''));
    await waitFor(() => expect(screen.getByText('arête 2')).toBeTruthy());
  });
});

describe('FoodWebView — espèce mise en avant', () => {
  it('explique qu’une espèce sans interaction n’apparaît pas dans le réseau', async () => {
    mockFoodWeb([['/api/food-web', [PREDATION]]]);
    render(<FoodWebView highlightPlantId={999} />);

    await waitFor(() =>
      expect(screen.getByText(/aucune interaction enregistrée dans cette sélection/i)).toBeTruthy(),
    );
  });

  it('n’affiche pas ce message quand l’espèce est bien dans le réseau', async () => {
    mockFoodWeb([['/api/food-web', [PREDATION]]]);
    render(<FoodWebView highlightPlantId={10} />);

    await waitFor(() => expect(screen.getByText('arête 1')).toBeTruthy());
    expect(screen.queryByText(/aucune interaction enregistrée dans cette sélection/i)).toBeNull();
  });
});

describe('FoodWebView — modifier une relation', () => {
  it('propose l’édition au gestionnaire et envoie un PUT', async () => {
    mockFoodWeb([['/api/food-web', [PREDATION]]]);
    render(<FoodWebView canManage />);

    await waitFor(() => expect(screen.getByText('arête 1')).toBeTruthy());
    fireEvent.click(screen.getByText('arête 1'));
    await waitFor(() => expect(screen.getByText(/Modifier cette relation/)).toBeTruthy());

    fireEvent.click(screen.getByText(/Modifier cette relation/));
    const description = screen.getByDisplayValue('chasse au crépuscule');
    fireEvent.change(description, { target: { value: 'chasse à l’aube' } });
    fireEvent.click(screen.getByText('Enregistrer'));

    await waitFor(() => {
      const put = apiMock.mock.calls.find(([, method]) => method === 'PUT');
      expect(put).toBeTruthy();
      expect(put[0]).toBe('/api/food-web/interactions/1');
      expect(put[2]).toMatchObject({
        from_id: 10,
        to_id: 20,
        interaction_type: 'predation',
        description: 'chasse à l’aube',
      });
    });
  });

  it('n’expose pas l’édition à un élève', async () => {
    mockFoodWeb([['/api/food-web', [PREDATION]]]);
    const { container } = render(<FoodWebView />);

    await waitFor(() => expect(screen.getByText('arête 1')).toBeTruthy());
    fireEvent.click(screen.getByText('arête 1'));
    await waitFor(() => expect(container.querySelector('.pedago-foodweb__selected')).toBeTruthy());
    expect(screen.queryByText(/Modifier cette relation/)).toBeNull();
  });
});
