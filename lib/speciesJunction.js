'use strict';

function normalizeNames(names) {
  return [...new Set((names || []).map((n) => String(n || '').trim()).filter(Boolean))];
}

function normalizePlantIds(plantIds) {
  return [
    ...new Set(
      (plantIds || []).map((id) => Number(id)).filter((n) => Number.isInteger(n) && n > 0),
    ),
  ];
}

function speciesReadFromJunctionEnabled() {
  const raw = String(process.env.FORETMAP_SPECIES_READ_JUNCTION ?? '1').trim();
  return raw !== '0' && raw.toLowerCase() !== 'false';
}

function normalizeLivingBeingsJson(input, legacySingleName = '') {
  const base = Array.isArray(input)
    ? input
    : typeof input === 'string' && input.trim()
      ? (() => {
          try {
            const parsed = JSON.parse(input);
            if (Array.isArray(parsed)) return parsed;
          } catch (_) {
            /* legacy CSV */
          }
          return input.split(',');
        })()
      : [];
  const cleaned = normalizeNames(base);
  if (cleaned.length === 0 && legacySingleName && String(legacySingleName).trim()) {
    return [String(legacySingleName).trim()];
  }
  return cleaned;
}

/**
 * Liste d'êtres vivants : junction en priorité (si activée), sinon JSON legacy.
 */
function livingBeingsListFromSpecies(speciesRows, jsonFallback, legacySingleName = '') {
  const fromJson = normalizeLivingBeingsJson(jsonFallback, legacySingleName);
  if (!speciesReadFromJunctionEnabled()) return fromJson;
  const fromJunction = (speciesRows || [])
    .map((row) => String(row.name || '').trim())
    .filter(Boolean);
  return fromJunction.length > 0 ? fromJunction : fromJson;
}

async function resolvePlantNamesByIds(db, plantIds) {
  const ids = normalizePlantIds(plantIds);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db.queryAll(
    `SELECT id, name FROM plants WHERE id IN (${placeholders}) ORDER BY name ASC`,
    ids,
  );
  return rows.map((row) => String(row.name || '').trim()).filter(Boolean);
}

/**
 * Résout des identifiants plante à partir de noms (plants.name + plant_name_aliases).
 */
