import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

/**
 * Niveau de la classe dans l'écran des groupes (décision du mainteneur du 25/09/2026,
 * question 5) : signalement des classes sans niveau, proposition tirée du nom — jamais
 * appliquée sans confirmation — et niveau envoyé à la création.
 */

const apiMock = vi.fn();

vi.mock('../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
  API: '',
  withAppBase: (p) => p,
  getAuthToken: () => null,
}));

import { GroupsAdminView } from '../../src/components/groups-views.jsx';

const GROUPS = [
  {
    id: 'unit6',
    name: '26#6',
    slug: 'unit6',
    kind: 'unit',
    is_active: true,
    parent_group_id: null,
    curriculum_niveau: 'cycle3',
    curriculum_niveau_effectif: 'cycle3',
    curriculum_niveau_herite_de: null,
    curriculum_niveau_manquant: false,
    curriculum_niveau_suggestion: null,
    members: [],
    scopes: [],
  },
  {
    id: 'c601',
    name: '26#601',
    slug: 'c601',
    kind: 'class',
    is_active: true,
    parent_group_id: 'unit6',
    curriculum_niveau: null,
    curriculum_niveau_effectif: 'cycle3',
    curriculum_niveau_herite_de: { id: 'unit6', name: '26#6' },
    curriculum_niveau_manquant: false,
    curriculum_niveau_suggestion: { niveau: 'cycle3', raison: 'deduit' },
    members: [],
    scopes: [],
  },
  {
    id: 'c5b',
    name: '5B',
    slug: 'c5b',
    kind: 'class',
    is_active: true,
    parent_group_id: null,
    curriculum_niveau: null,
    curriculum_niveau_effectif: null,
    curriculum_niveau_herite_de: null,
    curriculum_niveau_manquant: true,
    curriculum_niveau_suggestion: { niveau: 'cycle4', raison: 'deduit' },
    members: [],
    scopes: [],
  },
  {
    id: 'club',
    name: 'Club nature',
    slug: 'club',
    kind: 'club',
    is_active: true,
    parent_group_id: null,
    curriculum_niveau: null,
    curriculum_niveau_effectif: null,
    curriculum_niveau_herite_de: null,
    curriculum_niveau_manquant: false,
    curriculum_niveau_suggestion: null,
    members: [],
    scopes: [],
  },
];

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((path, method) => {
    if (path === '/api/groups' && (!method || method === 'GET')) {
      return Promise.resolve({ groups: GROUPS, can_manage: true, can_manage_default_role: true });
    }
    if (path === '/api/groups' && method === 'POST') return Promise.resolve({ id: 'new' });
    if (String(path).startsWith('/api/groups/') && method === 'PATCH') {
      return Promise.resolve({});
    }
    return Promise.resolve([]);
  });
});

describe('GroupsAdminView — niveau de la classe', () => {
  test('signale les classes sans niveau et affiche le niveau hérité', async () => {
    render(<GroupsAdminView />);
    const banner = await screen.findByTestId('groups-missing-niveau-banner');
    expect(banner.textContent).toMatch(/1 classe ou unité active n’a pas de niveau/);
    expect(screen.getByTestId('group-niveau-c5b').textContent).toMatch(/Niveau à renseigner/);
    expect(screen.getByTestId('group-niveau-c601').textContent).toMatch(
      /Cycle 3 \(CM1–6e\) \(hérité de « 26#6 »\)/,
    );
    expect(screen.getByTestId('group-niveau-unit6').textContent).toMatch(/Niveau : Cycle 3/);
    // Un club ne porte pas de niveau : rien à signaler.
    expect(screen.queryByTestId('group-niveau-club')).toBeNull();

    fireEvent.click(screen.getByTestId('groups-missing-niveau-filter'));
    await waitFor(() => expect(screen.queryByTestId('group-row-c601')).toBeNull());
    expect(screen.getByTestId('group-row-c5b')).toBeTruthy();
  });

  test('réglages : la proposition d’après le nom attend une confirmation', async () => {
    render(<GroupsAdminView />);
    const row = await screen.findByTestId('group-row-c5b');
    fireEvent.click(within(row).getByRole('button', { name: 'Réglages' }));
    const select = await screen.findByLabelText('Niveau de la classe');
    expect(select.value).toBe('');
    const hint = screen.getByTestId('group-curriculum-niveau-hint');
    expect(hint.textContent).toMatch(/niveau proposé : Cycle 4/);
    fireEvent.click(within(hint).getByRole('button', { name: 'Utiliser cette proposition' }));
    expect(select.value).toBe('cycle4');
    // Rien n'est envoyé tant que le professeur n'enregistre pas.
    expect(apiMock.mock.calls.some(([, method]) => method === 'PATCH')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(
        apiMock.mock.calls.some(
          ([path, method, body]) =>
            path === '/api/groups/c5b' &&
            method === 'PATCH' &&
            body?.curriculum_niveau === 'cycle4',
        ),
      ).toBe(true),
    );
  });

  test('création : niveau pré-rempli d’après le nom, modifiable, envoyé', async () => {
    render(<GroupsAdminView />);
    fireEvent.click(await screen.findByRole('button', { name: '+ Nouveau groupe' }));
    const dialog = await screen.findByRole('dialog', { name: 'Créer un groupe' });
    fireEvent.change(within(dialog).getByPlaceholderText('ex. 2nde A'), {
      target: { value: '2nde B' },
    });
    const select = within(dialog).getByLabelText('Niveau de la classe');
    expect(select.value).toBe('seconde');
    expect(within(dialog).getByTestId('group-create-niveau-hint').textContent).toMatch(
      /Correspond au nom du groupe/,
    );
    // Un choix manuel n'est plus écrasé par la suite de la saisie.
    fireEvent.change(select, { target: { value: 'universite' } });
    fireEvent.change(within(dialog).getByPlaceholderText('ex. 2nde A'), {
      target: { value: '2nde B club' },
    });
    expect(select.value).toBe('universite');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));
    await waitFor(() =>
      expect(
        apiMock.mock.calls.some(
          ([path, method, body]) =>
            path === '/api/groups' && method === 'POST' && body?.curriculum_niveau === 'universite',
        ),
      ).toBe(true),
    );
  });

  test('création d’un club : pas de niveau proposé', async () => {
    render(<GroupsAdminView />);
    fireEvent.click(await screen.findByRole('button', { name: '+ Nouveau groupe' }));
    const dialog = await screen.findByRole('dialog', { name: 'Créer un groupe' });
    fireEvent.change(within(dialog).getByDisplayValue('Classe'), { target: { value: 'club' } });
    fireEvent.change(within(dialog).getByPlaceholderText('ex. 2nde A'), {
      target: { value: 'Club 3D' },
    });
    expect(within(dialog).getByLabelText('Niveau de la classe').value).toBe('');
    expect(within(dialog).getByTestId('group-create-niveau-hint').textContent).toMatch(
      /Équipe ou club/,
    );
  });
});
