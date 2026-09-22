'use strict';

/**
 * Suivi d'individus arbres et mesures (migration 276).
 * - CRUD individu : `individuals.manage` (admin, prof)
 * - Saisie mesures : `individuals.measure` (admin, prof, paliers élève)
 * - Lecture publique des individus actifs et de leur courbe / estimations
 */

const express = require('express');
const { queryAll, queryOne, execute } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const { normalizeOptionalString } = require('../lib/shared/httpHelpers');
const { estimateBiomassCarbon, DISCLAIMER } = require('../lib/individualBiomass');

const router = express.Router();
const manageIndividuals = requirePermission('individuals.manage');
const measureIndividuals = requirePermission('individuals.measure');

function parsePositiveInt(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseOptionalDate(raw) {
  const s = normalizeOptionalString(raw);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function parseOptionalNumber(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

async function loadIndividual(id) {
  return queryOne(
    `SELECT ti.*, p.name AS plant_name, p.emoji AS plant_emoji
       FROM tracked_individuals ti
       JOIN plants p ON p.id = ti.plant_id
      WHERE ti.id = ?`,
    [id],
  );
}

function presentIndividual(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    plant_id: Number(row.plant_id),
    plant_name: row.plant_name || null,
    plant_emoji: row.plant_emoji || null,
    map_id: row.map_id,
    zone_id: row.zone_id || null,
    marker_id: row.marker_id || null,
    label: row.label,
    planted_at: row.planted_at || null,
    wood_density: row.wood_density != null ? Number(row.wood_density) : null,
    is_active: Boolean(row.is_active),
    notes: row.notes || null,
    created_at: row.created_at,
  };
}

function presentMeasurement(row, woodDensity) {
  const estimate = estimateBiomassCarbon({
    circumferenceCm: row.circumference_cm,
    heightM: row.height_m,
    woodDensity,
  });
  return {
    id: Number(row.id),
    individual_id: Number(row.individual_id),
    measured_at: row.measured_at,
    circumference_cm: row.circumference_cm != null ? Number(row.circumference_cm) : null,
    height_m: row.height_m != null ? Number(row.height_m) : null,
    crown_diameter_m: row.crown_diameter_m != null ? Number(row.crown_diameter_m) : null,
    observer_user_id: row.observer_user_id || null,
    group_id: row.group_id || null,
    notes: row.notes || null,
    created_at: row.created_at,
    estimate,
  };
}

/** GET /api/individuals?mapId=&plantId=&active=1 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const mapId = normalizeOptionalString(req.query?.mapId ?? req.query?.map_id);
    const plantId = parsePositiveInt(req.query?.plantId ?? req.query?.plant_id);
    const activeOnly = String(req.query?.active ?? '1') !== '0';
    const where = [];
    const params = [];
    if (mapId) {
      where.push('ti.map_id = ?');
      params.push(mapId);
    }
    if (plantId) {
      where.push('ti.plant_id = ?');
      params.push(plantId);
    }
    if (activeOnly) where.push('ti.is_active = 1');
    const sql = `SELECT ti.*, p.name AS plant_name, p.emoji AS plant_emoji
                   FROM tracked_individuals ti
                   JOIN plants p ON p.id = ti.plant_id
                  ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                  ORDER BY ti.label ASC`;
    const rows = await queryAll(sql, params);
    return res.json({ items: rows.map(presentIndividual), disclaimer: DISCLAIMER });
  }),
);

/** GET /api/individuals/:id */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parsePositiveInt(req.params?.id);
    if (!id) return res.status(400).json({ error: 'Identifiant invalide' });
    const row = await loadIndividual(id);
    if (!row) return res.status(404).json({ error: 'Individu introuvable' });
    const measurements = await queryAll(
      `SELECT * FROM individual_measurements WHERE individual_id = ? ORDER BY measured_at ASC, id ASC`,
      [id],
    );
    const woodDensity = row.wood_density != null ? Number(row.wood_density) : null;
    return res.json({
      ...presentIndividual(row),
      measurements: measurements.map((m) => presentMeasurement(m, woodDensity)),
      disclaimer: DISCLAIMER,
    });
  }),
);

