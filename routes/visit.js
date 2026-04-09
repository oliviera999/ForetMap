const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute } = require('../database');
const { requirePermission, JWT_SECRET, authenticate } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const { emitGardenChanged } = require('../lib/realtime');
const { saveBase64ToDisk, getAbsolutePath, deleteFile } = require('../lib/uploads');

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

/** URL affichée côté client : fichier local ou lien externe. */
function visitMediaPublicImageUrl(row) {
  if (!row) return '';
  if (row.image_path) return `/api/visit/media/${row.id}/data`;
  return String(row.image_url || '').trim();
}

/** Réponse API / contenu public : pas d’exposition de `image_path`. */
function serializeVisitMedia(row) {
  if (!row) return row;
  const { image_path: _p, ...rest } = row;
  return { ...rest, image_url: visitMediaPublicImageUrl(row) };
}

async function deleteVisitMediaFilesForTarget(targetType, targetId) {
  const rows = await queryAll(
    'SELECT image_path FROM visit_media WHERE target_type = ? AND target_id = ?',
    [targetType, targetId]
  );
  for (const r of rows) {
    if (r.image_path) deleteFile(r.image_path);
  }
}

async function mapExists(mapId) {
  const row = await queryOne('SELECT id FROM maps WHERE id = ? LIMIT 1', [mapId]);
  return !!row;
}

function parsePointsInput(points) {
  if (Array.isArray(points)) return points;
  if (typeof points === 'string' && points.trim()) {
    try { return JSON.parse(points); } catch (_) { return null; }
  }
  return null;
}

function normalizePoints(points) {
  const parsed = parsePointsInput(points);
  if (!Array.isArray(parsed)) return null;
  const out = parsed
    .map((p) => ({
      xp: Number(p?.xp),
      yp: Number(p?.yp),
    }))
    .filter((p) => Number.isFinite(p.xp) && Number.isFinite(p.yp) && p.xp >= 0 && p.xp <= 100 && p.yp >= 0 && p.yp <= 100);
  return out.length >= 3 ? out : null;
}

