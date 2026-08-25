import { describe, test, expect } from 'vitest';
import {
  canRemoveEditPoints,
  clampEditMoveDelta,
  clampEditZonePct,
  clampEditPts,
  cloneEditPts,
  editEdgeMidpoints,
  editPtsSnapshotEqual,
  findEditEdgeInsertion,
  insertEditPointAt,
  moveEditPointsBy,
  normalizeEditSelection,
  normalizeSelectionRect,
  offsetDuplicateZonePoints,
  removeEditPointsAt,
  selectEditPointsInRect,
  shiftSelectionAfterRemove,
} from '../../src/utils/zoneEditGeometry.js';

describe('clampEditZonePct', () => {
  test('borne dans [0..100] et coerce en nombre', () => {
    expect(clampEditZonePct({ xp: -5, yp: 120 })).toEqual({ xp: 0, yp: 100 });
    expect(clampEditZonePct({ xp: '30', yp: '40' })).toEqual({ xp: 30, yp: 40 });
    expect(clampEditZonePct({ xp: 'x', yp: undefined })).toEqual({ xp: 0, yp: 0 });
  });
});

describe('clampEditPts', () => {
  test('borne tous les points, tolère null', () => {
    expect(
      clampEditPts([
        { xp: 200, yp: -1 },
        { xp: 10, yp: 10 },
      ]),
    ).toEqual([
      { xp: 100, yp: 0 },
      { xp: 10, yp: 10 },
    ]);
    expect(clampEditPts(null)).toEqual([]);
  });
});

describe('cloneEditPts', () => {
  test('nouvelle référence, mêmes coordonnées', () => {
    const src = [{ xp: 1, yp: 2 }];
    const out = cloneEditPts(src);
    expect(out).toEqual(src);
    expect(out).not.toBe(src);
    expect(out[0]).not.toBe(src[0]);
  });
});

describe('editPtsSnapshotEqual', () => {
  test('égalité stricte des coordonnées', () => {
    expect(editPtsSnapshotEqual([{ xp: 1, yp: 2 }], [{ xp: 1, yp: 2 }])).toBe(true);
    expect(editPtsSnapshotEqual([{ xp: 1, yp: 2 }], [{ xp: 1, yp: 3 }])).toBe(false);
  });
  test('longueurs différentes ou absent → false', () => {
    expect(editPtsSnapshotEqual([{ xp: 1, yp: 2 }], [])).toBe(false);
    expect(editPtsSnapshotEqual(null, [{ xp: 1, yp: 2 }])).toBe(false);
  });
});

describe('offsetDuplicateZonePoints', () => {
  test('décale et borne, défaut +2.5', () => {
    expect(
      offsetDuplicateZonePoints([
        { xp: 10, yp: 10 },
        { xp: 20, yp: 20 },
        { xp: 30, yp: 30 },
      ]),
    ).toEqual([
      { xp: 12.5, yp: 12.5 },
      { xp: 22.5, yp: 22.5 },
      { xp: 32.5, yp: 32.5 },
    ]);
  });
  test('borne à 100 après décalage', () => {
    expect(
      offsetDuplicateZonePoints([
        { xp: 99, yp: 99 },
        { xp: 50, yp: 50 },
        { xp: 10, yp: 10 },
      ])[0],
    ).toEqual({ xp: 100, yp: 100 });
  });
  test('moins de 3 points / non-tableau → null', () => {
    expect(
      offsetDuplicateZonePoints([
        { xp: 1, yp: 1 },
        { xp: 2, yp: 2 },
      ]),
    ).toBeNull();
    expect(offsetDuplicateZonePoints(null)).toBeNull();
  });
});

describe('findEditEdgeInsertion', () => {
  const SQUARE = [
    { xp: 0, yp: 0 },
    { xp: 100, yp: 0 },
    { xp: 100, yp: 100 },
    { xp: 0, yp: 100 },
  ];

  test('projette le clic sur l’arête la plus proche et donne l’index d’insertion', () => {
    const hit = findEditEdgeInsertion(SQUARE, { xp: 50, yp: 2 });
    expect(hit).toEqual({ index: 1, point: { xp: 50, yp: 0 } });
  });

  test('arête de fermeture (dernier → premier sommet) incluse', () => {
    const hit = findEditEdgeInsertion(SQUARE, { xp: 2, yp: 50 });
    expect(hit.index).toBe(4);
    expect(hit.point).toEqual({ xp: 0, yp: 50 });
  });

  test('clic trop loin du contour → null', () => {
    expect(findEditEdgeInsertion(SQUARE, { xp: 50, yp: 50 })).toBeNull();
    expect(findEditEdgeInsertion(SQUARE, { xp: 50, yp: 10 }, 3)).toBeNull();
  });

  test('polygone incomplet ou clic absent → null', () => {
    expect(findEditEdgeInsertion([{ xp: 1, yp: 1 }], { xp: 1, yp: 1 })).toBeNull();
    expect(findEditEdgeInsertion(SQUARE, null)).toBeNull();
  });
});

