import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

/**
 * Groupes emboîtés au collège (chantier collège, flux C4) : arbre réduit (`profile=college`)
 * quand la brique `nested_groups_full_tree` est masquée, « Pour aller plus loin » vers l'arbre
 * complet, correction alignée sur l'arbre réduit. Profil simulé par le contexte (fiche § 2).
 */

const apiMock = vi.fn();
vi.mock('../../../src/services/api', () => ({
  getAuthToken: () => 'jeton-test',
  withAppBase: (path) => path,
  api: (...args) => apiMock(...args),
}));

import { NestedGroupsView } from '../../../src/components/pedago/NestedGroupsView.jsx';
import {
  BiodivPedagoContext,
  useBiodivPedago,
} from '../../../src/contexts/BiodivPedagoContext.jsx';

const REDUCED_TREE = {
  id: 'vivant',
  name: 'Êtres vivants',
  shared_attribute: 'Naissent, grandissent',
  children: [
    { id: 'oiseaux', name: 'Oiseaux', shared_attribute: 'Plumes', children: [], plants: [] },
  ],
  plants: [],
};
const FULL_TREE = {
  id: 'amniotes',
  name: 'Amniotes',
  shared_attribute: 'Œuf amniotique',
  children: [
    { id: 'sauropsides', name: 'Sauropsides', shared_attribute: '—', children: [], plants: [] },
  ],
  plants: [],
};
const PLANTS = [
  { id: 1, name: 'Mésange', emoji: null, clade_id: 'oiseaux' },
  { id: 2, name: 'Hérisson', emoji: null, clade_id: 'vivant' },
];

function withProfile(canShowFullTree, ui) {
  function Wrapper({ children }) {
    const base = useBiodivPedago();
    const value = {
      ...base,
      canShow: (feature) => (feature === 'nested_groups_full_tree' ? canShowFullTree : true),
    };
    return <BiodivPedagoContext.Provider value={value}>{children}</BiodivPedagoContext.Provider>;
  }
  return render(<Wrapper>{ui}</Wrapper>);
}

function routeApi() {
  apiMock.mockImplementation(async (url, method, body) => {
    if (url === '/api/clades') return { items: [] };
    if (url === '/api/clades/activity/subtree') {
      const reduced = body?.profile === 'college';
      return {
        tree: reduced ? REDUCED_TREE : FULL_TREE,
        collapsed: reduced,
        plants: PLANTS,
        cladeOptions: reduced
          ? [
              { id: 'vivant', name: 'Êtres vivants' },
              { id: 'oiseaux', name: 'Oiseaux' },
            ]
          : [
              { id: 'amniotes', name: 'Amniotes' },
              { id: 'sauropsides', name: 'Sauropsides' },
            ],
      };
    }
    if (url === '/api/clades/activity/check') {
      return { results: [], correctCount: 2, total: 2, allCorrect: true };
    }
    return {};
  });
}

const activity = { nonce: 1, plantIds: [1, 2] };

describe('NestedGroupsView — arbre réduit au collège', () => {
  beforeEach(() => {
    apiMock.mockReset();
    routeApi();
  });

  test('collège : demande l’arbre réduit et ne propose que les boîtes visibles', async () => {
    withProfile(false, <NestedGroupsView activityRequest={activity} />);
    await screen.findByText('Place chaque espèce dans son groupe');
    const call = apiMock.mock.calls.find(([url]) => url === '/api/clades/activity/subtree');
    expect(call[2]).toEqual({ plantIds: [1, 2], profile: 'college' });
    const select = screen.getByLabelText('Groupe pour Mésange');
    const labels = [...select.querySelectorAll('option')].map((o) => o.textContent);
    expect(labels).toEqual(['Choisir…', 'Êtres vivants', 'Oiseaux']);
    expect(screen.getByRole('button', { name: 'Pour aller plus loin' })).toBeInTheDocument();
  });

  test('« Pour aller plus loin » reconstruit l’activité sur l’arbre complet, et retour', async () => {
    withProfile(false, <NestedGroupsView activityRequest={activity} />);
    await screen.findByRole('button', { name: 'Pour aller plus loin' });
    fireEvent.click(screen.getByRole('button', { name: 'Pour aller plus loin' }));
    await screen.findByRole('button', { name: 'Revenir aux grands groupes' });
    const subtreeCalls = apiMock.mock.calls.filter(
      ([url]) => url === '/api/clades/activity/subtree',
    );
    expect(subtreeCalls.at(-1)[2]).toEqual({ plantIds: [1, 2] });
    await waitFor(() => {
      const labels = [
        ...screen.getByLabelText('Groupe pour Mésange').querySelectorAll('option'),
      ].map((o) => o.textContent);
      expect(labels).toContain('Sauropsides');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Revenir aux grands groupes' }));
    await screen.findByRole('button', { name: 'Pour aller plus loin' });
    expect(
      apiMock.mock.calls.filter(([url]) => url === '/api/clades/activity/subtree').at(-1)[2],
    ).toEqual({ plantIds: [1, 2], profile: 'college' });
  });

  test('la correction d’une activité réduite envoie profile=college', async () => {
    withProfile(false, <NestedGroupsView activityRequest={activity} />);
    await screen.findByText('Place chaque espèce dans son groupe');
    fireEvent.click(screen.getByRole('button', { name: 'Corriger' }));
    await screen.findByText(/2\/2 correct/);
    const check = apiMock.mock.calls.find(([url]) => url === '/api/clades/activity/check');
    expect(check[2].profile).toBe('college');
  });

  test('lycée : arbre complet, sans bouton ni paramètre (comportement historique)', async () => {
    withProfile(true, <NestedGroupsView activityRequest={activity} />);
    await screen.findByText('Place chaque espèce dans son groupe');
    const call = apiMock.mock.calls.find(([url]) => url === '/api/clades/activity/subtree');
    expect(call[2]).toEqual({ plantIds: [1, 2] });
    expect(screen.queryByRole('button', { name: 'Pour aller plus loin' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Corriger' }));
    await screen.findByText(/2\/2 correct/);
    const check = apiMock.mock.calls.find(([url]) => url === '/api/clades/activity/check');
    expect(check[2].profile).toBeUndefined();
  });
});
