import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * Montage réel du shell du Plan Lyautey (lot 4), au patron de `AppShellWiring.test.jsx` :
 * un composant racine sans test de montage laisse passer une zone morte temporelle (un
 * `const` référencé plus haut dans le corps), invisible au build comme aux tests purs.
 *
 * Seuls le transport (`planApi`) et le moteur de carte sont simulés : le reste — recherche,
 * filtres, feuilles basses, lien profond — est le vrai code.
 */

const content = vi.hoisted(() => ({
  map: { id: 'lyautey', label: 'Lycée Lyautey', map_image_url: '/maps/plan.jpg', gps_enabled: 0 },
  settings: {
    title: 'Plan Lyautey',
    welcome_hint: 'Touchez un lieu, ou cherchez-le.',
    access_mode: 'public',
    attribution: 'Fond : plan interne',
    default_category_ids: [],
    hidden_category_ids: [],
  },
  categories: [
    { id: 'c-salles', slug: 'salles', label: 'Salles', emoji: '🚪', color: '#dbeafe90' },
    { id: 'c-sport', slug: 'sport', label: 'Sport', emoji: '🏃', color: '#fee2e290' },
  ],
  zones: [
    {
      id: 'z-cdi',
      name: 'CDI',
      points: '[{"xp":10,"yp":10},{"xp":30,"yp":10},{"xp":30,"yp":30}]',
      emoji: '📚',
      category_ids: ['c-salles'],
      search_aliases: ['bibliothèque'],
      visit_subtitle: 'Centre de documentation',
      visit_short_description: 'Livres, presse et postes de travail.',
      visit_details_title: 'Horaires',
      visit_details_text: '8 h – 17 h',
    },
  ],
  routes: [],
  markers: [
    {
      id: 'm-gym',
      label: 'Gymnase',
      x_pct: 60,
      y_pct: 40,
      emoji: '🏀',
      category_ids: ['c-sport'],
      search_aliases: [],
      visit_subtitle: '',
    },
  ],
}));

const planApiMock = vi.hoisted(() => ({
  fetchPlanContent: vi.fn(async () => content),
  reportPlanUsage: vi.fn(),
  submitPlanAccessCode: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../../src/plan/planApi.js', () => planApiMock);

// Le moteur de carte est testé pour lui-même (`tests-ui/shared/usePctMapViewport.test.jsx`) :
// ici une sonde à identités STABLES, sinon le composant se re-rend en boucle.
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
  };
});
vi.mock('../../src/shared/pct-map/usePctMapViewport.js', () => ({
  usePctMapViewport: () => viewportStub,
}));

// La position est testée pour elle-même (`tests-ui/shared/positionGeometry.test.js`) : ici
// une sonde, pour vérifier le câblage du bouton « Me situer » et de « Y aller ».
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
  planSize: null,
  toggle: vi.fn(),
  stop: vi.fn(),
  notifyManualPan: vi.fn(),
}));
vi.mock('../../src/shared/pct-map/useMapPosition.js', () => ({
  useMapPosition: () => positionStub,
}));

const { AppPlan } = await import('../../src/plan/AppPlan.jsx');

