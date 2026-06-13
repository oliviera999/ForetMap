import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { usePwaInstall } from '../../src/hooks/usePwaInstall';
import { IOS_INSTALL_HINT_DISMISSED_KEY } from '../../src/constants/app-runtime';

const detectIosDeviceMock = vi.fn(() => false);
vi.mock('../../src/utils/appShellHelpers', () => ({
  detectIosDevice: () => detectIosDeviceMock(),
}));

describe('usePwaInstall', () => {
  beforeEach(() => {
    detectIosDeviceMock.mockReturnValue(false);
    window.navigator.standalone = undefined;
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('expose des valeurs initiales neutres hors iOS et hors standalone', () => {
    const { result } = renderHook(() => usePwaInstall({ onToast: vi.fn() }));
    expect(result.current.deferredInstallPrompt).toBeNull();
    expect(result.current.showIosInstallHint).toBe(false);
    expect(result.current.isStandaloneMode).toBe(false);
    expect(typeof result.current.handleInstallClick).toBe('function');
    expect(typeof result.current.setShowIosInstallHint).toBe('function');
  });

  it('capture beforeinstallprompt (preventDefault + mémorise l’événement)', () => {
    const { result } = renderHook(() => usePwaInstall({ onToast: vi.fn() }));
    const event = new Event('beforeinstallprompt');
    event.preventDefault = vi.fn();
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.preventDefault).toHaveBeenCalled();
    expect(result.current.deferredInstallPrompt).toBe(event);
  });

  it('appinstalled : oublie le prompt, masque le hint et notifie', () => {
    const onToast = vi.fn();
    const { result } = renderHook(() => usePwaInstall({ onToast }));
    const event = new Event('beforeinstallprompt');
    event.preventDefault = vi.fn();
    act(() => {
      window.dispatchEvent(event);
    });
    expect(result.current.deferredInstallPrompt).toBe(event);
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(result.current.deferredInstallPrompt).toBeNull();
    expect(result.current.showIosInstallHint).toBe(false);
    expect(onToast).toHaveBeenCalledWith('Application installée sur cet appareil.');
  });

  it('affiche le hint iOS si appareil iOS, non standalone et non rejeté', () => {
    detectIosDeviceMock.mockReturnValue(true);
    const { result } = renderHook(() => usePwaInstall({ onToast: vi.fn() }));
    expect(result.current.showIosInstallHint).toBe(true);
  });

  it('n’affiche pas le hint iOS si déjà rejeté en localStorage', () => {
    detectIosDeviceMock.mockReturnValue(true);
    localStorage.setItem(IOS_INSTALL_HINT_DISMISSED_KEY, '1');
    const { result } = renderHook(() => usePwaInstall({ onToast: vi.fn() }));
    expect(result.current.showIosInstallHint).toBe(false);
  });

  it('handleInstallClick : prompt accepté → toast d’installation en cours et purge le prompt', async () => {
    const onToast = vi.fn();
    const { result } = renderHook(() => usePwaInstall({ onToast }));
    const event = new Event('beforeinstallprompt');
    event.preventDefault = vi.fn();
    event.prompt = vi.fn().mockResolvedValue(undefined);
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    act(() => {
      window.dispatchEvent(event);
    });
    await act(async () => {
      await result.current.handleInstallClick();
    });
    expect(event.prompt).toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith('Installation en cours...');
    expect(result.current.deferredInstallPrompt).toBeNull();
  });

  it('handleInstallClick : prompt refusé → toast d’annulation', async () => {
    const onToast = vi.fn();
    const { result } = renderHook(() => usePwaInstall({ onToast }));
    const event = new Event('beforeinstallprompt');
    event.preventDefault = vi.fn();
    event.prompt = vi.fn().mockResolvedValue(undefined);
    event.userChoice = Promise.resolve({ outcome: 'dismissed' });
    act(() => {
      window.dispatchEvent(event);
    });
    await act(async () => {
      await result.current.handleInstallClick();
    });
    expect(onToast).toHaveBeenCalledWith('Installation annulée.');
    expect(result.current.deferredInstallPrompt).toBeNull();
  });

  it('handleInstallClick : ne fait rien sans prompt mémorisé', async () => {
    const onToast = vi.fn();
    const { result } = renderHook(() => usePwaInstall({ onToast }));
    await act(async () => {
      await result.current.handleInstallClick();
    });
    expect(onToast).not.toHaveBeenCalled();
  });
});
