const express = require('express');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { queryAll, queryOne, execute, withTransaction } = require('../database');
const { authenticate, requirePermission, requireAuth } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const { emitTasksChanged } = require('../lib/realtime');
const { saveBase64ToDisk, deleteFile } = require('../lib/uploads');
const { resolveLocalTutorialFile, isAllowedSourceFilePath } = require('../lib/inlineLegacyTutorialHtml');

const router = express.Router();
const MAX_TUTORIAL_COVER_BYTES = 5 * 1024 * 1024;
const TUTORIAL_MANAGER_ROLES = new Set(['prof', 'admin']);
router.use(authenticate);

function canManageTutorials(req) {
  const perms = Array.isArray(req.auth?.permissions) ? req.auth.permissions : [];
  const roleSlug = String(req.auth?.roleSlug || '').toLowerCase();
  return perms.includes('tutorials.manage') && TUTORIAL_MANAGER_ROLES.has(roleSlug);
}

function normalizeString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function detectImageExtensionFromDataUrl(dataUrl) {
  const m = /^data:image\/(png|jpe?g|webp|gif|bmp|avif);base64,/i.exec(dataUrl || '');
  if (!m) return null;
  const ext = String(m[1]).toLowerCase();
  return ext === 'jpeg' ? 'jpg' : ext;
}

function extractUploadsRelativePath(value) {
  const raw = normalizeString(value);
  if (!raw) return null;
  if (raw.startsWith('/uploads/')) return raw.slice('/uploads/'.length);
  try {
    const u = new URL(raw);
    if (u.pathname.startsWith('/uploads/')) return u.pathname.slice('/uploads/'.length);
  } catch {
    return null;
  }
  return null;
}

function isLocalUploadsPath(value) {
  return /^\/uploads\/[^?#\s]+/i.test(normalizeString(value));
}

function isDirectImagePath(value) {
  const raw = normalizeString(value);
  return /\.(avif|bmp|gif|jpe?g|png|svg|webp)(?:$|\?)/i.test(raw);
}

function isDevLocalhostHttp(url) {
  if (!url || url.protocol !== 'http:') return false;
  return /^(localhost|127\.0\.0\.1)$/i.test(url.hostname);
}

function isDirectImageUrl(url) {
  const pathLower = (url?.pathname || '').toLowerCase();
  if (/\.(avif|bmp|gif|jpe?g|png|svg|webp)$/.test(pathLower)) return true;
  if (/\/wiki\/special:filepath\//.test(pathLower)) return true;
  return false;
}

/** Erreur texte ou null si la valeur est vide ou valide. */
function validateTutorialCoverImageUrl(value) {
  const raw = normalizeString(value);
  if (!raw) return null;
  if (isLocalUploadsPath(raw)) {
    if (!isDirectImagePath(raw)) return 'cover_image_url : chemin local invalide (extension image requise)';
    return null;
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    return 'cover_image_url : URL invalide';
  }
  if (url.protocol !== 'https:' && !isDevLocalhostHttp(url)) {
    return 'cover_image_url : seules les URLs HTTPS (ou localhost en dev) sont autorisées';
  }
  if (!isDirectImageUrl(url)) {
    return 'cover_image_url : URL d\'image directe requise (.jpg/.png/... ou /wiki/Special:FilePath/...)';
  }
  return null;
}

function normalizeIdArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((x) => (x != null ? String(x).trim() : '')).filter(Boolean))];
}

async function validateTutorialLocations(zoneIds, markerIds) {
  const z = normalizeIdArray(zoneIds);
  const m = normalizeIdArray(markerIds);
  const mapIds = new Set();
  for (const zid of z) {
    const row = await queryOne('SELECT id, map_id FROM zones WHERE id = ? LIMIT 1', [zid]);
    if (!row) return { error: 'Zone introuvable' };
    mapIds.add(row.map_id);
  }
  for (const mid of m) {
    const row = await queryOne('SELECT id, map_id FROM map_markers WHERE id = ? LIMIT 1', [mid]);
    if (!row) return { error: 'Repère introuvable' };
    mapIds.add(row.map_id);
  }
  const uniqueMaps = [...mapIds].filter(Boolean);
  if (uniqueMaps.length > 1) {
    return { error: 'Les zones et repères choisis doivent appartenir à la même carte' };
  }
  return { zoneIds: z, markerIds: m };
}

async function getTutorialZoneIds(tutorialId) {
  const rows = await queryAll('SELECT zone_id FROM tutorial_zones WHERE tutorial_id = ? ORDER BY zone_id', [
    tutorialId,
  ]);
  return rows.map((r) => String(r.zone_id).trim()).filter(Boolean);
}

async function getTutorialMarkerIds(tutorialId) {
  const rows = await queryAll('SELECT marker_id FROM tutorial_markers WHERE tutorial_id = ? ORDER BY marker_id', [
    tutorialId,
  ]);
  return rows.map((r) => String(r.marker_id).trim()).filter(Boolean);
}

