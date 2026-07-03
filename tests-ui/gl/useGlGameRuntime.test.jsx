import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../../src/gl/services/apiGL.js', () => ({ apiGL: vi.fn() }));
vi.mock('socket.io-client', () => ({ io: vi.fn() }));

import { apiGL } from '../../src/gl/services/apiGL.js';
import { io } from 'socket.io-client';
import { useGlGameRuntime } from '../../src/gl/hooks/useGlGameRuntime.js';
import { GL_DEFAULT_GAMEPLAY } from '../../src/gl/utils/glGameplayRules.js';

function makeFakeSocket() {
  const handlers = {};
  return {
    handlers,
    on: vi.fn((event, cb) => {
      handlers[event] = cb;
    }),
    emit: vi.fn(),
    close: vi.fn(),
  };
}

function defaultProps(overrides = {}) {
  return {
    token: 'tok',
    auth: { userType: 'gl_player', userId: 7, teamId: null, gameId: null },
    isGuest: false,
    isAdmin: false,
    updateSession: vi.fn(),
    setError: vi.fn(),
    isMjMapControls: false,
    showStaffAdminUi: false,
    showsPlayerChrome: true,
    setNarrationToast: vi.fn(),
    setTurnToast: vi.fn(),
    setRoundToast: vi.fn(),
    setSpellRejectedToast: vi.fn(),
    ...overrides,
  };
}

/** Routeur apiGL minimal : réponses par URL exacte, {} sinon. */
function mockApiRoutes(routes) {
  vi.mocked(apiGL).mockImplementation(async (url) => {
    if (url in routes) {
      const value = routes[url];
      return typeof value === 'function' ? value() : value;
    }
    return {};
  });
}

function renderRuntime(props) {
  return renderHook((p) => useGlGameRuntime(p), { initialProps: props });
}

