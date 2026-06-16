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
  };
}

async function loadFeuilletStates(deps, gameId, teamId) {
  const rows = await deps.queryAll(
    `SELECT feuillet_code, status, effacement_pct, unlocked_via, kingdom_zone_id,
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
       discovered_at, read_at, held_at, effaced_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       effacement_pct = VALUES(effacement_pct),
       unlocked_via = COALESCE(VALUES(unlocked_via), unlocked_via),
       kingdom_zone_id = COALESCE(VALUES(kingdom_zone_id), kingdom_zone_id),
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
      discoveredAt,
      readAt,
      heldAt,
      effacedAt,
    ],
  );
}

module.exports = {
  FEUILLET_SELECT,
  FEUILLET_ZONE_ORDER_SQL,
  formatFeuilletRow,
  loadFeuilletStates,
  findFeuilletsForZone,
  upsertFeuilletState,
};
