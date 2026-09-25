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

/** Rang d'un profil créé depuis la console quand rien ne permet de mieux faire. */
export const DEFAULT_NEW_ROLE_RANK = 150;
/** Bornes d'un palier n3beur : au-dessus du visiteur (50), sous le personnel (320). */
const LADDER_RANK_FLOOR = 50;
const LADDER_RANK_CEIL = 320;

/**
 * Rang d'un nouveau palier de progression, déduit de son seuil : à mi-chemin entre le rang du
 * palier au seuil inférieur le plus proche et celui du palier au seuil supérieur. La règle
 * « le profil le plus élevé l'emporte » compare les rangs ; un palier au rang par défaut (150)
 * placé au-dessus de « chevronné » (300) y perdait (audit du 25/09/2026, question 11).
 *
 * @param {Array<{ slug?: string, rank?: number, min_done_tasks?: number|null }>} roles profils existants
 * @param {number|null} minDone seuil du nouveau palier
 * @returns {number}
 */
export function suggestLadderRank(roles, minDone) {
  const threshold = Number(minDone);
  if (minDone == null || !Number.isFinite(threshold)) return DEFAULT_NEW_ROLE_RANK;
  if (!Array.isArray(roles) || roles.length === 0) return DEFAULT_NEW_ROLE_RANK;
  const ladder = roles.filter((r) => {
    const rank = Number(r?.rank);
    const min = r?.min_done_tasks;
    return (
      min != null &&
      min !== '' &&
      Number.isFinite(Number(min)) &&
      Number.isFinite(rank) &&
      rank < LADDER_RANK_CEIL &&
      !String(r?.slug || '').startsWith('gl_')
    );
  });
  let below = LADDER_RANK_FLOOR;
  let above = LADDER_RANK_CEIL;
  for (const r of ladder) {
    const min = Number(r.min_done_tasks);
    const rank = Number(r.rank);
    if (min <= threshold) below = Math.max(below, rank);
    else above = Math.min(above, rank);
  }
  if (above - below < 2) return DEFAULT_NEW_ROLE_RANK; // pas de place : on n'invente rien
  return Math.floor((below + above) / 2);
}

/**
 * @param {object} fields champs du formulaire
 * @param {{ roles?: Array<object> }} [context] profils existants (rang d'un nouveau palier)
 * @returns {{ error: string } | { payload: object } | null}
 */
export function buildNewRoleProfile(fields = {}, { roles } = {}) {
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
      rank: suggestLadderRank(roles, parsedMinDone),
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
