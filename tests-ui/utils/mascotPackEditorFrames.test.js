import { describe, test, expect } from 'vitest';
import {
  appendFileToStateFrames,
  computePackMediaWarnings,
  removeFrameAt,
  resolveFrameUrl,
  resolveSrcPreviewUrl,
  sanitizeClientFilename,
  swapFrames,
} from '../../src/utils/mascotPackEditorFrames.js';

describe('sanitizeClientFilename', () => {
  test('retire le chemin et force .png', () => {
    expect(sanitizeClientFilename('C:\\dir\\Mon Image.PNG')).toBe('mon-image.png');
    expect(sanitizeClientFilename('/a/b/sprite')).toBe('sprite.png');
  });

  test('repli « frame.png » si vide', () => {
    expect(sanitizeClientFilename('')).toBe('frame.png');
    expect(sanitizeClientFilename('   ')).toBe('frame.png');
    expect(sanitizeClientFilename(null)).toBe('frame.png');
  });

  test('caractères interdits remplacés par des tirets', () => {
    expect(sanitizeClientFilename('a b@c.png')).toBe('a-b-c.png');
  });
});

describe('resolveFrameUrl', () => {
  test('laisse passer blob/http(s)', () => {
    expect(resolveFrameUrl({}, 'blob:xyz')).toBe('blob:xyz');
    expect(resolveFrameUrl({}, 'https://x/y.png')).toBe('https://x/y.png');
  });

  test('concatène framesBase normalisé (slash ajouté)', () => {
    expect(resolveFrameUrl({ framesBase: '/base' }, 'a.png')).toBe('/base/a.png');
    expect(resolveFrameUrl({ framesBase: '/base/' }, '/a.png')).toBe('/base/a.png');
  });

  test('chaîne vide → vide', () => {
    expect(resolveFrameUrl({ framesBase: '/base/' }, '')).toBe('');
  });
});

describe('resolveSrcPreviewUrl', () => {
  test('laisse passer data/blob/http(s)', () => {
    expect(resolveSrcPreviewUrl('data:image/png;base64,AA')).toBe('data:image/png;base64,AA');
    expect(resolveSrcPreviewUrl('blob:zzz')).toBe('blob:zzz');
    expect(resolveSrcPreviewUrl('http://x/a.png')).toBe('http://x/a.png');
  });

  test('chaîne vide → vide', () => {
    expect(resolveSrcPreviewUrl('  ')).toBe('');
  });

  test('chemin relatif passé à withAppBase (retourne une chaîne)', () => {
    expect(typeof resolveSrcPreviewUrl('/api/visit/x.png')).toBe('string');
  });
});

describe('swapFrames', () => {
  const spec = { files: ['a', 'b', 'c'], fps: 8 };

  test('échange deux frames, non-mutant', () => {
    const out = swapFrames(spec, ['a', 'b', 'c'], [], 8, 0, 1);
    expect(out.files).toEqual(['b', 'a', 'c']);
    expect(spec.files).toEqual(['a', 'b', 'c']);
    expect(out.fps).toBe(8);
    expect(out.frameDwellMs).toBeUndefined();
  });

  test('synchronise frameDwellMs si longueur cohérente', () => {
    const out = swapFrames(spec, ['a', 'b', 'c'], [100, 200, 300], 8, 1, 2);
    expect(out.files).toEqual(['a', 'c', 'b']);
    expect(out.frameDwellMs).toEqual([100, 300, 200]);
  });

  test('ignore frameDwellMs si longueur incohérente', () => {
    const out = swapFrames(spec, ['a', 'b', 'c'], [100], 8, 0, 1);
    expect(out.frameDwellMs).toBeUndefined();
  });
});

describe('removeFrameAt', () => {
  const spec = { files: ['a', 'b', 'c'], fps: 8 };

  test('retire la frame et synchronise frameDwellMs', () => {
    const out = removeFrameAt(spec, ['a', 'b', 'c'], [100, 200, 300], 8, 1);
    expect(out.files).toEqual(['a', 'c']);
    expect(out.frameDwellMs).toEqual([100, 300]);
  });

  test('pas de frameDwellMs si dwell incohérent', () => {
    const out = removeFrameAt(spec, ['a', 'b', 'c'], [], 8, 0);
    expect(out.files).toEqual(['b', 'c']);
    expect(out.frameDwellMs).toBeUndefined();
  });

  test('non-mutant', () => {
    removeFrameAt(spec, ['a', 'b', 'c'], [], 8, 0);
    expect(spec.files).toEqual(['a', 'b', 'c']);
  });
});

describe('appendFileToStateFrames', () => {
  test('crée un état avec fps par défaut', () => {
    const out = appendFileToStateFrames({}, 'idle', 'a.png');
    expect(out.idle).toEqual({ fps: 8, files: ['a.png'] });
  });

  test('ajoute au fichier existant, supprime srcs', () => {
    const out = appendFileToStateFrames(
      { idle: { fps: 4, files: ['a.png'], srcs: ['x'] } },
      'idle',
      'b.png',
    );
    expect(out.idle.files).toEqual(['a.png', 'b.png']);
    expect(out.idle.fps).toBe(4);
    expect(out.idle.srcs).toBeUndefined();
  });

  test('ne duplique pas un fichier déjà présent', () => {
    const prev = { idle: { fps: 8, files: ['a.png'] } };
    const out = appendFileToStateFrames(prev, 'idle', 'a.png');
    expect(out.idle.files).toEqual(['a.png']);
  });

  test('non-mutant', () => {
    const prev = { idle: { fps: 8, files: ['a.png'] } };
    appendFileToStateFrames(prev, 'idle', 'b.png');
    expect(prev.idle.files).toEqual(['a.png']);
  });
});

describe('computePackMediaWarnings', () => {
  test('avertit pour une silhouette inconnue', () => {
    const w = computePackMediaWarnings({ fallbackSilhouette: 'licorne' }, null, [], {});
    expect(w.some((m) => m.includes('licorne'))).toBe(true);
  });

  test('aucun avertissement médiathèque hors préfixe serveur', () => {
    const w = computePackMediaWarnings({ framesBase: '/assets/mascots/x/' }, null, [], {
      idle: { files: ['missing.png'] },
    });
    expect(w).toEqual([]);
  });

  test('signale les fichiers absents quand framesBase pointe vers le pack serveur', () => {
    const uuid = '12345678-1234-1234-1234-123456789abc';
    const prefix = `/api/visit/mascot-packs/${uuid}/assets/`;
    const w = computePackMediaWarnings(
      { framesBase: prefix },
      uuid,
      [{ filename: 'present.png' }],
      { idle: { files: ['present.png', 'absent.png'] } },
    );
    expect(w.some((m) => m.includes('absent.png'))).toBe(true);
    expect(w.some((m) => m.includes('present.png'))).toBe(false);
  });

  test('pas de doublon si tous les fichiers sont présents', () => {
    const uuid = '12345678-1234-1234-1234-123456789abc';
    const prefix = `/api/visit/mascot-packs/${uuid}/assets/`;
    const w = computePackMediaWarnings({ framesBase: prefix }, uuid, [{ filename: 'a.png' }], {
      idle: { files: ['a.png'] },
    });
    expect(w).toEqual([]);
  });
});
