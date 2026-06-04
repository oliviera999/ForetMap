import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

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
