import { withAppBase } from '../../shared/appBase.js';
import { getGlToken } from '../services/apiGL.js';
import { downloadAuthedFile } from '../../shared/downloadAuthedFile.js';

/**
 * Télécharge un fichier binaire (XLSX/CSV) depuis l’API GL avec le jeton de session.
 * Adaptateur GL de `src/shared/downloadAuthedFile.js` (jeton + messages injectés).
 * @throws {Error} message explicite (HTTP, permission, déploiement)
 */
export async function downloadGlFile(path, filename) {
  return downloadAuthedFile(path, filename, {
    resolveUrl: withAppBase,
    getToken: getGlToken,
    messages: {
      unauthorized: 'Session expirée — reconnectez-vous à Gnomes & Licornes.',
      forbidden: 'Permission insuffisante (gl.content.manage requis).',
      notFound: 'Route introuvable — déployez la dernière version du serveur (modèles XLSX GL).',
    },
  });
}
