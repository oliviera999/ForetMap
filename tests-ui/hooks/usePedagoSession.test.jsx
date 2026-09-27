import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, render, screen } from '@testing-library/react';

/**
 * `usePedagoSession` (séances pédagogiques sorties d'`App.jsx`, étape B2 de la piste B) :
 * traduction des étapes en navigation, cycle start → étapes → fin, niveau imposé selon le
 * module, et partage par `PedagoSessionContext`. Le câblage dans le shell est couvert par
 * `tests-ui/AppShellPedagoSessions.test.jsx`.
 */

const apiMock = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('../../src/services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  api: apiMock,
}));

const { usePedagoSession, runPedagoSessionStepAction } =
  await import('../../src/hooks/usePedagoSession.js');
const { PedagoSessionProvider, usePedagoSessionContext } =
  await import('../../src/contexts/PedagoSessionContext.jsx');

function fakeNavigation(overrides = {}) {
  return {
    navigateTab: vi.fn(),
    setPlantCatalogPreview: vi.fn(),
    openPlantCatalogPreviewById: vi.fn(),
    openPedagoFoodWeb: vi.fn(),
    chooseMap: vi.fn(),
    idKeysAvailable: true,
    individualsAvailable: true,
    setPedagoIdKeysInitialKey: vi.fn(),
    setPedagoQuizQuestionCode: vi.fn(),
    setPedagoQuizNotionId: vi.fn(),
    setPedagoQuizNotionNiveau: vi.fn(),
    setPedagoGlossaryCode: vi.fn(),
    setPedagoEntry: vi.fn(),
    setPedagoMapRouteRequest: vi.fn(),
    ...overrides,
  };
}

const step = (type, payload) => ({ title: type, action: { type, payload } });

describe('runPedagoSessionStepAction', () => {
  it('sans action : rien ; toute action ferme d’abord l’aperçu de fiche', () => {
    const nav = fakeNavigation();
    runPedagoSessionStepAction({ title: 'x' }, nav);
    runPedagoSessionStepAction(null, nav);
    expect(nav.setPlantCatalogPreview).not.toHaveBeenCalled();
    runPedagoSessionStepAction(step('message'), nav);
    expect(nav.setPlantCatalogPreview).toHaveBeenCalledWith(null);
    expect(nav.navigateTab).toHaveBeenCalledWith('sessions');
  });

  it('clé d’identification : onglet dédié, ou Séances si le module est éteint', () => {
    const nav = fakeNavigation();
    runPedagoSessionStepAction(step('open_id_key', { keyIdOrSlug: 'arbres' }), nav);
    expect(nav.setPedagoIdKeysInitialKey).toHaveBeenCalledWith('arbres');
    expect(nav.navigateTab).toHaveBeenLastCalledWith('id-keys');
    const off = fakeNavigation({ idKeysAvailable: false });
    runPedagoSessionStepAction(step('open_id_key', { keyIdOrSlug: 'arbres' }), off);
    expect(off.setPedagoIdKeysInitialKey).not.toHaveBeenCalled();
    expect(off.navigateTab).toHaveBeenLastCalledWith('sessions');
  });

  it('fiche : aperçu si l’identifiant est valide, sinon catalogue', () => {
    const nav = fakeNavigation();
    runPedagoSessionStepAction(step('open_plant', { plantId: '12' }), nav);
    expect(nav.openPlantCatalogPreviewById).toHaveBeenCalledWith(12);
    runPedagoSessionStepAction(step('open_plant', { plantId: 0 }), nav);
    expect(nav.navigateTab).toHaveBeenLastCalledWith('plants');
  });

  it('réseau trophique, quiz et glossaire', () => {
    const nav = fakeNavigation();
    runPedagoSessionStepAction(step('open_foodweb', { highlightPlantId: 4, mapId: 'n3' }), nav);
    expect(nav.openPedagoFoodWeb).toHaveBeenCalledWith(4, 'n3');
    runPedagoSessionStepAction(step('open_foodweb', {}), nav);
    expect(nav.openPedagoFoodWeb).toHaveBeenLastCalledWith(null, null);

    runPedagoSessionStepAction(
      step('open_quiz', { questionCode: ' qf0042 ', notionId: ' C4 ', notionNiveau: 'cycle4' }),
      nav,
    );
    expect(nav.setPedagoQuizQuestionCode).toHaveBeenCalledWith('QF0042');
    expect(nav.setPedagoQuizNotionId).toHaveBeenCalledWith('C4');
    expect(nav.setPedagoQuizNotionNiveau).toHaveBeenCalledWith('cycle4');
    expect(nav.navigateTab).toHaveBeenLastCalledWith('quiz');
    runPedagoSessionStepAction(step('open_quiz', {}), nav);
    expect(nav.setPedagoQuizQuestionCode).toHaveBeenLastCalledWith(null);

    runPedagoSessionStepAction(step('open_glossary', { termCode: ' G1 ' }), nav);
    expect(nav.setPedagoGlossaryCode).toHaveBeenCalledWith('G1');
    expect(nav.navigateTab).toHaveBeenLastCalledWith('glossary');
    runPedagoSessionStepAction(step('open_glossary', {}), nav);
    expect(nav.setPedagoGlossaryCode).toHaveBeenCalledTimes(1);
  });

  it('individu, groupes emboîtés, parcours : carte choisie, demandes posées', () => {
    const nav = fakeNavigation();
    runPedagoSessionStepAction(step('open_individual', { individualId: '9', mapId: 'n3' }), nav);
    expect(nav.chooseMap).toHaveBeenCalledWith('n3');
    expect(nav.setPedagoEntry.mock.calls[0][0]({ keep: 1 })).toEqual({ keep: 1, individualId: 9 });
    expect(nav.navigateTab).toHaveBeenLastCalledWith('individuals');

    runPedagoSessionStepAction(step('open_nested_groups', { plantIds: ['1', 'x', 3] }), nav);
    const nested = nav.setPedagoEntry.mock.calls[1][0](null).nestedGroups;
    expect(nested.plantIds).toEqual([1, 3]);
    expect(nested.mapId).toBeNull();
    expect(typeof nested.nonce).toBe('number');
    expect(nav.navigateTab).toHaveBeenLastCalledWith('nested-groups');

    runPedagoSessionStepAction(
      step('open_map_route', { routeSlug: 'sentier', mapId: 'foret' }),
      nav,
    );
    expect(nav.chooseMap).toHaveBeenLastCalledWith('foret');
    expect(nav.setPedagoMapRouteRequest.mock.calls[0][0]).toMatchObject({ slug: 'sentier' });
    expect(nav.navigateTab).toHaveBeenLastCalledWith('map');

    const off = fakeNavigation({ individualsAvailable: false });
    runPedagoSessionStepAction(step('open_individual', { individualId: 9 }), off);
    expect(off.navigateTab).toHaveBeenLastCalledWith('sessions');
    expect(off.setPedagoEntry).not.toHaveBeenCalled();
  });
});

