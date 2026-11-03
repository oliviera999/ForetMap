import { describe, test, expect } from 'vitest';
import {
  buildAnnotatedPlan,
  isEnovPrintPath,
  pickOtherLabels,
  placeBaseName,
  readPrintMapIds,
  spreadPins,
  summarizeEnovText,
  UNTYPED_SPACE_LABEL,
} from '../../src/enov/print/enovPrintModel.js';
import { ENOV_SPACE_TYPES } from '../../src/shared/enov/enovSpaceTypes.js';

/**
 * Plan annoté imprimable (`/impression`) : numérotation dans l'ordre de la légende, rangement
 * par type d'espace, texte court tiré de la description e-nov.
 */

const zone = (id, name, type, extra = {}) => ({
  id,
  kind: 'zone',
  name,
  points: '[{"xp":10,"yp":10},{"xp":30,"yp":10},{"xp":30,"yp":30},{"xp":10,"yp":30}]',
  map_highlight: true,
  enov_space_type: type,
  enov_description: `${name} : un espace réinventé par la communauté.`,
  ...extra,
});

describe('isEnovPrintPath / readPrintMapIds', () => {
  test('reconnaît /impression, avec ou sans préfixe et barre finale', () => {
    expect(isEnovPrintPath('/impression')).toBe(true);
    expect(isEnovPrintPath('/impression/')).toBe(true);
    expect(isEnovPrintPath('/foretmap/impression')).toBe(true);
    expect(isEnovPrintPath('/')).toBe(false);
    expect(isEnovPrintPath('/impressions')).toBe(false);
  });

  test('lit les cartes demandées, dans l’ordre et sans doublon', () => {
    expect(readPrintMapIds('?map_id=lyautey,beaulieu')).toEqual(['lyautey', 'beaulieu']);
    expect(readPrintMapIds('?map_id=a&map_id=b,a')).toEqual(['a', 'b']);
    expect(readPrintMapIds('')).toEqual([]);
  });
});

describe('summarizeEnovText', () => {
  test('garde un texte court tel quel, sans les liens', () => {
    expect(summarizeEnovText('Salle aérée. Voir https://n3.example.org')).toBe('Salle aérée. Voir');
  });

  test('ne prend que le premier paragraphe', () => {
    expect(summarizeEnovText('Premier.\n\nSecond paragraphe.')).toBe('Premier.');
  });

  test('coupe à la dernière fin de phrase qui tient', () => {
    const text = `${'a'.repeat(60)}. ${'b'.repeat(80)}. ${'c'.repeat(80)}.`;
    expect(summarizeEnovText(text, 150)).toBe(`${'a'.repeat(60)}. ${'b'.repeat(80)}.`);
  });

  test('ne coupe ni un nombre ni une unité en fin de ligne', () => {
    expect(summarizeEnovText('Un bâtiment de 3 000 m² et 20 kW.')).toBe(
      'Un bâtiment de 3\u202f000\u00a0m² et 20\u00a0kW.',
    );
  });

  test('à défaut, coupe au dernier mot avec une ellipse', () => {
    const text = 'mot '.repeat(80).trim();
    const out = summarizeEnovText(text, 50);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out).not.toMatch(/ …$/);
  });
});

describe('buildAnnotatedPlan', () => {
  test('numérote par type d’espace puis par nom, non renseignés en dernier', () => {
    const places = [
      zone('z1', 'Restaurant', 'restauration'),
      zone('z2', 'Salle aérée n³', 'exterieur'),
      zone('z3', 'Fablab', 'pedagogique'),
      zone('z4', 'Forêt comestible', 'exterieur'),
      zone('z5', 'Lieu sans type', ''),
      { id: 'z6', kind: 'zone', name: 'Hall', points: '[]' },
    ];
    const plan = buildAnnotatedPlan(places);
    expect(plan.entries.map((e) => [e.number, e.name])).toEqual([
      [1, 'Forêt comestible'],
      [2, 'Salle aérée n³'],
      [3, 'Fablab'],
      [4, 'Restaurant'],
      [5, 'Lieu sans type'],
    ]);
    expect(plan.groups.map((g) => g.label)).toEqual([
      'Espace extérieur',
      'Espace pédagogique',
      'Restauration',
      UNTYPED_SPACE_LABEL,
    ]);
    expect(plan.typeCount).toBe(3);
    expect(plan.others.map((p) => p.id)).toEqual(['z6']);
  });

  test('ancre une zone au centre de ses sommets, un repère à son point', () => {
    const plan = buildAnnotatedPlan([
      zone('z1', 'Zone', 'sportif'),
      {
        id: 'm1',
        kind: 'marker',
        name: 'Repère',
        x_pct: 42,
        y_pct: 64,
        map_highlight: true,
        enov_space_type: 'sportif',
      },
    ]);
    const byName = new Map(plan.entries.map((e) => [e.name, e]));
    expect(byName.get('Zone').anchor).toEqual({ xp: 20, yp: 20 });
    expect(byName.get('Repère').anchor).toEqual({ xp: 42, yp: 64 });
  });

  test('un lieu sans géométrie reste en légende, sans ancre', () => {
    const plan = buildAnnotatedPlan([zone('z1', 'Sans tracé', 'autre', { points: '[]' })]);
    expect(plan.entries[0].anchor).toBeNull();
  });

  test('l’ordre des groupes suit ENOV_SPACE_TYPES', () => {
    const places = [...ENOV_SPACE_TYPES]
      .reverse()
      .map((type) => zone(`z-${type.id}`, `Lieu ${type.id}`, type.id));
    const plan = buildAnnotatedPlan(places);
    expect(plan.groups.map((g) => g.typeId)).toEqual(ENOV_SPACE_TYPES.map((t) => t.id));
  });
});

