/**
 * Déclenche le téléchargement d'un fichier texte côté navigateur (export Markdown / CSV).
 * Sans effet hors navigateur ou quand `URL.createObjectURL` manque (tests jsdom).
 *
 * @param {string} filename
 * @param {string} content
 * @param {string} [mimeType='text/plain;charset=utf-8']
 */
export function downloadTextFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
