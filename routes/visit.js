const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute } = require('../database');
const { requirePermission, JWT_SECRET, authenticate } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const asyncHandler = require('../lib/asyncHandler');
const { visitContentRowIsPublicActive } = require('../lib/visitContentPublicActive');
const { resolveDefaultMapId } = require('../lib/settings');
const {
  sanitizeTargetType,
  sanitizeTargetId,
  serializeVisitMedia,
  resolveVisitEditorialBlocksForContentRow,
  pickNewestMapPhotoByTarget,
  serializeMapLeadPhoto,
  serializeMapExtraPhotos,
  ratioPct,
} = require('../lib/visitContentHelpers');

const router = express.Router();

const ANON_COOKIE_NAME = 'anon_visit_token';
const ANON_TTL_SECONDS = 24 * 60 * 60;

function nowIso() {
  return new Date().toISOString();
}

async function resolveVisitMapId(rawMapId) {
  const requested = String(rawMapId || '').trim();
  if (requested) return requested;
  return resolveDefaultMapId('visit');
}

function visitCookieSecret() {
  const fromEnv = String(process.env.VISIT_COOKIE_SECRET || '').trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('VISIT_COOKIE_SECRET requis en production');
  }
  return JWT_SECRET || 'visit-dev-secret-change-me';
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
  res.append(
    'Set-Cookie',
    `${ANON_COOKIE_NAME}=${value}; Max-Age=${ANON_TTL_SECONDS}; Path=/; HttpOnly; SameSite=Lax${secure}`,
  );
}

function readOrCreateAnonToken(req, res) {
  const cookies = parseCookies(req);
  const existing = verifyAnonCookie(cookies[ANON_COOKIE_NAME]);
  if (existing) return existing;
  const created = uuidv4();
  setAnonCookie(res, created);
  return created;
}

async function mapExists(mapId) {
  const row = await queryOne('SELECT id FROM maps WHERE id = ? LIMIT 1', [mapId]);
  return !!row;
}

async function cleanupAnonymousSeen() {
  await execute(
    'DELETE FROM visit_seen_anonymous WHERE updated_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)',
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

router.get(
  '/stats',
  requirePermission('stats.read.all'),
  asyncHandler(async (req, res) => {
    await cleanupAnonymousSeen();

    const activeRow = await queryOne(
      `SELECT
       (SELECT COUNT(*) FROM visit_zones WHERE is_active = 1) AS active_zones,
       (SELECT COUNT(*) FROM visit_markers WHERE is_active = 1) AS active_markers`,
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
      [activeTargetsTotal],
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
      [activeTargetsTotal],
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
          completion_rate_pct: ratioPct(
            students.seen_actions,
            students.sessions * activeTargetsTotal,
          ),
          completed_visits_rate_pct: ratioPct(students.completed_visits, students.sessions),
        },
        anonymous: {
          ...anonymous,
          completion_rate_pct: ratioPct(
            anonymous.seen_actions,
            anonymous.sessions * activeTargetsTotal,
          ),
          completed_visits_rate_pct: ratioPct(anonymous.completed_visits, anonymous.sessions),
        },
      },
    });
  }),
);

