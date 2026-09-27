// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Test de montage de `MapViewImpl` (écran carte principal de l'élève) — filet posé AVANT son
 * découpage en sous-composants et hooks (étape B4 de l'audit du 25/09/2026, § 3.3 ligne 5 :
 * « montage carte + barre d'outils + sélection de lieu ; cibles de 44 px »), sur le patron de
 * `tests-ui/AppShellWiring.test.jsx` et de `tests-ui/components/MapViewMount.test.jsx`.
 *
 * Le composant est monté pour de vrai, avec ses vraies modales de lieu ; seuls le réseau et
 * les hooks satellites (mascotte, GPS, catalogue, catégories) sont remplacés par des sondes.
 *
 * Cibles de 44 px : jsdom ne calcule pas la mise en page. Chaque commande effectivement rendue
 * dans la barre d'outils est donc confrontée à la cascade CSS réelle (`tests/helpers/cssCascade.js`,
 * le moteur de `tests/tap-target-guard.test.js`), avec sa vraie chaîne d'ancêtres, au doigt.
 */

const apiMock = vi.hoisted(() => vi.fn(async () => []));
vi.mock('../../../src/services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  api: apiMock,
}));

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
    mascotRegistry: { extras: [], offeredIds: null },
    edgeSnap: { snapPoint: () => null, ready: false, status: 'idle' },
    categories: { categories: [], loading: false, error: null, reload: noop },
  };
});
vi.mock('../../../src/hooks/useMapViewMascot.js', () => ({ default: () => stubs.mascot }));
vi.mock('../../../src/hooks/useMascotGpsFollow.js', () => ({ default: () => stubs.gps }));
vi.mock('../../../src/hooks/useVisitMascotCatalogExtras.js', () => ({
  default: () => stubs.extras,
  useVisitMascotRegistry: () => stubs.mascotRegistry,
}));
vi.mock('../../../src/hooks/useMapImageEdgeSnap.js', () => ({ default: () => stubs.edgeSnap }));
vi.mock('../../../src/hooks/useMapCategories.js', () => ({
  useMapCategories: () => stubs.categories,
}));
vi.mock('../../../src/components/TutorialReadAcknowledge', () => ({
  fetchTutorialReadIds: async () => new Set(),
}));
vi.mock('../../../src/components/context-comments', () => ({
  ContextComments: ({ title, defaultOpen }) => (
    <div data-testid="context-comments" data-open={defaultOpen ? 'true' : 'false'}>
      {title}
    </div>
  ),
}));
vi.mock('../../../src/hooks/useAudienceGroupOptions', () => ({
  useAudienceGroupOptions: () => [],
}));

const { MapView } = await import('../../../src/components/map-views.jsx');
const { PublicSettingsProvider } = await import('../../../src/contexts/PublicSettingsContext.jsx');
const { SessionProvider } = await import('../../../src/contexts/SessionContext.jsx');
const { DataProvider } = await import('../../../src/contexts/DataContext.jsx');

const require = createRequire(import.meta.url);
const { computedValue, loadSheet, toPx } = require('../../../tests/helpers/cssCascade.js');

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
    description: 'Arbres fruitiers.',
    category_ids: [],
    living_beings_list: [],
  },
];
const MARKERS = [
  {
    id: 11,
    map_id: 'foret',
    label: 'Compost',
    x_pct: 20,
    y_pct: 30,
    note: 'Bac à compost.',
    category_ids: [],
    living_beings_list: [],
  },
  { id: 12, map_id: 'lyautey', label: 'CDI', x_pct: 60, y_pct: 70, category_ids: [] },
];

