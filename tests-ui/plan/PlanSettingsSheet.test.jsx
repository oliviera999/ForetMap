import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { abandonAllOverlays } from '../../src/shared/platform/overlayHistory.js';
import { resetBottomSheetInsets } from '../../src/shared/ui/bottomSheetInset.js';

/**
 * Réglages du lecteur sur les deux plans : **changer de plan affiché** et **se déconnecter**.
 *
 * Montage réel d'`AppPlan` — seuls le transport et le moteur de carte sont simulés. Les deux
 * gestes touchent à ce qui rend l'appareil : un changement de plan qui garderait le lieu
 * sélectionné viserait un repère d'un autre bâtiment, et une déconnexion qui garderait le
 * code du lien profond ne déconnecterait rien.
 */

const CONTENT_LYAUTEY = vi.hoisted(() => ({
  map: { id: 'lyautey', label: 'Lycée Lyautey', map_image_url: '/maps/plan.jpg', gps_enabled: 0 },
  settings: {
    title: 'Plan Lyautey',
    welcome_hint: '',
    access_mode: 'public',
    attribution: '',
    default_category_ids: [],
    hidden_category_ids: [],
  },
  maps: [
    { id: 'lyautey', label: 'Lycée Lyautey' },
    { id: 'annexe', label: 'Annexe Roches Noires' },
  ],
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
      visit_subtitle: '',
    },
  ],
}));

const CONTENT_ANNEXE = vi.hoisted(() => ({
  map: {
    id: 'annexe',
    label: 'Annexe Roches Noires',
    map_image_url: '/maps/a.jpg',
    gps_enabled: 0,
  },
  settings: {
    title: 'Plan Lyautey',
    welcome_hint: '',
    access_mode: 'public',
    attribution: '',
    default_category_ids: [],
    hidden_category_ids: [],
  },
  maps: [
    { id: 'lyautey', label: 'Lycée Lyautey' },
    { id: 'annexe', label: 'Annexe Roches Noires' },
  ],
  categories: [],
  zones: [],
  routes: [],
  markers: [
    {
      id: 'm-atelier',
      label: 'Atelier',
      x_pct: 20,
      y_pct: 20,
      emoji: '🔧',
      category_ids: [],
      search_aliases: [],
      visit_subtitle: '',
    },
  ],
}));

