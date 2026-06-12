import { describe, test, expect } from 'vitest';
import {
  computeQuickAssignDelta,
  canApplyQuickAssign,
  quickAssignHintText,
} from '../../src/utils/taskQuickAssign.js';

const STUDENTS = [
  { id: 1, first_name: 'Léa', last_name: 'Martin' },
  { id: 2, first_name: 'Tom', last_name: 'Roy' },
  { id: 3, first_name: 'Zoé', last_name: 'Petit' },
];

function task(overrides = {}) {
  return {
    id: 't1',
    status: 'available',
    required_students: 2,
    assignments: [],
    ...overrides,
  };
}

describe('computeQuickAssignDelta', () => {
  test('sélection vide + aucune inscription → aucun delta', () => {
    expect(computeQuickAssignDelta(task(), [], STUDENTS)).toEqual({ toAdd: [], toRemove: [] });
  });

  test('coché mais pas inscrit → toAdd ; inscrit mais décoché → toRemove', () => {
    const t = task({ assignments: [{ student_id: '2', student_first_name: 'Tom', student_last_name: 'Roy' }] });
    const { toAdd, toRemove } = computeQuickAssignDelta(t, ['1'], STUDENTS);
    expect(toAdd.map((s) => s.id)).toEqual([1]);
    expect(toRemove.map((s) => s.id)).toEqual([2]);
  });

  test('inscrit et toujours coché → aucun delta (ids numériques tolérés)', () => {
    const t = task({ assignments: [{ student_id: '2' }] });
    expect(computeQuickAssignDelta(t, [2], STUDENTS)).toEqual({ toAdd: [], toRemove: [] });
  });

  test('match par (prénom, nom) insensible à la casse sans student_id', () => {
    const t = task({ assignments: [{ student_first_name: 'léa', student_last_name: 'MARTIN' }] });
    const { toRemove } = computeQuickAssignDelta(t, [], STUDENTS);
    expect(toRemove.map((s) => s.id)).toEqual([1]);
  });

  test('liste n3beurs absente → delta vide', () => {
    expect(computeQuickAssignDelta(task(), ['1'], null)).toEqual({ toAdd: [], toRemove: [] });
  });
});

describe('canApplyQuickAssign', () => {
  test('faux sans tâche ou sans delta', () => {
    expect(canApplyQuickAssign(null, ['1'], STUDENTS)).toBe(false);
    expect(canApplyQuickAssign(task(), [], STUDENTS)).toBe(false);
  });

  test('vrai pour un ajout simple avec des places dispo', () => {
    expect(canApplyQuickAssign(task(), ['1'], STUDENTS)).toBe(true);
  });

  test('faux si statut effectif fermé (on_hold / projet terminé / projet validé)', () => {
    expect(canApplyQuickAssign(task({ status: 'on_hold' }), ['1'], STUDENTS)).toBe(false);
    expect(canApplyQuickAssign(task({ project_status: 'completed' }), ['1'], STUDENTS)).toBe(false);
    expect(canApplyQuickAssign(task({ project_status: 'validated' }), ['1'], STUDENTS)).toBe(false);
  });

  test('faux pour un retrait quand la tâche est done ou validated', () => {
    const t = task({ status: 'done', assignments: [{ student_id: '2' }] });
    expect(canApplyQuickAssign(t, [], STUDENTS)).toBe(false);
  });

  test('faux pour un ajout sur proposed / done / validated', () => {
    expect(canApplyQuickAssign(task({ status: 'proposed' }), ['1'], STUDENTS)).toBe(false);
    expect(canApplyQuickAssign(task({ status: 'done' }), ['1'], STUDENTS)).toBe(false);
    expect(canApplyQuickAssign(task({ status: 'validated' }), ['1'], STUDENTS)).toBe(false);
  });

  test('faux si plus d’ajouts que de places (en comptant les retraits)', () => {
    const t = task({ required_students: 1, assignments: [{ student_id: '2' }] });
    // 0 place dispo, on ajoute 2 et on ne retire personne
    expect(canApplyQuickAssign(t, ['1', '2', '3'], STUDENTS)).toBe(false);
    // 1 retrait libère 1 place pour 1 ajout
    expect(canApplyQuickAssign(t, ['1'], STUDENTS)).toBe(true);
  });
});

describe('quickAssignHintText', () => {
  test('messages des statuts bloquants', () => {
    expect(quickAssignHintText(null, [], STUDENTS)).toBe("Cette tâche n’est pas dispo ici");
    expect(quickAssignHintText(task({ status: 'on_hold' }), ['1'], STUDENTS)).toBe("Patience : tâche ou projet en pause");
    expect(quickAssignHintText(task({ project_status: 'completed' }), ['1'], STUDENTS)).toBe("Projet terminé : inscriptions fermées");
    expect(quickAssignHintText(task({ project_status: 'validated' }), ['1'], STUDENTS)).toBe("Projet validé : inscriptions fermées");
  });

  test('invite à cocher quand aucun delta', () => {
    expect(quickAssignHintText(task(), [], STUDENTS))
      .toBe("Coche ou décoche des n3beurs pour ajuster l’équipe sur la mission");
  });

  test('retrait bloqué sur mission bouclée', () => {
    const t = task({ status: 'done', assignments: [{ student_id: '2' }] });
    expect(quickAssignHintText(t, [], STUDENTS)).toBe("Mission déjà bouclée : on ne retire plus les inscrits");
  });

  test('ajout bloqué : proposed, done et manque de places', () => {
    expect(quickAssignHintText(task({ status: 'proposed' }), ['1'], STUDENTS))
      .toBe("Idée encore en discussion : inscriptions pas encore ouvertes");
    expect(quickAssignHintText(task({ status: 'done' }), ['1'], STUDENTS))
      .toBe("C’est déjà plié pour celle-ci");
    const t = task({ required_students: 1, assignments: [{ student_id: '2' }] });
    expect(quickAssignHintText(t, ['1', '2', '3'], STUDENTS)).toBe('Pas assez de places (max. 0 après retrait)');
  });

  test('résumé du delta (retraits puis inscriptions, pluriels)', () => {
    const t = task({ required_students: 3, assignments: [{ student_id: '3' }] });
    expect(quickAssignHintText(t, ['1', '2'], STUDENTS)).toBe('Retirer 1 n3beur · Inscrire 2 n3beurs');
  });
});
