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
 * Enveloppe une route de téléchargement XLSX. Deux styles d'écriture cohabitent :
 *
 *  - le handler appelle lui-même `sendXlsxAttachment(res, …)` — routes admin GL ;
 *  - le handler **retourne** `{ buffer, filename }` — routes lore (feuillets, glossaire,
 *    QCM lore).
 *
 * Le second ne fonctionnait pas : Express ignore la valeur de retour d'un handler, si
 * bien que la réponse n'était jamais envoyée et que la requête restait pendante jusqu'au
 * délai du navigateur. Les six boutons « Modèle XLSX » / « Exporter » du panneau contenus
 * lore ne livraient donc aucun fichier. L'enveloppe envoie désormais ce retour — sans
 * double envoi si le handler a déjà répondu.
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
      // Une réponse déjà partie ne peut plus devenir un 500 : on laisse remonter pour que
      // le gestionnaire d'erreurs central journalise, plutôt que d'écrire après coup.
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
