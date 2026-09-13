import { describe, expect, test } from 'vitest';

import {
  DEFAULT_LABEL_PRIORITY,
  MARKER_LABEL_MAX_WIDTH_PX,
  ZONE_LABEL_MAX_WIDTH_PX,
  ZONE_LABEL_MIN_WIDTH_PX,
  buildZoneLabelSpecs,
  defaultLabelPriority,
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

/**
 * Rang par défaut relatif — audit du 13 septembre, N2.
 *
 * Le rang 50 avait été choisi quand les catégories de production valaient 10 et 100 : il
 * passait alors bien au milieu. L'établissement les a renumérotées 0 à 14 (par **audience** :
 * Elèves 0, Parents 1…), et la constante s'est retrouvée **dernière** : les cinq entrées du
 * lycée, sans catégorie, attendaient le zoom pendant que les tables d'échecs étaient nommées
 * à l'ouverture. Le code n'avait pas bougé ; sa donnée d'entrée avait changé de sens.
 */
describe('defaultLabelPriority — rang intermédiaire, quelle que soit la numérotation', () => {
  /** Les neuf catégories de `planlyautey.olution.info` au 13 septembre 2026. */
  const PRODUCTION_2026_09 = new Map([
    ['eleves', { sort_order: 0 }],
    ['parents', { sort_order: 1 }],
    ['enseignement', { sort_order: 2 }],
    ['administration', { sort_order: 3 }],
    ['infrastructure', { sort_order: 4 }],
    ['personnels', { sort_order: 9 }],
    ['verdure', { sort_order: 10 }],
    ['professeurs', { sort_order: 12 }],
    ['sanitaire', { sort_order: 14 }],
  ]);

  test('sur la numérotation 0–14, le défaut tombe au milieu et non en dernier', () => {
    const fallback = defaultLabelPriority(PRODUCTION_2026_09);
    // À mi-chemin entre la médiane (4, « Infrastructure ») et le rang suivant (9, « Personnels »).
    expect(fallback).toBe(6.5);
    expect(fallback).toBeLessThan(DEFAULT_LABEL_PRIORITY);
    const ranks = [...PRODUCTION_2026_09.values()].map((c) => c.sort_order);
    expect(ranks.filter((r) => r < fallback).length).toBe(5);
    expect(ranks.filter((r) => r > fallback).length).toBe(4);
  });

  test('à rang nominal égal, une catégorie réelle l’emporte sur une absence de catégorie', () => {
    // Une seule catégorie : sa médiane est son propre rang. Le repli doit passer **après**
    // elle, jamais à égalité — une égalité serait tranchée par l'ordre d'itération, donc au
    // hasard du point de vue de l'utilisateur.
    const une = new Map([['x', { sort_order: 1 }]]);
    expect(defaultLabelPriority(une)).toBeGreaterThan(1);
    expect(defaultLabelPriority(une)).toBeLessThan(2);
  });

  test('sur l’ancienne numérotation 10/100, il reste intermédiaire lui aussi', () => {
    expect(
      defaultLabelPriority(
        new Map([
          ['a', { sort_order: 10 }],
          ['b', { sort_order: 100 }],
        ]),
      ),
    ).toBe(55);
  });

  test('aucune catégorie exploitable : repli sur la constante', () => {
    expect(defaultLabelPriority(null)).toBe(DEFAULT_LABEL_PRIORITY);
    expect(defaultLabelPriority(new Map())).toBe(DEFAULT_LABEL_PRIORITY);
    expect(defaultLabelPriority(new Map([['x', { sort_order: 'nord' }]]))).toBe(
      DEFAULT_LABEL_PRIORITY,
    );
  });

  test('une entrée sans catégorie passe devant les sanitaires, pas derrière', () => {
    // Deux repères superposés : un seul survit. Sans le rang relatif, « Sanitaire » (14)
    // battait « Entrée lycée » (50) ; c'est le classement que N2 décrit comme le pire possible.
    const visible = resolveVisibleLabels({
      contentWidthPx: 390,
      contentHeightPx: 463,
      scale: 1,
      zoneSpecs: [],
      markers: [
        { id: 'wc', x_pct: 30, y_pct: 30, label: 'WC', category_ids: ['sanitaire'] },
        { id: 'entree', x_pct: 30, y_pct: 30, label: 'Entrée lycée', category_ids: [] },
      ],
      categoriesById: PRODUCTION_2026_09,
    });
    expect(visible.has(labelKey('marker', 'entree'))).toBe(true);
    expect(visible.has(labelKey('marker', 'wc'))).toBe(false);
  });
});

/**
 * Placement sous rotation — audit du 13 septembre, N1.
 *
 * « Orienter la carte selon la boussole » tourne le calque qui porte les étiquettes. Celles-ci
 * sont désormais contre-tournées en CSS pour rester lisibles : leurs boîtes redeviennent donc
 * alignées sur l'écran alors que leurs ancres, elles, tournent. Le moteur de placement doit
 * recevoir l'angle.
 *
 * La géométrie exacte, pour que ces attentes soient lisibles plutôt que magiques : une boîte
 * d'étiquette est **bien plus large que haute** (« Gauche », 6 caractères à 12 px : ≈ 43,6 px
 * de large pour 18,4 px de haut, marges comprises). Deux noms distants de 32 px se gênent donc
 * quand cet écart est **horizontal** à l'écran, et pas du tout quand il est **vertical**.
 * Tourner la carte d'un quart de tour fait passer d'un cas à l'autre.
 */
describe('resolveVisibleLabels — rotation de la carte', () => {
  const view = { contentWidthPx: 400, contentHeightPx: 400, scale: 1 };

  /** Deux repères côte à côte, à 32 px l'un de l'autre (46 % et 54 % de 400 px). */
  const SIDE_BY_SIDE = [
    { id: 'g', x_pct: 46, y_pct: 50, label: 'Gauche' },
    { id: 'd', x_pct: 54, y_pct: 50, label: 'Droite' },
  ];
  const CENTRE = { xp: 50, yp: 50 };

  test('sans rotation, le comportement d’aujourd’hui est inchangé', () => {
    const sans = resolveVisibleLabels({ ...view, zoneSpecs: [], markers: SIDE_BY_SIDE });
    const zero = resolveVisibleLabels({
      ...view,
      zoneSpecs: [],
      markers: SIDE_BY_SIDE,
      orientationDeg: 0,
    });
    expect([...zero]).toEqual([...sans]);
    // Au nord, l'écart de 32 px est horizontal : plus étroit qu'une boîte, un seul nom tient.
    expect(sans.size).toBe(1);
  });

  test('un quart de tour redresse l’écart : le nom masqué revient', () => {
    const tourne = resolveVisibleLabels({
      ...view,
      zoneSpecs: [],
      markers: SIDE_BY_SIDE,
      orientationDeg: 90,
      orientOriginPct: CENTRE,
    });
    // L'écart est devenu vertical à l'écran (32 px > 18,4 px de hauteur de boîte) : les deux
    // noms tiennent. Sans l'angle, le moteur aurait continué d'en masquer un pour rien.
    expect(tourne.size).toBe(2);
  });

  test('un demi-tour ne change rien : l’écart reste horizontal', () => {
    const demi = resolveVisibleLabels({
      ...view,
      zoneSpecs: [],
      markers: SIDE_BY_SIDE,
      orientationDeg: 180,
      orientOriginPct: CENTRE,
    });
    expect(demi.size).toBe(1);
  });

  test('le verdict ne dépend pas du pivot : une rotation conserve les distances', () => {
    // Seule l'**orientation** du segment qui joint deux ancres décide du recouvrement de
    // boîtes redressées, et elle ne dépend pas du point autour duquel on tourne. Le pivot est
    // la position de l'utilisateur, donc mobile : ce serait un défaut sournois s'il comptait.
    const centre = resolveVisibleLabels({
      ...view,
      zoneSpecs: [],
      markers: SIDE_BY_SIDE,
      orientationDeg: 90,
      orientOriginPct: CENTRE,
    });
    const coin = resolveVisibleLabels({
      ...view,
      zoneSpecs: [],
      markers: SIDE_BY_SIDE,
      orientationDeg: 90,
      orientOriginPct: { xp: 0, yp: 0 },
    });
    expect([...coin].sort()).toEqual([...centre].sort());
  });

  test('l’écart au point du repère reste vertical **à l’écran**, jamais tourné avec la carte', () => {
    // L'étiquette d'un repère est posée 26 px sous son point. Comme elle est contre-tournée,
    // cet écart s'ajoute après la rotation de l'ancre. S'il était tourné avec la carte, un
    // repère unique verrait sa boîte partir de côté — ici, elle reste sous le point.
    const seul = [{ id: 'u', x_pct: 50, y_pct: 50, label: 'Unique' }];
    for (const deg of [0, 45, 90, 180, 270]) {
      const visible = resolveVisibleLabels({
        ...view,
        zoneSpecs: [],
        markers: seul,
        orientationDeg: deg,
        orientOriginPct: CENTRE,
      });
      expect(visible.has(labelKey('marker', 'u'))).toBe(true);
    }
  });

  test('un angle non fini est ignoré plutôt que de fausser tout le placement', () => {
    const casse = resolveVisibleLabels({
      ...view,
      zoneSpecs: [],
      markers: SIDE_BY_SIDE,
      orientationDeg: Number.NaN,
    });
    const sans = resolveVisibleLabels({ ...view, zoneSpecs: [], markers: SIDE_BY_SIDE });
    expect([...casse].sort()).toEqual([...sans].sort());
  });
});
