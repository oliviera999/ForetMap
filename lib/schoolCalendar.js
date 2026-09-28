/**
 * Calendrier scolaire (jours ouverts / fermés) pour la récurrence des tâches.
 * Source BDD : school_calendar_days (seed année 2026-2027), éditable depuis les réglages.
 * Hors plage connue : repli sur les jours ouvrables réglés (lundi→vendredi par défaut).
 */
const { queryOne, queryAll, withTransaction } = require('../database');
const { nowDbTimestamp } = require('./shared/isoTimestamp');
const logger = require('./logger');

const DAY_MS = 24 * 60 * 60 * 1000;

const OPEN_WEEKDAYS_SETTING_KEY = 'tasks.school_calendar_open_weekdays';
/** 0 = dimanche … 6 = samedi (convention `getUTCDay`). */
const DEFAULT_OPEN_WEEKDAYS = Object.freeze([1, 2, 3, 4, 5]);
/** Types de fermeture posés à la main ; `weekend` et `open` découlent des jours ouvrables. */
const CLOSURE_KINDS = Object.freeze(['vacation', 'holiday', 'closed']);
/** Ouverture posée à la main : survit à un changement de jours ouvrables, comme un congé. */
const EXTRA_OPEN_KIND = 'extra_open';
/** Plus long intervalle modifiable ou créable d'un coup (une année scolaire et un peu plus). */
const MAX_RANGE_DAYS = 400;

class SchoolCalendarError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** « 1,2,3,4,5 » → [1,2,3,4,5] ; toute valeur illisible retombe sur le défaut. */
function parseOpenWeekdays(raw) {
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(/[\s,;]+/);
  const out = [
    ...new Set(
      list
        .map((v) => (v === '' || v == null ? NaN : Number(v)))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
    ),
  ].sort((a, b) => a - b);
  return out.length ? out : [...DEFAULT_OPEN_WEEKDAYS];
}

async function getOpenWeekdays() {
  // Chargement paresseux : `lib/settings` tire une grappe de modules dont ce fichier n'a
  // besoin qu'ici.
  const { getSettingValue } = require('./settings');
  try {
    return parseOpenWeekdays(await getSettingValue(OPEN_WEEKDAYS_SETTING_KEY, ''));
  } catch (err) {
    logger.warn({ err }, 'Jours ouvrables illisibles — repli lundi→vendredi');
    return [...DEFAULT_OPEN_WEEKDAYS];
  }
}

