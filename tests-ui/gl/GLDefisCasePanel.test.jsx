import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GLDefisCasePanel } from '../../src/gl/components/tenir/GLDefisCasePanel.jsx';

const apiGlMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

const defis = [
  {
    id: 1,
    teamId: 2,
    code: 'd-p1-chaine',
    statut: 'a_preparer',
    titre: 'La chaîne en trente secondes',
    consigne: 'Dites une chaîne de trois maillons.',
    preparation: 'Choisissez vos trois vivants.',
  },
  {
    id: 2,
    teamId: 3,
    code: 'd-p1-mime',
    statut: 'releve',
    titre: 'Le mime',
    consigne: 'Mimez un vivant.',
    preparation: '',
  },
];

describe('GLDefisCasePanel — défi à préparer', () => {
  beforeEach(() => {
    // Accolades : `mockReset()` renvoie le mock, que vitest prendrait pour un nettoyage.
    apiGlMock.mockReset();
  });

  test('montre titre, consigne et préparation du défi à préparer, jamais un défi déjà jugé', async () => {
    apiGlMock.mockResolvedValue({ defis });
    render(<GLDefisCasePanel gameId={7} />);
    await waitFor(() => screen.getByText('La chaîne en trente secondes'));
    expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/7/defis-case');
    expect(screen.getByText('Dites une chaîne de trois maillons.')).toBeTruthy();
    expect(screen.getByText(/Choisissez vos trois vivants\./)).toBeTruthy();
    expect(screen.queryByText('Le mime')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Défi à préparer' })).toBeTruthy();
    // Rien n'est retiré : le texte le dit, sans jamais parler de ressource.
    expect(screen.getByTestId('gl-defis-case').textContent).not.toMatch(/gemme|cœur|critère/i);
  });

  test('projection : le nom de l’équipe précède le titre', async () => {
    apiGlMock.mockResolvedValue({ defis });
    render(<GLDefisCasePanel gameId={7} avecEquipe teams={[{ id: 2, name: 'Gnomes A' }]} />);
    await waitFor(() => screen.getByText('Gnomes A — La chaîne en trente secondes'));
  });

  test('aucun défi à préparer : rien ne s’affiche, même si la lecture échoue', async () => {
    apiGlMock.mockRejectedValue(new Error('réseau'));
    const { container } = render(<GLDefisCasePanel gameId={7} />);
    await waitFor(() => expect(apiGlMock).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="gl-defis-case"]')).toBeNull();
  });
});
