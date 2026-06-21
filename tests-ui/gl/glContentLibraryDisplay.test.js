import { describe, test, expect, vi, afterEach } from 'vitest';
import {
  FILE_STATUS_LABEL,
  canUseClipboard,
  createFileRow,
  entryKey,
  kindBadgeClass,
  previewSummary,
} from '../../src/gl/utils/glContentLibraryDisplay.js';

describe('glContentLibraryDisplay - previewSummary', () => {
  test('renvoie un tiret sans preview', () => {
    expect(previewSummary({})).toBe('—');
    expect(previewSummary(null)).toBe('—');
  });

  test('formate un média', () => {
    expect(
      previewSummary({ kind: 'media', preview: { mediaType: 'image', relativePath: 'a/b.png' } }),
    ).toBe('image → a/b.png');
  });

  test('média sans relativePath retombe sur url', () => {
    expect(previewSummary({ kind: 'media', preview: { url: 'http://x/y.png' } })).toBe(
      'média → http://x/y.png',
    );
  });

  test("formate les lignes valides d'un catalogue", () => {
    expect(previewSummary({ kind: 'catalog', preview: { valid: 3, received: 5 } })).toBe(
      '3/5 ligne(s) valide(s)',
    );
    expect(previewSummary({ kind: 'catalog', preview: { valid: 2 } })).toBe(
      '2/? ligne(s) valide(s)',
    );
  });

  test('formate les éléments upsertés', () => {
    expect(previewSummary({ kind: 'catalog', preview: { upserted: 7 } })).toBe(
      '7 élément(s) prêt(s)',
    );
  });

  test('formate feuillets et plateaux', () => {
    expect(
      previewSummary({
        kind: 'catalog',
        preview: { feuillets: { upserted: 4 }, plateaux: { upserted: 2 } },
      }),
    ).toBe('4 feuillet(s), 2 plateau(x)');
    expect(previewSummary({ kind: 'catalog', preview: { feuillets: {} } })).toBe(
      '0 feuillet(s), 0 plateau(x)',
    );
  });

  test('retombe sur Analyse OK', () => {
    expect(previewSummary({ kind: 'catalog', preview: {} })).toBe('Analyse OK');
  });
});

describe('glContentLibraryDisplay - kindBadgeClass', () => {
  test('média', () => {
    expect(kindBadgeClass('media')).toBe('gl-content-library-kind gl-content-library-kind--media');
  });
  test('inconnu / non supporté', () => {
    expect(kindBadgeClass('unknown')).toBe(
      'gl-content-library-kind gl-content-library-kind--unknown',
    );
    expect(kindBadgeClass('unsupported')).toBe(
      'gl-content-library-kind gl-content-library-kind--unknown',
    );
  });
  test('défaut catalogue', () => {
    expect(kindBadgeClass('species')).toBe(
      'gl-content-library-kind gl-content-library-kind--catalog',
    );
  });
});

describe('glContentLibraryDisplay - createFileRow', () => {
  test('crée une ligne en attente', () => {
    const file = { name: 'a.png', size: 10 };
    expect(createFileRow(file)).toEqual({ file, status: 'pending', progress: 0, error: null });
  });
});

describe('glContentLibraryDisplay - entryKey', () => {
  test('combine nom et index', () => {
    expect(entryKey({ fileName: 'x.xlsx' }, 2)).toBe('x.xlsx:2');
  });
});

describe('glContentLibraryDisplay - FILE_STATUS_LABEL', () => {
  test('libellés des statuts', () => {
    expect(FILE_STATUS_LABEL.uploading).toBe('Envoi');
    expect(FILE_STATUS_LABEL.error).toBe('Erreur');
  });
});

describe('glContentLibraryDisplay - canUseClipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('vrai quand writeText existe', () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: () => {} } });
    expect(canUseClipboard()).toBe(true);
  });

  test('faux sans clipboard', () => {
    vi.stubGlobal('navigator', {});
    expect(canUseClipboard()).toBe(false);
  });
});
