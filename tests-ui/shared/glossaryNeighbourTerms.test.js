import { describe, test, expect } from 'vitest';
import { mergeGlossaryNeighbourTerms } from '../../src/shared/glossary/glossaryCardCore.js';

describe('mergeGlossaryNeighbourTerms', () => {
  test('relation enregistrée dans les deux sens : le voisin n’apparaît qu’une fois', () => {
    const out = mergeGlossaryNeighbourTerms(
      [{ glossary_code: 'FM0002', terme: 'pollen' }],
      [{ glossary_code: 'FM0002', terme: 'pollen' }],
    );
    expect(out).toHaveLength(1);
    expect(out[0].glossary_code).toBe('FM0002');
  });

  test('les deux sens sont réunis et triés par libellé', () => {
    const out = mergeGlossaryNeighbourTerms(
      [{ glossary_code: 'FM0003', terme: 'pollinisateur' }],
      [{ glossary_code: 'FM0002', terme: 'fleur' }],
    );
    expect(out.map((t) => t.terme)).toEqual(['fleur', 'pollinisateur']);
  });

  test('le tri ignore la casse et les accents (locale fr)', () => {
    const out = mergeGlossaryNeighbourTerms(
      [
        { glossary_code: 'A', terme: 'Étamine' },
        { glossary_code: 'B', terme: 'fruits' },
      ],
      [],
    );
    expect(out.map((t) => t.terme)).toEqual(['Étamine', 'fruits']);
  });

  test('la fiche affichée n’est jamais son propre voisin', () => {
    const out = mergeGlossaryNeighbourTerms(
      [{ glossary_code: 'FM0001', terme: 'pollinisation' }],
      [{ glossary_code: 'FM0002', terme: 'pollen' }],
      'FM0001',
    );
    expect(out.map((t) => t.glossary_code)).toEqual(['FM0002']);
  });

  test('entrées sans code ignorées ; absence de liste tolérée', () => {
    expect(mergeGlossaryNeighbourTerms(null, undefined)).toEqual([]);
    expect(
      mergeGlossaryNeighbourTerms([{ terme: 'sans code' }], [{ glossary_code: '  ' }]),
    ).toEqual([]);
  });
});
