import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Garde de charge du catalogue biodiversité + pagination « Voir plus ».
 */

const apiCalls = vi.hoisted(() => []);
const apiMock = vi.hoisted(() =>
  vi.fn(async (path) => {
    if (String(path).includes('/observation-counts')) return { counts: {} };
    if (String(path).includes('/gating/summary')) return { items: [] };
    return {};
  }),
);

vi.mock('../../src/services/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: (path, ...rest) => {
      apiCalls.push(String(path));
      return apiMock(path, ...rest);
    },
    getAuthToken: () => 'jeton-de-test',
  };
});

const ACTIVE_MAP_ID = vi.hoisted(() => 'foret');

function makePlants(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `Espèce ${i + 1}`,
    emoji: '🌿',
    description: `Description de l'espèce ${i + 1}`,
    scientific_name: `Genus species${i + 1}`,
    trophic_role: 'producteur',
    is_edible: 1,
    map_ids: [ACTIVE_MAP_ID],
    taxonomy: { kingdom: 'Végétal', group: 'Angiosperme', family: null, genus: null },
  }));
}

const plantsRef = vi.hoisted(() => ({ list: null }));
plantsRef.list = makePlants(12);

vi.mock('../../src/contexts/DataContext.jsx', () => ({
  useData: () => ({
    plants: plantsRef.list,
    zones: [],
    markers: [],
    activeMapId: ACTIVE_MAP_ID,
  }),
}));
vi.mock('../../src/contexts/PublicSettingsContext.jsx', () => ({
  usePublicSettings: () => ({ modules: {} }),
}));
vi.mock('../../src/contexts/SessionContext.jsx', () => ({
  useSession: () => ({ canParticipateContextComments: true }),
}));
vi.mock('../../src/hooks/useHelp', () => ({
  useHelp: () => ({
    isHelpEnabled: false,
    hasSeenSection: () => true,
    markSectionSeen: vi.fn(),
    trackPanelOpen: vi.fn(),
    trackPanelDismiss: vi.fn(),
  }),
}));

const { PlantViewer } = await import('../../src/components/foretmap-views.jsx');

async function flushDebounce() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 320));
  });
}

describe('catalogue biodiversité — vignettes', () => {
  beforeEach(() => {
    apiCalls.length = 0;
    apiMock.mockClear();
    plantsRef.list = makePlants(12);
  });

  test('aucune requête par fiche au montage de la grille', async () => {
    render(<PlantViewer onOpenPlant={vi.fn()} maps={[{ id: ACTIVE_MAP_ID, name: 'Forêt' }]} />);

    await screen.findAllByRole('button', { name: /Ouvrir la fiche de/ });
    await flushDebounce();

    const perPlant = apiCalls.filter((p) => /\/api\/plants\/\d+\//.test(p));
    const comments = apiCalls.filter((p) => p.includes('/api/context-comments'));
    const publicSettings = apiCalls.filter((p) => p.includes('/api/settings/public'));

    expect(perPlant, `appels par fiche : ${perPlant.join(', ')}`).toEqual([]);
    expect(comments, `appels commentaires : ${comments.join(', ')}`).toEqual([]);
    expect(publicSettings, `appels réglages : ${publicSettings.join(', ')}`).toEqual([]);
    expect(apiCalls.length, `appels : ${apiCalls.join(', ')}`).toBeLessThanOrEqual(3);
  });

  test('les douze fiches sont listées et le clic ouvre la fiche complète', async () => {
    const onOpenPlant = vi.fn();
    render(<PlantViewer onOpenPlant={onOpenPlant} maps={[{ id: ACTIVE_MAP_ID, name: 'Forêt' }]} />);

    const openButtons = await screen.findAllByRole('button', { name: /Ouvrir la fiche de/ });
    expect(openButtons).toHaveLength(12);

    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir la fiche de Espèce 3' }));
    expect(onOpenPlant).toHaveBeenCalledWith(3);
  });

  test('Voir plus : 50 fiches → 36 puis 50', async () => {
    plantsRef.list = makePlants(50);
    render(<PlantViewer onOpenPlant={vi.fn()} maps={[{ id: ACTIVE_MAP_ID, name: 'Forêt' }]} />);

    expect(await screen.findAllByRole('button', { name: /Ouvrir la fiche de/ })).toHaveLength(36);
    const more = screen.getByRole('button', { name: /Voir \d+ de plus/ });
    await userEvent.click(more);
    expect(await screen.findAllByRole('button', { name: /Ouvrir la fiche de/ })).toHaveLength(50);
  });
});
