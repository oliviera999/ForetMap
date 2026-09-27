import { describe, test, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

/**
 * Séances pédagogiques dans le shell `App` — test de montage posé AVANT d'extraire leur
 * logique (états, callbacks, effets) vers `usePedagoSession` / `PedagoSessionContext`
 * (étape B2 de la piste B, audit du 25/09/2026, § 3.3 ligne 4). Même patron que
 * `AppShellWiring.test.jsx` : `App` est monté pour de vrai, les grosses vues sont des
 * sondes ; le bandeau de séance et le dialogue de fin, eux, sont réels.
 *
 * Couvre : démarrage (vue Séances, tâche, lien `?seance=`), séance active visible et niveau
 * imposé, navigation d'étape en étape, fin (dialogue, exécution terminée, badges), sortie,
 * séance verrouillée ou indisponible, reprise après rechargement, module éteint.
 */

const probes = vi.hoisted(() => ({
  mapTasks: [],
  pedago: [],
  unauthenticated: [],
  header: [],
  biodiv: [],
  context: [],
}));
const session = vi.hoisted(() => ({ stored: null, claims: null }));
const bootstrap = vi.hoisted(() => ({ modules: {} }));

vi.mock('../src/components/app/MapTasksArea.jsx', () => ({
  MapTasksArea: (props) => {
    probes.mapTasks.push(props);
    return <div data-testid="map-tasks-area" />;
  },
}));
// La sonde des onglets pédagogiques relève aussi la séance lue dans le contexte partagé
// (`PedagoSessionContext`), fourni par le shell depuis l'extraction.
vi.mock('../src/components/app/PedagoTabs.jsx', async () => {
  const { usePedagoSessionContext } = await import('../src/contexts/PedagoSessionContext.jsx');
  return {
    PedagoTabs: (props) => {
      probes.pedago.push(props);
      probes.context.push(usePedagoSessionContext());
      return <div data-testid="pedago-tabs" />;
    },
  };
});
vi.mock('../src/components/app/AppHeader.jsx', () => ({
  AppHeader: (props) => {
    probes.header.push(props);
    return <div data-testid="app-header" />;
  },
}));
vi.mock('../src/components/app/UnauthenticatedShell.jsx', () => ({
  UnauthenticatedShell: (props) => {
    probes.unauthenticated.push(props);
    return <div data-testid="unauthenticated-shell" />;
  },
}));
// Fournisseur réel, dont on relève les props : la séance impose son niveau (public visé et
// niveau de notion) à tout l'écran.
vi.mock('../src/contexts/BiodivPedagoContext.jsx', async (importOriginal) => {
  const actual = await importOriginal();
  const Real = actual.BiodivPedagoProvider;
  return {
    ...actual,
    BiodivPedagoProvider: (props) => {
      probes.biodiv.push(props);
      return <Real {...props} />;
    },
  };
});

const apiMock = vi.hoisted(() => vi.fn(async () => []));
vi.mock('../src/services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  api: apiMock,
  getAuthClaims: () => session.claims,
  getStoredSession: () => session.stored,
  saveStoredSession: vi.fn(),
  clearStoredSession: vi.fn(),
}));

vi.mock('../src/hooks/useAppDataSync', () => ({
  useAppDataSync: () => ({
    maps: [],
    activeMapId: 'm1',
    setActiveMapId: vi.fn(),
    zones: [],
    setZones: vi.fn(),
    tasks: [],
    setTasks: vi.fn(),
    taskProjects: [],
    setTaskProjects: vi.fn(),
    archivedTasks: [],
    setArchivedTasks: vi.fn(),
    archivedTaskProjects: [],
    setArchivedTaskProjects: vi.fn(),
    plants: [],
    setPlants: vi.fn(),
    markers: [],
    setMarkers: vi.fn(),
    tutorials: [],
    loading: false,
    refreshMs: 60000,
    serverDown: false,
    retryingServer: false,
    fetchAll: vi.fn(),
    retryServerNow: vi.fn(),
  }),
}));
vi.mock('../src/hooks/useAuthTokenRenewal', () => ({
  useAuthTokenRenewal: () => {},
  shouldAskTokenRenewal: () => false,
}));
vi.mock('../src/hooks/useAppDataPolling', () => ({ useAppDataPolling: () => {} }));
vi.mock('../src/hooks/useForetmapRealtime', () => ({ useForetmapRealtime: () => 'off' }));
vi.mock('../src/hooks/useAppBootstrap', () => ({
  useAppBootstrap: () => ({
    appVersion: '1.0.0',
    publicSettings: { modules: bootstrap.modules },
    publicSettingsReady: true,
  }),
}));

