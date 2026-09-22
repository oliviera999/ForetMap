import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * Montage du plan des personnels — la **même** racine `AppPlan` que le plan public, montée
 * avec `STAFF_PLAN_VARIANT`.
 *
 * Deux raisons d'exister. D'abord le patron maison : un composant racine sans test de montage
 * laisse passer une zone morte temporelle, invisible au build. Ensuite, et surtout, la
 * variante est ce qui sépare une carte publique d'une carte portant des consignes internes :
 * si elle cesse d'être prise en compte, l'écran ne le dira pas, il servira simplement la
 * mauvaise API.
 */

const staffContent = vi.hoisted(() => ({
  map: { id: 'lyautey', label: 'Lycée Lyautey', map_image_url: '/maps/plan.jpg', gps_enabled: 0 },
  settings: {
    title: 'Plan personnels — Lyautey',
    welcome_hint: '',
    access_mode: 'disabled',
    attribution: '',
    default_category_ids: [],
    hidden_category_ids: [],
  },
  categories: [{ id: 'c-bat', slug: 'bat', label: 'Bâtiments', emoji: '🏢', color: '#dbeafe90' }],
  zones: [],
  routes: [],
  markers: [
    {
      id: 'm-chaufferie',
      label: 'Local technique',
      x_pct: 60,
      y_pct: 40,
      emoji: '🔧',
      category_ids: ['c-bat'],
      search_aliases: [],
      visit_subtitle: '',
      notes: [{ id: 1, title: 'Accès', body: 'Clé au bureau des agents.' }],
    },
  ],
  viewer: {
    via: 'account',
    role_slug: 'prof',
    can_edit_locations: false,
    console_base_url: '',
    can_report: true,
  },
}));

const planApiMock = vi.hoisted(() => ({
  fetchPlanContent: vi.fn(async () => staffContent),
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
const { STAFF_PLAN_VARIANT, PLAN_VARIANT } = await import('../../src/plan/utils/planVariants.js');

describe('AppPlan — variante « plan des personnels »', () => {
  beforeEach(() => {
    planApiMock.fetchPlanContent.mockClear();
    planApiMock.fetchPlanContent.mockResolvedValue(staffContent);
    window.localStorage.clear();
  });

  test('interroge l’API du plan des personnels, pas celle du plan public', async () => {
    render(<AppPlan variant={STAFF_PLAN_VARIANT} />);
    await waitFor(() =>
      expect(planApiMock.fetchPlanContent).toHaveBeenCalledWith(
        '',
        '',
        expect.objectContaining({ apiBase: '/api/staff-plan' }),
      ),
    );
  });

  test('les deux variantes n’écrivent pas dans les mêmes clés de stockage', () => {
    expect(STAFF_PLAN_VARIANT.storagePrefix).not.toBe(PLAN_VARIANT.storagePrefix);
    expect(STAFF_PLAN_VARIANT.apiBase).not.toBe(PLAN_VARIANT.apiBase);
  });

  test('401 auth_required : écran de connexion, sans champ de code tant qu’il est désactivé', async () => {
    planApiMock.fetchPlanContent.mockRejectedValueOnce(
      Object.assign(new Error('Connexion requise'), {
        status: 401,
        body: { auth_required: true, code_available: false },
      }),
    );
    render(<AppPlan variant={STAFF_PLAN_VARIANT} />);
    expect(await screen.findByRole('button', { name: /Se connecter avec Google/ })).toBeTruthy();
    expect(screen.queryByLabelText('Code d’accès')).toBeNull();
    expect(screen.queryByRole('button', { name: /entrer un code/i })).toBeNull();
  });

  test('401 avec code_available : la voie par code est proposée, en second', async () => {
    planApiMock.fetchPlanContent.mockRejectedValueOnce(
      Object.assign(new Error('Connexion requise'), {
        status: 401,
        body: { auth_required: true, code_available: true },
      }),
    );
    render(<AppPlan variant={STAFF_PLAN_VARIANT} />);
    const switchToCode = await screen.findByRole('button', { name: /entrer un code/i });
    // La connexion par compte reste l'action principale affichée d'emblée.
    expect(screen.getByRole('button', { name: /Se connecter avec Google/ })).toBeTruthy();
    expect(screen.queryByLabelText('Code d’accès')).toBeNull();

    fireEvent.click(switchToCode);
    expect(await screen.findByLabelText('Code d’accès')).toBeTruthy();
  });
});
