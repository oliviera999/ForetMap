import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { abandonAllOverlays } from '../../src/shared/platform/overlayHistory.js';
import { resetBottomSheetInsets } from '../../src/shared/ui/bottomSheetInset.js';

/**
 * Lien porteur du code d'accès (`?code=`, QR code interne) : le code sert une fois, dans le
 * corps d'un `POST /access`, puis quitte l'adresse. Il ne doit jamais partir dans l'adresse
 * d'une lecture (`/content?code=`), qui finirait dans le cache du service worker et dans les
 * journaux de requêtes.
 */

const content = vi.hoisted(() => ({
  map: { id: 'lyautey', label: 'Lycée Lyautey', map_image_url: '/maps/plan.jpg', gps_enabled: 0 },
  settings: {
    title: 'Plan Lyautey',
    welcome_hint: '',
    access_mode: 'code',
    attribution: '',
    default_category_ids: [],
    hidden_category_ids: [],
  },
  categories: [],
  zones: [],
  routes: [],
  markers: [
    {
      id: 'm-gym',
      label: 'Gymnase',
      x_pct: 60,
      y_pct: 40,
      emoji: '🏀',
      category_ids: [],
      search_aliases: [],
    },
  ],
}));

const planApiMock = vi.hoisted(() => ({
  fetchPlanContent: vi.fn(async () => content),
  reportPlanUsage: vi.fn(),
  submitPlanAccessCode: vi.fn(async () => ({ ok: true, required: true })),
  submitPlanLogout: vi.fn(async () => ({ ok: true })),
  submitPlaceSuggestion: vi.fn(async () => ({ ok: true })),
  fetchPlanShellSettings: vi.fn(async () => ({})),
}));
vi.mock('../../src/plan/planApi.js', () => planApiMock);

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

const positionStub = vi.hoisted(() => ({
  supported: true,
  available: false,
  mode: 'off',
  active: false,
  following: false,
  status: 'idle',
  feedback: null,
  error: null,
  positionPct: null,
  displayPct: null,
  accuracyM: null,
  haloPct: 0,
  headingDeg: null,
  screenHeadingDeg: null,
  smoothedScreenHeadingDeg: null,
  headingAvailable: false,
  planSize: null,
  toggle: () => {},
  stop: () => {},
  notifyManualPan: () => {},
}));
vi.mock('../../src/shared/pct-map/useMapPosition.js', () => ({
  useMapPosition: () => positionStub,
}));

vi.mock('../../src/components/auth/startGoogleAuth.js', () => ({
  startGoogleAuth: vi.fn(),
}));

const { AppPlan } = await import('../../src/plan/AppPlan.jsx');
const { ENOV_PLAN_VARIANT, STAFF_PLAN_VARIANT } =
  await import('../../src/plan/utils/planVariants.js');

const SECRET = 'code-du-qr-2026';

const accessRequired = () =>
  Object.assign(new Error('Code d’accès requis'), {
    status: 401,
    body: { access_required: true },
  });

/** Aucun appel de lecture ne porte le code, sous aucune forme. */
function expectCodeNeverInContentRequests() {
  for (const call of planApiMock.fetchPlanContent.mock.calls) {
    expect(JSON.stringify(call)).not.toContain(SECRET);
  }
}

beforeEach(() => {
  planApiMock.fetchPlanContent.mockReset();
  planApiMock.fetchPlanContent.mockResolvedValue(content);
  planApiMock.submitPlanAccessCode.mockReset();
  planApiMock.submitPlanAccessCode.mockResolvedValue({ ok: true, required: true });
  planApiMock.submitPlanLogout.mockClear();
  window.localStorage.clear();
  abandonAllOverlays();
  resetBottomSheetInsets();
  window.history.replaceState(null, '', '/');
});

