'use strict';

/**
 * Service de présence des espèces — **une** définition de « présente sur ce site ».
 *
 * Décision Q10 du mainteneur (`docs/AUDIT_ETAT_DES_LIEUX_2026-09-25.md`, § 1.3.4 et
 * § 3.2.6) : une espèce est présente sur une carte dès qu'**un** des trois canaux l'y
 * rattache, et chaque réponse dit **lequel** :
 *
 * - `registre` — rattachement direct fiche → carte (`map_species`, cases « cartes » du
 *   formulaire de la fiche) ;
 * - `zone`     — l'espèce figure dans une zone de la carte (`zone_species`) ;
 * - `repere`   — l'espèce figure sur un repère de la carte (`marker_species`).
 *
 * Jusqu'ici, quatre écrans répondaient à la même question de quatre façons : l'activité
 * « Groupes emboîtés » lisait le registre seul, la visite les zones et repères, le réseau
 * trophique la réunion, et le filtre du catalogue refaisait la réunion côté client en y
 * ajoutant les anciens noms mono-espèce (`zones.current_plant`, `map_markers.plant_name`).
 * Tous passent désormais par ce module ; un écran peut restreindre les canaux (`sources`),
 * mais il le dit explicitement.
 *
 * Les anciens noms mono-espèce **ne sont pas** un canal : sur la base de référence (copie
 * anonymisée de la production, v297), les trois noms encore renseignés ont tous leur ligne
 * de jonction, et les écritures actuelles vident ces colonnes dès qu'une espèce est donnée.
 *
 * Aucune écriture ici : le registre reste tenu par `syncPlantMaps` (`lib/speciesJunction.js`),
 * dont la synchronisation différentielle (lot P0) n'est pas touchée.
 *
 * Les requêtes sont paramétrées et séparées par canal : aucune comparaison de colonnes texte
 * entre tables (pas de `UNION` de libellés), donc aucun risque de collations mêlées.
 */

const PRESENCE_SOURCES = Object.freeze({
  REGISTRY: 'registre',
  ZONE: 'zone',
  MARKER: 'repere',
});

/** Ordre canonique des canaux (réponses et documentation). */
const ALL_PRESENCE_SOURCES = Object.freeze([
  PRESENCE_SOURCES.REGISTRY,
  PRESENCE_SOURCES.ZONE,
  PRESENCE_SOURCES.MARKER,
]);

/**
 * Identifiants de fiche présents par canal — une sous-requête, **un** paramètre `map_id`.
 * Jointures internes : une zone ou un repère supprimé n'apporte rien (les clés étrangères
 * suppriment déjà la jonction en cascade ; la jointure le garantit sans en dépendre).
 */
const SOURCE_PLANT_ID_SQL = Object.freeze({
  [PRESENCE_SOURCES.REGISTRY]: 'SELECT ms.plant_id FROM map_species ms WHERE ms.map_id = ?',
  [PRESENCE_SOURCES.ZONE]:
    'SELECT zs.plant_id FROM zone_species zs JOIN zones z ON z.id = zs.zone_id WHERE z.map_id = ?',
  [PRESENCE_SOURCES.MARKER]:
    'SELECT mk.plant_id FROM marker_species mk JOIN map_markers m ON m.id = mk.marker_id WHERE m.map_id = ?',
});

