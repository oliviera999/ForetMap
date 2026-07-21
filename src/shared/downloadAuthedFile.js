/**
 * Déclenche le téléchargement d'un blob côté navigateur, de façon compatible mobile.
 *
 * Pièges corrigés (iOS Safari / Chrome Android) :
 *  - le lien `<a>` DOIT être attaché au document, sinon `click()` est ignoré ;
 *  - `URL.revokeObjectURL()` (et le retrait du lien) DOIVENT être différés :
 *    sur mobile le téléchargement démarre de façon asynchrone et révoquer l'URL
 *    blob immédiatement annule l'écriture → fichier vide/absent (symptôme
 *    « l'export ne s'exporte pas dans le contenu »).
 *
 * @param {Blob} blob contenu binaire à télécharger
 * @param {string} filename nom de fichier proposé au navigateur
 */
export function triggerBlobDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  const host = document.body || document.documentElement;
  host.appendChild(link);
  link.click();
  // Nettoyage différé : laisse au navigateur mobile le temps de lire le blob.
  setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
    link.remove();
  }, 15000);
}

/**
 * Téléchargement authentifié d'un fichier binaire (XLSX/CSV) — cœur partagé
 * entre `downloadApiFile` (ForetMap) et `downloadGlFile` (GL).
 *
 * Le jeton et les messages produit (401/403/404) sont injectés par les
 * adaptateurs : ce module ne lit aucun store de session (isolement produit).
 *
 * @param {string} path chemin API (résolu via `resolveUrl`)
 * @param {string} filename nom de fichier proposé au navigateur
 * @param {object} options
 * @param {(path: string) => string} options.resolveUrl résolution d'URL (ex: `withAppBase`)
 * @param {() => string|null} options.getToken getter de jeton produit
 * @param {{ unauthorized: string, forbidden: string, notFound: string }} options.messages
 *   messages de repli produit quand le corps JSON d'erreur n'en fournit pas
 * @throws {Error} message explicite (HTTP, permission, déploiement)
 */
export async function downloadAuthedFile(path, filename, { resolveUrl, getToken, messages }) {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(resolveUrl(path), { method: 'GET', headers });
  const contentType = String(res.headers.get('content-type') || '').toLowerCase();

  if (!res.ok) {
    if (contentType.includes('application/json')) {
      const body = await res.json().catch(() => ({}));
      const msg = typeof body?.error === 'string' && body.error ? body.error : null;
      if (res.status === 401) {
        throw new Error(msg || messages.unauthorized);
      }
      if (res.status === 403) {
        throw new Error(msg || messages.forbidden);
      }
      if (res.status === 404) {
        throw new Error(msg || messages.notFound);
      }
      throw new Error(msg || `Téléchargement impossible (HTTP ${res.status}).`);
    }
    throw new Error(`Téléchargement impossible (HTTP ${res.status}).`);
  }

  if (contentType.includes('application/json') || contentType.includes('text/html')) {
    throw new Error(
      'Réponse serveur invalide (page HTML ou JSON au lieu du fichier). Vérifiez le déploiement et reconnectez-vous.',
    );
  }

  const blob = await res.blob();
  if (!blob || blob.size < 4) {
    throw new Error('Fichier reçu vide.');
  }
  triggerBlobDownload(blob, filename);
}