async function replaceTutorialZonesMarkers(tutorialId, zoneIds, markerIds) {
  const tid = Number(tutorialId);
  if (!Number.isFinite(tid) || tid <= 0) return;
  const z = normalizeIdArray(zoneIds);
  const m = normalizeIdArray(markerIds);
  await execute('DELETE FROM tutorial_zones WHERE tutorial_id = ?', [tid]);
  await execute('DELETE FROM tutorial_markers WHERE tutorial_id = ?', [tid]);
  for (const zid of z) {
    await execute('INSERT INTO tutorial_zones (tutorial_id, zone_id) VALUES (?, ?)', [tid, zid]);
  }
  for (const mid of m) {
    await execute('INSERT INTO tutorial_markers (tutorial_id, marker_id) VALUES (?, ?)', [tid, mid]);
  }
}

async function fetchZonesForTutorials(tutorialIds) {
  const ids = [...new Set(tutorialIds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return new Map();
  const ph = ids.map(() => '?').join(',');
  const rows = await queryAll(
    `SELECT tz.tutorial_id, z.id AS zone_id, z.name AS zone_name, z.map_id
       FROM tutorial_zones tz
       INNER JOIN zones z ON z.id = tz.zone_id
      WHERE tz.tutorial_id IN (${ph})
      ORDER BY z.name`,
    ids
  );
  const map = new Map();
  for (const r of rows) {
    const tid = Number(r.tutorial_id);
    if (!map.has(tid)) map.set(tid, []);
    map.get(tid).push({ id: r.zone_id, name: r.zone_name, map_id: r.map_id });
  }
  return map;
}

async function fetchMarkersForTutorials(tutorialIds) {
  const ids = [...new Set(tutorialIds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return new Map();
  const ph = ids.map(() => '?').join(',');
  const rows = await queryAll(
    `SELECT tm.tutorial_id, m.id AS marker_id, m.label AS marker_label, m.map_id
       FROM tutorial_markers tm
       INNER JOIN map_markers m ON m.id = tm.marker_id
      WHERE tm.tutorial_id IN (${ph})
      ORDER BY m.label`,
    ids
  );
  const map = new Map();
  for (const r of rows) {
    const tid = Number(r.tutorial_id);
    if (!map.has(tid)) map.set(tid, []);
    map.get(tid).push({ id: r.marker_id, label: r.marker_label, map_id: r.map_id });
  }
  return map;
}

/** Cartes concernées par le tutoriel (tâches liées + zones/repères directs). Temps réel ciblé. */
async function mapIdsLinkedToTutorial(tutorialId) {
  const tid = Number(tutorialId);
  if (!Number.isFinite(tid)) return [];
  const rows = await queryAll(
    `SELECT DISTINCT x.map_id AS map_id FROM (
       SELECT t.map_id AS map_id FROM task_tutorials tt
       INNER JOIN tasks t ON t.id = tt.task_id
       WHERE tt.tutorial_id = ?
         AND t.map_id IS NOT NULL
         AND TRIM(COALESCE(t.map_id, '')) <> ''
       UNION
       SELECT z.map_id FROM tutorial_zones tzu
       INNER JOIN zones z ON z.id = tzu.zone_id
       WHERE tzu.tutorial_id = ?
         AND z.map_id IS NOT NULL
         AND TRIM(COALESCE(z.map_id, '')) <> ''
       UNION
       SELECT mk.map_id FROM tutorial_markers tzm
       INNER JOIN map_markers mk ON mk.id = tzm.marker_id
       WHERE tzm.tutorial_id = ?
         AND mk.map_id IS NOT NULL
         AND TRIM(COALESCE(mk.map_id, '')) <> ''
     ) x`,
    [tid, tid, tid]
  );
  return [...new Set(rows.map((r) => String(r.map_id).trim()).filter(Boolean))];
}

async function emitTutorialTasksChanged(reason, tutorialId) {
  const mapIds = await mapIdsLinkedToTutorial(tutorialId);
  const base = { reason, tutorialId };
  if (mapIds.length > 0) {
    for (const mapId of mapIds) {
      emitTasksChanged({ ...base, mapId });
    }
  } else {
    emitTasksChanged(base);
  }
}

/** Zones liées (N-N) pour résoudre la carte des tâches — aligné sur `routes/tasks.js`. */
async function fetchZonesForLinkedTasks(taskIds) {
  if (!taskIds.length) return new Map();
  const ph = taskIds.map(() => '?').join(',');
  const rows = await queryAll(
    `SELECT tz.task_id, z.id AS zone_id, z.name AS zone_name, z.map_id
       FROM task_zones tz
       INNER JOIN zones z ON z.id = tz.zone_id
      WHERE tz.task_id IN (${ph})
      ORDER BY z.name`,
    taskIds
  );
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.task_id)) m.set(r.task_id, []);
    m.get(r.task_id).push({ id: r.zone_id, name: r.zone_name, map_id: r.map_id });
  }
  return m;
}

async function fetchMarkersForLinkedTasks(taskIds) {
  if (!taskIds.length) return new Map();
  const ph = taskIds.map(() => '?').join(',');
  const rows = await queryAll(
    `SELECT tm.task_id, m.id AS marker_id, m.label AS marker_label, m.map_id
       FROM task_markers tm
       INNER JOIN map_markers m ON m.id = tm.marker_id
      WHERE tm.task_id IN (${ph})
      ORDER BY m.label`,
    taskIds
  );
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.task_id)) m.set(r.task_id, []);
    m.get(r.task_id).push({ id: r.marker_id, label: r.marker_label, map_id: r.map_id });
  }
  return m;
}

