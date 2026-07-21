'use strict';

/**
 * Assembleur **pur** de la vue d'ensemble admin des feuillets (carnet de Sélène).
 * Reçoit les données déjà chargées (feuillets, chapitres, codes zone, noms d'espèces,
 * stats de découverte) et produit l'objet exposé par la route. Aucune I/O : la route
 * fait les requêtes, ce module fait l'agrégation (donc entièrement testable sans BDD).
 */

const { classifyFeuilletChannel, summarizeChannels } = require('./glFeuilletChannelClassify');
const { feuilletChapters } = require('./glFeuilletChapterMembership');

function toNum(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Libellé lisible du lien de déblocage (résolution des codes en noms).
 * @param {object} f feuillet (snake_case)
 * @param {Map<string,string>} speciesNames map species_code → nom_commun
 * @returns {string|null}
 */
function resolveLinkLabel(f, speciesNames = new Map()) {
  const canal = String(f.lien_canal || '').trim();
  const ref = String(f.lien_ref || '').trim();
  const pays = toNum(f.lien_pays);
  if (!canal && !ref && pays == null) return null;
  const parts = [];
  if (canal) parts.push(canal);
  if (ref) {
    const nom = speciesNames.get(ref);
    parts.push(nom ? `${nom} (${ref})` : ref);
  }
  if (pays != null) parts.push(`pays ${pays}`);
  return parts.join(' · ');
}

/**
 * @param {object} input
 * @param {object[]} input.feuillets lignes feuillet (snake_case)
 * @param {Array<{id:number,name:string,plateauNumber:?number,biomeSlugs:string[]}>} input.chapters
 * @param {Set<string>} [input.zoneCodes] codes couverts par une zone carte
 * @param {Map<string,string>} [input.speciesNames] species_code → nom_commun
 * @param {Map<string,{games:number,teams:number}>} [input.discoveryStats] par feuillet_code
 */
function assembleFeuilletOverview({
  feuillets = [],
  chapters = [],
  zoneCodes = new Set(),
  speciesNames = new Map(),
  discoveryStats = new Map(),
}) {
  const items = feuillets.map((f) => {
    const code = String(f.feuillet_code || '');
    const chs = feuilletChapters(f, chapters);
    const stat = discoveryStats.get(code) || { games: 0, teams: 0 };
    return {
      feuilletCode: code,
      titre: f.titre || null,
      type: f.type || null,
      statut: f.statut || null,
      biomeSlug: f.biome_slug || null,
      plateauNumber: toNum(f.plateau_number),
      kingdomZoneId: toNum(f.kingdom_zone_id),
      channel: classifyFeuilletChannel(f, { zoneCodes }),
      linkLabel: resolveLinkLabel(f, speciesNames),
      chapters: chs,
      coutGemme: toNum(f.cout_gemme) || 0,
      gainCoeur: toNum(f.gain_coeur) || 0,
      discovery: { games: stat.games || 0, teams: stat.teams || 0 },
    };
  });

  const channels = summarizeChannels(feuillets, { zoneCodes });

  // Répartition par chapitre (un feuillet peut compter dans plusieurs chapitres).
  const byChapterMap = new Map();
  let unassignedChapterCount = 0;
  for (const item of items) {
    if (!item.chapters.length) {
      unassignedChapterCount += 1;
      continue;
    }
    for (const ch of item.chapters) {
      const prev = byChapterMap.get(ch.id) || { id: ch.id, name: ch.name, count: 0 };
      prev.count += 1;
      byChapterMap.set(ch.id, prev);
    }
  }
  const byChapter = [...byChapterMap.values()].sort((a, b) => a.id - b.id);

  const active = feuillets.filter((f) => (f.statut || 'actif') === 'actif').length;

  // Ancrage carte (kingdom_zone_id). C'est le seul lien réellement rompu (mis à NULL)
  // par la suppression d'un chapitre — la cascade efface ses zones (gl_kingdom_zones),
  // ce qui détache les feuillets qui y pointaient. On expose l'état d'ancrage pour
  // permettre de repérer et re-lier ces feuillets. `mapAnchorLostCount` cible le sous-
  // ensemble « censé apparaître sur une zone » (canal 'zone') mais sans ancrage en base :
  // signal le plus probant d'un ancrage perdu (les autres NULL sont souvent volontaires).
  const mapAnchoredCount = items.filter((it) => it.kingdomZoneId != null).length;
  const mapAnchorLostCount = items.filter(
    (it) => it.channel === 'zone' && it.kingdomZoneId == null,
  ).length;

  return {
    total: feuillets.length,
    active,
    channels,
    byChapter,
    unassignedChapterCount,
    mapAnchoredCount,
    mapAnchorLostCount,
    items,
  };
}

module.exports = {
  resolveLinkLabel,
  assembleFeuilletOverview,
};
