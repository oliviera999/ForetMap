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

function wrapXlsxRoute(handler) {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (err) {
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
