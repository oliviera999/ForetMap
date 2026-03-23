const express = require('express');
const { queryAll, queryOne, execute } = require('../database');
const { requireTeacher } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const { emitGardenChanged } = require('../lib/realtime');

const router = express.Router();
const PHOTO_FIELDS = [
  'photo',
  'photo_species',
  'photo_leaf',
  'photo_flower',
  'photo_fruit',
  'photo_harvest_part',
];
const PLANT_EXTRA_FIELDS = [
  'second_name',
  'scientific_name',
  'group_1',
  'group_2',
  'group_3',
  'habitat',
  ...PHOTO_FIELDS,
  'nutrition',
  'agroecosystem_category',
  'longevity',
  'remark_1',
  'remark_2',
  'remark_3',
  'reproduction',
  'size',
  'sources',
  'ideal_temperature_c',
  'optimal_ph',
  'ecosystem_role',
  'geographic_origin',
  'human_utility',
  'harvest_part',
  'planting_recommendations',
  'preferred_nutrients',
];
const PLANT_COLUMNS = ['name', 'emoji', 'description', ...PLANT_EXTRA_FIELDS];

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function asOptionalText(value) {
  const s = asTrimmedString(value);
  return s.length > 0 ? s : null;
}

function parseLinkCandidates(value) {
  const raw = asTrimmedString(value);
  if (!raw) return [];
  return raw
    .split(/\n|,\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isDirectImageUrl(url) {
  const path = (url?.pathname || '').toLowerCase();
  if (/\.(avif|bmp|gif|jpe?g|png|svg|webp)$/.test(path)) return true;
  if (/\/wiki\/special:filepath\//.test(path)) return true;
  return false;
}

function validateHttpsPhotoLinks(body = {}) {
  for (const field of PHOTO_FIELDS) {
    if (!hasOwn(body, field)) continue;
    const raw = asTrimmedString(body[field]);
    if (!raw) continue;
    const links = parseLinkCandidates(raw);
    for (const link of links) {
      let url;
      try {
        url = new URL(link);
      } catch {
        return `${field}: URL invalide`;
      }
      if (url.protocol !== 'https:') {
        return `${field}: seules les URLs HTTPS sont autorisées`;
      }
      if (!isDirectImageUrl(url)) {
        return `${field}: URL d'image directe requise (.jpg/.png/... ou /wiki/Special:FilePath/...)`;
      }
    }
  }
  return null;
}

function buildPlantPayload(body, fallback = {}) {
  const payload = {};
  const rawName = hasOwn(body, 'name') ? body.name : fallback.name;
  const rawEmoji = hasOwn(body, 'emoji') ? body.emoji : fallback.emoji;
  const rawDescription = hasOwn(body, 'description') ? body.description : fallback.description;
  payload.name = asTrimmedString(rawName);
  payload.emoji = asTrimmedString(rawEmoji) || '🌱';
  payload.description = asTrimmedString(rawDescription);
  for (const field of PLANT_EXTRA_FIELDS) {
    const sourceValue = hasOwn(body, field) ? body[field] : fallback[field];
    payload[field] = asOptionalText(sourceValue);
  }
  return payload;
}

router.get('/', async (req, res) => {
  try {
    const rows = await queryAll('SELECT * FROM plants ORDER BY name');
    res.json(rows);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireTeacher, async (req, res) => {
  try {
    const photoError = validateHttpsPhotoLinks(req.body);
    if (photoError) return res.status(400).json({ error: photoError });
    const payload = buildPlantPayload(req.body);
    if (!payload.name) return res.status(400).json({ error: 'Nom requis' });
    const placeholders = PLANT_COLUMNS.map(() => '?').join(', ');
    const values = PLANT_COLUMNS.map(col => payload[col]);
    const result = await execute(
      `INSERT INTO plants (${PLANT_COLUMNS.join(', ')}) VALUES (${placeholders})`,
      values
    );
    const plant = await queryOne('SELECT * FROM plants WHERE id = ?', [result.insertId]);
    emitGardenChanged({ reason: 'create_plant', plantId: result.insertId });
    res.status(201).json(plant);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', requireTeacher, async (req, res) => {
  try {
    const plant = await queryOne('SELECT * FROM plants WHERE id = ?', [req.params.id]);
    if (!plant) return res.status(404).json({ error: 'Plante introuvable' });
    const photoError = validateHttpsPhotoLinks(req.body);
    if (photoError) return res.status(400).json({ error: photoError });
    const payload = buildPlantPayload(req.body, plant);
    if (!payload.name) return res.status(400).json({ error: 'Nom requis' });
    const setClause = PLANT_COLUMNS.map(col => `${col}=?`).join(', ');
    const values = [...PLANT_COLUMNS.map(col => payload[col]), plant.id];
    await execute(
      `UPDATE plants SET ${setClause} WHERE id=?`,
      values
    );
    const updated = await queryOne('SELECT * FROM plants WHERE id = ?', [plant.id]);
    emitGardenChanged({ reason: 'update_plant', plantId: plant.id });
    res.json(updated);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireTeacher, async (req, res) => {
  try {
    const plant = await queryOne('SELECT * FROM plants WHERE id = ?', [req.params.id]);
    if (!plant) return res.status(404).json({ error: 'Plante introuvable' });
    await execute('DELETE FROM plants WHERE id = ?', [req.params.id]);
    emitGardenChanged({ reason: 'delete_plant', plantId: req.params.id });
    res.json({ success: true });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
