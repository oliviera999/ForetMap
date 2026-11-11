import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * Tests de fumée des surfaces servies par le shell `App` (ForêtMap) — posés AVANT le
 * découpage d'`App.jsx` (lot 6), au patron de `AppShellWiring.test.jsx`.
 *
 * À la différence de ce dernier, **aucune vue n'est remplacée par une sonde** : l'écran
 * d'accueil réel (`UnauthenticatedShell` → `AuthScreen`) est monté, puis la visite publique
 * invitée (`VisitView`, chargée à la demande). Seul le transport (`api`) est simulé. Le but
 * n'est pas de vérifier un comportement précis, mais qu'aucune de ces deux surfaces ne lève
 * au montage — une zone morte temporelle ou un import cassé par une extraction les ferait
 * tomber sur l'`ErrorBoundary`, ce qui passerait inaperçu au build.
 */

const session = vi.hoisted(() => ({ stored: null, claims: null }));
const apiMock = vi.hoisted(() =>
  vi.fn(async (path) => {
    const url = String(path || '');
    if (url.startsWith('/api/settings/public')) return { modules: {} };
    if (url.startsWith('/api/version')) return { version: '1.0.0' };
    return [];
  }),
);
vi.mock('../src/services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  api: apiMock,
  getAuthClaims: () => session.claims,
  getStoredSession: () => session.stored,
  saveStoredSession: vi.fn(),
  clearStoredSession: vi.fn(),
}));

const { App } = await import('../src/App.jsx');

let consoleErrorSpy;

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  apiMock.mockClear();
  session.stored = null;
  session.claims = null;
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  consoleErrorSpy.mockRestore();
});

/** Une erreur de rendu React passe par `console.error` (« The above error occurred… »). */
function renderErrors() {
  return consoleErrorSpy.mock.calls
    .map((args) => args.map((a) => String(a?.message || a)).join(' '))
    .filter((line) => /error occurred|ReferenceError|TypeError|before initialization/i.test(line));
}

describe('Surfaces du shell App — fumée', () => {
  test('ForêtMap : l’écran d’accueil (connexion) se monte sans erreur', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('.auth-screen, form, button')).toBeTruthy());
    expect(screen.getByRole('button', { name: /Visiter sans compte/ })).toBeTruthy();
    expect(renderErrors()).toEqual([]);
  });

  test('Visite : la visite publique invitée se monte sans erreur', async () => {
    const { container } = render(<App />);
    const visitButton = await screen.findByRole('button', { name: /Visiter sans compte/ });
    fireEvent.click(visitButton);
    await waitFor(() => expect(container.querySelector('main.main--guest-visit')).toBeTruthy());
    // La vue est chargée à la demande : on attend qu'elle remplace le loader de l'onglet (un
    // échec de chargement ou de rendu laisserait le loader ou l'écran de reprise).
    await waitFor(
      () =>
        expect(
          container.querySelector('main.main--guest-visit [class*="visit-"]:not(.tab-loading)'),
        ).toBeTruthy(),
      { timeout: 5000 },
    );
    expect(container.querySelector('main.main--guest-visit .tab-loading')).toBeNull();
    expect(renderErrors()).toEqual([]);
  });

  /*
   * Shell authentifié monté **sans sonde** (en-tête, barres d'onglets, zone carte & tâches,
   * bandeaux, modales globales) : c'est l'arbre que le découpage déplace dans des composants.
   */
  test('ForêtMap, session élève : le shell authentifié se monte sans erreur', async () => {
    session.stored = { student: { id: 'S1', first_name: 'Ada', last_name: 'L' } };
    session.claims = { roleSlug: 'eleve', userId: 'S1', permissions: [] };
    const { container } = render(<App />);
    await waitFor(() =>
      expect(container.querySelector('main.app-main-shell--student')).toBeTruthy(),
    );
    await waitFor(() => expect(container.querySelector('main .loader-leaf')).toBeNull(), {
      timeout: 5000,
    });
    expect(container.querySelector('#app')).toBeTruthy();
    expect(renderErrors()).toEqual([]);
  });

  test('ForêtMap, session prof : le shell authentifié se monte sans erreur', async () => {
    session.stored = { user: { id: 'T1', userType: 'teacher', displayName: 'Prof Martin' } };
    session.claims = { roleSlug: 'prof', userId: 'T1', permissions: ['teacher.access'] };
    const { container } = render(<App />);
    await waitFor(() =>
      expect(container.querySelector('main.app-main-shell--teacher')).toBeTruthy(),
    );
    await waitFor(() => expect(container.querySelector('main .loader-leaf')).toBeNull(), {
      timeout: 5000,
    });
    expect(renderErrors()).toEqual([]);
  });
});
