import { describe, test, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { abandonAllOverlays } from '../../src/shared/platform/overlayHistory.js';
import { resetBottomSheetInsets } from '../../src/shared/ui/bottomSheetInset.js';

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
  submitPlanLogout: vi.fn(async () => ({ ok: true })),
  submitPlaceSuggestion: vi.fn(async () => ({ ok: true })),
  fetchPlanShellSettings: vi.fn(async () => ({})),
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
    setMapOrientation: noop,
    orientStyle: undefined,
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
  smoothedScreenHeadingDeg: null,
  headingAvailable: false,
  planSize: null,
  toggle: vi.fn(),
  stop: vi.fn(),
  notifyManualPan: vi.fn(),
}));
vi.mock('../../src/shared/pct-map/useMapPosition.js', () => ({
  useMapPosition: () => positionStub,
}));

const { AppPlan } = await import('../../src/plan/AppPlan.jsx');

/**
 * Clé de mémoire des filtres : elle porte **la carte affichée** depuis que l'établissement
 * peut publier plusieurs plans (`planStorageKeys`). Les catégories d'un plan n'ont rien à
 * dire de celles d'un autre.
 */
const CATEGORIES_KEY = 'plan:categories:lyautey';

beforeEach(() => {
  planApiMock.fetchPlanContent.mockClear();
  planApiMock.reportPlanUsage.mockClear();
  positionStub.toggle.mockClear();
  planApiMock.submitPlanAccessCode.mockClear();
  window.localStorage.clear();
  // La pile d'overlays (module) survit d'un test à l'autre : un history.back() différé
  // sinon efface le `?parcours=` posé par startRoute.
  abandonAllOverlays();
  resetBottomSheetInsets();
  // La sonde de position est un objet de module : un test qui la rend disponible la laisserait
  // disponible pour les suivants.
  Object.assign(positionStub, {
    available: false,
    mode: 'off',
    active: false,
    following: false,
    positionPct: null,
    displayPct: null,
    planSize: null,
  });
  window.history.replaceState(null, '', '/');
});

/** Position simulée au milieu du plan, calage connu : « Y aller » devient possible. */
function givePosition() {
  Object.assign(positionStub, {
    available: true,
    mode: 'on',
    active: true,
    positionPct: { xp: 50, yp: 50 },
    displayPct: { xp: 50, yp: 50, offMap: false, bearingDeg: 0 },
    planSize: { widthM: 280, heightM: 330 },
  });
}

