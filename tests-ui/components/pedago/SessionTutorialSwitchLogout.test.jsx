// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';

/**
 * Étape « tutoriel » d'une séance (`open_tutorial`) — suites proposées par le flux F3 du
 * chantier CPT, faites par le flux T3 :
 *   - l'aperçu suit l'interrupteur de l'onglet Tutoriels (`modules.tutorials_enabled` des
 *     réglages publics) ;
 *   - la déconnexion forcée (`onForceLogout`) est relayée à l'accusé de lecture de l'aperçu ;
 *   - compte supprimé pendant le chargement du tutoriel : pas de message « plus disponible »
 *     trompeur (la session se ferme par l'événement global d'`api`).
 */

const apiMock = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('../../../src/services/api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  api: (...args) => apiMock(...args),
}));

// Aperçu remplacé par une doublure qui expose ses props : on vérifie ce que le bandeau lui
// transmet, pas le rendu de l'accusé de lecture (couvert par ses propres tests).
const previewProps = vi.hoisted(() => ({ last: null }));
vi.mock('../../../src/components/TutorialPreviewModal.jsx', () => ({
  TutorialPreviewModal: (props) => {
    previewProps.last = props;
    return <div role="dialog" aria-label={`Aperçu ${props.tutorial?.title || ''}`} />;
  },
}));

const { PedagoSessionBanner } =
  await import('../../../src/components/pedago/PedagoSessionBanner.jsx');
const { PedagoSessionProvider } = await import('../../../src/contexts/PedagoSessionContext.jsx');
const { PublicSettingsProvider } = await import('../../../src/contexts/PublicSettingsContext.jsx');
const { usePedagoSession } = await import('../../../src/hooks/usePedagoSession.js');
const { AccountDeletedError } = await import('../../../src/services/api.js');
const { PEDAGO_STEP_ACTION } = await import('../../../src/shared/enums/pedagoStepActions.js');

const TUTORIAL = { id: 7, title: 'Réussir un semis', preview_url: '/api/tutorials/7/view' };
const tutorialStep = {
  id: 't1',
  title: 'Lire le tutoriel',
  body: 'Lis la fiche puis reviens.',
  action: { type: PEDAGO_STEP_ACTION.OPEN_TUTORIAL, payload: { tutorialId: 7 } },
};

function renderBanner({ settings, ctx, onForceLogout } = {}) {
  const banner = (
    <PedagoSessionBanner
      sessionTitle="Séance semis"
      step={tutorialStep}
      stepIndex={0}
      stepCount={2}
      onPrev={() => {}}
      onNext={() => {}}
      onExit={() => {}}
      onForceLogout={onForceLogout}
    />
  );
  const withSession = (
    <PedagoSessionProvider
      value={
        ctx || {
          sessionTutorial: { tutorial: TUTORIAL, isRead: false, canAcknowledge: true },
          markSessionTutorialRead: vi.fn(),
        }
      }
    >
      {banner}
    </PedagoSessionProvider>
  );
  return render(
    settings === undefined ? (
      withSession
    ) : (
      <PublicSettingsProvider value={settings}>{withSession}</PublicSettingsProvider>
    ),
  );
}

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation(async () => ({}));
  previewProps.last = null;
  window.sessionStorage.clear();
});

describe('PedagoSessionBanner — interrupteur de l’onglet Tutoriels', () => {
  it('onglet ouvert (ou réglages absents) : aperçu affiché, sans message', () => {
    const first = renderBanner({ settings: { modules: { tutorials_enabled: true } } });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.queryByTestId('pedago-session-tutorial-off')).toBeNull();
    first.unmount();
    renderBanner();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('onglet masqué : ni aperçu ni bouton « Tutoriel », l’élève est invité à poursuivre', () => {
    renderBanner({ settings: { modules: { tutorials_enabled: false } } });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tutoriel' })).toBeNull();
    expect(screen.getByTestId('pedago-session-tutorial-off').textContent).toMatch(
      /tutoriels sont désactivés.*étape suivante/,
    );
    // La consigne de l'étape et la navigation restent en place.
    expect(screen.getByText('Lis la fiche puis reviens.')).toBeTruthy();
    expect(screen.getByTestId('pedago-session-banner')).toBeTruthy();
  });
});

describe('PedagoSessionBanner — déconnexion forcée depuis l’aperçu', () => {
  it('`onForceLogout` est relayé à l’accusé de lecture', () => {
    const onForceLogout = vi.fn();
    renderBanner({ onForceLogout });
    expect(previewProps.last.readAcknowledge.onForceLogout).toBe(onForceLogout);
    previewProps.last.readAcknowledge.onForceLogout();
    expect(onForceLogout).toHaveBeenCalledTimes(1);
  });

  it('sans `onForceLogout` : comportement inchangé (accusé sans relais)', () => {
    renderBanner();
    expect(previewProps.last.readAcknowledge.onForceLogout).toBeUndefined();
  });
});

describe('usePedagoSession — compte supprimé au chargement du tutoriel', () => {
  it('pas de message « plus disponible », aucun aperçu', async () => {
    apiMock.mockImplementation(async (url) => {
      if (url === '/api/tutorials/7') throw new AccountDeletedError();
      return {};
    });
    const onToast = vi.fn();
    const navigation = {
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
    };
    const { result } = renderHook(() =>
      usePedagoSession({ available: true, authenticated: true, onToast, navigation }),
    );
    await act(async () => {
      await result.current.startSession({
        id: 8,
        slug: 's8',
        title: 'S8',
        steps: [tutorialStep],
      });
    });
    expect(result.current.sessionTutorial).toBeNull();
    expect(onToast).not.toHaveBeenCalledWith(
      'Ce tutoriel n’est plus disponible. Tu peux continuer la séance.',
    );
  });
});