function renderMapView(
  props = {},
  { isTeacher = false, settings = { modules: {}, ui: { map: {} } } } = {},
) {
  const dataValue = {
    zones: ZONES,
    markers: MARKERS,
    tasks: [],
    tutorials: [],
    plants: [],
    activeMapId: 'foret',
  };
  const handlers = {
    onMapChange: vi.fn(),
    onZoneUpdate: vi.fn(async () => {}),
    onRefresh: vi.fn(async () => {}),
    onForceLogout: vi.fn(),
    onLocationTasksFocus: vi.fn(),
    onPlaceRequestHandled: vi.fn(),
  };
  const view = render(
    <PublicSettingsProvider value={settings}>
      <SessionProvider value={{ isN3Affiliated: false, canParticipateContextComments: true }}>
        <DataProvider value={dataValue}>
          <MapView
            maps={MAPS}
            isTeacher={isTeacher}
            student={isTeacher ? null : { id: 'S1', first_name: 'Ada' }}
            {...handlers}
            {...props}
          />
        </DataProvider>
      </SessionProvider>
    </PublicSettingsProvider>,
  );
  return { view, handlers };
}

/** Délai large : la suite UI complète tourne en parallèle, et ce montage est lourd. */
const MOUNT_TIMEOUT = { timeout: 5000 };

async function waitForToolbar(view) {
  await waitFor(
    () => expect(view.container.querySelector('.map-view-toolbar')).not.toBeNull(),
    MOUNT_TIMEOUT,
  );
  return view.container.querySelector('.map-view-toolbar');
}

