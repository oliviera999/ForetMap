'use strict';

/**
 * Progression affichée dans les listes de stats (lecture seule).
 * La synchronisation persistante des paliers reste sur les chemins d'écriture ou en tâche détachée
 * (audit 26/11, lot C — GET /api/stats/all).
 */

const { resolveEffectiveRole } = require('../effectiveRole');
const { isVisitorLikeSlug } = require('../shared/visitorRoles');
const {
  resolveStudentRoleSlugFromValidatedCount,
  syncStudentPrimaryRoleFromProgress,
} = require('../rbac');

function stepMinForSlug(config, slug) {
  const step = (config.steps || []).find((s) => String(s.roleSlug) === String(slug));
  return step?.min ?? 0;
}

/**
 * Bloc `progression` renvoyé par `GET /api/stats/all` sans écriture RBAC.
 * @param {Awaited<ReturnType<typeof resolveEffectiveRole>>} resolved
 * @param {{ steps: object[], autoProgressionEnabled?: boolean }} progressionConfig
 */
function progressionBlockFromResolved(resolved, progressionConfig) {
  const autoProgressionEnabled = progressionConfig.autoProgressionEnabled !== false;
  if (!resolved?.decision?.role) {
    return {
      roleSlug: null,
      roleDisplayName: null,
      roleEmoji: null,
      autoProgressionEnabled,
    };
  }
  const role = resolved.decision.role;
  const slug = role.slug;
  const step = (progressionConfig.steps || []).find((s) => String(s.roleSlug) === String(slug));
  return {
    roleSlug: slug,
    roleDisplayName: role.displayName ?? null,
    roleEmoji: step?.emoji ? String(step.emoji).trim().slice(0, 16) : null,
    autoProgressionEnabled,
  };
}

/**
 * Indique si une synchro de palier pourrait modifier la base (montée ou rattrapage).
 * Heuristique alignée sur `syncStudentPrimaryRoleFromProgress` (sans rétrogradation automatique).
 * @param {Awaited<ReturnType<typeof resolveEffectiveRole>>} resolved
 * @param {number} done
 * @param {object} progressionConfig
 */
function shouldScheduleDetachedProgressionSync(resolved, done, progressionConfig) {
  if (!progressionConfig.autoProgressionEnabled) return false;
  if (!resolved || resolved.userType !== 'student' || !resolved.decision) return false;
  if (resolved.decision.source === 'forced') return false;
  const currentSlug = resolved.decision.role.slug;
  if (!progressionConfig.progressionSlugs?.has(currentSlug)) return false;

  const targetSlug = resolveStudentRoleSlugFromValidatedCount(done, progressionConfig.steps);
  const assignedSlug = resolved.assigned?.slug ?? '';
  const assignedMovable =
    !resolved.assigned ||
    progressionConfig.progressionSlugs.has(assignedSlug) ||
    isVisitorLikeSlug(assignedSlug);
  if (!assignedMovable) return false;

  const targetMin = stepMinForSlug(progressionConfig, targetSlug);
  const assignedMin = assignedSlug ? stepMinForSlug(progressionConfig, assignedSlug) : -1;
  const sameSlug = assignedSlug === targetSlug;
  const alreadyThere = sameSlug || currentSlug === targetSlug;
  const catchUp = assignedSlug.startsWith('eleve_') && done < assignedMin;
  const up = !alreadyThere && targetMin > assignedMin;
  if (alreadyThere && !catchUp) return false;
  return up || catchUp;
}

/**
 * Lit le profil effectif + progression pour une ligne du tableau de bord stats.
 * @param {string} studentId
 * @param {number} done
 * @param {object} progressionConfig
 */
async function readProgressionForStatsStudent(studentId, done, progressionConfig) {
  const resolved = await resolveEffectiveRole(studentId);
  const progression = progressionBlockFromResolved(resolved, progressionConfig);
  const scheduleSync = shouldScheduleDetachedProgressionSync(resolved, done, progressionConfig);
  return { progression, scheduleSync };
}

/**
 * @template {{ id: string, done: number }} T
 * @param {T[]} candidates
 * @param {object} progressionConfig
 * @param {(items: T[], limit: number, mapper: (item: T) => Promise<unknown>) => Promise<unknown[]>} mapWithConcurrency
 * @param {number} concurrency
 */
async function runDetachedProgressionSyncForStudents(
  candidates,
  progressionConfig,
  mapWithConcurrency,
  concurrency,
) {
  if (!candidates.length) return;
  await mapWithConcurrency(candidates, concurrency, ({ id, done }) =>
    syncStudentPrimaryRoleFromProgress(id, done, progressionConfig),
  );
}

module.exports = {
  progressionBlockFromResolved,
  shouldScheduleDetachedProgressionSync,
  readProgressionForStatsStudent,
  runDetachedProgressionSyncForStudents,
};
