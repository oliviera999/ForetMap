import { withAppBase } from '../../shared/appBase.js';
import { assertJsonApiBody, parseApiBody } from '../../services/apiTransport.js';
import { getGlToken } from './apiGL.js';

export const GL_UPLOAD_TIMEOUT_MS = 120000;

export function formatBytesLabel(bytes) {
  const value = Number(bytes) || 0;
  const mb = value / (1024 * 1024);
  if (mb >= 1) return `${Math.round(mb)} Mo`;
  return `${Math.round(value / 1024)} Ko`;
}

export function buildPayloadTooLargeMessage(body = {}, limits = {}) {
  const maxArchive = limits.maxArchiveBytes || 50 * 1024 * 1024;
  const maxFile = limits.maxFileBytes || 32 * 1024 * 1024;
  const hint = typeof body.hint === 'string' && body.hint ? ` ${body.hint}` : '';
  if (body.code === 'PAYLOAD_TOO_LARGE') {
    return `Fichier trop lourd (ZIP max ${formatBytesLabel(maxArchive)}, fichier max ${formatBytesLabel(maxFile)}).${hint}`;
  }
  return typeof body.error === 'string' && body.error
    ? body.error
    : `Fichier trop lourd (max ${formatBytesLabel(maxArchive)}).`;
}

export function apiGLMultipart(path, formData, options = {}) {
  const {
    method = 'POST',
    onProgress = null,
    timeoutMs = GL_UPLOAD_TIMEOUT_MS,
    limits = {},
  } = options;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = withAppBase(path);
    const token = getGlToken();

    xhr.open(method, url, true);
    xhr.timeout = timeoutMs;
    xhr.setRequestHeader('Accept', 'application/json');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    if (typeof onProgress === 'function') {
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        onProgress(percent, event.loaded, event.total);
      };
    }

    xhr.onload = async () => {
      const contentType = String(xhr.getResponseHeader('content-type') || '').toLowerCase();
      const isJson = contentType.includes('application/json');
      let body = {};
      if (isJson && xhr.responseText) {
        try {
          body = JSON.parse(xhr.responseText);
        } catch (_) {
          body = {};
        }
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          assertJsonApiBody(body, { ok: true });
        } catch (err) {
          reject(err);
          return;
        }
        resolve(body);
        return;
      }

      if (xhr.status === 413 || body.code === 'PAYLOAD_TOO_LARGE') {
        reject(new Error(buildPayloadTooLargeMessage(body, limits)));
        return;
      }

      const message =
        typeof body.error === 'string' && body.error ? body.error : `Erreur HTTP ${xhr.status}`;
      const err = new Error(message);
      err.status = xhr.status;
      err.body = body;
      reject(err);
    };

    xhr.onerror = () => reject(new Error('Erreur réseau pendant l’envoi du fichier.'));
    xhr.ontimeout = () => reject(new Error('Délai d’attente dépassé pendant l’envoi du fichier.'));
    xhr.onabort = () => reject(new Error('Envoi du fichier annulé.'));

    xhr.send(formData);
  });
}
