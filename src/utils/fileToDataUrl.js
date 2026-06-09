/**
 * Lit un fichier (Blob/File) en data URL via FileReader.
 *
 * Helper générique mutualisé (O6/O9) : était dupliqué à l'identique dans
 * `tasks-views.jsx`, `foretmap-views.jsx` et `tutorials-views.jsx`.
 *
 * @param {Blob} file
 * @returns {Promise<string>} la data URL (chaîne vide si lecture vide).
 */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
    reader.readAsDataURL(file);
  });
}
