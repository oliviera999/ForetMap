import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfilesRoleList } from '../../../src/components/profiles/ProfilesRoleList.jsx';

const ROLES = [
  { id: 1, display_name: 'Admin', emoji: '🛡️', display_order: 0 },
  { id: 2, display_name: 'n3boss', emoji: '', display_order: 1 },
  { id: 3, display_name: 'Novice', emoji: '🪨', display_order: 2 },
];

function setup(overrides = {}) {
  const props = {
    roles: ROLES,
    loading: false,
    selectedRoleId: 2,
    canEditRoleDefinition: true,
    onCreate: vi.fn(),
    onSelect: vi.fn(),
    onReorder: vi.fn(),
    onEditDetails: vi.fn(),
    onDuplicate: vi.fn(),
    ...overrides,
  };
  render(<ProfilesRoleList {...props} />);
  return props;
}

describe('ProfilesRoleList', () => {
  test('rend un bouton par profil (emoji + nom) + bouton de création', () => {
    setup();
    expect(screen.getByRole('button', { name: '+ Créer un profil' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '🛡️ Admin' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'n3boss' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '🪨 Novice' })).toBeInTheDocument();
  });

  test('↑ désactivé sur le 1er, ↓ désactivé sur le dernier', () => {
    setup();
    expect(screen.getByLabelText('Monter « Admin » dans la liste')).toBeDisabled();
    expect(screen.getByLabelText('Descendre « Novice » dans la liste')).toBeDisabled();
    expect(screen.getByLabelText('Descendre « Admin » dans la liste')).not.toBeDisabled();
  });

  test('réordonnancement appelle onReorder(id, ±1)', () => {
    const { onReorder } = setup();
    fireEvent.click(screen.getByLabelText('Descendre « Admin » dans la liste'));
    expect(onReorder).toHaveBeenCalledWith(1, 1);
    fireEvent.click(screen.getByLabelText('Monter « Novice » dans la liste'));
    expect(onReorder).toHaveBeenCalledWith(3, -1);
  });

  test('sélection / édition / duplication / création câblées', () => {
    const { onSelect, onEditDetails, onDuplicate, onCreate } = setup();
    fireEvent.click(screen.getByRole('button', { name: '🪨 Novice' }));
    expect(onSelect).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getAllByRole('button', { name: 'Modifier' })[0]);
    expect(onEditDetails).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Dupliquer' })[1]);
    expect(onDuplicate).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
    fireEvent.click(screen.getByRole('button', { name: '+ Créer un profil' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  test('canEditRoleDefinition=false masque « Dupliquer »', () => {
    setup({ canEditRoleDefinition: false });
    expect(screen.queryByRole('button', { name: 'Dupliquer' })).not.toBeInTheDocument();
  });

  test('loading désactive création et actions', () => {
    setup({ loading: true });
    expect(screen.getByRole('button', { name: '+ Créer un profil' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Modifier' })[0]).toBeDisabled();
  });
});