async function resolvePlantIdsByNames(db, names) {
  const cleaned = normalizeNames(names);
  if (cleaned.length === 0) return [];

  const placeholders = cleaned.map(() => '?').join(', ');
  const byName = await db.queryAll(
    `SELECT id, name FROM plants WHERE name IN (${placeholders})`,
    cleaned,
  );
  const byAlias = await db.queryAll(
    `SELECT p.id, p.name, a.alias
       FROM plant_name_aliases a
       JOIN plants p ON p.id = a.plant_id
      WHERE a.alias IN (${placeholders})`,
    cleaned,
  );

  const nameToId = new Map();
  for (const row of [...byName, ...byAlias]) {
    const id = Number(row.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    nameToId.set(String(row.name || '').trim(), id);
    if (row.alias) nameToId.set(String(row.alias).trim(), id);
  }

  const ordered = [];
  const seen = new Set();
  for (const name of cleaned) {
    const id = nameToId.get(name);
    if (id && !seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }
  return ordered;
}

async function resolveSpeciesSyncPayload(db, { plantIds, livingBeingsNames }) {
  let ids = normalizePlantIds(plantIds);
  let names = normalizeNames(livingBeingsNames);

  if (ids.length === 0 && names.length > 0) {
    ids = await resolvePlantIdsByNames(db, names);
  }
  if (names.length === 0 && ids.length > 0) {
    names = await resolvePlantNamesByIds(db, ids);
  }

  return { plantIds: ids, livingBeingsNames: names };
}

async function loadZoneSpeciesMap(db, zoneIds) {
  const ids = [...new Set((zoneIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const map = new Map();
  if (ids.length === 0) return map;

  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db.queryAll(
    `SELECT zs.zone_id, p.id, p.name, p.emoji
       FROM zone_species zs
       JOIN plants p ON p.id = zs.plant_id
      WHERE zs.zone_id IN (${placeholders})
      ORDER BY p.name ASC`,
    ids,
  );
  for (const row of rows) {
    const key = String(row.zone_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ id: row.id, name: row.name, emoji: row.emoji || '' });
  }
  return map;
}

async function loadMarkerSpeciesMap(db, markerIds) {
  const ids = [...new Set((markerIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const map = new Map();
  if (ids.length === 0) return map;

  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db.queryAll(
    `SELECT ms.marker_id, p.id, p.name, p.emoji
       FROM marker_species ms
       JOIN plants p ON p.id = ms.plant_id
      WHERE ms.marker_id IN (${placeholders})
      ORDER BY p.name ASC`,
    ids,
  );
  for (const row of rows) {
    const key = String(row.marker_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ id: row.id, name: row.name, emoji: row.emoji || '' });
  }
  return map;
}

async function loadTaskSpeciesMap(db, taskIds) {
  const ids = [...new Set((taskIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const map = new Map();
  if (ids.length === 0) return map;
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db.queryAll(
    `SELECT ts.task_id, p.id, p.name, p.emoji
       FROM task_species ts
       JOIN plants p ON p.id = ts.plant_id
      WHERE ts.task_id IN (${placeholders})
      ORDER BY p.name ASC`,
    ids,
  );
  for (const row of rows) {
    const key = String(row.task_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ id: row.id, name: row.name, emoji: row.emoji || '' });
  }
  return map;
}

function attachSpeciesToEntity(entity, speciesRows, options = {}) {
  const legacySingleName = options.legacySingleName != null ? String(options.legacySingleName) : '';
  const species = (speciesRows || []).map((row) => ({
    id: row.id,
    name: row.name,
    emoji: row.emoji || '',
  }));
  const living_beings_list = livingBeingsListFromSpecies(
    speciesRows,
    entity?.living_beings,
    legacySingleName,
  );
  const next = {
    ...entity,
    species_ids: species.map((s) => s.id),
    species,
    living_beings_list,
  };
  delete next.living_beings;
  return next;
}

async function runSpeciesSync(db, { table, entityColumn, entityId, plantIds, livingBeingsNames }) {
  const { plantIds: ids, livingBeingsNames: names } = await resolveSpeciesSyncPayload(db, {
    plantIds,
    livingBeingsNames,
  });

  const sync = async (tx) => {
    await tx.execute(`DELETE FROM ${table} WHERE ${entityColumn} = ?`, [entityId]);
    for (const plantId of ids) {
      await tx.execute(`INSERT INTO ${table} (${entityColumn}, plant_id) VALUES (?, ?)`, [
        entityId,
        plantId,
      ]);
    }
  };

  if (typeof db.withTransaction === 'function') {
    await db.withTransaction(sync);
  } else {
    await sync(db);
  }

  return { plantIds: ids, livingBeingsNames: names };
}

async function syncZoneSpecies(db, zoneId, plantIds, livingBeingsNames) {
  return runSpeciesSync(db, {
    table: 'zone_species',
    entityColumn: 'zone_id',
    entityId: zoneId,
    plantIds,
    livingBeingsNames,
  });
}

async function syncMarkerSpecies(db, markerId, plantIds, livingBeingsNames) {
  return runSpeciesSync(db, {
    table: 'marker_species',
    entityColumn: 'marker_id',
    entityId: markerId,
    plantIds,
    livingBeingsNames,
  });
}

async function syncTaskSpecies(db, taskId, plantIds, livingBeingsNames) {
  return runSpeciesSync(db, {
    table: 'task_species',
    entityColumn: 'task_id',
    entityId: taskId,
    plantIds,
    livingBeingsNames,
  });
}

function normalizeMapIds(mapIds) {
  return [...new Set((mapIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
}

/**
 * Inventaire « présentes sur cette carte » : zones + repères + rattachement direct.
 * Sous-requête SQL avec 3 placeholders `map_id` (dans cet ordre).
 */
function mapPresencePlantIdsSubquery() {
  return `(
    SELECT zs.plant_id
      FROM zone_species zs
      JOIN zones z ON z.id = zs.zone_id
     WHERE z.map_id = ?
    UNION
    SELECT ms.plant_id
      FROM marker_species ms
      JOIN map_markers m ON m.id = ms.marker_id
     WHERE m.map_id = ?
    UNION
    SELECT plant_id FROM map_species WHERE map_id = ?
  )`;
}

/** map_id → [{ id, name, emoji }, ...] */
async function loadMapSpeciesMap(db, mapIds) {
  const ids = normalizeMapIds(mapIds);
  const map = new Map();
  if (ids.length === 0) return map;

  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db.queryAll(
    `SELECT ms.map_id, p.id, p.name, p.emoji
       FROM map_species ms
       JOIN plants p ON p.id = ms.plant_id
      WHERE ms.map_id IN (${placeholders})
      ORDER BY p.name ASC`,
    ids,
  );
  for (const row of rows) {
    const key = String(row.map_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ id: row.id, name: row.name, emoji: row.emoji || '' });
  }
  return map;
}

/** plant_id → [map_id, ...] triés */
async function loadPlantMapIdsMap(db, plantIds) {
  const ids = normalizePlantIds(plantIds);
  const map = new Map();
  if (ids.length === 0) return map;

  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db.queryAll(
    `SELECT plant_id, map_id
       FROM map_species
      WHERE plant_id IN (${placeholders})
      ORDER BY map_id ASC`,
    ids,
  );
  for (const row of rows) {
    const key = Number(row.plant_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(String(row.map_id));
  }
  return map;
}

/** plant_id → { [map_id]: site_notes } (notes non vides uniquement) */
async function loadPlantMapSiteNotesMap(db, plantIds) {
  const ids = normalizePlantIds(plantIds);
  const map = new Map();
  if (ids.length === 0) return map;

  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db.queryAll(
    `SELECT plant_id, map_id, site_notes
       FROM map_species
      WHERE plant_id IN (${placeholders})
        AND site_notes IS NOT NULL
        AND TRIM(site_notes) <> ''
      ORDER BY map_id ASC`,
    ids,
  );
  for (const row of rows) {
    const key = Number(row.plant_id);
    if (!map.has(key)) map.set(key, {});
    map.get(key)[String(row.map_id)] = String(row.site_notes || '').trim();
  }
  return map;
}

async function resolveExistingMapIds(db, mapIds) {
  const requested = normalizeMapIds(mapIds);
  if (requested.length === 0 || typeof db.queryAll !== 'function') return requested;
  const placeholders = requested.map(() => '?').join(', ');
  const rows = await db.queryAll(`SELECT id FROM maps WHERE id IN (${placeholders})`, requested);
  const existing = new Set((rows || []).map((row) => String(row.id)));
  return requested.filter((mapId) => existing.has(mapId));
}

async function syncPlantMaps(db, plantId, mapIds) {
  const id = Number(plantId);
  if (!Number.isInteger(id) || id <= 0) {
    return { mapIds: [] };
  }
  const requested = normalizeMapIds(mapIds);

  const sync = async (tx) => {
    // Filtrer avant le DELETE : un id inconnu ne doit ni casser la FK
    // ni laisser la table vide après un DELETE déjà commité.
    // Préserver site_notes (et métadonnées de ligne) pour les cartes conservées.
    const maps = await resolveExistingMapIds(tx, requested);
    const prevRows = await tx.queryAll(
      'SELECT map_id, site_notes FROM map_species WHERE plant_id = ?',
      [id],
    );
    const notesByMap = new Map();
    for (const row of prevRows || []) {
      const mid = String(row.map_id || '');
      if (!mid) continue;
      const notes = row.site_notes != null ? String(row.site_notes) : null;
      if (notes != null && notes.trim() !== '') notesByMap.set(mid, notes);
    }
    await tx.execute('DELETE FROM map_species WHERE plant_id = ?', [id]);
    for (const mapId of maps) {
      const notes = notesByMap.get(mapId) || null;
      await tx.execute('INSERT INTO map_species (map_id, plant_id, site_notes) VALUES (?, ?, ?)', [
        mapId,
        id,
        notes,
      ]);
    }
    return maps;
  };

  const maps =
    typeof db.withTransaction === 'function' ? await db.withTransaction(sync) : await sync(db);

  return { mapIds: maps };
}

async function upsertMapSpeciesSiteNotes(db, plantId, mapId, siteNotes) {
  const id = Number(plantId);
  const mid = String(mapId || '').trim();
  if (!Number.isInteger(id) || id <= 0 || !mid) {
    return { ok: false, error: 'Identifiants invalides' };
  }
  const notes =
    siteNotes == null || String(siteNotes).trim() === '' ? null : String(siteNotes).trim();
  const plant = await db.queryOne('SELECT id FROM plants WHERE id = ? LIMIT 1', [id]);
  if (!plant) return { ok: false, error: 'Plante introuvable', status: 404 };
  const map = await db.queryOne('SELECT id FROM maps WHERE id = ? LIMIT 1', [mid]);
  if (!map) return { ok: false, error: 'Carte introuvable', status: 404 };
  const existing = await db.queryOne(
    'SELECT map_id FROM map_species WHERE plant_id = ? AND map_id = ? LIMIT 1',
    [id, mid],
  );
  if (existing) {
    await db.execute('UPDATE map_species SET site_notes = ? WHERE plant_id = ? AND map_id = ?', [
      notes,
      id,
      mid,
    ]);
  } else {
    await db.execute('INSERT INTO map_species (map_id, plant_id, site_notes) VALUES (?, ?, ?)', [
      mid,
      id,
      notes,
    ]);
  }
  return { ok: true, map_id: mid, plant_id: id, site_notes: notes };
}

module.exports = {
  resolvePlantIdsByNames,
  resolvePlantNamesByIds,
  resolveSpeciesSyncPayload,
  loadZoneSpeciesMap,
  loadMarkerSpeciesMap,
  loadTaskSpeciesMap,
  loadMapSpeciesMap,
  loadPlantMapIdsMap,
  loadPlantMapSiteNotesMap,
  syncZoneSpecies,
  syncMarkerSpecies,
  syncTaskSpecies,
  syncPlantMaps,
  upsertMapSpeciesSiteNotes,
  mapPresencePlantIdsSubquery,
  normalizeMapIds,
  attachSpeciesToEntity,
  livingBeingsListFromSpecies,
  normalizeLivingBeingsJson,
  speciesReadFromJunctionEnabled,
};
