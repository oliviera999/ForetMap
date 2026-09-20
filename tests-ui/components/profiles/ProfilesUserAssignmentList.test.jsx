import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ProfilesUserAssignmentList } from '../../../src/components/profiles/ProfilesUserAssignmentList.jsx';

const USERS = [
  {
    user_type: 'student',
    id: 's1',
    display_name: 'Léa',
    role_id: 3,
    role_slug: 'eleve_novice',
    groups: [{ id: 'g1', name: '2nde B', kind: 'class' }],
  },
  {
    user_type: 'teacher',
    id: 't1',
    display_name: 'Prof X',
    role_id: 2,
    role_slug: 'admin',
    groups: [],
  },
];
const ROLES = [
  { id: 2, display_name: 'Admin' },
  { id: 3, display_name: 'Novice' },
];

function setup(overrides = {}) {
  const props = {
    users: USERS,
    roles: ROLES,
    loading: false,
    isAdmin: false,
    onAssignRole: vi.fn(),
    onOpenEditUser: vi.fn(),
    onDeleteUser: vi.fn(),
    onDuplicateUser: vi.fn(),
    ...overrides,
  };
  render(<ProfilesUserAssignmentList {...props} />);
  return props;
}

describe('ProfilesUserAssignmentList', () => {
  test('rend une ligne par utilisateur (nom + type) avec sélecteur de profil', () => {
    setup();
    expect(screen.getByText('Léa')).toBeInTheDocument();
    expect(screen.getByText('Élève')).toBeInTheDocument();
    expect(screen.getByLabelText('Profil de Léa')).toHaveValue('3');
    expect(screen.getByLabelText('Profil de Prof X')).toHaveValue('2');
  });

  test('chaque ligne montre le rattachement groupes (ou son absence)', () => {
    setup();
    expect(screen.getByText('2nde B')).toBeInTheDocument();
    expect(screen.getByTestId('user-groups-empty')).toHaveTextContent('Aucun groupe');
  });

  test('au-delà de 3 groupes, la ligne résume le surplus par un compteur', () => {
    setup({
      users: [
        {
          ...USERS[0],
          groups: ['A', 'B', 'C', 'D'].map((n) => ({
            id: `g-${n}`,
            name: n,
            kind: 'class',
          })),
        },
      ],
    });
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.queryByText('D')).not.toBeInTheDocument();
  });

  test('changer le profil remonte l’utilisateur et la valeur choisie', () => {
    const { onAssignRole } = setup();
    fireEvent.change(screen.getByLabelText('Profil de Léa'), { target: { value: '2' } });
    expect(onAssignRole).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), '2');
  });

  test('non-admin ne peut ni modifier ni reclasser un admin', () => {
    setup({ isAdmin: false });
    expect(screen.getByLabelText('Modifier Léa')).not.toBeDisabled();
    expect(screen.getByLabelText('Modifier Prof X')).toBeDisabled();
    expect(screen.getByLabelText('Profil de Prof X')).toBeDisabled();
  });

  test('admin peut modifier un admin ; clic appelle onOpenEditUser', () => {
    const { onOpenEditUser } = setup({ isAdmin: true });
    expect(screen.getByLabelText('Modifier Prof X')).not.toBeDisabled();
    fireEvent.click(screen.getByLabelText('Modifier Léa'));
    expect(onOpenEditUser).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
  });

  test('P1 — supprimer et dupliquer sont des actions de ligne, réservées aux élèves', () => {
    const { onDeleteUser, onDuplicateUser } = setup({ canDelete: true, canDuplicate: true });
    fireEvent.click(screen.getByLabelText('Supprimer Léa'));
    expect(onDeleteUser).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
    fireEvent.click(screen.getByLabelText('Dupliquer Léa'));
    expect(onDuplicateUser).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
    // Un compte enseignant n'expose aucune de ces deux actions.
    expect(screen.queryByLabelText('Supprimer Prof X')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Dupliquer Prof X')).not.toBeInTheDocument();
  });

  test('sans les permissions, ni Supprimer ni Dupliquer ne sont rendus', () => {
    setup({ canDelete: false, canDuplicate: false });
    expect(screen.queryByLabelText('Supprimer Léa')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Dupliquer Léa')).not.toBeInTheDocument();
  });

  test('P2 — les cases à cocher n’apparaissent que si le parent gère la sélection', () => {
    const onToggleSelect = vi.fn();
    setup({ onToggleSelect, selectedKeys: new Set(['student:s1']) });
    const box = screen.getByLabelText('Sélectionner Léa');
    expect(box).toBeChecked();
    expect(screen.getByLabelText('Sélectionner Prof X')).not.toBeChecked();
    fireEvent.click(screen.getByLabelText('Sélectionner Prof X'));
    expect(onToggleSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
  });

  test('sélection non gérée → aucune case à cocher', () => {
    setup({ onToggleSelect: undefined });
    expect(screen.queryByLabelText('Sélectionner Léa')).not.toBeInTheDocument();
  });

  test('P9 — seule la ligne occupée est désactivée, pas toute la page', () => {
    setup({ isAdmin: true, busyKeys: new Set(['student:s1']) });
    expect(screen.getByLabelText('Modifier Léa')).toBeDisabled();
    expect(screen.getByLabelText('Modifier Prof X')).not.toBeDisabled();
  });

  test('P4 — le statut s’affiche sur la ligne concernée, avec le bon rôle ARIA', () => {
    setup({
      rowStatus: new Map([
        ['student:s1', { state: 'done', message: 'Profil enregistré' }],
        ['teacher:t1', { state: 'error', message: 'Refusé' }],
      ]),
    });
    expect(screen.getByText('Profil enregistré')).toHaveAttribute('role', 'status');
    expect(screen.getByText('Refusé')).toHaveAttribute('role', 'alert');
  });

  test('les statistiques fusionnées s’affichent quand elles existent (P1)', () => {
    setup({ users: [{ ...USERS[0], stats: { done: 4, pending: 2 } }] });
    expect(screen.getByText(/4 validée\(s\) · 2 en cours/)).toBeInTheDocument();
  });

  test('« Aucun profil » n’est plus proposé comme choix (le serveur ne retire pas un profil)', () => {
    setup({ users: [{ ...USERS[0], role_id: null, assigned_role_id: null }] });
    const select = screen.getByLabelText('Profil de Léa');
    expect(select).toHaveValue('');
    const empty = screen.getByRole('option', { name: 'Aucun profil' });
    expect(empty).toBeDisabled();
    // Un compte qui a un profil ne voit même pas l'option.
    cleanup();
    setup();
    expect(screen.queryByRole('option', { name: 'Aucun profil' })).not.toBeInTheDocument();
  });

  test('sans droit d’attribution, le sélecteur de profil est en lecture seule', () => {
    setup({ canAssignRoles: false });
    expect(screen.getByLabelText('Profil de Léa')).toBeDisabled();
    expect(screen.getByLabelText('Modifier Léa')).not.toBeDisabled();
  });

  test('le sélecteur porte le profil attribué ; le profil effectif conféré est rappelé', () => {
    setup({
      users: [
        {
          ...USERS[0],
          assigned_role_id: 3,
          assigned_role_display_name: 'Novice',
          role_id: 2,
          role_display_name: 'Admin',
        },
      ],
    });
    expect(screen.getByLabelText('Profil de Léa')).toHaveValue('3');
    expect(screen.getByTestId('user-effective-s1')).toHaveTextContent(
      'Profil effectif : Admin (attribué : Novice)',
    );
  });

  test('un compte désactivé porte un badge « désactivé »', () => {
    setup({ users: [{ ...USERS[0], is_active: false }, USERS[1]] });
    expect(screen.getByTestId('user-inactive-s1')).toHaveTextContent('désactivé');
    expect(screen.queryByTestId('user-inactive-t1')).not.toBeInTheDocument();
  });
});
