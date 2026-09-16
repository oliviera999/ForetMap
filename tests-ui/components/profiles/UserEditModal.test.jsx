import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserEditModal } from '../../../src/components/profiles/UserEditModal.jsx';

function renderModal(overrides = {}) {
  const handlers = {
    onClose: vi.fn(),
    onSave: vi.fn(),
    onImpersonate: vi.fn(),
    onResetPassword: vi.fn().mockResolvedValue(undefined),
    onAttachGroup: vi.fn().mockResolvedValue(undefined),
    onDetachGroup: vi.fn().mockResolvedValue(undefined),
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
    expect(screen.getByText('Fiche du compte')).toBeTruthy();
    expect(screen.getByText('Chargement des données du compte…')).toBeTruthy();
    expect(screen.queryByLabelText('Prénom (obligatoire)')).toBeNull();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
  });

  test('état ready : champs préremplis depuis `user` (prénom/nom) et bouton Enregistrer', () => {
    renderModal();
    expect(screen.getByText('Fiche de Léa Martin')).toBeTruthy();
    expect(screen.getByLabelText('Prénom (obligatoire)').value).toBe('Léa');
    expect(screen.getByLabelText('Nom (obligatoire)').value).toBe('Martin');
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeTruthy();
  });

  test('la fiche expose le profil et les groupes de rattachement', () => {
    renderModal({
      user: {
        id: '7',
        user_type: 'student',
        display_name: 'Léa Martin',
        first_name: 'Léa',
        last_name: 'Martin',
        role_display_name: 'Élève novice',
        groups: [
          { id: 'g1', name: '2nde B', kind: 'class', role_in_group: 'member' },
          { id: 'g2', name: 'Club jardin', kind: 'club', role_in_group: 'manager' },
        ],
      },
    });
    expect(screen.getByTestId('user-summary-role')).toHaveTextContent('Élève novice');
    const chips = screen.getByTestId('user-groups-chips');
    expect(chips.textContent).toContain('2nde B');
    expect(chips.textContent).toContain('Club jardin');
  });

  test('compte sans profil ni groupe : états vides explicites', () => {
    renderModal();
    expect(screen.getByTestId('user-summary-role')).toHaveTextContent('Aucun profil');
    expect(screen.getByTestId('user-groups-empty')).toHaveTextContent('Aucun groupe');
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

  test('soumettre le formulaire appelle onSave avec les seuls champs d’identité', () => {
    const { onSave } = renderModal();
    fireEvent.change(screen.getByLabelText('Pseudo'), { target: { value: 'lea.m' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    // P12 — le mot de passe a quitté le formulaire d'identité : il ne part plus par erreur
    // avec un simple « Enregistrer ».
    expect(onSave).toHaveBeenCalledWith({
      firstName: 'Léa',
      lastName: 'Martin',
      pseudo: 'lea.m',
      email: '',
      description: '',
      affiliation: 'both',
    });
  });

  test('P12 — le mot de passe est une action explicite, repliée par défaut', async () => {
    const { onResetPassword } = renderModal();
    expect(screen.queryByLabelText('Nouveau mot de passe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser le mot de passe' }));
    const field = screen.getByLabelText('Nouveau mot de passe');
    // Tant que le champ est vide, l'action reste inapplicable.
    expect(screen.getByRole('button', { name: 'Appliquer' })).toBeDisabled();
    fireEvent.change(field, { target: { value: 'nouveau-pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    await waitFor(() => expect(onResetPassword).toHaveBeenCalledWith('nouveau-pass'));
  });

  test('P11 — la fiche est structurée en sections', () => {
    renderModal();
    expect(screen.getByText('Droits & groupes')).toBeInTheDocument();
    expect(screen.getByText('Identité')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  test('P13 — les métadonnées de support sont affichées quand l’API les renvoie', () => {
    renderModal({
      user: {
        id: '7',
        user_type: 'student',
        display_name: 'Léa Martin',
        is_active: false,
        auth_provider: 'moodle',
        created_at: '2026-02-03T10:00:00.000Z',
      },
    });
    const meta = screen.getByTestId('user-summary-meta');
    expect(meta.textContent).toContain('Compte désactivé');
    expect(meta.textContent).toContain('Moodle');
    expect(meta.textContent).toContain('03/02/2026');
  });

  test('P13 — aucune ligne de métadonnées sans donnée à afficher', () => {
    renderModal();
    expect(screen.queryByTestId('user-summary-meta')).toBeNull();
  });

  test('P14 — un élève voit son rattachement modifiable quand l’acteur gère les groupes', async () => {
    const { onAttachGroup } = renderModal({
      canManageGroups: true,
      groupOptions: [{ id: 'g9', name: 'Club jardin' }],
    });
    fireEvent.change(screen.getByLabelText('Rattacher à un groupe'), {
      target: { value: 'g9' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rattacher' }));
    await waitFor(() => expect(onAttachGroup).toHaveBeenCalledWith('g9'));
  });

  test('P14 — sans la permission groupes, le rattachement reste en lecture seule', () => {
    renderModal({ canManageGroups: false, groupOptions: [{ id: 'g9', name: 'Club jardin' }] });
    expect(screen.queryByLabelText('Rattacher à un groupe')).toBeNull();
  });

  test('P14 — un compte enseignant n’expose pas le rattachement (route réservée aux élèves)', () => {
    renderModal({
      user: { id: '9', user_type: 'teacher', display_name: 'Sam Prof' },
      canManageGroups: true,
      groupOptions: [{ id: 'g9', name: 'Club jardin' }],
    });
    expect(screen.queryByLabelText('Rattacher à un groupe')).toBeNull();
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
