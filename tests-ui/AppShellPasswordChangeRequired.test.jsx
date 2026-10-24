import { describe, test, expect, vi, beforeEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';

/**
 * Mot de passe provisoire ou compromis à changer — câblage du shell `App` (test de montage
 * posé avec le correctif, patron `AppShellWiring.test.jsx`).
 *
 * Le serveur refuse désormais toute route à session obligatoire d'un compte marqué
 * (`403 { code: 'PASSWORD_CHANGE_REQUIRED' }`), sauf « Mon profil ». Le shell doit donc y
 * conduire l'utilisateur, élève comme enseignant : à la connexion, à la restauration de
 * session (`/api/auth/me`) et sur le refus lui-même (événement émis par `api()`). Le bandeau
 * « mot de passe provisoire » de l'éditeur suit le même drapeau, levé par le changement.
 */

const probes = vi.hoisted(() => ({ mapTasks: [], unauthenticated: [], profile: [] }));
const session = vi.hoisted(() => ({ stored: null, claims: null }));

vi.mock('../src/components/app/MapTasksArea.jsx', () => ({
  MapTasksArea: (props) => {
    probes.mapTasks.push(props);
    return <div data-testid="map-tasks-area" />;
  },
}));
vi.mock('../src/components/app/PedagoTabs.jsx', () => ({
  PedagoTabs: () => <div data-testid="pedago-tabs" />,
}));
vi.mock('../src/components/app/AppHeader.jsx', () => ({
  AppHeader: () => <div data-testid="app-header" />,
}));
vi.mock('../src/components/app/UnauthenticatedShell.jsx', () => ({
  UnauthenticatedShell: (props) => {
    probes.unauthenticated.push(props);
    return <div data-testid="unauthenticated-shell" />;
  },
}));
// L'éditeur « Mon profil » (chargé à la demande) est remplacé par une sonde de ses props.
vi.mock('../src/components/stats-views', () => ({
  StudentStats: () => null,
  TeacherStats: () => null,
  StudentProfileEditor: (props) => {
    probes.profile.push(props);
    return <div data-testid="profile-editor" />;
  },
}));

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
    publicSettings: { modules: {} },
    publicSettingsReady: true,
  }),
}));

const { App } = await import('../src/App.jsx');

const STUDENT = { id: 'S1', first_name: 'Ada', last_name: 'L' };
const STUDENT_AUTH = { userType: 'student', userId: 'S1', roleSlug: 'eleve', permissions: [] };
const STUDENT_SESSION = {
  stored: { token: 'jwt', student: STUDENT },
  claims: { roleSlug: 'eleve', userType: 'student', userId: 'S1', permissions: [] },
};
const TEACHER_SESSION = {
  stored: { token: 'jwt', user: { id: 'T1', userType: 'teacher', displayName: 'Prof Martin' } },
  claims: { roleSlug: 'prof', userType: 'teacher', userId: 'T1', permissions: ['teacher.access'] },
};

/** Réponses serveur simulées : `/api/auth/me` porte (ou non) le drapeau. */
function serveAuthMe(passwordMustReset) {
  apiMock.mockImplementation(async (path) => {
    if (path === '/api/auth/me') return { auth: STUDENT_AUTH, passwordMustReset };
    if (path === '/api/students/register') return STUDENT;
    return [];
  });
}

async function renderAppWith({ stored, claims }) {
  session.stored = stored;
  session.claims = claims;
  render(<App />);
  await waitFor(() => expect(probes.mapTasks.length).toBeGreaterThan(0));
}

beforeEach(() => {
  window.localStorage.clear();
  probes.mapTasks.length = 0;
  probes.unauthenticated.length = 0;
  probes.profile.length = 0;
  apiMock.mockReset();
  apiMock.mockImplementation(async () => []);
});

describe('App — mot de passe à changer : conduite vers « Mon profil »', () => {
  test('restauration de session : /api/auth/me le signale → « Mon profil » s’ouvre avec le bandeau', async () => {
    serveAuthMe(true);
    await renderAppWith(STUDENT_SESSION);
    await waitFor(() => expect(probes.profile.length).toBeGreaterThan(0));
    expect(probes.profile.at(-1).student).toMatchObject({ id: 'S1', passwordMustReset: true });

    // Changement réussi : l'éditeur remonte `passwordMustReset: false`, le bandeau tombe.
    await act(async () => {
      probes.profile.at(-1).onUpdated({
        authToken: 'jwt-neuf',
        auth: STUDENT_AUTH,
        passwordMustReset: false,
      });
    });
    await waitFor(() => expect(probes.profile.at(-1).student.passwordMustReset).toBe(false));
  });

  test('sans drapeau : « Mon profil » reste fermé', async () => {
    serveAuthMe(false);
    await renderAppWith(STUDENT_SESSION);
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/api/auth/me'));
    // Laisse la réponse de /me se propager avant de conclure.
    await act(async () => {});
    expect(probes.profile).toHaveLength(0);
  });

  test('refus 403 PASSWORD_CHANGE_REQUIRED (événement d’api()) : ouverture, compte enseignant compris', async () => {
    await renderAppWith(TEACHER_SESSION);
    expect(probes.profile).toHaveLength(0);
    await act(async () => {
      window.dispatchEvent(new CustomEvent('foretmap_password_change_required'));
    });
    await waitFor(() => expect(probes.profile.length).toBeGreaterThan(0));
    expect(probes.profile.at(-1).student).toMatchObject({
      id: 'T1',
      user_type: 'teacher',
      passwordMustReset: true,
    });
  });

  test('connexion avec un mot de passe provisoire : « Mon profil » s’ouvre dès l’entrée', async () => {
    session.stored = null;
    session.claims = null;
    render(<App />);
    await waitFor(() => expect(probes.unauthenticated.length).toBeGreaterThan(0));
    // La page de connexion a rangé la session avant d'appeler `onLogin`.
    session.stored = STUDENT_SESSION.stored;
    session.claims = STUDENT_SESSION.claims;
    await act(async () => {
      probes.unauthenticated.at(-1).onLogin({
        ...STUDENT,
        authToken: 'jwt',
        auth: STUDENT_AUTH,
        passwordMustReset: true,
      });
    });
    await waitFor(() => expect(probes.profile.length).toBeGreaterThan(0));
    expect(probes.profile.at(-1).student.passwordMustReset).toBe(true);
  });
});
