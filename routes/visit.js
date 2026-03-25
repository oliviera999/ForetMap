const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute } = require('../database');
const { requireTeacher, JWT_SECRET } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');

const router = express.Router();

const ANON_COOKIE_NAME = 'anon_visit_token';
const ANON_TTL_SECONDS = 24 * 60 * 60;
const TARGET_TYPES = new Set(['zone', 'marker']);

function nowIso() {
  return new Date().toISOString();
}

function visitCookieSecret() {
  return process.env.VISIT_COOKIE_SECRET || JWT_SECRET || 'visit-dev-secret-change-me';
}

function parseCookies(req) {
  const raw = String(req.headers.cookie || '');
  const out = {};
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.split('=');
    if (!k) continue;
    out[k.trim()] = decodeURIComponent(rest.join('=').trim());
  }
  return out;
}

function signAnonValue(value) {
  return crypto.createHmac('sha256', visitCookieSecret()).update(value).digest('base64url');
}

function buildAnonCookie(value) {
  const signature = signAnonValue(value);
  return `${value}.${signature}`;
}

function verifyAnonCookie(cookieValue) {
  const value = String(cookieValue || '');
  const splitAt = value.lastIndexOf('.');
  if (splitAt <= 0) return null;
  const token = value.slice(0, splitAt);
  const signature = value.slice(splitAt + 1);
  const expected = signAnonValue(token);
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
    return token;
  } catch (_) {
    return null;
  }
}

function setAnonCookie(res, anonToken) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const value = encodeURIComponent(buildAnonCookie(anonToken));
  res.setHeader('Set-Cookie', `${ANON_COOKIE_NAME}=${value}; Max-Age=${ANON_TTL_SECONDS}; Path=/; HttpOnly; SameSite=Lax${secure}`);
}

function readOrCreateAnonToken(req, res) {
  const cookies = parseCookies(req);
  const existing = verifyAnonCookie(cookies[ANON_COOKIE_NAME]);
  if (existing) return existing;
  const created = uuidv4();
  setAnonCookie(res, created);
  return created;
}

function sanitizeTargetType(value) {
  const type = String(value || '').trim().toLowerCase();
  if (!TARGET_TYPES.has(type)) return null;
  return type;
}

function sanitizeTargetId(value) {
  const id = String(value || '').trim();
  return id || null;
}

async function mapExists(mapId) {
  const row = await queryOne('SELECT id FROM maps WHERE id = ? LIMIT 1', [mapId]);
  return !!row;
}

async function cleanupAnonymousSeen() {
  await execute(
    "DELETE FROM visit_seen_anonymous WHERE updated_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)"
  );
}

