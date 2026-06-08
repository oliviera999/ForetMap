import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/** Node ≥22 peut exposer un localStorage natif incomplet (--localstorage-file) qui casse jsdom. */
function installLocalStoragePolyfill() {
  const broken =
    typeof globalThis.localStorage !== 'undefined'
    && (typeof globalThis.localStorage.setItem !== 'function'
      || typeof globalThis.localStorage.clear !== 'function');
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

Object.defineProperty(window, 'matchMedia', {
  writable: true,
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
