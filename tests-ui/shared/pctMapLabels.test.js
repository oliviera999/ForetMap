import { describe, expect, test } from 'vitest';

import {
  DEFAULT_LABEL_PRIORITY,
  MARKER_LABEL_MAX_WIDTH_PX,
  ZONE_LABEL_MAX_WIDTH_PX,
  ZONE_LABEL_MIN_WIDTH_PX,
  buildZoneLabelSpecs,
  labelKey,
  labelPriority,
  polygonAreaPct,
  resolveVisibleLabels,
  zoneLabelMaxWidthPx,
} from '../../src/shared/pct-map/pctMapLabels.js';
import {
  detectLeadingEmojiPrefix,
  stripLeadingEmojiPrefix,
} from '../../src/shared/emojiPrefixCore.js';

const splitEmoji = (name) => ({
  emoji: detectLeadingEmojiPrefix(name) || '',
  name: stripLeadingEmojiPrefix(name),
});

/** Rectangle simple, en pourcentage. */
const rect = (x, y, w, h) =>
  JSON.stringify([
    { xp: x, yp: y },
    { xp: x + w, yp: y },
    { xp: x + w, yp: y + h },
    { xp: x, yp: y + h },
  ]);

/** Bâtiment en U : le centroïde arithmétique tombe dans le creux, hors du polygone. */
const U_SHAPE = JSON.stringify([
  { xp: 10, yp: 10 },
  { xp: 50, yp: 10 },
  { xp: 50, yp: 50 },
  { xp: 40, yp: 50 },
  { xp: 40, yp: 20 },
  { xp: 20, yp: 20 },
  { xp: 20, yp: 50 },
  { xp: 10, yp: 50 },
]);

describe('buildZoneLabelSpecs — ancrage et emoji', () => {
  test('l’emoji de tête est séparé du nom (il n’est plus dessiné deux fois)', () => {
    const [spec] = buildZoneLabelSpecs(
      [{ id: 'z1', name: '📚 CDI', emoji: '📚', points: rect(10, 10, 20, 20) }],
      splitEmoji,
    );
    expect(spec.emoji).toBe('📚');
    expect(spec.name).toBe('CDI');
  });

  test('sans colonne emoji, le préfixe du nom sert d’emoji', () => {
    const [spec] = buildZoneLabelSpecs(
      [{ id: 'z1', name: '🧪 S', emoji: '', points: rect(0, 0, 10, 10) }],
      splitEmoji,
    );
    expect(spec.emoji).toBe('🧪');
    expect(spec.name).toBe('S');
  });

  test('l’ancre tombe **dans** le polygone même sur un bâtiment en U', () => {
    const [spec] = buildZoneLabelSpecs([{ id: 'z1', name: 'H', points: U_SHAPE }], splitEmoji);
    const pts = JSON.parse(U_SHAPE);
    const inside = (pt) => {
      let hit = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const { xp: xi, yp: yi } = pts[i];
        const { xp: xj, yp: yj } = pts[j];
        if (yi > pt.yp !== yj > pt.yp && pt.xp < ((xj - xi) * (pt.yp - yi)) / (yj - yi) + xi) {
          hit = !hit;
        }
      }
      return hit;
    };
    const centroid = {
      xp: pts.reduce((s, p) => s + p.xp, 0) / pts.length,
      yp: pts.reduce((s, p) => s + p.yp, 0) / pts.length,
    };
    expect(inside(centroid)).toBe(false); // le défaut corrigé
    expect(inside(spec.anchor)).toBe(true);
  });

  test('géométries inexploitables et lieux sans libellé : écartés', () => {
    const specs = buildZoneLabelSpecs(
      [
        { id: 'a', name: 'Trop peu de points', points: '[{"xp":0,"yp":0}]' },
        { id: 'b', name: 'Points illisibles', points: 'pas du json' },
        { id: 'c', name: '', emoji: '', points: rect(0, 0, 10, 10) },
      ],
      splitEmoji,
    );
    expect(specs).toHaveLength(0);
  });
});

describe('labelPriority / polygonAreaPct / zoneLabelMaxWidthPx', () => {
  const categories = new Map([
    ['infra', { sort_order: 10 }],
    ['detail', { sort_order: 100 }],
  ]);

  test('rang = plus petit sort_order ; sans catégorie, rang intermédiaire', () => {
    expect(labelPriority({ category_ids: ['infra', 'detail'] }, categories)).toBe(10);
    expect(labelPriority({ category_ids: ['detail'] }, categories)).toBe(100);
    expect(labelPriority({ category_ids: [] }, categories)).toBe(DEFAULT_LABEL_PRIORITY);
    // Catégorie inconnue (masquée par un réglage) : traitée comme une absence.
    expect(labelPriority({ category_ids: ['fantome'] }, categories)).toBe(DEFAULT_LABEL_PRIORITY);
  });

  test('aire du polygone, toujours positive quel que soit le sens de parcours', () => {
    expect(polygonAreaPct(JSON.parse(rect(0, 0, 10, 20)))).toBe(200);
    expect(polygonAreaPct([{ xp: 0, yp: 0 }])).toBe(0);
  });

  test('largeur allouée : celle du bâtiment, bornée haut et bas', () => {
    const tiny = { bounds: { minXPct: 0, maxXPct: 1, minYPct: 0, maxYPct: 1 } };
    const huge = { bounds: { minXPct: 0, maxXPct: 90, minYPct: 0, maxYPct: 10 } };
    expect(zoneLabelMaxWidthPx(tiny, 390, 1)).toBe(ZONE_LABEL_MIN_WIDTH_PX);
    expect(zoneLabelMaxWidthPx(huge, 390, 1)).toBe(ZONE_LABEL_MAX_WIDTH_PX);
    // Le zoom élargit le bâtiment à l'écran, donc la place offerte à son nom.
    expect(zoneLabelMaxWidthPx(tiny, 390, 20)).toBeGreaterThan(ZONE_LABEL_MIN_WIDTH_PX);
  });
});

