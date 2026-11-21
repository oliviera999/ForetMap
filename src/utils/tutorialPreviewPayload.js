/**
 * Aiguillage de l'aperçu d'un tutoriel (`preview_url`), partagé par la modale d'aperçu, les
 * séances pédagogiques et la préparation de sortie hors ligne.
 *
 * Module sans composant, à dessein (audit UI/UX du 19/11/2026, U1 — lot K) : les hooks du
 * shell montés dès l'écran de connexion l'importent, et l'importer depuis le fichier du
 * composant y ramenait ce composant et toutes ses dépendances.
 */

/**
 * Vrai si le chemin de fichier local pointe vers un document que `/api/tutorials/:id/view`
 * ne sait pas rendre (PDF, image, archive…) : ces fichiers restent servis tels quels par le
 * statique `/tutos/`. Une extension absente ou `.html` / `.htm` passe par `/view`.
 * @param {string} filePath
 * @returns {boolean}
 */
function isNonHtmlLocalFilePath(filePath) {
  const clean = String(filePath || '')
    .trim()
    .split(/[?#]/)[0];
  const lastSegment = clean.split('/').pop() || '';
  const dot = lastSegment.lastIndexOf('.');
  if (dot <= 0) return false; // pas d’extension exploitable : on laisse `/view` tenter le rendu
  return !/\.html?$/i.test(lastSegment);
}

/**
 * Objet tutoriel enrichi pour l’iframe (même logique que l’aperçu liste Tutoriels).
 *
 * Règle d’aiguillage (identique quel que soit `type`, qui n’est qu’un `VARCHAR` libre) :
 * - `type === 'link'` → `source_url` (site externe) ;
 * - contenu local pointant un fichier non-HTML (`/tutos/fiche.pdf`…) → ce fichier statique ;
 * - tout autre contenu local (`html_content` en base ou fichier `.html` / `.htm`)
 *   → `/api/tutorials/:id/view`, seul chemin qui pose les auto-liens de glossaire.
 *
 * @param {object} t
 * @returns {object|null}
 */
export function tutorialPreviewPayload(t) {
  if (!t || t.id == null) return null;
  const filePath = String(t.source_file_path || '').trim();
  let preview_url = '';
  if (t.type === 'link') {
    preview_url = String(t.source_url || '').trim();
  } else if (filePath && isNonHtmlLocalFilePath(filePath)) {
    preview_url = filePath;
  } else {
    preview_url = `/api/tutorials/${t.id}/view`;
  }
  return { ...t, preview_url };
}
