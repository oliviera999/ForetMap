import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const apiGlMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
  getGlToken: () => 'jeton',
}));

import { GLDefisConsolePanel } from '../../src/gl/components/defis/GLDefisConsolePanel.jsx';

const vide = { reussies: [], indices: 0 };
const suivi = {
  eleves: [
    {
      playerId: 1,
      nom: 'Élève A',
      equipe: 'Équipe 1',
      defis: {
        retisser: { reussies: ['savane:5', 'savane:7'], indices: 3 },
        reparer: vide,
        alteree: vide,
        fils: vide,
      },
      pages: 2,
    },
    {
      playerId: 2,
      nom: 'Élève B',
      equipe: 'Équipe 2',
      defis: {
        retisser: vide,
        reparer: { reussies: ['p1'], indices: 0 },
        alteree: vide,
        fils: vide,
      },
      pages: 1,
    },
  ],
  phrases: [{ auteur: 'Élève B', texte: 'Parce que la forêt protège le gorille.' }],
};

describe('GLDefisConsolePanel — onglet « Défis » de la console', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
  });

  test('suivi par élève et par type, dans l’ordre reçu, sans classement ; phrases à parcourir', async () => {
    apiGlMock.mockResolvedValue(suivi);
    render(
      <GLDefisConsolePanel
        game={{ id: 7 }}
        teams={[
          { id: 11, name: 'Équipe 1' },
          { id: 12, name: 'Équipe 2' },
        ]}
      />,
    );
    const table = await waitFor(() => screen.getByTestId('gl-defis-suivi'));
    expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/7/defis/suivi');
    const lignes = within(table).getAllByRole('row');
    expect(lignes).toHaveLength(3);
    expect(lignes[1].textContent).toContain('Élève A');
    expect(lignes[1].textContent).toContain('2 réussis');
    expect(lignes[1].textContent).toContain('3 indice(s)');
    expect(lignes[2].textContent).toContain('1 réussi');
    expect(table.textContent).not.toMatch(/classement|rang|score|meilleur/i);
    expect(screen.getByTestId('gl-defis-phrases').textContent).toContain('la forêt protège');
  });

  test('lancer pour une équipe : la liste des défis s’ouvre avec son teamId, et se referme', async () => {
    apiGlMock.mockImplementation(async (path) => {
      if (path.endsWith('/suivi')) return suivi;
      return { actifs: true, mode: 'equipe', tourOuvert: true, types: [], defis: [], pages: {} };
    });
    render(<GLDefisConsolePanel game={{ id: 7 }} teams={[{ id: 12, name: 'Équipe 2' }]} />);
    await waitFor(() => screen.getByTestId('gl-defis-suivi'));
    const bouton = screen.getByTestId('gl-defis-console-equipe-12');
    fireEvent.click(bouton);
    expect(bouton.getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/7/defis?teamId=12'));
    fireEvent.click(bouton);
    expect(bouton.getAttribute('aria-pressed')).toBe('false');
  });

  test('suivi indisponible : un bandeau, la console reste utilisable', async () => {
    apiGlMock.mockRejectedValue(new Error('Suivi indisponible'));
    render(<GLDefisConsolePanel game={{ id: 7 }} teams={[]} />);
    await waitFor(() => screen.getByText('Suivi indisponible'));
    expect(screen.queryByTestId('gl-defis-suivi')).toBeNull();
    expect(screen.getByRole('button', { name: 'Actualiser' })).toBeTruthy();
  });
});
