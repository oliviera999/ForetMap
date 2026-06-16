/** Échelle de progression n3beur (alignée sur lib/rbac.js). */

function toPositiveInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function stepDisplayOrder(step) {
  return toPositiveInt(step?.displayOrder ?? step?.display_order, 999);
}

function stepLabel(step) {
  return String(step?.label || step?.roleSlug || '');
}

/** Tri stable : min → displayOrder → label (identique au serveur). */
export function sortProgressionSteps(steps) {
  return [...(Array.isArray(steps) ? steps : [])].sort(
    (a, b) =>
      toPositiveInt(a?.min, 0) - toPositiveInt(b?.min, 0) ||
      stepDisplayOrder(a) - stepDisplayOrder(b) ||
      stepLabel(a).localeCompare(stepLabel(b)),
  );
}

/** Slug du palier atteint selon le nombre de tâches validées. */
export function resolveTaskTierSlug(validatedCount, steps) {
  const done = toPositiveInt(validatedCount, 0);
  const ordered = sortProgressionSteps(steps);
  if (ordered.length === 0) return 'eleve_novice';
  let current = ordered[0].roleSlug;
  for (const step of ordered) {
    if (done >= toPositiveInt(step.min, 0)) current = step.roleSlug;
  }
  return current;
}

export function findProgressionStep(steps, roleSlug) {
  const slug = String(roleSlug || '')
    .trim()
    .toLowerCase();
  if (!slug) return null;
  return (
    sortProgressionSteps(steps).find(
      (s) =>
        String(s.roleSlug || '')
          .trim()
          .toLowerCase() === slug,
    ) || null
  );
}

/** Palier suivant dans l'échelle triée, ou null si maximum. */
export function getNextProgressionStep(steps, currentSlug) {
  const ordered = sortProgressionSteps(steps);
  const slug = String(currentSlug || '')
    .trim()
    .toLowerCase();
  const idx = ordered.findIndex(
    (s) =>
      String(s.roleSlug || '')
        .trim()
        .toLowerCase() === slug,
  );
  if (idx < 0 || idx >= ordered.length - 1) return null;
  return ordered[idx + 1];
}

/** Index du palier dans l'échelle triée (-1 si absent). */
export function getProgressionStepIndex(steps, roleSlug) {
  const slug = String(roleSlug || '')
    .trim()
    .toLowerCase();
  return sortProgressionSteps(steps).findIndex(
    (s) =>
      String(s.roleSlug || '')
        .trim()
        .toLowerCase() === slug,
  );
}

/** Pourcentage de remplissage entre deux paliers (100 si pas de palier suivant). */
export function computeProgressPercent(done, fromStep, toStep) {
  if (!toStep) return 100;
  const fromMin = toPositiveInt(fromStep?.min, 0);
  const toMin = toPositiveInt(toStep?.min, 0);
  const span = toMin - fromMin;
  if (span <= 0) return 100;
  const pct = ((toPositiveInt(done, 0) - fromMin) / span) * 100;
  return Math.min(100, Math.max(0, pct));
}