function normalizeCoord(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

function normalizeIdList(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of input) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

async function cleanupAnonymousSeen() {
  await execute(
    "DELETE FROM visit_seen_anonymous WHERE updated_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)"
  );
}

async function visitTargetExists(targetType, targetId) {
  if (targetType === 'zone') {
    const row = await queryOne('SELECT id FROM visit_zones WHERE id = ? LIMIT 1', [targetId]);
    return !!row;
  }
  const row = await queryOne('SELECT id FROM visit_markers WHERE id = ? LIMIT 1', [targetId]);
  return !!row;
}

function ratioPct(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

router.get('/stats', requirePermission('stats.read.all'), async (req, res) => {
  try {
    await cleanupAnonymousSeen();

    const activeRow = await queryOne(
      `SELECT
         (SELECT COUNT(*) FROM visit_zones WHERE is_active = 1) AS active_zones,
         (SELECT COUNT(*) FROM visit_markers WHERE is_active = 1) AS active_markers`
    );
    const activeZones = Number(activeRow?.active_zones || 0);
    const activeMarkers = Number(activeRow?.active_markers || 0);
    const activeTargetsTotal = activeZones + activeMarkers;

    const activeTargetsFilter = '(z.id IS NOT NULL OR m.id IS NOT NULL)';
    const studentSessions = await queryOne(
      `SELECT
         COUNT(*) AS sessions,
         COALESCE(SUM(grouped.seen_count), 0) AS seen_actions,
         COALESCE(SUM(CASE WHEN grouped.seen_count >= ? THEN 1 ELSE 0 END), 0) AS completed_visits
       FROM (
         SELECT s.student_id AS session_id, COUNT(*) AS seen_count
         FROM visit_seen_students s
         LEFT JOIN visit_zones z ON s.target_type = 'zone' AND z.id = s.target_id AND z.is_active = 1
         LEFT JOIN visit_markers m ON s.target_type = 'marker' AND m.id = s.target_id AND m.is_active = 1
         WHERE ${activeTargetsFilter}
         GROUP BY s.student_id
       ) grouped`,
      [activeTargetsTotal]
    );

    const anonymousSessions = await queryOne(
      `SELECT
         COUNT(*) AS sessions,
         COALESCE(SUM(grouped.seen_count), 0) AS seen_actions,
         COALESCE(SUM(CASE WHEN grouped.seen_count >= ? THEN 1 ELSE 0 END), 0) AS completed_visits
       FROM (
         SELECT s.anon_token AS session_id, COUNT(*) AS seen_count
         FROM visit_seen_anonymous s
         LEFT JOIN visit_zones z ON s.target_type = 'zone' AND z.id = s.target_id AND z.is_active = 1
         LEFT JOIN visit_markers m ON s.target_type = 'marker' AND m.id = s.target_id AND m.is_active = 1
         WHERE s.updated_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)
           AND ${activeTargetsFilter}
         GROUP BY s.anon_token
       ) grouped`,
      [activeTargetsTotal]
    );

    const students = {
      sessions: Number(studentSessions?.sessions || 0),
      seen_actions: Number(studentSessions?.seen_actions || 0),
      completed_visits: Number(studentSessions?.completed_visits || 0),
    };
    const anonymous = {
      sessions: Number(anonymousSessions?.sessions || 0),
      seen_actions: Number(anonymousSessions?.seen_actions || 0),
      completed_visits: Number(anonymousSessions?.completed_visits || 0),
    };
    const sessionsTotal = students.sessions + anonymous.sessions;
    const seenActionsTotal = students.seen_actions + anonymous.seen_actions;
    const completedVisitsTotal = students.completed_visits + anonymous.completed_visits;
    const completionRatePct = ratioPct(seenActionsTotal, sessionsTotal * activeTargetsTotal);
    const completedVisitsRatePct = ratioPct(completedVisitsTotal, sessionsTotal);

    return res.json({
      generated_at: nowIso(),
      active_targets: {
        total: activeTargetsTotal,
        zones: activeZones,
        markers: activeMarkers,
      },
      kpis: {
        sessions_total: sessionsTotal,
        completed_visits_total: completedVisitsTotal,
        seen_actions_total: seenActionsTotal,
        completion_rate_pct: completionRatePct,
        completed_visits_rate_pct: completedVisitsRatePct,
      },
      breakdown: {
        students: {
          ...students,
          completion_rate_pct: ratioPct(students.seen_actions, students.sessions * activeTargetsTotal),
          completed_visits_rate_pct: ratioPct(students.completed_visits, students.sessions),
        },
        anonymous: {
          ...anonymous,
          completion_rate_pct: ratioPct(anonymous.seen_actions, anonymous.sessions * activeTargetsTotal),
          completed_visits_rate_pct: ratioPct(anonymous.completed_visits, anonymous.sessions),
        },
      },
    });
  } catch (err) {
    logRouteError(err, req);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/content', async (req, res) => {
  try {
    const mapId = String(req.query.map_id || 'foret').trim();
    if (!mapId) return res.status(400).json({ error: 'map_id requis' });
    if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });

    const zones = await queryAll(
      `SELECT
         z.id, z.map_id, z.name, z.points,
         z.subtitle AS visit_subtitle,
         z.short_description AS visit_short_description,
         z.details_title AS visit_details_title,
         z.details_text AS visit_details_text,
         z.is_active AS visit_is_active,
         z.sort_order AS visit_sort_order
       FROM visit_zones z
       WHERE z.map_id = ?
       ORDER BY z.sort_order ASC, z.name ASC`,
      [mapId]
    );

    const markers = await queryAll(
      `SELECT
         m.id, m.map_id, m.x_pct, m.y_pct, m.label, m.emoji,
         m.subtitle AS visit_subtitle,
         m.short_description AS visit_short_description,
         m.details_title AS visit_details_title,
         m.details_text AS visit_details_text,
         m.is_active AS visit_is_active,
         m.sort_order AS visit_sort_order
       FROM visit_markers m
       WHERE m.map_id = ?
       ORDER BY m.sort_order ASC, m.label ASC`,
      [mapId]
    );

    const media = await queryAll(
      `SELECT vm.id, vm.target_type, vm.target_id, vm.image_url, vm.image_path, vm.caption, vm.sort_order
       FROM visit_media vm
       WHERE (vm.target_type = 'zone' AND vm.target_id IN (SELECT id FROM visit_zones WHERE map_id = ?))
          OR (vm.target_type = 'marker' AND vm.target_id IN (SELECT id FROM visit_markers WHERE map_id = ?))
       ORDER BY vm.sort_order ASC, vm.id ASC`,
      [mapId, mapId]
    );

    const mediaByTarget = media.reduce((acc, row) => {
      const key = `${row.target_type}:${row.target_id}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(serializeVisitMedia(row));
      return acc;
    }, {});

    const tutorials = await queryAll(
      `SELECT
         t.id, t.title, t.slug, t.type, t.summary, t.source_url, t.source_file_path,
         vt.sort_order
       FROM visit_tutorials vt
       JOIN tutorials t ON t.id = vt.tutorial_id
       WHERE vt.map_id = ? AND vt.is_active = 1 AND t.is_active = 1
       ORDER BY vt.sort_order ASC, t.sort_order ASC, t.title ASC`,
      [mapId]
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

router.get('/sync/options', requirePermission('visit.manage', { needsElevation: true }), async (req, res) => {
  try {
    const mapId = String(req.query.map_id || 'foret').trim();
    if (!mapId) return res.status(400).json({ error: 'map_id requis' });
    if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });

    const [mapZones, mapMarkers, visitZones, visitMarkers] = await Promise.all([
      queryAll(
        `SELECT id, name
         FROM zones
         WHERE map_id = ?
         ORDER BY name ASC, id ASC`,
        [mapId]
      ),
      queryAll(
        `SELECT id, label
         FROM map_markers
         WHERE map_id = ?
         ORDER BY label ASC, id ASC`,
        [mapId]
      ),
      queryAll(
        `SELECT id, name
         FROM visit_zones
         WHERE map_id = ?
         ORDER BY sort_order ASC, name ASC, id ASC`,
        [mapId]
      ),
      queryAll(
        `SELECT id, label
         FROM visit_markers
         WHERE map_id = ?
         ORDER BY sort_order ASC, label ASC, id ASC`,
        [mapId]
      ),
    ]);

    return res.json({
      map_id: mapId,
      source: {
        map: {
          zones: mapZones,
          markers: mapMarkers,
        },
        visit: {
          zones: visitZones,
          markers: visitMarkers,
        },
      },
    });
  } catch (err) {
    logRouteError(err, req);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/sync', requirePermission('visit.manage', { needsElevation: true }), async (req, res) => {
  try {
    const mapId = String(req.body.map_id || 'foret').trim();
    const direction = String(req.body.direction || '').trim();
    if (!mapId) return res.status(400).json({ error: 'map_id requis' });
    if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });
    if (direction !== 'map_to_visit' && direction !== 'visit_to_map') {
      return res.status(400).json({ error: 'direction invalide' });
    }

    const zoneIds = normalizeIdList(req.body.zone_ids);
    const markerIds = normalizeIdList(req.body.marker_ids);
    if (zoneIds.length === 0 && markerIds.length === 0) {
      return res.status(400).json({ error: 'Aucun élément sélectionné' });
    }

    const sourceZones = direction === 'map_to_visit'
      ? await queryAll('SELECT id, map_id, name, points FROM zones WHERE map_id = ?', [mapId])
      : await queryAll('SELECT id, map_id, name, points FROM visit_zones WHERE map_id = ?', [mapId]);
    const sourceMarkers = direction === 'map_to_visit'
      ? await queryAll('SELECT id, map_id, x_pct, y_pct, label, emoji FROM map_markers WHERE map_id = ?', [mapId])
      : await queryAll('SELECT id, map_id, x_pct, y_pct, label, emoji FROM visit_markers WHERE map_id = ?', [mapId]);

    const zoneById = new Map(sourceZones.map((z) => [String(z.id), z]));
    const markerById = new Map(sourceMarkers.map((m) => [String(m.id), m]));

    const invalidZoneIds = zoneIds.filter((id) => !zoneById.has(id));
    const invalidMarkerIds = markerIds.filter((id) => !markerById.has(id));
    if (invalidZoneIds.length || invalidMarkerIds.length) {
      return res.status(400).json({
        error: 'Sélection invalide',
        invalid_zone_ids: invalidZoneIds,
        invalid_marker_ids: invalidMarkerIds,
      });
    }

    const now = nowIso();
    let importedZones = 0;
    let importedMarkers = 0;

    if (direction === 'map_to_visit') {
      for (const zoneId of zoneIds) {
        const z = zoneById.get(zoneId);
        await execute(
          `INSERT INTO visit_zones
            (id, map_id, name, points, subtitle, short_description, details_title, details_text, is_active, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, '', '', 'Détails', '', 1, 0, ?, ?)
           ON DUPLICATE KEY UPDATE
             map_id = VALUES(map_id),
             name = VALUES(name),
             points = VALUES(points),
             updated_at = VALUES(updated_at)`,
          [z.id, z.map_id, z.name, z.points || '[]', now, now]
        );
        importedZones += 1;
      }
      for (const markerId of markerIds) {
        const m = markerById.get(markerId);
        await execute(
          `INSERT INTO visit_markers
            (id, map_id, x_pct, y_pct, label, emoji, subtitle, short_description, details_title, details_text, is_active, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, '', '', 'Détails', '', 1, 0, ?, ?)
           ON DUPLICATE KEY UPDATE
             map_id = VALUES(map_id),
             x_pct = VALUES(x_pct),
             y_pct = VALUES(y_pct),
             label = VALUES(label),
             emoji = VALUES(emoji),
             updated_at = VALUES(updated_at)`,
          [m.id, m.map_id, m.x_pct, m.y_pct, m.label, m.emoji || '📍', now, now]
        );
        importedMarkers += 1;
      }
    } else {
      for (const zoneId of zoneIds) {
        const z = zoneById.get(zoneId);
        await execute(
          `INSERT INTO zones
            (id, map_id, name, x, y, width, height, current_plant, living_beings, stage, special, shape, points, color, description)
           VALUES (?, ?, ?, 0, 0, 0, 0, '', '[]', 'empty', 0, 'polygon', ?, '#86efac80', '')
           ON DUPLICATE KEY UPDATE
             map_id = VALUES(map_id),
             name = VALUES(name),
             shape = VALUES(shape),
             points = VALUES(points)`,
          [z.id, z.map_id, z.name, z.points || '[]']
        );
        importedZones += 1;
      }
      for (const markerId of markerIds) {
        const m = markerById.get(markerId);
        await execute(
          `INSERT INTO map_markers
            (id, map_id, x_pct, y_pct, label, plant_name, living_beings, note, emoji, created_at)
           VALUES (?, ?, ?, ?, ?, '', '[]', '', ?, ?)
           ON DUPLICATE KEY UPDATE
             map_id = VALUES(map_id),
             x_pct = VALUES(x_pct),
             y_pct = VALUES(y_pct),
             label = VALUES(label),
             emoji = VALUES(emoji)`,
          [m.id, m.map_id, m.x_pct, m.y_pct, m.label, m.emoji || '📍', now]
        );
        importedMarkers += 1;
      }
      emitGardenChanged({ reason: 'visit_sync_to_map', mapId });
    }

    return res.json({
      ok: true,
      map_id: mapId,
      direction,
      imported: {
        zones: importedZones,
        markers: importedMarkers,
      },
    });
  } catch (err) {
    logRouteError(err, req);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/progress', authenticate, async (req, res) => {
  try {
    const auth = req.auth;
    const queryStudentId = String(req.query.student_id || '').trim();

    if (auth && auth.userType === 'student') {
      const sid = String(auth.userId);
      if (queryStudentId && queryStudentId !== sid) {
        return res.status(403).json({ error: 'Accès refusé à la progression d’un autre compte.' });
      }
      const student = await queryOne("SELECT id FROM users WHERE user_type = 'student' AND id = ? LIMIT 1", [sid]);
      if (!student) return res.status(403).json({ error: 'Compte élève invalide' });
      const rows = await queryAll(
        `SELECT target_type, target_id
         FROM visit_seen_students
         WHERE student_id = ?`,
        [sid]
      );
      return res.json({
        mode: 'student',
        seen: rows.map((r) => ({ target_type: r.target_type, target_id: r.target_id })),
      });
    }

    if (queryStudentId) {
      return res.status(401).json({ error: 'Connexion requise pour consulter la progression sur un compte.' });
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

router.post('/seen', authenticate, async (req, res) => {
  try {
    const targetType = sanitizeTargetType(req.body.target_type);
    const targetId = sanitizeTargetId(req.body.target_id);
    const seen = req.body.seen !== false;
    const bodyStudentId = String(req.body.student_id || '').trim();
    const auth = req.auth;
    if (!targetType || !targetId) {
      return res.status(400).json({ error: 'Cible de visite invalide' });
    }
    if (!(await visitTargetExists(targetType, targetId))) {
      return res.status(404).json({ error: 'Cible de visite introuvable' });
    }

    if (auth && auth.userType === 'student') {
      const sid = String(auth.userId);
      if (bodyStudentId && bodyStudentId !== sid) {
        return res.status(403).json({ error: 'Tu ne peux pas modifier la progression d’un autre compte.' });
      }
      const student = await queryOne("SELECT id FROM users WHERE user_type = 'student' AND id = ? LIMIT 1", [sid]);
      if (!student) return res.status(403).json({ error: 'Compte élève invalide' });
      if (seen) {
        await execute(
          `INSERT INTO visit_seen_students (student_id, target_type, target_id, seen_at, updated_at)
           VALUES (?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
           ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)`,
          [sid, targetType, targetId]
        );
      } else {
        await execute(
          `DELETE FROM visit_seen_students
           WHERE student_id = ? AND target_type = ? AND target_id = ?`,
          [sid, targetType, targetId]
        );
      }
      return res.json({ ok: true, mode: 'student' });
    }

    if (bodyStudentId) {
      return res.status(401).json({ error: 'Connexion requise pour enregistrer la progression sur un compte.' });
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

router.post('/zones', requirePermission('visit.manage', { needsElevation: true }), async (req, res) => {
  try {
    const mapId = String(req.body.map_id || 'foret').trim();
    const name = String(req.body.name || '').trim();
    const points = normalizePoints(req.body.points);
    if (!mapId || !(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });
    if (!name) return res.status(400).json({ error: 'Nom de zone requis' });
    if (!points) return res.status(400).json({ error: 'Polygone invalide (min 3 points)' });
    const id = uuidv4();
    await execute(
      `INSERT INTO visit_zones
        (id, map_id, name, points, subtitle, short_description, details_title, details_text, sort_order, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        mapId,
        name,
        JSON.stringify(points),
        String(req.body.subtitle || '').trim(),
        String(req.body.short_description || '').trim(),
        String(req.body.details_title || 'Détails').trim() || 'Détails',
        String(req.body.details_text || '').trim(),
        Number.isFinite(Number(req.body.sort_order)) ? Math.max(0, Number(req.body.sort_order)) : 0,
        req.body.is_active === false ? 0 : 1,
        nowIso(),
        nowIso(),
      ]
    );
    const row = await queryOne('SELECT * FROM visit_zones WHERE id = ?', [id]);
    res.status(201).json(row);
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/zones/:id', requirePermission('visit.manage', { needsElevation: true }), async (req, res) => {
  try {
    const zoneId = String(req.params.id || '').trim();
    if (!zoneId) return res.status(400).json({ error: 'Zone invalide' });
    const exists = await queryOne('SELECT * FROM visit_zones WHERE id = ? LIMIT 1', [zoneId]);
    if (!exists) return res.status(404).json({ error: 'Zone introuvable' });
    const name = req.body.name !== undefined ? String(req.body.name || '').trim() : exists.name;
    if (!name) return res.status(400).json({ error: 'Nom de zone requis' });
    const maybePoints = req.body.points !== undefined ? normalizePoints(req.body.points) : null;
    if (req.body.points !== undefined && !maybePoints) {
      return res.status(400).json({ error: 'Polygone invalide (min 3 points)' });
    }
    const subtitle = req.body.subtitle !== undefined ? String(req.body.subtitle || '').trim() : String(exists.subtitle || '');
    const shortDescription = req.body.short_description !== undefined
      ? String(req.body.short_description || '').trim()
      : String(exists.short_description || '');
    const detailsTitle = req.body.details_title !== undefined
      ? (String(req.body.details_title || 'Détails').trim() || 'Détails')
      : (String(exists.details_title || 'Détails').trim() || 'Détails');
    const detailsText = req.body.details_text !== undefined ? String(req.body.details_text || '').trim() : String(exists.details_text || '');
    const isActive = req.body.is_active !== undefined ? (req.body.is_active === false ? 0 : 1) : Number(exists.is_active ?? 1);
    const sortOrder = req.body.sort_order !== undefined
      ? (Number.isFinite(Number(req.body.sort_order)) ? Math.max(0, Number(req.body.sort_order)) : Number(exists.sort_order || 0))
      : Number(exists.sort_order || 0);
    await execute(
      `UPDATE visit_zones
       SET name = ?, points = ?, subtitle = ?, short_description = ?, details_title = ?, details_text = ?,
           is_active = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`,
      [
        name,
        maybePoints ? JSON.stringify(maybePoints) : exists.points,
        subtitle,
        shortDescription,
        detailsTitle,
        detailsText,
        isActive,
        sortOrder,
        nowIso(),
        zoneId,
      ]
    );
    const row = await queryOne('SELECT * FROM visit_zones WHERE id = ?', [zoneId]);
    res.json(row);
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/zones/:id', requirePermission('visit.manage', { needsElevation: true }), async (req, res) => {
  try {
    const zoneId = String(req.params.id || '').trim();
    if (!zoneId) return res.status(400).json({ error: 'Zone invalide' });
    await deleteVisitMediaFilesForTarget('zone', zoneId);
    await execute('DELETE FROM visit_zones WHERE id = ?', [zoneId]);
    await execute(`DELETE FROM visit_media WHERE target_type = 'zone' AND target_id = ?`, [zoneId]);
    await execute(`DELETE FROM visit_seen_students WHERE target_type = 'zone' AND target_id = ?`, [zoneId]);
    await execute(`DELETE FROM visit_seen_anonymous WHERE target_type = 'zone' AND target_id = ?`, [zoneId]);
    res.json({ ok: true });
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/markers', requirePermission('visit.manage', { needsElevation: true }), async (req, res) => {
  try {
    const mapId = String(req.body.map_id || 'foret').trim();
    const label = String(req.body.label || '').trim();
    const x = normalizeCoord(req.body.x_pct);
    const y = normalizeCoord(req.body.y_pct);
    if (!mapId || !(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });
    if (!label) return res.status(400).json({ error: 'Nom du repère requis' });
    if (x == null || y == null) return res.status(400).json({ error: 'Position repère invalide' });
    const id = uuidv4();
    await execute(
      `INSERT INTO visit_markers
        (id, map_id, x_pct, y_pct, label, emoji, subtitle, short_description, details_title, details_text, sort_order, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        mapId,
        x,
        y,
        label,
        String(req.body.emoji || '📍').trim() || '📍',
        String(req.body.subtitle || '').trim(),
        String(req.body.short_description || '').trim(),
        String(req.body.details_title || 'Détails').trim() || 'Détails',
        String(req.body.details_text || '').trim(),
        Number.isFinite(Number(req.body.sort_order)) ? Math.max(0, Number(req.body.sort_order)) : 0,
        req.body.is_active === false ? 0 : 1,
        nowIso(),
        nowIso(),
      ]
    );
    const row = await queryOne('SELECT * FROM visit_markers WHERE id = ?', [id]);
    res.status(201).json(row);
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/markers/:id', requirePermission('visit.manage', { needsElevation: true }), async (req, res) => {
  try {
    const markerId = String(req.params.id || '').trim();
    if (!markerId) return res.status(400).json({ error: 'Repère invalide' });
    const exists = await queryOne('SELECT * FROM visit_markers WHERE id = ? LIMIT 1', [markerId]);
    if (!exists) return res.status(404).json({ error: 'Repère introuvable' });
    const label = req.body.label !== undefined ? String(req.body.label || '').trim() : exists.label;
    if (!label) return res.status(400).json({ error: 'Nom du repère requis' });
    const x = req.body.x_pct !== undefined ? normalizeCoord(req.body.x_pct) : Number(exists.x_pct);
    const y = req.body.y_pct !== undefined ? normalizeCoord(req.body.y_pct) : Number(exists.y_pct);
    if (x == null || y == null) return res.status(400).json({ error: 'Position repère invalide' });
    const emoji = req.body.emoji !== undefined ? (String(req.body.emoji || '📍').trim() || '📍') : String(exists.emoji || '📍');
    const subtitle = req.body.subtitle !== undefined ? String(req.body.subtitle || '').trim() : String(exists.subtitle || '');
    const shortDescription = req.body.short_description !== undefined
      ? String(req.body.short_description || '').trim()
      : String(exists.short_description || '');
    const detailsTitle = req.body.details_title !== undefined
      ? (String(req.body.details_title || 'Détails').trim() || 'Détails')
      : (String(exists.details_title || 'Détails').trim() || 'Détails');
    const detailsText = req.body.details_text !== undefined ? String(req.body.details_text || '').trim() : String(exists.details_text || '');
    const isActive = req.body.is_active !== undefined ? (req.body.is_active === false ? 0 : 1) : Number(exists.is_active ?? 1);
    const sortOrder = req.body.sort_order !== undefined
      ? (Number.isFinite(Number(req.body.sort_order)) ? Math.max(0, Number(req.body.sort_order)) : Number(exists.sort_order || 0))
      : Number(exists.sort_order || 0);
    await execute(
      `UPDATE visit_markers
       SET label = ?, x_pct = ?, y_pct = ?, emoji = ?, subtitle = ?, short_description = ?, details_title = ?, details_text = ?,
           is_active = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`,
      [
        label,
        x,
        y,
        emoji,
        subtitle,
        shortDescription,
        detailsTitle,
        detailsText,
        isActive,
        sortOrder,
        nowIso(),
        markerId,
      ]
    );
    const row = await queryOne('SELECT * FROM visit_markers WHERE id = ?', [markerId]);
    res.json(row);
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/markers/:id', requirePermission('visit.manage', { needsElevation: true }), async (req, res) => {
  try {
    const markerId = String(req.params.id || '').trim();
    if (!markerId) return res.status(400).json({ error: 'Repère invalide' });
    await deleteVisitMediaFilesForTarget('marker', markerId);
    await execute('DELETE FROM visit_markers WHERE id = ?', [markerId]);
    await execute(`DELETE FROM visit_media WHERE target_type = 'marker' AND target_id = ?`, [markerId]);
    await execute(`DELETE FROM visit_seen_students WHERE target_type = 'marker' AND target_id = ?`, [markerId]);
    await execute(`DELETE FROM visit_seen_anonymous WHERE target_type = 'marker' AND target_id = ?`, [markerId]);
    res.json({ ok: true });
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/media/:id/data', async (req, res) => {
  try {
    const mediaId = Number(req.params.id);
    if (!Number.isFinite(mediaId) || mediaId <= 0) return res.status(400).json({ error: 'Photo invalide' });
    const row = await queryOne('SELECT image_path FROM visit_media WHERE id = ? LIMIT 1', [mediaId]);
    if (!row?.image_path) return res.status(404).json({ error: 'Image introuvable' });
    const absolutePath = getAbsolutePath(row.image_path);
    return res.sendFile(absolutePath, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Fichier introuvable' });
    });
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/media', requirePermission('visit.manage', { needsElevation: true }), async (req, res) => {
  let insertedId = null;
  try {
    const targetType = sanitizeTargetType(req.body.target_type);
    const targetId = sanitizeTargetId(req.body.target_id);
    const imageDataRaw = req.body.image_data;
    const imageData =
      imageDataRaw !== undefined && imageDataRaw !== null ? String(imageDataRaw).trim() : '';
    const imageUrl = String(req.body.image_url || '').trim();
    const caption = String(req.body.caption || '').trim();
    const sortOrder = Number.isFinite(Number(req.body.sort_order)) ? Math.max(0, Number(req.body.sort_order)) : 0;
    if (!targetType || !targetId || (!imageUrl && !imageData)) {
      return res.status(400).json({ error: 'Photo de visite invalide (image_url ou image_data requis)' });
    }
    if (targetType === 'zone') {
      const zone = await queryOne('SELECT id FROM visit_zones WHERE id = ? LIMIT 1', [targetId]);
      if (!zone) return res.status(404).json({ error: 'Zone de visite introuvable' });
    } else {
      const marker = await queryOne('SELECT id FROM visit_markers WHERE id = ? LIMIT 1', [targetId]);
      if (!marker) return res.status(404).json({ error: 'Repère de visite introuvable' });
    }
    const now = nowIso();
    if (imageData) {
      const result = await execute(
        `INSERT INTO visit_media (target_type, target_id, image_url, image_path, caption, sort_order, created_at, updated_at)
         VALUES (?, ?, NULL, NULL, ?, ?, ?, ?)`,
        [targetType, targetId, caption, sortOrder, now, now]
      );
      insertedId = result.insertId;
      const relativePath = `visit_media/${insertedId}.jpg`;
      try {
        saveBase64ToDisk(relativePath, imageData);
      } catch (fileErr) {
        await execute('DELETE FROM visit_media WHERE id = ?', [insertedId]);
        logRouteError(fileErr, req);
        return res.status(400).json({ error: 'Image invalide ou trop volumineuse' });
      }
      const publicUrl = `/api/visit/media/${insertedId}/data`;
      await execute('UPDATE visit_media SET image_path = ?, image_url = ? WHERE id = ?', [
        relativePath,
        publicUrl,
        insertedId,
      ]);
    } else {
      const result = await execute(
        `INSERT INTO visit_media (target_type, target_id, image_url, image_path, caption, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
        [targetType, targetId, imageUrl, caption, sortOrder, now, now]
      );
      insertedId = result.insertId;
    }
    const row = await queryOne('SELECT * FROM visit_media WHERE id = ?', [insertedId]);
    res.status(201).json(serializeVisitMedia(row));
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/media/:id', requirePermission('visit.manage', { needsElevation: true }), async (req, res) => {
  try {
    const mediaId = Number(req.params.id);
    if (!Number.isFinite(mediaId) || mediaId <= 0) return res.status(400).json({ error: 'Photo invalide' });
    const exists = await queryOne('SELECT * FROM visit_media WHERE id = ? LIMIT 1', [mediaId]);
    if (!exists) return res.status(404).json({ error: 'Photo introuvable' });
    const caption = String(req.body.caption ?? exists.caption ?? '').trim();
    const sortOrder = Number.isFinite(Number(req.body.sort_order))
      ? Math.max(0, Number(req.body.sort_order))
      : Number(exists.sort_order || 0);
    const now = nowIso();
    const imageDataRaw = req.body.image_data;
    const imageData =
      imageDataRaw !== undefined && imageDataRaw !== null ? String(imageDataRaw).trim() : '';

    if (imageData) {
      if (exists.image_path) deleteFile(exists.image_path);
      const relativePath = `visit_media/${mediaId}.jpg`;
      try {
        saveBase64ToDisk(relativePath, imageData);
      } catch (fileErr) {
        logRouteError(fileErr, req);
        return res.status(400).json({ error: 'Image invalide ou trop volumineuse' });
      }
      const publicUrl = `/api/visit/media/${mediaId}/data`;
      await execute(
        `UPDATE visit_media
         SET image_path = ?, image_url = ?, caption = ?, sort_order = ?, updated_at = ?
         WHERE id = ?`,
        [relativePath, publicUrl, caption, sortOrder, now, mediaId]
      );
    } else if (Object.prototype.hasOwnProperty.call(req.body, 'image_url')) {
      const imageUrl = String(req.body.image_url || '').trim();
      if (!imageUrl) return res.status(400).json({ error: 'image_url requis' });
      if (exists.image_path) deleteFile(exists.image_path);
      await execute(
        `UPDATE visit_media
         SET image_path = NULL, image_url = ?, caption = ?, sort_order = ?, updated_at = ?
         WHERE id = ?`,
        [imageUrl, caption, sortOrder, now, mediaId]
      );
    } else {
      const hasDisplay =
        (exists.image_path && String(exists.image_path).trim()) ||
        (exists.image_url && String(exists.image_url).trim());
      if (!hasDisplay) return res.status(400).json({ error: 'Photo invalide' });
      await execute(
        `UPDATE visit_media SET caption = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
        [caption, sortOrder, now, mediaId]
      );
    }
    const row = await queryOne('SELECT * FROM visit_media WHERE id = ?', [mediaId]);
    res.json(serializeVisitMedia(row));
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/media/:id', requirePermission('visit.manage', { needsElevation: true }), async (req, res) => {
  try {
    const mediaId = Number(req.params.id);
    if (!Number.isFinite(mediaId) || mediaId <= 0) return res.status(400).json({ error: 'Photo invalide' });
    const row = await queryOne('SELECT image_path FROM visit_media WHERE id = ? LIMIT 1', [mediaId]);
    if (row?.image_path) deleteFile(row.image_path);
    await execute('DELETE FROM visit_media WHERE id = ?', [mediaId]);
    res.json({ ok: true });
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/tutorials', requirePermission('visit.manage', { needsElevation: true }), async (req, res) => {
  try {
    const mapId = String(req.body.map_id || 'foret').trim();
    if (!mapId) return res.status(400).json({ error: 'map_id requis' });
    if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });
    const ids = Array.isArray(req.body.tutorial_ids) ? req.body.tutorial_ids : [];
    const uniqueIds = [...new Set(ids.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0))];
    await execute('DELETE FROM visit_tutorials WHERE map_id = ?', [mapId]);
    let order = 0;
    for (const id of uniqueIds) {
      const exists = await queryOne('SELECT id FROM tutorials WHERE id = ? LIMIT 1', [id]);
      if (!exists) continue;
      await execute(
        `INSERT INTO visit_tutorials (map_id, tutorial_id, is_active, sort_order, updated_at)
         VALUES (?, ?, 1, ?, ?)
         ON DUPLICATE KEY UPDATE is_active = 1, sort_order = VALUES(sort_order), updated_at = VALUES(updated_at)`,
        [mapId, id, order, nowIso()]
      );
      order += 1;
    }
    const rows = await queryAll(
      'SELECT * FROM visit_tutorials WHERE map_id = ? ORDER BY sort_order ASC, tutorial_id ASC',
      [mapId]
    );
    res.json(rows);
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