describe('useGlGameRuntime', () => {
  beforeEach(() => {
    vi.mocked(apiGL).mockReset();
    vi.mocked(io).mockReset();
    vi.mocked(io).mockImplementation(() => makeFakeSocket());
  });

  it('joueur connecté : charge chapitres/config/profil, pose la partie active et gameState', async () => {
    mockApiRoutes({
      '/api/gl/chapters': [{ id: 1, slug: 'ch1', title: 'Chapitre 1' }],
      '/api/gl/auth/config': { modules: {}, title: 'GL' },
      '/api/gl/auth/me': {
        auth: { userType: 'gl_player', userId: 7, gameId: 42 },
        profile: { id: 7, displayName: 'Luna' },
      },
      '/api/gl/gameplay-settings': { settings: { turnsEnabled: true } },
      '/api/gl/games/42': { game: { id: 42, status: 'live' }, teams: [{ id: 5, name: 'Gnomes' }] },
    });
    const props = defaultProps();
    const { result } = renderRuntime(props);

    await waitFor(() => expect(result.current.activeGameId).toBe(42));
    await waitFor(() => expect(result.current.gameState?.game?.id).toBe(42));
    expect(result.current.chapters).toEqual([{ id: 1, slug: 'ch1', title: 'Chapitre 1' }]);
    expect(result.current.glConfig?.title).toBe('GL');
    expect(result.current.glProfile).toEqual({ id: 7, displayName: 'Luna' });
    expect(result.current.gameplaySettings.turnsEnabled).toBe(true);
    expect(result.current.turnsEnabled).toBe(true);
    expect(props.updateSession).toHaveBeenCalledWith({
      auth: { userType: 'gl_player', userId: 7, gameId: 42 },
    });
    // View model normalisé : équipes présentes, tableaux par défaut sinon.
    expect(result.current.gameState.teams).toEqual([{ id: 5, name: 'Gnomes' }]);
    expect(result.current.gameState.markers).toEqual([]);
  });

  it('invité : charge chapitres/config + chapitre de démo, sans profil ni partie', async () => {
    mockApiRoutes({
      '/api/gl/chapters': [{ id: 1, slug: 'intro', title: 'Intro' }],
      '/api/gl/auth/config': { modules: {} },
      '/api/gl/chapters/intro': { chapter: { plateau_number: 2, title: 'Intro' } },
    });
    const props = defaultProps({ isGuest: true, auth: { userType: 'gl_guest' } });
    const { result } = renderRuntime(props);

    await waitFor(() =>
      expect(result.current.guestChapter).toEqual({ plateau_number: 2, title: 'Intro' }),
    );
    const calledUrls = vi.mocked(apiGL).mock.calls.map((call) => call[0]);
    expect(calledUrls).not.toContain('/api/gl/auth/me');
    expect(calledUrls).not.toContain('/api/gl/gameplay-settings');
    expect(result.current.activeGameId).toBeNull();
    expect(result.current.gameState).toBeNull();
    expect(result.current.gameplaySettings).toEqual(GL_DEFAULT_GAMEPLAY);
  });

  it('socket temps réel : abonnement à la partie, toasts et rechargement sur événement', async () => {
    const fakeSocket = makeFakeSocket();
    vi.mocked(io).mockImplementation(() => fakeSocket);
    mockApiRoutes({
      '/api/gl/chapters': [],
      '/api/gl/auth/config': {},
      '/api/gl/auth/me': { auth: { userType: 'gl_player', userId: 7, gameId: 42 } },
      '/api/gl/gameplay-settings': { settings: {} },
      '/api/gl/games/42': { game: { id: 42 }, teams: [] },
    });
    const props = defaultProps();
    const { result, unmount } = renderRuntime(props);

    await waitFor(() => expect(io).toHaveBeenCalledTimes(1));
    expect(io.mock.calls[0][1]).toMatchObject({ path: '/socket.io', auth: { token: 'tok' } });
    await waitFor(() => expect(fakeSocket.handlers['gl:game:event']).toBeTypeOf('function'));

    act(() => {
      fakeSocket.handlers.connect();
    });
    expect(fakeSocket.emit).toHaveBeenCalledWith('subscribe:gl-game', { gameId: 42 });

    const gamesCallsBefore = vi
      .mocked(apiGL)
      .mock.calls.filter((call) => call[0] === '/api/gl/games/42').length;
    await act(async () => {
      fakeSocket.handlers['gl:game:event']({
        gameId: 42,
        eventType: 'narration',
        payload: { text: 'Bienvenue au royaume' },
      });
    });
    expect(props.setNarrationToast).toHaveBeenCalledWith({
      text: 'Bienvenue au royaume',
      ts: expect.any(Number),
    });
    await waitFor(() => {
      const gamesCallsAfter = vi
        .mocked(apiGL)
        .mock.calls.filter((call) => call[0] === '/api/gl/games/42').length;
      expect(gamesCallsAfter).toBe(gamesCallsBefore + 1);
    });

    // Événement d'une autre partie : ignoré (ni toast ni rechargement).
    props.setNarrationToast.mockClear();
    await act(async () => {
      fakeSocket.handlers['gl:game:event']({
        gameId: 99,
        eventType: 'narration',
        payload: { text: 'ailleurs' },
      });
    });
    expect(props.setNarrationToast).not.toHaveBeenCalled();

    expect(result.current.activeGameId).toBe(42);
    unmount();
    expect(fakeSocket.close).toHaveBeenCalledTimes(1);
  });

  it('socket : turn_change, round_start et spell_cast_rejected alimentent les bons toasts', async () => {
    const fakeSocket = makeFakeSocket();
    vi.mocked(io).mockImplementation(() => fakeSocket);
    mockApiRoutes({
      '/api/gl/chapters': [],
      '/api/gl/auth/config': {},
      '/api/gl/auth/me': { auth: { userType: 'gl_player', userId: 7, gameId: 42 } },
      '/api/gl/gameplay-settings': { settings: {} },
      '/api/gl/games/42': { game: { id: 42 }, teams: [] },
    });
    const props = defaultProps();
    renderRuntime(props);
    await waitFor(() => expect(fakeSocket.handlers['gl:game:event']).toBeTypeOf('function'));

    await act(async () => {
      fakeSocket.handlers['gl:game:event']({
        gameId: 42,
        eventType: 'turn_change',
        payload: { teamId: 5 },
      });
      fakeSocket.handlers['gl:game:event']({
        gameId: 42,
        eventType: 'round_start',
        payload: { roundNumber: 3 },
      });
      fakeSocket.handlers['gl:game:event']({
        gameId: 42,
        eventType: 'spell_cast_rejected',
        payload: { spellName: 'Brume' },
      });
    });
    expect(props.setTurnToast).toHaveBeenCalledWith({ teamId: 5, ts: expect.any(Number) });
    expect(props.setRoundToast).toHaveBeenCalledWith({ roundNumber: 3, ts: expect.any(Number) });
    expect(props.setSpellRejectedToast).toHaveBeenCalledWith({
      spellName: 'Brume',
      ts: expect.any(Number),
    });
  });

  it('recordDiceRoll : vrai sans appel API quand le jeu en tours est inactif', async () => {
    mockApiRoutes({
      '/api/gl/chapters': [],
      '/api/gl/auth/config': {},
      '/api/gl/auth/me': { auth: { userType: 'gl_player', userId: 7, gameId: 42 } },
      '/api/gl/gameplay-settings': { settings: { turnsEnabled: false } },
      '/api/gl/games/42': { game: { id: 42 }, teams: [] },
    });
    const props = defaultProps();
    const { result } = renderRuntime(props);
    await waitFor(() => expect(result.current.gameState?.game?.id).toBe(42));

    const before = vi.mocked(apiGL).mock.calls.length;
    let ok;
    await act(async () => {
      ok = await result.current.recordDiceRoll({ values: [3], total: 3 });
    });
    expect(ok).toBe(true);
    expect(vi.mocked(apiGL).mock.calls.length).toBe(before);
  });

  it('recordDiceRoll : refuse sans équipe active quand le jeu en tours est actif', async () => {
    mockApiRoutes({
      '/api/gl/chapters': [],
      '/api/gl/auth/config': {},
      '/api/gl/auth/me': { auth: { userType: 'gl_player', userId: 7, gameId: 42 } },
      '/api/gl/gameplay-settings': { settings: { turnsEnabled: true } },
      '/api/gl/games/42': { game: { id: 42 }, teams: [] },
    });
    const props = defaultProps(); // auth.teamId null, pas MJ → aucune équipe active
    const { result } = renderRuntime(props);
    await waitFor(() => expect(result.current.turnsEnabled).toBe(true));
    await waitFor(() => expect(result.current.gameState?.game?.id).toBe(42));

    let ok;
    await act(async () => {
      ok = await result.current.recordDiceRoll({ values: [3], total: 3 });
    });
    expect(ok).toBe(false);
    expect(props.setError).toHaveBeenCalledWith('Choisissez une équipe avant de lancer les dés.');
  });

  it('markerArrivalEnabled : suit qcmMjOnly pour un joueur, toujours vrai côté staff', async () => {
    mockApiRoutes({
      '/api/gl/chapters': [],
      '/api/gl/auth/config': {},
      '/api/gl/auth/me': { auth: { userType: 'gl_player', userId: 7 } },
      '/api/gl/gameplay-settings': { settings: { qcmMjOnly: true } },
    });
    const props = defaultProps();
    const { result, rerender } = renderRuntime(props);
    await waitFor(() => expect(result.current.gameplaySettings.qcmMjOnly).toBe(true));
    expect(result.current.markerArrivalEnabled).toBe(false);

    rerender(defaultProps({ showStaffAdminUi: true, isMjMapControls: true, isAdmin: true }));
    expect(result.current.markerArrivalEnabled).toBe(true);
  });
});
