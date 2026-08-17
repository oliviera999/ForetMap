'use strict';

/**
 * Fusion de registres de mascottes — helper partagé **ForetMap / G&L**.
 *
 * Les deux produits construisent leur catalogue de la même façon : plusieurs groupes
 * d'entrées (catalogue livré, packs publiés…), concaténés dans un ordre de priorité,
 * dédoublonnés par identifiant, chaque groupe portant sa provenance (`source`).
 * Seule la *composition* des groupes diffère :
 *
 * - visite ForetMap (`lib/visitMascotRegistry.js`) : `catalog` puis `pack` ;
 * - G&L (`lib/glUnifiedMascotCatalog.js`) : `gl` puis `foretmap`, statiques puis packs.
 *
 * Règle unique : **le premier groupe qui déclare un identifiant gagne**.
 */

/**
 * @param {Array<{ entries: Array<object>, source?: string }>} groups groupes par priorité décroissante.
 * @returns {Array<object>} entrées fusionnées, dédoublonnées par `id`, dans l'ordre des groupes.
 */
function mergeMascotRegistryEntries(groups) {
  const out = [];
  const seen = new Set();
  for (const group of Array.isArray(groups) ? groups : []) {
    const entries = Array.isArray(group?.entries) ? group.entries : [];
    for (const entry of entries) {
      const id = String(entry?.id || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ ...entry, id, source: entry.source || group.source || 'catalog' });
    }
  }
  return out;
}

module.exports = { mergeMascotRegistryEntries };