const SEANCE = {
  id: 5,
  slug: 's5',
  title: 'S5',
  level: 'college',
  config: { notionNiveau: 'cycle4' },
  steps: [step('message'), step('open_glossary', { termCode: 'G1' })],
};

beforeEach(() => {
  window.sessionStorage.clear();
  apiMock.mockReset();
  apiMock.mockImplementation(async () => ({}));
});

function renderSession(props = {}) {
  const navigation = fakeNavigation();
  const onToast = vi.fn();
  const hook = renderHook((p) => usePedagoSession(p), {
    initialProps: { available: true, authenticated: true, onToast, navigation, ...props },
  });
  return { ...hook, navigation, onToast };
}

describe('usePedagoSession', () => {
  it('démarrage, étape suivante, fin : états, exécution et niveau imposé', async () => {
    const { result, navigation } = renderSession();
    expect(result.current.activeSession).toBeNull();
    expect(result.current.imposedLevel).toBeNull();

    await act(async () => {
      expect(await result.current.startSession(SEANCE)).toBe(true);
    });
    expect(apiMock).toHaveBeenCalledWith('/api/pedago-sessions/5/runs/start', 'POST');
    expect(result.current.currentStep).toBe(SEANCE.steps[0]);
    expect(result.current.imposedLevel).toBe('college');
    expect(result.current.imposedNotionNiveau).toBe('cycle4');
    expect(navigation.navigateTab).toHaveBeenLastCalledWith('sessions');

    act(() => result.current.goStep(1));
    expect(result.current.activeSession.stepIndex).toBe(1);
    expect(navigation.navigateTab).toHaveBeenLastCalledWith('glossary');

    apiMock.mockImplementation(async () => ({ rewards: [{ key: 'r' }] }));
    await act(async () => {
      result.current.goStep(1);
    });
    expect(result.current.activeSession).toBeNull();
    expect(result.current.completedSession).toMatchObject({ id: 5, newRewards: [{ key: 'r' }] });
    expect(result.current.runsVersion).toBe(1);
    act(() => result.current.setCompletedSession(null));
    expect(result.current.completedSession).toBeNull();
  });

  it('module éteint : la séance reste mémorisée mais n’impose plus son niveau', async () => {
    const { result, rerender, navigation, onToast } = renderSession();
    await act(async () => {
      await result.current.startSession(SEANCE);
    });
    rerender({ available: false, authenticated: true, onToast, navigation });
    expect(result.current.activeSession.id).toBe(5);
    expect(result.current.imposedLevel).toBeNull();
    expect(result.current.imposedNotionNiveau).toBeNull();
  });

  it('non authentifié : ni exécution serveur, ni lancement du lien en attente', async () => {
    window.sessionStorage.setItem('foretmap.pendingSeance.v1', 's5');
    const { result } = renderSession({ authenticated: false });
    await act(async () => {
      expect(await result.current.startSession(SEANCE)).toBe(true);
    });
    expect(apiMock).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem('foretmap.pendingSeance.v1')).toBe('s5');
  });

  it('launchSession : séance vide ou introuvable → message', async () => {
    apiMock.mockImplementation(async () => ({ steps: [] }));
    const { result, onToast } = renderSession();
    await act(async () => {
      expect(await result.current.launchSession('s5')).toBe(false);
    });
    expect(onToast).toHaveBeenCalledWith('Cette séance n’est plus disponible.');
    await act(async () => {
      expect(await result.current.launchSession('  ')).toBe(false);
    });
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  it('le contexte partage la valeur du hook avec l’arbre', async () => {
    function Probe() {
      const ctx = usePedagoSessionContext();
      return <p>{ctx ? `séance ${ctx.activeSession?.title ?? 'aucune'}` : 'hors contexte'}</p>;
    }
    const value = { activeSession: { title: 'S5' } };
    render(
      <>
        <PedagoSessionProvider value={value}>
          <Probe />
        </PedagoSessionProvider>
        <Probe />
      </>,
    );
    expect(screen.getByText('séance S5')).toBeTruthy();
    expect(screen.getByText('hors contexte')).toBeTruthy();
  });
});
