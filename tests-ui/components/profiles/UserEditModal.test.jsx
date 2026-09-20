import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
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
          { id: 'g1', name: '2nde B', kind: 'class' },
          { id: 'g2', name: 'Club jardin', kind: 'club' },
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

  test('plus de champ d’affiliation : le périmètre cartes vient des groupes', () => {
    renderModal();
    expect(screen.queryByLabelText('Affiliation')).toBeNull();
    expect(screen.queryByText('Mon espace')).toBeNull();
  });

  test('profil attribué et profil effectif avec son origine (conféré par un groupe)', () => {
    renderModal({
      user: {
        id: '7',
        user_type: 'student',
        display_name: 'Léa Martin',
        assigned_role_id: 2,
        assigned_role_display_name: 'Élève novice',
        role_id: 3,
        role_display_name: 'Élève avancé',
        effective_role: { id: 3, slug: 'eleve_avance', source: 'group', groupName: '2nde B' },
        conferring_groups: [
          {
            groupId: 'g1',
            groupName: '2nde B',
            role: { displayName: 'Élève avancé' },
            forced: false,
          },
        ],
      },
    });
    expect(screen.getByTestId('user-summary-assigned-role')).toHaveTextContent('Élève novice');
    expect(screen.getByTestId('user-summary-role')).toHaveTextContent('Élève avancé');
    expect(screen.getByTestId('user-summary-role-origin')).toHaveTextContent(
      'conféré par le groupe 2nde B',
    );
    expect(screen.getByTestId('user-summary-conferring')).toHaveTextContent(
      '2nde B : Élève avancé',
    );
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

  test('désactiver le compte : confirmation en place, puis onToggleActive(false)', async () => {
    const onToggleActive = vi.fn().mockResolvedValue(undefined);
    renderModal({ onToggleActive, user: { id: '7', user_type: 'student', display_name: 'Léa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Désactiver le compte' }));
    expect(onToggleActive).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Désactiver le compte de Léa ?');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la désactivation' }));
    await waitFor(() => expect(onToggleActive).toHaveBeenCalledWith(false));
  });

  test('compte désactivé : le bouton propose la réactivation et la tête de fiche le signale', async () => {
    const onToggleActive = vi.fn().mockResolvedValue(undefined);
    renderModal({
      onToggleActive,
      user: { id: '7', user_type: 'student', display_name: 'Léa', is_active: false },
    });
    expect(screen.getByTestId('user-summary-inactive')).toHaveTextContent('désactivé');
    fireEvent.click(screen.getByRole('button', { name: 'Réactiver le compte' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la réactivation' }));
    await waitFor(() => expect(onToggleActive).toHaveBeenCalledWith(true));
  });

  test('annuler la confirmation ne désactive rien', () => {
    const onToggleActive = vi.fn();
    renderModal({ onToggleActive });
    fireEvent.click(screen.getByRole('button', { name: 'Désactiver le compte' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Annuler' }),
    );
    expect(onToggleActive).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  test('jamais sur son propre compte : ni désactivation ni suppression', () => {
    renderModal({
      isSelf: true,
      isAdmin: true,
      onToggleActive: vi.fn(),
      onDeleteTeacher: vi.fn(),
      user: { id: '9', user_type: 'teacher', display_name: 'Moi' },
    });
    expect(screen.queryByRole('button', { name: 'Désactiver le compte' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Supprimer le compte enseignant' })).toBeNull();
  });

  test('suppression d’un enseignant : admin seulement, confirmation danger', async () => {
    const onDeleteTeacher = vi.fn().mockResolvedValue(undefined);
    renderModal({
      isAdmin: true,
      onDeleteTeacher,
      user: { id: '9', user_type: 'teacher', display_name: 'Sam Prof' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le compte enseignant' }));
    const confirmBtn = screen.getByRole('button', { name: 'Confirmer la suppression' });
    expect(confirmBtn).toHaveClass('btn-danger');
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(onDeleteTeacher).toHaveBeenCalledTimes(1));
  });

  test('suppression absente pour un élève et pour un non-admin', () => {
    renderModal({
      isAdmin: true,
      onDeleteTeacher: vi.fn(),
      user: { id: '7', user_type: 'student', display_name: 'Léa' },
    });
    expect(screen.queryByRole('button', { name: 'Supprimer le compte enseignant' })).toBeNull();
    cleanup();
    renderModal({
      isAdmin: false,
      onDeleteTeacher: vi.fn(),
      user: { id: '9', user_type: 'teacher', display_name: 'Sam Prof' },
    });
    expect(screen.queryByRole('button', { name: 'Supprimer le compte enseignant' })).toBeNull();
  });
});
