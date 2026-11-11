import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { abandonAllOverlays } from '../../src/shared/platform/overlayHistory.js';
import { resetBottomSheetInsets } from '../../src/shared/ui/bottomSheetInset.js';

/**
 * Tests de fumée des trois surfaces « plan » — plan public, plan des personnels, plan
 * e-nov — montées **comme leur point d'entrée** (`src/plan/main.jsx`, `src/staff/main.jsx`,
 * `src/enov/main.jsx`) : `ErrorBoundary` → `AppDialogsProvider` → (`StaffMfaGate`) → `AppPlan`.
 *
 * Posés avec le découpage d'`App.jsx` (lot 6) comme filet commun à toutes les surfaces :
 * l'écran d'accueil de chacune doit se monter sans tomber sur l'`ErrorBoundary`. Le détail
 * de chaque variante est couvert par `AppPlanMount`, `StaffPlanMount` et `EnovPlanMount`.
 */

const content = vi.hoisted(() => ({
  map: { id: 'lyautey', label: 'Plan test', map_image_url: '/maps/plan.jpg', gps_enabled: 0 },
  settings: {
    title: 'Plan fumée',
    welcome_hint: '',
    access_mode: 'public',
    attribution: '',
    default_category_ids: [],
    hidden_category_ids: [],
  },
  categories: [
    { id: 'c-salles', slug: 'salles', label: 'Salles', emoji: '🚪', color: '#dbeafe90' },
  ],
  zones: [],
  routes: [],
  markers: [],
}));

const planApiMock = vi.hoisted(() => ({
  fetchPlanContent: vi.fn(async () => content),
  reportPlanUsage: vi.fn(),
  submitPlanAccessCode: vi.fn(async () => ({ ok: true })),
  submitPlanLogout: vi.fn(async () => ({ ok: true })),
  submitPlaceSuggestion: vi.fn(async () => ({ ok: true })),
  fetchPlanShellSettings: vi.fn(async () => ({})),
}));
vi.mock('../../src/plan/planApi.js', () => planApiMock);

vi.mock('../../src/components/auth/startGoogleAuth.js', () => ({
  startGoogleAuth: vi.fn(),
}));

// Moteur de carte : sonde à identités stables (cf. AppPlanMount.test.jsx).
const viewportStub = vi.hoisted(() => {
  const noop = () => {};
  const ref = () => {};
  return {
    containerRef: ref,
    worldRef: ref,
    imgRef: ref,
    committed: { x: 0, y: 0, s: 1 },
    fitRect: { offsetX: 0, offsetY: 0, width: 300, height: 200 },
    fitScale: 1,
    stageSize: { w: 390, h: 700 },
    fitMap: noop,
    fitMapAnimated: noop,
    zoomBy: noop,
    focusOnPct: noop,
    followPct: noop,
    consumeSkipClick: () => false,
    touchAction: 'none',
    setMapOrientation: noop,
    orientStyle: undefined,
  };
});
vi.mock('../../src/shared/pct-map/usePctMapViewport.js', () => ({
  usePctMapViewport: () => viewportStub,
}));

const { AppPlan } = await import('../../src/plan/AppPlan.jsx');
const { StaffMfaGate } = await import('../../src/plan/StaffMfaGate.jsx');
const { ErrorBoundary } = await import('../../src/components/ErrorBoundary.jsx');
const { AppDialogsProvider } = await import('../../src/shared/components/AppDialogsProvider.jsx');
const { PLAN_VARIANT, STAFF_PLAN_VARIANT, ENOV_PLAN_VARIANT } =
  await import('../../src/plan/utils/planVariants.js');

let consoleErrorSpy;

beforeEach(() => {
  planApiMock.fetchPlanContent.mockClear();
  planApiMock.fetchPlanContent.mockResolvedValue(content);
  window.localStorage.clear();
  window.sessionStorage.clear();
  abandonAllOverlays();
  resetBottomSheetInsets();
  window.history.replaceState(null, '', '/');
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  consoleErrorSpy.mockRestore();
});

async function expectPlanHome(tree) {
  render(<ErrorBoundary>{tree}</ErrorBoundary>);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan fumée' })).toBeTruthy());
  expect(planApiMock.fetchPlanContent).toHaveBeenCalled();
  // `ErrorBoundary` journalise l'erreur attrapée : aucune ne doit être passée par là.
  const caught = consoleErrorSpy.mock.calls.filter((args) =>
    args.some((a) => a instanceof Error || /error occurred/i.test(String(a))),
  );
  expect(caught).toEqual([]);
}

describe('Surfaces « plan » — fumée', () => {
  test('plan public : l’écran d’accueil se monte sans erreur', async () => {
    await expectPlanHome(
      <AppDialogsProvider>
        <AppPlan variant={PLAN_VARIANT} />
      </AppDialogsProvider>,
    );
  });

  test('plan des personnels : l’écran d’accueil se monte sans erreur', async () => {
    await expectPlanHome(
      <AppDialogsProvider>
        <StaffMfaGate challenge={null}>
          <AppPlan variant={STAFF_PLAN_VARIANT} />
        </StaffMfaGate>
      </AppDialogsProvider>,
    );
  });

  test('plan e-nov : l’écran d’accueil se monte sans erreur', async () => {
    await expectPlanHome(
      <AppDialogsProvider>
        <AppPlan variant={ENOV_PLAN_VARIANT} />
      </AppDialogsProvider>,
    );
  });
});
