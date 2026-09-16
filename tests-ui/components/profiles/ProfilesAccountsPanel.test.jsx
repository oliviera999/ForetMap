import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ProfilesAccountsPanel } from '../../../src/components/profiles/ProfilesAccountsPanel.jsx';

vi.mock('../../../src/components/profiles/CreateUserPanel.jsx', () => ({
  CreateUserPanel: () => null,
}));

const ROLES = [
  { id: 1, display_name: 'Admin', slug: 'admin' },
  { id: 2, display_name: 'Novice', slug: 'eleve_novice' },
  { id: 3, display_name: 'Avancé', slug: 'eleve_avance' },
];

const USERS = [
  {
    id: 's1',
    user_type: 'student',
    display_name: 'Ana Blin',
    role_id: 2,
    role_slug: 'eleve_novice',
    groups: [{ id: 'g1', name: '2nde B', kind: 'class', role_in_group: 'member' }],
  },
  {
    id: 's2',
    user_type: 'student',
    display_name: 'Bob Carr',
    role_id: null,
    role_slug: null,
    groups: [],
  },
  {
    id: 't1',
    user_type: 'teacher',
    display_name: 'Zoe Dupin',
    role_id: 1,
    role_slug: 'admin',
    groups: [],
  },
];

function setup(overrides = {}) {
  const props = {
    roles: ROLES,
    users: USERS,
    canManageProfiles: true,
    canManageGroups: true,
    isAdmin: true,
    groupOptions: [{ id: 'g1', name: '2nde B' }],
    setErr: vi.fn(),
    setMsg: vi.fn(),
    onAssignRole: vi.fn().mockResolvedValue(undefined),
    onBulkAssignRole: vi.fn().mockResolvedValue(undefined),
    onBulkAddToGroup: vi.fn().mockResolvedValue(undefined),
    onDeleteUser: vi.fn(),
    onDuplicateUser: vi.fn().mockResolvedValue(undefined),
    onOpenEditUser: vi.fn(),
    ...overrides,
  };
  render(<ProfilesAccountsPanel {...props} />);
  return props;
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('ProfilesAccountsPanel — liste unique (P1)', () => {
  test('une seule liste, avec ses actions : plus de second panneau de suppression', () => {
    setup({ canDeleteUi: true, canDuplicateStudents: true });
    expect(screen.queryByText(/Suppression de/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Supprimer Ana Blin')).toBeInTheDocument();
    expect(screen.getByLabelText('Dupliquer Ana Blin')).toBeInTheDocument();
  });

  test('supprimer remonte la ligne au parent (confirmation gérée en amont)', () => {
    const { onDeleteUser } = setup({ canDeleteUi: true });
    fireEvent.click(screen.getByLabelText('Supprimer Ana Blin'));
    expect(onDeleteUser).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
  });
});

describe('ProfilesAccountsPanel — filtres, tri et état vide (P6, P7, P8, P10)', () => {
  test('P10 — chaque filtre porte un libellé visible', () => {
    setup();
    expect(screen.getByLabelText('Rechercher')).toBeInTheDocument();
    expect(screen.getByLabelText('Profil')).toBeInTheDocument();
    expect(screen.getByLabelText('Type de compte')).toBeInTheDocument();
    expect(screen.getByLabelText('Groupe')).toBeInTheDocument();
    expect(screen.getByLabelText('Trier par')).toBeInTheDocument();
  });

  test('P7 — les filtres sont écrits dans l’URL', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'ana' } });
    await waitFor(() => expect(window.location.search).toContain('q=ana'));
  });

  test('P7 — l’URL initiale préremplit les filtres', () => {
    window.history.replaceState(null, '', '/?q=bob');
    setup();
    expect(screen.getByLabelText('Rechercher')).toHaveValue('bob');
    expect(screen.getByText('Bob Carr')).toBeInTheDocument();
    expect(screen.queryByText('Ana Blin')).not.toBeInTheDocument();
  });

  test('P8 — zéro résultat : message et bouton pour effacer les filtres', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'zzzz' } });
    const empty = screen.getByTestId('accounts-empty');
    expect(empty).toHaveTextContent('Aucun compte ne correspond à ces filtres.');
    fireEvent.click(within(empty).getByRole('button', { name: 'Effacer les filtres' }));
    expect(screen.getByText('Ana Blin')).toBeInTheDocument();
  });

  test('P6 — le tri « sans profil d’abord » remonte les comptes sans profil', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Trier par'), { target: { value: 'no-role' } });
    const names = screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'));
    expect(names[0]).toBe('Sélectionner Bob Carr');
  });

  test('le résumé rappelle le total quand un filtre est actif', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Type de compte'), { target: { value: 'student' } });
    expect(screen.getByTestId('accounts-page-summary')).toHaveTextContent('1–2 sur 2 (3 au total)');
  });
});

