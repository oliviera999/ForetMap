import { describe, test, expect } from 'vitest';
import {
  appendFileToStateFrames,
  computePackMediaWarnings,
  normalizePackFrameFileRef,
  removeFrameAt,
  resolveFrameUrl,
  resolveSrcPreviewUrl,
  sanitizeClientFilename,
  swapFrames,
  renameFilenameInPackStateFrames,
  removeFilenamesFromStateFrames,
  moveFilenameBlockInStateFrames,
  findContiguousFilenameBlock,
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

  test('utilise preview_url signée si fournie', () => {
    const pack = { framesBase: '/api/visit/mascot-packs/uuid/assets/' };
    const url = resolveFrameUrl(pack, 'cell-r0-c1.png', {
      assetPreviewByFilename: {
        'cell-r0-c1.png': '/api/visit/mascot-packs/uuid/assets/cell-r0-c1.png?preview_token=abc',
      },
    });
    expect(url).toBe('/api/visit/mascot-packs/uuid/assets/cell-r0-c1.png?preview_token=abc');
  });

  test('accepte un chemin absolu déjà sous /api/visit/', () => {
    const pack = { framesBase: '/api/visit/mascot-packs/uuid/assets/' };
    expect(resolveFrameUrl(pack, '/api/visit/mascot-packs/uuid/assets/cell-r0-c0.png')).toBe(
      '/api/visit/mascot-packs/uuid/assets/cell-r0-c0.png',
    );
  });
});

describe('normalizePackFrameFileRef', () => {
  test('extrait le basename depuis une URL pack', () => {
    expect(
      normalizePackFrameFileRef(
        '/api/visit/mascot-packs/uuid/assets/cell-r0-c1.png',
        '/api/visit/mascot-packs/uuid/assets/',
      ),
    ).toBe('cell-r0-c1.png');
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

describe('renameFilenameInPackStateFrames', () => {
  test('renomme dans tous les états', () => {
    const pack = {
      stateFrames: {
        idle: { files: ['old.png', 'keep.png'] },
        walk: { files: ['old.png'] },
      },
    };
    const next = renameFilenameInPackStateFrames(pack, 'old.png', 'new.png');
    expect(next.stateFrames.idle.files).toEqual(['new.png', 'keep.png']);
    expect(next.stateFrames.walk.files).toEqual(['new.png']);
  });
});

describe('removeFilenamesFromStateFrames', () => {
  test('retire plusieurs fichiers et synchronise dwell', () => {
    const sf = {
      idle: { files: ['a.png', 'b.png', 'c.png'], fps: 8, frameDwellMs: [10, 20, 30] },
    };
    const next = removeFilenamesFromStateFrames(sf, 'idle', ['b.png']);
    expect(next.idle.files).toEqual(['a.png', 'c.png']);
    expect(next.idle.frameDwellMs).toEqual([10, 30]);
  });
});

describe('moveFilenameBlockInStateFrames', () => {
  test('déplace un bloc vers le bas', () => {
    const spec = { files: ['a', 'b', 'c', 'd'], fps: 8 };
    const out = moveFilenameBlockInStateFrames(spec, spec.files, [], 8, 1, 2, 'down');
    expect(out.files).toEqual(['a', 'd', 'b', 'c']);
  });
});

describe('findContiguousFilenameBlock', () => {
  test('trouve un bloc contigu', () => {
    expect(findContiguousFilenameBlock(['a', 'b', 'c', 'd'], ['b', 'c'])).toEqual({
      start: 1,
      len: 2,
    });
    expect(findContiguousFilenameBlock(['a', 'b', 'c'], ['a', 'c'])).toBeNull();
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
