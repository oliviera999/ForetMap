/**
 * Messages utilisateur pour les erreurs API liées aux tâches (prof).
 * @param {string} message
 * @returns {string}
 */
export function formatTaskActionError(message) {
  const raw = String(message || '').trim();
  if (!raw) return 'Une erreur est survenue. Réessayez ou rechargez la page.';
  if (/permission insuffisante/i.test(raw)) {
    return 'Votre profil n’a pas le droit demandé pour cette action (validation ou gestion des tâches).';
  }
  if (/accès refusé/i.test(raw)) {
    return 'Action refusée : votre profil n’a pas le droit demandé pour cette action.';
  }
  if (/momentanément indisponible|redémarrage|SERVICE_RESTARTING|SERVICE_NOT_READY/i.test(raw)) {
    return 'Le serveur est momentanément indisponible (redémarrage ou surcharge). Attendez quelques secondes puis réessayez.';
  }
  return raw;
}

/**
 * Filtre les actions de statut prof selon les permissions effectives / élevables.
 * @param {Array<{ value: string, label: string, icon: string }>} actions
 * @param {{ canManageTasks: boolean, canValidateTasks: boolean }} perms
 */
export function filterTeacherStatusActions(actions, perms) {
  const canManage = !!perms?.canManageTasks;
  const canValidate = !!perms?.canValidateTasks;
  return (actions || []).filter((opt) => {
    if (opt.value === 'validated') return canValidate;
    return canManage;
  });
}

/**
 * @param {'validated'|string} statusValue
 * @param {{ canManageTasks: boolean, canValidateTasks: boolean }} perms
 */
export function teacherStatusActionDisabled(statusValue, perms) {
  if (statusValue === 'validated') {
    if (!perms?.canValidateTasks)
      return { disabled: true, title: 'Validation des tâches non autorisée pour votre profil.' };
    return { disabled: false, title: '' };
  }
  if (!perms?.canManageTasks) {
    return { disabled: true, title: 'Gestion des tâches non autorisée pour votre profil.' };
  }
  return { disabled: false, title: '' };
}
