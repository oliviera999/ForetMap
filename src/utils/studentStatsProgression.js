/**
 * Logique pure de la vue « Mes statistiques » (StudentStats) :
 * construction de l'échelle de paliers affichée puis dérivation complète
 * de l'état de progression (palier tâches, palier profil, écarts, barre).
 */
import {
  sortProgressionSteps,
  resolveTaskTierSlug,
  findProgressionStep,
  getNextProgressionStep,
  getProgressionStepIndex,
  computeProgressPercent,
} from './studentProgressionLadder.js';

const DEFAULT_ICON_BY_SLUG = {
  eleve_novice: '🪨',
  eleve_avance: '🌿',
  eleve_chevronne: '🏆',
};

const FALLBACK_STEPS = [
  { roleSlug: 'eleve_novice', min: 0, label: 'n3beur novice' },
  { roleSlug: 'eleve_avance', min: 5, label: 'n3beur avancé' },
  { roleSlug: 'eleve_chevronne', min: 10, label: 'n3beur chevronné' },
];

/**
 * Échelle de paliers prête à l'affichage : tri serveur, couleur par index
 * et icône (emoji du palier, sinon défaut par slug, sinon 🌿).
 * Repli sur l'échelle n3beur historique si `steps` est vide/absent.
 */
export function buildStudentRankSteps(steps) {
  const rawSteps = Array.isArray(steps) && steps.length > 0 ? steps : FALLBACK_STEPS;
  return sortProgressionSteps(rawSteps).map((step, i) => ({
    ...step,
    color: i === 0 ? '#94a3b8' : i === 1 ? '#52b788' : '#1a4731',
    icon: String(step.emoji || '').trim()
      || DEFAULT_ICON_BY_SLUG[String(step.roleSlug || '').toLowerCase()]
      || '🌿',
  }));
}

/**
 * Dérive tout l'état de progression affiché par StudentStats à partir du
 * bloc `progression` renvoyé par /api/stats/me/:id et du nombre de tâches
 * validées. Transposition pure du composant, comportement inchangé.
 */
export function deriveStudentProgressionView(progression, doneCount) {
  const ranks = buildStudentRankSteps(progression?.steps);
  const autoProgressionEnabled = progression?.autoProgressionEnabled !== false;
  const taskTierSlug = resolveTaskTierSlug(doneCount, ranks);
  const taskTier = findProgressionStep(ranks, taskTierSlug) || ranks[0];
  const taskTierIndex = getProgressionStepIndex(ranks, taskTierSlug);
  const actualSlug = String(progression?.roleSlug || '').toLowerCase();
  const actualTier =
    findProgressionStep(ranks, actualSlug)
    || (progression?.roleDisplayName
      ? {
        roleSlug: actualSlug,
        min: taskTier.min,
        label: progression.roleDisplayName,
        icon: String(progression?.roleEmoji || '').trim() || taskTier.icon,
        color: taskTier.color,
      }
      : taskTier);
  const actualIndex = getProgressionStepIndex(ranks, actualSlug);
  const nextRank = getNextProgressionStep(ranks, taskTierSlug);
  const progressPct = computeProgressPercent(doneCount, taskTier, nextRank);
  const profileAheadOfTasks =
    autoProgressionEnabled
    && actualIndex >= 0
    && taskTierIndex >= 0
    && actualIndex > taskTierIndex;
  const profileBehindOfTasks =
    autoProgressionEnabled
    && actualIndex >= 0
    && taskTierIndex >= 0
    && actualIndex < taskTierIndex;
  const showTaskObjective = profileAheadOfTasks || profileBehindOfTasks;
  const tasksRemaining = nextRank ? Math.max(0, nextRank.min - doneCount) : 0;

  return {
    ranks,
    autoProgressionEnabled,
    taskTier,
    taskTierIndex,
    actualTier,
    nextRank,
    progressPct,
    profileAheadOfTasks,
    profileBehindOfTasks,
    showTaskObjective,
    tasksRemaining,
  };
}