beforeEach(() => {
  apiMock.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('MapViewImpl — carte, barre d’outils, sélection d’un lieu', () => {
  test('élève : scène, barre d’outils, parcours, filtres', async () => {
    const { view } = renderMapView();
    const toolbar = await waitForToolbar(view);
    expect(view.container.querySelector('.map-view-root--solo')).not.toBeNull();
    expect(view.container.querySelector('.map-view-stage img')).not.toBeNull();
    expect(within(toolbar).getByRole('button', { name: /Nav/ })).toBeInTheDocument();
    // Pas d'outils d'édition pour un élève.
    expect(within(toolbar).queryByRole('button', { name: /Zone/ })).toBeNull();
    expect(view.container.querySelector('[data-testid="map-view-routes-row"]')).not.toBeNull();
    await waitFor(
      () => expect(view.container.querySelectorAll('.fm-pct-marker')).toHaveLength(1),
      MOUNT_TIMEOUT,
    );
    await waitFor(
      () => expect(apiMock).toHaveBeenCalledWith('/api/map-routes?map_id=foret&surface=map'),
      MOUNT_TIMEOUT,
    );
  });

  test('élève : toucher une zone ouvre sa fiche ; la fermer la désélectionne', async () => {
    const { view, handlers } = renderMapView();
    await waitForToolbar(view);
    const zone = view.container.querySelector('.fm-pct-zone[role="button"]');
    expect(zone).not.toBeNull();
    fireEvent.click(zone);
    const dialog = await screen.findByRole('dialog', { name: 'Zone Verger' });
    expect(within(dialog).getByText('Arbres fruitiers.')).toBeInTheDocument();
    expect(handlers.onLocationTasksFocus).toHaveBeenLastCalledWith({ kind: 'zone', id: '1' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(handlers.onLocationTasksFocus).toHaveBeenLastCalledWith(null);
  });

  test('élève : toucher un repère ouvre sa fiche', async () => {
    const { view, handlers } = renderMapView();
    await waitForToolbar(view);
    fireEvent.click(view.container.querySelector('.fm-pct-marker'));
    const dialog = await screen.findByRole('dialog', { name: 'Repère Compost' });
    expect(within(dialog).getByText('Bac à compost.')).toBeInTheDocument();
    expect(handlers.onLocationTasksFocus).toHaveBeenLastCalledWith({ kind: 'marker', id: '11' });
  });

  test('recherche d’un lieu : le résultat ouvre la fiche', async () => {
    const { view } = renderMapView();
    await waitForToolbar(view);
    const search = screen.getByRole('searchbox');
    fireEvent.change(search, { target: { value: 'Compost' } });
    const result = await screen.findByRole('button', { name: /Compost/ });
    fireEvent.click(result);
    expect(await screen.findByRole('dialog', { name: 'Repère Compost' })).toBeInTheDocument();
  });

  test('lien direct vers un lieu (notification) : fiche ouverte sur ses commentaires', async () => {
    const { handlers } = renderMapView({
      placeRequest: { kind: 'zone', id: '1', mapId: 'foret', nonce: 7 },
    });
    const dialog = await screen.findByRole('dialog', { name: 'Zone Verger' });
    expect(within(dialog).getByTestId('context-comments')).toHaveAttribute('data-open', 'true');
    expect(handlers.onPlaceRequestHandled).toHaveBeenCalledWith(7);
  });

  test('changement de carte depuis la barre d’outils', async () => {
    const { view, handlers } = renderMapView();
    const toolbar = await waitForToolbar(view);
    const select = within(toolbar).queryByRole('combobox', { name: 'Sélection de carte active' });
    const lyceeButton = within(toolbar).queryByRole('button', { name: 'Lycée' });
    if (select) fireEvent.change(select, { target: { value: 'lyautey' } });
    else fireEvent.click(lyceeButton);
    expect(handlers.onMapChange).toHaveBeenCalledWith('lyautey');
  });

  test('prof : outils d’édition ; mode « Repère » bascule sur le canevas d’édition', async () => {
    const { view } = renderMapView({}, { isTeacher: true });
    const toolbar = await waitForToolbar(view);
    expect(view.container.querySelector('.map-view-stage')).not.toBeNull();
    fireEvent.click(within(toolbar).getByRole('button', { name: /Repère/ }));
    await waitFor(() => expect(view.container.querySelector('.map-view-canvas')).not.toBeNull());
    expect(view.container.querySelector('.map-view-stage')).toBeNull();
    // Le canevas d'édition dessine les zones (SVG) et les repères (bulles).
    expect(view.container.querySelector('.map-zone-svg-layer')).not.toBeNull();
    expect(view.container.querySelectorAll('.map-bubble').length).toBeGreaterThan(0);
    // Retour à la navigation : scène partagée.
    fireEvent.click(within(toolbar).getByRole('button', { name: /Nav/ }));
    await waitFor(() => expect(view.container.querySelector('.map-view-stage')).not.toBeNull());
  });

  test('catégories cochées d’office : les lieux hors catégorie sont atténués', async () => {
    const saved = stubs.categories;
    stubs.categories = {
      ...saved,
      categories: [{ id: 'cat-verger', label: 'Verger', emoji: '🍎', applies_to: 'both' }],
    };
    try {
      const { view } = renderMapView(
        {},
        {
          settings: {
            modules: {},
            ui: { map: {} },
            map: { default_category_ids: 'cat-verger' },
          },
        },
      );
      await waitForToolbar(view);
      await waitFor(() =>
        expect(view.container.querySelector('.fm-pct-zone.is-seen')).not.toBeNull(),
      );
      expect(view.container.querySelector('.fm-pct-marker.is-seen')).not.toBeNull();
    } finally {
      stubs.categories = saved;
    }
  });

  test('parcours demandé par une séance : barre d’étape, puis reprise après sortie', async () => {
    const ROUTES = [
      {
        id: 1,
        slug: 'tour',
        title: 'Tour du verger',
        steps: [
          { target_type: 'zone', target_id: 1, step_title: 'Le verger' },
          { target_type: 'marker', target_id: 11 },
        ],
      },
    ];
    apiMock.mockImplementation(async (url) =>
      String(url).startsWith('/api/map-routes') ? ROUTES : [],
    );
    try {
      const onRouteRequestHandled = vi.fn();
      const { view } = renderMapView({
        routeRequest: { slug: 'tour', nonce: 5 },
        onRouteRequestHandled,
      });
      await waitForToolbar(view);
      const bar = await screen.findByRole(
        'complementary',
        { name: 'Parcours Tour du verger' },
        MOUNT_TIMEOUT,
      );
      expect(onRouteRequestHandled).toHaveBeenCalledWith(5);
      expect(within(bar).getByText('Le verger')).toBeInTheDocument();
      // Première étape : la fiche de la zone est ouverte.
      expect(await screen.findByRole('dialog', { name: 'Zone Verger' })).toBeInTheDocument();
      fireEvent.click(within(bar).getByRole('button', { name: /Quitter/ }));
      await waitFor(() =>
        expect(screen.queryByRole('complementary', { name: 'Parcours Tour du verger' })).toBeNull(),
      );
      expect(screen.getByRole('button', { name: 'Reprendre le parcours' })).toBeInTheDocument();
    } finally {
      apiMock.mockImplementation(async () => []);
    }
  });

  test('prof : fiche de lieu éditable (onglet Modifier)', async () => {
    const { view } = renderMapView({}, { isTeacher: true });
    await waitForToolbar(view);
    fireEvent.click(view.container.querySelector('.fm-pct-marker'));
    const dialog = await screen.findByRole('dialog', { name: 'Repère Compost' });
    expect(within(dialog).getByRole('button', { name: /Modifier/ })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Fermer' }));
    });
  });
});

// ── Cibles tactiles ≥ 44 px, sur les commandes réellement rendues ────────────────────────

const SRC = path.resolve(__dirname, '../../../src');
const TAP = 44;
const PHONE = { width: 390, height: 844, pointer: 'coarse', hover: 'none' };

function foretSheets() {
  const fs = require('node:fs');
  const main = fs.readFileSync(path.join(SRC, 'main.jsx'), 'utf8');
  const files = [...main.matchAll(/^import\s+['"](\.\/[^'"]+\.css)['"];?$/gm)].map((m) =>
    path.join(SRC, m[1]),
  );
  return files.flatMap((file) => loadSheet(file));
}

/** Chaîne d'ancêtres d'un élément rendu, du shell de l'application jusqu'à lui. */
function chainFor(element, shellAncestors) {
  const chain = [];
  for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
    chain.unshift({
      tag: node.tagName.toLowerCase(),
      classes: [...node.classList],
      attrs: Object.fromEntries([...node.attributes].map((a) => [a.name, a.value])),
    });
    if (node.classList.contains('map-view-root')) break;
  }
  return [
    { tag: 'html' },
    { tag: 'body' },
    { tag: 'div', id: 'root' },
    ...shellAncestors,
    ...chain,
  ];
}

function effectiveSize(rules, chain, dim) {
  const expanded = computedValue(rules, chain, dim, PHONE, { pseudoElement: 'after' });
  if (expanded && /^max\(\s*100%\s*,\s*44px\s*\)$/.test(expanded.value)) return TAP;
  const min = computedValue(rules, chain, `min-${dim}`, PHONE);
  const fixed = computedValue(rules, chain, dim, PHONE);
  const minPx = min ? toPx(min.value) : 0;
  const fixedPx = fixed ? toPx(fixed.value) : 0;
  return Math.max(Number.isNaN(minPx) ? 0 : minPx, Number.isNaN(fixedPx) ? 0 : fixedPx);
}

describe('MapViewImpl — cibles tactiles de la barre d’outils', () => {
  const rules = foretSheets();
  const SCREENS = {
    élève: {
      isTeacher: false,
      shell: [
        {
          tag: 'main',
          classes: ['main', 'app-main-shell', 'app-main-shell--student', 'main--map-visible'],
        },
      ],
    },
    prof: {
      isTeacher: true,
      shell: [
        {
          tag: 'main',
          classes: ['main', 'teacher-main', 'app-main-shell', 'teacher-main--map-visible'],
        },
      ],
    },
  };

  for (const [label, screenDef] of Object.entries(SCREENS)) {
    test(`${label} : chaque commande de la barre mesure au moins 44 px au doigt`, async () => {
      const { view } = renderMapView({}, { isTeacher: screenDef.isTeacher });
      const toolbar = await waitForToolbar(view);
      const controls = [...toolbar.querySelectorAll('button, select')];
      expect(controls.length).toBeGreaterThan(3);
      const offenders = [];
      for (const control of controls) {
        const chain = chainFor(control, screenDef.shell);
        const px = effectiveSize(rules, chain, 'height');
        if (!(px >= TAP)) {
          const name = control.getAttribute('aria-label') || control.textContent.trim();
          offenders.push(`${control.className || control.tagName} « ${name} » → ${px}px`);
        }
      }
      expect(offenders).toEqual([]);
    });
  }
});
