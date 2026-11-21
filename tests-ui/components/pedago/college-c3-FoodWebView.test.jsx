// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

/**
 * Chantier collège (flux C3) : réseau trophique borné. Le profil collège est simulé en
 * mockant le contexte (la table de visibilité rend encore le comportement actuel tant que C1
 * n'a pas rempli le profil collège).
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

const pedago = { current: null };
vi.mock('../../../src/contexts/BiodivPedagoContext.jsx', () => ({
  useBiodivPedago: () => pedago.current,
}));

const session = { current: null };
vi.mock('../../../src/contexts/PedagoSessionContext.jsx', () => ({
  usePedagoSessionContext: () => session.current,
}));

vi.mock('../../../src/components/pedago/FoodWebGraph.jsx', () => ({
  FoodWebGraph: ({ items = [], highlightPlantIds = null, focusRequest = null }) => (
    <ul
      data-testid="foodweb-graph"
      data-highlight={(highlightPlantIds || []).join(',')}
      data-focus={focusRequest ? `${focusRequest.ids.join(',')}@${focusRequest.depth}` : ''}
    >
      {items.map((row) => (
        <li key={row.id}>{`arête ${row.id}`}</li>
      ))}
    </ul>
  ),
}));

import { FoodWebView } from '../../../src/components/pedago/FoodWebView.jsx';
import { DataProvider } from '../../../src/contexts/DataContext.jsx';

const CYCLE3_TYPES = ['herbivorie', 'predation', 'frugivorie', 'granivorie', 'decomposition'];

function context({ college, cycle4 = false }) {
  if (!college) return { canShow: () => true, foodWebTypes: (all) => all };
  const hidden = new Set([
    'foodweb_full_by_default',
    'foodweb_offmap_species',
    'foodweb_advanced',
    'pollination_efficacy',
  ]);
  const allowed = [...CYCLE3_TYPES, ...(cycle4 ? ['symbiose', 'competition'] : [])];
  return {
    canShow: (key) => !hidden.has(key),
    foodWebTypes: (all) => all.filter((t) => allowed.includes(t)),
  };
}

const r = (id, type, from, fromName, to, toName, scope = {}) => ({
  id,
  interaction_type: type,
  from_id: from,
  from_name: fromName,
  from_emoji: '',
  to_id: to,
  to_name: toName,
  to_emoji: '',
  description: '',
  from_in_scope: 1,
  to_in_scope: 1,
  ...scope,
});

// Chaîne : Trèfle (1) ← Lapin (2) ← Renard (3) ; Merle (4) mange des fruits du Mûrier (5) ;
// Lapin et Merle « en symbiose » (cycle 4) ; Renard → Poule hors carte (6).
const ITEMS = [
  r(1, 'herbivorie', 2, 'Lapin', 1, 'Trèfle'),
  r(2, 'predation', 3, 'Renard', 2, 'Lapin'),
  r(3, 'frugivorie', 4, 'Merle', 5, 'Mûrier'),
  r(4, 'competition', 2, 'Lapin', 4, 'Merle'),
  r(5, 'predation', 3, 'Renard', 6, 'Poule', { to_in_scope: 0 }),
];

function mockApi({ featured = [] } = {}) {
  apiMock.mockImplementation((path) => {
    const p = String(path);
    if (p.startsWith('/api/zones')) return Promise.resolve([]);
    if (p.startsWith('/api/maps/')) {
      return Promise.resolve({
        species: featured.map((id) => ({ plant_id: id, is_featured: true })),
      });
    }
    if (p.includes('/glossary')) return Promise.resolve({ terms: [] });
    if (p.startsWith('/api/food-web')) return Promise.resolve({ items: ITEMS });
    return Promise.resolve([]);
  });
}

function renderView(props = {}) {
  return render(
    <DataProvider value={{ plants: [] }}>
      <FoodWebView maps={[{ id: 'foret', label: 'Forêt' }]} initialMapId="foret" {...props} />
    </DataProvider>,
  );
}

const graphItems = () =>
  within(screen.getByTestId('foodweb-graph'))
    .queryAllByRole('listitem')
    .map((li) => li.textContent);

beforeEach(() => {
  apiMock.mockReset();
  session.current = null;
});

describe('réseau trophique — 6e (cycle 3)', () => {
  beforeEach(() => {
    pedago.current = context({ college: true });
  });

  it('pas de réseau complet : choix de l’espèce de départ, espèces phares en tête', async () => {
    mockApi({ featured: [3] });
    renderView();
    await screen.findByText('Choisis une espèce de départ');
    expect(screen.queryByTestId('foodweb-graph')).toBeNull();
    await screen.findByText('Espèces phares de la carte');
    const featuredList = screen.getByText('Espèces phares de la carte').nextElementSibling;
    expect(within(featuredList).getByRole('button', { name: 'Renard' })).toBeTruthy();
    // Espèce hors carte jamais proposée.
    expect(screen.queryByRole('button', { name: 'Poule' })).toBeNull();
  });

  it('profondeur 1 puis 2, espèces hors carte masquées', async () => {
    mockApi({ featured: [3] });
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Renard' }));
    await screen.findByTestId('foodweb-graph');
    expect(graphItems()).toEqual(['arête 2']);
    expect(screen.getByTestId('foodweb-graph').dataset.highlight).toBe('3');
    fireEvent.click(screen.getByRole('button', { name: 'Chaîne' }));
    expect(graphItems().sort()).toEqual(['arête 1', 'arête 2']);
    expect(graphItems()).not.toContain('arête 5');
    fireEvent.click(screen.getByRole('button', { name: /Changer d.espèce/ }));
    await screen.findByText('Choisis une espèce de départ');
  });

  it('recherche ; libellés en verbe dans la liste ; compétition masquée en 6e', async () => {
    mockApi();
    renderView();
    const search = await screen.findByLabelText('Chercher une espèce');
    fireEvent.change(search, { target: { value: 'murier' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Mûrier' }));
    fireEvent.change(screen.getByLabelText('Affichage'), { target: { value: 'list' } });
    await screen.findByText('mange des fruits (frugivorie)');
    expect(screen.queryByText(/compétition/i)).toBeNull();
  });

  it('espèce mise en avant sans lien montré : message clair, pas de graphe vide', async () => {
    mockApi();
    // La Poule n'a qu'un lien, vers une espèce… sur la carte, mais elle-même est hors carte.
    renderView({ highlightPlantId: 6 });
    await screen.findByText(/des relations existent, mais aucune n.est montrée ici/);
    expect(screen.queryByTestId('foodweb-graph')).toBeNull();
    expect(screen.getByText('Choisis une espèce de départ')).toBeTruthy();
  });

  it('arrivée depuis une fiche : le réseau s’ouvre sur l’espèce', async () => {
    mockApi();
    renderView({ highlightPlantId: 2 });
    await screen.findByTestId('foodweb-graph');
    expect(graphItems().sort()).toEqual(['arête 1', 'arête 2']);
    expect(screen.getByText(/Départ/).textContent).toContain('Lapin');
  });

  it('séance : plantIds montrés à profondeur 0 (liens mutuels seulement)', async () => {
    mockApi();
    session.current = { foodWebRequest: { plantIds: [2, 3], mapId: 'foret', nonce: 1 } };
    renderView();
    await screen.findByTestId('foodweb-graph');
    expect(graphItems()).toEqual(['arête 2']);
    expect(screen.getByRole('button', { name: 'Sélection' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});

describe('réseau trophique — 3e (cycle 4)', () => {
  it('la compétition apparaît, avec son verbe', async () => {
    pedago.current = context({ college: true, cycle4: true });
    mockApi();
    renderView({ highlightPlantId: 4 });
    await screen.findByTestId('foodweb-graph');
    fireEvent.click(screen.getByRole('button', { name: 'Tout' }));
    fireEvent.change(screen.getByLabelText('Affichage'), { target: { value: 'list' } });
    await screen.findByRole('heading', { name: 'est en concurrence avec (compétition)' });
  });
});

describe('réseau trophique — lycée', () => {
  it('réseau complet d’emblée, hors carte compris, libellés savants', async () => {
    pedago.current = context({ college: false });
    mockApi();
    renderView();
    await screen.findByTestId('foodweb-graph');
    expect(screen.queryByText('Choisis une espèce de départ')).toBeNull();
    expect(graphItems().sort()).toEqual(['arête 1', 'arête 2', 'arête 3', 'arête 5']);
  });

  it('séance avec plantIds : le graphe isole les espèces demandées', async () => {
    pedago.current = context({ college: false });
    session.current = { foodWebRequest: { plantIds: [2, 3], mapId: 'foret', nonce: 7 } };
    mockApi();
    renderView();
    await screen.findByTestId('foodweb-graph');
    expect(screen.getByTestId('foodweb-graph').dataset.focus).toBe('2,3@0');
  });
});
