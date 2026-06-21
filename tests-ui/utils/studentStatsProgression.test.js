import { describe, test, expect } from 'vitest';
import {
  buildStudentRankSteps,
  deriveStudentProgressionView,
} from '../../src/utils/studentStatsProgression.js';

const SERVER_STEPS = [
  { roleSlug: 'eleve_novice', min: 0, label: 'n3beur novice' },
  { roleSlug: 'eleve_avance', min: 5, label: 'n3beur avancé' },
  { roleSlug: 'eleve_chevronne', min: 10, label: 'n3beur chevronné' },
];

describe('buildStudentRankSteps', () => {
  test('repli sur l’échelle n3beur historique si steps vide ou absent', () => {
    for (const input of [undefined, null, []]) {
      const ranks = buildStudentRankSteps(input);
      expect(ranks.map((r) => r.roleSlug)).toEqual([
        'eleve_novice',
        'eleve_avance',
        'eleve_chevronne',
      ]);
      expect(ranks.map((r) => r.min)).toEqual([0, 5, 10]);
    }
  });

  test('couleurs par index et icônes par défaut par slug', () => {
    const ranks = buildStudentRankSteps(SERVER_STEPS);
    expect(ranks.map((r) => r.color)).toEqual(['#94a3b8', '#52b788', '#1a4731']);
    expect(ranks.map((r) => r.icon)).toEqual(['🪨', '🌿', '🏆']);
  });

  test('emoji du palier prioritaire, sinon 🌿 pour un slug inconnu', () => {
    const ranks = buildStudentRankSteps([
      { roleSlug: 'eleve_novice', min: 0, label: 'Novice', emoji: ' 🌰 ' },
      { roleSlug: 'palier_custom', min: 3, label: 'Custom' },
    ]);
    expect(ranks[0].icon).toBe('🌰');
    expect(ranks[1].icon).toBe('🌿');
  });

  test('trie les paliers par min croissant', () => {
    const ranks = buildStudentRankSteps([
      { roleSlug: 'b', min: 8, label: 'B' },
      { roleSlug: 'a', min: 2, label: 'A' },
    ]);
    expect(ranks.map((r) => r.roleSlug)).toEqual(['a', 'b']);
  });
});

describe('deriveStudentProgressionView', () => {
  test('palier tâches, palier suivant et tâches restantes', () => {
    const view = deriveStudentProgressionView({ steps: SERVER_STEPS, roleSlug: 'eleve_avance' }, 6);
    expect(view.taskTier.roleSlug).toBe('eleve_avance');
    expect(view.taskTierIndex).toBe(1);
    expect(view.nextRank.roleSlug).toBe('eleve_chevronne');
    expect(view.tasksRemaining).toBe(4);
    expect(view.progressPct).toBe(20);
    expect(view.showTaskObjective).toBe(false);
  });

  test('palier maximum : nextRank null, barre à 100 %, 0 restante', () => {
    const view = deriveStudentProgressionView(
      { steps: SERVER_STEPS, roleSlug: 'eleve_chevronne' },
      12,
    );
    expect(view.nextRank).toBeNull();
    expect(view.progressPct).toBe(100);
    expect(view.tasksRemaining).toBe(0);
  });

  test('profil attribué plus avancé que les tâches → profileAheadOfTasks', () => {
    const view = deriveStudentProgressionView(
      { steps: SERVER_STEPS, roleSlug: 'eleve_chevronne' },
      2,
    );
    expect(view.profileAheadOfTasks).toBe(true);
    expect(view.profileBehindOfTasks).toBe(false);
    expect(view.showTaskObjective).toBe(true);
    expect(view.actualTier.roleSlug).toBe('eleve_chevronne');
  });

  test('profil en retard sur les tâches → profileBehindOfTasks', () => {
    const view = deriveStudentProgressionView({ steps: SERVER_STEPS, roleSlug: 'eleve_novice' }, 7);
    expect(view.profileBehindOfTasks).toBe(true);
    expect(view.profileAheadOfTasks).toBe(false);
    expect(view.showTaskObjective).toBe(true);
  });

  test('montée auto coupée : aucun écart signalé même si profil ≠ palier tâches', () => {
    const view = deriveStudentProgressionView(
      { steps: SERVER_STEPS, roleSlug: 'eleve_chevronne', autoProgressionEnabled: false },
      2,
    );
    expect(view.autoProgressionEnabled).toBe(false);
    expect(view.profileAheadOfTasks).toBe(false);
    expect(view.profileBehindOfTasks).toBe(false);
    expect(view.showTaskObjective).toBe(false);
  });

  test('rôle hors échelle avec roleDisplayName → palier synthétique sur la base du palier tâches', () => {
    const view = deriveStudentProgressionView(
      {
        steps: SERVER_STEPS,
        roleSlug: 'gardien_forets',
        roleDisplayName: 'Gardien des forêts',
        roleEmoji: '🦉',
      },
      6,
    );
    expect(view.actualTier).toMatchObject({
      roleSlug: 'gardien_forets',
      label: 'Gardien des forêts',
      icon: '🦉',
      min: view.taskTier.min,
      color: view.taskTier.color,
    });
    // Hors échelle : pas d'index → aucun écart signalé.
    expect(view.profileAheadOfTasks).toBe(false);
    expect(view.profileBehindOfTasks).toBe(false);
  });

  test('rôle hors échelle sans displayName → repli sur le palier tâches', () => {
    const view = deriveStudentProgressionView({ steps: SERVER_STEPS, roleSlug: 'inconnu' }, 1);
    expect(view.actualTier.roleSlug).toBe('eleve_novice');
  });

  test('progression absente (invité/anciens payloads) → échelle de repli, novice', () => {
    const view = deriveStudentProgressionView(undefined, 0);
    expect(view.ranks).toHaveLength(3);
    expect(view.taskTier.roleSlug).toBe('eleve_novice');
    expect(view.autoProgressionEnabled).toBe(true);
    expect(view.actualTier.roleSlug).toBe('eleve_novice');
  });
});
