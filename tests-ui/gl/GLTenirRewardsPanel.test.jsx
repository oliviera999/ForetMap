import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const apiGL = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGL(...args),
  getGlToken: () => 'jeton',
}));

import { GLTenirRewardsPanel } from '../../src/gl/components/mj/GLTenirRewardsPanel.jsx';

const SHOWCASE = {
  game: { id: 42, name: 'Partie Tenir' },
  players: [
    { id: '11', name: 'joueur-a', families: { chasse: 2, lecture: 0, manuel: 0 }, total: 2 },
    { id: '12', name: 'joueur-b', families: { chasse: 0, lecture: 1, manuel: 1 }, total: 2 },
  ],
  near: [
    {
      studentId: '11',
      name: 'joueur-a',
      key: 'chasse.pages',
      title: 'Trouveur',
      emoji: '📜',
      value: 3,
      nextThreshold: 4,
      nextTier: 2,
      remaining: 1,
    },
  ],
  families: [
    { key: 'chasse', label: 'La chasse' },
    { key: 'lecture', label: 'Lecture et pages tenues' },
    { key: 'manuel', label: 'Badges décernés' },
  ],
  tiers: [
    { n: 1, emoji: '🧵', label: 'Fil' },
    { n: 2, emoji: '🪢', label: 'Nœud' },
    { n: 3, emoji: '🧶', label: 'Étoffe' },
  ],
  manualTypes: [
    { key: 'manuel.chuchoteur', emoji: '🤫', title: 'Chuchoteur', source: 'manual' },
    { key: 'manuel.esprit_equipe', emoji: '🃏', title: 'Esprit d’équipe', source: 'manual' },
  ],
};

beforeEach(() => {
  apiGL.mockReset();
  apiGL.mockImplementation((path, method = 'GET', body) => {
    if (path === '/api/gl/rewards/games/42' && method === 'GET') return Promise.resolve(SHOWCASE);
    if (path === '/api/gl/rewards/games/42/award' && method === 'POST') {
      return Promise.resolve({
        reward: {
          key: `manuel.${body.type}.1`,
          title: 'Esprit d’équipe',
          emoji: '🃏',
          note: body.note,
        },
      });
    }
    return Promise.resolve({});
  });
});

describe('GLTenirRewardsPanel (vitrine du prof)', () => {
  test('membres par ordre servi, familles obtenues seulement, « à un pas » ; aucun classement', async () => {
    render(<GLTenirRewardsPanel game={{ id: 42 }} roster={[]} />);
    const table = await screen.findByRole('table');
    const rows = Array.from(table.querySelectorAll('tbody tr')).map((r) =>
      r.querySelector('th').textContent.trim(),
    );
    expect(rows).toEqual(['joueur-a', 'joueur-b']);
    const headers = Array.from(table.querySelectorAll('thead th')).map((h) => h.textContent);
    expect(headers).toEqual(['Élève', 'La chasse', 'Lecture et pages tenues', 'Badges décernés']);
    expect(screen.getByTestId('gl-tenir-rewards-near')).toHaveTextContent(
      /joueur-a.*Trouveur.*encore 1 \(3\/4\)/,
    );
    // Aucune colonne ni mention de rang : les en-têtes sont les familles, rien d'autre.
    expect(headers.join(' ')).not.toMatch(/rang|position|total|score/i);
  });

  test('décerner : le mot est obligatoire (rien n’est envoyé sans), puis envoi avec le mot', async () => {
    const user = userEvent.setup();
    render(<GLTenirRewardsPanel game={{ id: 42 }} roster={[]} />);
    await screen.findByRole('table');
    await user.selectOptions(screen.getByLabelText('Élève'), '12');
    await user.selectOptions(screen.getByLabelText('Badge'), 'esprit_equipe');
    await user.click(screen.getByRole('button', { name: 'Décerner' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Écrivez un mot/);
    expect(apiGL.mock.calls.some((c) => c[1] === 'POST')).toBe(false);
    await user.type(screen.getByLabelText(/Mot pour l’élève/), 'Tu as laissé ta place.');
    await user.click(screen.getByRole('button', { name: 'Décerner' }));
    await waitFor(() =>
      expect(apiGL).toHaveBeenCalledWith('/api/gl/rewards/games/42/award', 'POST', {
        playerId: 12,
        type: 'esprit_equipe',
        note: 'Tu as laissé ta place.',
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(/Badge décerné/);
  });

  test('module éteint (503) : la vitrine se tait', async () => {
    const err = new Error('Badges désactivés');
    err.status = 503;
    apiGL.mockImplementation(() => Promise.reject(err));
    render(<GLTenirRewardsPanel game={{ id: 42 }} roster={[]} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId('gl-tenir-rewards')).toBeNull();
  });
});
