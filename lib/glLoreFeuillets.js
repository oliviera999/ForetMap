'use strict';

const FEUILLET_ZONE_ORDER_SQL = `
  ORDER BY f.ordre_voyage ASC,
           COALESCE(f.lien_ordre_recit, 999999) ASC,
           f.ordre_liasse ASC,
           f.feuillet_code ASC`;

const FEUILLET_SELECT = `
  f.feuillet_code, f.legacy_id, f.type, f.liasse, f.titre, f.incipit, f.biome_slug,
  f.plateau_number, f.zone_label, f.visage_label, f.kingdom_zone_id,
  f.ordre_voyage, f.ordre_liasse, f.ordre_recit, f.mode_apparition,
  f.usage_note, f.lisibilite, f.effacement, f.vierge, f.vitesse_effacement,
  f.repalissement, f.tenir, f.cout_gemme, f.gain_coeur, f.themes,
  f.ancrage_scientifique, f.references_scientifiques, f.lien_qcm_biome,
  f.lien_canal, f.lien_ref, f.lien_pays, f.lien_ordre_recit, f.lien_note,
  f.signature, f.idee_cle, f.contexte, f.texte_accessible, f.texte,
  f.image_url, f.image_coupe_url, f.statut
`;

function formatFeuilletRow(row, options = {}) {
  if (!row) return null;
  const isMj = options.isMj === true;
  const preferAccessible = options.preferAccessible !== false && !isMj;
  const effacementPct = Number(options.effacementPct) || 0;
  const { maskFeuilletText } = require('./glLoreFeuilletEffects');
  let displayText = preferAccessible && row.texte_accessible ? row.texte_accessible : row.texte;
  if (effacementPct > 0) {
    displayText = maskFeuilletText(displayText, effacementPct);
  }
  return {
    feuilletCode: row.feuillet_code,
    legacyId: row.legacy_id != null ? Number(row.legacy_id) : null,
    type: row.type,
    liasse: row.liasse,
    titre: row.titre,
    incipit: row.incipit,
    biomeSlug: row.biome_slug,
    plateauNumber: row.plateau_number != null ? Number(row.plateau_number) : null,
    zoneLabel: row.zone_label,
    visageLabel: row.visage_label,
    kingdomZoneId: row.kingdom_zone_id != null ? Number(row.kingdom_zone_id) : null,
    ordreVoyage: Number(row.ordre_voyage) || 0,
    ordreLiasse: Number(row.ordre_liasse) || 0,
    ordreRecit: Number(row.ordre_recit) || 0,
    modeApparition: row.mode_apparition,
    usageNote: row.usage_note,
    lisibilite: row.lisibilite,
    effacement: row.effacement,
    vierge: !!row.vierge,
    vitesseEffacement: row.vitesse_effacement,
    repalissement: row.repalissement,
    tenir: row.tenir,
    coutGemme: Number(row.cout_gemme) || 0,
    gainCoeur: Number(row.gain_coeur) || 0,
    themes: row.themes,
    ancrageScientifique: row.ancrage_scientifique,
    referencesScientifiques: row.references_scientifiques,
    lienQcmBiome: row.lien_qcm_biome,
    lienCanal: row.lien_canal || null,
    lienRef: row.lien_ref || null,
    lienPays: row.lien_pays != null ? Number(row.lien_pays) : null,
    lienOrdreRecit: row.lien_ordre_recit != null ? Number(row.lien_ordre_recit) : null,
    lienNote: row.lien_note || null,
    signature: row.signature,
    ideeCle: row.idee_cle,
    contexte: row.contexte,
    texteAccessible: row.texte_accessible,
    texte: isMj ? row.texte : undefined,
    imageUrl: row.image_url || null,
    imageCoupeUrl: row.image_coupe_url || null,
    displayText,
    statut: row.statut,
    progressStatus: options.progressStatus || null,
    effacementPct,
    discoveredBy: options.discoveredBy || null,
    discoveredByPlayerId: options.discoveredByPlayerId || null,
    discoveredSource: options.discoveredSource || null,
  };
}

async function loadFeuilletStates(deps, gameId, teamId) {
  const rows = await deps.queryAll(
    `SELECT feuillet_code, status, effacement_pct, unlocked_via, kingdom_zone_id,
            discovered_by_player_id, discovered_by_name, discovered_source,
            discovered_at, read_at, held_at, effaced_at
       FROM gl_game_feuillet_states
      WHERE game_id = ? AND team_id = ?`,
    [gameId, teamId],
  );
  const map = new Map();
  for (const row of rows) {
    map.set(String(row.feuillet_code), row);
  }
  return map;
}

