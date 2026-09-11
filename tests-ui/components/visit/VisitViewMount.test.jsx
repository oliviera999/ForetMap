// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/react';

/**
 * Test de montage de `VisitView` — filet posé pour le rebranchement de la scène de visite sur
 * le moteur de carte partagé `usePctMapViewport` (lot 2 du plan de convergence), patron
 * `tests-ui/AppShellWiring.test.jsx` : la vue est montée pour de vrai (session élève et visite
 * publique invitée), seuls le réseau et les hooks satellites (contenu, progression, mascotte)
 * sont remplacés par des sondes à identité stable.
 */

const apiMock = vi.hoisted(() => vi.fn(async () => []));
vi.mock('../../../src/services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  api: apiMock,
}));

const stubs = vi.hoisted(() => {
  const noop = () => {};
  const content = {
    zones: [
      {
        id: 1,
        map_id: 'foret',
        name: 'Verger',
        points: JSON.stringify([
          { xp: 10, yp: 10 },
          { xp: 40, yp: 10 },
          { xp: 40, yp: 40 },
        ]),
      },
    ],
    markers: [{ id: 11, map_id: 'foret', label: 'Compost', x_pct: 20, y_pct: 30, emoji: '' }],
    tutorials: [],
  };
  const visit = {
    maps: [{ id: 'foret', label: 'Forêt', map_image_url: '/maps/map-foret.svg' }],
    content,
    loading: false,
    loadData: async () => {},
    selected: null,
    setSelected: noop,
    selectedType: null,
    setSelectedType: noop,
  };
  const seen = {
    seen: new Set(),
    savingSeen: false,
    isOnline: true,
    pendingSyncCount: 0,
    syncStatus: 'idle',
    onToggleSeen: noop,
    applyServerProgress: noop,
    flushVisitSeenQueueNow: noop,
  };
  const mascot = {
    visitMascotId: 'sprout',
    visitMascotOptions: [],
    visitMascotAnimationState: 'idle',
    onChangeVisitMascotId: noop,
    visitMascotCatalogExtras: [],
    visitMapMascotRenderPct: { xp: 50, yp: 50 },
    visitMapMascotFaceRight: true,
    visitMapMascotWalking: false,
    visitMapMascotHappy: false,
    visitMascotDialog: null,
    visitMascotDialogVisible: false,
    visitMapMascotPctRef: { current: { xp: 50, yp: 50 } },
    moveVisitMapMascotTo: vi.fn(),
    scheduleVisitDetailPanelOpen: noop,
    cancelScheduledDetailPanelOpen: noop,
    emitMascotEvent: noop,
    showMascotDialog: noop,
    onMascotSeenCelebration: noop,
    onMascotTap: noop,
  };
  return { visit, seen, mascot };
});

vi.mock('../../../src/hooks/useVisitContent.js', () => ({ useVisitContent: () => stubs.visit }));
vi.mock('../../../src/hooks/useVisitSeenSync.js', () => ({ useVisitSeenSync: () => stubs.seen }));
vi.mock('../../../src/hooks/useVisitMapMascotController.js', () => ({
  useVisitMapMascotController: () => stubs.mascot,
}));
vi.mock('../../../src/components/TutorialReadAcknowledge', () => ({
  fetchTutorialReadIds: async () => new Set(),
}));

const { VisitView } = await import('../../../src/components/visit-views.jsx');
const { PublicSettingsProvider } = await import('../../../src/contexts/PublicSettingsContext.jsx');
const { SessionProvider } = await import('../../../src/contexts/SessionContext.jsx');
const { DataProvider } = await import('../../../src/contexts/DataContext.jsx');
const { AppDialogsProvider } =
  await import('../../../src/shared/components/AppDialogsProvider.jsx');
const { resetVisitPlantCatalogCache } = await import('../../../src/hooks/useVisitPlantCatalog.js');
const { resetGlossaryLinkIndexCache } = await import('../../../src/hooks/useGlossaryLinkIndex.js');

