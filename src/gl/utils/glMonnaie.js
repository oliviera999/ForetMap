/**
 * Ensemble unifié (M1) — une seule monnaie, les gemmes.
 *
 * `gemmesSeules` dit si l'écran ne doit ni montrer ni nommer aucun cœur : dès que la partie
 * affichée joue « Tenir à deux » (`gameState.tenir.enabled`), ou que le serveur le dit pour la
 * classe de l'élève — ou pour le prof, quand le mode est actif (`gameplaySettings.monnaieUnique`,
 * `GET /api/gl/gameplay-settings`). Le jeu classique (partie sans profil « Tenir ») garde ses
 * deux bourses.
 */
export function gemmesSeules({ gameplaySettings = null, gameState = null } = {}) {
  return gameplaySettings?.monnaieUnique === true || gameState?.tenir?.enabled === true;
}

/** « 3 gemmes », « 1 gemme ». */
export function gemmesTexte(n) {
  const v = Number(n) || 0;
  return `${v} ${Math.abs(v) > 1 ? 'gemmes' : 'gemme'}`;
}