function resolveLinkedTaskMapId(taskRow, zl, ml) {
  const mapsFromLinks = [
    ...new Set([...zl.map((z) => z.map_id), ...ml.map((x) => x.map_id)].filter(Boolean)),
  ];
  if (mapsFromLinks.length === 1) return mapsFromLinks[0];
  if (mapsFromLinks.length === 0) return taskRow.map_id || null;
  return mapsFromLinks[0];
}

function isValidHttpUrl(value) {
  if (!value) return false;
  try {
    const u = new URL(String(value));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function sanitizeSortOrder(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function slugify(input) {
  return normalizeString(input)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180) || 'tuto';
}

async function uniqueSlug(baseSlug, excludeId = null) {
  let candidate = baseSlug || 'tuto';
  let i = 2;
  while (true) {
    const row = await queryOne('SELECT id FROM tutorials WHERE slug = ? LIMIT 1', [candidate]);
    if (!row || (excludeId != null && Number(row.id) === Number(excludeId))) return candidate;
    candidate = `${baseSlug}-${i}`;
    i += 1;
  }
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function htmlToPlainText(html) {
  const raw = String(html || '');
  const noScript = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const withBreaks = noScript
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|section|article|br)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ');
  const noTags = withBreaks.replace(/<[^>]+>/g, ' ');
  const decoded = decodeHtmlEntities(noTags);
  return decoded
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function htmlToPdfBuffer(title, html) {
  const text = htmlToPlainText(html);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 48, bottom: 48, left: 48, right: 48 },
      info: { Title: title || 'Tutoriel ForetMap' },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text(title || 'Tutoriel ForetMap', { align: 'left' });
    doc.moveDown(0.6);
    doc.fontSize(10).fillColor('#5b6456').text('Export PDF généré automatiquement par ForetMap');
    doc.moveDown(1.2);
    doc.fillColor('#111111').fontSize(11).text(text || 'Contenu vide.', {
      lineGap: 3,
      paragraphGap: 8,
      align: 'left',
    });
    doc.end();
  });
}

