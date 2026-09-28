/**
 * Calendrier scolaire — jours ouverts / fermés.
 *
 * Lecture pour n3boss / admin (`tasks.manage`, panneau des séries récurrentes) ; édition
 * depuis les réglages (`admin.settings.*`) : congés, fériés, fermetures, ouvertures
 * exceptionnelles, jours ouvrables et nouvelles années scolaires.
 */
const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { requirePermission } = require('../middleware/requireTeacher');
const { logAudit } = require('../lib/auditLog');
const {
  listSchoolCalendarDays,
  listActiveSchoolYears,
  listSchoolYears,
  getTodaySchoolStatus,
  getOpenWeekdays,
  setOpenWeekdays,
  applyDayRange,
  createSchoolYear,
  parseISODateOnly,
  SchoolCalendarError,
} = require('../lib/schoolCalendar');

const router = express.Router();

function mapYear(y) {
  return {
    id: y.id,
    label: y.label,
    starts_on: String(y.starts_on).slice(0, 10),
    ends_on: String(y.ends_on).slice(0, 10),
    active: Number(y.active) === 1,
  };
}

function mapDay(d) {
  return {
    date: String(d.date || d.day_date).slice(0, 10),
    is_open: Number(d.is_open) === 1,
    kind: d.kind,
    label: d.label || null,
  };
}

/** Erreur métier → 4xx lisible ; le reste remonte au gestionnaire d'erreurs. */
function sendCalendarError(res, err) {
  if (err instanceof SchoolCalendarError) {
    res.status(err.status).json({ error: err.message });
    return true;
  }
  return false;
}

function actorOf(req) {
  return { userType: req.auth?.userType, userId: req.auth?.userId };
}

router.get(
  '/',
  requirePermission('tasks.manage'),
  asyncHandler(async (req, res) => {
    const todayStatus = await getTodaySchoolStatus();
    const years = await listActiveSchoolYears();

    const from =
      parseISODateOnly(req.query.from) ||
      (years[0] ? String(years[0].starts_on).slice(0, 10) : null);
    const to =
      parseISODateOnly(req.query.to) || (years[0] ? String(years[0].ends_on).slice(0, 10) : null);

    let days = [];
    if (from && to) {
      days = await listSchoolCalendarDays(from, to);
    }

    res.json({
      today: todayStatus,
      years: years.map(mapYear),
      from,
      to,
      days: days.map(mapDay),
    });
  }),
);

/**
 * Vue d'édition des réglages : toutes les années (actives ou non), les jours ouvrables et
 * les jours d'une année (`year_id`, sinon l'année qui contient aujourd'hui, sinon la plus
 * récente).
 */
router.get(
  '/admin',
  requirePermission('admin.settings.read'),
  asyncHandler(async (req, res) => {
    const todayStatus = await getTodaySchoolStatus();
    const years = (await listSchoolYears()).map(mapYear);
    const wanted = Number(req.query.year_id);
    const year =
      years.find((y) => y.id === wanted) ||
      years.find((y) => y.starts_on <= todayStatus.today && todayStatus.today <= y.ends_on) ||
      years[0] ||
      null;
    const days = year ? await listSchoolCalendarDays(year.starts_on, year.ends_on) : [];
    res.json({
      today: todayStatus,
      open_weekdays: await getOpenWeekdays(),
      years,
      year_id: year?.id ?? null,
      days: days.map(mapDay),
    });
  }),
);

/** Ferme, ouvre exceptionnellement ou remet aux jours ouvrables une période. */
router.put(
  '/days',
  requirePermission('admin.settings.write'),
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    try {
      const result = await applyDayRange({
        from: body.from,
        to: body.to,
        action: body.action,
        kind: body.kind,
        label: body.label,
      });
      await logAudit(
        'school_calendar_days_update',
        'school_calendar',
        `${result.from}..${result.to}`,
        'Calendrier scolaire : période modifiée',
        {
          req,
          payload: { action: body.action, kind: body.kind || null, label: body.label || null },
        },
      );
      res.json({ ok: true, ...result });
    } catch (err) {
      if (!sendCalendarError(res, err)) throw err;
    }
  }),
);

/** Jours ouvrables de la semaine (0 = dimanche … 6 = samedi). */
router.put(
  '/weekdays',
  requirePermission('admin.settings.write'),
  asyncHandler(async (req, res) => {
    try {
      const result = await setOpenWeekdays(req.body?.open_weekdays, { actor: actorOf(req) });
      await logAudit(
        'school_calendar_weekdays_update',
        'school_calendar',
        'weekdays',
        'Calendrier scolaire : jours ouvrables modifiés',
        { req, payload: result },
      );
      res.json({ ok: true, ...result });
    } catch (err) {
      if (!sendCalendarError(res, err)) throw err;
    }
  }),
);

/** Nouvelle année scolaire, jours calés sur les jours ouvrables. */
router.post(
  '/years',
  requirePermission('admin.settings.write'),
  asyncHandler(async (req, res) => {
    try {
      const year = await createSchoolYear(req.body || {});
      await logAudit(
        'school_calendar_year_create',
        'school_calendar',
        String(year.id),
        `Calendrier scolaire : année ${year.label} créée`,
        { req },
      );
      res.status(201).json({ ok: true, year });
    } catch (err) {
      if (!sendCalendarError(res, err)) throw err;
    }
  }),
);

module.exports = router;
