'use strict';

/**
 * Outils de domaine du connecteur (lot D). Chargés **seulement** par `buildServerTools`
 * (serveur `/mcp`), jamais par le script stdio Cursor : ils tirent la base, le pont API et les
 * services de l'application.
 *
 * Chaque module exporte une fonction `build…Tool()` (ou `build…Tools()`) ; l'ordre de la liste
 * fixe l'ordre de `tools/list`.
 */

const MODULES = [
  ['./tasks', 'buildTasksTool'],
  ['./taskProjects', 'buildTaskProjectsTool'],
];

function buildDomainTools() {
  const out = [];
  for (const [path, fn] of MODULES) {
    const mod = require(path);
    const built = mod[fn]();
    out.push(...(Array.isArray(built) ? built : [built]));
  }
  return out;
}

module.exports = { buildDomainTools, MODULES };
