import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

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
// rendu reste synchrone et sans minuterie.
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
  stored: { student: { id: 'S1', first_name: 'Ada', last_name: 'L', affiliation: 'both' } },
  claims: { roleSlug: 'eleve', userId: 'S1', permissions: [] },
};
const TEACHER_SESSION = {
  stored: { user: { id: 'T1', userType: 'teacher', displayName: 'Prof Martin' } },
  claims: { roleSlug: 'prof', userId: 'T1', permissions: ['teacher.access'] },
};

async function renderAppWith({ stored, claims }) {
  session.stored = stored;
  session.claims = claims;
  render(<App />);
  await waitFor(() => expect(probes.mapTasks.length).toBeGreaterThan(0));
  return { mapTasks: probes.mapTasks.at(-1), pedago: probes.pedago.at(-1) };
}

beforeEach(() => {
  probes.mapTasks.length = 0;
  probes.pedago.length = 0;
  probes.unauthenticated.length = 0;
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

  test('sans session : le shell invité est rendu, sans persisteur de compte', async () => {
    session.stored = null;
    session.claims = null;
    render(<App />);
    await waitFor(() => expect(probes.unauthenticated.length).toBeGreaterThan(0));
    expect(probes.mapTasks).toHaveLength(0);
    // Le choix d'un visiteur reste local à son appareil : aucune route compte n'est appelée.
    expect(apiMock).not.toHaveBeenCalledWith(
      '/api/visit/mascot-preference',
      expect.anything(),
      expect.anything(),
    );
  });
});
