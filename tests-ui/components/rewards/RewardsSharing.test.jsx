import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const apiMock = vi.fn();
vi.mock('../../../src/services/api.js', () => ({
  api: (...args) => apiMock(...args),
  withAppBase: (p) => p,
}));

import { RewardCelebration } from '../../../src/shared/rewards/RewardCelebration.jsx';
import { RewardsPanel } from '../../../src/shared/rewards/RewardsPanel.jsx';
import { resetCelebratedRewards } from '../../../src/shared/rewards/useRewardsCelebration.js';
import { RewardsCelebrationHost } from '../../../src/components/rewards/RewardsCelebrationHost.jsx';
import { RewardsShowcase } from '../../../src/components/rewards/RewardsShowcase.jsx';
import { PublicSettingsProvider } from '../../../src/contexts/PublicSettingsContext.jsx';
import {
  OLU_REWARD_LINES,
  OLU_REWARD_MANUAL,
  OLU_REWARD_GENERIC,
  oluRewardLine,
} from '../../../src/shared/utils/oluRewardsVoice.js';

/**
 * Badges partagés entre produits : célébration avec OLU, panneau en consultation, une seule
 * célébration par badge et par page (accueil + « Mes badges »), hôte d'arrivée dans
 * l'application, fiche de badges d'un élève pour le personnel.
 */

const NARRATOR = { enabled: true, speakerName: 'OLU' };
const TIERS = [
  { n: 1, emoji: '🌸', label: 'Bourgeon', threshold: 5 },
  { n: 2, emoji: '🌼', label: 'Fleur', threshold: 15 },
  { n: 3, emoji: '🍎', label: 'Fruit', threshold: 40 },
];
const CARTO = {
  key: 'exploration.cartographe',
  family: 'exploration',
  emoji: '🗺️',
  title: 'Cartographe',
  description: 'Découvre des lieux de la carte pendant la visite.',
  unit: 'lieu découvert',
  source: 'auto',
  tiers: TIERS,
};
const UNSEEN = {
  key: 'exploration.cartographe.1',
  baseKey: 'exploration.cartographe',
  family: 'exploration',
  emoji: '🗺️',
  title: 'Cartographe',
  source: 'auto',
  tier: 1,
  tiers: [5, 15, 40],
  seen: false,
};
const ME = {
  families: [{ key: 'exploration', label: 'Exploration' }],
  catalogue: [CARTO],
  rewards: [UNSEEN],
  progress: [
    {
      key: 'exploration.cartographe',
      value: 6,
      tier: 1,
      nextTier: 2,
      nextThreshold: 15,
      remaining: 9,
    },
  ],
};

beforeEach(() => {
  apiMock.mockReset();
  resetCelebratedRewards();
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});
afterEach(() => {
  delete window.matchMedia;
});

describe('voix d’OLU pour les badges', () => {
  test('phrase de la famille, stable pour les mêmes badges', () => {
    const line = oluRewardLine([UNSEEN]);
    expect(OLU_REWARD_LINES.exploration).toContain(line);
    expect(oluRewardLine([UNSEEN])).toBe(line);
  });
  test('familles mêlées : repli générique ; badge décerné : introduction du mot', () => {
    const mixed = oluRewardLine([UNSEEN, { key: 'nature.savant.1', family: 'nature' }]);
    expect(OLU_REWARD_GENERIC).toContain(mixed);
    const manual = oluRewardLine([
      { key: 'manuel.guide.1', family: 'manuel', source: 'manual', note: 'Merci' },
    ]);
    expect(OLU_REWARD_MANUAL).toContain(manual);
  });
  test('un produit ajoute ses familles (G&L) sans réécrire le corpus', () => {
    const line = oluRewardLine([{ key: 'quete.etoiles.1', family: 'quetes' }], {
      extraPools: { quetes: ['Une étoile de plus dans ta besace.'] },
    });
    expect(line).toBe('Une étoile de plus dans ta besace.');
  });
  test('charte : pas de flatterie creuse, aucune pointe adressée à l’élève', () => {
    const all = [
      ...Object.values(OLU_REWARD_LINES).flat(),
      ...OLU_REWARD_GENERIC,
      ...OLU_REWARD_MANUAL,
    ];
    for (const line of all) {
      expect(line).not.toMatch(/\b(bravo|excellent|génial)\b/i);
      expect(line).not.toMatch(/\btu (as|es) (nul|lent|en retard)/i);
    }
  });
});

