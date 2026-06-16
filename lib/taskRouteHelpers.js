'use strict';

/**
 * Logique pure de `routes/tasks.js` (O10) : normalisations de payload, validations de
 * champs, transformations lignes SQL → objets publics des tâches, calculs de dates.
 * Aucune I/O directe, aucun accès req/res/DB.
 */

const { isSafePublicTaskImageRelativePath } = require('./uploadsPublicUrls');
const { normalizeTaskStatusForRead } = require('./taskStatusRecalc');

const ALLOWED_TASK_STATUSES = new Set([
  'available',
  'in_progress',
  'done',
  'validated',
  'proposed',
  'on_hold',
]);
const ALLOWED_TASK_DANGER_LEVELS = new Set([
  'safe',
  'potential_danger',
  'dangerous',
  'very_dangerous',
]);
const ALLOWED_TASK_DIFFICULTY_LEVELS = new Set(['easy', 'medium', 'hard', 'very_hard']);
const ALLOWED_TASK_IMPORTANCE_LEVELS = new Set([
  'not_important',
  'low',
  'medium',
  'high',
  'absolute',
]);

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizeOptionalString(value) {
  const s = asTrimmedString(value);
  return s ? s : null;
}

function resolveTaskMapId(task) {
  if (!task) return null;
  return (
    task.map_id_resolved ||
    task.map_id ||
    task.zone_map_id ||
    task.marker_map_id ||
    task.project_map_id ||
    null
  );
}

/** Entrée client : absent / vide / null → non renseigné (null SQL) ; valeur invalide → { error }. */
function parseTaskDangerLevelFromClient(value) {
  if (value === undefined || value === null) return { level: null };
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return { level: null };
  if (ALLOWED_TASK_DANGER_LEVELS.has(raw)) return { level: raw };
  return { error: 'Niveau de danger invalide' };
}

function parseTaskDifficultyLevelFromClient(value) {
  if (value === undefined || value === null) return { level: null };
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return { level: null };
  if (ALLOWED_TASK_DIFFICULTY_LEVELS.has(raw)) return { level: raw };
  return { error: 'Niveau de difficulté invalide' };
}

function parseTaskImportanceLevelFromClient(value) {
  if (value === undefined || value === null) return { level: null };
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return { level: null };
  if (ALLOWED_TASK_IMPORTANCE_LEVELS.has(raw)) return { level: raw };
  return { error: "Degré d'importance invalide" };
}

/** Valeur BDD → clé API ou null (jamais de défaut implicite). */
function taskDangerLevelForResponse(value) {
  if (value == null) return null;
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return null;
  return ALLOWED_TASK_DANGER_LEVELS.has(raw) ? raw : null;
}

function taskDifficultyLevelForResponse(value) {
  if (value == null) return null;
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return null;
  return ALLOWED_TASK_DIFFICULTY_LEVELS.has(raw) ? raw : null;
}

function taskImportanceLevelForResponse(value) {
  if (value == null) return null;
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return null;
  return ALLOWED_TASK_IMPORTANCE_LEVELS.has(raw) ? raw : null;
}

/** Liste de noms d’êtres vivants (catalogue biodiversité), comme zones/repères. */
function normalizeTaskLivingBeingsInput(input, fallback = '') {
  const base = Array.isArray(input)
    ? input
    : typeof input === 'string' && input.trim()
      ? (() => {
          try {
            const parsed = JSON.parse(input);
            if (Array.isArray(parsed)) return parsed;
          } catch (_) {
            /* ignore */
          }
          return input.split(',');
        })()
      : [];
  const cleaned = [...new Set(base.map((v) => String(v || '').trim()).filter(Boolean))];
  if (cleaned.length === 0 && fallback && String(fallback).trim()) return [String(fallback).trim()];
  return cleaned;
}

function serializeTaskLivingBeingsForDb(input) {
  const arr = normalizeTaskLivingBeingsInput(input, '');
  return arr.length ? JSON.stringify(arr) : null;
}

function attachTaskLivingBeingsApiFields(task) {
  if (!task) return;
  task.living_beings_list = normalizeTaskLivingBeingsInput(task.living_beings, '');
  delete task.living_beings;
}

const MAX_TASK_IMAGE_BYTES = 4 * 1024 * 1024;

function taskImageExtensionFromBuffer(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return 'webp';
  return null;
}

/** Décode une data URL / base64 image tâche ; vérifie taille et signature (JPEG, PNG, WebP). */
function decodeTaskImageBuffer(imageData) {
  if (imageData == null) return { error: 'Image requise' };
  const str = String(imageData);
  const raw = str.includes(',') ? str.split(',')[1] : str;
  if (!raw || !String(raw).trim()) return { error: 'Image requise' };
  let buf;
  try {
    buf = Buffer.from(raw, 'base64');
  } catch (_) {
    return { error: 'Image invalide' };
  }
  if (!buf.length) return { error: 'Image invalide' };
  if (buf.length > MAX_TASK_IMAGE_BYTES) {
    return { error: 'Image trop volumineuse (max 4 Mo après décodage)' };
  }
  const ext = taskImageExtensionFromBuffer(buf);
  if (!ext) return { error: 'Format image non supporté (JPEG, PNG ou WebP)' };
  return { buffer: buf, ext };
}