router.get(
  '/content',
  asyncHandler(async (req, res) => {
    const mapId = await resolveVisitMapId(req.query.map_id);
    if (!mapId) return res.status(400).json({ error: 'map_id requis' });
    if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });

    const zones = await queryAll(
      `SELECT
       z.id, z.map_id, z.name, z.points,
       zm.description AS description,
       z.subtitle AS visit_subtitle,
       z.short_description AS visit_short_description,
       z.details_title AS visit_details_title,
       z.details_text AS visit_details_text,
       z.body_json AS visit_body_json,
       z.is_active AS visit_is_active,
       z.sort_order AS visit_sort_order
     FROM visit_zones z
     LEFT JOIN zones zm ON zm.id = z.id AND zm.map_id = z.map_id
     WHERE z.map_id = ?
     ORDER BY z.sort_order ASC, z.name ASC`,
      [mapId],
    );

    const markers = await queryAll(
      `SELECT
       m.id, m.map_id, m.x_pct, m.y_pct, m.label, m.emoji,
       mm.note AS note,
       m.subtitle AS visit_subtitle,
       m.short_description AS visit_short_description,
       m.details_title AS visit_details_title,
       m.details_text AS visit_details_text,
       m.body_json AS visit_body_json,
       m.is_active AS visit_is_active,
       m.sort_order AS visit_sort_order
     FROM visit_markers m
     LEFT JOIN map_markers mm ON mm.id = m.id AND mm.map_id = m.map_id
     WHERE m.map_id = ?
     ORDER BY m.sort_order ASC, m.label ASC`,
      [mapId],
    );

    const media = await queryAll(
      `SELECT vm.id, vm.target_type, vm.target_id, vm.image_url, vm.image_path, vm.caption, vm.sort_order
     FROM visit_media vm
     WHERE (vm.target_type = 'zone' AND vm.target_id IN (SELECT id FROM visit_zones WHERE map_id = ?))
        OR (vm.target_type = 'marker' AND vm.target_id IN (SELECT id FROM visit_markers WHERE map_id = ?))
     ORDER BY vm.sort_order ASC, vm.id ASC`,
      [mapId, mapId],
    );

    const mediaByTarget = media.reduce((acc, row) => {
      const key = `${row.target_type}:${row.target_id}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(serializeVisitMedia(row));
      return acc;
    }, {});

    const [zoneMapPhotoRows, markerMapPhotoRows] = await Promise.all([
      queryAll(
        `SELECT zp.zone_id AS target_id, zp.id, zp.caption, zp.uploaded_at, zp.sort_order, zp.image_path
       FROM zone_photos zp
       INNER JOIN visit_zones vz ON vz.id = zp.zone_id AND vz.map_id = ?
       ORDER BY zp.zone_id ASC, zp.sort_order ASC, zp.id ASC`,
        [mapId],
      ),
      queryAll(
        `SELECT mp.marker_id AS target_id, mp.id, mp.caption, mp.uploaded_at, mp.sort_order, mp.image_path
       FROM marker_photos mp
       INNER JOIN visit_markers vm ON vm.id = mp.marker_id AND vm.map_id = ?
       ORDER BY mp.marker_id ASC, mp.sort_order ASC, mp.id ASC`,
        [mapId],
      ),
    ]);
    const zoneMapLeadById = pickNewestMapPhotoByTarget(zoneMapPhotoRows);
    const markerMapLeadById = pickNewestMapPhotoByTarget(markerMapPhotoRows);

    const tutorials = await queryAll(
      `SELECT
       t.id, t.title, t.slug, t.type, t.summary, t.cover_image_url, t.source_url, t.source_file_path,
       vt.sort_order
     FROM visit_tutorials vt
     JOIN tutorials t ON t.id = vt.tutorial_id
     WHERE vt.map_id = ? AND vt.is_active = 1 AND t.is_active = 1
     ORDER BY vt.sort_order ASC, t.sort_order ASC, t.title ASC`,
      [mapId],
    );

    let mascotPacks = [];
    try {
      const packRows = await queryAll(
        `SELECT catalog_id, label, pack_json
       FROM visit_mascot_packs
       WHERE map_id = ? AND is_published = 1
       ORDER BY updated_at DESC, id ASC`,
        [mapId],
      );
      mascotPacks = (packRows || [])
        .map((r) => {
          let pack = {};
          try {
            pack = JSON.parse(r.pack_json);
          } catch (_) {
            pack = {};
          }
          return { catalog_id: r.catalog_id, label: r.label, pack };
        })
        .filter((x) => x.catalog_id && x.pack && typeof x.pack === 'object');
    } catch (packErr) {
      logRouteError(packErr, req);
      mascotPacks = [];
    }

    const payload = {
      map_id: mapId,
      mascot_packs: mascotPacks,
      zones: zones
        .filter((z) => visitContentRowIsPublicActive(z))
        .map((z) => {
          const visitMedia = mediaByTarget[`zone:${z.id}`] || [];
          return {
            ...z,
            map_lead_photo: serializeMapLeadPhoto('zone', z.id, zoneMapLeadById.get(String(z.id))),
            map_extra_photos: serializeMapExtraPhotos('zone', z.id, zoneMapPhotoRows),
            visit_media: visitMedia,
            visit_editorial_blocks: resolveVisitEditorialBlocksForContentRow(z, visitMedia),
          };
        }),
      markers: markers
        .filter((m) => visitContentRowIsPublicActive(m))
        .map((m) => {
          const visitMedia = mediaByTarget[`marker:${m.id}`] || [];
          return {
            ...m,
            map_lead_photo: serializeMapLeadPhoto(
              'marker',
              m.id,
              markerMapLeadById.get(String(m.id)),
            ),
            map_extra_photos: serializeMapExtraPhotos('marker', m.id, markerMapPhotoRows),
            visit_media: visitMedia,
            visit_editorial_blocks: resolveVisitEditorialBlocksForContentRow(m, visitMedia),
          };
        }),
      tutorials,
    };
    res.json(payload);
  }),
);

// O10 — sous-domaine « mascotte » extrait en sous-routeur dédié (chemins inchangés).
router.use(require('./visit/mascot'));

// O10 — sous-domaine « sync » extrait en sous-routeur dédié (chemins inchangés).
router.use(require('./visit/sync'));

// O10 — sous-domaine « media » extrait en sous-routeur dédié (chemins inchangés).
router.use(require('./visit/media'));

// O10 — sous-domaine « zones » (CRUD) extrait en sous-routeur dédié (chemins inchangés).
router.use(require('./visit/zones'));

// O10 — sous-domaine « markers » (CRUD) extrait en sous-routeur dédié (chemins inchangés).
router.use(require('./visit/markers'));

router.get(
  '/progress',
  authenticate,
  asyncHandler(async (req, res) => {
    const auth = req.auth;
    const queryStudentId = String(req.query.student_id || '').trim();

    if (auth && auth.userType === 'student') {
      const sid = String(auth.userId);
      if (queryStudentId && queryStudentId !== sid) {
        return res.status(403).json({ error: 'Accès refusé à la progression d’un autre compte.' });
      }
      const student = await queryOne(
        "SELECT id FROM users WHERE user_type = 'student' AND id = ? LIMIT 1",
        [sid],
      );
      if (!student) return res.status(403).json({ error: 'Compte élève invalide' });
      const rows = await queryAll(
        `SELECT target_type, target_id
       FROM visit_seen_students
       WHERE student_id = ?`,
        [sid],
      );
      return res.json({
        mode: 'student',
        seen: rows.map((r) => ({ target_type: r.target_type, target_id: r.target_id })),
      });
    }

    if (queryStudentId) {
      return res
        .status(401)
        .json({ error: 'Connexion requise pour consulter la progression sur un compte.' });
    }

    await cleanupAnonymousSeen();
    const anonToken = readOrCreateAnonToken(req, res);
    const rows = await queryAll(
      `SELECT target_type, target_id
     FROM visit_seen_anonymous
     WHERE anon_token = ?
       AND updated_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)`,
      [anonToken],
    );
    return res.json({
      mode: 'anonymous',
      seen: rows.map((r) => ({ target_type: r.target_type, target_id: r.target_id })),
    });
  }),
);

router.post(
  '/seen',
  authenticate,
  asyncHandler(async (req, res) => {
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
        return res
          .status(403)
          .json({ error: 'Tu ne peux pas modifier la progression d’un autre compte.' });
      }
      const student = await queryOne(
        "SELECT id FROM users WHERE user_type = 'student' AND id = ? LIMIT 1",
        [sid],
      );
      if (!student) return res.status(403).json({ error: 'Compte élève invalide' });
      if (seen) {
        await execute(
          `INSERT INTO visit_seen_students (student_id, target_type, target_id, seen_at, updated_at)
         VALUES (?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)`,
          [sid, targetType, targetId],
        );
      } else {
        await execute(
          `DELETE FROM visit_seen_students
         WHERE student_id = ? AND target_type = ? AND target_id = ?`,
          [sid, targetType, targetId],
        );
      }
      return res.json({ ok: true, mode: 'student' });
    }

    if (bodyStudentId) {
      return res
        .status(401)
        .json({ error: 'Connexion requise pour enregistrer la progression sur un compte.' });
    }

    await cleanupAnonymousSeen();
    const anonToken = readOrCreateAnonToken(req, res);
    if (seen) {
      await execute(
        `INSERT INTO visit_seen_anonymous (anon_token, target_type, target_id, updated_at)
       VALUES (?, ?, ?, UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)`,
        [anonToken, targetType, targetId],
      );
    } else {
      await execute(
        `DELETE FROM visit_seen_anonymous
       WHERE anon_token = ? AND target_type = ? AND target_id = ?`,
        [anonToken, targetType, targetId],
      );
    }
    return res.json({ ok: true, mode: 'anonymous' });
  }),
);

router.put(
  '/tutorials',
  requirePermission('visit.manage', { needsElevation: true }),
  asyncHandler(async (req, res) => {
    const mapId = await resolveVisitMapId(req.body.map_id);
    if (!mapId) return res.status(400).json({ error: 'map_id requis' });
    if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });
    const ids = Array.isArray(req.body.tutorial_ids) ? req.body.tutorial_ids : [];
    const uniqueIds = [
      ...new Set(ids.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0)),
    ];
    await execute('DELETE FROM visit_tutorials WHERE map_id = ?', [mapId]);
    let order = 0;
    for (const id of uniqueIds) {
      const exists = await queryOne('SELECT id FROM tutorials WHERE id = ? LIMIT 1', [id]);
      if (!exists) continue;
      await execute(
        `INSERT INTO visit_tutorials (map_id, tutorial_id, is_active, sort_order, updated_at)
       VALUES (?, ?, 1, ?, ?)
       ON DUPLICATE KEY UPDATE is_active = 1, sort_order = VALUES(sort_order), updated_at = VALUES(updated_at)`,
        [mapId, id, order, nowIso()],
      );
      order += 1;
    }
    const rows = await queryAll(
      'SELECT * FROM visit_tutorials WHERE map_id = ? ORDER BY sort_order ASC, tutorial_id ASC',
      [mapId],
    );
    res.json(rows);
  }),
);

module.exports = router;
