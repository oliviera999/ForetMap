import { describe, test, expect } from 'vitest';
import {
  computeEditorWarnings,
  filterGlobalAssets,
  insertAssetUrlIntoPackState,
  insertMascotImageIntoPackState,
  createMascotPackEditorSnapshot,
  isMascotPackEditorDirty,
  isJsonDraftDirty,
  resolvePackDialogMascotId,
  findPacksForCatalogModel,
  pickPreferredCatalogModelPack,
  getPackStrictValidation,
  buildUnifiedMascotImageEntries,
} from '../../src/utils/visitMascotPackManager.js';

describe('computeEditorWarnings', () => {
  test('avertit si état idle absent', () => {
    const w = computeEditorWarnings({ stateFrames: { walking: {} } });
    expect(w).toContain(
      'État recommandé manquant: ajoutez un état « idle » pour un fallback visuel fiable.',
    );
  });

  test('aucun avertissement idle si état idle présent', () => {
    const w = computeEditorWarnings({ stateFrames: { idle: {} } });
    expect(w.some((m) => m.includes('idle'))).toBe(false);
  });

  test('avertit pour une silhouette inconnue', () => {
    const w = computeEditorWarnings({
      fallbackSilhouette: 'licorne-rose',
      stateFrames: { idle: {} },
    });
    expect(w).toContain('Silhouette « licorne-rose » inconnue.');
  });

  test('pack vide ou null → seul l’avertissement idle', () => {
    expect(computeEditorWarnings(null)).toEqual([
      'État recommandé manquant: ajoutez un état « idle » pour un fallback visuel fiable.',
    ]);
    expect(computeEditorWarnings({})).toEqual([
      'État recommandé manquant: ajoutez un état « idle » pour un fallback visuel fiable.',
    ]);
  });

  test('stateFrames non-objet est ignoré', () => {
    const w = computeEditorWarnings({ stateFrames: 'oops' });
    expect(w.some((m) => m.includes('idle'))).toBe(true);
  });
});

describe('filterGlobalAssets', () => {
  const assets = [
    {
      id: 1,
      filename: 'spr0ut-idle.png',
      url: '/a/x.png',
      source: 'pack',
      map_id: 'foret',
      pack_label: 'SPR0UT',
    },
    { id: 2, filename: 'renard-walk.png', url: '/a/y.png', source: 'library', map_id: 'jardin' },
    { id: 3, filename: 'autre.gif', url: 'https://cdn/z.gif', source: 'catalog' },
  ];

  test('requête vide → liste inchangée', () => {
    expect(filterGlobalAssets(assets, '')).toBe(assets);
    expect(filterGlobalAssets(assets, '   ')).toBe(assets);
  });

  test('filtre par nom de fichier (insensible à la casse)', () => {
    expect(filterGlobalAssets(assets, 'RENARD').map((a) => a.id)).toEqual([2]);
  });

  test('filtre par map_id et par label de pack', () => {
    expect(filterGlobalAssets(assets, 'foret').map((a) => a.id)).toEqual([1]);
    expect(filterGlobalAssets(assets, 'spr0ut').map((a) => a.id)).toEqual([1]);
  });

  test('filtre par URL', () => {
    expect(filterGlobalAssets(assets, 'cdn').map((a) => a.id)).toEqual([3]);
  });

  test('entrée non-tableau → tableau vide', () => {
    expect(filterGlobalAssets(null, 'x')).toEqual([]);
    expect(filterGlobalAssets(undefined, '')).toEqual([]);
  });
});