describe('lien porteur du code (?code=)', () => {
  test('le code part dans un POST, la charge est lue sans lui, puis il quitte l’adresse', async () => {
    window.history.replaceState(null, '', `/?code=${SECRET}&lieu=m-gym`);
    render(<AppPlan />);
    await screen.findByRole('heading', { name: 'Plan Lyautey' });

    expect(planApiMock.submitPlanAccessCode).toHaveBeenCalledWith(
      SECRET,
      expect.objectContaining({ apiBase: '/api/plan' }),
    );
    // Le laissez-passer est posé avant la lecture : l'échange précède le premier chargement.
    expect(planApiMock.submitPlanAccessCode.mock.invocationCallOrder[0]).toBeLessThan(
      planApiMock.fetchPlanContent.mock.invocationCallOrder[0],
    );
    expectCodeNeverInContentRequests();
    await waitFor(() => expect(window.location.search).not.toContain('code='));
    // Le reste de l'adresse (lieu ouvert par le QR code) est conservé.
    expect(window.location.search).toContain('lieu=m-gym');
  });

  test('plan e-nov : même échange, sur sa propre API', async () => {
    window.history.replaceState(null, '', `/?code=${SECRET}`);
    render(<AppPlan variant={ENOV_PLAN_VARIANT} />);
    await waitFor(() =>
      expect(planApiMock.submitPlanAccessCode).toHaveBeenCalledWith(
        SECRET,
        expect.objectContaining({ apiBase: '/api/enov' }),
      ),
    );
    await waitFor(() => expect(window.location.search).not.toContain('code='));
    expectCodeNeverInContentRequests();
  });

  test('code refusé : il quitte aussi l’adresse, et l’écran de saisie s’affiche', async () => {
    window.history.replaceState(null, '', `/?code=${SECRET}`);
    planApiMock.submitPlanAccessCode.mockRejectedValueOnce(
      Object.assign(new Error('Code incorrect'), { status: 401 }),
    );
    planApiMock.fetchPlanContent.mockRejectedValue(accessRequired());
    render(<AppPlan />);
    expect(await screen.findByLabelText('Code d’accès')).toBeTruthy();
    expect(window.location.search).not.toContain('code=');
    expectCodeNeverInContentRequests();
  });

  test('réseau coupé pendant l’échange : le code reste dans l’adresse pour réessayer', async () => {
    window.history.replaceState(null, '', `/?code=${SECRET}`);
    planApiMock.submitPlanAccessCode.mockRejectedValueOnce(new Error('Réseau indisponible'));
    render(<AppPlan />);
    await screen.findByText('Le plan n’a pas pu être chargé.');
    expect(window.location.search).toContain(`code=${SECRET}`);
    expectCodeNeverInContentRequests();

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await screen.findByRole('heading', { name: 'Plan Lyautey' });
    expect(planApiMock.submitPlanAccessCode).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(window.location.search).not.toContain('code='));
  });

  test('plan des personnels : un ?code= n’ouvre rien, mais ne reste pas dans l’adresse', async () => {
    window.history.replaceState(null, '', `/?code=${SECRET}`);
    planApiMock.fetchPlanContent.mockRejectedValue(
      Object.assign(new Error('Connexion requise'), {
        status: 401,
        body: { auth_required: true, code_available: true },
      }),
    );
    render(<AppPlan variant={STAFF_PLAN_VARIANT} />);
    await waitFor(() => expect(planApiMock.fetchPlanContent).toHaveBeenCalled());
    await waitFor(() => expect(window.location.search).not.toContain('code='));
    expect(planApiMock.submitPlanAccessCode).not.toHaveBeenCalled();
    expectCodeNeverInContentRequests();
  });
});

describe('code saisi à l’écran', () => {
  test('le laissez-passer est posé, puis la charge est relue sans le code', async () => {
    planApiMock.fetchPlanContent.mockRejectedValueOnce(accessRequired());
    render(<AppPlan />);
    const input = await screen.findByLabelText('Code d’accès');
    fireEvent.change(input, { target: { value: SECRET } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrer' }));
    await screen.findByRole('heading', { name: 'Plan Lyautey' });
    expect(planApiMock.submitPlanAccessCode).toHaveBeenCalledWith(SECRET, expect.anything());
    expect(planApiMock.fetchPlanContent).toHaveBeenCalledTimes(2);
    expectCodeNeverInContentRequests();
    expect(window.location.search).not.toContain('code=');
  });
});