function renderVisit(props = {}, data = { tasks: [], plants: [] }) {
  return render(
    <PublicSettingsProvider value={{ modules: {}, ui: { map: {} }, visit: {} }}>
      <SessionProvider value={{ isN3Affiliated: false, canParticipateContextComments: true }}>
        <DataProvider value={data}>
          <AppDialogsProvider>
            <VisitView
              student={{ id: 'S1', first_name: 'Ada' }}
              isTeacher={false}
              onForceLogout={() => {}}
              initialMapId="foret"
              {...props}
            />
          </AppDialogsProvider>
        </DataProvider>
      </SessionProvider>
    </PublicSettingsProvider>,
  );
}

beforeEach(() => {
  apiMock.mockClear();
  apiMock.mockImplementation(async () => []);
  stubs.mascot.moveVisitMapMascotTo.mockClear();
  stubs.visit.selected = null;
  stubs.visit.selectedType = null;
  resetVisitPlantCatalogCache();
  resetGlossaryLinkIndexCache();
});

describe('VisitView — montage sur le moteur de carte partagé', () => {
  test('élève : scène, monde, image, zones, repères et contrôles zoom montés', async () => {
    const view = renderVisit();
    const stage = await waitFor(() => {
      const el = view.container.querySelector('.visit-map-stage');
      expect(el).not.toBeNull();
      return el;
    });
    const world = stage.querySelector('.visit-map-world');
    expect(world).not.toBeNull();
    const img = world.querySelector('img.visit-map-img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toContain('map-foret');
    expect(view.container.querySelector('.visit-map-controls')).not.toBeNull();
    expect(view.container.querySelectorAll('.visit-marker-btn').length).toBeGreaterThan(0);
    expect(stage.style.touchAction).toBe('none');
  });

  test('un tap sur le fond du plan déplace la mascotte via le moteur (conversion en % image)', async () => {
    const view = renderVisit();
    const stage = await waitFor(() => {
      const el = view.container.querySelector('.visit-map-stage');
      expect(el).not.toBeNull();
      return el;
    });
    // Image « décodée » + cadre mesurable pour que le clic soit converti.
    const img = stage.querySelector('img.visit-map-img');
    Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 800 });
    Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 400 });
    Object.defineProperty(stage, 'clientWidth', { configurable: true, value: 400 });
    Object.defineProperty(stage, 'clientHeight', { configurable: true, value: 200 });
    stage.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 400,
      height: 200,
      right: 400,
      bottom: 200,
      x: 0,
      y: 0,
    });
    fireEvent.load(img);
    await waitFor(() => expect(stubs.mascot.moveVisitMapMascotTo).not.toHaveBeenCalled());
    fireEvent.click(stage, { clientX: 200, clientY: 100 });
    await waitFor(() => expect(stubs.mascot.moveVisitMapMascotTo).toHaveBeenCalledWith(50, 50));
  });

  test('visite publique invitée : montage sans session', async () => {
    const view = renderVisit({ student: null, requireGuestMascotChoice: false });
    await waitFor(() => expect(view.container.querySelector('.visit-map-stage')).not.toBeNull());
  });
});

/**
 * Visite **invitée** : aucune session, donc aucun contexte de données — la vue doit aller
 * chercher elle-même le catalogue biodiversité (route publique) et porter la fiche espèce,
 * sinon le visiteur lit les textes d'un lieu sans jamais voir ses espèces.
 */
