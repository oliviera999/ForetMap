import { describe, test, expect, vi, beforeEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';

/**
 * Gardes de rendu et de câblage du shell `App` — les deux branches (authentifiée et
 * invitée) doivent monter sans lever, et `onPersistVisitMascotId` doit atteindre les deux
 * zones qui portent le sélecteur de mascotte (plan et onglet Visite).
 *
 * Sans cette prop, le choix d'un **compte connecté** retombait silencieusement sur le
 * stockage local du navigateur : la mascotte ne suivait pas l'élève d'un appareil à
 * l'autre et une tablette partagée transmettait le choix au suivant.
 *
 * `App` n'avait jusqu'ici aucun test de rendu — une référence à un `const` déclaré plus
 * bas dans le corps du composant (zone morte temporelle) y passait donc inaperçue alors
 * qu'elle casse tout l'écran authentifié. D'où le montage réel du composant, avec de
 * simples sondes à la place des grosses vues.
 */

const probes = vi.hoisted(() => ({ mapTasks: [], pedago: [], unauthenticated: [] }));
const session = vi.hoisted(() => ({ stored: null, claims: null }));
const dataSyncCalls = vi.hoisted(() => []);
const tokenRenewalCalls = vi.hoisted(() => []);

vi.mock('../src/components/app/MapTasksArea.jsx', () => ({
  MapTasksArea: (props) => {
    probes.mapTasks.push(props);
    return <div data-testid="map-tasks-area" />;
  },
}));
vi.mock('../src/components/app/PedagoTabs.jsx', () => ({
  PedagoTabs: (props) => {
    probes.pedago.push(props);
    return <div data-testid="pedago-tabs" />;
  },
}));
vi.mock('../src/components/app/UnauthenticatedShell.jsx', () => ({
  UnauthenticatedShell: (props) => {
    probes.unauthenticated.push(props);
    return <div data-testid="unauthenticated-shell" />;
  },
}));

// Seuls la session et le transport sont simulés : le reste du module (withAppBase,
// helpers d'URL…) reste réel, sinon les vues du shell cassent à l'import.
const apiMock = vi.hoisted(() => vi.fn(async () => []));
vi.mock('../src/services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  api: apiMock,
  getAuthClaims: () => session.claims,
  getStoredSession: () => session.stored,
  saveStoredSession: vi.fn(),
  clearStoredSession: vi.fn(),
}));

