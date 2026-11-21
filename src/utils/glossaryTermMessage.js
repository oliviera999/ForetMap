/**
 * Message `foretmap:glossary` émis par l'iframe d'un tutoriel (ouverture d'un terme).
 *
 * Module sans composant, à dessein (audit UI/UX du 19/11/2026, U1 — lot K) : les hooks du
 * shell montés dès l'écran de connexion l'importent, et l'importer depuis le fichier du
 * composant y ramenait ce composant et toutes ses dépendances.
 */

/**
 * Lit un message `foretmap:glossary` émis par l'iframe d'un tutoriel.
 *
 * Contrôle d'origine (audit A10) : un tutoriel de `type = 'link'` est affiché dans une
 * iframe de la **même page**, mais sur une origine tierce. Sans ce filtre, ce site
 * pourrait émettre `{ type: 'foretmap:glossary' }` et piloter la navigation de l'élève.
 * Seuls les tutoriels servis par `GET /api/tutorials/:id/view` — donc de notre origine —
 * sont acceptés.
 *
 * @param {MessageEvent} event
 * @param {string} appOrigin origine de l'application (`window.location.origin`)
 * @returns {string|null} le code du terme, ou `null` si le message est à ignorer
 */
export function readGlossaryTermMessage(event, appOrigin) {
  if (!event || typeof event !== 'object') return null;
  const expected = String(appOrigin || '');
  if (!expected || event.origin !== expected) return null;
  const data = event.data;
  if (!data || typeof data !== 'object' || data.type !== 'foretmap:glossary') return null;
  const code = String(data.code || '').trim();
  return code || null;
}
