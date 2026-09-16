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
    { id: 'g1', name: '2nde B', kind: 'class', is_active: true, role_in_group: 'member' },
    { id: 'g2', name: 'Club jardin', kind: 'club', is_active: true, role_in_group: 'manager' },
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
    // Le rôle « responsable » est explicité, « membre » reste implicite.
    expect(within(chips).getByText('Responsable')).toBeInTheDocument();
    expect(within(chips).queryByText('Membre')).not.toBeInTheDocument();
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
