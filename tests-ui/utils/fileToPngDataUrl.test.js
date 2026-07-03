import { afterEach, describe, expect, test, vi } from 'vitest';
import { fileToPngDataUrl } from '../../src/utils/image.js';

/**
 * jsdom ne décode pas les images et n'implémente pas le canvas 2D :
 * on mocke `Image` (déclenche onload avec des dimensions choisies) et
 * `HTMLCanvasElement` (getContext/toDataURL) pour tester la logique pure
 * (lecture, redimensionnement max 2048, export PNG, erreurs).
 */
function installImageMock({ width = 100, height = 100, fail = false } = {}) {
  class MockImage {
    constructor() {
      this.onload = null;
      this.onerror = null;
    }

    set src(value) {
      this._src = value;
      queueMicrotask(() => {
        if (fail) {
          this.onerror?.(new Error('decode'));
          return;
        }
        this.naturalWidth = width;
        this.naturalHeight = height;
        this.onload?.();
      });
    }

    get src() {
      return this._src;
    }
  }
  vi.stubGlobal('Image', MockImage);
}

function installCanvasMock({ withContext = true } = {}) {
  const calls = [];
  const ctx = { drawImage: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(withContext ? ctx : null);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function toDataURL(type) {
    calls.push({ width: this.width, height: this.height, type });
    return `data:${type},mock`;
  });
  return { calls, ctx };
}

const pngBlob = () => new Blob(['fake-png'], { type: 'image/png' });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fileToPngDataUrl', () => {
  test('image petite : pas de redimensionnement, export PNG', async () => {
    installImageMock({ width: 320, height: 200 });
    const { calls, ctx } = installCanvasMock();
    const url = await fileToPngDataUrl(pngBlob());
    expect(url).toBe('data:image/png,mock');
    expect(calls).toEqual([{ width: 320, height: 200, type: 'image/png' }]);
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 320, 200);
  });

  test('paysage trop large : plafonné à 2048 en conservant le ratio', async () => {
    installImageMock({ width: 4096, height: 1024 });
    const { calls } = installCanvasMock();
    await fileToPngDataUrl(pngBlob());
    expect(calls).toEqual([{ width: 2048, height: 512, type: 'image/png' }]);
  });

  test('portrait trop haut : plafonné à 2048 en conservant le ratio', async () => {
    installImageMock({ width: 1000, height: 4000 });
    const { calls } = installCanvasMock();
    await fileToPngDataUrl(pngBlob());
    expect(calls).toEqual([{ width: 512, height: 2048, type: 'image/png' }]);
  });

  test('maxPx personnalisé', async () => {
    installImageMock({ width: 400, height: 400 });
    const { calls } = installCanvasMock();
    await fileToPngDataUrl(pngBlob(), 100);
    expect(calls).toEqual([{ width: 100, height: 100, type: 'image/png' }]);
  });

  test('image invalide → rejet « Image invalide »', async () => {
    installImageMock({ fail: true });
    installCanvasMock();
    await expect(fileToPngDataUrl(pngBlob())).rejects.toThrow('Image invalide');
  });

  test('canvas indisponible → rejet dédié', async () => {
    installImageMock({ width: 10, height: 10 });
    installCanvasMock({ withContext: false });
    await expect(fileToPngDataUrl(pngBlob())).rejects.toThrow('Canvas indisponible');
  });
});
