import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { abandonAllOverlays } from '../../src/shared/platform/overlayHistory.js';
import { resetBottomSheetInsets } from '../../src/shared/ui/bottomSheetInset.js';

/**
 * Montage du plan e-nov — la **même** racine `AppPlan`, montée avec `ENOV_PLAN_VARIANT`
 * (patron `StaffPlanMount.test.jsx`). Ce qui est vérifié ici n'existe que sur ce plan : les
 * lieux labellisés ressortent (halo, autres lieux estompés, pastille réglable), la puce
 * « Innovations » les liste, et leur fiche s'ouvre sur le texte e-nov.
 */

const enovContent = vi.hoisted(() => ({
  map: { id: 'lyautey', label: 'Lycée Lyautey', map_image_url: '/maps/plan.jpg', gps_enabled: 0 },
  settings: {
    title: 'Plan e-nov',
    welcome_hint: '',
    access_mode: 'public',
    attribution: '',
    default_category_ids: [],
    hidden_category_ids: [],
    enov: {
      highlight_category_ids: ['cat-enov'],
      highlight_color: '#22aa88',
      badge_enabled: true,
      innovations_label: 'Innovations',
    },
  },
  categories: [
    { id: 'cat-enov', slug: 'enov', label: 'e-nov', emoji: '💡', color: '#f59e0b90' },
    { id: 'c-salles', slug: 'salles', label: 'Salles', emoji: '🚪', color: '#dbeafe90' },
  ],
  zones: [
    {
      id: 'z-cdi',
      name: 'CDI',
      points: '[{"xp":10,"yp":10},{"xp":30,"yp":10},{"xp":30,"yp":30}]',
      emoji: '📚',
      category_ids: ['c-salles', 'cat-enov'],
      search_aliases: [],
      visit_subtitle: 'Centre de documentation',
      visit_short_description: 'Livres, presse et postes de travail.',
      is_enov: true,
      enov_description: 'Espace de robotique ouvert aux élèves.',
    },
    {
      id: 'z-hall',
      name: 'Hall',
      points: '[{"xp":50,"yp":50},{"xp":70,"yp":50},{"xp":70,"yp":70}]',
      emoji: '🏛️',
      category_ids: ['c-salles'],
      search_aliases: [],
      visit_subtitle: '',
      is_enov: false,
      enov_description: '',
    },
  ],
  routes: [],
  markers: [
    {
      id: 'm-fablab',
      label: 'Fablab',
      x_pct: 60,
      y_pct: 20,
      emoji: '🛠️',
      category_ids: ['cat-enov'],
      search_aliases: [],
      visit_subtitle: '',
      is_enov: true,
      enov_description: 'Imprimantes 3D en libre accès.',
    },
    {
      id: 'm-gym',
      label: 'Gymnase',
      x_pct: 80,
      y_pct: 80,
      emoji: '🏀',
      category_ids: ['c-salles'],
      search_aliases: [],
      visit_subtitle: '',
      is_enov: false,
      enov_description: '',
    },
  ],
}));

const planApiMock = vi.hoisted(() => ({
  fetchPlanContent: vi.fn(async () => enovContent),
  reportPlanUsage: vi.fn(),
  submitPlanAccessCode: vi.fn(async () => ({ ok: true })),
  submitPlanLogout: vi.fn(async () => ({ ok: true })),
  submitPlaceSuggestion: vi.fn(async () => ({ ok: true })),
  fetchPlanShellSettings: vi.fn(async () => ({})),
}));
vi.mock('../../src/plan/planApi.js', () => planApiMock);

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
const { ENOV_PLAN_VARIANT, PLAN_VARIANT, STAFF_PLAN_VARIANT } =
  await import('../../src/plan/utils/planVariants.js');

beforeEach(() => {
  planApiMock.fetchPlanContent.mockClear();
  planApiMock.fetchPlanContent.mockResolvedValue(enovContent);
  planApiMock.reportPlanUsage.mockClear();
  window.localStorage.clear();
  abandonAllOverlays();
  resetBottomSheetInsets();
  window.history.replaceState(null, '', '/');
});

async function mountEnov() {
  const utils = render(<AppPlan variant={ENOV_PLAN_VARIANT} />);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan e-nov' })).toBeTruthy());
  return utils;
}

