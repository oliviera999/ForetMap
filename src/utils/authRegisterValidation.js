/**
 * Validation pure du formulaire de l'écran d'authentification (`AuthScreen`).
 * Reproduit à l'identique la cascade de gardes historique de `submit` :
 * première erreur rencontrée renvoyée telle quelle, '' si tout est valide.
 */
export function getAuthSubmitError({
  mode,
  identifier,
  pass,
  pass2,
  allowRegister,
  first,
  last,
  pseudo,
  email,
  description,
  affiliation,
  affiliationOptions,
}) {
  if (mode === 'login' && (!identifier.trim() || !pass))
    return 'Identifiant et mot de passe requis';
  if (mode === 'register' && !allowRegister) return 'Inscriptions désactivées';
  if (mode === 'register' && (!first.trim() || !last.trim() || !pass))
    return 'Tous les champs sont requis';
  if (mode === 'register' && pass !== pass2) return 'Les mots de passe ne correspondent pas';
  if (mode === 'register' && pass.length < 4) return 'Mot de passe trop court (min 4 caractères)';
  if (mode === 'register' && pseudo.trim() && !/^[A-Za-z0-9_.-]{3,30}$/.test(pseudo.trim())) {
    return 'Pseudo invalide (3-30 caractères, lettres/chiffres/._-)';
  }
  if (mode === 'register' && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return 'Email invalide';
  }
  if (mode === 'register' && description.trim().length > 300) {
    return 'Description trop longue (max 300 caractères)';
  }
  if (mode === 'register' && !affiliation) {
    return 'Choisis ton espace (cartes proposées dans la liste)';
  }
  if (mode === 'register' && !affiliationOptions.some((o) => o.value === affiliation)) {
    return 'Choix d’espace invalide';
  }
  return '';
}
