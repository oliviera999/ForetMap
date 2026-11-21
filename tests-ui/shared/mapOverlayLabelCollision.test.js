import { describe, expect, test } from 'vitest';

import {
  LABEL_COLLISION_PADDING_PX,
  boxesOverlap,
  estimateGlyphBox,
  estimateLabelBox,
  estimateTextWidthPx,
  orderLabelCandidates,
  resolveLabelCollisions,
  TEXT_WIDTH_SAFETY_RATIO,
  unbrokenTextWidthPx,
} from '../../src/shared/pct-map/mapOverlayLabelCollision.js';

describe('orderLabelCandidates', () => {
  test('épinglée, puis famille, rang, importance, ordre d’entrée', () => {
    const ordered = orderLabelCandidates([
      { id: 'tard', tier: 1, priority: 0 },
      { id: 'petit', priority: 5, weight: 1 },
      { id: 'grand', priority: 5, weight: 9 },
      { id: 'rang', priority: 1 },
      { id: 'sansRang' },
      { id: 'epingle', tier: 2, priority: 99, pinned: true },
      { id: 'grand2', priority: 5, weight: 9 },
    ]);
    expect(ordered.map((c) => c.id)).toEqual([
      'epingle',
      'rang',
      'grand',
      'grand2',
      'petit',
      'sansRang',
      'tard',
    ]);
  });

  test('ne modifie pas la liste reçue ; entrée absente : liste vide', () => {
    const input = [
      { id: 'b', priority: 2 },
      { id: 'a', priority: 1 },
    ];
    orderLabelCandidates(input);
    expect(input.map((c) => c.id)).toEqual(['b', 'a']);
    expect(orderLabelCandidates(null)).toEqual([]);
  });
});

describe('estimateLabelBox — nom posé sous un emoji', () => {
  const pad = LABEL_COLLISION_PADDING_PX;

  test('anchorY « top » : le haut du texte est sur y, une 2e ligne descend', () => {
    const one = estimateLabelBox({ x: 0, y: 20, text: 'CDI', fontSizePx: 10, anchorY: 'top' });
    expect(one.top).toBeCloseTo(20 - pad, 5);
    expect(one.bottom).toBeCloseTo(20 + 12 + pad, 5);
    const two = estimateLabelBox({
      x: 0,
      y: 20,
      text: 'Salle polyvalente du bâtiment',
      fontSizePx: 10,
      maxWidthPx: 60,
      maxLines: 2,
      anchorY: 'top',
    });
    expect(two.top).toBeCloseTo(one.top, 5); // le haut ne bouge pas
    expect(two.bottom).toBeCloseTo(20 + 24 + pad, 5);
  });

  test('extraWidthPx élargit la boîte (pilule du lieu sélectionné)', () => {
    const plain = estimateLabelBox({ x: 0, y: 0, text: 'CDI', fontSizePx: 10 });
    const pill = estimateLabelBox({ x: 0, y: 0, text: 'CDI', fontSizePx: 10, extraWidthPx: 12 });
    expect(pill.right - pill.left).toBeCloseTo(plain.right - plain.left + 12, 5);
  });

  test('estimateGlyphBox : carré centré de la taille du glyphe', () => {
    const box = estimateGlyphBox({ x: 10, y: 10, sizePx: 16 });
    expect(box).toEqual({ left: 2 - pad, right: 18 + pad, top: 2 - pad, bottom: 18 + pad });
  });
});

describe('estimateLabelBox / boxesOverlap', () => {
  test('boîte centrée sur le point, largeur croissante avec le texte', () => {
    const short = estimateLabelBox({ x: 100, y: 50, text: 'CDI', fontSizePx: 10 });
    const long = estimateLabelBox({ x: 100, y: 50, text: 'Salle polyvalente', fontSizePx: 10 });
    expect((short.left + short.right) / 2).toBeCloseTo(100, 5);
    expect(long.right - long.left).toBeGreaterThan(short.right - short.left);
    expect(short.bottom).toBeGreaterThan(short.top);
  });

  test('se toucher ne compte pas comme un recouvrement', () => {
    const a = { left: 0, right: 10, top: 0, bottom: 10 };
    expect(boxesOverlap(a, { left: 10, right: 20, top: 0, bottom: 10 })).toBe(false);
    expect(boxesOverlap(a, { left: 9, right: 20, top: 0, bottom: 10 })).toBe(true);
  });
});

