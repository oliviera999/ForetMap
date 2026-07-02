import { withAppBase, getAuthToken } from '../services/api.js';
import { downloadAuthedFile } from '../shared/downloadAuthedFile.js';

/**
 * Télécharge un fichier binaire (XLSX/CSV) depuis l’API ForetMap avec le jeton de session.
 * Adaptateur ForetMap de `src/shared/downloadAuthedFile.js` (jeton + messages injectés).
 * @throws {Error} message explicite (HTTP, permission, déploiement)
 */
export async function downloadApiFile(path, filename) {
  return downloadAuthedFile(path, filename, {
    resolveUrl: withAppBase,
    getToken: getAuthToken,
    messages: {
      unauthorized: 'Session expirée — reconnectez-vous.',
      forbidden: 'Permission insuffisante (élévation PIN requise).',
      notFound: 'Route introuvable — déployez la dernière version du serveur.',
    },
  });
}
