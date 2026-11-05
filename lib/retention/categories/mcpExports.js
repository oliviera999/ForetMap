'use strict';

/**
 * Catégorie `mcp_exports` — exports et sauvegardes du connecteur Claude (`foretmap_export`,
 * `foretmap_ops dump`) déposés sous `uploads/mcp-exports/` : supprimés 24 h après leur
 * création. Le lien signé ne vaut qu'une heure ; le fichier n'a plus d'usage au-delà
 * (registre de traitement MCP, durée de conservation des exports).
 */

const { purgeOldExports } = require('../../mcp/tools/data');

module.exports = {
  key: 'mcp_exports',
  label: 'exports du connecteur Claude',
  async run({ apply, log }) {
    const removed = purgeOldExports({ apply });
    log(
      `${removed} fichier(s) d’export du connecteur ${apply ? 'supprimé(s)' : 'à supprimer'} (plus de 24 h).`,
    );
    return { counts: { fichiers: removed } };
  },
};