/** Statuts d'un feuillet considérés comme « trouvé » (donc consultable par le joueur). */
const FEUILLET_FOUND_STATUSES = new Set(['discovered', 'read', 'held', 'effaced']);

function isFeuilletFound(status) {
  return FEUILLET_FOUND_STATUSES.has(String(status || ''));
}

/**
 * Slugs de biomes accessibles à un joueur = biomes des chapitres de toutes les parties
 * (live/paused/ended) auxquelles il a participé. Sert à scoper la liste du carnet.
 */
async function resolveAccessiblePlayerBiomes(deps, playerId) {
  const rows = await deps.queryAll(
    `SELECT DISTINCT cb.biome_slug
       FROM gl_team_members tm
       JOIN gl_games g ON g.id = tm.game_id
       JOIN gl_chapter_biomes cb ON cb.chapter_id = g.chapter_id
      WHERE tm.player_id = ?
        AND g.status IN ('live', 'paused', 'ended')`,
    [playerId],
  );
  return rows.map((r) => String(r.biome_slug)).filter(Boolean);
}

/**
 * États de feuillets « trouvés » par un joueur, agrégés sur toutes ses équipes/parties.
 * Un feuillet reste consultable une fois trouvé, même dans une autre partie. En cas
 * d'états multiples, on garde le moins effacé (le plus lisible).
 * @returns {Promise<Map<string,{status:string, effacement_pct:number}>>}
 */
async function loadPlayerFeuilletStates(deps, playerId) {
  const rows = await deps.queryAll(
    `SELECT s.feuillet_code, s.status, s.effacement_pct,
            s.discovered_by_name, s.discovered_by_player_id, s.discovered_source
       FROM gl_game_feuillet_states s
       JOIN gl_team_members tm ON tm.game_id = s.game_id AND tm.team_id = s.team_id
      WHERE tm.player_id = ?`,
    [playerId],
  );
  const map = new Map();
  for (const row of rows) {
    if (!isFeuilletFound(row.status)) continue;
    const code = String(row.feuillet_code);
    const pct = Number(row.effacement_pct) || 0;
    const prev = map.get(code);
    if (!prev || pct < prev.effacement_pct) {
      map.set(code, {
        status: row.status,
        effacement_pct: pct,
        discovered_by_name: row.discovered_by_name || null,
        discovered_by_player_id: row.discovered_by_player_id || null,
        discovered_source: row.discovered_source || null,
      });
    }
  }
  return map;
}

async function findFeuilletsForZone(deps, { zoneId, zoneLabel, plateauNumber, biomeSlugs = [] }) {
  const params = [zoneId];
  const orParts = ['f.kingdom_zone_id = ?'];
  if (zoneLabel) {
    orParts.push(
      '(f.zone_label = ? AND (f.plateau_number IS NULL OR f.plateau_number = ? OR ? = 0))',
    );
    params.push(zoneLabel, plateauNumber || 0, plateauNumber || 0);
  }
  if (biomeSlugs.length > 0) {
    orParts.push(`f.biome_slug IN (${biomeSlugs.map(() => '?').join(', ')})`);
    params.push(...biomeSlugs);
  }
  const sql = `
    SELECT ${FEUILLET_SELECT}
      FROM gl_lore_feuillets f
     WHERE f.statut = 'actif'
       AND (${orParts.join(' OR ')})
     ${FEUILLET_ZONE_ORDER_SQL}`;
  return deps.queryAll(sql, params);
}

