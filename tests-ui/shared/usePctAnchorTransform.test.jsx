import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';

import { usePctAnchorTransform } from '../../src/shared/hooks/usePctAnchorTransform.js';

function Probe({ xp, yp, suffix = '' }) {
  const anchor = usePctAnchorTransform(xp, yp, suffix);
  return (
    <div data-testid="probe" ref={anchor.ref} style={anchor.style}>
      {anchor.settling ? 'settling' : 'stable'}
    </div>
  );
}

/** Conteneur 400 × 200 et `ResizeObserver` minimal, piloté par le test. */
function installMeasuredContainer() {
  const observers = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb) {
        this.cb = cb;
        observers.push(this);
      }
      observe() {}
      disconnect() {}
    },
  );
  const container = document.createElement('div');
  let size = { w: 400, h: 200 };
  Object.defineProperty(container, 'clientWidth', { get: () => size.w });
  Object.defineProperty(container, 'clientHeight', { get: () => size.h });
  document.body.appendChild(container);
  return {
    container,
    resize(w, h) {
      size = { w, h };
      act(() => observers.forEach((o) => o.cb([])));
    },
  };
}

describe('usePctAnchorTransform', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('sans mesure possible, retombe sur left / top en %', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const { getByTestId } = render(<Probe xp={25} yp={50} />);
    const el = getByTestId('probe');
    expect(el.style.left).toBe('25%');
    expect(el.style.top).toBe('50%');
    expect(el.style.transform).toBe('');
  });

  it('convertit les % en pixels du conteneur, avec le suffixe de centrage', () => {
    const { container } = installMeasuredContainer();
    const { getByTestId, rerender } = render(
      <Probe xp={25} yp={50} suffix="translate(-50%, -50%)" />,
      { container },
    );
    const el = getByTestId('probe');
    expect(el.style.left).toBe('0px');
    expect(el.style.transform).toBe('translate(100.00px, 100.00px) translate(-50%, -50%)');
    // Après le rendu d'installation, la transition peut reprendre.
    expect(el.textContent).toBe('stable');
    rerender(<Probe xp={50} yp={25} suffix="translate(-50%, -50%)" />);
    expect(el.style.transform).toBe('translate(200.00px, 50.00px) translate(-50%, -50%)');
  });

  it('suit un redimensionnement du conteneur', () => {
    const { container, resize } = installMeasuredContainer();
    const { getByTestId } = render(<Probe xp={50} yp={50} />, { container });
    const el = getByTestId('probe');
    expect(el.style.transform).toBe('translate(200.00px, 100.00px)');
    resize(800, 400);
    expect(el.style.transform).toBe('translate(400.00px, 200.00px)');
    expect(el.textContent).toBe('stable');
  });
});