// Le cycle de données et le temps réel sont testés ailleurs : neutralisés ici pour que le
// rendu reste synchrone et sans minuterie. On conserve les arguments : `hasAuthenticatedShell`
// mal câblé (session enseignante sans `teacher.access`) laissait l'écran sur le loader.
vi.mock('../src/hooks/useAppDataSync', () => ({
  useAppDataSync: (params) => {
    dataSyncCalls.push(params);
    return {
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
    };
  },
}));
vi.mock('../src/hooks/useAuthTokenRenewal', () => ({
  useAuthTokenRenewal: (params) => {
    tokenRenewalCalls.push(params);
  },
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

const STUDENT_SESSION = {
  stored: { student: { id: 'S1', first_name: 'Ada', last_name: 'L' } },
  claims: { roleSlug: 'eleve', userId: 'S1', permissions: [] },
};
const TEACHER_SESSION = {
  stored: { user: { id: 'T1', userType: 'teacher', displayName: 'Prof Martin' } },
  claims: { roleSlug: 'prof', userId: 'T1', permissions: ['teacher.access'] },
};
/**
 * Prof de classe dont un administrateur a décoché « Accès interface n3boss » dans
 * Profils & utilisateurs : session valide, jeton posé, mais plus de `teacher.access`.
 */
const CLASS_TEACHER_SESSION_WITHOUT_TEACHER_ACCESS = {
  stored: { token: 'jwt', user: { id: 'T2', userType: 'teacher', displayName: 'Prof Classe' } },
  claims: {
    roleSlug: 'prof_classe',
    userType: 'teacher',
    userId: 'T2',
    permissions: ['groups.read', 'groups.manage', 'stats.read.group'],
  },
};

async function renderAppWith({ stored, claims }) {
  session.stored = stored;
  session.claims = claims;
  render(<App />);
  await waitFor(() => expect(probes.mapTasks.length).toBeGreaterThan(0));
  return { mapTasks: probes.mapTasks.at(-1), pedago: probes.pedago.at(-1) };
}

beforeEach(() => {
  window.localStorage.clear();
  probes.mapTasks.length = 0;
  probes.pedago.length = 0;
  probes.unauthenticated.length = 0;
  dataSyncCalls.length = 0;
  tokenRenewalCalls.length = 0;
  apiMock.mockClear();
});

describe('App — câblage de la persistance mascotte visite', () => {
  test('session élève : le plan et les onglets pédago reçoivent un persisteur', async () => {
    const { mapTasks, pedago } = await renderAppWith(STUDENT_SESSION);
    expect(typeof mapTasks.onPersistVisitMascotId).toBe('function');
    expect(typeof pedago.onPersistVisitMascotId).toBe('function');
  });

  test('session prof : idem (la mascotte vit aussi dans le compte prof)', async () => {
    const { mapTasks, pedago } = await renderAppWith(TEACHER_SESSION);
    expect(typeof mapTasks.onPersistVisitMascotId).toBe('function');
    expect(typeof pedago.onPersistVisitMascotId).toBe('function');
  });

  test('le persisteur appelle bien la route étroite du compte', async () => {
    const { mapTasks } = await renderAppWith(STUDENT_SESSION);
    await mapTasks.onPersistVisitMascotId('sprout');
    expect(apiMock).toHaveBeenCalledWith('/api/visit/mascot-preference', 'PUT', {
      visit_mascot_catalog_id: 'sprout',
    });
  });

  /**
   * Régression : la porte d'entrée exigeait `teacher.access`, pas une session. Un compte
   * enseignant sans cette permission se connectait (200, jeton posé) puis retombait sur
   * `UnauthenticatedShell` — sans message, en connexion classique comme en OAuth Google,
   * puisque le blocage est côté client, après le jeton.
   */
  test('prof de classe sans teacher.access : la session ouvre bien l’application', async () => {
    const { mapTasks } = await renderAppWith(CLASS_TEACHER_SESSION_WITHOUT_TEACHER_ACCESS);
    expect(probes.unauthenticated).toHaveLength(0);
    expect(mapTasks).toBeTruthy();
    // Régression du correctif incomplet : la porte d'entrée passait, mais le cycle
    // de données (`loading` reste true tant que `fetchAll` n'a pas fini) et le
    // renouvellement de jeton restaient calés sur `teacher.access` — écran figé
    // sur « Chargement de la forêt… », session morte au bout d'1 h 30.
    expect(dataSyncCalls.at(-1)?.hasAuthenticatedShell).toBe(true);
    expect(tokenRenewalCalls.at(-1)?.enabled).toBe(true);
  });

  test('sans session : le shell invité est rendu, sans persisteur de compte', async () => {
    session.stored = null;
    session.claims = null;
    render(<App />);
    await waitFor(() => expect(probes.unauthenticated.length).toBeGreaterThan(0));
    expect(probes.mapTasks).toHaveLength(0);
    expect(dataSyncCalls.at(-1)?.hasAuthenticatedShell).toBe(false);
    expect(tokenRenewalCalls.at(-1)?.enabled).toBe(false);
    // Le choix d'un visiteur reste local à son appareil : aucune route compte n'est appelée.
    expect(apiMock).not.toHaveBeenCalledWith(
      '/api/visit/mascot-preference',
      expect.anything(),
      expect.anything(),
    );
  });
});

/**
 * CDG-27 — session élève expirée ou révoquée. Sur 401 `SESSION_REVOKED`, `api()` vide le
 * stockage et émet `foretmap_teacher_expired` ; l'écouteur ne vidait que `authClaims` /
 * `sessionUser`, or la porte d'entrée est `student || isTeacherAccount` : un élève restait
 * dans l'application (toast « Session n3boss expirée. », polling en échec silencieux).
 */
describe('App — session élève expirée ou révoquée (CDG-27)', () => {
  async function expectShellClosed() {
    await waitFor(() => expect(probes.unauthenticated.length).toBeGreaterThan(0));
    expect(dataSyncCalls.at(-1)?.hasAuthenticatedShell).toBe(false);
    expect(tokenRenewalCalls.at(-1)?.enabled).toBe(false);
  }

  test('401 SESSION_REVOKED (mot de passe changé) : retour à l’écran de connexion', async () => {
    await renderAppWith(STUDENT_SESSION);
    expect(probes.unauthenticated).toHaveLength(0);
    const { clearStoredSession } = await import('../src/services/api');
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('foretmap_teacher_expired', {
          detail: { deleted: false, reason: 'password_changed' },
        }),
      );
    });
    await expectShellClosed();
    expect(clearStoredSession).toHaveBeenCalled();
    // Le toast est porté par le shell invité (sonde) : message générique, sans « n3boss ».
    const toast = probes.unauthenticated.at(-1).toast;
    expect(toast).toBe('Session expirée : veuillez vous reconnecter.');
  });

  test('401 deleted:true (compte supprimé) : fermeture avec le message « compte supprimé »', async () => {
    await renderAppWith(STUDENT_SESSION);
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('foretmap_teacher_expired', {
          detail: { deleted: true, reason: 'account_deleted' },
        }),
      );
    });
    await expectShellClosed();
    expect(probes.unauthenticated.at(-1).toast).toBe(
      'Votre compte a été supprimé par un responsable.',
    );
  });
});