describe('resolveLabelCollisions', () => {
  const box = (x, y) => ({ left: x - 20, right: x + 20, top: y - 6, bottom: y + 6 });

  test('sans recouvrement : tout est gardé', () => {
    const visible = resolveLabelCollisions([
      { id: 'a', box: box(0, 0) },
      { id: 'b', box: box(100, 0) },
    ]);
    expect([...visible].sort()).toEqual(['a', 'b']);
  });

  test('en cas de recouvrement, la priorité de catégorie gagne', () => {
    const visible = resolveLabelCollisions([
      { id: 'sanitaires', box: box(0, 0), priority: 90 },
      { id: 'entree', box: box(10, 0), priority: 10 },
    ]);
    expect([...visible]).toEqual(['entree']);
  });

  test('à priorité égale, le poids (aire) départage ; puis l’ordre d’entrée', () => {
    expect([
      ...resolveLabelCollisions([
        { id: 'petite', box: box(0, 0), priority: 10, weight: 1 },
        { id: 'grande', box: box(5, 0), priority: 10, weight: 100 },
      ]),
    ]).toEqual(['grande']);
    expect([
      ...resolveLabelCollisions([
        { id: 'premier', box: box(0, 0) },
        { id: 'second', box: box(5, 0) },
      ]),
    ]).toEqual(['premier']);
  });

  test('une étiquette épinglée (lieu sélectionné) passe avant tout', () => {
    const visible = resolveLabelCollisions([
      { id: 'prioritaire', box: box(0, 0), priority: 1 },
      { id: 'selection', box: box(5, 0), priority: 999, pinned: true },
    ]);
    expect([...visible]).toEqual(['selection']);
  });

  test('le rang de famille (tier) passe avant la catégorie ; l’épinglé reste premier', () => {
    const visible = resolveLabelCollisions([
      { id: 'nom-prioritaire', box: box(0, 0), tier: 1, priority: 0 },
      { id: 'emoji', box: box(5, 0), tier: 0, priority: 99 },
    ]);
    expect([...visible]).toEqual(['emoji']);
    const pinned = resolveLabelCollisions([
      { id: 'emoji', box: box(5, 0), tier: 0 },
      { id: 'selection', box: box(0, 0), tier: 1, pinned: true },
    ]);
    expect([...pinned]).toEqual(['selection']);
  });

  test('entrées vides ou sans boîte : ignorées', () => {
    expect(resolveLabelCollisions(null).size).toBe(0);
    expect(resolveLabelCollisions([{ id: 'x' }, null]).size).toBe(0);
  });
});

describe('estimateTextWidthPx / unbrokenTextWidthPx — mots jamais coupés (U5)', () => {
  // Largeurs relevées au canvas sur DM Sans 700 à 22,4 px (21/11/2026) : l'estimation doit
  // les couvrir, sans quoi le mot se coupe au milieu (« Aromati / ques »).
  test.each([
    ['Aromatiques', 142],
    ['Bananeraie', 124],
    ['Jardinières', 123],
    ['Compost', 101],
    ['Manguier', 103],
    ['Ruches', 81],
  ])('« %s » : estimation ≥ largeur réelle (%i px)', (word, real) => {
    const est = estimateTextWidthPx(word, 22.4);
    expect(est).toBeGreaterThanOrEqual(real);
    // …sans exagérer : moins de 15 % au-dessus.
    expect(est).toBeLessThan(real * 1.15);
  });

  test('marge de sûreté et emoji pleine largeur', () => {
    expect(TEXT_WIDTH_SAFETY_RATIO).toBeGreaterThan(1);
    expect(estimateTextWidthPx('', 12)).toBe(0);
    expect(estimateTextWidthPx('🌳', 20)).toBeGreaterThan(estimateTextWidthPx('a', 20));
  });

  test('une ligne : largeur du texte entier ; plusieurs : jamais sous le mot le plus long', () => {
    const fs = 20;
    const total = estimateTextWidthPx('Stand des aromatiques', fs);
    const longest = estimateTextWidthPx('aromatiques', fs);
    expect(unbrokenTextWidthPx('Stand des aromatiques', fs, 1)).toBeCloseTo(total, 6);
    const two = unbrokenTextWidthPx('Stand des aromatiques', fs, 2);
    expect(two).toBeGreaterThanOrEqual(longest);
    expect(two).toBeLessThan(total);
    // Mot seul : sa largeur, quel que soit le nombre de lignes.
    expect(unbrokenTextWidthPx('Phragmitaie', fs, 2)).toBeCloseTo(
      estimateTextWidthPx('Phragmitaie', fs),
      6,
    );
    expect(unbrokenTextWidthPx('   ', fs, 2)).toBe(0);
  });

  test('deux lignes équilibrées : « Potager zone 3 » ne laisse pas « 3 » seul', () => {
    const fs = 20;
    const w = unbrokenTextWidthPx('Potager zone 3', fs, 2);
    // Tient en deux lignes « Potager » / « zone 3 » : pas besoin de la ligne entière.
    expect(w).toBeLessThan(estimateTextWidthPx('Potager zone', fs));
    expect(w).toBeGreaterThanOrEqual(estimateTextWidthPx('Potager', fs));
  });

  test('naturalWidthPx remplace l’estimation moyenne', () => {
    const base = { x: 0, y: 0, text: 'Aromatiques', fontSizePx: 20, padding: 0 };
    const box = estimateLabelBox({ ...base, naturalWidthPx: 150 });
    expect(box.right - box.left).toBeCloseTo(150, 6);
    const capped = estimateLabelBox({ ...base, naturalWidthPx: 150, maxWidthPx: 100, maxLines: 2 });
    expect(capped.right - capped.left).toBeCloseTo(100, 6);
    expect(capped.bottom - capped.top).toBeCloseTo(2 * 20 * 1.2, 6);
  });
});
