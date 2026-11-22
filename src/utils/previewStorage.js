/**
 * Clé `sessionStorage` du niveau d'aperçu du menu « Aperçu » (simulation **pour la session
 * seulement**). Module sans dépendance : il est lu par `pedagoSessionScope.js`, lui-même
 * importé par l'écran de connexion (`localDataCleanup.js`) — y tirer `appPreview.js`
 * (échelles, terminologie) faisait dépasser le budget du bundle de connexion.
 */

export const PREVIEW_STORAGE_KEY = 'foretmap.biodivPedagoPreview';

/**
 * Valeur brute mémorisée dans cet onglet (chaîne courte nettoyée), ou `null`. Non normalisée :
 * `appPreview.storedPreviewLevel()` normalise pour l'interface, le serveur pour lui-même.
 */
export function storedPreviewRaw() {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = String(sessionStorage.getItem(PREVIEW_STORAGE_KEY) || '').trim();
    return raw && raw.length <= 32 ? raw : null;
  } catch {
    return null;
  }
}
