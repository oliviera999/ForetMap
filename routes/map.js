const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute } = require('../database');
const { requireTeacher } = require('../middleware/requireTeacher');

const router = express.Router();

router.get('/markers', async (req, res) => {
  try {
    const rows = await queryAll('SELECT * FROM map_markers ORDER BY created_at');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/markers', requireTeacher, async (req, res) => {
  try {
    const { x_pct, y_pct, label, plant_name, note, emoji } = req.body;
    if (!label?.trim()) return res.status(400).json({ error: 'Label requis' });
    const id = uuidv4();
    await execute(
      'INSERT INTO map_markers (id, x_pct, y_pct, label, plant_name, note, emoji) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, x_pct, y_pct, label.trim(), plant_name || '', note || '', emoji || '🌱']
    );
    const row = await queryOne('SELECT * FROM map_markers WHERE id = ?', [id]);
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/markers/:id', requireTeacher, async (req, res) => {
  try {
    const m = await queryOne('SELECT * FROM map_markers WHERE id = ?', [req.params.id]);
    if (!m) return res.status(404).json({ error: 'Repère introuvable' });
    const { x_pct, y_pct, label, plant_name, note, emoji } = req.body;
    await execute(
      'UPDATE map_markers SET x_pct=?, y_pct=?, label=?, plant_name=?, note=?, emoji=? WHERE id=?',
      [x_pct ?? m.x_pct, y_pct ?? m.y_pct, label ?? m.label, plant_name ?? m.plant_name, note ?? m.note, emoji ?? m.emoji, m.id]
    );
    const updated = await queryOne('SELECT * FROM map_markers WHERE id = ?', [m.id]);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/markers/:id', requireTeacher, async (req, res) => {
  try {
    const m = await queryOne('SELECT * FROM map_markers WHERE id = ?', [req.params.id]);
    if (!m) return res.status(404).json({ error: 'Repère introuvable' });
    await execute('DELETE FROM map_markers WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