describe('AppPlan — montage', () => {
  test('charge le contenu, affiche titre, carte, puces et message d’accueil', async () => {
    render(<AppPlan />);
    expect(screen.getByText('Chargement du plan…')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());

    expect(screen.getByRole('button', { name: /Salles/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Zoomer/ })).toBeTruthy();
    expect(screen.getByAltText('Plan Lycée Lyautey')).toBeTruthy();
    expect(screen.getByAltText('Lycée Lyautey')).toBeTruthy();
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

    fireEvent.click(within(sheet).getByRole('button', { name: /CDI/ }));
    const placeSheet = await screen.findByTestId('plan-place-sheet');
    expect(placeSheet.textContent).toContain('Centre de documentation');
    expect(placeSheet.textContent).toContain('8 h – 17 h');
    expect(planApiMock.reportPlanUsage).toHaveBeenCalledWith('place_open', 'z-cdi');
    expect(window.location.search).toContain('lieu=z-cdi');
  });

  /**
   * Le défaut qui a rendu la recherche inutilisable en production
   * (`docs/AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md` N1) : la feuille de résultats s'ouvre sur le
   * `focus` du champ ; **modale**, elle posait `inert` sur toute l'application et déplaçait le
   * focus sur son bouton « Fermer ». Le clavier s'ouvrait, puis plus une lettre ne s'inscrivait.
   *
   * Deux garde-fous complémentaires : le focus reste au champ (ce que jsdom sait voir), et la
   * feuille se déclare non bloquante (ce qui, en navigateur, évite `inert` et le voile).
   */
  test('toucher la recherche n’arrache pas le curseur du champ', async () => {
    render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());

    const input = screen.getByLabelText('Rechercher un lieu');
    input.focus();
    fireEvent.focus(input);
    const sheet = await screen.findByTestId('plan-results-sheet');
    expect(document.activeElement).toBe(input);
    expect(sheet.dataset.blockBackground).toBe('false');
    expect(sheet.getAttribute('aria-modal')).toBe('false');

    // Et la saisie qui suit filtre bien la liste.
    fireEvent.change(input, { target: { value: 'CDI' } });
    await waitFor(() =>
      expect(
        within(screen.getByTestId('plan-results-sheet')).getByRole('heading').textContent,
      ).toContain('Résultats'),
    );
  });

  test('la fiche d’un lieu laisse la carte utilisable et s’ouvre sur du contenu lisible', async () => {
    render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Rechercher un lieu'), { target: { value: 'CDI' } });
    const results = await screen.findByTestId('plan-results-sheet');
    fireEvent.click(within(results).getByRole('button', { name: /CDI/ }));
    const placeSheet = await screen.findByTestId('plan-place-sheet');

    // N2 : surcouche traversante, aucun `inert` posé sur l'application.
    expect(placeSheet.dataset.blockBackground).toBe('false');
    expect(document.getElementById('root')?.hasAttribute('inert')).not.toBe(true);
    // N4 : cran d'ouverture à mi-hauteur — au cran bas, il ne restait que 12 px de contenu.
    expect(placeSheet.dataset.snap).toBe('half');
  });

  /**
   * Un lieu sans catégorie reste trouvable et affiché quel que soit le filtre (N3), et la
   * recherche porte sur **tous** les lieux, en signalant ceux que le filtre courant masque.
   */
  test('un lieu hors du filtre courant reste trouvable, et le dit', async () => {
    render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());

    /**
     * Le filtre est effectif **dès le clic**, et le reste : la sélection est un état, plus une
     * valeur qu'un effet d'initialisation peut écraser après coup (`defaultCategoryIds`,
     * AppPlan.jsx). Cette assertion tient donc lieu de garde : si l'initialisation redevenait
     * un effet, elle tomberait ici, avec un message clair, au lieu de faire osciller le job
     * `quality` sur l'assertion suivante (17/09/2026, deux occurrences).
     */
    const chip = screen.getByRole('button', { name: /Sport/ });
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(screen.getByLabelText('Rechercher un lieu'), { target: { value: 'CDI' } });
    const results = await screen.findByTestId('plan-results-sheet');
    expect(within(results).getByRole('button', { name: /CDI/ })).toBeTruthy();
    // `findByText` et non une lecture de `textContent` : `findByTestId` rend la main dès que la
    // feuille existe, alors que la mention dépend de `hiddenByFilter` (AppPlan.jsx), donc du
    // rendu qui suit l'application du filtre « Sport ».
    expect(await within(results).findByText('masqué par vos filtres')).toBeTruthy();
  });

  test('la feuille de filtres liste toutes les catégories', async () => {
    render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());

    fireEvent.click(screen.getByTestId('plan-filters-button'));
    const sheet = await screen.findByTestId('plan-filters-sheet');
    expect(within(sheet).getByRole('button', { name: /Salles/ })).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: /Sport/ })).toBeTruthy();
  });

  test('l’adresse garde le lieu une fois la feuille de résultats refermée', async () => {
    // Régression réelle, vue seulement en navigateur : les feuilles basses empilent une entrée
    // d'historique et la dépilent en se fermant (`useOverlayHistoryBack`). `openPlace` écrivait
    // `?lieu=` sur l'entrée de la feuille — donc le `history.back()` de sa fermeture emportait
    // l'adresse avec elle. Recharger la page ou copier l'URL perdait alors la sélection.
    // Le test voisin ne le voyait pas : il observe l'adresse **avant** que ce retour n'ait lieu.
    render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Rechercher un lieu'), {
      target: { value: 'bibliotheque' },
    });
    const sheet = await screen.findByTestId('plan-results-sheet');
    fireEvent.click(within(sheet).getByRole('button', { name: /CDI/ }));
    await screen.findByTestId('plan-place-sheet');

    // Rejoue ce que fait le navigateur en dépilant l'entrée de la feuille : il restaure
    // l'adresse de l'entrée précédente — celle d'avant l'ouverture, sans le lieu — puis émet
    // `popstate`. jsdom ne simule pas cette restauration, il faut donc l'écrire ici, sans quoi
    // le test passerait aussi bien avec qu'sans le correctif (vérifié : c'était le cas).
    await act(async () => {
      window.history.replaceState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
      await Promise.resolve();
    });

    expect(window.location.search).toContain('lieu=z-cdi');
  });

  test('carte non calée : « Y aller » désactivé, avec la raison, et pas de bouton « Me situer »', async () => {
    render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());
    expect(screen.queryByTestId('plan-locate')).toBeNull();
    fireEvent.change(screen.getByLabelText('Rechercher un lieu'), { target: { value: 'CDI' } });
    const results = await screen.findByTestId('plan-results-sheet');
    fireEvent.click(within(results).getByRole('button', { name: /CDI/ }));
    const goButton = await screen.findByRole('button', { name: 'Y aller' });
    expect(goButton.disabled).toBe(true);
    expect(screen.getByText('Plan non calé : position indisponible.')).toBeTruthy();
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
      const results = await screen.findByTestId('plan-results-sheet');
      fireEvent.click(within(results).getByRole('button', { name: /CDI/ }));
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
    // `Plan Lyautey` est AUSSI le titre par défaut de la variante (`planVariants.js`) : il est
    // affiché avant même que la charge n'arrive, donc l'attendre ne prouve rien. On attend ici
    // la puce de catégorie, qui n'existe qu'une fois le contenu chargé.
    //
    // La restauration des catégories ne peut plus écraser une sélection concurrente : elle est
    // **dérivée au rendu** (`defaultCategoryIds`) et non posée par un effet. L'attente ci-dessous
    // ne sert donc plus qu'à ce que la puce existe.
    await waitFor(() => expect(screen.getByRole('button', { name: /Sport/ })).toBeTruthy());

    // Sur la carte : le repère est un bouton (`aria-label`), la zone un libellé HTML.
    expect(screen.getByText('CDI')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Sport/ }));
    expect(screen.getByRole('button', { name: 'Gymnase' })).toBeTruthy();
    // Attente explicite : la feuille précédente peut encore se fermer (history différé) ; une
    // assertion synchrone tombait par intermittence dans la suite complète.
    await waitFor(() => expect(screen.queryByText('CDI')).toBeNull());
    expect(JSON.parse(window.localStorage.getItem(CATEGORIES_KEY))).toEqual(['c-sport']);

    fireEvent.click(screen.getByRole('button', { name: 'Tout' }));
    await waitFor(() => expect(screen.getByText('CDI')).toBeTruthy());
  });

  /**
   * Le choix mémorisé n'est plus restauré par un effet mais **dérivé** des réglages : il est
   * donc en place dès le premier rendu utile, et un appui sur une puce part de ce choix-là. Sans
   * cela, la première bascule repartirait d'un ensemble vide — les catégories déjà cochées
   * sauteraient d'un coup, sans que rien ne l'explique.
   */
  test('le choix mémorisé est en place dès l’affichage, et la première bascule part de lui', async () => {
    window.localStorage.setItem(CATEGORIES_KEY, JSON.stringify(['c-salles']));
    render(<AppPlan />);

    const salles = await screen.findByRole('button', { name: /Salles/ });
    expect(salles.getAttribute('aria-pressed')).toBe('true');

    const sport = screen.getByRole('button', { name: /Sport/ });
    fireEvent.click(sport);
    expect(sport.getAttribute('aria-pressed')).toBe('true');
    // La catégorie mémorisée n'a pas sauté : la bascule s'ajoute au choix, elle ne le remplace pas.
    expect(salles.getAttribute('aria-pressed')).toBe('true');
    expect(JSON.parse(window.localStorage.getItem(CATEGORIES_KEY)).sort()).toEqual([
      'c-salles',
      'c-sport',
    ]);
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

    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    fireEvent.click(screen.getByRole('button', { name: /Parcours/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tour du lycée/ }));

    const sheet = await screen.findByTestId('plan-route-sheet');
    expect(sheet.textContent).toContain('Le CDI');
    expect(sheet.textContent).toContain('Étape 1 sur 2');
    // Le mode parcours passe désormais par le noyau partagé, qui reçoit la mesure d'usage en
    // rappel : le plan lui joint sa **variante** (public / personnels), comme les autres
    // appels nominatifs. D'où le troisième argument.
    expect(planApiMock.reportPlanUsage).toHaveBeenCalledWith(
      'route_start',
      'tour',
      expect.objectContaining({ id: 'plan' }),
    );
    await waitFor(() => {
      const urls = replaceSpy.mock.calls.map((c) => String(c[2] || ''));
      expect(urls.some((u) => u.includes('parcours=tour'))).toBe(true);
    });
    replaceSpy.mockRestore();
    if (!String(window.location.search || '').includes('parcours=tour')) {
      window.history.replaceState(null, '', '/?parcours=tour');
    }

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    await waitFor(() => expect(sheet.textContent).toContain('Étape 2 sur 2'));
    expect(screen.getByRole('button', { name: 'Suivant' }).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Quitter' }));
    await waitFor(() => expect(screen.queryByTestId('plan-route-sheet')).toBeNull());
    await waitFor(() => expect(window.location.search).not.toContain('parcours='));
    expect(await screen.findByRole('button', { name: 'Reprendre le parcours' })).toBeTruthy();
    expect(await screen.findByText(/Pour reprendre/)).toBeTruthy();

    // « Reprendre » rend la main **à l'étape quittée**. Le scénario s'arrêtait auparavant à
    // l'apparition de la feuille, sans regarder l'étape : la reprise repartait en fait de la
    // première (`docs/AUDIT_PARCOURS_2026-09-17.md` §2.2).
    fireEvent.click(screen.getByRole('button', { name: 'Reprendre le parcours' }));
    const resumed = await screen.findByTestId('plan-route-sheet');
    await waitFor(() => expect(resumed.textContent).toContain('Étape 2 sur 2'));
  });

  /**
   * Pendant un parcours, toucher un autre lieu ouvre sa fiche **en aperçu** : la barre d'étape
   * reste au-dessus, et « Revenir à l'étape » rend la main au parcours
   * (`docs/AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md` N5). C'était l'un des trois apports propres
   * au plan ; il est passé dans le noyau partagé sans filet — en voici un
   * (`docs/AUDIT_PARCOURS_2026-09-17.md` §2.5).
   */
  test('parcours : consulter un autre lieu ouvre un aperçu, sans perdre l’étape', async () => {
    planApiMock.fetchPlanContent.mockResolvedValueOnce({
      ...content,
      routes: [
        {
          id: 'r1',
          slug: 'tour',
          title: 'Tour du lycée',
          audience: '',
          description: '',
          steps: [
            { position: 0, target_type: 'marker', target_id: 'm-gym', step_title: 'Le gymnase' },
          ],
        },
      ],
    });
    render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Parcours/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tour du lycée/ }));
    const sheet = await screen.findByTestId('plan-route-sheet');
    expect(sheet.textContent).toContain('Le gymnase');

    // Un autre lieu, cherché puis ouvert : la barre d'étape ne bouge pas.
    fireEvent.change(screen.getByLabelText('Rechercher un lieu'), {
      target: { value: 'bibliotheque' },
    });
    const results = await screen.findByTestId('plan-results-sheet');
    fireEvent.click(within(results).getByRole('button', { name: /CDI/ }));

    const placeSheet = await screen.findByTestId('plan-place-sheet');
    expect(placeSheet.textContent).toContain('Centre de documentation');
    expect(screen.getByTestId('plan-route-sheet').textContent).toContain('Étape 1 sur 1');

    fireEvent.click(screen.getByRole('button', { name: 'Revenir à l’étape' }));
    await waitFor(() => expect(screen.queryByTestId('plan-place-sheet')).toBeNull());
    expect(screen.getByTestId('plan-route-sheet').textContent).toContain('Le gymnase');
  });

  test('lien profond ?parcours= : ouvre le parcours annoncé par le QR code', async () => {
    planApiMock.fetchPlanContent.mockResolvedValueOnce({
      ...content,
      routes: [
        {
          id: 'r1',
          slug: 'tour',
          title: 'Tour du lycée',
          audience: '',
          description: '',
          steps: [{ position: 0, target_type: 'zone', target_id: 'z-cdi', step_title: 'Le CDI' }],
        },
      ],
    });
    window.history.replaceState(null, '', '/?parcours=tour');
    render(<AppPlan />);

    const sheet = await screen.findByTestId('plan-route-sheet');
    expect(sheet.textContent).toContain('Le CDI');
    expect(sheet.textContent).toContain('Étape 1 sur 1');
  });

  test('lien profond vers un parcours disparu : le visiteur l’apprend', async () => {
    // Une affiche imprimée survit à la dépublication du parcours qu'elle annonce : arriver
    // sur un plan nu, sans un mot, laissait le visiteur croire à une panne.
    window.history.replaceState(null, '', '/?parcours=parcours-retire');
    render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());
    expect(await screen.findByText('Ce parcours n’est plus disponible.')).toBeTruthy();
    expect(screen.queryByTestId('plan-route-sheet')).toBeNull();
  });

  test('un parcours sans étape affichable n’est pas proposé', async () => {
    // La charge du plan écarte les étapes dont le lieu est supprimé ou masqué : un parcours
    // qui n'ouvre que sur « aucune étape » n'a rien à promettre.
    planApiMock.fetchPlanContent.mockResolvedValueOnce({
      ...content,
      routes: [
        {
          id: 'r-vide',
          slug: 'vide',
          title: 'Parcours vidé',
          audience: '',
          description: '',
          steps: [],
        },
      ],
    });
    render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Parcours/ })).toBeNull();
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
    // La variante est passée avec le code : c'est elle qui choisit l'API visée
    // (`/api/plan` ici, `/api/staff-plan` pour le plan des personnels).
    await waitFor(() =>
      expect(planApiMock.submitPlanAccessCode).toHaveBeenCalledWith(
        'OUVRE-TOI',
        expect.objectContaining({ id: 'plan', apiBase: '/api/plan' }),
      ),
    );
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

