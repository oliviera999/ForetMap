const express = require('express');
const { queryAll, queryOne, execute } = require('../database');
const { requireTeacher } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const { emitGardenChanged } = require('../lib/realtime');

const router = express.Router();

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
    const { name, emoji, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nom requis' });
    const result = await execute(
      'INSERT INTO plants (name, emoji, description) VALUES (?, ?, ?)',
      [name.trim(), emoji || '🌱', description || '']
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
    const { name, emoji, description } = req.body;
    await execute(
      'UPDATE plants SET name=?, emoji=?, description=? WHERE id=?',
      [name ?? plant.name, emoji ?? plant.emoji, description ?? plant.description, plant.id]
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