function parseISODateOnly(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function addDaysToDateString(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function weekdayUtc(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun … 6=Sat
}

/** Repli si la date n'est pas dans school_calendar_days. */
function fallbackIsOpen(dateStr, openWeekdays = DEFAULT_OPEN_WEEKDAYS) {
  return openWeekdays.includes(weekdayUtc(dateStr));
}

async function getSchoolDayRow(dateStr) {
  const day = parseISODateOnly(dateStr);
  if (!day) return null;
  try {
    return await queryOne(
      `SELECT day_date, is_open, kind, label, year_id
         FROM school_calendar_days
        WHERE day_date = ?`,
      [day],
    );
  } catch (err) {
    // Table absente (migration pas encore jouée) → repli.
    if (err && (err.errno === 1146 || err.code === 'ER_NO_SUCH_TABLE')) {
      logger.warn({ err, day }, 'school_calendar_days absente — repli week-end');
      return null;
    }
    throw err;
  }
}

async function isSchoolOpenDay(dateStr) {
  const day = parseISODateOnly(dateStr);
  if (!day) return false;
  const row = await getSchoolDayRow(day);
  if (!row) return fallbackIsOpen(day, await getOpenWeekdays());
  return Number(row.is_open) === 1;
}

/**
 * Prochain jour ouvré scolaire ≥ dateStr (inclut dateStr si déjà ouvert).
 * Borne de sécurité : 400 jours.
 */
async function nextSchoolOpenDay(dateStr) {
  let d = parseISODateOnly(dateStr);
  if (!d) return null;
  for (let i = 0; i < 400; i += 1) {
    if (await isSchoolOpenDay(d)) return d;
    d = addDaysToDateString(d, 1);
  }
  logger.warn({ dateStr }, 'nextSchoolOpenDay : aucun jour ouvré trouvé');
  return null;
}

function getCalendarToday(tz) {
  const zone =
    String(tz || process.env.FORETMAP_RECURRENCE_TZ || 'Europe/Paris').trim() || 'Europe/Paris';
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = fmt.formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch (err) {
    logger.warn({ err, zone }, 'Fuseau calendrier invalide, repli UTC');
  }
  return new Date().toISOString().slice(0, 10);
}

async function getTodaySchoolStatus(tz) {
  const today = getCalendarToday(tz);
  const row = await getSchoolDayRow(today);
  const isOpen = row ? Number(row.is_open) === 1 : fallbackIsOpen(today, await getOpenWeekdays());
  return {
    today,
    isOpen,
    kind: row?.kind || (isOpen ? 'open' : 'weekend'),
    label: row?.label || null,
  };
}

async function listSchoolCalendarDays(fromDate, toDate) {
  const from = parseISODateOnly(fromDate);
  const to = parseISODateOnly(toDate);
  if (!from || !to || from > to) return [];
  try {
    return await queryAll(
      `SELECT day_date AS date, is_open, kind, label, year_id
         FROM school_calendar_days
        WHERE day_date >= ? AND day_date <= ?
        ORDER BY day_date`,
      [from, to],
    );
  } catch (err) {
    if (err && (err.errno === 1146 || err.code === 'ER_NO_SUCH_TABLE')) return [];
    throw err;
  }
}

async function listActiveSchoolYears() {
  try {
    return await queryAll(
      `SELECT id, label, starts_on, ends_on, active
         FROM school_calendar_years
        WHERE active = 1
        ORDER BY starts_on DESC`,
    );
  } catch (err) {
    if (err && (err.errno === 1146 || err.code === 'ER_NO_SUCH_TABLE')) return [];
    throw err;
  }
}

async function listSchoolYears() {
  try {
    return await queryAll(
      `SELECT id, label, starts_on, ends_on, active
         FROM school_calendar_years
        ORDER BY starts_on DESC`,
    );
  } catch (err) {
    if (err && (err.errno === 1146 || err.code === 'ER_NO_SUCH_TABLE')) return [];
    throw err;
  }
}

function daysInRange(from, to) {
  const out = [];
  for (let d = from; d <= to && out.length <= MAX_RANGE_DAYS; d = addDaysToDateString(d, 1)) {
    out.push(d);
  }
  return out;
}

/** Ligne « par défaut » d'un jour selon les jours ouvrables : ouvert, ou week-end. */
function patternDay(dateStr, openWeekdays) {
  const open = fallbackIsOpen(dateStr, openWeekdays);
  return { is_open: open ? 1 : 0, kind: open ? 'open' : 'weekend', label: null };
}

function normalizeLabel(raw) {
  const s = String(raw ?? '').trim();
  return s ? s.slice(0, 128) : null;
}

function requireRange(fromRaw, toRaw) {
  const from = parseISODateOnly(fromRaw);
  const to = parseISODateOnly(toRaw);
  if (!from || !to) throw new SchoolCalendarError('Dates invalides (format AAAA-MM-JJ attendu)');
  if (from > to) throw new SchoolCalendarError('La date de fin précède la date de début');
  if (daysInRange(from, to).length > MAX_RANGE_DAYS) {
    throw new SchoolCalendarError(`Période trop longue (${MAX_RANGE_DAYS} jours au plus)`);
  }
  return { from, to };
}

/**
 * Modifie une période du calendrier.
 *
 * - `close` : les jours ouvrables de la période deviennent fermés (`kind` = vacances, férié
 *   ou fermeture, avec un libellé) ; les jours non ouvrables restent « week-end ».
 * - `open` : ouverture exceptionnelle de tous les jours de la période, week-ends compris.
 * - `reset` : retour aux jours ouvrables (annule congés et ouvertures exceptionnelles).
 *
 * La période doit tenir dans des années scolaires existantes : hors année, le calendrier
 * n'a pas de ligne à écrire et le repli sur les jours ouvrables s'applique.
 */
async function applyDayRange({ from: fromRaw, to: toRaw, action, kind, label }) {
  const { from, to } = requireRange(fromRaw, toRaw);
  if (!['close', 'open', 'reset'].includes(action)) {
    throw new SchoolCalendarError('Action inconnue (close, open ou reset)');
  }
  if (action === 'close' && !CLOSURE_KINDS.includes(kind)) {
    throw new SchoolCalendarError('Type de fermeture inconnu (vacation, holiday ou closed)');
  }
  const years = await queryAll(
    `SELECT id, starts_on, ends_on FROM school_calendar_years
      WHERE starts_on <= ? AND ends_on >= ?`,
    [to, from],
  );
  const yearFor = (d) =>
    years.find((y) => String(y.starts_on).slice(0, 10) <= d && d <= String(y.ends_on).slice(0, 10));
  const dates = daysInRange(from, to);
  const outside = dates.find((d) => !yearFor(d));
  if (outside) {
    throw new SchoolCalendarError(
      `Le ${outside} n’appartient à aucune année scolaire : créez d’abord l’année correspondante`,
    );
  }

  const openWeekdays = await getOpenWeekdays();
  const cleanLabel = normalizeLabel(label);
  const rows = dates.map((d) => {
    let row = patternDay(d, openWeekdays);
    if (action === 'close' && row.is_open) row = { is_open: 0, kind, label: cleanLabel };
    if (action === 'open') row = { is_open: 1, kind: EXTRA_OPEN_KIND, label: cleanLabel };
    return [d, yearFor(d).id, row.is_open, row.kind, row.label];
  });
  await withTransaction(async (tx) => {
    for (const r of rows) {
      await tx.execute(
        `INSERT INTO school_calendar_days (day_date, year_id, is_open, kind, label)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE year_id = VALUES(year_id), is_open = VALUES(is_open),
           kind = VALUES(kind), label = VALUES(label)`,
        r,
      );
    }
  });
  return { from, to, updated: rows.length };
}

/**
 * Change les jours ouvrables : enregistre le réglage, puis recalcule les jours « ordinaires »
 * (ouvert / week-end) des années en cours et à venir. Congés, fériés, fermetures et
 * ouvertures exceptionnelles sont conservés ; les années passées ne bougent pas.
 */
async function setOpenWeekdays(rawWeekdays, { today = null, actor = {} } = {}) {
  const list = Array.isArray(rawWeekdays) ? rawWeekdays : [];
  const weekdays = [
    ...new Set(list.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)),
  ].sort((a, b) => a - b);
  if (weekdays.length === 0) {
    throw new SchoolCalendarError('Au moins un jour ouvrable est nécessaire');
  }
  const { setSetting } = require('./settings');
  await setSetting(OPEN_WEEKDAYS_SETTING_KEY, weekdays.join(','), actor);

  const todayStr = parseISODateOnly(today) || getCalendarToday();
  const placeholders = weekdays.map(() => '?').join(',');
  // DAYOFWEEK : 1 = dimanche … 7 = samedi, d'où le « - 1 » vers la convention getUTCDay.
  const changed = await withTransaction((tx) =>
    tx.execute(
      `UPDATE school_calendar_days d
         JOIN school_calendar_years y ON y.id = d.year_id
          SET d.is_open = IF(DAYOFWEEK(d.day_date) - 1 IN (${placeholders}), 1, 0),
              d.kind = IF(DAYOFWEEK(d.day_date) - 1 IN (${placeholders}), 'open', 'weekend')
        WHERE y.ends_on >= ? AND d.kind IN ('open', 'weekend')`,
      [...weekdays, ...weekdays, todayStr],
    ),
  );
  return { open_weekdays: weekdays, changed_days: Number(changed?.affectedRows || 0) };
}

/** Crée une année scolaire et ses jours, calés sur les jours ouvrables courants. */
async function createSchoolYear({ label: rawLabel, starts_on: startsRaw, ends_on: endsRaw }) {
  const label = normalizeLabel(rawLabel);
  if (!label || label.length > 64) {
    throw new SchoolCalendarError('Libellé requis (64 caractères au plus)');
  }
  const { from, to } = requireRange(startsRaw, endsRaw);
  const overlap = await queryOne(
    `SELECT label FROM school_calendar_years WHERE starts_on <= ? AND ends_on >= ? LIMIT 1`,
    [to, from],
  );
  if (overlap) {
    throw new SchoolCalendarError(`Chevauche l’année scolaire « ${overlap.label} »`, 409);
  }
  const sameLabel = await queryOne('SELECT id FROM school_calendar_years WHERE label = ?', [label]);
  if (sameLabel) throw new SchoolCalendarError('Une année porte déjà ce libellé', 409);

  const openWeekdays = await getOpenWeekdays();
  const dates = daysInRange(from, to);
  const yearId = await withTransaction(async (tx) => {
    const ins = await tx.execute(
      'INSERT INTO school_calendar_years (label, starts_on, ends_on, active) VALUES (?, ?, ?, 1)',
      [label, from, to],
    );
    const id = ins.insertId;
    const CHUNK = 100;
    for (let i = 0; i < dates.length; i += CHUNK) {
      const slice = dates.slice(i, i + CHUNK);
      const params = [];
      for (const d of slice) {
        const row = patternDay(d, openWeekdays);
        params.push(d, id, row.is_open, row.kind, row.label);
      }
      await tx.execute(
        `INSERT INTO school_calendar_days (day_date, year_id, is_open, kind, label)
         VALUES ${slice.map(() => '(?, ?, ?, ?, ?)').join(', ')}
         ON DUPLICATE KEY UPDATE year_id = VALUES(year_id), is_open = VALUES(is_open),
           kind = VALUES(kind), label = VALUES(label)`,
        params,
      );
    }
    return id;
  });
  return { id: yearId, label, starts_on: from, ends_on: to, days: dates.length };
}

module.exports = {
  parseISODateOnly,
  addDaysToDateString,
  isSchoolOpenDay,
  nextSchoolOpenDay,
  getCalendarToday,
  getTodaySchoolStatus,
  listSchoolCalendarDays,
  listActiveSchoolYears,
  listSchoolYears,
  fallbackIsOpen,
  parseOpenWeekdays,
  getOpenWeekdays,
  setOpenWeekdays,
  applyDayRange,
  createSchoolYear,
  SchoolCalendarError,
  CLOSURE_KINDS,
  EXTRA_OPEN_KIND,
  DEFAULT_OPEN_WEEKDAYS,
  OPEN_WEEKDAYS_SETTING_KEY,
  // exposé pour tests / diagnostic
  nowDbTimestamp,
  DAY_MS,
};