describe('insertEditPointAt', () => {
  test('insère au bon rang sans toucher aux autres sommets', () => {
    const pts = [
      { xp: 0, yp: 0 },
      { xp: 10, yp: 0 },
      { xp: 10, yp: 10 },
    ];
    const out = insertEditPointAt(pts, 1, { xp: 5, yp: 0 });
    expect(out).toEqual([
      { xp: 0, yp: 0 },
      { xp: 5, yp: 0 },
      { xp: 10, yp: 0 },
      { xp: 10, yp: 10 },
    ]);
    expect(pts).toHaveLength(3);
  });
});

describe('editEdgeMidpoints', () => {
  test('un milieu par arête, arête de fermeture comprise', () => {
    const mids = editEdgeMidpoints([
      { xp: 0, yp: 0 },
      { xp: 10, yp: 0 },
      { xp: 0, yp: 10 },
    ]);
    expect(mids).toEqual([
      { xp: 5, yp: 0, index: 1 },
      { xp: 5, yp: 5, index: 2 },
      { xp: 0, yp: 5, index: 3 },
    ]);
  });

  test('moins de 2 sommets → aucune poignée', () => {
    expect(editEdgeMidpoints([{ xp: 1, yp: 1 }])).toEqual([]);
    expect(editEdgeMidpoints(null)).toEqual([]);
  });
});

describe('removeEditPointsAt / canRemoveEditPoints', () => {
  const FIVE = [
    { xp: 0, yp: 0 },
    { xp: 10, yp: 0 },
    { xp: 20, yp: 0 },
    { xp: 20, yp: 10 },
    { xp: 0, yp: 10 },
  ];

  test('retire plusieurs sommets d’un coup', () => {
    expect(removeEditPointsAt(FIVE, [1, 3])).toEqual([
      { xp: 0, yp: 0 },
      { xp: 20, yp: 0 },
      { xp: 0, yp: 10 },
    ]);
  });

  test('refuse de descendre sous 3 sommets (tableau inchangé)', () => {
    expect(removeEditPointsAt(FIVE, [0, 1, 2])).toBe(FIVE);
    expect(canRemoveEditPoints(FIVE, [0, 1, 2])).toBe(false);
    expect(canRemoveEditPoints(FIVE, [0, 1])).toBe(true);
  });

  test('indices invalides ou vides → aucun effet', () => {
    expect(removeEditPointsAt(FIVE, [])).toBe(FIVE);
    expect(removeEditPointsAt(FIVE, [42, -1])).toBe(FIVE);
    expect(canRemoveEditPoints(FIVE, [])).toBe(false);
  });
});

describe('clampEditMoveDelta / moveEditPointsBy', () => {
  const PTS = [
    { xp: 10, yp: 10 },
    { xp: 20, yp: 10 },
    { xp: 20, yp: 20 },
    { xp: 10, yp: 20 },
  ];

  test('déplace uniquement les sommets visés', () => {
    expect(moveEditPointsBy(PTS, [0, 1], 5, 5)).toEqual([
      { xp: 15, yp: 15 },
      { xp: 25, yp: 15 },
      { xp: 20, yp: 20 },
      { xp: 10, yp: 20 },
    ]);
  });

  test('le groupe glisse le long du bord sans se déformer', () => {
    // Le groupe {0,1} ne peut avancer que de 80 en x avant que le sommet le plus à
    // droite (20) n'atteigne 100 : l'écart entre les deux sommets est conservé.
    expect(clampEditMoveDelta(PTS, [0, 1], 200, 0)).toEqual({ dx: 80, dy: 0 });
    const moved = moveEditPointsBy(PTS, [0, 1], 200, 0);
    expect(moved[0]).toEqual({ xp: 90, yp: 10 });
    expect(moved[1]).toEqual({ xp: 100, yp: 10 });
  });

  test('sélection vide → tableau inchangé', () => {
    expect(moveEditPointsBy(PTS, [], 5, 5)).toBe(PTS);
    expect(clampEditMoveDelta(PTS, [], 5, 5)).toEqual({ dx: 0, dy: 0 });
  });
});

describe('normalizeSelectionRect / selectEditPointsInRect', () => {
  test('ordonne les coins quel que soit le sens du glissement', () => {
    expect(normalizeSelectionRect({ xp: 40, yp: 60 }, { xp: 10, yp: 20 })).toEqual({
      x1: 10,
      y1: 20,
      x2: 40,
      y2: 60,
    });
  });

  test('sélectionne les sommets contenus dans le rectangle (bornes incluses)', () => {
    const pts = [
      { xp: 5, yp: 5 },
      { xp: 15, yp: 15 },
      { xp: 40, yp: 60 },
      { xp: 90, yp: 90 },
    ];
    const rect = normalizeSelectionRect({ xp: 10, yp: 10 }, { xp: 40, yp: 60 });
    expect(selectEditPointsInRect(pts, rect)).toEqual([1, 2]);
    expect(selectEditPointsInRect(pts, null)).toEqual([]);
  });
});

describe('normalizeEditSelection / shiftSelectionAfterRemove', () => {
  test('trie, dédoublonne et filtre les indices hors bornes', () => {
    expect(normalizeEditSelection([3, 1, 1, 9, -2, 'x'], 5)).toEqual([1, 3]);
  });

  test('réindexe la sélection après suppression', () => {
    // Sommets restants : 0, 2, 4 → nouveaux indices 0, 1, 2. Les supprimés disparaissent.
    expect([...shiftSelectionAfterRemove(new Set([0, 1, 4]), [1, 3])]).toEqual([0, 2]);
  });
});
