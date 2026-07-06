import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfilesRbacAdminSection } from '../../../src/components/profiles/ProfilesRbacAdminSection.jsx';

const ROLES = [
  { id: 1, slug: 'admin', display_name: 'Admin', emoji: '🛡️', display_order: 0, permissions: [] },
  {
    id: 2,
    slug: 'eleve_novice',
    display_name: 'Novice',
    emoji: '🪨',
    display_order: 1,
    min_done_tasks: 0,
    permissions: [{ key: 'tasks.propose' }],
  },
];

const CATALOG = [
  { key: 'tasks.propose', label: 'Proposer des tâches' },
  { key: 'stats.read.all', label: 'Lire toutes les stats' },
];

const USERS = [{ user_type: 'student', id: 11, display_name: 'Léa Martin', role_id: 2 }];

function setup(overrides = {}) {
  const props = {
    roles: ROLES,
    catalog: CATALOG,
    users: USERS,
    loading: false,
    roleTerms: { studentSingular: 'n3beur', studentPlural: 'n3beurs' },
    selectedRole: ROLES[1],
    selectedRoleId: 2,
    canEditRoleDefinition: true,
    isAdmin: true,
    isN3beurTier: true,
    progressionByTasksEnabled: true,
    tasksProposeEntry: ROLES[1].permissions[0],
    editUserLoadState: 'idle',
    onCreateRole: vi.fn(),
    onSelectRole: vi.fn(),
    onReorderRole: vi.fn(),
    onEditRoleDetails: vi.fn(),
    onDuplicateRole: vi.fn(),
    onSaveEmoji: vi.fn(),
    onToggleProgression: vi.fn(),
    onSaveMinDoneThreshold: vi.fn(),
    onTogglePermission: vi.fn(),
    onSetForumParticipate: vi.fn(),
    onSetContextCommentParticipate: vi.fn(),
    onSaveMaxConcurrent: vi.fn(),
    onAssignRole: vi.fn(),
    onOpenEditUser: vi.fn(),
    ...overrides,
  };
  render(<ProfilesRbacAdminSection {...props} />);
  return props;
}

describe('ProfilesRbacAdminSection', () => {
  test('rend la liste des profils, la config rapide, les permissions et l’attribution', () => {
    setup();
    expect(screen.getByRole('button', { name: '🛡️ Admin' })).toBeInTheDocument();
    expect(screen.getByLabelText('Emoji pour le profil Novice')).toBeInTheDocument(); // config rapide
    expect(screen.getByRole('heading', { name: 'Permissions' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Attribution des profils' })).toBeInTheDocument();
    expect(screen.getByText('Léa Martin')).toBeInTheDocument();
  });

  test('les champs d’édition sont initialisés depuis le profil sélectionné (useRoleEditFields)', () => {
    setup();
    expect(screen.getByLabelText('Emoji pour le profil Novice').value).toBe('🪨');
  });

  test('sans profil sélectionné : invite à choisir, pas de config rapide ni de lignes de permissions', () => {
    setup({ selectedRole: null, selectedRoleId: null, tasksProposeEntry: null });
    expect(screen.getByText('Choisis un profil dans la liste.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Emoji pour le profil/)).not.toBeInTheDocument();
    expect(screen.queryByText('Proposer des tâches')).not.toBeInTheDocument();
    // L'attribution reste affichée
    expect(screen.getByRole('heading', { name: 'Attribution des profils' })).toBeInTheDocument();
  });

  test('handlers de la liste des profils câblés (sélection, création)', () => {
    const { onSelectRole, onCreateRole } = setup();
    fireEvent.click(screen.getByRole('button', { name: '🛡️ Admin' }));
    expect(onSelectRole).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: '+ Créer un profil' }));
    expect(onCreateRole).toHaveBeenCalledTimes(1);
  });

  test('saisie d’emoji (état interne) puis enregistrement : onSaveEmoji reçoit la valeur saisie', () => {
    const { onSaveEmoji } = setup();
    const input = screen.getByLabelText('Emoji pour le profil Novice');
    fireEvent.change(input, { target: { value: '🌿' } });
    expect(input.value).toBe('🌿');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer l’emoji' }));
    expect(onSaveEmoji).toHaveBeenCalledWith('🌿');
  });

  test('aucun champ PIN de profil (élévation supprimée)', () => {
    setup();
    expect(screen.queryByPlaceholderText('Nouveau PIN')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enregistrer PIN' })).toBeNull();
  });

  test('isN3beurTier masque tasks.propose dans les lignes de permissions (géré côté progression)', () => {
    setup();
    // tasks.propose est masqué dans le tableau générique, stats.read.all visible
    expect(screen.getByText('Lire toutes les stats')).toBeInTheDocument();
  });
});
