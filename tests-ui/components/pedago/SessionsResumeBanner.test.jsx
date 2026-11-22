// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within, cleanup } from '@testing-library/react';

/**
 * Chantier « parcours d'apprentissage », lot 5 — séances guidées :
 *  - le bandeau affiche « Étape n sur N », reste lisible (boutons à fond clair), demande
 *    confirmation avant de quitter et publie sa hauteur (`--fm-session-banner-h`) ;
 *  - `SessionsView` met la séance à reprendre et le catalogue AVANT « Mes badges ».
 */

const apiMock = vi.fn();
vi.mock('../../../src/services/api.js', () => ({
  api: (...args) => apiMock(...args),
  getAuthToken: () => '',
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

const { PedagoSessionBanner, SESSION_BANNER_HEIGHT_VAR, SESSION_BANNER_RESERVE_VAR } =
  await import('../../../src/components/pedago/PedagoSessionBanner.jsx');
const { SessionsView, sessionPrimaryAction } =
  await import('../../../src/components/pedago/SessionsView.jsx');

const step = (title, type = 'open_plant', body = '') => ({
  id: title,
  title,
  body,
  action: { type, payload: {} },
});

const sessionA = {
  id: 'sa',
  slug: 'seance-a',
  title: 'Séance A',
  level: 'college',
  isPublished: true,
  templateKey: 'custom',
  config: {},
  steps: [step('A1', 'message'), step('A2'), step('A3'), step('A4')],
};
const sessionB = {
  id: 'sb',
  slug: 'seance-b',
  title: 'Séance B',
  level: 'college',
  isPublished: true,
  templateKey: 'custom',
  config: {},
  steps: [step('B1', 'message'), step('B2')],
};

function mockApi({ runs = [] } = {}) {
  apiMock.mockImplementation(async (path) => {
    if (path.startsWith('/api/pedago-sessions/me/runs')) return { runs };
    if (path.startsWith('/api/pedago-sessions')) return { items: [sessionA, sessionB] };
    if (path.startsWith('/api/rewards/me')) {
      return {
        rewards: [],
        catalogue: [{ key: 'session_first', title: 'Curieux', emoji: '🌱', description: 'x' }],
      };
    }
    return {};
  });
}

beforeEach(() => {
  apiMock.mockReset();
});
afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty(SESSION_BANNER_HEIGHT_VAR);
  document.documentElement.style.removeProperty(SESSION_BANNER_RESERVE_VAR);
});

function renderBanner(props = {}) {
  const handlers = { onPrev: vi.fn(), onNext: vi.fn(), onExit: vi.fn() };
  const utils = render(
    <PedagoSessionBanner
      sessionTitle="Qui mange qui"
      step={step('Observer la fiche', 'open_plant', 'Regarde les feuilles.')}
      stepIndex={1}
      stepCount={4}
      {...handlers}
      {...props}
    />,
  );
  return { ...utils, ...handlers, banner: screen.getByTestId('pedago-session-banner') };
}

describe('PedagoSessionBanner', () => {
  it('progression « Étape n sur N » et barre accessible', () => {
    const { banner } = renderBanner();
    expect(within(banner).getByTestId('pedago-session-progress').textContent).toBe('Étape 2 sur 4');
    const bar = within(banner).getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('2');
    expect(bar.getAttribute('aria-valuemax')).toBe('4');
    expect(within(banner).getByText('Regarde les feuilles.')).toBeTruthy();
  });

  it('boutons lisibles sur le fond forêt : Précédent / Quitter à fond clair, Suivant en avant', () => {
    const { banner, onPrev, onNext } = renderBanner();
    const prev = within(banner).getByRole('button', { name: 'Précédent' });
    const quit = within(banner).getByRole('button', { name: 'Quitter' });
    const next = within(banner).getByRole('button', { name: 'Suivant' });
    expect(prev.className).toContain('pedago-session-banner__btn--light');
    expect(quit.className).toContain('pedago-session-banner__btn--light');
    expect(next.className).toContain('pedago-session-banner__btn--main');
    fireEvent.click(prev);
    fireEvent.click(next);
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('dernière étape : « Terminer »', () => {
    const { banner } = renderBanner({ stepIndex: 3 });
    expect(within(banner).getByRole('button', { name: 'Terminer' })).toBeTruthy();
  });

  it('« Quitter » demande confirmation et rappelle l’étape où reprendre', () => {
    const { banner, onExit } = renderBanner();
    fireEvent.click(within(banner).getByRole('button', { name: 'Quitter' }));
    expect(onExit).not.toHaveBeenCalled();
    const confirm = within(banner).getByTestId('pedago-session-exit-confirm');
    expect(confirm.textContent).toContain('Tu pourras la reprendre à l’étape 2');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Continuer' }));
    expect(within(banner).queryByTestId('pedago-session-exit-confirm')).toBeNull();
    fireEvent.click(within(banner).getByRole('button', { name: 'Quitter' }));
    fireEvent.click(within(banner).getByRole('button', { name: 'Oui, quitter' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('étape « message » : « Lire » seulement si fourni', () => {
    const onShowMessage = vi.fn();
    const { banner, rerender } = renderBanner({
      step: step('Consigne', 'message', 'Texte'),
      onShowMessage,
    });
    fireEvent.click(within(banner).getByRole('button', { name: 'Lire' }));
    expect(onShowMessage).toHaveBeenCalled();
    rerender(
      <PedagoSessionBanner
        sessionTitle="S"
        step={step('Consigne', 'message', 'Texte')}
        stepIndex={0}
        stepCount={2}
        onShowMessage={null}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Lire' })).toBeNull();
  });

  it('publie sa hauteur dans --fm-session-banner-h, la retire au démontage', () => {
    const { unmount } = renderBanner();
    expect(document.documentElement.style.getPropertyValue(SESSION_BANNER_HEIGHT_VAR)).toMatch(
      /px$/,
    );
    unmount();
    expect(document.documentElement.style.getPropertyValue(SESSION_BANNER_HEIGHT_VAR)).toBe('');
  });

  it('publie son emprise (hauteur + barre basse) dans --fm-session-banner-reserve', () => {
    // Les surfaces plein écran (fenêtres, feuille « Plus », plein écran carte) couvrent la
    // barre basse mais pas le bandeau, posé au-dessus d'elle : elles réservent cette emprise.
    const { unmount } = renderBanner();
    const reserve = document.documentElement.style.getPropertyValue(SESSION_BANNER_RESERVE_VAR);
    expect(reserve).toMatch(/^calc\(\d+px \+ var\(--fm-session-banner-lift, 0px\)\)$/);
    unmount();
    expect(document.documentElement.style.getPropertyValue(SESSION_BANNER_RESERVE_VAR)).toBe('');
  });
});

describe('sessionPrimaryAction', () => {
  it('Continuer (onglet), Reprendre · étape n sur N (serveur), Démarrer, Refaire', () => {
    expect(sessionPrimaryAction(sessionA, null, { id: 'sa', stepIndex: 2 })).toEqual({
      label: 'Continuer',
      resume: true,
      step: 2,
    });
    expect(sessionPrimaryAction(sessionA, { inProgress: true, currentStep: 2 }, null)).toEqual({
      label: 'Reprendre · étape 3 sur 4',
      resume: true,
      step: 2,
    });
    // Étape mémorisée au-delà d'une séance raccourcie : bornée à la dernière.
    expect(sessionPrimaryAction(sessionA, { inProgress: true, currentStep: 9 }, null).step).toBe(3);
    expect(sessionPrimaryAction(sessionA, null, null).label).toBe('Démarrer');
    expect(sessionPrimaryAction(sessionA, { completed: true }, null).label).toBe('Refaire');
  });
});

describe('SessionsView — ordre (lot 5)', () => {
  it('sans séance en cours : le catalogue passe avant « Mes badges »', async () => {
    mockApi();
    render(<SessionsView isAuthenticated rewardsEnabled onStartSession={vi.fn()} />);
    const catalogue = await screen.findByTestId('pedago-sessions-catalogue');
    const rewards = await screen.findByTestId('pedago-rewards');
    expect(catalogue.compareDocumentPosition(rewards) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getAllByRole('button', { name: 'Démarrer' })).toHaveLength(2);
    expect(screen.queryByTestId('pedago-sessions-resume')).toBeNull();
  });

  it('passage en cours côté serveur : « À reprendre » en tête, Reprendre / Recommencer', async () => {
    mockApi({ runs: [{ sessionId: 'sa', inProgress: true, currentStep: 2 }] });
    const onStartSession = vi.fn();
    render(<SessionsView isAuthenticated rewardsEnabled onStartSession={onStartSession} />);
    const resume = await screen.findByTestId('pedago-sessions-resume');
    const catalogue = screen.getByTestId('pedago-sessions-catalogue');
    expect(resume.compareDocumentPosition(catalogue) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(within(resume).getByText('Séance A')).toBeTruthy();
    expect(within(catalogue).queryByText('Séance A')).toBeNull();
    fireEvent.click(within(resume).getByRole('button', { name: 'Reprendre · étape 3 sur 4' }));
    expect(onStartSession).toHaveBeenLastCalledWith(sessionA);
    fireEvent.click(within(resume).getByRole('button', { name: 'Recommencer' }));
    expect(onStartSession).toHaveBeenLastCalledWith(sessionA, { restart: true });
  });

  it('étape « message » : consigne en tête, avec un bouton « Étape suivante »', async () => {
    mockApi();
    const onNextStep = vi.fn();
    const active = { ...sessionA, stepIndex: 0 };
    render(
      <SessionsView
        isAuthenticated
        rewardsEnabled
        activeSession={active}
        currentStep={sessionA.steps[0]}
        onStartSession={vi.fn()}
        onNextStep={onNextStep}
      />,
    );
    const message = screen.getByTestId('pedago-session-message');
    expect(message.textContent).toContain('étape 1 sur 4');
    fireEvent.click(within(message).getByRole('button', { name: 'Étape suivante' }));
    expect(onNextStep).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId('pedago-sessions-resume')).toBeTruthy());
    expect(
      within(screen.getByTestId('pedago-sessions-resume')).getByRole('button', {
        name: 'Continuer',
      }),
    ).toBeTruthy();
  });
});
