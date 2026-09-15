/**
 * Construction / validation des payloads profils RBAC (sans prompts).
 * Les flux UI utilisent des modales ; ces helpers restent testables en isolation.
 */

function parseMinDoneInput(minDoneInput) {
  const raw = String(minDoneInput ?? '').trim();
  return raw === '' ? null : parseInt(raw, 10);
}

function isInvalidMinDone(minDoneInput, parsedMinDone) {
  return (
    String(minDoneInput ?? '').trim() !== '' &&
    (!Number.isFinite(parsedMinDone) || parsedMinDone < 0)
  );
}

function isInvalidDisplayOrder(parsedDisplayOrder) {
  return !Number.isFinite(parsedDisplayOrder) || parsedDisplayOrder < 0;
}

/**
 * @returns {{ error: string } | { payload: object } | null}
 */
export function buildRoleDetailsPatch(role, fields = {}) {
  const displayName = String(fields.display_name ?? '').trim();
  if (!displayName) return { error: 'Le nom du profil est requis' };
  const emojiInput = String(fields.emoji ?? '').trim();
  const minDoneInput = String(fields.min_done_tasks ?? '');
  const displayOrderInput = String(fields.display_order ?? '0');
  const parsedMinDone = parseMinDoneInput(minDoneInput);
  const parsedDisplayOrder = parseInt(displayOrderInput, 10);
  if (isInvalidMinDone(minDoneInput, parsedMinDone)) {
    return { error: 'Niveau requis invalide (entier >= 0)' };
  }
  if (isInvalidDisplayOrder(parsedDisplayOrder)) {
    return { error: "Ordre d'affichage invalide (entier >= 0)" };
  }
  return {
    payload: {
      display_name: displayName,
      rank: role.rank,
      emoji: emojiInput || null,
      min_done_tasks: parsedMinDone,
      display_order: parsedDisplayOrder,
    },
  };
}

/**
 * @returns {{ error: string } | { payload: object } | null}
 */
export function buildNewRoleProfile(fields = {}) {
  const slug = String(fields.slug ?? '')
    .trim()
    .toLowerCase();
  if (!slug) return { error: 'Le slug technique est requis' };
  const displayName = String(fields.display_name ?? '').trim();
  if (!displayName) return { error: 'Le nom du profil est requis' };
  const emojiInput = String(fields.emoji ?? '').trim();
  const minDoneInput = String(fields.min_done_tasks ?? '');
  const displayOrderInput = String(fields.display_order ?? '100');
  const parsedMinDone = parseMinDoneInput(minDoneInput);
  const parsedDisplayOrder = parseInt(displayOrderInput, 10);
  if (slug.startsWith('eleve_') && !emojiInput) {
    return { error: 'Un profil n3beur doit avoir un emoji' };
  }
  if (slug.startsWith('eleve_') && parsedMinDone == null) {
    return { error: 'Un profil n3beur doit avoir un niveau requis' };
  }
  if (isInvalidMinDone(minDoneInput, parsedMinDone)) {
    return { error: 'Niveau requis invalide (entier >= 0)' };
  }
  if (isInvalidDisplayOrder(parsedDisplayOrder)) {
    return { error: "Ordre d'affichage invalide (entier >= 0)" };
  }
  return {
    payload: {
      slug,
      display_name: displayName,
      rank: 150,
      emoji: emojiInput || null,
      min_done_tasks: parsedMinDone,
      display_order: parsedDisplayOrder,
    },
  };
}

/**
 * @returns {{ error: string } | { payload: object } | null}
 */
export function buildDuplicateRoleProfile(role, fields = {}) {
  const slug = String(fields.slug ?? '')
    .trim()
    .toLowerCase();
  if (!slug) return { error: 'Le slug technique est requis' };
  const displayName = String(fields.display_name ?? '').trim();
  if (!displayName) return { error: 'Le nom affiché est requis' };
  return {
    payload: {
      slug,
      display_name: displayName,
    },
  };
}

export const GROUP_KIND_LABELS = Object.freeze({
  class: 'Classe',
  team: 'Équipe',
  unit: 'Unité',
  club: 'Club',
});
