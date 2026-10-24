/**
 * Mot de passe provisoire ou compromis à changer — contrat client du refus serveur
 * `403 { code: 'PASSWORD_CHANGE_REQUIRED' }` (`middleware/requireTeacher.js`).
 *
 * Tant que le drapeau du compte est levé, seules « Mon profil » et le changement de mot de
 * passe répondent. `api()` émet alors l'événement `window` ci-dessous ; le shell l'écoute
 * (`usePasswordChangeRequired`) et ouvre « Mon profil », où se trouve le formulaire.
 *
 * Module sans dépendance : partagé par `services/api.js`, les files hors ligne et le cycle
 * de session sans tirer tout le service d'API.
 */

export const PASSWORD_CHANGE_REQUIRED_CODE = 'PASSWORD_CHANGE_REQUIRED';

/** Événement `window` émis par `api()` sur ce refus. */
export const PASSWORD_CHANGE_REQUIRED_EVENT = 'foretmap_password_change_required';

/**
 * Vrai si l'erreur levée par `api()` est ce refus. Refus **passager** : il cesse dès que le
 * mot de passe est changé, la requête n'est donc pas condamnée.
 * @param {unknown} err
 */
export function isPasswordChangeRequiredError(err) {
  return (
    err?.code === PASSWORD_CHANGE_REQUIRED_CODE || err?.body?.code === PASSWORD_CHANGE_REQUIRED_CODE
  );
}
