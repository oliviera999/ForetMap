/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useScrollReveal } from '../../src/shared/hooks/useScrollReveal.js';

const OriginalIO = globalThis.IntersectionObserver;

function TestReveal({ rootMargin = '0px', threshold = 0.5 }) {
  const [ref, visible] = useScrollReveal({ once: true, rootMargin, threshold });
  return (
    <div data-testid="target" ref={ref} data-visible={visible ? 'yes' : 'no'}>
      contenu
    </div>
  );
}

describe('useScrollReveal', () => {
  let rectSpy;

  afterEach(() => {
    globalThis.IntersectionObserver = OriginalIO;
    rectSpy?.mockRestore();
    vi.restoreAllMocks();
  });

  it('révèle au montage si déjà dans le viewport (sans callback IO)', async () => {
    globalThis.IntersectionObserver = class SilentIO {
      observe() {}

      disconnect() {}

      unobserve() {}
    };

    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true, writable: true });

    rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function mockRect() {
      return {
        top: 40,
        left: 0,
        bottom: 140,
        right: 320,
        width: 320,
        height: 100,
        x: 0,
        y: 40,
      };
    });

    render(<TestReveal rootMargin="0px" threshold={0.01} />);

    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    expect(screen.getByTestId('target').dataset.visible).toBe('yes');
  });
});