async function upsertFeuilletState(
  deps,
  {
    gameId,
    teamId,
    feuilletCode,
    status,
    effacementPct = 0,
    unlockedVia = null,
    kingdomZoneId = null,
    discoveredByPlayerId = null,
    discoveredByName = null,
    discoveredSource = null,
  },
) {
  const existing = await deps.queryOne(
    `SELECT status, discovered_at, read_at, held_at, effaced_at
       FROM gl_game_feuillet_states
      WHERE game_id = ? AND team_id = ? AND feuillet_code = ? LIMIT 1`,
    [gameId, teamId, feuilletCode],
  );
  const now = new Date();
  const discoveredAt =
    status === 'discovered' && !existing?.discovered_at ? now : existing?.discovered_at || null;
  const readAt = status === 'read' ? now : existing?.read_at || null;
  const heldAt = status === 'held' ? now : existing?.held_at || null;
  const effacedAt = status === 'effaced' ? now : existing?.effaced_at || null;

  await deps.execute(
    `INSERT INTO gl_game_feuillet_states (
       game_id, team_id, feuillet_code, status, effacement_pct, unlocked_via, kingdom_zone_id,
       discovered_by_player_id, discovered_by_name, discovered_source,
       discovered_at, read_at, held_at, effaced_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       effacement_pct = VALUES(effacement_pct),
       unlocked_via = COALESCE(VALUES(unlocked_via), unlocked_via),
       kingdom_zone_id = COALESCE(VALUES(kingdom_zone_id), kingdom_zone_id),
       -- Attribution posée une seule fois (au premier découvreur) : COALESCE(existant, nouveau).
       discovered_by_player_id = COALESCE(discovered_by_player_id, VALUES(discovered_by_player_id)),
       discovered_by_name = COALESCE(discovered_by_name, VALUES(discovered_by_name)),
       discovered_source = COALESCE(discovered_source, VALUES(discovered_source)),
       discovered_at = COALESCE(discovered_at, VALUES(discovered_at)),
       read_at = COALESCE(read_at, VALUES(read_at)),
       held_at = COALESCE(held_at, VALUES(held_at)),
       effaced_at = COALESCE(effaced_at, VALUES(effaced_at)),
       updated_at = NOW()`,
    [
      gameId,
      teamId,
      feuilletCode,
      status,
      effacementPct,
      unlockedVia,
      kingdomZoneId,
      discoveredByPlayerId,
      discoveredByName,
      discoveredSource,
      discoveredAt,
      readAt,
      heldAt,
      effacedAt,
    ],
  );
}

/**
 * Colonnes d'un feuillet modifiables depuis l'éditeur admin (carnet de Sélène).
 * `feuillet_code` (PK) et `kingdom_zone_id` (route dédiée) en sont exclus, ainsi
 * que les horodatages gérés par la base.
 */
const FEUILLET_EDITABLE_COLUMNS = [
  'legacy_id',
  'type',
  'liasse',
  'titre',
  'incipit',
  'biome_slug',
  'plateau_number',
  'zone_label',
  'visage_label',
  'ordre_voyage',
  'ordre_liasse',
  'ordre_recit',
  'mode_apparition',
  'usage_note',
  'lisibilite',
  'effacement',
  'vierge',
  'vitesse_effacement',
  'repalissement',
  'tenir',
  'cout_gemme',
  'gain_coeur',
  'themes',
  'ancrage_scientifique',
  'references_scientifiques',
  'lien_qcm_biome',
  'lien_canal',
  'lien_ref',
  'lien_pays',
  'lien_ordre_recit',
  'lien_note',
  'signature',
  'idee_cle',
  'contexte',
  'texte_accessible',
  'texte',
  'image_url',
  'image_coupe_url',
  'statut',
];

/**
 * Met à jour un feuillet existant (édition unitaire admin). Contrairement à
 * l'upsert d'import, chaque colonne éditable est écrasée telle quelle (pas de
 * COALESCE) : vider un champ dans le formulaire vide bien la valeur en base.
 * @param {{ execute: Function }} deps
 * @param {string} code feuillet_code (clé)
 * @param {object} payload valeurs canoniques (cf. buildFeuilletPayload)
 */
async function updateFeuilletFields(deps, code, payload) {
  const setSql = FEUILLET_EDITABLE_COLUMNS.map((col) => `${col} = ?`).join(', ');
  const params = FEUILLET_EDITABLE_COLUMNS.map((col) =>
    payload[col] === undefined ? null : payload[col],
  );
  params.push(code);
  return deps.execute(
    `UPDATE gl_lore_feuillets SET ${setSql}, updated_at = NOW() WHERE feuillet_code = ?`,
    params,
  );
}

module.exports = {
  FEUILLET_SELECT,
  FEUILLET_ZONE_ORDER_SQL,
  FEUILLET_EDITABLE_COLUMNS,
  FEUILLET_FOUND_STATUSES,
  isFeuilletFound,
  formatFeuilletRow,
  loadFeuilletStates,
  resolveAccessiblePlayerBiomes,
  loadPlayerFeuilletStates,
  findFeuilletsForZone,
  upsertFeuilletState,
  updateFeuilletFields,
};