const planApiMock = vi.hoisted(() => ({
  fetchPlanContent: vi.fn(async () => CONTENT_LYAUTEY),
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
const { STAFF_PLAN_VARIANT } = await import('../../src/plan/utils/planVariants.js');

/** Ouvre la feuille de réglages depuis la barre haute. */
async function openSettings() {
  const button = await screen.findByTestId('plan-settings-button');
  fireEvent.click(button);
  return screen.findByTestId('plan-settings-sheet');
}

beforeEach(() => {
  for (const fn of Object.values(planApiMock)) fn.mockClear?.();
  planApiMock.fetchPlanContent.mockResolvedValue(CONTENT_LYAUTEY);
  planApiMock.submitPlanLogout.mockResolvedValue({ ok: true });
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
  abandonAllOverlays();
  resetBottomSheetInsets();
});

describe('AppPlan — réglages : plan affiché', () => {
  test('un seul plan publié : aucun bouton de réglages sur un plan public ouvert', async () => {
    planApiMock.fetchPlanContent.mockResolvedValue({ ...CONTENT_LYAUTEY, maps: [] });
    render(<AppPlan />);
    await screen.findByRole('button', { name: 'Gymnase' });
    // Rien à régler : pas de session à rendre, pas d'autre plan — pas de bouton non plus.
    expect(screen.queryByTestId('plan-settings-button')).toBeNull();
  });

  test('plusieurs plans : le sélecteur recharge la charge, mémorise le choix et met l’adresse à jour', async () => {
    render(<AppPlan />);
    await screen.findByRole('button', { name: 'Gymnase' });

    await openSettings();
    planApiMock.fetchPlanContent.mockResolvedValue(CONTENT_ANNEXE);
    fireEvent.click(screen.getByRole('button', { name: /Annexe Roches Noires/ }));

    await waitFor(() =>
      expect(planApiMock.fetchPlanContent).toHaveBeenLastCalledWith(
        'annexe',
        '',
        expect.objectContaining({ apiBase: '/api/plan' }),
      ),
    );
    expect(await screen.findByRole('button', { name: 'Atelier' })).toBeTruthy();
    // Mémorisé sur l'appareil…
    expect(JSON.parse(window.localStorage.getItem('plan:map-id'))).toBe('annexe');
    // …et porté par l'adresse, pour qu'un lien copié rouvre le même plan.
    expect(window.location.search).toContain('map_id=annexe');
  });

  test('changer de plan oublie le lieu ouvert : un repère de l’autre carte ne survit pas', async () => {
    render(<AppPlan />);
    fireEvent.click(await screen.findByRole('button', { name: 'Gymnase' }));
    await screen.findByRole('heading', { name: 'Gymnase' });

    await openSettings();
    planApiMock.fetchPlanContent.mockResolvedValue(CONTENT_ANNEXE);
    fireEvent.click(screen.getByRole('button', { name: /Annexe Roches Noires/ }));

    await screen.findByRole('button', { name: 'Atelier' });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Gymnase' })).toBeNull());
    expect(window.location.search).not.toContain('lieu=');
  });

  test('plan mémorisé qui n’est plus proposé (400) : repli sur le plan de l’établissement', async () => {
    window.localStorage.setItem('plan:map-id', JSON.stringify('disparu'));
    planApiMock.fetchPlanContent.mockRejectedValueOnce(
      Object.assign(new Error('Carte introuvable'), { status: 400 }),
    );
    render(<AppPlan />);

    await waitFor(() =>
      expect(planApiMock.fetchPlanContent).toHaveBeenLastCalledWith(
        '',
        '',
        expect.objectContaining({ apiBase: '/api/plan' }),
      ),
    );
    expect(await screen.findByRole('button', { name: 'Gymnase' })).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem('plan:map-id'))).toBe('');
  });
});

describe('AppPlan — réglages : déconnexion', () => {
  test('plan public ouvert : aucune déconnexion proposée', async () => {
    render(<AppPlan />);
    await screen.findByRole('button', { name: 'Gymnase' });
    await openSettings();
    expect(screen.queryByTestId('plan-logout')).toBeNull();
  });

  test('plan public fermé par un code : la déconnexion rend le laissez-passer et ramène la porte', async () => {
    const gated = {
      ...CONTENT_LYAUTEY,
      settings: { ...CONTENT_LYAUTEY.settings, access_mode: 'code' },
    };
    planApiMock.fetchPlanContent.mockResolvedValue(gated);
    render(<AppPlan />);
    await screen.findByRole('button', { name: 'Gymnase' });

    await openSettings();
    planApiMock.fetchPlanContent.mockRejectedValue(
      Object.assign(new Error('Code d’accès requis'), {
        status: 401,
        body: { access_required: true },
      }),
    );
    fireEvent.click(screen.getByTestId('plan-logout'));

    await waitFor(() => expect(planApiMock.submitPlanLogout).toHaveBeenCalledTimes(1));
    // La charge est redemandée : le serveur referme, et l'écran de saisie du code revient.
    expect(await screen.findByLabelText('Code d’accès')).toBeTruthy();
  });

  test('code d’un lien profond : il part avec la session, adresse comprise', async () => {
    window.history.replaceState(null, '', '/?code=secret');
    const gated = {
      ...CONTENT_LYAUTEY,
      settings: { ...CONTENT_LYAUTEY.settings, access_mode: 'code' },
    };
    planApiMock.fetchPlanContent.mockResolvedValue(gated);
    render(<AppPlan />);
    await screen.findByRole('button', { name: 'Gymnase' });
    expect(planApiMock.fetchPlanContent).toHaveBeenLastCalledWith('', 'secret', expect.anything());

    await openSettings();
    planApiMock.fetchPlanContent.mockRejectedValue(
      Object.assign(new Error('Code d’accès requis'), {
        status: 401,
        body: { access_required: true },
      }),
    );
    fireEvent.click(screen.getByTestId('plan-logout'));

    await waitFor(() => expect(planApiMock.submitPlanLogout).toHaveBeenCalledTimes(1));
    // Le code ne repart pas avec la requête suivante : sinon le laissez-passer serait reposé
    // aussitôt et la déconnexion n'aurait rien déconnecté.
    await waitFor(() =>
      expect(planApiMock.fetchPlanContent).toHaveBeenLastCalledWith('', '', expect.anything()),
    );
    expect(window.location.search).not.toContain('code=');
  });

  test('plan des personnels : la déconnexion oublie le jeton et ramène l’écran de connexion', async () => {
    window.localStorage.setItem('staffplan_auth_token', 'jeton-de-test');
    planApiMock.fetchPlanContent.mockResolvedValue({
      ...CONTENT_LYAUTEY,
      maps: [],
      viewer: {
        via: 'account',
        role_slug: 'prof',
        can_edit_locations: false,
        console_base_url: '',
        can_report: false,
      },
    });
    render(<AppPlan variant={STAFF_PLAN_VARIANT} />);
    await screen.findByRole('button', { name: 'Gymnase' });

    await openSettings();
    planApiMock.fetchPlanContent.mockRejectedValue(
      Object.assign(new Error('Connexion requise'), {
        status: 401,
        body: { auth_required: true, code_available: false },
      }),
    );
    fireEvent.click(screen.getByTestId('plan-logout'));

    await waitFor(() =>
      expect(planApiMock.submitPlanLogout).toHaveBeenCalledWith(
        expect.objectContaining({ apiBase: '/api/staff-plan' }),
      ),
    );
    expect(window.localStorage.getItem('staffplan_auth_token')).toBeNull();
    expect(await screen.findByRole('button', { name: /Se connecter avec Google/ })).toBeTruthy();
  });

  test('déconnexion refusée : le message le dit, la session n’est pas présumée rendue', async () => {
    planApiMock.fetchPlanContent.mockResolvedValue({
      ...CONTENT_LYAUTEY,
      maps: [],
      viewer: { via: 'account', role_slug: 'prof', can_report: false },
    });
    planApiMock.submitPlanLogout.mockRejectedValue(new Error('Réseau indisponible'));
    render(<AppPlan variant={STAFF_PLAN_VARIANT} />);
    await screen.findByRole('button', { name: 'Gymnase' });

    await openSettings();
    fireEvent.click(screen.getByTestId('plan-logout'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Réseau indisponible');
    expect(screen.getByTestId('plan-logout').hasAttribute('disabled')).toBe(false);
  });
});