describe('insertAssetUrlIntoPackState', () => {
  test('url vide → retourne une copie du pack sans modification', () => {
    const prev = { stateFrames: { idle: { srcs: ['a'] } } };
    const next = insertAssetUrlIntoPackState(prev, 'idle', '   ');
    expect(next).not.toBe(prev);
    expect(next.stateFrames).toEqual({ idle: { srcs: ['a'] } });
  });

  test('ajoute l’url aux srcs existants avec fps par défaut conservé', () => {
    const prev = { stateFrames: { idle: { srcs: ['a.png'], fps: 12 } } };
    const next = insertAssetUrlIntoPackState(prev, 'idle', 'b.png');
    expect(next.stateFrames.idle.srcs).toEqual(['a.png', 'b.png']);
    expect(next.stateFrames.idle.fps).toBe(12);
  });

  test('dédoublonne une url déjà présente', () => {
    const prev = { stateFrames: { idle: { srcs: ['a.png'] } } };
    const next = insertAssetUrlIntoPackState(prev, 'idle', 'a.png');
    expect(next.stateFrames.idle.srcs).toEqual(['a.png']);
  });

  test('convertit files + framesBase en srcs absolus puis supprime files', () => {
    const prev = { framesBase: '/base', stateFrames: { idle: { files: ['/f1.png', 'f2.png'] } } };
    const next = insertAssetUrlIntoPackState(prev, 'idle', 'c.png');
    expect(next.stateFrames.idle.srcs).toEqual(['/base/f1.png', '/base/f2.png', 'c.png']);
    expect(next.stateFrames.idle.files).toBeUndefined();
  });

  test('état cible vide → "idle" par défaut et fps minimal 8', () => {
    const next = insertAssetUrlIntoPackState({}, '', 'c.png');
    expect(next.stateFrames.idle.srcs).toEqual(['c.png']);
    expect(next.stateFrames.idle.fps).toBe(8);
  });

  test('ne mute pas le pack source', () => {
    const prev = { stateFrames: { idle: { srcs: ['a.png'] } } };
    const snapshot = JSON.parse(JSON.stringify(prev));
    insertAssetUrlIntoPackState(prev, 'idle', 'b.png');
    expect(prev).toEqual(snapshot);
  });
});

describe('insertMascotImageIntoPackState', () => {
  test('fichier pack avec framesBase aligné → mode files', () => {
    const packId = '00000000-0000-4000-8000-000000000001';
    const prefix = `/api/visit/mascot-packs/${packId}/assets/`;
    const prev = { framesBase: prefix, stateFrames: {} };
    const next = insertMascotImageIntoPackState(prev, 'idle', {
      kind: 'pack-file',
      filename: 'a.png',
      url: `${prefix}a.png`,
      framesBaseHint: prefix,
    });
    expect(next.stateFrames.idle.files).toEqual(['a.png']);
    expect(next.stateFrames.idle.srcs).toBeUndefined();
  });
});

describe('isMascotPackEditorDirty', () => {
  test('détecte un changement de libellé ou de pack', () => {
    const snap = createMascotPackEditorSnapshot({ stateFrames: { idle: {} } }, 'A');
    expect(isMascotPackEditorDirty(snap, { stateFrames: { idle: {} } }, 'A')).toBe(false);
    expect(isMascotPackEditorDirty(snap, { stateFrames: { idle: {} } }, 'B')).toBe(true);
  });
});

