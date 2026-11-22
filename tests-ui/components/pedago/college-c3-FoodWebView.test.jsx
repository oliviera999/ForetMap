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
  FoodWebGraph: ({
    items = [],
    highlightPlantIds = null,
    focusRequest = null,
    preset = null,
    nodeClickMode = 'isolate',
    onToggleSelection = null,
  }) => (
    <div>
      <ul
        data-testid="foodweb-graph"
        data-highlight={(highlightPlantIds || []).join(',')}
        data-focus={focusRequest ? `${focusRequest.ids.join(',')}@${focusRequest.depth}` : ''}
        data-click-mode={nodeClickMode}
        data-preset={preset || ''}
      >
        {items.map((row) => (
          <li key={row.id}>{`arête ${row.id}`}</li>
        ))}
      </ul>
      {onToggleSelection ? (
        <button type="button" onClick={() => onToggleSelection(1)}>
          panneau : basculer Trèfle
        </button>
      ) : null}
    </div>
  ),
}));

import { FoodWebView } from '../../../src/components/pedago/FoodWebView.jsx';
import { DataProvider } from '../../../src/contexts/DataContext.jsx';

const CYCLE3_TYPES = [
  'pollinisation',
  'herbivorie',
  'predation',
  'frugivorie',
  'granivorie',
  'decomposition',
];

