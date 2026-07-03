import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UserEditModal } from '../../../src/components/profiles/UserEditModal.jsx';

function renderModal(overrides = {}) {
  const handlers = {
    onClose: vi.fn(),
    onSave: vi.fn(),
    onImpersonate: vi.fn(),
  };
  const props = {
    user: {
      id: '7',
      user_type: 'student',
      display_name: 'Léa Martin',
      first_name: 'Léa',
      last_name: 'Martin',
    },
    loadState: 'ready',
    err: '',
    affiliationOptions: [
      { value: 'both', label: 'Tous les espaces' },
      { value: 'n3', label: 'N3 uniquement' },
    ],
    authPerms: [],
    saving: false,
    impersonateLoading: false,
    ...handlers,
    ...overrides,
  };
  render(<UserEditModal {...props} />);
  return { ...handlers, ...props };
}

describe('UserEditModal', () => {
  test('état loading : message de chargement + bouton Annuler, pas de formulaire', () => {
    renderModal({ loadState: 'loading', user: null });
    expect(screen.getByText('Modifier le compte')).toBeTruthy();
    expect(screen.getByText('Chargement des données du compte…')).toBeTruthy();
    expect(screen.queryByLabelText('Prénom (obligatoire)')).toBeNull();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
  });

  test('état ready : champs préremplis depuis `user` (prénom/nom) et bouton Enregistrer', () => {
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
    renderModal({ user: { id: '9', user_type: 'teacher', display_name: 'Sam Prof' } });
    expect(screen.queryByLabelText('Affiliation')).toBeNull();
  });

  test('affiliation inconnue en base : option « (valeur en base) » ajoutée', () => {
    renderModal({
      user: {
        id: '7',
        user_type: 'student',
        display_name: 'Léa Martin',
        first_name: 'Léa',
        last_name: 'Martin',
        affiliation: 'ancienne',
      },
    });
    expect(screen.getByRole('option', { name: 'ancienne (valeur en base)' })).toBeTruthy();
  });

  test('soumettre le formulaire appelle onSave avec les champs saisis (mot de passe compris)', () => {
    const { onSave } = renderModal();
    fireEvent.change(screen.getByLabelText('Pseudo'), { target: { value: 'lea.m' } });
    fireEvent.change(
      screen.getByLabelText('Nouveau mot de passe (laisser vide pour ne pas changer)'),
      { target: { value: 'nouveau-pass' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      firstName: 'Léa',
      lastName: 'Martin',
      pseudo: 'lea.m',
      email: '',
      description: '',
      affiliation: 'both',
      password: 'nouveau-pass',
    });
  });

  test('le bouton Annuler appelle onClose', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('la saisie du prénom met à jour le champ (état interne)', () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Prénom (obligatoire)'), { target: { value: 'Léo' } });
    expect(screen.getByLabelText('Prénom (obligatoire)').value).toBe('Léo');
  });

  test('bouton impersonation visible si la permission admin.impersonate est présente', () => {
    const { onImpersonate } = renderModal({ authPerms: ['admin.impersonate'] });
    const btn = screen.getByRole('button', { name: 'Voir comme cet utilisateur' });
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onImpersonate).toHaveBeenCalledTimes(1);
  });

  test('bouton impersonation absent sans la permission', () => {
    renderModal({ authPerms: [] });
    expect(screen.queryByRole('button', { name: 'Voir comme cet utilisateur' })).toBeNull();
  });

  test('en cours d’enregistrement : boutons désactivés et libellé adapté', () => {
    renderModal({ saving: true });
    expect(screen.getByRole('button', { name: 'Enregistrement…' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Annuler' }).disabled).toBe(true);
  });

  test('erreur affichée dans la modale en état ready', () => {
    renderModal({ err: 'Email invalide' });
    expect(screen.getByRole('alert').textContent).toContain('Email invalide');
  });
});