describe('ProfilesAccountsPanel — confirmation des profils sensibles (P3)', () => {
  test('un profil ordinaire s’applique directement', async () => {
    const { onAssignRole } = setup();
    fireEvent.change(screen.getByLabelText('Profil de Ana Blin'), { target: { value: '3' } });
    await waitFor(() => expect(onAssignRole).toHaveBeenCalledWith(expect.anything(), 3));
    expect(screen.queryByText('Attribuer un profil sensible ?')).not.toBeInTheDocument();
  });

  test('passer un compte en admin demande une confirmation', async () => {
    const { onAssignRole } = setup();
    fireEvent.change(screen.getByLabelText('Profil de Ana Blin'), { target: { value: '1' } });
    expect(onAssignRole).not.toHaveBeenCalled();
    expect(screen.getByText('Attribuer un profil sensible ?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(onAssignRole).toHaveBeenCalledWith(expect.anything(), 1));
  });

  test('annuler la confirmation n’écrit rien', () => {
    const { onAssignRole } = setup();
    fireEvent.change(screen.getByLabelText('Profil de Ana Blin'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onAssignRole).not.toHaveBeenCalled();
    expect(screen.queryByText('Attribuer un profil sensible ?')).not.toBeInTheDocument();
  });

  test('retirer un profil sensible est confirmé aussi', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Profil de Zoe Dupin'), { target: { value: '2' } });
    expect(screen.getByText('Retirer un profil sensible ?')).toBeInTheDocument();
  });
});

describe('ProfilesAccountsPanel — actions en lot (P2)', () => {
  test('la barre n’apparaît qu’avec une sélection', () => {
    setup();
    expect(screen.queryByTestId('accounts-bulk-bar')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Sélectionner Ana Blin'));
    expect(screen.getByTestId('accounts-bulk-bar')).toHaveTextContent('1 sélectionné');
  });

  test('attribution groupée d’un profil ordinaire : un seul appel pour toute la sélection', async () => {
    const { onBulkAssignRole } = setup();
    fireEvent.click(screen.getByLabelText('Sélectionner Ana Blin'));
    fireEvent.click(screen.getByLabelText('Sélectionner Bob Carr'));
    fireEvent.change(screen.getByLabelText('Attribuer le profil'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    await waitFor(() => expect(onBulkAssignRole).toHaveBeenCalledTimes(1));
    expect(onBulkAssignRole.mock.calls[0][0].map((u) => u.id)).toEqual(['s1', 's2']);
    expect(onBulkAssignRole.mock.calls[0][1]).toBe(3);
  });

  test('un lot qui touche un profil sensible passe par la confirmation', async () => {
    const { onBulkAssignRole } = setup();
    fireEvent.click(screen.getByLabelText('Sélectionner Ana Blin'));
    fireEvent.change(screen.getByLabelText('Attribuer le profil'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    expect(onBulkAssignRole).not.toHaveBeenCalled();
    expect(screen.getByText('Attribuer un profil sensible ?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(onBulkAssignRole).toHaveBeenCalledTimes(1));
  });

  test('rattachement groupé : seuls les élèves sont envoyés', async () => {
    const { onBulkAddToGroup } = setup();
    fireEvent.click(screen.getByLabelText('Sélectionner Ana Blin'));
    fireEvent.click(screen.getByLabelText('Sélectionner Zoe Dupin'));
    fireEvent.change(screen.getByLabelText('Rattacher au groupe'), { target: { value: 'g1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rattacher' }));
    await waitFor(() => expect(onBulkAddToGroup).toHaveBeenCalledTimes(1));
    expect(onBulkAddToGroup.mock.calls[0][0].map((u) => u.id)).toEqual(['s1']);
  });

  test('une sélection sans élève ne part pas en rattachement', async () => {
    const { onBulkAddToGroup, setErr } = setup();
    fireEvent.click(screen.getByLabelText('Sélectionner Zoe Dupin'));
    fireEvent.change(screen.getByLabelText('Rattacher au groupe'), { target: { value: 'g1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rattacher' }));
    await waitFor(() => expect(setErr).toHaveBeenCalled());
    expect(onBulkAddToGroup).not.toHaveBeenCalled();
  });

  test('« tout sélectionner » porte sur les comptes filtrés, pas sur la page', () => {
    setup();
    fireEvent.click(screen.getByLabelText('Sélectionner Ana Blin'));
    fireEvent.click(screen.getByRole('button', { name: /tout sélectionner \(3\)/ }));
    expect(screen.getByTestId('accounts-bulk-bar')).toHaveTextContent('3 sélectionnés');
  });

  test('sans droit sur les groupes, le rattachement groupé n’est pas proposé', () => {
    setup({ canManageGroups: false });
    fireEvent.click(screen.getByLabelText('Sélectionner Ana Blin'));
    expect(screen.queryByLabelText('Rattacher au groupe')).not.toBeInTheDocument();
  });
});

describe('ProfilesAccountsPanel — retour d’information sur la ligne (P4)', () => {
  test('succès : la ligne modifiée le dit elle-même', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Profil de Ana Blin'), { target: { value: '3' } });
    await waitFor(() => expect(screen.getByText('Profil enregistré')).toBeInTheDocument());
  });

  test('échec : le message d’erreur de l’API est rendu sur la ligne', async () => {
    setup({ onAssignRole: vi.fn().mockRejectedValue(new Error('Dernier administrateur')) });
    fireEvent.change(screen.getByLabelText('Profil de Ana Blin'), { target: { value: '3' } });
    await waitFor(() => expect(screen.getByText('Dernier administrateur')).toBeInTheDocument());
  });
});
