/**
 * Calendrier scolaire (lecture) — jours ouverts / fermés pour n3boss / admin.
 */
const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { requirePermission } = require('../middleware/requireTeacher');
const {
  listSchoolCalendarDays,
  listActiveSchoolYears,
  getTodaySchoolStatus,
  parseISODateOnly,
} = require('../lib/schoolCalendar');

const router = express.Router();

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
      years: years.map((y) => ({
        id: y.id,
        label: y.label,
        starts_on: y.starts_on,
        ends_on: y.ends_on,
        active: Number(y.active) === 1,
      })),
      from,
      to,
      days: days.map((d) => ({
        date: d.date || d.day_date,
        is_open: Number(d.is_open) === 1,
        kind: d.kind,
        label: d.label || null,
      })),
    });
  }),
);

module.exports = router;