const { App } = await import('../src/App.jsx');

const STORAGE_KEY = 'foretmap.pedagoSession.v1';
const PENDING_LINK_KEY = 'foretmap.pendingSeance.v1';
const STUDENT_SESSION = {
  stored: { student: { id: 'S1', first_name: 'Ada', last_name: 'L' } },
  claims: { roleSlug: 'eleve', userId: 'S1', permissions: [] },
};
const SEANCE = {
  id: 12,
  slug: 'qui-mange-qui',
  title: 'Qui mange qui',
  templateKey: 'custom',
  level: 'lycee',
  config: { notionNiveau: 'seconde' },
  steps: [
    { title: 'Lire la consigne', body: 'Lis attentivement.', action: { type: 'message' } },
    {
      title: 'Répondre au quiz',
      body: 'Une seule question.',
      action: {
        type: 'open_quiz',
        payload: { questionCode: 'qf0042', notionId: 'C4-VIV', notionNiveau: 'cycle4' },
      },
    },
  ],
};
const REWARDS = [{ key: 'b1', emoji: '🏅', title: 'Curieux', description: 'Première séance' }];

/** Réponses simulées des routes de séance ; tout le reste renvoie `[]`. */
const routes = vi.hoisted(() => ({ start: null, complete: null, load: null }));

let gatingEvents = [];
function onGatingChanged(event) {
  gatingEvents.push(event.detail);
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  bootstrap.modules = {};
  for (const list of Object.values(probes)) list.length = 0;
  routes.start = async () => ({ ok: true });
  routes.complete = async () => ({ rewards: REWARDS });
  routes.load = async () => SEANCE;
  apiMock.mockReset();
  apiMock.mockImplementation(async (path) => {
    if (path === '/api/pedago-sessions/12/runs/start') return routes.start();
    if (path === '/api/pedago-sessions/12/runs/complete') return routes.complete();
    if (path === '/api/pedago-sessions/qui-mange-qui') return routes.load();
    return [];
  });
  gatingEvents = [];
  window.removeEventListener('learning-gating:changed', onGatingChanged);
  window.addEventListener('learning-gating:changed', onGatingChanged);
});

async function renderStudentApp() {
  session.stored = STUDENT_SESSION.stored;
  session.claims = STUDENT_SESSION.claims;
  render(<App />);
  await waitFor(() => expect(probes.pedago.length).toBeGreaterThan(0));
}

const lastPedago = () => probes.pedago.at(-1);
const banner = () => screen.queryByTestId('pedago-session-banner');

async function startFromSessionsView(seance = SEANCE) {
  let started;
  await act(async () => {
    started = await lastPedago().sessionsProps.onStartSession(seance);
  });
  return started;
}

