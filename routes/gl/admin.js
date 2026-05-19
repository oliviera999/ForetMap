const express = require('express');
const bcrypt = require('bcryptjs');
const { queryAll, queryOne, execute } = require('../../database');
const { requireGlPermission } = require('../../middleware/requireGlAuth');

const router = express.Router();

function normalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

router.get('/classes', requireGlPermission('gl.players.manage'), async (_req, res) => {
  const rows = await queryAll(
    `SELECT c.id, c.name, c.school, c.is_active, c.created_at, c.updated_at, COUNT(p.id) AS players_count
       FROM gl_classes c
  LEFT JOIN gl_players p ON p.class_id = c.id
   GROUP BY c.id
   ORDER BY c.id DESC`
  );
  return res.json(rows);
});

router.post('/classes', requireGlPermission('gl.players.manage'), async (req, res) => {
  const name = normalizeOptionalString(req.body?.name);
  const school = normalizeOptionalString(req.body?.school);
  if (!name) return res.status(400).json({ error: 'Nom de classe requis' });
  await execute(
    'INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
    [name, school, req.glAuth.userId]
  );
  const created = await queryOne('SELECT * FROM gl_classes ORDER BY id DESC LIMIT 1');
  return res.status(201).json(created);
});

router.get('/players', requireGlPermission('gl.players.manage'), async (req, res) => {
  const classId = req.query?.classId ? Number(req.query.classId) : null;
  const rows = classId
    ? await queryAll(
      `SELECT p.id, p.class_id, p.team_id, p.pseudo, p.is_active, p.linked_foretmap_user_id, p.last_seen, c.name AS class_name
         FROM gl_players p
    LEFT JOIN gl_classes c ON c.id = p.class_id
        WHERE p.class_id = ?
        ORDER BY p.id DESC`,
      [classId]
    )
    : await queryAll(
      `SELECT p.id, p.class_id, p.team_id, p.pseudo, p.is_active, p.linked_foretmap_user_id, p.last_seen, c.name AS class_name
         FROM gl_players p
    LEFT JOIN gl_classes c ON c.id = p.class_id
        ORDER BY p.id DESC`
    );
  return res.json(rows);
});

router.post('/players', requireGlPermission('gl.players.manage'), async (req, res) => {
  const pseudo = normalizeOptionalString(req.body?.pseudo);
  const pin = normalizeOptionalString(req.body?.pin) || '1234';
  const classId = Number(req.body?.classId);
  if (!pseudo || !Number.isFinite(classId)) {
    return res.status(400).json({ error: 'Pseudo et classId requis' });
  }
  const pinHash = await bcrypt.hash(pin, 10);
  await execute(
    `INSERT INTO gl_players (class_id, team_id, pseudo, pin_hash, linked_foretmap_user_id, is_active, created_at, updated_at)
     VALUES (?, NULL, ?, ?, NULL, 1, NOW(), NOW())`,
    [classId, pseudo, pinHash]
  );
  const created = await queryOne(
    `SELECT p.id, p.class_id, p.team_id, p.pseudo, p.is_active
       FROM gl_players p
      WHERE p.class_id = ? AND p.pseudo = ?
      ORDER BY p.id DESC
      LIMIT 1`,
    [classId, pseudo]
  );
  return res.status(201).json(created);
});

router.post('/players/:id/reset-pin', requireGlPermission('gl.players.manage'), async (req, res) => {
  const id = Number(req.params.id);
  const pin = normalizeOptionalString(req.body?.pin) || '1234';
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  const hash = await bcrypt.hash(pin, 10);
  await execute('UPDATE gl_players SET pin_hash = ?, updated_at = NOW() WHERE id = ?', [hash, id]);
  return res.json({ ok: true });
});

router.get('/settings', requireGlPermission('gl.settings.manage'), async (_req, res) => {
  const rows = await queryAll('SELECT `key`, value_json, updated_at FROM gl_settings ORDER BY `key` ASC');
  const out = {};
  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value_json);
    } catch (_) {
      out[row.key] = row.value_json;
    }
  }
  return res.json({ settings: out });
});

router.put('/settings/:key', requireGlPermission('gl.settings.manage'), async (req, res) => {
  const key = normalizeOptionalString(req.params.key);
  if (!key) return res.status(400).json({ error: 'Clé invalide' });
  const value = req.body?.value ?? null;
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_by, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_by = VALUES(updated_by), updated_at = NOW()`,
    [key, JSON.stringify(value), req.glAuth.userId]
  );
  return res.json({ ok: true });
});

router.get('/content', requireGlPermission('gl.content.manage'), async (_req, res) => {
  const rows = await queryAll(
    `SELECT slug, title, updated_by, updated_at
       FROM gl_content_pages
      ORDER BY updated_at DESC, slug ASC`
  );
  return res.json(rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    updatedBy: row.updated_by || null,
    updatedAt: row.updated_at || null,
  })));
});

module.exports = router;
