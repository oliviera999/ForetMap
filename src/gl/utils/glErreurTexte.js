/**
 * Identifiant de requête dans un message d'erreur (« … [requête 4f2a-…] », posé par
 * `buildApiHttpErrorMessage`). Il sert au diagnostic, pas à la lecture : la console du prof le
 * montre en petit, à part de la phrase. Un élève ne le reçoit jamais (`apiGL` le retire).
 */
const SUFFIXE_REQUETE = /\s*\[requête ([^\]]+)\]\s*$/;

/**
 * @param {unknown} message
 * @returns {{ texte: string, requete: string | null }}
 */
export function separerIdRequete(message) {
  const brut = String(message ?? '');
  const trouve = SUFFIXE_REQUETE.exec(brut);
  if (!trouve) return { texte: brut, requete: null };
  return { texte: brut.slice(0, trouve.index), requete: trouve[1].trim() || null };
}

/** Le message sans son identifiant de requête (texte dit à un élève, à une équipe). */
export function sansIdRequete(message) {
  return separerIdRequete(message).texte;
}
