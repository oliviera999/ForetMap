/**
 * Flux de saisie par `window.prompt` de l'admin des profils — extraits de `ProfilesAdminView`
 * (`profiles-views.jsx`, O6). Chaque fonction enchaîne les prompts (édition, création, duplication
 * de profil), valide les saisies et construit le payload API, sans effectuer d'appel réseau.
 *
 * Contrat de retour commun :
 * - `null` → flux annulé par l'utilisateur (aucun message à afficher) ;
 * - `{ error }` → saisie invalide (message à afficher tel quel) ;
 * - `{ payload }` → corps prêt pour l'appel API correspondant.
 *
 * `promptFn` est injectable pour les tests ; par défaut `window.prompt`.
 */

const defaultPrompt = (text, defaultValue) => window.prompt(text, defaultValue);

/** Parse un champ « niveau requis » : vide → null, sinon entier ≥ 0 (NaN si invalide). */
function parseMinDoneInput(minDoneInput) {
  return minDoneInput.trim() === '' ? null : parseInt(minDoneInput, 10);
}

function isInvalidMinDone(minDoneInput, parsedMinDone) {
  return minDoneInput.trim() !== '' && (!Number.isFinite(parsedMinDone) || parsedMinDone < 0);
}

function isInvalidDisplayOrder(parsedDisplayOrder) {
  return !Number.isFinite(parsedDisplayOrder) || parsedDisplayOrder < 0;
}

/**
 * Édition des détails d'un profil existant (nom, emoji, niveau requis, ordre d'affichage).
 * `drafts` fournit les valeurs en cours d'édition dans le formulaire (prioritaires sur le rôle).
 * Payload pour `PATCH /api/rbac/profiles/:id`.
 */
export function promptRoleDetailsPatch(role, drafts = {}, promptFn = defaultPrompt) {
  const displayName = promptFn('Nom du profil', role.display_name || '');
  if (!displayName || !displayName.trim()) return null;
  const emojiInput = promptFn('Emoji du profil', (drafts.roleEmoji || role.emoji || '').trim());
  if (emojiInput == null) return null;
  const minDoneInput = promptFn(
    'Niveau requis (nombre de tâches validées)',
    drafts.roleMinDoneTasks || (role.min_done_tasks == null ? '' : String(role.min_done_tasks))
  );
  if (minDoneInput == null) return null;
  const displayOrderInput = promptFn(
    "Ordre d'affichage (entier >= 0, plus petit = plus haut)",
    drafts.roleDisplayOrder || String(role.display_order ?? 0)
  );
  if (displayOrderInput == null) return null;
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
      display_name: displayName.trim(),
      rank: role.rank,
      emoji: emojiInput.trim() || null,
      min_done_tasks: parsedMinDone,
      display_order: parsedDisplayOrder,
    },
  };
}

/**
 * Création d'un nouveau profil personnalisé (rang fixe 150). Impose emoji + niveau requis pour les
 * slugs `eleve_*` (paliers n3beur). Payload pour `POST /api/rbac/profiles`.
 */
export function promptNewRoleProfile(promptFn = defaultPrompt) {
  const slug = promptFn(
    'Slug technique du profil (ex. eleve_mentor, n3boss_lycee). Réservés et interdits : admin, prof, visiteur, eleve_novice, eleve_avance, eleve_chevronne. Le nom affiché peut être « Admin » ou « n3boss » avec un autre slug.',
    ''
  );
  if (!slug || !slug.trim()) return null;
  const displayName = promptFn('Nom du profil', slug.trim());
  if (!displayName || !displayName.trim()) return null;
  const emojiInput = promptFn("Emoji du profil (obligatoire pour un profil n3beur)", '');
  if (emojiInput == null) return null;
  const minDoneInput = promptFn(
    'Niveau requis pour atteindre ce profil (nombre de tâches validées)',
    ''
  );
  if (minDoneInput == null) return null;
  const displayOrderInput = promptFn(
    "Ordre d'affichage (entier >= 0, plus petit = plus haut)",
    '100'
  );
  if (displayOrderInput == null) return null;
  const normalizedSlug = slug.trim().toLowerCase();
  const parsedMinDone = parseMinDoneInput(minDoneInput);
  const parsedDisplayOrder = parseInt(displayOrderInput, 10);
  if (normalizedSlug.startsWith('eleve_') && !emojiInput.trim()) {
    return { error: 'Un profil n3beur doit avoir un emoji' };
  }
  if (normalizedSlug.startsWith('eleve_') && parsedMinDone == null) {
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
      slug: normalizedSlug,
      display_name: displayName.trim(),
      rank: 150,
      emoji: emojiInput.trim() || null,
      min_done_tasks: parsedMinDone,
      display_order: parsedDisplayOrder,
    },
  };
}

/**
 * Duplication d'un profil existant (slug + nom affiché du clone).
 * Payload pour `POST /api/rbac/profiles/:id/duplicate`.
 */
export function promptDuplicateRoleProfile(role, promptFn = defaultPrompt) {
  const suggestedSlug = `${String(role.slug || 'profil').replace(/[^a-z0-9_]+/gi, '_')}_copie`;
  const slugInput = promptFn(
    'Slug technique (unique). Ne pas utiliser : admin, prof, visiteur, eleve_novice, eleve_avance, eleve_chevronne — préférez ex. prof_copie_lycee. Le nom affiché est demandé ensuite.',
    suggestedSlug
  );
  if (!slugInput || !slugInput.trim()) return null;
  const displayNameInput = promptFn(
    'Nom affiché du nouveau profil',
    `${role.display_name || slugInput.trim()} (copie)`
  );
  if (!displayNameInput || !displayNameInput.trim()) return null;
  return {
    payload: {
      slug: slugInput.trim().toLowerCase(),
      display_name: displayNameInput.trim(),
    },
  };
}