function attachTaskImagePublicFields(task) {
  if (!task || task.id == null) return;
  const raw = task.task_cover_image_path ?? task.image_path;
  const rel = raw != null ? String(raw).trim() : '';
  if (rel && isSafePublicTaskImageRelativePath(rel)) {
    // Même origine que les avatars / photos zones : pas de passage par /api/* (rate limit, JSON d’erreur).
    task.image_url = `/uploads/${rel}`;
  } else if (rel) {
    task.image_url = `/api/tasks/${encodeURIComponent(task.id)}/image`;
  } else {
    task.image_url = null;
  }
  delete task.image_path;
  delete task.task_cover_image_path;
}

function countDoneAssignments(assignments = []) {
  if (!Array.isArray(assignments)) return 0;
  return assignments.reduce((count, assignment) => {
    if (assignment?.done_at) return count + 1;
    return count;
  }, 0);
}

function normalizeDateOnly(value) {
  const raw = asTrimmedString(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function currentLocalDateOnly() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isTaskBeforeStartDate(task) {
  const status = normalizeTaskStatusForRead(task?.status);
  if (status === 'done' || status === 'validated' || status === 'proposed') return false;
  const startDate = normalizeDateOnly(task?.start_date);
  if (!startDate) return false;
  return startDate > currentLocalDateOnly();
}

function sanitizeRequiredStudents(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function normalizeIdArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((x) => (x != null ? String(x).trim() : '')).filter(Boolean))];
}

function normalizeTutorialIdArray(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of value) {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function normalizeOptionalId(value) {
  if (value == null) return null;
  const v = String(value).trim();
  return v || null;
}

function sameIdSet(a = [], b = []) {
  if (a.length !== b.length) return false;
  const left = new Set(a.map((id) => String(id || '').trim()).filter(Boolean));
  const right = new Set(b.map((id) => String(id || '').trim()).filter(Boolean));
  if (left.size !== right.size) return false;
  for (const id of left) {
    if (!right.has(id)) return false;
  }
  return true;
}

function referentPublicLabel(row) {
  const dn = String(row?.display_name || '').trim();
  if (dn) return dn;
  const fn = String(row?.first_name || '').trim();
  const ln = String(row?.last_name || '').trim();
  const full = `${fn} ${ln}`.trim();
  return full || String(row?.uid || row?.id || '').trim() || 'Utilisateur';
}

function enrichTaskRow(task, zonesLinked, markersLinked, tutorialsLinked, referentsLinked) {
  const zl = zonesLinked || [];
  const ml = markersLinked || [];
  const tl = tutorialsLinked || [];
  const rl = referentsLinked || [];
  const prevZoneName = task.zone_name;
  const prevMarkerLabel = task.marker_label;
  task.zone_ids = zl.map((z) => z.id);
  task.marker_ids = ml.map((x) => x.id);
  task.tutorial_ids = tl.map((x) => Number(x.id));
  task.zones_linked = zl.map((z) => ({ id: z.id, name: z.name }));
  task.markers_linked = ml.map((x) => ({ id: x.id, label: x.label }));
  task.tutorials_linked = tl.map((x) => ({
    id: Number(x.id),
    title: x.title,
    slug: x.slug,
    type: x.type,
    source_url: x.source_url || null,
    source_file_path: x.source_file_path || null,
  }));
  task.referent_user_ids = rl.map((x) => String(x.id));
  task.referents_linked = rl.map((x) => ({
    id: String(x.id),
    user_type: x.user_type,
    label: referentPublicLabel(x),
    role_slug: x.role_slug || null,
  }));
  const mapsFromLinks = [
    ...new Set([...zl.map((z) => z.map_id), ...ml.map((x) => x.map_id)].filter(Boolean)),
  ];
  if (mapsFromLinks.length === 1) {
    task.map_id_resolved = mapsFromLinks[0];
  } else if (mapsFromLinks.length === 0) {
    task.map_id_resolved = task.map_id || null;
  } else {
    task.map_id_resolved = mapsFromLinks[0];
  }
  task.zone_map_id = zl[0]?.map_id ?? task.zone_map_id ?? null;
  task.marker_map_id = ml[0]?.map_id ?? task.marker_map_id ?? null;
  task.zone_name = zl[0]?.name ?? prevZoneName ?? null;
  task.marker_label = ml[0]?.label ?? prevMarkerLabel ?? null;
}

function trimName(value) {
  return String(value || '').trim();
}

module.exports = {
  ALLOWED_TASK_STATUSES,
  ALLOWED_TASK_DANGER_LEVELS,
  ALLOWED_TASK_DIFFICULTY_LEVELS,
  ALLOWED_TASK_IMPORTANCE_LEVELS,
  MAX_TASK_IMAGE_BYTES,
  asTrimmedString,
  normalizeOptionalString,
  resolveTaskMapId,
  parseTaskDangerLevelFromClient,
  parseTaskDifficultyLevelFromClient,
  parseTaskImportanceLevelFromClient,
  taskDangerLevelForResponse,
  taskDifficultyLevelForResponse,
  taskImportanceLevelForResponse,
  normalizeTaskLivingBeingsInput,
  serializeTaskLivingBeingsForDb,
  attachTaskLivingBeingsApiFields,
  taskImageExtensionFromBuffer,
  decodeTaskImageBuffer,
  attachTaskImagePublicFields,
  countDoneAssignments,
  normalizeDateOnly,
  currentLocalDateOnly,
  isTaskBeforeStartDate,
  sanitizeRequiredStudents,
  normalizeIdArray,
  normalizeTutorialIdArray,
  normalizeOptionalId,
  sameIdSet,
  referentPublicLabel,
  enrichTaskRow,
  trimName,
};