describe('célébration commune', () => {
  test('OLU parle après la liste, avec son nom', () => {
    render(<RewardCelebration rewards={[UNSEEN]} narrator={NARRATOR} onClose={vi.fn()} />);
    const el = screen.getByTestId('reward-celebration');
    expect(el.textContent).toContain('🗺️ Cartographe — 🌸 Bourgeon');
    const olu = within(el).getByTestId('reward-celebration-olu');
    expect(olu.textContent).toContain('OLU');
  });
});

describe('panneau commun', () => {
  test('consultation (readOnly) : aucune célébration, rien marqué vu', () => {
    const onSeen = vi.fn();
    render(<RewardsPanel data={ME} readOnly onSeen={onSeen} title="Badges d’Ada" />);
    expect(screen.getByTestId('pedago-rewards').textContent).toContain('Badges d’Ada (1/1)');
    expect(screen.queryByTestId('reward-celebration')).toBeNull();
    expect(onSeen).not.toHaveBeenCalled();
  });

  test('un badge fêté à l’accueil n’est pas fêté une seconde fois dans « Mes badges »', async () => {
    const user = userEvent.setup();
    const first = render(<RewardsPanel data={ME} onSeen={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Super !' }));
    first.unmount();
    render(<RewardsPanel data={ME} onSeen={vi.fn()} />);
    expect(screen.queryByTestId('reward-celebration')).toBeNull();
  });
});

describe('hôte de célébration (arrivée dans l’application)', () => {
  test('module allumé : lit /api/rewards/me, fête avec OLU, marque vu à la fermeture', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation(async (url) => (url === '/api/rewards/me' ? ME : { seen: 1 }));
    render(
      <PublicSettingsProvider value={{ content: { help: { narrator: NARRATOR } } }}>
        <RewardsCelebrationHost enabled />
      </PublicSettingsProvider>,
    );
    const host = await screen.findByTestId('reward-celebration-host');
    expect(within(host).getByTestId('reward-celebration-olu').textContent).toContain('OLU');
    await user.click(within(host).getByRole('button', { name: 'Super !' }));
    expect(apiMock).toHaveBeenCalledWith('/api/rewards/me/seen', 'POST');
    expect(screen.queryByTestId('reward-celebration-host')).toBeNull();
  });

  test('module éteint : aucun appel', async () => {
    render(<RewardsCelebrationHost enabled={false} />);
    await act(async () => {});
    expect(apiMock).not.toHaveBeenCalled();
  });

  test('rien de neuf : rien affiché', async () => {
    apiMock.mockResolvedValue({ ...ME, rewards: [{ ...UNSEEN, seen: true }] });
    render(<RewardsCelebrationHost enabled />);
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/api/rewards/me'));
    expect(screen.queryByTestId('reward-celebration-host')).toBeNull();
  });
});

describe('fiche de badges d’un élève (personnel)', () => {
  test('le nom dans la vitrine ouvre la fiche, en consultation', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation(async (url) => {
      if (url === '/api/rewards/groups/g1') {
        return {
          group: { id: 'g1', name: 'Seconde 3' },
          families: ME.families,
          students: [{ id: 's1', name: 'Ada Lovelace', families: { exploration: 1 }, total: 1 }],
          near: [],
        };
      }
      if (url === '/api/rewards/students/s1') return { studentId: 's1', ...ME };
      throw new Error(`inattendu : ${url}`);
    });
    render(<RewardsShowcase groupId="g1" />);
    await user.click(
      await screen.findByRole('button', { name: /Voir les badges de Ada Lovelace/ }),
    );
    const sheet = await screen.findByTestId('rewards-student-sheet');
    await waitFor(() =>
      expect(within(sheet).getByText(/Badges de Ada Lovelace \(1\/1\)/)).toBeTruthy(),
    );
    expect(within(sheet).queryByTestId('reward-celebration')).toBeNull();
    expect(apiMock).not.toHaveBeenCalledWith('/api/rewards/me/seen', 'POST');
  });
});
