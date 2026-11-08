import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const apiGL = vi.fn();
let session = null;
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGL(...args),
  getGlSession: () => session,
  getGlToken: () => session?.token || null,
}));

import { GLRewardsPanel } from '../../src/gl/components/GLRewardsPanel.jsx';
import { GL_REWARDS_OLU_POOLS } from '../../src/gl/constants/glRewardsOlu.js';
import { invalidateGlNarratorCache } from '../../src/gl/hooks/useGlNarrator.js';
import { resetCelebratedRewards } from '../../src/shared/rewards/useRewardsCelebration.js';

const NARRATOR = { enabled: true, speakerName: 'OLU', fallbackSilhouette: 'olu', portraits: {} };
const TIERS = [
  { n: 1, emoji: '🧵', label: 'Fil' },
  { n: 2, emoji: '🪢', label: 'Nœud' },
  { n: 3, emoji: '🧶', label: 'Étoffe' },
];
const FORBIDDEN =
  /monstre|ennemi|attaque|poursui|corbeau|Krâ|Kraa|Grise|\bfaux\b|raté|perdu|classement/;

function makeMe({ seen = false } = {}) {
  const trouveur = {
    key: 'chasse.pages',
    family: 'chasse',
    emoji: '📜',
    title: 'Trouveur',
    description: 'Trouve ou répare des pages avec ton équipe, quand tu es là.',
    unit: 'page trouvée',
    source: 'auto',
    tiers: TIERS.map((t, i) => ({ ...t, threshold: [1, 4, 10][i] })),
  };
  return {
    enabled: true,
    tiers: TIERS,
    families: [
      { key: 'chasse', label: 'La chasse' },
      { key: 'manuel', label: 'Badges décernés' },
    ],
    catalogue: [
      trouveur,
      {
        key: 'manuel.esprit_equipe',
        family: 'manuel',
        emoji: '🃏',
        title: 'Esprit d’équipe',
        description: 'Décerné par le prof, avec un mot.',
        source: 'manual',
        tiers: null,
      },
    ],
    rewards: [
      {
        ...trouveur,
        key: 'chasse.pages.1',
        baseKey: 'chasse.pages',
        tier: 1,
        occurrence: null,
        awardedAt: '2026-11-06T10:00:00.000Z',
        note: null,
        seen,
      },
    ],
    progress: [
      {
        key: 'chasse.pages',
        family: 'chasse',
        value: 3,
        tier: 1,
        nextTier: 2,
        nextThreshold: 4,
        remaining: 1,
      },
    ],
  };
}

function routeApi(me) {
  apiGL.mockImplementation((path, method = 'GET') => {
    if (path === '/api/gl/content/narrator') return Promise.resolve(NARRATOR);
    if (path === '/api/gl/rewards/me' && method === 'GET') return Promise.resolve(me);
    if (path === '/api/gl/rewards/me/seen') return Promise.resolve({ seen: 1 });
    return Promise.resolve({});
  });
}

const allOn = { rewardsEnabled: true };

beforeEach(() => {
  apiGL.mockReset();
  invalidateGlNarratorCache();
  resetCelebratedRewards();
  session = { token: 'jeton', auth: { userType: 'gl_player', userId: '10' } };
});

describe('GLRewardsPanel (Mes badges G&L)', () => {
  test('paliers de la Trame, progression et célébration privée avec Olu ; « vu » à la fermeture', async () => {
    const user = userEvent.setup();
    routeApi(makeMe());
    render(<GLRewardsPanel modules={allOn} />);
    expect(await screen.findByRole('heading', { name: /Mes badges \(1\/2\)/ })).toBeInTheDocument();
    expect(screen.getByText('La chasse')).toBeInTheDocument();
    const pills = document.querySelectorAll('.reward-tier');
    expect(Array.from(pills).map((p) => p.textContent.trim())).toEqual([
      '🧵 Fil',
      '🪢 Nœud (à venir)',
      '🧶 Étoffe (à venir)',
    ]);
    expect(screen.getByText(/encore 1 page trouvée pour 🪢 Nœud/)).toBeInTheDocument();
    const celebration = screen.getByTestId('reward-celebration');
    expect(celebration).toHaveTextContent('📜 Trouveur — 🧵 Fil');
    expect(celebration).not.toHaveTextContent('Bourgeon');
    const olu = screen.getByTestId('reward-celebration-olu');
    await waitFor(() => expect(olu.textContent.length).toBeGreaterThan(10));
    expect(FORBIDDEN.test(celebration.textContent)).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Super !' }));
    await waitFor(() => expect(apiGL).toHaveBeenCalledWith('/api/gl/rewards/me/seen', 'POST'));
    expect(screen.queryByTestId('reward-celebration')).toBeNull();
  });

  test('badges déjà vus : pas de célébration', async () => {
    routeApi(makeMe({ seen: true }));
    render(<GLRewardsPanel modules={allOn} />);
    await screen.findByRole('heading', { name: /Mes badges/ });
    expect(screen.queryByTestId('reward-celebration')).toBeNull();
  });

  test('projection (vidéoprojecteur) : rien n’est rendu, rien n’est chargé', async () => {
    session = {
      token: 'jeton-projection',
      auth: { userType: 'gl_guest', projection: { gameId: 42 } },
    };
    routeApi(makeMe());
    render(<GLRewardsPanel modules={allOn} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId('gl-rewards')).toBeNull();
    expect(screen.queryByTestId('reward-celebration')).toBeNull();
    expect(apiGL.mock.calls.some((c) => String(c[0]).startsWith('/api/gl/rewards'))).toBe(false);
  });

  test('module éteint : rien n’est rendu ni chargé', async () => {
    routeApi(makeMe());
    render(<GLRewardsPanel modules={{ rewardsEnabled: false }} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId('gl-rewards')).toBeNull();
    expect(apiGL.mock.calls.some((c) => String(c[0]).startsWith('/api/gl/rewards'))).toBe(false);
  });

  test('compte staff (403) ou réponse sans catalogue : le panneau se tait', async () => {
    const err = new Error('Réservé aux joueurs');
    err.status = 403;
    apiGL.mockImplementation((path) =>
      path === '/api/gl/rewards/me' ? Promise.reject(err) : Promise.resolve({}),
    );
    render(<GLRewardsPanel modules={allOn} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId('gl-rewards')).toBeNull();
  });

  test('les phrases d’Olu respectent les garde-fous (jamais l’oiseau, jamais « faux »)', () => {
    for (const [family, lines] of Object.entries(GL_REWARDS_OLU_POOLS)) {
      expect(lines.length).toBeGreaterThanOrEqual(2);
      for (const line of lines) expect(FORBIDDEN.test(line), `${family} : ${line}`).toBe(false);
    }
  });
});
