import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const apiMock = vi.fn();
vi.mock('../../../src/services/api.js', () => ({
  api: (...args) => apiMock(...args),
  withAppBase: (p) => p,
}));

import { MyRewardsPanel } from '../../../src/components/rewards/MyRewardsPanel.jsx';
import { RewardCelebration } from '../../../src/components/rewards/RewardCelebration.jsx';
import { RewardsShowcase } from '../../../src/components/rewards/RewardsShowcase.jsx';
import { pluralizeUnit, progressLabel } from '../../../src/components/rewards/rewardsUi.js';
import { resetCelebratedRewards } from '../../../src/shared/rewards/useRewardsCelebration.js';

/**
 * Interfaces des badges (lot F) : progression vers le palier suivant, paliers à venir en
 * gris, mot de l'adulte, célébration regroupée et `prefers-reduced-motion`, vitrine du
 * professeur sans classement.
 */

const TIERS = [
  { n: 1, emoji: '🌸', label: 'Bourgeon', threshold: 2 },
  { n: 2, emoji: '🌼', label: 'Fleur', threshold: 6 },
  { n: 3, emoji: '🍎', label: 'Fruit', threshold: 15 },
];
const JARDINAGE = {
  key: 'metier.jardinage',
  family: 'metiers',
  emoji: '🪴',
  title: 'Main verte',
  description: 'Mène à bien des tâches de jardinage.',
  unit: 'tâche de jardinage',
  source: 'auto',
  tiers: TIERS,
};
const GUIDE = {
  key: 'manuel.guide',
  family: 'manuel',
  emoji: '🎙️',
  title: 'Guide',
  description: 'Décerné par un adulte.',
  source: 'manual',
  tiers: null,
};
const FAMILIES = [
  { key: 'metiers', label: 'Métiers' },
  { key: 'manuel', label: 'Badges décernés' },
];

function setReducedMotion(reduce) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  apiMock.mockReset();
  setReducedMotion(false);
  resetCelebratedRewards();
});
afterEach(() => {
  delete window.matchMedia;
});

describe('helpers', () => {
  test('pluriel de l’unité et libellé de progression', () => {
    expect(pluralizeUnit('tâche de jardinage', 3)).toBe('tâches de jardinage');
    expect(pluralizeUnit('espèce observée', 2)).toBe('espèces observées');
    expect(pluralizeUnit('tâche Flash', 2)).toBe('tâches Flash');
    expect(pluralizeUnit('tâche de jardinage', 1)).toBe('tâche de jardinage');
    expect(progressLabel(JARDINAGE, { remaining: 3, nextTier: 2 })).toBe(
      'encore 3 tâches de jardinage pour 🌼 Fleur',
    );
  });
});

describe('Mes badges', () => {
  const data = {
    families: FAMILIES,
    catalogue: [JARDINAGE, GUIDE],
    rewards: [
      {
        key: 'metier.jardinage.1',
        baseKey: 'metier.jardinage',
        tier: 1,
        awardedAt: '2026-10-01T08:00:00Z',
        seen: true,
      },
      {
        key: 'manuel.guide.1',
        baseKey: 'manuel.guide',
        note: 'Merci pour la visite',
        awardedAt: '2026-10-02T08:00:00Z',
        seen: true,
      },
    ],
    progress: [
      { key: 'metier.jardinage', value: 3, tier: 1, nextTier: 2, nextThreshold: 6, remaining: 3 },
    ],
  };

  test('progression, paliers obtenus en couleur et à venir en gris, date, mot de l’adulte', () => {
    render(<MyRewardsPanel data={data} onSeen={vi.fn()} />);
    expect(screen.getByTestId('pedago-rewards').textContent).toContain('Mes badges (2/2)');
    const card = document.querySelector('[data-reward="metier.jardinage"]');
    const tiers = within(card).getAllByTitle(/Bourgeon|Fleur|Fruit/);
    expect(tiers.map((t) => t.dataset.earned)).toEqual(['true', 'false', 'false']);
    expect(within(card).getByText('encore 3 tâches de jardinage pour 🌼 Fleur')).toBeTruthy();
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3');
    expect(within(card).getByText(/Obtenu le/)).toBeTruthy();
    expect(screen.getByText('« Merci pour la visite »')).toBeTruthy();
    expect(screen.queryByTestId('reward-celebration')).toBeNull();
  });

  test('badges non vus : célébration regroupée, puis annonce marquée vue', async () => {
    const user = userEvent.setup();
    const onSeen = vi.fn();
    const unseen = {
      ...data,
      rewards: data.rewards.map((r) => ({ ...r, seen: false, emoji: '🪴', title: r.key })),
    };
    render(<MyRewardsPanel data={unseen} onSeen={onSeen} />);
    const celebration = screen.getByTestId('reward-celebration');
    expect(celebration.textContent).toContain('2 nouveaux badges !');
    expect(within(celebration).getAllByRole('listitem')).toHaveLength(2);
    await user.click(within(celebration).getByRole('button', { name: 'Super !' }));
    expect(onSeen).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('reward-celebration')).toBeNull();
  });

  test('célébration : animation coupée si prefers-reduced-motion', () => {
    setReducedMotion(true);
    render(
      <RewardCelebration
        rewards={[{ key: 'ecotone.1', emoji: '🌈', title: 'Écotone' }]}
        onClose={vi.fn()}
      />,
    );
    const el = screen.getByTestId('reward-celebration');
    expect(el.dataset.reducedMotion).toBe('true');
    expect(el.className).not.toContain('reward-celebration--animated');
    expect(el.textContent).toContain('Nouveau badge !');
  });
});

describe('Vitrine du professeur', () => {
  test('élèves × familles dans l’ordre reçu (alphabétique), sans classement ; proches d’un palier', async () => {
    apiMock.mockResolvedValue({
      group: { id: 'g1', name: 'Seconde 3' },
      families: FAMILIES,
      students: [
        { id: 's1', name: 'Ada Lovelace', families: { metiers: 3, manuel: 0 }, total: 3 },
        { id: 's2', name: 'Bo Martin', families: { metiers: 0, manuel: 1 }, total: 1 },
      ],
      near: [
        {
          studentId: 's2',
          name: 'Bo Martin',
          key: 'metier.jardinage',
          title: 'Main verte',
          emoji: '🪴',
          value: 1,
          nextThreshold: 2,
          remaining: 1,
        },
      ],
    });
    render(<RewardsShowcase groupId="g1" canAward={false} />);
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeTruthy());
    expect(apiMock).toHaveBeenCalledWith('/api/rewards/groups/g1');
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getByRole('rowheader').textContent)).toEqual([
      'Ada Lovelace',
      'Bo Martin',
    ]);
    expect(screen.getByTestId('rewards-showcase').textContent).not.toMatch(/🥇|rang|classement/i);
    expect(screen.getByTestId('rewards-near').textContent).toContain('Main verte');
    expect(screen.queryByRole('button', { name: /Décerner un badge/ })).toBeNull();
  });
});