/**
 * Mémoire du dernier plan consulté (`foretmap_active_map`).
 *
 * Elle n'est plus écrite par un effet sur `activeMapId` — cet effet mémorisait aussi les
 * plans posés par la résolution automatique, ce qui figeait sur l'appareil un plan que
 * personne n'avait choisi et neutralisait le réglage « plan ouvert par défaut ». Le
 * sélecteur de plan doit donc porter lui-même la mémorisation, et la Visite invitée doit
 * rouvrir ce plan : sans cela, le visiteur qui revient retombe sur le plan des réglages.
 */
describe('App — mémoire du dernier plan consulté', () => {
  const MAP_KEY = 'foretmap_active_map';

  test('le sélecteur de plan mémorise le choix de l’utilisateur', async () => {
    const { mapTasks } = await renderAppWith(STUDENT_SESSION);
    expect(window.localStorage.getItem(MAP_KEY)).toBeNull();
    mapTasks.onMapChange('n3');
    expect(window.localStorage.getItem(MAP_KEY)).toBe('n3');
  });

  test('un choix vide n’efface pas la mémoire', async () => {
    window.localStorage.setItem(MAP_KEY, 'n3');
    const { mapTasks } = await renderAppWith(STUDENT_SESSION);
    mapTasks.onMapChange('');
    expect(window.localStorage.getItem(MAP_KEY)).toBe('n3');
  });

  /** Ouvre l'écran invité puis lance la visite publique, comme le bouton « Visiter ». */
  async function startGuestVisit() {
    session.stored = null;
    session.claims = null;
    render(<App />);
    await waitFor(() => expect(probes.unauthenticated.length).toBeGreaterThan(0));
    await act(async () => {
      probes.unauthenticated.at(-1).onVisitGuest();
    });
    await waitFor(() => expect(probes.unauthenticated.at(-1).showPublicVisit).toBe(true));
    return probes.unauthenticated.at(-1);
  }

  test('la Visite invitée rouvre le dernier plan consulté', async () => {
    window.localStorage.setItem(MAP_KEY, 'n3');
    const shell = await startGuestVisit();
    expect(shell.visitInitialMapId).toBe('n3');
  });

  test('sans mémoire, la Visite invitée retombe sur le plan du contexte', async () => {
    const shell = await startGuestVisit();
    // Ni mémoire ni réglage « plan par défaut (visite publique) » dans ce montage :
    // la carte active du shell fait office de repli.
    expect(shell.visitInitialMapId).toBe('m1');
  });
});
