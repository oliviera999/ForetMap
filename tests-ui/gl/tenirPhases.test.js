import { describe, test, expect } from 'vitest';

import {
  PHASES_DU_TOUR,
  PHASE_ELEVE,
  PHASE_CONSOLE,
  PHASE_AUCUN_TOUR,
  phaseEleve,
  phaseConsole,
  titreDuTour,
} from '../../src/gl/constants/tenirPhases.js';
import { findForbiddenString } from '../../src/shared/glGardeFousCore.js';

describe('phases du tour « Tenir à deux », en mots d’élève', () => {
  test('les quatre phases du moteur ont chacune leur libellé', () => {
    expect(PHASES_DU_TOUR).toEqual(['ouverture', 'jeu', 'souffle', 'clos']);
    expect(PHASE_ELEVE).toEqual({
      ouverture: 'Le tour s’ouvre',
      jeu: 'À vous de jouer',
      souffle: 'Le voile avance',
      clos: 'Tour terminé',
    });
  });

  test('un élève ne lit jamais la clé technique', () => {
    for (const phase of PHASES_DU_TOUR) {
      expect(phaseEleve(phase)).not.toBe(phase);
      expect(phaseEleve(phase).toLowerCase()).not.toMatch(/\b(jeu|souffle|clos|ouverture)\b/);
    }
    expect(phaseEleve('inconnue')).toBe('');
    expect(phaseEleve(null)).toBe('');
  });

  test('la console dit les mêmes mots, le terme du moteur en infobulle', () => {
    for (const phase of PHASES_DU_TOUR) {
      expect(phaseConsole(phase)).toEqual({
        label: PHASE_ELEVE[phase],
        technique: `Phase « ${phase} »`,
      });
      expect(PHASE_CONSOLE[phase]).toBe(phaseConsole(phase));
    }
    expect(phaseConsole('inconnue')).toBeNull();
  });

  test('titre du tour : « Tour n — phase », sans clé brute', () => {
    expect(titreDuTour({ number: 3, phase: 'jeu' })).toBe('Tour 3 — À vous de jouer');
    expect(titreDuTour({ number: 1, phase: 'clos' })).toBe('Tour 1 — Tour terminé');
    expect(titreDuTour({ number: 2, phase: 'mystere' })).toBe('Tour 2');
    expect(titreDuTour(null)).toBe('');
    expect(titreDuTour({ number: 0, phase: 'jeu' })).toBe('');
  });

  test('garde-fous : aucun mot interdit, le voile avance sans être personnifié', () => {
    const textes = [...Object.values(PHASE_ELEVE), PHASE_AUCUN_TOUR];
    for (const texte of textes) expect(findForbiddenString(texte)).toBeNull();
    expect(PHASE_ELEVE.souffle).toBe('Le voile avance');
    expect(PHASE_AUCUN_TOUR).toBe('Le prof ouvre bientôt le tour.');
  });
});
