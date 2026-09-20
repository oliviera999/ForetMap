import { describe, test, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { UserIdentitySummary } from '../../../src/components/profiles/UserIdentitySummary.jsx';

const baseUser = {
  id: 'u1',
  user_type: 'student',
  display_name: 'Ada Lovelace',
  email: 'ada@lycee.test',
  role_display_name: 'Élève avancé',
  role_slug: 'eleve_avance',
  groups: [
    { id: 'g1', name: '2nde B', kind: 'class', is_active: true },
    { id: 'g2', name: 'Club jardin', kind: 'club', is_active: true },
  ],
};

describe('UserIdentitySummary — fiche utilisateur admin', () => {
  test('affiche le profil et les groupes de rattachement', () => {
    render(<UserIdentitySummary user={baseUser} />);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Élève')).toBeInTheDocument();
    expect(screen.getByText('ada@lycee.test')).toBeInTheDocument();
    expect(screen.getByTestId('user-summary-role')).toHaveTextContent('Élève avancé');
    expect(screen.getByText('Groupes')).toBeInTheDocument();
    const chips = screen.getByTestId('user-groups-chips');
    expect(within(chips).getByText('2nde B')).toBeInTheDocument();
    expect(within(chips).getByText('Club jardin')).toBeInTheDocument();
    expect(within(chips).getByText('Classe')).toBeInTheDocument();
    // Plus de « responsable » de groupe : l'appartenance est la seule relation.
    expect(within(chips).queryByText('Responsable')).not.toBeInTheDocument();
    expect(within(chips).queryByText('Membre')).not.toBeInTheDocument();
    // Sans fiche détaillée, une seule ligne « Profil ».
    expect(screen.getByText('Profil')).toBeInTheDocument();
    expect(screen.queryByTestId('user-summary-assigned-role')).not.toBeInTheDocument();
  });

  test('fiche détaillée : profil attribué, profil effectif et origine « imposé par le groupe »', () => {
    render(
      <UserIdentitySummary
        user={{
          ...baseUser,
          assigned_role_id: 4,
          assigned_role_display_name: 'Élève avancé',
          role_display_name: 'Visiteur',
          role_slug: 'visiteur',
          effective_role: { id: 1, slug: 'visiteur', source: 'forced', groupName: 'Sixième 3' },
          conferring_groups: [
            {
              groupId: 'g3',
              groupName: 'Sixième 3',
              role: { displayName: 'Visiteur' },
              forced: true,
            },
          ],
        }}
      />,
    );
    expect(screen.getByText('Profil attribué')).toBeInTheDocument();
    expect(screen.getByTestId('user-summary-assigned-role')).toHaveTextContent('Élève avancé');
    expect(screen.getByText('Profil effectif')).toBeInTheDocument();
    expect(screen.getByTestId('user-summary-role')).toHaveTextContent('Visiteur');
    expect(screen.getByTestId('user-summary-role-origin')).toHaveTextContent(
      'imposé par le groupe Sixième 3',
    );
    expect(screen.getByTestId('user-summary-conferring')).toHaveTextContent(
      'Sixième 3 : Visiteur (imposé)',
    );
  });

  test('origine « attribué » sans profil attribué explicite : ligne dédiée « Aucun profil attribué »', () => {
    render(
      <UserIdentitySummary
        user={{
          ...baseUser,
          effective_role: { id: 2, slug: 'eleve_avance', source: 'assigned' },
        }}
      />,
    );
    expect(screen.getByTestId('user-summary-assigned-role')).toHaveTextContent(
      'Aucun profil attribué',
    );
    expect(screen.getByTestId('user-summary-role-origin')).toHaveTextContent('attribué');
  });

  test('sans profil ni groupe : états vides explicites, jamais de champ muet', () => {
    render(
      <UserIdentitySummary
        user={{ id: 'u2', user_type: 'teacher', display_name: 'Sans Profil', groups: [] }}
      />,
    );
    expect(screen.getByTestId('user-summary-role')).toHaveTextContent('Aucun profil');
    expect(screen.getByTestId('user-groups-empty')).toHaveTextContent('Aucun groupe');
    expect(screen.getByText('Groupe')).toBeInTheDocument();
    expect(screen.getByText('Enseignant')).toBeInTheDocument();
  });

  test('tolère une réponse API sans champ groups (rétrocompatibilité)', () => {
    render(<UserIdentitySummary user={{ id: 'u3', user_type: 'student', display_name: 'X' }} />);
    expect(screen.getByTestId('user-groups-empty')).toBeInTheDocument();
  });

  test('user null → rien rendu', () => {
    const { container } = render(<UserIdentitySummary user={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