function context({ college, cycle4 = false }) {
  if (!college) return { canShow: () => true, foodWebTypes: (all) => all };
  const hidden = new Set(['foodweb_full_by_default', 'foodweb_advanced', 'pollination_efficacy']);
  const allowed = [...CYCLE3_TYPES, ...(cycle4 ? ['symbiose', 'competition', 'mutualisme'] : [])];
  return {
    canShow: (key) => !hidden.has(key),
    // Table de visibilité du collège (chantier du 22/11/2026) : cadrage « Tout ».
    visibility: (key) => (key === 'foodweb_default_preset' ? 'all' : 'show'),
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
  r(5, 'predation', 3, 'Renard', 6, 'Poule', {
    to_in_scope: 0,
    to_elsewhere: [{ id: 'sablettes', label: 'Sablettes' }],
  }),
  r(6, 'competition', 7, 'Moineau', 4, 'Merle'),
  r(7, 'pollinisation', 8, 'Abeille', 5, 'Mûrier'),
  r(8, 'mutualisme', 2, 'Lapin', 1, 'Trèfle'),
];

function mockApi({ featured = [], speciesMaps = {} } = {}) {
  apiMock.mockImplementation((path) => {
    const p = String(path);
    const m = p.match(/^\/api\/food-web\/species\/(\d+)\/maps$/);
    if (m) return Promise.resolve({ maps: speciesMaps[m[1]] || [] });
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
      <FoodWebView
        maps={[
          { id: 'foret', label: 'Forêt' },
          { id: 'n3', label: 'n3' },
        ]}
        initialMapId="foret"
        {...props}
      />
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
  window.sessionStorage.clear();
});

describe('réseau trophique — 6e (cycle 3)', () => {
  beforeEach(() => {
    pedago.current = context({ college: true });
  });

  it('pas de réseau complet : puces à bascule, espèces phares en tête, hors carte proposé', async () => {
    mockApi({ featured: [3] });
    renderView();
    await screen.findByText('Choisis les espèces à observer');
    expect(screen.queryByTestId('foodweb-graph')).toBeNull();
    await screen.findByText('Espèces phares de la carte');
    const featured = screen.getByRole('list', { name: 'Espèces phares de la carte' });
    expect(within(featured).getByRole('button', { name: 'Renard' })).toBeTruthy();
    // Espèce hors carte : choisissable, avec sa mention (décision 1 du 22/11/2026).
    const poule = within(screen.getByRole('list', { name: 'Autres espèces' })).getByRole('button', {
      name: /Poule/,
    });
    expect(poule.textContent).toContain('vit sur une autre carte');
  });

  it('composer en trois clics, retirer d’un clic, depuis la liste comme depuis le graphe', async () => {
    mockApi({ featured: [3] });
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Renard' }));
    await screen.findByTestId('foodweb-graph');
    expect(screen.getByTestId('foodweb-graph').dataset.clickMode).toBe('panel');
    fireEvent.change(screen.getByLabelText('Ajouter une espèce'), { target: { value: 'lap' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lapin' }));
    fireEvent.click(screen.getByRole('button', { name: 'panneau : basculer Trèfle' }));
    const bar = screen.getByRole('group', { name: 'Ma sélection' });
    expect(
      within(bar)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Renard', 'Lapin', 'Trèfle']);
    expect(screen.getByTestId('foodweb-graph').dataset.highlight).toBe('3,2,1');
    fireEvent.click(screen.getByRole('button', { name: 'Retirer Lapin de la sélection' }));
    expect(screen.getByTestId('foodweb-graph').dataset.highlight).toBe('3,1');
    fireEvent.click(screen.getByRole('button', { name: 'panneau : basculer Trèfle' }));
    expect(screen.getByTestId('foodweb-graph').dataset.highlight).toBe('3');
    fireEvent.click(screen.getByRole('button', { name: 'Tout retirer' }));
    await screen.findByText('Choisis les espèces à observer');
  });

  it('profondeur : voisins directs puis la chaîne ; hors carte gardé (grisé)', async () => {
    mockApi({ featured: [3] });
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Renard' }));
    await screen.findByTestId('foodweb-graph');
    expect(graphItems().sort()).toEqual(['arête 2', 'arête 5']);
    expect(
      screen.getByRole('button', { name: 'Leurs voisins directs' }).getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'La chaîne autour' }));
    expect(graphItems().sort()).toEqual(['arête 1', 'arête 2', 'arête 5']);
  });

  it('liste : libellés en verbe, mention « vit ailleurs » ; compétition masquée en 6e', async () => {
    mockApi();
    renderView({ highlightPlantId: 3 });
    await screen.findByTestId('foodweb-graph');
    fireEvent.change(screen.getByLabelText('Affichage'), { target: { value: 'list' } });
    await screen.findByText('vit ailleurs : Sablettes');
    expect(screen.queryByText(/compétition/i)).toBeNull();
  });

  it('espèce dont les relations sont réservées au cycle 4 : on le dit, la barre reste', async () => {
    mockApi();
    renderView({ highlightPlantId: 7 });
    await screen.findByText(/ses relations ne sont pas dans ce cadrage ou à ton niveau/);
    expect(screen.queryByTestId('foodweb-graph')).toBeNull();
    expect(screen.getByRole('group', { name: 'Ma sélection' })).toBeTruthy();
  });

  it('arrivée depuis une fiche : la sélection contient l’espèce', async () => {
    mockApi();
    renderView({ highlightPlantId: 2 });
    await screen.findByTestId('foodweb-graph');
    expect(graphItems().sort()).toEqual(['arête 1', 'arête 2']);
    expect(screen.getByRole('group', { name: 'Ma sélection' }).textContent).toContain('Lapin');
  });

  it('séance : plantIds pré-sélectionnés, liens entre mes espèces seulement', async () => {
    mockApi();
    session.current = { foodWebRequest: { plantIds: [2, 3], mapId: 'foret', nonce: 1 } };
    renderView();
    await screen.findByTestId('foodweb-graph');
    expect(graphItems()).toEqual(['arête 2']);
    expect(
      screen
        .getByRole('button', { name: 'Seulement les liens entre mes espèces' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });
});

describe('réseau trophique — 6e : cadrage, séance, « Pour aller plus loin », carte', () => {
  beforeEach(() => {
    pedago.current = context({ college: true });
  });

  it('cadrage « Tout » par défaut : la pollinisation est montrée d’emblée', async () => {
    mockApi();
    renderView({ highlightPlantId: 8 });
    await screen.findByTestId('foodweb-graph');
    expect(screen.getByTestId('foodweb-graph').dataset.preset).toBe('all');
    expect(graphItems()).toEqual(['arête 7']);
  });

  it('séance : le preset de l’étape s’applique', async () => {
    mockApi();
    session.current = {
      foodWebRequest: { plantIds: [3], preset: 'alimentaire', mapId: 'foret', nonce: 3 },
    };
    renderView();
    await screen.findByTestId('foodweb-graph');
    expect(screen.getByTestId('foodweb-graph').dataset.preset).toBe('alimentaire');
  });

  it('« Pour aller plus loin » : réseau complet, puis retour au réseau simplifié', async () => {
    mockApi();
    renderView({ highlightPlantId: 2 });
    await screen.findByTestId('foodweb-graph');
    expect(graphItems()).not.toContain('arête 8');
    fireEvent.click(screen.getByRole('button', { name: 'Pour aller plus loin' }));
    expect(graphItems()).toEqual(expect.arrayContaining(['arête 4', 'arête 6', 'arête 8']));
    expect(screen.getByTestId('foodweb-graph').dataset.clickMode).toBe('isolate');
    fireEvent.click(screen.getByRole('button', { name: 'Revenir au réseau simplifié' }));
    expect(graphItems().sort()).toEqual(['arête 1', 'arête 2']);
    expect(screen.getByTestId('foodweb-graph').dataset.preset).toBe('all');
    expect(screen.getByRole('group', { name: 'Ma sélection' }).textContent).toContain('Lapin');
  });

  it('fiche → réseau : s’ouvre sur une carte où l’espèce vit', async () => {
    mockApi({ speciesMaps: { 2: [{ id: 'n3', label: 'n3' }] } });
    renderView({ highlightPlantId: 2 });
    await screen.findByTestId('foodweb-graph');
    await vi.waitFor(() => expect(apiMock).toHaveBeenCalledWith('/api/food-web?mapId=n3'));
  });

  it('fiche → réseau : carte active gardée quand l’espèce y vit', async () => {
    mockApi({ speciesMaps: { 2: [{ id: 'n3' }, { id: 'foret' }] } });
    renderView({ highlightPlantId: 2 });
    await screen.findByTestId('foodweb-graph');
    await vi.waitFor(() => expect(apiMock).toHaveBeenCalledWith('/api/food-web/species/2/maps'));
    expect(apiMock).not.toHaveBeenCalledWith('/api/food-web?mapId=n3');
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
    // Décision 8 du 22/11/2026 : mutualisme montré à partir du cycle 4.
    fireEvent.change(screen.getByLabelText('Affichage'), { target: { value: 'graph' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tout retirer' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Lapin' }));
    fireEvent.change(screen.getByLabelText('Affichage'), { target: { value: 'list' } });
    await screen.findByRole('heading', { name: 's’entraident (mutualisme)' });
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