async function loadTutorialHtml(tutorial) {
  if (tutorial.html_content && String(tutorial.html_content).trim()) {
    const content = String(tutorial.html_content);
    const hasHtmlTag = /<html[\s>]/i.test(content);
    if (hasHtmlTag) return content;
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${tutorial.title}</title></head><body>${content}</body></html>`;
  }
  if (tutorial.source_file_path) {
    const abs = resolveLocalTutorialFile(tutorial.source_file_path);
    if (!abs || !fs.existsSync(abs)) return null;
    return fs.readFileSync(abs, 'utf8');
  }
  return null;
}

/** Réécrit les clics `target="_blank"` pour rester dans l’iframe (modale app). */
const TUTORIAL_VIEW_IFRAME_LINK_SCRIPT = `<script>(function(){document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a)return;var href=(a.getAttribute("href")||"").trim();if(!href||href.toLowerCase().startsWith("javascript:"))return;var t=(a.getAttribute("target")||"").toLowerCase();if(t==="_blank"||t==="_top"){e.preventDefault();window.location.href=a.href;}},true);})();<\/script>`;

function injectTutorialViewIframeLinkScript(html) {
  const s = String(html || '');
  if (!s.trim()) return s;
  const replaced = s.replace(/<\/body\s*>/i, `${TUTORIAL_VIEW_IFRAME_LINK_SCRIPT}</body>`);
  if (replaced !== s) return replaced;
  return `${s}${TUTORIAL_VIEW_IFRAME_LINK_SCRIPT}`;
}

function toPublicTutorialRow(row, zonesLinked = [], markersLinked = []) {
  const zl = zonesLinked || [];
  const ml = markersLinked || [];
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    type: row.type,
    summary: row.summary || '',
    cover_image_url: row.cover_image_url || null,
    source_url: row.source_url || null,
    source_file_path: row.source_file_path || null,
    is_active: Number(row.is_active) === 1,
    sort_order: Number(row.sort_order) || 0,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    linked_tasks_count: Number(row.linked_tasks_count) || 0,
    zone_ids: zl.map((z) => z.id),
    marker_ids: ml.map((x) => x.id),
    zones_linked: zl.map((z) => ({ id: z.id, name: z.name, map_id: z.map_id })),
    markers_linked: ml.map((x) => ({ id: x.id, label: x.label, map_id: x.map_id })),
  };
}

router.get('/', async (req, res) => {
  try {
    const includeInactiveRequested = String(req.query.include_inactive || '') === '1';
    if (includeInactiveRequested && !canManageTutorials(req)) {
      return res.status(403).json({ error: 'Permission insuffisante' });
    }
    const includeInactive = includeInactiveRequested && canManageTutorials(req);
    const where = includeInactive ? '' : 'WHERE t.is_active = 1';
    const rows = await queryAll(
      `SELECT t.*, COUNT(tt.task_id) AS linked_tasks_count
         FROM tutorials t
         LEFT JOIN task_tutorials tt ON tt.tutorial_id = t.id
         ${where}
         GROUP BY t.id
         ORDER BY t.sort_order ASC, t.title ASC`
    );
    const tids = rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0);
    const zMap = await fetchZonesForTutorials(tids);
    const mMap = await fetchMarkersForTutorials(tids);
    res.json(
      rows.map((r) => {
        const id = Number(r.id);
        return toPublicTutorialRow(r, zMap.get(id) || [], mMap.get(id) || []);
      })
    );
  } catch (err) {
    logRouteError(err, req, 'Liste tutoriels en échec');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/** Identifiants des tutoriels que l’utilisateur connecté a marqués comme lus (engagement). */
router.get('/me/read-ids', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    if (userId == null || userId === '') {
      return res.status(403).json({ error: 'Profil utilisateur invalide' });
    }
    const rows = await queryAll(
      'SELECT tutorial_id FROM user_tutorial_reads WHERE user_id = ? ORDER BY tutorial_id ASC',
      [String(userId)]
    );
    res.json({ tutorial_ids: rows.map((r) => Number(r.tutorial_id)).filter((n) => Number.isFinite(n)) });
  } catch (err) {
    logRouteError(err, req, 'Liste tutoriels lus en échec');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Enregistre l’engagement « j’ai lu et compris » pour un tutoriel actif.
 * Corps JSON : { "confirm": true } (obligatoire).
 */
router.post('/:id/acknowledge-read', requireAuth, async (req, res) => {
  try {
    if (!req.body || req.body.confirm !== true) {
      return res.status(400).json({ error: 'Confirmation explicite requise (confirm: true)' });
    }
    const userId = req.auth.userId;
    if (userId == null || userId === '') {
      return res.status(403).json({ error: 'Profil utilisateur invalide' });
    }
    const tid = Number(req.params.id);
    if (!Number.isFinite(tid) || tid <= 0) {
      return res.status(400).json({ error: 'Identifiant de tutoriel invalide' });
    }
    const tutorial = await queryOne('SELECT id FROM tutorials WHERE id = ? AND is_active = 1', [tid]);
    if (!tutorial) return res.status(404).json({ error: 'Tutoriel introuvable' });
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO user_tutorial_reads (user_id, tutorial_id, acknowledged_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE acknowledged_at = VALUES(acknowledged_at)`,
      [String(userId), tid, now]
    );
    res.json({ success: true, tutorial_id: tid, acknowledged_at: now });
  } catch (err) {
    logRouteError(err, req, 'Accusé lecture tutoriel en échec');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

function buildLinkedTaskLocationHint(zoneName, markerLabel) {
  const z = zoneName ? String(zoneName).trim() : '';
  const m = markerLabel ? String(markerLabel).trim() : '';
  if (z && m) return `${z} · ${m}`;
  if (z) return z;
  if (m) return m;
  return '';
}

/**
 * Tâches associées au tutoriel (`task_tutorials`), avec carte et indice de lieu.
 * Query : `include_inactive=1` pour un tutoriel archivé (gestionnaires uniquement).
 */
router.get('/:id/linked-tasks', async (req, res) => {
  try {
    const tid = Number(req.params.id);
    if (!Number.isFinite(tid) || tid <= 0) {
      return res.status(400).json({ error: 'Identifiant de tutoriel invalide' });
    }
    const includeInactive = String(req.query.include_inactive || '') === '1' && canManageTutorials(req);
    const tutorial = await queryOne(
      includeInactive ? 'SELECT id FROM tutorials WHERE id = ?' : 'SELECT id FROM tutorials WHERE id = ? AND is_active = 1',
      [tid]
    );
    if (!tutorial) return res.status(404).json({ error: 'Tutoriel introuvable' });

    const taskRows = await queryAll(
      `SELECT t.id, t.title, t.status, t.map_id
         FROM task_tutorials tt
         INNER JOIN tasks t ON t.id = tt.task_id
        WHERE tt.tutorial_id = ?
        ORDER BY t.title ASC`,
      [tid]
    );
    const taskIds = taskRows.map((r) => r.id);
    const [zm, mm] = await Promise.all([fetchZonesForLinkedTasks(taskIds), fetchMarkersForLinkedTasks(taskIds)]);

    const items = taskRows.map((t) => {
      const zl = zm.get(t.id) || [];
      const ml = mm.get(t.id) || [];
      const map_id = resolveLinkedTaskMapId(t, zl, ml);
      const zoneFirst = zl[0]?.name || null;
      const markerFirst = ml[0]?.label || null;
      return {
        id: t.id,
        title: t.title,
        status: t.status,
        map_id,
        location_hint: zoneFirst || markerFirst || null,
      };
    });

    const mapIds = [...new Set(items.map((i) => i.map_id).filter(Boolean))];
    let labelByMap = {};
    if (mapIds.length) {
      const ph = mapIds.map(() => '?').join(',');
      const mrows = await queryAll(`SELECT id, label FROM maps WHERE id IN (${ph})`, mapIds);
      labelByMap = Object.fromEntries(mrows.map((r) => [r.id, r.label]));
    }
    const linkedTasks = items.map((i) => ({
      ...i,
      map_label: i.map_id && labelByMap[i.map_id] ? labelByMap[i.map_id] : null,
    }));
    res.json({ tasks: linkedTasks });
  } catch (err) {
    logRouteError(err, req, 'Tâches liées au tutoriel en échec');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const includeContent = String(req.query.include_content || '') === '1';
    const includeInactiveRequested = String(req.query.include_inactive || '') === '1';
    if (includeInactiveRequested && !canManageTutorials(req)) {
      return res.status(403).json({ error: 'Permission insuffisante' });
    }
    const includeInactive = includeInactiveRequested && canManageTutorials(req);
    const row = await queryOne(
      `SELECT t.*, COUNT(tt.task_id) AS linked_tasks_count
         FROM tutorials t
         LEFT JOIN task_tutorials tt ON tt.tutorial_id = t.id
        WHERE t.id = ?
        GROUP BY t.id`,
      [req.params.id]
    );
    if (!row || (!includeInactive && Number(row.is_active) !== 1)) {
      return res.status(404).json({ error: 'Tutoriel introuvable' });
    }
    const tid = Number(row.id);
    const zMap = await fetchZonesForTutorials([tid]);
    const mMap = await fetchMarkersForTutorials([tid]);
    const out = toPublicTutorialRow(row, zMap.get(tid) || [], mMap.get(tid) || []);
    if (includeContent) out.html_content = row.html_content || null;
    res.json(out);
  } catch (err) {
    logRouteError(err, req, 'Détail tutoriel en échec');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', requirePermission('tutorials.manage', { needsElevation: true }), async (req, res) => {
  try {
    if (!canManageTutorials(req)) return res.status(403).json({ error: 'Permission insuffisante' });
    const title = normalizeString(req.body.title);
    const type = normalizeString(req.body.type || 'html').toLowerCase();
    const summary = normalizeString(req.body.summary);
    let coverImageUrl = null;
    if (Object.prototype.hasOwnProperty.call(req.body, 'cover_image_url')) {
      coverImageUrl = normalizeString(req.body.cover_image_url) || null;
      const coverErr = validateTutorialCoverImageUrl(coverImageUrl || '');
      if (coverErr) return res.status(400).json({ error: coverErr });
    }
    let htmlContent = req.body.html_content != null ? String(req.body.html_content) : null;
    const sourceUrl = normalizeString(req.body.source_url) || null;
    let sourceFilePath = normalizeString(req.body.source_file_path) || null;
    const sortOrder = sanitizeSortOrder(req.body.sort_order);

    if (!title) return res.status(400).json({ error: 'Titre requis' });
    if (!['html', 'link', 'pdf'].includes(type)) return res.status(400).json({ error: 'Type invalide' });

    if (type === 'link' && !isValidHttpUrl(sourceUrl)) {
      return res.status(400).json({ error: 'URL du tutoriel invalide' });
    }
    if (type === 'html') {
      const hasHtml = !!(htmlContent && htmlContent.trim());
      const hasFile = !!sourceFilePath;
      if (!hasHtml && !hasFile) {
        return res.status(400).json({ error: 'Un contenu HTML ou un fichier source est requis' });
      }
      if (hasFile && !hasHtml) {
        if (!isAllowedSourceFilePath(sourceFilePath)) {
          return res.status(400).json({ error: 'Chemin de fichier source non autorisé' });
        }
        const abs = resolveLocalTutorialFile(sourceFilePath);
        if (!abs || !fs.existsSync(abs)) {
          return res.status(400).json({ error: 'Fichier source introuvable' });
        }
        try {
          htmlContent = fs.readFileSync(abs, 'utf8');
        } catch (e) {
          return res.status(400).json({ error: 'Lecture du fichier source impossible' });
        }
        sourceFilePath = null;
      }
    }
    if (sourceFilePath && !isAllowedSourceFilePath(sourceFilePath)) {
      return res.status(400).json({ error: 'Chemin de fichier source non autorisé' });
    }

    const baseSlug = slugify(req.body.slug || title);
    const slug = await uniqueSlug(baseSlug);
    const now = new Date().toISOString();
    const result = await execute(
      `INSERT INTO tutorials
        (title, slug, type, summary, cover_image_url, html_content, source_url, source_file_path, is_active, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [title, slug, type, summary || null, coverImageUrl, htmlContent, sourceUrl, sourceFilePath, sortOrder, now, now]
    );
    const createdId = result.insertId;
    let zIds = [];
    let mIds = [];
    if (Object.prototype.hasOwnProperty.call(req.body, 'zone_ids')) {
      zIds = normalizeIdArray(req.body.zone_ids);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'marker_ids')) {
      mIds = normalizeIdArray(req.body.marker_ids);
    }
    if (
      Object.prototype.hasOwnProperty.call(req.body, 'zone_ids')
      || Object.prototype.hasOwnProperty.call(req.body, 'marker_ids')
    ) {
      const loc = await validateTutorialLocations(zIds, mIds);
      if (loc.error) return res.status(400).json({ error: loc.error });
      await replaceTutorialZonesMarkers(createdId, loc.zoneIds, loc.markerIds);
    }
    const created = await queryOne('SELECT * FROM tutorials WHERE id = ?', [createdId]);
    const zMap = await fetchZonesForTutorials([createdId]);
    const mMap = await fetchMarkersForTutorials([createdId]);
    await emitTutorialTasksChanged('tutorial_create', createdId);
    res.status(201).json(
      toPublicTutorialRow({ ...created, linked_tasks_count: 0 }, zMap.get(createdId) || [], mMap.get(createdId) || [])
    );
  } catch (err) {
    logRouteError(err, req, 'Création tutoriel en échec');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post(
  '/:id/cover-photo-upload',
  requirePermission('tutorials.manage', { needsElevation: true }),
  async (req, res) => {
    try {
      if (!canManageTutorials(req)) return res.status(403).json({ error: 'Permission insuffisante' });
      const tid = Number(req.params.id);
      if (!Number.isFinite(tid) || tid <= 0) {
        return res.status(400).json({ error: 'Identifiant de tutoriel invalide' });
      }
      const tutorial = await queryOne('SELECT * FROM tutorials WHERE id = ?', [tid]);
      if (!tutorial) return res.status(404).json({ error: 'Tutoriel introuvable' });

      const imageData = normalizeString(req.body?.imageData);
      if (!imageData) return res.status(400).json({ error: 'Image requise' });

      const ext = detectImageExtensionFromDataUrl(imageData);
      if (!ext) {
        return res.status(400).json({ error: 'Format image invalide (png/jpg/webp/gif/bmp/avif)' });
      }
      const base64Payload = imageData.includes(',') ? imageData.split(',')[1] : imageData;
      const bytes = Buffer.byteLength(base64Payload, 'base64');
      if (bytes > MAX_TUTORIAL_COVER_BYTES) {
        return res.status(400).json({ error: 'Image trop lourde (max 5 Mo)' });
      }

      const relativePath = `tutorials/${tid}/cover-${Date.now()}.${ext}`;
      saveBase64ToDisk(relativePath, imageData);
      const publicUrl = `/uploads/${relativePath}`;

      const previousRelativePath = extractUploadsRelativePath(tutorial.cover_image_url);
      if (previousRelativePath && previousRelativePath !== relativePath) {
        deleteFile(previousRelativePath);
      }

      const now = new Date().toISOString();
      await execute('UPDATE tutorials SET cover_image_url = ?, updated_at = ? WHERE id = ?', [publicUrl, now, tid]);
      const updated = await queryOne('SELECT * FROM tutorials WHERE id = ?', [tid]);
      const linked = await queryOne('SELECT COUNT(*) AS c FROM task_tutorials WHERE tutorial_id = ?', [tid]);
      const zMap = await fetchZonesForTutorials([tid]);
      const mMap = await fetchMarkersForTutorials([tid]);
      await emitTutorialTasksChanged('tutorial_update', tid);
      res.json({
        url: publicUrl,
        tutorial: toPublicTutorialRow(
          { ...updated, linked_tasks_count: linked?.c || 0 },
          zMap.get(tid) || [],
          mMap.get(tid) || []
        ),
      });
    } catch (err) {
      logRouteError(err, req, 'Upload couverture tutoriel en échec');
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

router.put(
  '/reorder',
  requirePermission('tutorials.manage', { needsElevation: true }),
  async (req, res) => {
    try {
      if (!canManageTutorials(req)) return res.status(403).json({ error: 'Permission insuffisante' });
      const rawIds = Array.isArray(req.body.tutorial_ids) ? req.body.tutorial_ids : [];
      const seen = new Set();
      const normalized = [];
      for (const v of rawIds) {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) {
          return res.status(400).json({ error: 'Identifiants de tutoriels invalides' });
        }
        if (seen.has(n)) {
          return res.status(400).json({ error: 'Chaque tutoriel ne doit apparaître qu’une fois' });
        }
        seen.add(n);
        normalized.push(n);
      }

      const allRows = await queryAll('SELECT id FROM tutorials');
      const allIds = new Set(allRows.map((r) => Number(r.id)));
      if (normalized.length !== allIds.size) {
        return res.status(400).json({
          error: 'La liste doit contenir tous les tutoriels exactement une fois',
        });
      }
      for (const id of normalized) {
        if (!allIds.has(id)) {
          return res.status(400).json({ error: 'Tutoriel inconnu' });
        }
      }

      const now = new Date().toISOString();
      await withTransaction(async (tx) => {
        for (let i = 0; i < normalized.length; i += 1) {
          await tx.execute('UPDATE tutorials SET sort_order = ?, updated_at = ? WHERE id = ?', [
            i,
            now,
            normalized[i],
          ]);
        }
      });

      res.json({ success: true });
    } catch (err) {
      logRouteError(err, req, 'Réordonnancement tutoriels en échec');
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

router.put('/:id', requirePermission('tutorials.manage', { needsElevation: true }), async (req, res) => {
  try {
    if (!canManageTutorials(req)) return res.status(403).json({ error: 'Permission insuffisante' });
    const existing = await queryOne('SELECT * FROM tutorials WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Tutoriel introuvable' });

    const nextTitle = req.body.title != null ? normalizeString(req.body.title) : existing.title;
    const nextType = req.body.type != null ? normalizeString(req.body.type).toLowerCase() : existing.type;
    const nextSummary = req.body.summary != null ? normalizeString(req.body.summary) : (existing.summary || '');
    let nextCoverImageUrl = existing.cover_image_url || null;
    if (Object.prototype.hasOwnProperty.call(req.body, 'cover_image_url')) {
      nextCoverImageUrl = normalizeString(req.body.cover_image_url) || null;
      const coverErr = validateTutorialCoverImageUrl(nextCoverImageUrl || '');
      if (coverErr) return res.status(400).json({ error: coverErr });
    }
    let nextHtml = req.body.html_content !== undefined ? (req.body.html_content != null ? String(req.body.html_content) : null) : existing.html_content;
    const nextSourceUrl = req.body.source_url !== undefined ? (normalizeString(req.body.source_url) || null) : existing.source_url;
    let nextSourceFilePath = req.body.source_file_path !== undefined ? (normalizeString(req.body.source_file_path) || null) : existing.source_file_path;
    const nextSortOrder = req.body.sort_order !== undefined ? sanitizeSortOrder(req.body.sort_order) : existing.sort_order;
    const nextIsActive = req.body.is_active !== undefined ? (req.body.is_active ? 1 : 0) : existing.is_active;

    if (!nextTitle) return res.status(400).json({ error: 'Titre requis' });
    if (!['html', 'link', 'pdf'].includes(nextType)) return res.status(400).json({ error: 'Type invalide' });
    if (nextType === 'link' && !isValidHttpUrl(nextSourceUrl)) {
      return res.status(400).json({ error: 'URL du tutoriel invalide' });
    }
    if (nextType === 'html') {
      const hasH = !!(nextHtml && String(nextHtml).trim());
      const hasF = !!nextSourceFilePath;
      if (!hasH && !hasF) {
        return res.status(400).json({ error: 'Un contenu HTML ou un fichier source est requis' });
      }
      if (hasF && !hasH) {
        if (!isAllowedSourceFilePath(nextSourceFilePath)) {
          return res.status(400).json({ error: 'Chemin de fichier source non autorisé' });
        }
        const abs = resolveLocalTutorialFile(nextSourceFilePath);
        if (!abs || !fs.existsSync(abs)) {
          return res.status(400).json({ error: 'Fichier source introuvable' });
        }
        try {
          nextHtml = fs.readFileSync(abs, 'utf8');
        } catch (e) {
          return res.status(400).json({ error: 'Lecture du fichier source impossible' });
        }
        nextSourceFilePath = null;
      }
    }
    if (nextSourceFilePath && !isAllowedSourceFilePath(nextSourceFilePath)) {
      return res.status(400).json({ error: 'Chemin de fichier source non autorisé' });
    }

    let nextSlug = existing.slug;
    if (req.body.slug !== undefined || req.body.title !== undefined) {
      nextSlug = await uniqueSlug(slugify(req.body.slug || nextTitle), existing.id);
    }

    const existingId = Number(existing.id);
    let nextZoneIds;
    if (Object.prototype.hasOwnProperty.call(req.body, 'zone_ids')) {
      nextZoneIds = normalizeIdArray(req.body.zone_ids);
    } else {
      nextZoneIds = await getTutorialZoneIds(existingId);
    }
    let nextMarkerIds;
    if (Object.prototype.hasOwnProperty.call(req.body, 'marker_ids')) {
      nextMarkerIds = normalizeIdArray(req.body.marker_ids);
    } else {
      nextMarkerIds = await getTutorialMarkerIds(existingId);
    }
    const loc = await validateTutorialLocations(nextZoneIds, nextMarkerIds);
    if (loc.error) return res.status(400).json({ error: loc.error });

    const prevCoverNorm = normalizeString(existing.cover_image_url);
    const nextCoverNorm = normalizeString(nextCoverImageUrl);
    if (prevCoverNorm && prevCoverNorm !== nextCoverNorm) {
      const rel = extractUploadsRelativePath(existing.cover_image_url);
      if (rel) deleteFile(rel);
    }

    const now = new Date().toISOString();
    await execute(
      `UPDATE tutorials
          SET title = ?, slug = ?, type = ?, summary = ?, cover_image_url = ?, html_content = ?, source_url = ?, source_file_path = ?,
              is_active = ?, sort_order = ?, updated_at = ?
        WHERE id = ?`,
      [
        nextTitle,
        nextSlug,
        nextType,
        nextSummary || null,
        nextCoverImageUrl,
        nextHtml,
        nextSourceUrl,
        nextSourceFilePath,
        nextIsActive,
        nextSortOrder,
        now,
        req.params.id,
      ]
    );
    await replaceTutorialZonesMarkers(existingId, loc.zoneIds, loc.markerIds);
    const updated = await queryOne('SELECT * FROM tutorials WHERE id = ?', [req.params.id]);
    const linked = await queryOne('SELECT COUNT(*) AS c FROM task_tutorials WHERE tutorial_id = ?', [req.params.id]);
    const zMap = await fetchZonesForTutorials([existingId]);
    const mMap = await fetchMarkersForTutorials([existingId]);
    await emitTutorialTasksChanged('tutorial_update', existingId);
    res.json(
      toPublicTutorialRow({ ...updated, linked_tasks_count: linked?.c || 0 }, zMap.get(existingId) || [], mMap.get(existingId) || [])
    );
  } catch (err) {
    logRouteError(err, req, 'Mise à jour tutoriel en échec');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', requirePermission('tutorials.manage', { needsElevation: true }), async (req, res) => {
  try {
    if (!canManageTutorials(req)) return res.status(403).json({ error: 'Permission insuffisante' });
    const existing = await queryOne('SELECT id FROM tutorials WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Tutoriel introuvable' });
    await execute('UPDATE tutorials SET is_active = 0, updated_at = ? WHERE id = ?', [new Date().toISOString(), req.params.id]);
    await emitTutorialTasksChanged('tutorial_delete', Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    logRouteError(err, req, 'Suppression tutoriel en échec');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:id/download/html', async (req, res) => {
  try {
    const tutorial = await queryOne('SELECT * FROM tutorials WHERE id = ? AND is_active = 1', [req.params.id]);
    if (!tutorial) return res.status(404).json({ error: 'Tutoriel introuvable' });
    const html = await loadTutorialHtml(tutorial);
    if (!html) return res.status(400).json({ error: 'Ce tutoriel ne possède pas de contenu HTML téléchargeable' });
    const filename = `${tutorial.slug || 'tutoriel'}.html`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(html);
  } catch (err) {
    logRouteError(err, req, 'Téléchargement HTML tutoriel en échec');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:id/view', async (req, res) => {
  try {
    const tutorial = await queryOne('SELECT * FROM tutorials WHERE id = ? AND is_active = 1', [req.params.id]);
    if (!tutorial) return res.status(404).send('Tutoriel introuvable');
    const html = await loadTutorialHtml(tutorial);
    if (!html) return res.status(400).send('Aucun contenu HTML');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(injectTutorialViewIframeLinkScript(html));
  } catch (err) {
    logRouteError(err, req, 'Prévisualisation tutoriel en échec');
    res.status(500).send('Erreur serveur');
  }
});

router.get('/:id/download/pdf', async (req, res) => {
  try {
    const tutorial = await queryOne('SELECT * FROM tutorials WHERE id = ? AND is_active = 1', [req.params.id]);
    if (!tutorial) return res.status(404).json({ error: 'Tutoriel introuvable' });
    const html = await loadTutorialHtml(tutorial);
    if (!html) return res.status(400).json({ error: 'Génération PDF disponible uniquement pour les tutoriels HTML' });
    const pdfBuffer = await htmlToPdfBuffer(tutorial.title, html);
    const filename = `${tutorial.slug || 'tutoriel'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    logRouteError(err, req, 'Téléchargement PDF tutoriel en échec');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
