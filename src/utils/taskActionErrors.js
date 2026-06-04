/**
 * Messages utilisateur pour les erreurs API liées aux tâches (prof).
 * @param {string} message
 * @returns {string}
 */
export function formatTaskActionError(message) {
  const raw = String(message || '').trim();
  if (!raw) return 'Une erreur est survenue. Réessayez ou rechargez la page.';
  if (/élévation pin requise/i.test(raw)) {
    return 'Activez les droits étendus via le cadenas en haut de l’écran, puis réessayez.';
  }
  if (/permission insuffisante/i.test(raw)) {
    return 'Votre profil n’a pas le droit demandé pour cette action (validation ou gestion des tâches).';
  }
  if (/accès refusé/i.test(raw)) {
    return 'Action refusée : vérifiez vos droits ou activez le mode professeur élevé (cadenas).';
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
 * @param {{ canManageTasks: boolean, canValidateTasks: boolean, hasActiveValidate: boolean, hasActiveManage: boolean }} perms
 */
export function teacherStatusActionDisabled(statusValue, perms) {
  if (statusValue === 'validated') {
    if (!perms?.canValidateTasks) return { disabled: true, title: 'Validation des tâches non autorisée pour votre profil.' };
    if (!perms?.hasActiveValidate) {
      return { disabled: true, title: 'Activez les droits étendus (cadenas) pour valider une tâche.' };
    }
    return { disabled: false, title: '' };
  }
  if (!perms?.canManageTasks) {
    return { disabled: true, title: 'Gestion des tâches non autorisée pour votre profil.' };
  }
  if (!perms?.hasActiveManage) {
    return { disabled: true, title: 'Activez les droits étendus (cadenas) pour modifier le statut.' };
  }
  return { disabled: false, title: '' };
}
