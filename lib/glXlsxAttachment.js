'use strict';

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function sendXlsxAttachment(res, buffer, filename) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    return res.status(500).json({ error: 'Fichier XLSX vide ou indisponible' });
  }
  res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', String(buffer.length));
  res.setHeader('Cache-Control', 'no-store');
  return res.send(buffer);
}

/**
 * Enveloppe une route XLSX.
 * Deux styles supportés (compat) :
 *  - handler appelle déjà `sendXlsxAttachment(res, …)` (routes admin historiques) ;
 *  - handler retourne `{ buffer, filename }` — cas des routes lore (feuillets / glossaire /
 *    QCM) : sans envoi explicite Express ignore la valeur de retour et la requête reste
 *    pendante (téléchargement admin cassé).
 */
function wrapXlsxRoute(handler) {
  return async (req, res) => {
    try {
      const result = await handler(req, res);
      if (res.headersSent) return result;
      if (
        result &&
        typeof result === 'object' &&
        Buffer.isBuffer(result.buffer) &&
        typeof result.filename === 'string' &&
        result.filename.trim()
      ) {
        return sendXlsxAttachment(res, result.buffer, result.filename.trim());
      }
      return result;
    } catch (err) {
      if (res.headersSent) throw err;
      return res.status(500).json({
        error: err.message || 'Génération du fichier XLSX impossible',
      });
    }
  };
}

module.exports = {
  XLSX_CONTENT_TYPE,
  sendXlsxAttachment,
  wrapXlsxRoute,
};