describe('buildUnifiedMascotImageEntries', () => {
  test('filtre par origine pack', () => {
    const entries = buildUnifiedMascotImageEntries({
      packAssets: [{ filename: 'p.png', url: '/pack/p.png' }],
      libAssets: [{ filename: 'm.png', url: '/map/m.png' }],
      globalAssets: [],
      packUuid: '00000000-0000-4000-8000-000000000001',
      mapId: 'foret',
      sourceFilter: 'pack',
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe('pack');
  });

  test('filtre Site : uniquement le catalogue statique public', () => {
    const entries = buildUnifiedMascotImageEntries({
      packAssets: [],
      libAssets: [],
      globalAssets: [
        { id: '1', source: 'public', filename: 'a.png', url: '/assets/mascots/a.png' },
        {
          id: '2',
          source: 'pack',
          filename: 'b.png',
          url: '/api/visit/mascot-packs/x/assets/b.png',
          pack_id: 'x',
        },
        {
          id: '3',
          source: 'library',
          filename: 'c.png',
          url: '/api/visit/mascot-sprite-library/foret/assets/c.png',
          map_id: 'foret',
        },
      ],
      packUuid: '00000000-0000-4000-8000-000000000001',
      mapId: 'foret',
      sourceFilter: 'site',
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].apiSource).toBe('public');
    expect(entries[0].canDelete).toBe(true);
    expect(entries[0].deleteScope).toBe('public');
  });

  test('suppression contextuelle pack et bibliothèque courante', () => {
    const packUuid = '00000000-0000-4000-8000-000000000001';
    const entries = buildUnifiedMascotImageEntries({
      packAssets: [],
      libAssets: [],
      globalAssets: [
        {
          id: 'p1',
          source: 'pack',
          filename: 'mine.png',
          url: `/api/visit/mascot-packs/${packUuid}/assets/mine.png`,
          pack_id: packUuid,
          map_id: 'foret',
        },
        {
          id: 'p2',
          source: 'pack',
          filename: 'other.png',
          url: '/api/visit/mascot-packs/other/assets/other.png',
          pack_id: 'other',
          map_id: 'foret',
          pack_label: 'Autre',
        },
        {
          id: 'l1',
          source: 'library',
          filename: 'lib.png',
          url: '/api/visit/mascot-sprite-library/foret/assets/lib.png',
          map_id: 'foret',
        },
      ],
      packUuid,
      mapId: 'foret',
      sourceFilter: 'all',
    });
    const mine = entries.find((e) => e.filename === 'mine.png');
    const other = entries.find((e) => e.filename === 'other.png');
    const lib = entries.find((e) => e.filename === 'lib.png');
    expect(mine?.canDelete).toBe(true);
    expect(mine?.deleteScope).toBe('pack');
    expect(other?.canDelete).toBe(false);
    expect(other?.meta).toContain('Autre');
    expect(lib?.canDelete).toBe(true);
    expect(lib?.deleteScope).toBe('map');
  });
});

describe('resolvePackDialogMascotId', () => {
  test('priorise clonedFromCatalogId', () => {
    expect(
      resolvePackDialogMascotId({ clonedFromCatalogId: 'sprout-rive' }, { catalog_id: 'srv-abc' }),
    ).toBe('sprout-rive');
  });

  test('ignore catalog_id srv-* sans clone', () => {
    expect(resolvePackDialogMascotId({}, { catalog_id: 'srv-abc' })).toBe('');
    expect(resolvePackDialogMascotId({}, { catalog_id: 'fox-backpack-spritesheet' })).toBe(
      'fox-backpack-spritesheet',
    );
  });
});

describe('isJsonDraftDirty', () => {
  test('JSON identique au pack → pas dirty', () => {
    const pack = { stateFrames: { idle: {} }, mascotPackVersion: 1 };
    const json = JSON.stringify(pack);
    expect(isJsonDraftDirty(json, pack)).toBe(false);
  });

  test('JSON modifié → dirty', () => {
    const pack = { stateFrames: { idle: {} }, mascotPackVersion: 1 };
    expect(isJsonDraftDirty(JSON.stringify({ ...pack, label: 'x' }), pack)).toBe(true);
  });

  test('JSON invalide non vide → dirty', () => {
    expect(isJsonDraftDirty('{oops', {})).toBe(true);
  });
});

describe('findPacksForCatalogModel / pickPreferredCatalogModelPack', () => {
  const packs = [
    {
      id: 'a',
      updated_at: '2026-01-01',
      pack: { clonedFromCatalogId: 'sprout' },
    },
    {
      id: 'b',
      updated_at: '2026-06-01',
      pack: { clonedFromCatalogId: 'sprout' },
    },
    { id: 'c', pack: { clonedFromCatalogId: 'fox' } },
  ];

  test('findPacksForCatalogModel filtre par modèle', () => {
    expect(findPacksForCatalogModel(packs, 'sprout').map((p) => p.id)).toEqual(['a', 'b']);
  });

  test('pickPreferredCatalogModelPack préfère le pack sélectionné', () => {
    const picked = pickPreferredCatalogModelPack(findPacksForCatalogModel(packs, 'sprout'), 'a');
    expect(picked?.pack?.id).toBe('a');
    expect(picked?.ambiguous).toBe(true);
  });

  test('pickPreferredCatalogModelPack prend le plus récent sinon', () => {
    const picked = pickPreferredCatalogModelPack(findPacksForCatalogModel(packs, 'sprout'), null);
    expect(picked?.pack?.id).toBe('b');
    expect(picked?.ambiguous).toBe(true);
  });
});

describe('getPackStrictValidation', () => {
  const packId = '00000000-0000-4000-8000-000000000001';
  const mapId = 'foret';

  test('accepte framesBase pack et bibliothèque carte', () => {
    const pack = {
      mascotPackVersion: 1,
      id: 'test-pack',
      label: 'Test',
      renderer: 'sprite_cut',
      frameWidth: 32,
      frameHeight: 32,
      fallbackSilhouette: 'gnome',
      framesBase: `/api/visit/mascot-packs/${packId}/assets/`,
      stateFrames: {
        idle: { files: ['a.png'], fps: 8 },
      },
    };
    const result = getPackStrictValidation(pack, packId, mapId);
    expect(result.ok).toBe(true);
  });
});