describe('resolveVisibleLabels', () => {
  const view = { contentWidthPx: 390, contentHeightPx: 463, scale: 1 };

  test('deux noms au même endroit : le plus prioritaire seul est gardé', () => {
    const zoneSpecs = buildZoneLabelSpecs(
      [
        { id: 'a', name: 'Salle des professeurs', points: rect(40, 40, 6, 6), category_ids: [] },
        {
          id: 'b',
          name: 'Centre de documentation',
          points: rect(41, 41, 6, 6),
          category_ids: ['x'],
        },
      ],
      splitEmoji,
    );
    const visible = resolveVisibleLabels({
      ...view,
      zoneSpecs,
      markers: [],
      categoriesById: new Map([['x', { sort_order: 1 }]]),
    });
    expect(visible.has(labelKey('zone', 'b'))).toBe(true);
    expect(visible.has(labelKey('zone', 'a'))).toBe(false);
  });

  test('le lieu sélectionné garde son nom, même écrasé par un plus prioritaire', () => {
    const zoneSpecs = buildZoneLabelSpecs(
      [
        { id: 'a', name: 'Salle des professeurs', points: rect(40, 40, 6, 6), category_ids: [] },
        {
          id: 'b',
          name: 'Centre de documentation',
          points: rect(41, 41, 6, 6),
          category_ids: ['x'],
        },
      ],
      splitEmoji,
    );
    const visible = resolveVisibleLabels({
      ...view,
      zoneSpecs,
      markers: [],
      categoriesById: new Map([['x', { sort_order: 1 }]]),
      pinnedKey: labelKey('zone', 'a'),
    });
    expect(visible.has(labelKey('zone', 'a'))).toBe(true);
    expect(visible.has(labelKey('zone', 'b'))).toBe(false);
  });

  test('un repère sans catégorie est nommé dès la vue d’ensemble (plus de seuil ×3,2)', () => {
    const visible = resolveVisibleLabels({
      ...view,
      zoneSpecs: [],
      markers: [{ id: 'm1', x_pct: 20, y_pct: 20, label: 'Entrée lycée', category_ids: [] }],
      categoriesById: new Map(),
    });
    expect(visible.has(labelKey('marker', 'm1'))).toBe(true);
  });

  test('zoomer écarte les ancres sans grossir les boîtes : les noms masqués reviennent', () => {
    const zoneSpecs = buildZoneLabelSpecs(
      [
        { id: 'a', name: 'Bâtiment A', points: rect(40, 40, 4, 4) },
        { id: 'b', name: 'Bâtiment B', points: rect(45, 40, 4, 4) },
      ],
      splitEmoji,
    );
    const at1 = resolveVisibleLabels({ ...view, zoneSpecs, markers: [] });
    const at6 = resolveVisibleLabels({ ...view, zoneSpecs, markers: [], scale: 6 });
    expect(at1.size).toBe(1);
    expect(at6.size).toBe(2);
  });

  test('un nom tronqué à l’écran occupe une boîte tronquée, pas sa largeur théorique', () => {
    const long = 'Centre d’information et d’orientation, salle de formation';
    const zoneSpecs = buildZoneLabelSpecs(
      [
        { id: 'a', name: long, points: rect(30, 40, 1, 1) },
        // Assez loin pour la largeur bornée (56 px), trop près de la largeur non bornée.
        { id: 'b', name: 'Voisin', points: rect(50, 40, 1, 1) },
      ],
      splitEmoji,
    );
    const visible = resolveVisibleLabels({ ...view, zoneSpecs, markers: [] });
    expect(visible.has(labelKey('zone', 'a'))).toBe(true);
    expect(visible.has(labelKey('zone', 'b'))).toBe(true);
  });

  test('mesures inexploitables : aucune étiquette plutôt qu’un placement au hasard', () => {
    expect(
      resolveVisibleLabels({
        zoneSpecs: [],
        markers: [],
        contentWidthPx: 0,
        contentHeightPx: 0,
        scale: 1,
      }).size,
    ).toBe(0);
  });

  test('largeur maximale d’un nom de repère : constante, indépendante du bâtiment', () => {
    expect(MARKER_LABEL_MAX_WIDTH_PX).toBeGreaterThan(0);
  });
});