describe('AppPlan — affichage des repères et des zones (audit 2026-09)', () => {
  test('l’emoji du nom n’est pas dessiné deux fois, sur la carte et dans les listes', async () => {
    planApiMock.fetchPlanContent.mockResolvedValueOnce({
      ...content,
      zones: [{ ...content.zones[0], name: '📚 CDI', emoji: '📚' }],
    });
    const { container } = render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());
    const label = container.querySelector('.fm-pct-label');
    expect(label.textContent).toBe('📚CDI');
  });

  test('la zone est un bouton atteignable au clavier, l’étiquette n’intercepte rien', async () => {
    const { container } = render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());
    const zone = container.querySelector('.fm-pct-zone');
    expect(zone.getAttribute('role')).toBe('button');
    expect(zone.getAttribute('aria-label')).toBe('CDI');
    fireEvent.keyDown(zone, { key: 'Enter' });
    expect(await screen.findByTestId('plan-place-sheet')).toBeTruthy();
  });

  test('le nom d’un repère s’affiche dès la vue d’ensemble (plus de seuil de zoom)', async () => {
    const { container } = render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());
    const marker = container.querySelector('.fm-pct-marker');
    expect(marker.querySelector('.fm-pct-marker__label').textContent).toBe('Gymnase');
  });

  test('zones et repères partagent le même habillage de nom ; aide dans la barre', async () => {
    const { container } = render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());
    const zoneName = container.querySelector('.fm-pct-label__name');
    const markerName = container.querySelector('.fm-pct-marker__label');
    expect(zoneName.classList.contains('map-overlay-name-label')).toBe(true);
    expect(markerName.classList.contains('map-overlay-name-label')).toBe(true);
    const topbar = container.querySelector('.plan-topbar');
    expect(topbar.querySelector('.plan-help-dock')).toBeTruthy();
    expect(container.querySelector('.plan-filters__row')).toBeTruthy();
  });

  test('contre-échelle : le calque « fit » porte l’inverse de l’échelle courante', async () => {
    const { container } = render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());
    expect(container.querySelector('.plan-map__fit').style.getPropertyValue('--pct-inv')).toBe('1');
  });

  test('une puce de catégorie sans aucun lieu n’est pas proposée', async () => {
    planApiMock.fetchPlanContent.mockResolvedValueOnce({
      ...content,
      categories: [
        ...content.categories,
        { id: 'c-vide', slug: 'vide', label: 'Catégorie vide', emoji: '👻', color: '#eee' },
      ],
    });
    render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());
    expect(screen.getByRole('button', { name: /Salles/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Catégorie vide/ })).toBe(null);
  });

  test('filtre qui ne laisse aucun lieu : la carte le dit et propose de tout réafficher', async () => {
    // Choix mémorisé sur l'appareil pointant une catégorie devenue vide : sans état explicite,
    // le visiteur voit un plan nu sans savoir pourquoi (audit C6).
    window.localStorage.setItem(CATEGORIES_KEY, JSON.stringify(['c-vide']));
    planApiMock.fetchPlanContent.mockResolvedValueOnce({
      ...content,
      categories: [
        ...content.categories,
        { id: 'c-vide', slug: 'vide', label: 'Catégorie vide', emoji: '👻', color: '#eee' },
      ],
    });
    render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());
    expect(await screen.findByText(/Aucun lieu dans cette sélection/)).toBeTruthy();
    // La puce cochée reste proposée, sinon on ne pourrait pas la décocher.
    expect(screen.getByRole('button', { name: /Catégorie vide/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tout afficher' }));
    await waitFor(() => expect(screen.queryByText(/Aucun lieu dans cette sélection/)).toBe(null));
  });

  /**
   * Les deux défauts signalés depuis le terrain
   * (`docs/AUDIT_PLAN_NAVIGATION_2026-09-16-bis.md` B4 et B5) : le guidage vivait **dans** la
   * fiche du lieu, qui couvre 55 % de l'écran — donc le point bleu était caché pendant qu'on
   * marchait — et refermer la fiche **arrêtait** le guidage sans le dire.
   */
  test('« Y aller » referme la fiche et pose la barre de guidage', async () => {
    givePosition();
    const { container } = render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());

    fireEvent.click(container.querySelector('.fm-pct-zone'));
    const placeSheet = await screen.findByTestId('plan-place-sheet');
    fireEvent.click(within(placeSheet).getByRole('button', { name: 'Y aller' }));

    const guide = await screen.findByTestId('plan-guide-bar');
    expect(guide.textContent).toContain('CDI');
    expect(guide.textContent).toMatch(/à vol d’oiseau/);
    // La fiche s'efface : c'est la carte que l'on veut voir en marchant.
    await waitFor(() => expect(screen.queryByTestId('plan-place-sheet')).toBe(null));
    expect(planApiMock.reportPlanUsage).toHaveBeenCalledWith('go', 'z-cdi');
  });

  test('fermer la fiche n’arrête pas le guidage ; seul « Arrêter » l’arrête', async () => {
    givePosition();
    const { container } = render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());

    fireEvent.click(container.querySelector('.fm-pct-zone'));
    const placeSheet = await screen.findByTestId('plan-place-sheet');
    fireEvent.click(within(placeSheet).getByRole('button', { name: 'Y aller' }));
    const guide = await screen.findByTestId('plan-guide-bar');

    // Rouvrir la fiche depuis la barre, puis la refermer : le guidage survit.
    fireEvent.click(within(guide).getByRole('button', { name: /CDI/ }));
    const reopened = await screen.findByTestId('plan-place-sheet');
    fireEvent.click(within(reopened).getByRole('button', { name: 'Fermer la fiche du lieu' }));
    await waitFor(() => expect(screen.queryByTestId('plan-place-sheet')).toBe(null));
    expect(screen.getByTestId('plan-guide-bar')).toBeTruthy();

    fireEvent.click(
      within(screen.getByTestId('plan-guide-bar')).getByRole('button', { name: 'Arrêter' }),
    );
    await waitFor(() => expect(screen.queryByTestId('plan-guide-bar')).toBe(null));
  });

  /**
   * Une colonne de cinq à six commandes ne tient pas dans la bande de carte que laisse une
   * feuille ouverte (122 px pour 252 px) : elle se replie en rangée au-dessus d'elle (B1).
   */
  test('feuille ouverte : les commandes de carte se replient en rangée', async () => {
    const { container } = render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());
    const controls = container.querySelector('.plan-map-controls');
    expect(controls.classList.contains('is-compact')).toBe(false);

    fireEvent.focus(screen.getByLabelText('Rechercher un lieu'));
    await screen.findByTestId('plan-results-sheet');
    await waitFor(() =>
      expect(container.querySelector('.plan-map-controls').classList.contains('is-compact')).toBe(
        true,
      ),
    );
  });

  test('la fiche d’un lieu porte son lien direct (QR interne)', async () => {
    const { container } = render(<AppPlan />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan Lyautey' })).toBeTruthy());
    fireEvent.click(container.querySelector('.fm-pct-zone'));
    expect(await screen.findByText(/Lien direct :/)).toBeTruthy();
    expect(screen.getByText(/lieu=z-cdi/)).toBeTruthy();
  });
});
