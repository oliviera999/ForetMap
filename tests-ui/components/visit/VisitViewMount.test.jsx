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

function renderVisit(props = {}) {
  return render(
    <PublicSettingsProvider value={{ modules: {}, ui: { map: {} }, visit: {} }}>
      <SessionProvider value={{ isN3Affiliated: false, canParticipateContextComments: true }}>
        <DataProvider value={{ tasks: [], plants: [] }}>
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
  stubs.mascot.moveVisitMapMascotTo.mockClear();
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
