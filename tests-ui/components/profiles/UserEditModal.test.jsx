import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UserEditModal } from '../../../src/components/profiles/UserEditModal.jsx';

function renderModal(overrides = {}) {
  const setters = {
    setEditFirstName: vi.fn(),
    setEditLastName: vi.fn(),
    setEditPseudo: vi.fn(),
    setEditEmail: vi.fn(),
    setEditDescription: vi.fn(),
    setEditAffiliation: vi.fn(),
    setEditPassword: vi.fn(),
  };
  const handlers = {
    closeEditUser: vi.fn(),
    saveEditUser: vi.fn(),
    startImpersonation: vi.fn(),
  };
  const props = {
    editModalOpen: true,
    editUserLoadState: 'ready',
    editingUser: { id: '7', user_type: 'student', display_name: 'Léa Martin' },
    err: '',
    editFirstName: 'Léa',
    editLastName: 'Martin',
    editPseudo: '',
    editEmail: '',
    editDescription: '',
    editAffiliation: 'both',
    editPassword: '',
    editLoading: false,
    impersonateLoading: false,
    affiliationOptionsForEdit: [
      { value: 'both', label: 'Tous les espaces' },
      { value: 'n3', label: 'N3 uniquement' },
    ],
    authPerms: [],
    ...setters,
    ...handlers,
    ...overrides,
  };
  render(<UserEditModal {...props} />);
  return { ...setters, ...handlers };
}

describe('UserEditModal', () => {
  test('ne rend rien quand editModalOpen est faux', () => {
    renderModal({ editModalOpen: false });
    expect(screen.queryByText('Modifier le compte')).toBeNull();
  });

  test('état loading : message de chargement + bouton Annuler, pas de formulaire', () => {
    renderModal({ editUserLoadState: 'loading', editingUser: null });
    expect(screen.getByText('Modifier le compte')).toBeTruthy();
    expect(screen.getByText('Chargement des données du compte…')).toBeTruthy();
    expect(screen.queryByLabelText('Prénom (obligatoire)')).toBeNull();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
  });

  test('état ready : champs préremplis (prénom/nom) et bouton Enregistrer', () => {
    renderModal();
    expect(screen.getByText('Léa Martin')).toBeTruthy();
    expect(screen.getByLabelText('Prénom (obligatoire)').value).toBe('Léa');
    expect(screen.getByLabelText('Nom (obligatoire)').value).toBe('Martin');
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeTruthy();
  });

  test('affiliation affichée pour un compte student', () => {
    renderModal();
    expect(screen.getByLabelText('Affiliation')).toBeTruthy();
  });

  test('affiliation masquée pour un compte teacher', () => {
    renderModal({ editingUser: { id: '9', user_type: 'teacher', display_name: 'Sam Prof' } });
    expect(screen.queryByLabelText('Affiliation')).toBeNull();
  });

  test('soumettre le formulaire appelle saveEditUser', () => {
    const { saveEditUser } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(saveEditUser).toHaveBeenCalledTimes(1);
  });

  test('le bouton Annuler appelle closeEditUser', () => {
    const { closeEditUser } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(closeEditUser).toHaveBeenCalledTimes(1);
  });

  test('saisir le prénom appelle setEditFirstName', () => {
    const { setEditFirstName } = renderModal();
    fireEvent.change(screen.getByLabelText('Prénom (obligatoire)'), { target: { value: 'Léo' } });
    expect(setEditFirstName).toHaveBeenCalledWith('Léo');
  });

  test('bouton impersonation visible si la permission admin.impersonate est présente', () => {
    const { startImpersonation } = renderModal({ authPerms: ['admin.impersonate'] });
    const btn = screen.getByRole('button', { name: 'Voir comme cet utilisateur' });
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(startImpersonation).toHaveBeenCalledTimes(1);
  });

  test('bouton impersonation absent sans la permission', () => {
    renderModal({ authPerms: [] });
    expect(screen.queryByRole('button', { name: 'Voir comme cet utilisateur' })).toBeNull();
  });

  test('en cours d’enregistrement : boutons désactivés et libellé adapté', () => {
    renderModal({ editLoading: true });
    expect(screen.getByRole('button', { name: 'Enregistrement…' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Annuler' }).disabled).toBe(true);
  });

  test('erreur affichée dans la modale en état ready', () => {
    renderModal({ err: 'Email invalide' });
    expect(screen.getByRole('alert').textContent).toContain('Email invalide');
  });
});