describe('App — séances pédagogiques', () => {
  test('démarrage depuis la vue Séances : exécution ouverte, bandeau, niveau imposé', async () => {
    await renderStudentApp();
    expect(banner()).toBeNull();
    expect(lastPedago().sessionsProps.activeSession).toBeNull();
    expect(lastPedago().sessionsProps.isAuthenticated).toBe(true);

    expect(await startFromSessionsView()).toBe(true);
    expect(apiMock).toHaveBeenCalledWith('/api/pedago-sessions/12/runs/start', 'POST');

    const b = banner();
    expect(b).toBeTruthy();
    expect(b.getAttribute('aria-label')).toBe('Séance Qui mange qui');
    expect(b.textContent).toContain('1/2');
    expect(within(b).getByText('Lire la consigne')).toBeTruthy();
    expect(within(b).getByRole('button', { name: 'Précédent' }).disabled).toBe(true);
    expect(within(b).getByRole('button', { name: 'Lire' })).toBeTruthy();

    // Étape « message » : l'onglet Séances affiche la consigne.
    expect(lastPedago().tab).toBe('sessions');
    expect(lastPedago().sessionsProps.activeSession).toEqual({
      id: 12,
      slug: 'qui-mange-qui',
      title: 'Qui mange qui',
      templateKey: 'custom',
      level: 'lycee',
      notionNiveau: 'seconde',
      steps: SEANCE.steps,
      stepIndex: 0,
    });
    expect(lastPedago().sessionsProps.currentStep).toBe(SEANCE.steps[0]);
    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY))).toMatchObject({
      id: 12,
      stepIndex: 0,
    });
    expect(probes.biodiv.at(-1)).toMatchObject({
      sessionLevel: 'lycee',
      sessionNotionNiveau: 'seconde',
    });
    // Entrée en séance : le verrouillage des fiches est rechargé.
    expect(gatingEvents).toEqual([{ kind: 'pedago_session' }]);
  });

  test('étape suivante, puis fin : dialogue, exécution terminée, badges, compteur', async () => {
    await renderStudentApp();
    await startFromSessionsView();

    fireEvent.click(within(banner()).getByRole('button', { name: 'Suivant' }));
    await waitFor(() => expect(banner().textContent).toContain('2/2'));
    expect(within(banner()).getByText('Répondre au quiz')).toBeTruthy();
    expect(within(banner()).getByText('Une seule question.')).toBeTruthy();
    // Étape « quiz » : question imposée (en majuscules), notion et niveau transmis.
    expect(lastPedago()).toMatchObject({
      tab: 'quiz',
      quizInitialQuestionCode: 'QF0042',
      quizInitialNotionId: 'C4-VIV',
      quizInitialNotionNiveau: 'cycle4',
    });
    expect(lastPedago().sessionsProps.activeSession.stepIndex).toBe(1);
    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY)).stepIndex).toBe(1);

    fireEvent.click(within(banner()).getByRole('button', { name: 'Précédent' }));
    await waitFor(() => expect(banner().textContent).toContain('1/2'));
    fireEvent.click(within(banner()).getByRole('button', { name: 'Suivant' }));
    await waitFor(() => expect(banner().textContent).toContain('2/2'));

    const runsVersion = lastPedago().sessionsProps.runsVersion;
    fireEvent.click(within(banner()).getByRole('button', { name: 'Terminer' }));
    const done = await screen.findByTestId('pedago-session-done');
    expect(done.textContent).toContain('Bravo, tu as terminé « Qui mange qui ».');
    expect(banner()).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(apiMock).toHaveBeenCalledWith('/api/pedago-sessions/12/runs/complete', 'POST');
    expect(await screen.findByTestId('pedago-session-new-rewards')).toBeTruthy();
    expect(screen.getByText('Curieux')).toBeTruthy();
    await waitFor(() => expect(lastPedago().sessionsProps.runsVersion).toBe(runsVersion + 1));
    expect(lastPedago().sessionsProps.activeSession).toBeNull();
    // Sortie de séance : le niveau imposé est levé.
    expect(probes.biodiv.at(-1)).toMatchObject({ sessionLevel: null, sessionNotionNiveau: null });
    expect(gatingEvents).toEqual([{ kind: 'pedago_session' }, { kind: 'pedago_session' }]);

    fireEvent.click(within(done).getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByTestId('pedago-session-done')).toBeNull();
  });

  test('fin de séance → note de carnet → « Ouvrir mon carnet »', async () => {
    await renderStudentApp();
    await startFromSessionsView({ ...SEANCE, steps: [SEANCE.steps[0]] });
    fireEvent.click(within(banner()).getByRole('button', { name: 'Terminer' }));
    const done = await screen.findByTestId('pedago-session-done');
    fireEvent.click(within(done).getByRole('button', { name: 'Ajouter une note à mon carnet' }));
    fireEvent.click(await within(done).findByRole('button', { name: 'Ouvrir mon carnet' }));
    expect(apiMock).toHaveBeenCalledWith(
      '/api/user-journal/me/articles',
      'POST',
      expect.objectContaining({ title: 'Séance : Qui mange qui' }),
    );
    await waitFor(() => expect(screen.queryByTestId('pedago-session-done')).toBeNull());
    expect(lastPedago().tab).toBe('notebook');
  });

  test('« Quitter » ferme la séance sans la terminer', async () => {
    await renderStudentApp();
    await startFromSessionsView();
    fireEvent.click(within(banner()).getByRole('button', { name: 'Quitter' }));
    await waitFor(() => expect(banner()).toBeNull());
    expect(screen.queryByTestId('pedago-session-done')).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(apiMock).not.toHaveBeenCalledWith('/api/pedago-sessions/12/runs/complete', 'POST');
    expect(lastPedago().sessionsProps.activeSession).toBeNull();
  });

  test('séance verrouillée : refus, message, pas de bandeau', async () => {
    routes.start = async () => {
      const err = new Error('locked');
      err.body = { locked: true, error: 'Termine d’abord la séance « Découverte ».' };
      throw err;
    };
    await renderStudentApp();
    expect(await startFromSessionsView()).toBe(false);
    expect(banner()).toBeNull();
    expect(await screen.findByText('Termine d’abord la séance « Découverte ».')).toBeTruthy();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test('échec réseau au démarrage (hors verrou) : la séance s’ouvre quand même', async () => {
    routes.start = async () => {
      throw new Error('Réseau indisponible');
    };
    await renderStudentApp();
    expect(await startFromSessionsView()).toBe(true);
    expect(banner()).toBeTruthy();
  });

  test('séance sans étape : rien ne démarre', async () => {
    await renderStudentApp();
    expect(await startFromSessionsView({ ...SEANCE, steps: [] })).toBe(false);
    expect(apiMock).not.toHaveBeenCalledWith('/api/pedago-sessions/12/runs/start', 'POST');
    expect(banner()).toBeNull();
  });

  test('lien direct ?seance= : séance chargée et démarrée, adresse nettoyée', async () => {
    window.history.replaceState(null, '', '/?seance=Qui-Mange-Qui');
    await renderStudentApp();
    await waitFor(() => expect(banner()).toBeTruthy());
    expect(apiMock).toHaveBeenCalledWith('/api/pedago-sessions/qui-mange-qui');
    expect(apiMock).toHaveBeenCalledWith('/api/pedago-sessions/12/runs/start', 'POST');
    expect(window.location.search).not.toContain('seance=');
    expect(window.sessionStorage.getItem(PENDING_LINK_KEY)).toBeNull();
  });

  test('lien direct sans session : le lien est mis de côté jusqu’à la connexion', async () => {
    window.history.replaceState(null, '', '/?seance=qui-mange-qui');
    session.stored = null;
    session.claims = null;
    render(<App />);
    await waitFor(() => expect(probes.unauthenticated.length).toBeGreaterThan(0));
    expect(window.sessionStorage.getItem(PENDING_LINK_KEY)).toBe('qui-mange-qui');
    expect(window.location.search).not.toContain('seance=');
    expect(apiMock).not.toHaveBeenCalledWith('/api/pedago-sessions/qui-mange-qui');
  });

  test('séance du lien indisponible : message, pas de bandeau', async () => {
    routes.load = async () => {
      throw new Error('404');
    };
    window.history.replaceState(null, '', '/?seance=qui-mange-qui');
    await renderStudentApp();
    expect(await screen.findByText('Cette séance n’est plus disponible.')).toBeTruthy();
    expect(banner()).toBeNull();
  });

  test('lancement depuis une tâche liée (MapTasksArea)', async () => {
    await renderStudentApp();
    let started;
    await act(async () => {
      started = await probes.mapTasks.at(-1).onStartPedagoSession('qui-mange-qui');
    });
    expect(started).toBe(true);
    expect(banner()).toBeTruthy();
  });

  test('séance en cours reprise après rechargement, sans nouvel appel de démarrage', async () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        id: 12,
        slug: 'qui-mange-qui',
        title: 'Qui mange qui',
        templateKey: 'custom',
        level: 'lycee',
        notionNiveau: 'seconde',
        steps: SEANCE.steps,
        stepIndex: 1,
      }),
    );
    await renderStudentApp();
    expect(banner().textContent).toContain('2/2');
    expect(lastPedago().sessionsProps.currentStep).toEqual(SEANCE.steps[1]);
    expect(probes.biodiv.at(-1)).toMatchObject({ sessionLevel: 'lycee' });
    expect(apiMock).not.toHaveBeenCalledWith('/api/pedago-sessions/12/runs/start', 'POST');
  });

  test('la séance en cours est partagée par PedagoSessionContext', async () => {
    await renderStudentApp();
    expect(probes.context.at(-1)).toMatchObject({ available: true, activeSession: null });
    await startFromSessionsView();
    const ctx = probes.context.at(-1);
    expect(ctx.activeSession).toBe(lastPedago().sessionsProps.activeSession);
    expect(ctx.currentStep).toBe(SEANCE.steps[0]);
    expect(ctx.startSession).toBe(lastPedago().sessionsProps.onStartSession);
    expect(ctx.launchSession).toBe(probes.mapTasks.at(-1).onStartPedagoSession);
    expect(ctx.imposedLevel).toBe('lycee');
  });

  test('module Séances éteint (élève) : ni bandeau, ni niveau imposé, ni lancement', async () => {
    bootstrap.modules = { pedago_sessions_enabled: false };
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        id: 12,
        title: 'Qui mange qui',
        level: 'lycee',
        steps: SEANCE.steps,
        stepIndex: 0,
      }),
    );
    await renderStudentApp();
    expect(banner()).toBeNull();
    expect(probes.biodiv.at(-1)).toMatchObject({ sessionLevel: null, sessionNotionNiveau: null });
    expect(probes.mapTasks.at(-1).onStartPedagoSession).toBeNull();
    expect(lastPedago().pedagoSessionsEnabled).toBe(false);
  });
});
