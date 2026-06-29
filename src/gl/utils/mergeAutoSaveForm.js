/**
 * Fusionne la réponse normalisée du serveur avec l'état courant d'un formulaire en PRÉSERVANT
 * les champs que l'utilisateur a modifiés pendant la requête d'enregistrement « en vol ».
 *
 * Contexte : un éditeur à autovalidation envoie `sentSnapshot` au serveur, qui renvoie sa version
 * normalisée `serverForm`. Si on fait `setForm(serverForm)` à la résolution, toute frappe saisie
 * entre l'envoi et la réponse est écrasée (et, le pire, rebaselinée comme « enregistrée »).
 * On ne réapplique donc la valeur serveur que pour les champs restés inchangés depuis l'envoi ;
 * les champs édités entre-temps conservent la saisie courante (la prochaine autovalidation les
 * persistera).
 *
 * @param {Record<string, unknown>} current — état courant (peut inclure des frappes en vol)
 * @param {Record<string, unknown>} sentSnapshot — snapshot envoyé au serveur
 * @param {Record<string, unknown>} serverForm — version normalisée renvoyée par le serveur
 * @returns {Record<string, unknown>}
 */
export function mergeAutoSaveForm(current, sentSnapshot, serverForm) {
  const safeCurrent = current && typeof current === 'object' ? current : {};
  const safeSent = sentSnapshot && typeof sentSnapshot === 'object' ? sentSnapshot : {};
  const merged = { ...(serverForm && typeof serverForm === 'object' ? serverForm : {}) };
  for (const key of Object.keys(safeCurrent)) {
    if (safeCurrent[key] !== safeSent[key]) {
      // Champ édité pendant la requête en vol → on garde la saisie courante.
      merged[key] = safeCurrent[key];
    }
  }
  return merged;
}
