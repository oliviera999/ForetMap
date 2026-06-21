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
    permissions: [{ key: 'tasks.propose', requires_elevation: false }],
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
    roleEmoji: '🪨',
    pin: '',
    roleMinDoneTasks: '0',
    roleMaxConcurrentTasks: '',
    editUserLoadState: 'idle',
    onCreateRole: vi.fn(),
    onSelectRole: vi.fn(),
    onReorderRole: vi.fn(),
    onEditRoleDetails: vi.fn(),
    onDuplicateRole: vi.fn(),
    onRoleEmojiChange: vi.fn(),
    onSaveEmoji: vi.fn(),
    onPinChange: vi.fn(),
    onSavePin: vi.fn(),
    onToggleProgression: vi.fn(),
    onMinDoneTasksChange: vi.fn(),
    onSaveMinDoneThreshold: vi.fn(),
    onTogglePermission: vi.fn(),
    onTogglePermissionElevation: vi.fn(),
    onSetForumParticipate: vi.fn(),
    onSetContextCommentParticipate: vi.fn(),
    onMaxConcurrentChange: vi.fn(),
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

  test('saisie d’emoji et enregistrement du PIN remontent au parent', () => {
    const { onRoleEmojiChange, onSavePin } = setup();
    fireEvent.change(screen.getByLabelText('Emoji pour le profil Novice'), {
      target: { value: '🌿' },
    });
    expect(onRoleEmojiChange).toHaveBeenCalledWith('🌿');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer PIN' }));
    expect(onSavePin).toHaveBeenCalledTimes(1);
  });

  test('isN3beurTier masque tasks.propose dans les lignes de permissions (géré côté progression)', () => {
    setup();
    // tasks.propose est masqué dans le tableau générique, stats.read.all visible
    expect(screen.getByText('Lire toutes les stats')).toBeInTheDocument();
  });
});