const marker = (id, name, type, x, y, extra = {}) => ({
  id,
  kind: 'marker',
  name,
  x_pct: x,
  y_pct: y,
  map_highlight: true,
  map_highlight_tone: 'secondary',
  enov_space_type: type,
  enov_description: 'Une pergola fleurie au-dessus des bacs de tri.',
  ...extra,
});

describe('buildAnnotatedPlan — deux niveaux (migration 326)', () => {
  test('espaces retenus numérotés d’abord, autres lieux à la suite, types comptés au premier niveau', () => {
    const plan = buildAnnotatedPlan([
      marker('m1', 'Ecofab', 'pedagogique', 40, 40, { enov_description: 'Atelier de récup.' }),
      zone('z1', 'Fablab', 'pedagogique'),
      zone('z2', 'Forêt comestible', 'exterieur'),
      marker('m2', 'Cafétéria', 'restauration', 50, 50, { enov_description: 'Un projet.' }),
    ]);
    expect(plan.entries.map((e) => [e.number, e.name, e.tier])).toEqual([
      [1, 'Forêt comestible', 'primary'],
      [2, 'Fablab', 'primary'],
    ]);
    expect(plan.secondaryEntries.map((e) => [e.number, e.name, e.tier])).toEqual([
      [3, 'Ecofab', 'secondary'],
      [4, 'Cafétéria', 'secondary'],
    ]);
    expect(plan.typeCount).toBe(2);
    expect(plan.primaryCount).toBe(2);
    expect(plan.secondaryCount).toBe(2);
    // Second niveau : noms seuls par défaut.
    expect(plan.secondaryEntries[0].summary).toBe('');
    expect(
      buildAnnotatedPlan([marker('m1', 'Ecofab', 'pedagogique', 1, 1)], {
        secondarySummaryLength: 60,
      }).secondaryEntries[0].summary,
    ).not.toBe('');
  });

  test('une série (même nom commun, même texte) partage une entrée et un numéro', () => {
    const plan = buildAnnotatedPlan([
      marker('t1', 'Point de tri végétalisé — cour du collège', 'vie-scolaire', 10, 10),
      marker('t2', 'Point de tri végétalisé — cour du lycée, est', 'vie-scolaire', 60, 60),
      marker('t3', 'Point de tri végétalisé — salle Delacroix', 'vie-scolaire', 80, 20),
      marker('p1', 'Poisson glouton', 'vie-scolaire', 30, 30, { enov_description: 'Bouteilles.' }),
    ]);
    expect(plan.secondaryEntries).toHaveLength(2);
    const tri = plan.secondaryEntries.find((e) => e.name === 'Point de tri végétalisé');
    expect(tri.count).toBe(3);
    expect(tri.anchors).toHaveLength(3);
    expect(tri.places.map((p) => p.id)).toEqual(['t1', 't2', 't3']);
  });

  test('même nom commun mais textes différents : entrées distinctes', () => {
    const plan = buildAnnotatedPlan([
      marker('a', 'Salle — nord', 'pedagogique', 10, 10, { enov_description: 'A.' }),
      marker('b', 'Salle — sud', 'pedagogique', 20, 20, { enov_description: 'B.' }),
    ]);
    expect(plan.secondaryEntries.map((e) => e.name)).toEqual(['Salle — nord', 'Salle — sud']);
  });

  test('placeBaseName garde ce qui précède le tiret de précision', () => {
    expect(placeBaseName('Point de nourrissage des chats — bâtiment I')).toBe(
      'Point de nourrissage des chats',
    );
    expect(placeBaseName('n³ - salle')).toBe('n³ - salle');
  });
});

describe('spreadPins', () => {
  test('écarte deux numéros superposés, sans toucher aux numéros isolés', () => {
    const out = spreadPins(
      [
        { xp: 20, yp: 20 },
        { xp: 21, yp: 20.5 },
        { xp: 70, yp: 70 },
      ],
      { minX: 4, minY: 4 },
    );
    const gap = Math.hypot((out[1].xp - out[0].xp) / 4, (out[1].yp - out[0].yp) / 4);
    expect(gap).toBeGreaterThanOrEqual(0.99);
    expect(out[0].moved || out[1].moved).toBe(true);
    expect(out[2]).toEqual({ xp: 70, yp: 70, moved: false });
  });

  test('deux numéros exactement au même point finissent côte à côte, dans la carte', () => {
    const out = spreadPins([
      { xp: 99, yp: 50 },
      { xp: 99, yp: 50 },
    ]);
    expect(out[0].xp).not.toBe(out[1].xp);
    for (const pin of out) {
      expect(pin.xp).toBeLessThanOrEqual(99);
      expect(pin.xp).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('pickOtherLabels', () => {
  const other = (id, name, x, y, size) => ({
    id,
    kind: 'zone',
    name,
    points: JSON.stringify([
      { xp: x - size, yp: y - size },
      { xp: x + size, yp: y - size },
      { xp: x + size, yp: y + size },
      { xp: x - size, yp: y + size },
    ]),
  });

  test('pas deux noms l’un sur l’autre : la plus grande zone garde le sien', () => {
    const labels = pickOtherLabels([
      other('petit', 'Cour du collège', 50, 50, 2),
      other('grand', 'Permanence aérée', 51, 50.5, 8),
      other('loin', 'Bâtiment L', 20, 80, 3),
    ]);
    expect(labels.map((l) => l.place.id)).toEqual(['grand', 'loin']);
  });

  test('pas de nom sous un numéro', () => {
    const labels = pickOtherLabels([other('z', 'Parking', 30, 30, 5)], [{ xp: 31, yp: 30 }]);
    expect(labels).toEqual([]);
  });
});
