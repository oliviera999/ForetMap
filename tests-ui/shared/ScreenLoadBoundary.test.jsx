import { act, fireEvent, render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isScreenLoadError, lazyScreen, resetFailedScreens } from '../../src/shared/lazyScreen.jsx';
import {
  SCREEN_LOAD_FAILED_MESSAGE,
  SCREEN_OFFLINE_MESSAGE,
  ScreenLoadBoundary,
} from '../../src/shared/components/ScreenLoadBoundary.jsx';

function setOnline(value) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
}

function renderScreen(Screen) {
  return render(
    <ScreenLoadBoundary>
      <Suspense fallback={<p>Chargement…</p>}>
        <Screen />
      </Suspense>
    </ScreenLoadBoundary>,
  );
}

describe('lazyScreen + ScreenLoadBoundary', () => {
  afterEach(() => {
    setOnline(true);
    resetFailedScreens();
    vi.restoreAllMocks();
  });

  it('hors ligne : message dédié à la place de l’écran, puis chargement au retour du réseau', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setOnline(false);
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
      .mockResolvedValueOnce({ default: () => <p>Écran des stats</p> });
    const Screen = lazyScreen(loader);

    renderScreen(Screen);
    expect(await screen.findByText(SCREEN_OFFLINE_MESSAGE)).toBeTruthy();

    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(await screen.findByText('Écran des stats')).toBeTruthy();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('en ligne : message d’échec et bouton « Réessayer » qui retente vraiment', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('chunk absent'))
      .mockResolvedValueOnce({ default: () => <p>Forum</p> });
    const Screen = lazyScreen(loader);

    renderScreen(Screen);
    expect(await screen.findByText(SCREEN_LOAD_FAILED_MESSAGE)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    });
    expect(await screen.findByText('Forum')).toBeTruthy();
  });

  it('laisse remonter les erreurs qui ne viennent pas d’un téléchargement d’écran', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(isScreenLoadError(new Error('bug de rendu'))).toBe(false);
    expect(isScreenLoadError(null)).toBe(false);

    function Broken() {
      throw new Error('bug de rendu');
    }
    expect(() =>
      render(
        <ScreenLoadBoundary>
          <Broken />
        </ScreenLoadBoundary>,
      ),
    ).toThrow('bug de rendu');
  });
});