/** POST /api/individuals — créer depuis un repère / une zone. */
router.post(
  '/',
  manageIndividuals,
  asyncHandler(async (req, res) => {
    const plantId = parsePositiveInt(req.body?.plant_id ?? req.body?.plantId);
    const mapId = normalizeOptionalString(req.body?.map_id ?? req.body?.mapId);
    const label = normalizeOptionalString(req.body?.label);
    const zoneId = normalizeOptionalString(req.body?.zone_id ?? req.body?.zoneId) || null;
    const markerId = normalizeOptionalString(req.body?.marker_id ?? req.body?.markerId) || null;
    const plantedAt = parseOptionalDate(req.body?.planted_at ?? req.body?.plantedAt);
    const woodDensity = parseOptionalNumber(req.body?.wood_density ?? req.body?.woodDensity);
    const notes = normalizeOptionalString(req.body?.notes) || null;

    if (!plantId) return res.status(400).json({ error: 'plant_id requis' });
    if (!mapId) return res.status(400).json({ error: 'map_id requis' });
    if (!label) return res.status(400).json({ error: 'label requis' });
    if (Number.isNaN(woodDensity)) {
      return res.status(400).json({ error: 'wood_density invalide' });
    }

    const plant = await queryOne('SELECT id FROM plants WHERE id = ?', [plantId]);
    if (!plant) return res.status(400).json({ error: 'Espèce introuvable' });
    const map = await queryOne('SELECT id FROM maps WHERE id = ?', [mapId]);
    if (!map) return res.status(400).json({ error: 'Carte introuvable' });
    if (zoneId) {
      const zone = await queryOne('SELECT id FROM zones WHERE id = ? AND map_id = ?', [
        zoneId,
        mapId,
      ]);
      if (!zone) return res.status(400).json({ error: 'Zone introuvable sur cette carte' });
    }
    if (markerId) {
      const marker = await queryOne('SELECT id FROM map_markers WHERE id = ? AND map_id = ?', [
        markerId,
        mapId,
      ]);
      if (!marker) return res.status(400).json({ error: 'Repère introuvable sur cette carte' });
    }

    const result = await execute(
      `INSERT INTO tracked_individuals
         (plant_id, map_id, zone_id, marker_id, label, planted_at, wood_density, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        plantId,
        mapId,
        zoneId,
        markerId,
        label,
        plantedAt,
        woodDensity == null ? null : woodDensity,
        notes,
      ],
    );
    const row = await loadIndividual(result.insertId);
    return res.status(201).json(presentIndividual(row));
  }),
);

/** PUT /api/individuals/:id */
router.put(
  '/:id',
  manageIndividuals,
  asyncHandler(async (req, res) => {
    const id = parsePositiveInt(req.params?.id);
    if (!id) return res.status(400).json({ error: 'Identifiant invalide' });
    const current = await loadIndividual(id);
    if (!current) return res.status(404).json({ error: 'Individu introuvable' });

    const label = normalizeOptionalString(req.body?.label) || current.label;
    const plantedAt =
      req.body?.planted_at === undefined && req.body?.plantedAt === undefined
        ? current.planted_at
        : parseOptionalDate(req.body?.planted_at ?? req.body?.plantedAt);
    if (
      (req.body?.planted_at != null || req.body?.plantedAt != null) &&
      req.body?.planted_at !== '' &&
      req.body?.plantedAt !== '' &&
      plantedAt == null &&
      (req.body?.planted_at || req.body?.plantedAt)
    ) {
      return res.status(400).json({ error: 'planted_at invalide (AAAA-MM-JJ)' });
    }
    let woodDensity = current.wood_density;
    if (req.body?.wood_density !== undefined || req.body?.woodDensity !== undefined) {
      woodDensity = parseOptionalNumber(req.body?.wood_density ?? req.body?.woodDensity);
      if (Number.isNaN(woodDensity)) {
        return res.status(400).json({ error: 'wood_density invalide' });
      }
    }
    const notes =
      req.body?.notes === undefined
        ? current.notes
        : normalizeOptionalString(req.body.notes) || null;
    const isActive =
      req.body?.is_active !== undefined || req.body?.isActive !== undefined
        ? Boolean(req.body?.is_active ?? req.body?.isActive)
        : Boolean(current.is_active);
    const zoneId =
      req.body?.zone_id !== undefined || req.body?.zoneId !== undefined
        ? normalizeOptionalString(req.body?.zone_id ?? req.body?.zoneId) || null
        : current.zone_id;
    const markerId =
      req.body?.marker_id !== undefined || req.body?.markerId !== undefined
        ? normalizeOptionalString(req.body?.marker_id ?? req.body?.markerId) || null
        : current.marker_id;

    await execute(
      `UPDATE tracked_individuals
          SET label = ?, planted_at = ?, wood_density = ?, notes = ?, is_active = ?,
              zone_id = ?, marker_id = ?
        WHERE id = ?`,
      [label, plantedAt, woodDensity, notes, isActive ? 1 : 0, zoneId, markerId, id],
    );
    const row = await loadIndividual(id);
    return res.json(presentIndividual(row));
  }),
);

/** DELETE /api/individuals/:id */
router.delete(
  '/:id',
  manageIndividuals,
  asyncHandler(async (req, res) => {
    const id = parsePositiveInt(req.params?.id);
    if (!id) return res.status(400).json({ error: 'Identifiant invalide' });
    const current = await queryOne('SELECT id FROM tracked_individuals WHERE id = ?', [id]);
    if (!current) return res.status(404).json({ error: 'Individu introuvable' });
    await execute('DELETE FROM tracked_individuals WHERE id = ?', [id]);
    return res.json({ ok: true });
  }),
);

/** POST /api/individuals/:id/measurements — saisie élève / prof. */
router.post(
  '/:id/measurements',
  measureIndividuals,
  asyncHandler(async (req, res) => {
    const id = parsePositiveInt(req.params?.id);
    if (!id) return res.status(400).json({ error: 'Identifiant invalide' });
    const individual = await loadIndividual(id);
    if (!individual) return res.status(404).json({ error: 'Individu introuvable' });

    const measuredAt = parseOptionalDate(req.body?.measured_at ?? req.body?.measuredAt);
    if (!measuredAt) {
      return res.status(400).json({ error: 'measured_at requis (AAAA-MM-JJ)' });
    }
    const circumference = parseOptionalNumber(
      req.body?.circumference_cm ?? req.body?.circumferenceCm,
    );
    const height = parseOptionalNumber(req.body?.height_m ?? req.body?.heightM);
    const crown = parseOptionalNumber(req.body?.crown_diameter_m ?? req.body?.crownDiameterM);
    if ([circumference, height, crown].some((n) => Number.isNaN(n))) {
      return res.status(400).json({ error: 'Valeur numérique invalide' });
    }
    if (circumference == null && height == null && crown == null) {
      return res.status(400).json({
        error: 'Renseigner au moins une mesure (circonférence, hauteur ou couronne)',
      });
    }
    const notes = normalizeOptionalString(req.body?.notes) || null;
    const groupId = normalizeOptionalString(req.body?.group_id ?? req.body?.groupId) || null;

    const result = await execute(
      `INSERT INTO individual_measurements
         (individual_id, measured_at, circumference_cm, height_m, crown_diameter_m,
          observer_user_id, group_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, measuredAt, circumference, height, crown, req.auth?.userId || null, groupId, notes],
    );
    const row = await queryOne('SELECT * FROM individual_measurements WHERE id = ?', [
      result.insertId,
    ]);
    return res
      .status(201)
      .json(
        presentMeasurement(
          row,
          individual.wood_density != null ? Number(individual.wood_density) : null,
        ),
      );
  }),
);

/** DELETE /api/individuals/:id/measurements/:measurementId */
router.delete(
  '/:id/measurements/:measurementId',
  manageIndividuals,
  asyncHandler(async (req, res) => {
    const id = parsePositiveInt(req.params?.id);
    const mid = parsePositiveInt(req.params?.measurementId);
    const row = await queryOne(
      'SELECT id FROM individual_measurements WHERE id = ? AND individual_id = ?',
      [mid, id],
    );
    if (!row) return res.status(404).json({ error: 'Mesure introuvable' });
    await execute('DELETE FROM individual_measurements WHERE id = ?', [mid]);
    return res.json({ ok: true });
  }),
);

module.exports = router;