describe('AppPlan — variante « plan e-nov »', () => {
  test('interroge l’API du plan e-nov, clés de stockage et compteur propres', async () => {
    await mountEnov();
    expect(planApiMock.fetchPlanContent).toHaveBeenCalledWith(
      '',
      '',
      expect.objectContaining({ apiBase: '/api/enov' }),
    );
    expect(ENOV_PLAN_VARIANT.storagePrefix).not.toBe(PLAN_VARIANT.storagePrefix);
    expect(ENOV_PLAN_VARIANT.storagePrefix).not.toBe(STAFF_PLAN_VARIANT.storagePrefix);
    expect(planApiMock.reportPlanUsage).toHaveBeenCalledWith(
      'open',
      'lyautey',
      expect.objectContaining({ usageProduct: 'enov' }),
    );
  });

  test('carte : lieux e-nov mis en avant, les autres estompés, pastille et couleur réglées', async () => {
    const { container } = await mountEnov();
    expect(container.querySelector('.plan-map.has-highlight')).toBeTruthy();
    const highlightedZone = container.querySelector('.fm-pct-zone.is-highlight');
    expect(highlightedZone?.getAttribute('aria-label')).toMatch(/CDI — Innovation e-nov/);
    expect(container.querySelectorAll('.fm-pct-zone.is-highlight')).toHaveLength(1);
    const fablab = screen.getByRole('button', { name: /Fablab — Innovation e-nov/ });
    expect(fablab.className).toContain('is-highlight');
    expect(within(fablab).getByText('e-nov')).toBeTruthy();
    const gym = screen.getByRole('button', { name: /^Gymnase/ });
    expect(gym.className).not.toContain('is-highlight');
    // Couleur du halo : variable posée sur la coquille (et sur la racine du document, pour
    // les feuilles basses montées en portail).
    expect(
      container.querySelector('.plan-shell').style.getPropertyValue('--pct-highlight-color'),
    ).toBe('#22aa88');
  });

  test('sans pastille réglée : le halo seul', async () => {
    planApiMock.fetchPlanContent.mockResolvedValue({
      ...enovContent,
      settings: {
        ...enovContent.settings,
        enov: { ...enovContent.settings.enov, badge_enabled: false },
      },
    });
    const { container } = await mountEnov();
    expect(container.querySelector('.fm-pct-marker.is-highlight')).toBeTruthy();
    expect(container.querySelector('.fm-pct-highlight-badge')).toBeNull();
  });

  test('puce « Innovations » : liste les lieux mis en avant, et la fiche s’ouvre sur le texte e-nov', async () => {
    await mountEnov();
    const chip = screen.getByTestId('plan-innovations-button');
    expect(chip.textContent).toContain('Innovations');
    expect(chip.textContent).toContain('2');
    fireEvent.click(chip);

    const sheet = await screen.findByTestId('plan-results-sheet');
    expect(within(sheet).getByText('Innovations (2)')).toBeTruthy();
    expect(within(sheet).getByText('CDI')).toBeTruthy();
    expect(within(sheet).getByText('Fablab')).toBeTruthy();
    expect(within(sheet).queryByText('Hall')).toBeNull();
    expect(planApiMock.reportPlanUsage).toHaveBeenCalledWith(
      'innovations_open',
      '2',
      expect.objectContaining({ id: 'enov' }),
    );

    fireEvent.click(within(sheet).getByText('CDI').closest('button'));
    const placeSheet = await screen.findByTestId('plan-place-sheet');
    const enovBlock = within(placeSheet).getByTestId('plan-place-enov');
    expect(enovBlock.textContent).toContain('Innovation e-nov');
    expect(enovBlock.textContent).toContain('Espace de robotique ouvert aux élèves.');
    // Le bloc e-nov passe AVANT le sous-titre et l'accroche de la fiche.
    const subtitle = within(placeSheet).getByText('Centre de documentation');
    expect(
      enovBlock.compareDocumentPosition(subtitle) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test('un lieu ordinaire n’a pas de bloc e-nov', async () => {
    await mountEnov();
    fireEvent.click(screen.getByRole('button', { name: /^Gymnase/ }));
    const placeSheet = await screen.findByTestId('plan-place-sheet');
    expect(within(placeSheet).queryByTestId('plan-place-enov')).toBeNull();
  });
});

describe('AppPlan — plan public : aucune mise en avant', () => {
  test('même charge servie au plan public : ni puce, ni pastille, ni bloc e-nov', async () => {
    const { container } = render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan e-nov' })).toBeTruthy());
    // Le drapeau `map_highlight` vient de la charge ; c'est la variante qui allume le reste.
    expect(screen.queryByTestId('plan-innovations-button')).toBeNull();
    expect(container.querySelector('.fm-pct-highlight-badge')).toBeNull();
    expect(
      container.querySelector('.plan-shell').style.getPropertyValue('--pct-highlight-color'),
    ).toBe('');
    fireEvent.click(screen.getByRole('button', { name: /^Fablab/ }));
    const placeSheet = await screen.findByTestId('plan-place-sheet');
    expect(within(placeSheet).queryByTestId('plan-place-enov')).toBeNull();
  });
});
