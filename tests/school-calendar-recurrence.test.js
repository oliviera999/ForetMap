require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const {
  computeNextOccurrenceDue,
  advanceDateByRecurrence,
  addDaysToDateString,
} = require('../lib/recurringTasks');
const { fallbackIsOpen, parseISODateOnly } = require('../lib/schoolCalendar');

test('advanceDateByRecurrence : weekly / biweekly / monthly', () => {
  assert.strictEqual(advanceDateByRecurrence('2026-09-15', 'weekly'), '2026-09-22');
  assert.strictEqual(advanceDateByRecurrence('2026-09-15', 'biweekly'), '2026-09-29');
  assert.strictEqual(advanceDateByRecurrence('2026-01-31', 'monthly'), '2026-02-28');
});

test('fallbackIsOpen : week-end fermé', () => {
  assert.strictEqual(fallbackIsOpen('2026-09-05'), false); // samedi
  assert.strictEqual(fallbackIsOpen('2026-09-06'), false); // dimanche
  assert.strictEqual(fallbackIsOpen('2026-09-07'), true); // lundi
});

test('computeNextOccurrenceDue : saute les périodes passées puis snap ouvré', async () => {
  const closed = new Set(['2026-10-23', '2026-10-24', '2026-10-25']); // ven-dim fictifs
  const nextOpen = async (d) => {
    let cur = d;
    for (let i = 0; i < 30; i += 1) {
      if (!closed.has(cur) && fallbackIsOpen(cur)) return cur;
      cur = addDaysToDateString(cur, 1);
    }
    return null;
  };
  // due source 2026-09-01, today 2026-10-01 → saute jusqu'à >= today
  const next = await computeNextOccurrenceDue('2026-09-01', 'weekly', '2026-10-01', {
    nextOpenDay: nextOpen,
  });
  assert.ok(next);
  assert.ok(next >= '2026-10-01');
  assert.strictEqual(parseISODateOnly(next), next);
});

test('computeNextOccurrenceDue : une seule occurrence même après long retard', async () => {
  const nextOpen = async (d) => (fallbackIsOpen(d) ? d : addDaysToDateString(d, 1));
  const a = await computeNextOccurrenceDue('2020-01-08', 'weekly', '2026-09-15', {
    nextOpenDay: nextOpen,
  });
  const b = await computeNextOccurrenceDue('2020-01-08', 'weekly', '2026-09-15', {
    nextOpenDay: nextOpen,
  });
  assert.strictEqual(a, b);
  assert.ok(a >= '2026-09-15');
});
