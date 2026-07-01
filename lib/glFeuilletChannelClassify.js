'use strict';

/**
 * Classification **pure** du canal d'acquisition d'un feuillet (carnet de Sélène),
 * alignée sur les buckets de couverture de l'audit §11.6. Aucune I/O : sert la vue
 * d'ensemble admin (couverture par canal + orphelins) et ses tests.
 *
 * Priorité (du plus spécifique au plus large) :
 *   zone → lien:<canal> (espece_pays / intro_pays / espece) → biome-pool →
 *   plateau-pool → pays-pool → orphan.
 *
 * Un feuillet « orphelin » n'est atteignable par aucun canal d'acquisition connu.
 */

function pickField(feuillet, snake, camel) {
  const v = feuillet?.[snake];
  if (v !== undefined && v !== null) return v;
  const c = feuillet?.[camel];
  return c === undefined ? null : c;
}

function nonEmpty(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

/**
 * @param {object} feuillet ligne feuillet (colonnes snake_case ou champs camelCase)
 * @param {{ zoneCodes?: Set<string> }} [ctx] ensemble des feuillet_code couverts par une zone carte
 * @returns {string} identifiant de canal (ex. 'zone', 'lien:espece_pays', 'biome-pool', 'orphan')
 */
function classifyFeuilletChannel(feuillet, ctx = {}) {
  if (!feuillet) return 'orphan';
  const code = feuillet.feuillet_code || feuillet.feuilletCode || null;
  const zoneCodes = ctx.zoneCodes;
  if (code && zoneCodes && zoneCodes.has(String(code))) return 'zone';

  const canal = pickField(feuillet, 'lien_canal', 'lienCanal');
  if (nonEmpty(canal)) return `lien:${String(canal).trim()}`;

  if (nonEmpty(pickField(feuillet, 'biome_slug', 'biomeSlug'))) return 'biome-pool';
  if (nonEmpty(pickField(feuillet, 'plateau_number', 'plateauNumber'))) return 'plateau-pool';
  if (nonEmpty(pickField(feuillet, 'lien_pays', 'lienPays'))) return 'pays-pool';
  return 'orphan';
}

/** Un feuillet est orphelin si son canal est 'orphan'. Pur. */
function isFeuilletOrphan(feuillet, ctx = {}) {
  return classifyFeuilletChannel(feuillet, ctx) === 'orphan';
}

/**
 * Agrège une liste de feuillets par canal.
 * @returns {{ counts: Record<string, number>, orphans: string[], total: number }}
 */
function summarizeChannels(feuillets = [], ctx = {}) {
  const counts = {};
  const orphans = [];
  for (const f of feuillets) {
    const channel = classifyFeuilletChannel(f, ctx);
    counts[channel] = (counts[channel] || 0) + 1;
    if (channel === 'orphan') {
      const code = f.feuillet_code || f.feuilletCode;
      if (code) orphans.push(String(code));
    }
  }
  return { counts, orphans, total: feuillets.length };
}

module.exports = {
  classifyFeuilletChannel,
  isFeuilletOrphan,
  summarizeChannels,
};
