import { describe, test, expect } from 'vitest';
import {
  buildAnnotatedPlan,
  isEnovPrintPath,
  readPrintMapIds,
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
