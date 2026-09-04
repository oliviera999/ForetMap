// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

/**
 * Test de montage de `MapView` (carte de travail) — filet posé AVANT le rebranchement de la
 * carte sur le moteur partagé `usePctMapViewport` (lot 2 du plan de convergence), sur le
 * patron de `tests-ui/AppShellWiring.test.jsx` : le composant racine est monté pour de vrai,
 * seules les dépendances réseau et les gros hooks satellites (mascotte, GPS, catalogue) sont
 * remplacés par des sondes. Un `ReferenceError` de zone morte temporelle ou une prop manquante
 * du moteur casse ici, pas en production.
 */

const apiMock = vi.hoisted(() => vi.fn(async () => []));
vi.mock('../../src/services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  api: apiMock,
}));

// Sondes à identité STABLE : un objet neuf à chaque rendu (fonctions incluses) relance les
// effets de MapView qui en dépendent et boucle sur setState — ce n'est pas le comportement
// des vrais hooks (mémoïsés).
const stubs = vi.hoisted(() => {
  const noop = () => {};
  return {
    mascot: {
      mascotId: 'sprout',
      showMascot: false,
      animationState: 'idle',
      renderPct: { xp: 50, yp: 50 },
      faceRight: true,
      mascotClassName: '',
      dialog: null,
      dialogVisible: false,
      moveTo: noop,
      onZoneViewClick: noop,
      onMarkerViewClick: noop,
      resetMotion: noop,
      clearDetailAfterMove: noop,
    },
    gps: { active: false },
    extras: [],
    edgeSnap: { snapPoint: () => null, ready: false },
    categories: { categories: [], loading: false, error: null, reload: noop },
  };
});
vi.mock('../../src/hooks/useMapViewMascot.js', () => ({ default: () => stubs.mascot }));
vi.mock('../../src/hooks/useMascotGpsFollow.js', () => ({ default: () => stubs.gps }));
vi.mock('../../src/hooks/useVisitMascotCatalogExtras.js', () => ({ default: () => stubs.extras }));
vi.mock('../../src/hooks/useMapImageEdgeSnap.js', () => ({ default: () => stubs.edgeSnap }));
vi.mock('../../src/hooks/useMapCategories.js', () => ({
  useMapCategories: () => stubs.categories,
}));
vi.mock('../../src/components/TutorialReadAcknowledge', () => ({
  fetchTutorialReadIds: async () => new Set(),
}));

const { MapView } = await import('../../src/components/map-views.jsx');
const { PublicSettingsProvider } = await import('../../src/contexts/PublicSettingsContext.jsx');
const { SessionProvider } = await import('../../src/contexts/SessionContext.jsx');
const { DataProvider } = await import('../../src/contexts/DataContext.jsx');

const MAPS = [
  { id: 'foret', label: 'Forêt', map_image_url: '/maps/map-foret.svg' },
  { id: 'lyautey', label: 'Lycée', map_image_url: '/maps/map-lyautey.svg' },
];
const ZONES = [
  {
    id: 1,
    map_id: 'foret',
    name: 'Verger',
    points: JSON.stringify([
      { xp: 10, yp: 10 },
      { xp: 40, yp: 10 },
      { xp: 40, yp: 40 },
    ]),
    category_ids: [],
  },
];
const MARKERS = [
  { id: 11, map_id: 'foret', label: 'Compost', x_pct: 20, y_pct: 30, category_ids: [] },
  { id: 12, map_id: 'lyautey', label: 'CDI', x_pct: 60, y_pct: 70, category_ids: [] },
];

function renderMapView({ isTeacher = false } = {}) {
  const dataValue = {
    zones: ZONES,
    markers: MARKERS,
    tasks: [],
    tutorials: [],
    plants: [],
    activeMapId: 'foret',
  };
  const sessionValue = {
    isN3Affiliated: false,
    canParticipateContextComments: true,
  };
  const settings = { modules: {}, ui: { map: {} } };
  return render(
    <PublicSettingsProvider value={settings}>
      <SessionProvider value={sessionValue}>
        <DataProvider value={dataValue}>
          <MapView
            maps={MAPS}
            onMapChange={() => {}}
            isTeacher={isTeacher}
            student={isTeacher ? null : { id: 'S1', first_name: 'Ada' }}
            onZoneUpdate={() => {}}
            onRefresh={async () => {}}
            onForceLogout={() => {}}
          />
        </DataProvider>
      </SessionProvider>
    </PublicSettingsProvider>,
  );
}

beforeEach(() => {
  apiMock.mockClear();
});

describe('MapView — montage sur le moteur de carte partagé', () => {
  test('élève : cadre, monde, image et barre d’outils montés ; repères de la carte active seulement', async () => {
    const view = renderMapView();
    const canvas = view.container.querySelector('.map-view-canvas');
    expect(canvas).not.toBeNull();
    const img = canvas.querySelector('img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toContain('map-foret');
    await waitFor(() => expect(view.container.querySelector('.map-view-toolbar')).not.toBeNull());
    // Le repère de l'autre carte (CDI, map lyautey) n'est plus rendu sur la carte active.
    expect(view.container.querySelectorAll('.map-bubble')).toHaveLength(1);
    expect(view.container.textContent).toContain('Compost');
    expect(view.container.textContent).not.toContain('CDI');
    // Le moteur applique la transformation sur le calque monde (transform-origin 0 0).
    const world = canvas.firstElementChild;
    expect(world.style.transformOrigin).toBe('0 0');
  });

  test('prof : montage sans erreur avec les outils d’édition', async () => {
    const view = renderMapView({ isTeacher: true });
    await waitFor(() => expect(view.container.querySelector('.map-view-toolbar')).not.toBeNull());
    expect(view.container.querySelector('.map-view-canvas')).not.toBeNull();
  });
});
