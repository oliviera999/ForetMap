import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Fiches « ressource » (`plants.entity_kind`) dans les deux écrans du catalogue :
 * - liste et recherche de l'ÉLÈVE (`PlantViewer`) : jamais de fiche « ressource » ;
 * - liste de GESTION (`PlantManager`) : toujours.
 * Les deux écrans lisent le même catalogue (`GET /api/plants`, contexte de données).
 */

const ACTIVE_MAP_ID = vi.hoisted(() => 'foret');
const PLANTS = vi.hoisted(() => [
  { id: 1, name: 'Cloporte commun', emoji: '🐛', entity_kind: 'taxon', map_ids: ['foret'] },
  { id: 2, name: 'Litière de feuilles', emoji: '🍂', entity_kind: 'ressource', map_ids: ['foret'] },
  {
    id: 3,
    name: 'Phytoplancton',
    emoji: '🦠',
    entity_kind: 'groupe_fonctionnel',
    map_ids: ['foret'],
  },
]);

vi.mock('../../src/services/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: vi.fn(async (path) => {
      if (String(path).includes('/observation-counts')) return { counts: {} };
      if (String(path).includes('/gating/summary')) return { items: [] };
      if (/\/api\/maps\/[^/]+\/species/.test(String(path))) {
        return { species: PLANTS.map((p) => ({ plant_id: p.id, sources: ['registre'] })) };
      }
      return {};
    }),
    getAuthToken: () => 'jeton-de-test',
  };
});
vi.mock('../../src/contexts/DataContext.jsx', () => ({
  useData: () => ({ plants: PLANTS, zones: [], markers: [], activeMapId: ACTIVE_MAP_ID }),
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

const { PlantViewer, PlantManager } = await import('../../src/components/foretmap-views.jsx');

const MAPS = [{ id: ACTIVE_MAP_ID, name: 'Forêt' }];

describe('catalogue d’espèces — fiches « ressource »', () => {
  test('élève : la liste ne montre pas la ressource, et le compteur ne la compte pas', async () => {
    const { container } = render(<PlantViewer onOpenPlant={vi.fn()} maps={MAPS} />);
    await screen.findByRole('button', { name: /Ouvrir la fiche de Cloporte commun/ });
    expect(screen.getByRole('button', { name: /Ouvrir la fiche de Phytoplancton/ })).toBeTruthy();
    expect(screen.queryByText('Litière de feuilles')).toBeNull();
    expect(container.querySelector('.section-sub').textContent).toMatch(/2 \/ 2 affichés/);
    expect(container.querySelector('.section-sub').textContent).not.toMatch(/3/);
  });

  test('élève : chercher le nom de la ressource ne rend rien', async () => {
    const user = userEvent.setup();
    render(<PlantViewer onOpenPlant={vi.fn()} maps={MAPS} />);
    await screen.findByRole('button', { name: /Ouvrir la fiche de Cloporte commun/ });
    await user.type(screen.getByPlaceholderText('Chercher un être vivant…'), 'Litière');
    expect(await screen.findByText(/Aucun être vivant ne colle à ta recherche/)).toBeTruthy();
    expect(screen.queryByText('Litière de feuilles')).toBeNull();
  });

  test('gestion : la liste garde la ressource', async () => {
    const { container } = render(
      <PlantManager onRefresh={vi.fn()} onOpenPlant={vi.fn()} maps={MAPS} />,
    );
    expect(await screen.findByText('Litière de feuilles')).toBeTruthy();
    expect(screen.getByText('Cloporte commun')).toBeTruthy();
    expect(screen.getByText('Phytoplancton')).toBeTruthy();
    expect(container.querySelector('.section-sub').textContent).toMatch(/3 \/ 3 affichés/);
  });
});