router.get('/content', async (req, res) => {
  try {
    const mapId = String(req.query.map_id || 'foret').trim();
    if (!mapId) return res.status(400).json({ error: 'map_id requis' });
    if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });

    const zones = await queryAll(
      `SELECT
         z.*,
         COALESCE(vz.subtitle, '') AS visit_subtitle,
         COALESCE(vz.short_description, '') AS visit_short_description,
         COALESCE(vz.details_title, 'Détails') AS visit_details_title,
         COALESCE(vz.details_text, '') AS visit_details_text,
         COALESCE(vz.is_active, 1) AS visit_is_active,
         COALESCE(vz.sort_order, 0) AS visit_sort_order
       FROM zones z
       LEFT JOIN visit_zone_content vz ON vz.zone_id = z.id
       WHERE z.map_id = ?
       ORDER BY COALESCE(vz.sort_order, 0) ASC, z.name ASC`,
      [mapId]
    );

    const markers = await queryAll(
      `SELECT
         m.*,
         COALESCE(vm.subtitle, '') AS visit_subtitle,
         COALESCE(vm.short_description, '') AS visit_short_description,
         COALESCE(vm.details_title, 'Détails') AS visit_details_title,
         COALESCE(vm.details_text, '') AS visit_details_text,
         COALESCE(vm.is_active, 1) AS visit_is_active,
         COALESCE(vm.sort_order, 0) AS visit_sort_order
       FROM map_markers m
       LEFT JOIN visit_marker_content vm ON vm.marker_id = m.id
       WHERE m.map_id = ?
       ORDER BY COALESCE(vm.sort_order, 0) ASC, m.label ASC`,
      [mapId]
    );

    const media = await queryAll(
      `SELECT id, target_type, target_id, image_url, caption, sort_order
       FROM visit_media
       ORDER BY sort_order ASC, id ASC`
    );

    const mediaByTarget = media.reduce((acc, row) => {
      const key = `${row.target_type}:${row.target_id}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});

    const tutorials = await queryAll(
      `SELECT
         t.id, t.title, t.slug, t.type, t.summary, t.source_url, t.source_file_path,
         vt.sort_order
       FROM visit_tutorials vt
       JOIN tutorials t ON t.id = vt.tutorial_id
       WHERE vt.is_active = 1 AND t.is_active = 1
       ORDER BY vt.sort_order ASC, t.sort_order ASC, t.title ASC`
    );

    const payload = {
      map_id: mapId,
      zones: zones
        .filter((z) => Number(z.visit_is_active) === 1)
        .map((z) => ({
          ...z,
          visit_media: mediaByTarget[`zone:${z.id}`] || [],
        })),
      markers: markers
        .filter((m) => Number(m.visit_is_active) === 1)
        .map((m) => ({
          ...m,
          visit_media: mediaByTarget[`marker:${m.id}`] || [],
        })),
      tutorials,
    };
    res.json(payload);
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/progress', async (req, res) => {
  try {
    const studentId = String(req.query.student_id || '').trim();
    if (studentId) {
      const student = await queryOne('SELECT id FROM students WHERE id = ? LIMIT 1', [studentId]);
      if (!student) return res.status(404).json({ error: 'Élève introuvable' });
      const rows = await queryAll(
        `SELECT target_type, target_id
         FROM visit_seen_students
         WHERE student_id = ?`,
        [studentId]
      );
      return res.json({
        mode: 'student',
        seen: rows.map((r) => ({ target_type: r.target_type, target_id: r.target_id })),
      });
    }

    await cleanupAnonymousSeen();
    const anonToken = readOrCreateAnonToken(req, res);
    const rows = await queryAll(
      `SELECT target_type, target_id
       FROM visit_seen_anonymous
       WHERE anon_token = ?
         AND updated_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)`,
      [anonToken]
    );
    return res.json({
      mode: 'anonymous',
      seen: rows.map((r) => ({ target_type: r.target_type, target_id: r.target_id })),
    });
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/seen', async (req, res) => {
  try {
    const targetType = sanitizeTargetType(req.body.target_type);
    const targetId = sanitizeTargetId(req.body.target_id);
    const seen = req.body.seen !== false;
    const studentId = String(req.body.student_id || '').trim();
    if (!targetType || !targetId) {
      return res.status(400).json({ error: 'Cible de visite invalide' });
    }

    if (studentId) {
      const student = await queryOne('SELECT id FROM students WHERE id = ? LIMIT 1', [studentId]);
      if (!student) return res.status(404).json({ error: 'Élève introuvable' });
      if (seen) {
        await execute(
          `INSERT INTO visit_seen_students (student_id, target_type, target_id, seen_at, updated_at)
           VALUES (?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
           ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)`,
          [studentId, targetType, targetId]
        );
      } else {
        await execute(
          `DELETE FROM visit_seen_students
           WHERE student_id = ? AND target_type = ? AND target_id = ?`,
          [studentId, targetType, targetId]
        );
      }
      return res.json({ ok: true, mode: 'student' });
    }

    await cleanupAnonymousSeen();
    const anonToken = readOrCreateAnonToken(req, res);
    if (seen) {
      await execute(
        `INSERT INTO visit_seen_anonymous (anon_token, target_type, target_id, updated_at)
         VALUES (?, ?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)`,
        [anonToken, targetType, targetId]
      );
    } else {
      await execute(
        `DELETE FROM visit_seen_anonymous
         WHERE anon_token = ? AND target_type = ? AND target_id = ?`,
        [anonToken, targetType, targetId]
      );
    }
    return res.json({ ok: true, mode: 'anonymous' });
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/zones/:id', requireTeacher, async (req, res) => {
  try {
    const zoneId = String(req.params.id || '').trim();
    if (!zoneId) return res.status(400).json({ error: 'Zone invalide' });
    const exists = await queryOne('SELECT id FROM zones WHERE id = ? LIMIT 1', [zoneId]);
    if (!exists) return res.status(404).json({ error: 'Zone introuvable' });
    const subtitle = String(req.body.subtitle || '').trim();
    const shortDescription = String(req.body.short_description || '').trim();
    const detailsTitle = String(req.body.details_title || 'Détails').trim() || 'Détails';
    const detailsText = String(req.body.details_text || '').trim();
    const isActive = req.body.is_active === false ? 0 : 1;
    const sortOrder = Number.isFinite(Number(req.body.sort_order)) ? Math.max(0, Number(req.body.sort_order)) : 0;
    await execute(
      `INSERT INTO visit_zone_content
        (zone_id, subtitle, short_description, details_title, details_text, is_active, sort_order, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         subtitle = VALUES(subtitle),
         short_description = VALUES(short_description),
         details_title = VALUES(details_title),
         details_text = VALUES(details_text),
         is_active = VALUES(is_active),
         sort_order = VALUES(sort_order),
         updated_at = VALUES(updated_at)`,
      [zoneId, subtitle, shortDescription, detailsTitle, detailsText, isActive, sortOrder, nowIso()]
    );
    const row = await queryOne('SELECT * FROM visit_zone_content WHERE zone_id = ?', [zoneId]);
    res.json(row);
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/markers/:id', requireTeacher, async (req, res) => {
  try {
    const markerId = String(req.params.id || '').trim();
    if (!markerId) return res.status(400).json({ error: 'Repère invalide' });
    const exists = await queryOne('SELECT id FROM map_markers WHERE id = ? LIMIT 1', [markerId]);
    if (!exists) return res.status(404).json({ error: 'Repère introuvable' });
    const subtitle = String(req.body.subtitle || '').trim();
    const shortDescription = String(req.body.short_description || '').trim();
    const detailsTitle = String(req.body.details_title || 'Détails').trim() || 'Détails';
    const detailsText = String(req.body.details_text || '').trim();
    const isActive = req.body.is_active === false ? 0 : 1;
    const sortOrder = Number.isFinite(Number(req.body.sort_order)) ? Math.max(0, Number(req.body.sort_order)) : 0;
    await execute(
      `INSERT INTO visit_marker_content
        (marker_id, subtitle, short_description, details_title, details_text, is_active, sort_order, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         subtitle = VALUES(subtitle),
         short_description = VALUES(short_description),
         details_title = VALUES(details_title),
         details_text = VALUES(details_text),
         is_active = VALUES(is_active),
         sort_order = VALUES(sort_order),
         updated_at = VALUES(updated_at)`,
      [markerId, subtitle, shortDescription, detailsTitle, detailsText, isActive, sortOrder, nowIso()]
    );
    const row = await queryOne('SELECT * FROM visit_marker_content WHERE marker_id = ?', [markerId]);
    res.json(row);
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/media', requireTeacher, async (req, res) => {
  try {
    const targetType = sanitizeTargetType(req.body.target_type);
    const targetId = sanitizeTargetId(req.body.target_id);
    const imageUrl = String(req.body.image_url || '').trim();
    const caption = String(req.body.caption || '').trim();
    const sortOrder = Number.isFinite(Number(req.body.sort_order)) ? Math.max(0, Number(req.body.sort_order)) : 0;
    if (!targetType || !targetId || !imageUrl) {
      return res.status(400).json({ error: 'Photo de visite invalide' });
    }
    const now = nowIso();
    const result = await execute(
      `INSERT INTO visit_media (target_type, target_id, image_url, caption, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [targetType, targetId, imageUrl, caption, sortOrder, now, now]
    );
    const row = await queryOne('SELECT * FROM visit_media WHERE id = ?', [result.insertId]);
    res.status(201).json(row);
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/media/:id', requireTeacher, async (req, res) => {
  try {
    const mediaId = Number(req.params.id);
    if (!Number.isFinite(mediaId) || mediaId <= 0) return res.status(400).json({ error: 'Photo invalide' });
    const exists = await queryOne('SELECT * FROM visit_media WHERE id = ? LIMIT 1', [mediaId]);
    if (!exists) return res.status(404).json({ error: 'Photo introuvable' });
    const imageUrl = String(req.body.image_url ?? exists.image_url).trim();
    if (!imageUrl) return res.status(400).json({ error: 'image_url requis' });
    const caption = String(req.body.caption ?? exists.caption ?? '').trim();
    const sortOrder = Number.isFinite(Number(req.body.sort_order)) ? Math.max(0, Number(req.body.sort_order)) : Number(exists.sort_order || 0);
    await execute(
      `UPDATE visit_media
       SET image_url = ?, caption = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`,
      [imageUrl, caption, sortOrder, nowIso(), mediaId]
    );
    const row = await queryOne('SELECT * FROM visit_media WHERE id = ?', [mediaId]);
    res.json(row);
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/media/:id', requireTeacher, async (req, res) => {
  try {
    const mediaId = Number(req.params.id);
    if (!Number.isFinite(mediaId) || mediaId <= 0) return res.status(400).json({ error: 'Photo invalide' });
    await execute('DELETE FROM visit_media WHERE id = ?', [mediaId]);
    res.json({ ok: true });
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/tutorials', requireTeacher, async (req, res) => {
  try {
    const ids = Array.isArray(req.body.tutorial_ids) ? req.body.tutorial_ids : [];
    const uniqueIds = [...new Set(ids.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0))];
    await execute('DELETE FROM visit_tutorials');
    let order = 0;
    for (const id of uniqueIds) {
      const exists = await queryOne('SELECT id FROM tutorials WHERE id = ? LIMIT 1', [id]);
      if (!exists) continue;
      await execute(
        `INSERT INTO visit_tutorials (tutorial_id, is_active, sort_order, updated_at)
         VALUES (?, 1, ?, ?)
         ON DUPLICATE KEY UPDATE is_active = 1, sort_order = VALUES(sort_order), updated_at = VALUES(updated_at)`,
        [id, order, nowIso()]
      );
      order += 1;
    }
    const rows = await queryAll('SELECT * FROM visit_tutorials ORDER BY sort_order ASC, tutorial_id ASC');
    res.json(rows);
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
