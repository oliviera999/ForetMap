// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyTextToClipboard } from '../../../src/shared/platform/clipboardText.js';

describe('copyTextToClipboard', () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    });
  });

  test('refuse une chaîne vide', async () => {
    expect(await copyTextToClipboard('')).toBe(false);
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  test('utilise navigator.clipboard quand disponible', async () => {
    expect(await copyTextToClipboard('https://exemple.test/?fil=t1')).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://exemple.test/?fil=t1');
  });

  test('repli execCommand si clipboard indisponible', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    const exec = vi.fn().mockReturnValue(true);
    document.execCommand = exec;
    expect(await copyTextToClipboard('abc')).toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
  });
});
