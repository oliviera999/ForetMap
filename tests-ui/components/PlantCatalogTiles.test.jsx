import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Garde de charge du catalogue biodiversité.
 *
 * Le catalogue rendait toutes les fiches dépliées, et chaque fiche allait chercher ses
 * propres données au montage : bloc pédagogique (`/interactions`, `/glossary-terms`,
 * `/quiz-questions`) et commentaires de contexte (aperçu, total, `/api/settings/public`).
 * Six appels par carte, soit ~471 requêtes pour 78 espèces — de quoi épuiser le plafond
 * de 1200 req/min d'un établissement à trois ouvertures simultanées
 * (`docs/AUDIT_CHARGE_BIODIVERSITE_2026-09.md`, §1).
 *
 * Depuis le passage aux vignettes, la grille ne doit plus émettre **que** les appels de
 * page (compteurs d'observation, annonce du contrôle) ; la fiche complète est chargée à
 * l'ouverture de la modale. Ce test tient cette garantie : une régression qui remettrait
 * un `useEffect` de chargement dans la vignette le ferait échouer immédiatement, alors
 * qu'aucun test fonctionnel ne la verrait passer.
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

// Depuis `38e8555` (« rattacher des espèces à une carte sans lieu précis »), le catalogue
// élève s'ouvre filtré sur la **carte active** : une espèce n'y figure que si elle est posée
// sur une zone / un repère de cette carte, ou rattachée directement via `map_ids`. Les fiches
// sont donc rattachées à la carte active — sans quoi la grille est vide et cette garde de
// charge ne mesure plus rien.
const ACTIVE_MAP_ID = 'foret';
const PLANTS = Array.from({ length: 12 }, (_, i) => ({
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

const { PlantViewer } = await import('../../src/components/foretmap-views.jsx');

describe('catalogue biodiversité — vignettes', () => {
  beforeEach(() => {
    apiCalls.length = 0;
    apiMock.mockClear();
  });

  test('aucune requête par fiche au montage de la grille', async () => {
    render(<PlantViewer onOpenPlant={vi.fn()} />);

    // Attendre les vignettes plutôt qu'un premier appel API : la grille peut n'en émettre
    // aucun — c'est le but de cette garde, pas une raison d'échouer sur la synchronisation.
    await screen.findAllByRole('button', { name: /Ouvrir la fiche de/ });
    // Laisse passer les effets différés d'éventuels enfants avant de conclure.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const perPlant = apiCalls.filter((p) => /\/api\/plants\/\d+\//.test(p));
    const comments = apiCalls.filter((p) => p.includes('/api/context-comments'));
    const publicSettings = apiCalls.filter((p) => p.includes('/api/settings/public'));

    expect(perPlant, `appels par fiche : ${perPlant.join(', ')}`).toEqual([]);
    expect(comments, `appels commentaires : ${comments.join(', ')}`).toEqual([]);
    expect(publicSettings, `appels réglages : ${publicSettings.join(', ')}`).toEqual([]);

    // Le nombre d'appels ne doit pas dépendre du nombre de fiches affichées.
    expect(apiCalls.length, `appels : ${apiCalls.join(', ')}`).toBeLessThanOrEqual(3);
  });

  test('les douze fiches sont listées et le clic ouvre la fiche complète', async () => {
    const onOpenPlant = vi.fn();
    render(<PlantViewer onOpenPlant={onOpenPlant} />);

    const openButtons = await screen.findAllByRole('button', { name: /Ouvrir la fiche de/ });
    expect(openButtons).toHaveLength(PLANTS.length);

    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir la fiche de Espèce 3' }));
    expect(onOpenPlant).toHaveBeenCalledWith(3);
  });
});
