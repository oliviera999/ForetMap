import { afterEach, describe, test, expect, vi } from 'vitest';
import {
  detectMediaKind,
  isServerSupportedMediaMime,
  IMAGE_TRANSCODE_THRESHOLD_BYTES,
  MEDIA_IMPORT_MAX_BYTES,
  normalizeMediaMimeType,
  planMediaImport,
  prepareMediaImport,
  retagDataUrlMimeType,
  sniffMediaMimeFromDataUrl,
} from '../../src/utils/mediaImport.js';

/** `File` minimal : seuls `name`, `type` et `size` comptent pour la planification. */
function fakeFile(name, type, size) {
  return { name, type, size };
}

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

function dataUrl(mime, bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mime};base64,${btoa(binary)}`;
}

describe('normalizeMediaMimeType', () => {
  test('nettoie les paramètres et les alias', () => {
    expect(normalizeMediaMimeType('IMAGE/JPG', 'photo.jpg')).toBe('image/jpeg');
    expect(normalizeMediaMimeType('audio/mpeg; charset=binary', 'son.mp3')).toBe('audio/mpeg');
  });

  test('repli sur l’extension quand le sélecteur ne renseigne rien (Android)', () => {
    expect(normalizeMediaMimeType('', 'IMG_20260818_101500.JPG')).toBe('image/jpeg');
    expect(normalizeMediaMimeType('application/octet-stream', 'clip.mp4')).toBe('video/mp4');
    expect(normalizeMediaMimeType('application/octet-stream', 'sans-extension')).toBe('');
  });

  test('reconnaît les formats refusés par le serveur pour pouvoir les nommer', () => {
    expect(normalizeMediaMimeType('', 'IMG_0001.HEIC')).toBe('image/heic');
    expect(isServerSupportedMediaMime('image/heic')).toBe(false);
    expect(detectMediaKind('image/heic')).toBe('image');
  });
});

describe('planMediaImport', () => {
  test('image légère et supportée : envoyée telle quelle', () => {
    const plan = planMediaImport(fakeFile('logo.png', 'image/png', 120 * 1024));
    expect(plan).toMatchObject({ ok: true, action: 'raw', kind: 'image', mimeType: 'image/png' });
  });

  test('photo lourde : ré-encodée avant envoi (sinon 413 en base64)', () => {
    const plan = planMediaImport(
      fakeFile('IMG_1234.jpg', 'image/jpeg', IMAGE_TRANSCODE_THRESHOLD_BYTES + 1),
    );
    expect(plan).toMatchObject({ ok: true, action: 'transcode' });
  });

  test('type absent : décidé après lecture des octets', () => {
    const plan = planMediaImport(fakeFile('IMG_20260818.jpg', '', 900 * 1024));
    expect(plan).toMatchObject({ ok: true, action: 'raw', mimeType: 'image/jpeg' });

    const anonyme = planMediaImport(fakeFile('fichier', 'application/octet-stream', 900 * 1024));
    expect(anonyme).toMatchObject({ ok: true, action: 'transcode', uncertain: true });
  });

  test('HEIC : ré-encodage tenté (le message d’échec guidera l’utilisateur)', () => {
    const plan = planMediaImport(fakeFile('IMG_0001.HEIC', 'image/heic', 2 * 1024 * 1024));
    expect(plan).toMatchObject({ ok: true, action: 'transcode', mimeType: 'image/heic' });
  });

  test('GIF et SVG ne passent jamais par le canvas', () => {
    expect(
      planMediaImport(fakeFile('anim.gif', 'image/gif', IMAGE_TRANSCODE_THRESHOLD_BYTES + 1)),
    ).toMatchObject({ action: 'raw' });
    expect(planMediaImport(fakeFile('icone.svg', 'image/svg+xml', 12 * 1024))).toMatchObject({
      action: 'raw',
    });
  });

  test('fichier vide ou trop lourd : refus explicite en français', () => {
    expect(planMediaImport(fakeFile('vide.jpg', 'image/jpeg', 0)).ok).toBe(false);
    const gros = planMediaImport(fakeFile('film.mp4', 'video/mp4', MEDIA_IMPORT_MAX_BYTES + 1));
    expect(gros.ok).toBe(false);
    expect(gros.error).toContain('film.mp4');
    expect(gros.error).toContain('maximum');
  });

  test('audio/vidéo non pris en charge : refus avec la liste des formats', () => {
    const plan = planMediaImport(fakeFile('voix.aac', 'audio/aac', 400 * 1024));
    expect(plan.ok).toBe(false);
    expect(plan.error).toContain('audio/mpeg');
  });
});

describe('retagDataUrlMimeType', () => {
  test('réécrit un en-tête générique', () => {
    expect(retagDataUrlMimeType('data:application/octet-stream;base64,AAAA', 'image/jpeg')).toBe(
      'data:image/jpeg;base64,AAAA',
    );
  });

  test('laisse intactes les data URLs déjà correctes ou non base64', () => {
    expect(retagDataUrlMimeType('data:image/png;base64,AAAA', 'image/png')).toBe(
      'data:image/png;base64,AAAA',
    );
    expect(retagDataUrlMimeType('data:text/plain,bonjour', 'image/png')).toBe(
      'data:text/plain,bonjour',
    );
  });
});

describe('sniffMediaMimeFromDataUrl', () => {
  test('reconnaît JPEG et PNG derrière un type générique', () => {
    expect(sniffMediaMimeFromDataUrl(dataUrl('application/octet-stream', JPEG_BYTES))).toBe(
      'image/jpeg',
    );
    expect(sniffMediaMimeFromDataUrl(dataUrl('application/octet-stream', PNG_BYTES))).toBe(
      'image/png',
    );
  });

  test('renvoie une chaîne vide sur un contenu inconnu', () => {
    expect(sniffMediaMimeFromDataUrl(dataUrl('application/octet-stream', [1, 2, 3, 4]))).toBe('');
    expect(sniffMediaMimeFromDataUrl('pas une data url')).toBe('');
  });
});

/**
 * jsdom ne décode pas les images et n'implémente pas le canvas 2D (même approche que
 * `fileToPngDataUrl.test.js`) : on simule `Image` et `HTMLCanvasElement` pour les
 * chemins de ré-encodage.
 */
function installImageMock({ width = 3000, height = 2000, fail = false } = {}) {
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
        this.width = width;
        this.height = height;
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

function installCanvasMock() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(
    (type) => `data:${type};base64,bW9jaw==`,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('prepareMediaImport', () => {
  test('photo Android sans type : envoyée avec le bon MIME, sans ré-encodage', async () => {
    const file = new File([JPEG_BYTES], 'IMG_20260818_101500.jpg', { type: '' });
    const prepared = await prepareMediaImport(file);
    expect(prepared.mimeType).toBe('image/jpeg');
    expect(prepared.transcoded).toBe(false);
    expect(prepared.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(prepared.originalName).toBe('IMG_20260818_101500.jpg');
  });

  test('fichier anonyme non identifiable : erreur lisible plutôt qu’un 400 serveur', async () => {
    installImageMock({ fail: true });
    const file = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], 'note', {
      type: 'application/octet-stream',
    });
    await expect(prepareMediaImport(file)).rejects.toThrow(/n’a pas pu être lu/);
  });

  test('HEIC illisible : message qui explique le réglage Android à changer', async () => {
    installImageMock({ fail: true });
    const file = new File([JPEG_BYTES], 'IMG_0001.HEIC', { type: 'image/heic' });
    await expect(prepareMediaImport(file)).rejects.toThrow(/HEIC/);
  });

  test('PNG lourd : ré-encodé en PNG (la transparence survit)', async () => {
    installImageMock();
    installCanvasMock();
    const heavy = new File([PNG_BYTES], 'plan.png', { type: 'image/png' });
    Object.defineProperty(heavy, 'size', { value: IMAGE_TRANSCODE_THRESHOLD_BYTES + 1 });
    const prepared = await prepareMediaImport(heavy);
    expect(prepared.transcoded).toBe(true);
    expect(prepared.mimeType).toBe('image/png');
  });

  test('photo JPEG lourde : ré-encodée en JPEG', async () => {
    installImageMock();
    installCanvasMock();
    const heavy = new File([JPEG_BYTES], 'IMG_9999.jpg', { type: 'image/jpeg' });
    Object.defineProperty(heavy, 'size', { value: IMAGE_TRANSCODE_THRESHOLD_BYTES + 1 });
    const prepared = await prepareMediaImport(heavy);
    expect(prepared.transcoded).toBe(true);
    expect(prepared.mimeType).toBe('image/jpeg');
  });

  test('refus avant tout envoi si le fichier dépasse le plafond', async () => {
    await expect(
      prepareMediaImport(fakeFile('enorme.mp4', 'video/mp4', MEDIA_IMPORT_MAX_BYTES + 1)),
    ).rejects.toThrow(/maximum/);
  });
});
