import { withAppBase } from '../../services/api.js';
import { getGlToken } from '../services/apiGL.js';

/**
 * Télécharge un fichier binaire (XLSX/CSV) depuis l’API GL avec le jeton de session.
 * @throws {Error} message explicite (HTTP, permission, déploiement)
 */
export async function downloadGlFile(path, filename) {
  const headers = new Headers();
  const token = getGlToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(withAppBase(path), { method: 'GET', headers });
  const contentType = String(res.headers.get('content-type') || '').toLowerCase();

  if (!res.ok) {
    if (contentType.includes('application/json')) {
      const body = await res.json().catch(() => ({}));
      const msg = typeof body?.error === 'string' && body.error ? body.error : null;
      if (res.status === 401) {
        throw new Error(msg || 'Session expirée — reconnectez-vous à Gnomes & Licornes.');
      }
      if (res.status === 403) {
        throw new Error(msg || 'Permission insuffisante (gl.content.manage requis).');
      }
      if (res.status === 404) {
        throw new Error(
          msg || 'Route introuvable — déployez la dernière version du serveur (modèles XLSX GL).'
        );
      }
      throw new Error(msg || `Téléchargement impossible (HTTP ${res.status}).`);
    }
    throw new Error(`Téléchargement impossible (HTTP ${res.status}).`);
  }

  if (contentType.includes('application/json') || contentType.includes('text/html')) {
    throw new Error(
      'Réponse serveur invalide (page HTML ou JSON au lieu du fichier). Vérifiez le déploiement et reconnectez-vous.'
    );
  }

  const blob = await res.blob();
  if (!blob || blob.size < 4) {
    throw new Error('Fichier reçu vide.');
  }
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
}
