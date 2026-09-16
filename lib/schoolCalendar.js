/**
 * Calendrier scolaire (jours ouverts / fermés) pour la récurrence des tâches.
 * Source BDD : school_calendar_days (seed année 2026-2027).
 * Hors plage connue : repli week-end fermé, jours de semaine ouverts.
 */
const { queryOne, queryAll } = require('../database');
const { nowDbTimestamp } = require('./shared/isoTimestamp');
const logger = require('./logger');

const DAY_MS = 24 * 60 * 60 * 1000;

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
function fallbackIsOpen(dateStr) {
  const wd = weekdayUtc(dateStr);
  return wd !== 0 && wd !== 6;
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
  if (!row) return fallbackIsOpen(day);
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
  const isOpen = row ? Number(row.is_open) === 1 : fallbackIsOpen(today);
  return {
    today,
    isOpen,
    kind:
      row?.kind ||
      (isOpen
        ? 'open'
        : weekdayUtc(today) === 0 || weekdayUtc(today) === 6
          ? 'weekend'
          : 'vacation'),
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

module.exports = {
  parseISODateOnly,
  addDaysToDateString,
  isSchoolOpenDay,
  nextSchoolOpenDay,
  getCalendarToday,
  getTodaySchoolStatus,
  listSchoolCalendarDays,
  listActiveSchoolYears,
  fallbackIsOpen,
  // exposé pour tests / diagnostic
  nowDbTimestamp,
  DAY_MS,
};
