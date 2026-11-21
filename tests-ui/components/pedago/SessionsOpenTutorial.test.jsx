// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Action d'étape `open_tutorial` (chantier CPT, flux F3) : aperçu rendu par le bandeau de
 * séance à partir du contexte (aucune cible demandée au shell), choix du tutoriel dans
 * l'éditeur d'étape, et consigne de l'étape lisible dans l'onglet Séances.
 */

const apiMock = vi.fn();
vi.mock('../../../src/services/api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  api: (...args) => apiMock(...args),
}));
vi.mock('../../../src/hooks/useGatingSummary', () => ({
  useGatingSummary: () => ({ summaries: new Map() }),
}));

const { PedagoSessionBanner } =
  await import('../../../src/components/pedago/PedagoSessionBanner.jsx');
const { PedagoSessionProvider } = await import('../../../src/contexts/PedagoSessionContext.jsx');
const { SessionStepEditor, STEP_ACTION_LABELS } =
  await import('../../../src/components/pedago/SessionStepEditor.jsx');
const { SessionsView } = await import('../../../src/components/pedago/SessionsView.jsx');
const { PEDAGO_STEP_ACTION, PEDAGO_STEP_ACTION_ENUM } =
  await import('../../../src/shared/enums/pedagoStepActions.js');

const TUTORIAL = { id: 7, title: 'Réussir un semis', preview_url: '/api/tutorials/7/view' };
const tutorialStep = {
  id: 't1',
  title: 'Lire le tutoriel',
  body: 'Lis la fiche puis reviens.',
  action: { type: PEDAGO_STEP_ACTION.OPEN_TUTORIAL, payload: { tutorialId: 7 } },
};
const messageStep = {
  id: 'm1',
  title: 'Consigne',
  body: 'Bonjour',
  action: { type: PEDAGO_STEP_ACTION.MESSAGE, payload: {} },
};

function renderBanner(ctx, step = tutorialStep, stepIndex = 0) {
  const banner = (
    <PedagoSessionBanner
      sessionTitle="Séance semis"
      step={step}
      stepIndex={stepIndex}
      stepCount={2}
      onPrev={() => {}}
      onNext={() => {}}
      onExit={() => {}}
    />
  );
  return render(
    ctx === undefined ? (
      banner
    ) : (
      <PedagoSessionProvider value={ctx}>{banner}</PedagoSessionProvider>
    ),
  );
}

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation(async () => ({}));
  window.sessionStorage.clear();
});

describe('PedagoSessionBanner — étape tutoriel', () => {
  it('affiche l’aperçu du tutoriel du contexte, le ferme, puis le rouvre par « Tutoriel »', () => {
    renderBanner({ sessionTutorial: { tutorial: TUTORIAL, isRead: false, canAcknowledge: false } });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByTitle('Aperçu : Réussir un semis').getAttribute('src')).toBe(
      '/api/tutorials/7/view',
    );
    expect(screen.queryByRole('button', { name: 'Tutoriel' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Fermer l’aperçu' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    // Le bandeau reste en place, avec la consigne de l'étape.
    expect(screen.getByTestId('pedago-session-banner')).toBeTruthy();
    expect(screen.getByText('Lis la fiche puis reviens.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tutoriel' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('pas d’aperçu hors étape tutoriel, sans tutoriel chargé, ni hors fournisseur', () => {
    const ctx = { sessionTutorial: { tutorial: TUTORIAL } };
    const first = renderBanner(ctx, messageStep);
    expect(screen.queryByRole('dialog')).toBeNull();
    first.unmount();
    const second = renderBanner({ sessionTutorial: null });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tutoriel' })).toBeNull();
    second.unmount();
    renderBanner(undefined);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('pedago-session-banner')).toBeTruthy();
  });

  it('accusé de lecture proposé seulement quand l’état « lu » est connu', () => {
    const markSessionTutorialRead = vi.fn();
    const first = renderBanner({
      sessionTutorial: { tutorial: TUTORIAL, isRead: false, canAcknowledge: false },
      markSessionTutorialRead,
    });
    expect(document.querySelector('.tuto-preview-modal__foot')).toBeNull();
    first.unmount();
    renderBanner({
      sessionTutorial: { tutorial: TUTORIAL, isRead: true, canAcknowledge: true },
      markSessionTutorialRead,
    });
    expect(document.querySelector('.tuto-preview-modal__foot')).toBeTruthy();
  });
});

describe('SessionStepEditor — étape tutoriel', () => {
  it('le menu « Outil ouvert » suit la source unique, tutoriel compris', () => {
    expect(STEP_ACTION_LABELS).toBe(PEDAGO_STEP_ACTION_ENUM.labels);
    render(<SessionStepEditor steps={[messageStep]} onChange={() => {}} />);
    const options = screen.getAllByRole('option').map((o) => o.value);
    expect(options).toEqual([...PEDAGO_STEP_ACTION_ENUM.values]);
    expect(screen.getByRole('option', { name: 'Tutoriel' })).toBeTruthy();
  });

  it('choix du tutoriel : identifiant posé dans le payload ; tutoriel disparu signalé', () => {
    const onChange = vi.fn();
    const tutorials = [
      { id: 7, title: 'Réussir un semis' },
      { id: 9, title: 'Arroser' },
    ];
    const first = render(
      <SessionStepEditor
        steps={[{ ...tutorialStep, action: { ...tutorialStep.action, payload: {} } }]}
        onChange={onChange}
        tutorials={tutorials}
      />,
    );
    fireEvent.change(screen.getByLabelText('Tutoriel'), { target: { value: '9' } });
    expect(onChange.mock.calls[0][0][0].action).toEqual({
      type: PEDAGO_STEP_ACTION.OPEN_TUTORIAL,
      payload: { tutorialId: 9 },
    });
    first.unmount();
    render(
      <SessionStepEditor
        steps={[
          { ...tutorialStep, action: { ...tutorialStep.action, payload: { tutorialId: 42 } } },
        ]}
        onChange={onChange}
        tutorials={tutorials}
      />,
    );
    expect(screen.getByRole('option', { name: 'Tutoriel n° 42 (indisponible)' })).toBeTruthy();
  });
});

describe('SessionsView — étape tutoriel', () => {
  it('la consigne de l’étape reste lisible dans l’onglet, sous l’aperçu', async () => {
    apiMock.mockImplementation(async (url) =>
      url.startsWith('/api/pedago-sessions') ? { items: [] } : {},
    );
    render(
      <SessionsView
        activeSession={{ id: 's', title: 'Séance semis', stepIndex: 0, steps: [tutorialStep] }}
        currentStep={tutorialStep}
        onStartSession={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('pedago-session-message')).toBeTruthy());
    expect(screen.getByText('Lis la fiche puis reviens.')).toBeTruthy();
  });
});