describe('VisitView — biodiversité et glossaire sans session', () => {
  const ZONE_WITH_SPECIES = {
    id: 1,
    map_id: 'foret',
    name: 'Verger',
    points: JSON.stringify([
      { xp: 10, yp: 10 },
      { xp: 40, yp: 10 },
      { xp: 40, yp: 40 },
    ]),
    visit_short_description: 'Un coin de pommiers.',
    living_beings_list: ['Consoude'],
    species: [{ id: 12, name: 'Consoude', emoji: '🌿' }],
  };
  const PUBLIC_PLANTS = [
    { id: 12, name: 'Consoude', emoji: '🌿', ecosystem_role: 'Remonte les minéraux.' },
  ];

  function mockPublicApi() {
    apiMock.mockImplementation(async (path) => {
      if (String(path) === '/api/plants') return PUBLIC_PLANTS;
      if (String(path) === '/api/glossary/terms') return { items: [] };
      return [];
    });
  }

  test('lieu porteur d’espèces : catalogue public chargé et vignette ouvrable', async () => {
    mockPublicApi();
    stubs.visit.selected = ZONE_WITH_SPECIES;
    stubs.visit.selectedType = 'zone';
    const view = renderVisit({ student: null });
    await waitFor(() =>
      expect(apiMock.mock.calls.some((c) => String(c[0]) === '/api/plants')).toBe(true),
    );
    const tile = await waitFor(
      () => view.getByRole('button', { name: /Ouvrir la fiche de Consoude/i }),
      { timeout: 5000 },
    );
    expect(tile).toBeTruthy();
  });

  test('index du glossaire demandé à l’ouverture d’un lieu, pas avant', async () => {
    mockPublicApi();
    const closed = renderVisit({ student: null });
    await waitFor(() => expect(closed.container.querySelector('.visit-map-stage')).not.toBeNull());
    expect(apiMock.mock.calls.some((c) => String(c[0]) === '/api/glossary/terms')).toBe(false);
    closed.unmount();

    stubs.visit.selected = ZONE_WITH_SPECIES;
    stubs.visit.selectedType = 'zone';
    renderVisit({ student: null });
    await waitFor(() =>
      expect(apiMock.mock.calls.some((c) => String(c[0]) === '/api/glossary/terms')).toBe(true),
    );
  });

  test('lieu sans espèce : aucun chargement de catalogue', async () => {
    mockPublicApi();
    stubs.visit.selected = { ...ZONE_WITH_SPECIES, living_beings_list: [], species: [] };
    stubs.visit.selectedType = 'zone';
    const view = renderVisit({ student: null });
    await waitFor(() => expect(view.container.querySelector('.visit-detail-panel')).not.toBeNull());
    expect(apiMock.mock.calls.some((c) => String(c[0]) === '/api/plants')).toBe(false);
  });

  test('session ouverte : la fiche espèce est remontée à l’application', async () => {
    mockPublicApi();
    stubs.visit.selected = ZONE_WITH_SPECIES;
    stubs.visit.selectedType = 'zone';
    const onOpenPlantCatalogPreview = vi.fn();
    // Catalogue déjà distribué par le contexte de données : aucune requête publique.
    const view = renderVisit({ onOpenPlantCatalogPreview }, { tasks: [], plants: PUBLIC_PLANTS });
    const tile = await waitFor(
      () => view.getByRole('button', { name: /Ouvrir la fiche de Consoude/i }),
      { timeout: 5000 },
    );
    fireEvent.click(tile);
    expect(onOpenPlantCatalogPreview).toHaveBeenCalledWith(12);
    expect(apiMock.mock.calls.some((c) => String(c[0]) === '/api/plants')).toBe(false);
  });

  test('sans session, le clic ouvre la fiche espèce portée par la visite', async () => {
    mockPublicApi();
    stubs.visit.selected = ZONE_WITH_SPECIES;
    stubs.visit.selectedType = 'zone';
    const view = renderVisit({ student: null });
    const tile = await waitFor(
      () => view.getByRole('button', { name: /Ouvrir la fiche de Consoude/i }),
      { timeout: 5000 },
    );
    fireEvent.click(tile);
    // Fiche montée à la demande (import dynamique) : laisser au chunk le temps d'arriver.
    await waitFor(
      () => expect(document.querySelector('#plant-catalog-preview-title')).not.toBeNull(),
      { timeout: 5000 },
    );
    expect(document.querySelector('#plant-catalog-preview-title').textContent).toContain(
      'Consoude',
    );
  });
});
