import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getPendingSwUpdate,
  registerServiceWorker,
  resetPendingSwUpdate,
  SW_PRELOAD_RELOAD_FLAG,
  SW_UPDATED_FLAG,
  SW_UPDATE_AVAILABLE_EVENT,
} from '../../src/shared/pwa/registerServiceWorker.js';

/**
 * Politique de mise à jour du service worker : annoncer, ne pas imposer.
 *
 * Les deux régressions couvertes ici sont celles qui motivaient le lot — un toast
 * « Nouvelle version installée » à la première visite, et un rechargement d'autorité
 * capable d'emporter une saisie en cours.
 */

/** Fabrique un faux `navigator.serviceWorker` pilotable depuis les tests. */
function makeNavigator({ controller = null } = {}) {
  const listeners = new Map();
  const registration = {
    waiting: null,
    installing: null,
    update: vi.fn(() => Promise.resolve()),
    listeners: new Map(),
    addEventListener(type, cb) {
      this.listeners.set(type, cb);
    },
    emit(type) {
      this.listeners.get(type)?.();
    },
  };
  return {
    registration,
    serviceWorker: {
      controller,
      register: vi.fn(() => Promise.resolve(registration)),
      addEventListener: (type, cb) => listeners.set(type, cb),
      emit: (type) => listeners.get(type)?.(),
    },
  };
}

/** Faux `window` : on n'y attend qu'un `reload` observable et un bus d'événements. */
function makeWindow() {
  const listeners = new Map();
  return {
    location: { reload: vi.fn() },
    setTimeout: vi.fn(),
    addEventListener: (type, cb) => listeners.set(type, cb),
    removeEventListener: (type) => listeners.delete(type),
    dispatchEvent: (event) => {
      listeners.get(event.type)?.(event);
      return true;
    },
    emit: (type, event = {}) => listeners.get(type)?.({ type, ...event }),
  };
}

/** Worker installé et en attente d'activation. */
function makeWaitingWorker() {
  const listeners = new Map();
  return {
    state: 'installing',
    postMessage: vi.fn(),
    addEventListener: (type, cb) => listeners.set(type, cb),
    emit: (type) => listeners.get(type)?.(),
  };
}

describe('registerServiceWorker', () => {
  beforeEach(() => {
    resetPendingSwUpdate();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetPendingSwUpdate();
    sessionStorage.clear();
  });

  it('ignore la première prise de contrôle : ni annonce ni rechargement', async () => {
    // Page non contrôlée au démarrage : le `clients.claim()` du SW fraîchement installé
    // émet `controllerchange` sans qu'aucune version n'ait été remplacée.
    const nav = makeNavigator({ controller: null });
    const win = makeWindow();
    registerServiceWorker({ swUrl: '/sw.js', nav, win, doc: null });
    await Promise.resolve();

    nav.serviceWorker.emit('controllerchange');

    expect(win.location.reload).not.toHaveBeenCalled();
    expect(getPendingSwUpdate()).toBeNull();
    expect(sessionStorage.getItem(SW_UPDATED_FLAG)).toBeNull();
  });

  it('annonce une mise à jour sans recharger, et recharge seulement sur apply()', async () => {
    const nav = makeNavigator({ controller: {} });
    const win = makeWindow();
    const announced = [];
    win.addEventListener(SW_UPDATE_AVAILABLE_EVENT, (event) => announced.push(event));

    registerServiceWorker({ swUrl: '/sw.js', nav, win, doc: null });
    await Promise.resolve();
    await Promise.resolve();

    const worker = makeWaitingWorker();
    nav.registration.installing = worker;
    nav.registration.emit('updatefound');
    worker.state = 'installed';
    worker.emit('statechange');

    // Annoncé…
    expect(announced).toHaveLength(1);
    expect(getPendingSwUpdate()).toEqual({ apply: expect.any(Function) });
    // …mais surtout : pas de rechargement d'autorité.
    expect(win.location.reload).not.toHaveBeenCalled();

    nav.registration.waiting = worker;
    getPendingSwUpdate().apply();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    // Le rechargement suit la reprise de contrôle par le nouveau worker.
    expect(win.location.reload).not.toHaveBeenCalled();
    nav.serviceWorker.emit('controllerchange');
    expect(win.location.reload).toHaveBeenCalledTimes(1);
    // Le drapeau survit au rechargement : le toast s'affichera après coup.
    expect(sessionStorage.getItem(SW_UPDATED_FLAG)).toBe('1');
  });

  it('annonce sans recharger quand un autre onglet applique la mise à jour', async () => {
    const nav = makeNavigator({ controller: {} });
    const win = makeWindow();
    registerServiceWorker({ swUrl: '/sw.js', nav, win, doc: null });
    await Promise.resolve();

    nav.serviceWorker.emit('controllerchange');

    expect(win.location.reload).not.toHaveBeenCalled();
    expect(getPendingSwUpdate()).not.toBeNull();
  });

  it('annonce une version déjà en attente au chargement de la page', async () => {
    const nav = makeNavigator({ controller: {} });
    const win = makeWindow();
    nav.registration.waiting = makeWaitingWorker();

    registerServiceWorker({ swUrl: '/sw.js', nav, win, doc: null });
    await Promise.resolve();
    await Promise.resolve();

    expect(getPendingSwUpdate()).not.toBeNull();
    expect(win.location.reload).not.toHaveBeenCalled();
  });

  it('recharge sur `vite:preloadError` (chunk supprimé par le déploiement), une seule fois', async () => {
    const nav = makeNavigator({ controller: {} });
    const win = makeWindow();
    registerServiceWorker({ swUrl: '/sw.js', nav, win, doc: null });
    await Promise.resolve();

    const preventDefault = vi.fn();
    win.emit('vite:preloadError', { preventDefault });

    expect(preventDefault).toHaveBeenCalled();
    expect(win.location.reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(SW_PRELOAD_RELOAD_FLAG)).toBeTruthy();

    // Anti-boucle : un second échec immédiat (après rechargement) ne relance pas.
    const nav2 = makeNavigator({ controller: {} });
    const win2 = makeWindow();
    registerServiceWorker({ swUrl: '/sw.js', nav: nav2, win: win2, doc: null });
    await Promise.resolve();
    win2.emit('vite:preloadError', { preventDefault: vi.fn() });
    expect(win2.location.reload).not.toHaveBeenCalled();
  });

  it('ne fait rien sans support service worker', () => {
    const win = makeWindow();
    expect(registerServiceWorker({ swUrl: '/sw.js', nav: {}, win, doc: null })).toBe(false);
  });
});