function normalizeId(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizePlantId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Canaux demandés → sous-ensemble valide, dans l'ordre canonique. Absent ou vide = les trois.
 * Accepte un tableau ou une chaîne séparée par des virgules (paramètre de requête).
 * @returns {{ ok: true, sources: string[] } | { ok: false, error: string }}
 */
function parsePresenceSources(raw) {
  if (raw == null || raw === '') return { ok: true, sources: [...ALL_PRESENCE_SOURCES] };
  const list = (Array.isArray(raw) ? raw : String(raw).split(','))
    .map((s) => String(s ?? '').trim())
    .filter(Boolean);
  if (list.length === 0) return { ok: true, sources: [...ALL_PRESENCE_SOURCES] };
  const unknown = list.filter((s) => !ALL_PRESENCE_SOURCES.includes(s));
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Source de présence inconnue : ${unknown.join(', ')} (attendu : ${ALL_PRESENCE_SOURCES.join(', ')})`,
    };
  }
  return { ok: true, sources: ALL_PRESENCE_SOURCES.filter((s) => list.includes(s)) };
}

/** Variante tolérante : une valeur inconnue est ignorée, un résultat vide retombe sur les trois. */
function normalizePresenceSources(raw) {
  const list = (Array.isArray(raw) ? raw : raw == null ? [] : String(raw).split(','))
    .map((s) => String(s ?? '').trim())
    .filter((s) => ALL_PRESENCE_SOURCES.includes(s));
  return list.length > 0
    ? ALL_PRESENCE_SOURCES.filter((s) => list.includes(s))
    : [...ALL_PRESENCE_SOURCES];
}

/**
 * Sous-requête SQL « identifiants de fiche présents sur la carte », à placer après `IN`.
 * Réutilisable autant de fois que nécessaire dans une même requête : concaténer `params`
 * à chaque occurrence.
 *
 * @param {string} mapId
 * @param {{ sources?: string[] }} [opts]
 * @returns {{ sql: string, params: string[] }}
 */
function mapPresenceSubquery(mapId, { sources } = {}) {
  const list = normalizePresenceSources(sources);
  const id = normalizeId(mapId);
  return {
    sql: `(${list.map((s) => SOURCE_PLANT_ID_SQL[s]).join(' UNION ')})`,
    params: list.map(() => id),
  };
}

/**
 * Sous-requête « identifiants de fiche présents dans la zone » (jonction `zone_species`).
 * Même contenu que la vue historique `v_zone_inventory` pour une zone donnée.
 * @returns {{ sql: string, params: string[] }}
 */
function zonePresenceSubquery(zoneId) {
  return {
    sql: '(SELECT zs.plant_id FROM zone_species zs JOIN zones z ON z.id = zs.zone_id WHERE zs.zone_id = ?)',
    params: [normalizeId(zoneId)],
  };
}

function compareSpecies(a, b) {
  const byName = String(a.name || '').localeCompare(String(b.name || ''), 'fr', {
    sensitivity: 'base',
  });
  return byName !== 0 ? byName : a.plant_id - b.plant_id;
}

function comparePlaces(a, b) {
  const byLabel = String(a.label || '').localeCompare(String(b.label || ''), 'fr', {
    sensitivity: 'base',
  });
  return byLabel !== 0 ? byLabel : String(a.id).localeCompare(String(b.id));
}

/** Accumulateur fiche → provenance, dans la forme publique du service. */
function speciesEntry(byId, row) {
  const plantId = Number(row.plant_id);
  if (!byId.has(plantId)) {
    byId.set(plantId, {
      plant_id: plantId,
      name: row.plant_name == null ? '' : String(row.plant_name),
      emoji: row.plant_emoji ? String(row.plant_emoji) : '',
      clade_id: row.clade_id == null ? null : String(row.clade_id),
      sources: [],
      registry: null,
      zones: [],
      markers: [],
    });
  }
  return byId.get(plantId);
}

function finalizeSpecies(byId) {
  const out = [...byId.values()];
  for (const entry of out) {
    entry.sources = ALL_PRESENCE_SOURCES.filter((s) => entry.sources.includes(s));
    entry.zones.sort(comparePlaces);
    entry.markers.sort(comparePlaces);
  }
  return out.sort(compareSpecies);
}

/**
 * Espèces présentes sur une carte, avec leur provenance et leurs lieux.
 *
 * @param {{ queryAll: Function }} db exécuteur (`database.js` ou transaction)
 * @param {string} mapId
 * @param {{ sources?: string[] }} [opts] canaux retenus (défaut : les trois)
 * @returns {Promise<Array<{
 *   plant_id: number, name: string, emoji: string, clade_id: string|null,
 *   sources: string[],
 *   registry: { validation_status: string|null, presence_status: string|null } | null,
 *   zones: Array<{ id: string, label: string }>,
 *   markers: Array<{ id: string, label: string }>
 * }>>} trié par nom (fr), puis identifiant
 */
async function listSpeciesForMap(db, mapId, { sources } = {}) {
  const id = normalizeId(mapId);
  if (!id) return [];
  const wanted = normalizePresenceSources(sources);
  const plantCols = 'p.name AS plant_name, p.emoji AS plant_emoji, p.clade_id';
  const [registryRows, zoneRows, markerRows] = await Promise.all([
    wanted.includes(PRESENCE_SOURCES.REGISTRY)
      ? db.queryAll(
          `SELECT ms.plant_id, ms.validation_status, ms.presence_status, ${plantCols}
             FROM map_species ms
             JOIN plants p ON p.id = ms.plant_id
            WHERE ms.map_id = ?`,
          [id],
        )
      : [],
    wanted.includes(PRESENCE_SOURCES.ZONE)
      ? db.queryAll(
          `SELECT zs.plant_id, z.id AS place_id, z.name AS place_label, ${plantCols}
             FROM zone_species zs
             JOIN zones z ON z.id = zs.zone_id
             JOIN plants p ON p.id = zs.plant_id
            WHERE z.map_id = ?`,
          [id],
        )
      : [],
    wanted.includes(PRESENCE_SOURCES.MARKER)
      ? db.queryAll(
          `SELECT mk.plant_id, m.id AS place_id, m.label AS place_label, ${plantCols}
             FROM marker_species mk
             JOIN map_markers m ON m.id = mk.marker_id
             JOIN plants p ON p.id = mk.plant_id
            WHERE m.map_id = ?`,
          [id],
        )
      : [],
  ]);

  const byId = new Map();
  for (const row of registryRows || []) {
    const entry = speciesEntry(byId, row);
    if (!entry.sources.includes(PRESENCE_SOURCES.REGISTRY)) {
      entry.sources.push(PRESENCE_SOURCES.REGISTRY);
    }
    entry.registry = {
      validation_status: row.validation_status == null ? null : String(row.validation_status),
      presence_status: row.presence_status == null ? null : String(row.presence_status),
    };
  }
  for (const [rows, source, key] of [
    [zoneRows, PRESENCE_SOURCES.ZONE, 'zones'],
    [markerRows, PRESENCE_SOURCES.MARKER, 'markers'],
  ]) {
    for (const row of rows || []) {
      const entry = speciesEntry(byId, row);
      if (!entry.sources.includes(source)) entry.sources.push(source);
      const placeId = String(row.place_id);
      if (!entry[key].some((p) => p.id === placeId)) {
        entry[key].push({
          id: placeId,
          label: row.place_label == null ? '' : String(row.place_label),
        });
      }
    }
  }
  return finalizeSpecies(byId);
}

/**
 * Espèces présentes dans une zone (jonction `zone_species`), même forme que
 * `listSpeciesForMap` : provenance `zone`, un seul lieu.
 */
async function listSpeciesForZone(db, zoneId) {
  const id = normalizeId(zoneId);
  if (!id) return [];
  const rows = await db.queryAll(
    `SELECT zs.plant_id, z.id AS place_id, z.name AS place_label,
            p.name AS plant_name, p.emoji AS plant_emoji, p.clade_id
       FROM zone_species zs
       JOIN zones z ON z.id = zs.zone_id
       JOIN plants p ON p.id = zs.plant_id
      WHERE zs.zone_id = ?`,
    [id],
  );
  const byId = new Map();
  for (const row of rows || []) {
    const entry = speciesEntry(byId, row);
    if (!entry.sources.includes(PRESENCE_SOURCES.ZONE)) entry.sources.push(PRESENCE_SOURCES.ZONE);
    const placeId = String(row.place_id);
    if (!entry.zones.some((p) => p.id === placeId)) {
      entry.zones.push({
        id: placeId,
        label: row.place_label == null ? '' : String(row.place_label),
      });
    }
  }
  return finalizeSpecies(byId);
}

/**
 * « L'espèce X est-elle présente sur la carte Y ? » — et par quels canaux.
 * @returns {Promise<{ present: boolean, sources: string[] }>}
 */
async function getSpeciesPresenceOnMap(db, plantId, mapId) {
  const pid = normalizePlantId(plantId);
  const mid = normalizeId(mapId);
  if (!pid || !mid) return { present: false, sources: [] };
  const row = await db.queryOne(
    `SELECT
       EXISTS(SELECT 1 FROM map_species ms WHERE ms.map_id = ? AND ms.plant_id = ?) AS registre,
       EXISTS(SELECT 1 FROM zone_species zs JOIN zones z ON z.id = zs.zone_id
               WHERE z.map_id = ? AND zs.plant_id = ?) AS zone,
       EXISTS(SELECT 1 FROM marker_species mk JOIN map_markers m ON m.id = mk.marker_id
               WHERE m.map_id = ? AND mk.plant_id = ?) AS repere`,
    [mid, pid, mid, pid, mid, pid],
  );
  const sources = ALL_PRESENCE_SOURCES.filter((s) => Number(row?.[s]) === 1);
  return { present: sources.length > 0, sources };
}

async function isSpeciesPresentOnMap(db, plantId, mapId) {
  return (await getSpeciesPresenceOnMap(db, plantId, mapId)).present;
}

/**
 * Retire des réponses les lieux qu'un lecteur ne voit pas (audience, surface), **sans**
 * toucher à la présence ni à ses canaux : la présence est un fait du site, identique pour
 * tous ; seul le **nom** d'un lieu réservé ne doit pas sortir du serveur.
 *
 * @param {Array<object>} species entrées de `listSpeciesForMap`
 * @param {{ zoneIds?: Iterable<string>|null, markerIds?: Iterable<string>|null }} visible
 *   `null` = aucun filtre sur cette famille
 */
function restrictPresencePlaces(species, { zoneIds = null, markerIds = null } = {}) {
  const zoneSet = zoneIds == null ? null : new Set([...zoneIds].map(String));
  const markerSet = markerIds == null ? null : new Set([...markerIds].map(String));
  return (species || []).map((entry) => ({
    ...entry,
    zones: zoneSet ? entry.zones.filter((p) => zoneSet.has(String(p.id))) : entry.zones,
    markers: markerSet ? entry.markers.filter((p) => markerSet.has(String(p.id))) : entry.markers,
  }));
}

/**
 * Comptes par canal : `total`, un compte par canal (une espèce peut compter dans plusieurs),
 * et `registre_seul` (au registre, placée ni dans une zone ni sur un repère).
 */
function summarizePresence(species) {
  const list = species || [];
  const summary = { total: list.length, registre: 0, zone: 0, repere: 0, registre_seul: 0 };
  for (const entry of list) {
    for (const s of entry.sources) summary[s] += 1;
    if (entry.sources.length === 1 && entry.sources[0] === PRESENCE_SOURCES.REGISTRY) {
      summary.registre_seul += 1;
    }
  }
  return summary;
}

/** Forme publique d'une entrée (API) : champs stables, noms de lieux sous `label`. */
function serializePresenceEntry(entry) {
  return {
    plant_id: entry.plant_id,
    name: entry.name,
    emoji: entry.emoji,
    sources: [...entry.sources],
    validation_status: entry.registry ? entry.registry.validation_status : null,
    zones: entry.zones.map((p) => ({ id: p.id, name: p.label })),
    markers: entry.markers.map((p) => ({ id: p.id, label: p.label })),
  };
}

module.exports = {
  PRESENCE_SOURCES,
  ALL_PRESENCE_SOURCES,
  parsePresenceSources,
  normalizePresenceSources,
  mapPresenceSubquery,
  zonePresenceSubquery,
  listSpeciesForMap,
  listSpeciesForZone,
  getSpeciesPresenceOnMap,
  isSpeciesPresentOnMap,
  restrictPresencePlaces,
  summarizePresence,
  serializePresenceEntry,
};
