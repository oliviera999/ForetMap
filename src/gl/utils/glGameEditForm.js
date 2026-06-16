import { canEditGameChapter, canEditGameClass } from './glGameStatus.js';

export const EMPTY_GAME_EDIT_FORM = {
  name: '',
  chapterId: '',
  classId: '',
  zoneContentRetrigger: '',
  loreFeuilletRetrigger: '',
  loreEffacementEnabled: '',
  loreGemmeCostsEnabled: '',
  loreHeartRewardsEnabled: '',
};

function toTriStateString(value) {
  if (value == null) return '';
  return value ? '1' : '0';
}

/**
 * Normalise une partie (objet brut côté API) vers l'état du formulaire d'édition.
 * Les identifiants deviennent des chaînes (compat <select>), les booléens optionnels
 * deviennent un tri-état '' / '1' / '0'.
 */
export function gameToEditForm(game) {
  if (!game) return { ...EMPTY_GAME_EDIT_FORM };
  return {
    name: game.name || '',
    chapterId: game.chapter_id != null ? String(game.chapter_id) : '',
    classId: game.class_id != null ? String(game.class_id) : '',
    zoneContentRetrigger:
      game.zone_content_retrigger != null ? String(game.zone_content_retrigger) : '',
    loreFeuilletRetrigger:
      game.lore_feuillet_retrigger != null ? String(game.lore_feuillet_retrigger) : '',
    loreEffacementEnabled: toTriStateString(game.lore_effacement_enabled),
    loreGemmeCostsEnabled: toTriStateString(game.lore_gemme_costs_enabled),
    loreHeartRewardsEnabled: toTriStateString(game.lore_heart_rewards_enabled),
  };
}

/**
 * Construit le payload PUT de mise à jour d'une partie depuis l'état du formulaire.
 * Chapitre/classe ne sont inclus que si le statut le permet et qu'une valeur existe.
 * Les retriggers vides deviennent null ; les tri-états vides sont omis.
 */
export function buildGameEditPayload(form, status) {
  const payload = { name: form.name };
  if (canEditGameChapter(status) && form.chapterId) {
    payload.chapterId = Number(form.chapterId);
  }
  if (canEditGameClass(status) && form.classId) {
    payload.classId = Number(form.classId);
  }
  payload.zoneContentRetrigger = form.zoneContentRetrigger || null;
  payload.loreFeuilletRetrigger = form.loreFeuilletRetrigger || null;
  if (form.loreEffacementEnabled !== '') {
    payload.loreEffacementEnabled = form.loreEffacementEnabled === '1';
  }
  if (form.loreGemmeCostsEnabled !== '') {
    payload.loreGemmeCostsEnabled = form.loreGemmeCostsEnabled === '1';
  }
  if (form.loreHeartRewardsEnabled !== '') {
    payload.loreHeartRewardsEnabled = form.loreHeartRewardsEnabled === '1';
  }
  return payload;
}

/**
 * Formate un horodatage en heure locale, en absorbant les valeurs vides/invalides.
 */
export function formatGameTimestamp(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleTimeString();
  } catch (_) {
    return '';
  }
}