beforeEach(() => {
  planApiMock.fetchPlanContent.mockClear();
  planApiMock.reportPlanUsage.mockClear();
  positionStub.toggle.mockClear();
  planApiMock.submitPlanAccessCode.mockClear();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('AppPlan — montage', () => {
  test('charge le contenu, affiche titre, carte, puces et message d’accueil', async () => {
    render(<AppPlan />);
    expect(screen.getByText('Chargement du plan…')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());

    expect(screen.getByRole('button', { name: /Salles/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Zoomer/ })).toBeTruthy();
    expect(screen.getByAltText('Plan Lycée Lyautey')).toBeTruthy();
    expect(screen.getByText('Fond : plan interne')).toBeTruthy();
    expect(await screen.findByText('Touchez un lieu, ou cherchez-le.')).toBeTruthy();
    expect(planApiMock.reportPlanUsage).toHaveBeenCalledWith('open', 'lyautey');
  });

  test('recherche par alias : « bibliothèque » ouvre la feuille de résultats et le CDI', async () => {
    render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Rechercher un lieu'), {
      target: { value: 'bibliotheque' },
    });
    const sheet = await screen.findByTestId('plan-results-sheet');
    expect(sheet.textContent).toContain('CDI');
    expect(sheet.textContent).not.toContain('Gymnase');

    fireEvent.click(screen.getByRole('button', { name: /CDI/ }));
    const placeSheet = await screen.findByTestId('plan-place-sheet');
    expect(placeSheet.textContent).toContain('Centre de documentation');
    expect(placeSheet.textContent).toContain('8 h – 17 h');
    expect(planApiMock.reportPlanUsage).toHaveBeenCalledWith('place_open', 'z-cdi');
    expect(window.location.search).toContain('lieu=z-cdi');
  });

  test('carte non calée : « Y aller » désactivé, avec la raison, et pas de bouton « Me situer »', async () => {
    render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());
    expect(screen.queryByTestId('plan-locate')).toBeNull();
    fireEvent.change(screen.getByLabelText('Rechercher un lieu'), { target: { value: 'CDI' } });
    fireEvent.click(await screen.findByRole('button', { name: /CDI/ }));
    const goButton = await screen.findByRole('button', { name: 'Y aller' });
    expect(goButton.disabled).toBe(true);
    expect(
      screen.getByText('Ce plan n’est pas encore calé pour afficher votre position.'),
    ).toBeTruthy();
  });

  test('carte calée : « Me situer » apparaît et « Y aller » devient actif (lot 6)', async () => {
    positionStub.available = true;
    positionStub.mode = 'off';
    try {
      render(<AppPlan />);
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy(),
      );
      expect(screen.getByTestId('plan-locate')).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Rechercher un lieu'), { target: { value: 'CDI' } });
      fireEvent.click(await screen.findByRole('button', { name: /CDI/ }));
      const goButton = await screen.findByRole('button', { name: /Y aller/ });
      expect(goButton.disabled).toBe(false);
      fireEvent.click(goButton);
      expect(positionStub.toggle).toHaveBeenCalled();
      expect(planApiMock.reportPlanUsage).toHaveBeenCalledWith('go', 'z-cdi');
    } finally {
      positionStub.available = false;
    }
  });

  test('filtre par catégorie : ne garde que les lieux de la catégorie cochée', async () => {
    render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());

    // Sur la carte : le repère est un bouton (`aria-label`), la zone un libellé SVG.
    expect(screen.getByText('CDI')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Sport/ }));
    expect(screen.getByRole('button', { name: 'Gymnase' })).toBeTruthy();
    expect(screen.queryByText('CDI')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('plan:categories'))).toEqual(['c-sport']);

    fireEvent.click(screen.getByRole('button', { name: 'Tout' }));
    await waitFor(() => expect(screen.getByText('CDI')).toBeTruthy());
  });

  test('recherche sans résultat : message et événement de compteur', async () => {
    render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Rechercher un lieu'), {
      target: { value: 'piscine' },
    });
    const sheet = await screen.findByTestId('plan-results-sheet');
    expect(sheet.textContent).toContain('Aucun lieu ne correspond');
    await waitFor(() =>
      expect(planApiMock.reportPlanUsage).toHaveBeenCalledWith('search_empty', 'piscine'),
    );
  });

  test('lien profond ?lieu= ouvre directement la fiche', async () => {
    window.history.replaceState(null, '', '/?lieu=m-gym');
    render(<AppPlan />);
    const placeSheet = await screen.findByTestId('plan-place-sheet');
    expect(placeSheet.textContent).toContain('Gymnase');
  });

  test('repères superposés : pastille de groupe, puis liste des lieux du groupe (lot 5)', async () => {
    const stacked = {
      ...content,
      markers: [
        { id: 'm-a', label: 'Vestiaire A', x_pct: 50, y_pct: 50, emoji: '🚪', category_ids: [] },
        { id: 'm-b', label: 'Vestiaire B', x_pct: 50, y_pct: 50, emoji: '🚪', category_ids: [] },
      ],
      zones: [],
    };
    planApiMock.fetchPlanContent.mockResolvedValueOnce(stacked);
    render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());

    // Les deux repères sont exactement au même point : une seule pastille de groupe.
    const cluster = screen.getByRole('button', { name: /2 lieux regroupés/ });
    expect(screen.queryByRole('button', { name: 'Vestiaire A' })).toBeNull();

    // Le groupe ne se sépare pas au zoom → ses lieux montent dans la feuille basse.
    fireEvent.click(cluster);
    const sheet = await screen.findByTestId('plan-results-sheet');
    expect(sheet.textContent).toContain('Lieux regroupés (2)');
    expect(sheet.textContent).toContain('Vestiaire A');
    expect(sheet.textContent).toContain('Vestiaire B');
  });

  test('parcours (lot 8) : puce, démarrage, étapes et sortie', async () => {
    planApiMock.fetchPlanContent.mockResolvedValueOnce({
      ...content,
      routes: [
        {
          id: 'r1',
          slug: 'tour',
          title: 'Tour du lycée',
          audience: 'Nouveaux professeurs',
          description: '',
          steps: [
            { position: 0, target_type: 'zone', target_id: 'z-cdi', step_title: 'Le CDI' },
            { position: 1, target_type: 'marker', target_id: 'm-gym', step_title: '' },
          ],
        },
      ],
    });
    render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Parcours/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tour du lycée/ }));

    const sheet = await screen.findByTestId('plan-route-sheet');
    expect(sheet.textContent).toContain('Le CDI');
    expect(sheet.textContent).toContain('Étape 1 sur 2');
    expect(planApiMock.reportPlanUsage).toHaveBeenCalledWith('route_start', 'tour');
    expect(window.location.search).toContain('parcours=tour');

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    await waitFor(() => expect(sheet.textContent).toContain('Étape 2 sur 2'));
    expect(screen.getByRole('button', { name: 'Suivant' }).disabled).toBe(true);

    fireEvent.click(screen.getAllByRole('button', { name: 'Quitter le parcours' })[0]);
    await waitFor(() => expect(screen.queryByTestId('plan-route-sheet')).toBeNull());
    expect(window.location.search).not.toContain('parcours=');
  });

  test('accès par code : écran de saisie quand le serveur l’exige', async () => {
    const denied = Object.assign(new Error('Code requis'), {
      status: 401,
      body: { access_required: true },
    });
    planApiMock.fetchPlanContent.mockRejectedValueOnce(denied);
    render(<AppPlan />);
    expect(await screen.findByLabelText('Code d’accès')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Entrer' })).toBeTruthy();

    planApiMock.submitPlanAccessCode.mockResolvedValueOnce({ ok: true });
    fireEvent.change(screen.getByLabelText('Code d’accès'), { target: { value: 'OUVRE-TOI' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrer' }));
    await waitFor(() => expect(planApiMock.submitPlanAccessCode).toHaveBeenCalledWith('OUVRE-TOI'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());
  });

  test('erreur de chargement : message et bouton Réessayer', async () => {
    planApiMock.fetchPlanContent.mockRejectedValueOnce(new Error('réseau'));
    render(<AppPlan />);
    await waitFor(() => expect(screen.getByText('Le plan n’a pas pu être chargé.')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());
  });
});
