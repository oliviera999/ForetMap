import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

/*
 * Délai des attentes asynchrones (`findBy*`, `waitFor`) : 1 s par défaut dans Testing Library,
 * trop court pour le job `quality` sur un exécuteur GitHub saturé. Trois tests sans rapport
 * entre eux y sont tombés le même jour (27/09/2026 : MoodleAdminPanel deux fois,
 * AppPlanMount) alors qu'ils passent en ~200 ms en local. Un délai plus long ne ralentit
 * aucun test qui réussit (l'attente s'arrête dès que la condition est vraie) ; il ne pèse que
 * sur un test qui échoue. Le délai par test (`testTimeout`, vitest.config.js) reste au-dessus.
 */
configure({ asyncUtilTimeout: 5000 });

/** Node ≥22 peut exposer un localStorage natif incomplet (--localstorage-file) qui casse jsdom. */
function installLocalStoragePolyfill() {
  const broken =
    typeof globalThis.localStorage !== 'undefined' &&
    (typeof globalThis.localStorage.setItem !== 'function' ||
      typeof globalThis.localStorage.clear !== 'function');
  if (typeof globalThis.localStorage !== 'undefined' && !broken) return;

  const store = new Map();
  const polyfill = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.has(String(key)) ? store.get(String(key)) : null;
    },
    key(index) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key) {
      store.delete(String(key));
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
  };
  globalThis.localStorage = polyfill;
  if (typeof window !== 'undefined') {
    window.localStorage = polyfill;
  }
}

installLocalStoragePolyfill();

// Les tests d'utilitaires purs peuvent tourner en `@vitest-environment node` (pour prouver
// l'absence de dépendance au DOM) : `window` n'existe alors pas, on ne pose que les globals.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

/** useScrollReveal et effets index_olution (jsdom n’expose pas IntersectionObserver). */
class MockIntersectionObserver {
  constructor(callback) {
    this.callback = callback;
  }

  observe(target) {
    this.callback?.([{ isIntersecting: true, target }]);
  }

  disconnect() {}

  unobserve() {}
}

globalThis.IntersectionObserver = MockIntersectionObserver;

/** useCountUp : termine l’animation en un frame (jsdom ne pilote pas rAF). */
globalThis.requestAnimationFrame = (callback) => {
  callback(performance.now() + 2000);
  return 1;
};
globalThis.cancelAnimationFrame = vi.fn();

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
});
