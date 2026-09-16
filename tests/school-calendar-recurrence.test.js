require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const {
  computeNextOccurrenceDue,
  computeNextOccurrenceWindow,
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

/** Calendrier de test : week-ends fermés, plus les jours explicitement listés. */
function makeNextOpenDay(closed = []) {
  const closedSet = new Set(closed);
  return async (d) => {
    let cur = d;
    for (let i = 0; i < 60; i += 1) {
      if (!closedSet.has(cur) && fallbackIsOpen(cur)) return cur;
      cur = addDaysToDateString(cur, 1);
    }
    return null;
  };
}

test('computeNextOccurrenceWindow : la date de départ porte le rythme', async () => {
  const nextOpen = makeNextOpenDay();
  // Départ vendredi 11/09, échéance samedi 12/09 : l'échéance s'accroche au lundi,
  // mais le départ doit rester un vendredi (avant, il glissait au lundi avec elle).
  const w = await computeNextOccurrenceWindow(
    { start_date: '2026-09-11', due_date: '2026-09-12' },
    'weekly',
    '2026-09-14',
    { nextOpenDay: nextOpen },
  );
  assert.deepStrictEqual(w, { startDate: '2026-09-18', dueDate: '2026-09-21' });

  // L'ancrage par échéance (comportement historique) aurait perdu le vendredi.
  const legacyDue = await computeNextOccurrenceDue('2026-09-12', 'weekly', '2026-09-14', {
    nextOpenDay: nextOpen,
  });
  assert.strictEqual(legacyDue, '2026-09-21');
});

test('computeNextOccurrenceWindow : le jour de semaine du départ survit aux vacances', async () => {
  // Toute la semaine du 19/10 fermée (vacances) : l'occurrence de cette semaine est
  // sautée, celle d'après retombe sur son mardi d'origine.
  const nextOpen = makeNextOpenDay([
    '2026-10-19',
    '2026-10-20',
    '2026-10-21',
    '2026-10-22',
    '2026-10-23',
  ]);
  const w = await computeNextOccurrenceWindow(
    { start_date: '2026-10-13', due_date: '2026-10-15' },
    'weekly',
    '2026-10-16',
    { nextOpenDay: nextOpen },
  );
  assert.strictEqual(w.startDate, '2026-10-26'); // lundi de rentrée (mardi 20 fermé)
  assert.ok(w.dueDate >= '2026-10-16');

  const w2 = await computeNextOccurrenceWindow(
    { start_date: w.startDate, due_date: w.dueDate },
    'weekly',
    '2026-10-27',
    { nextOpenDay: nextOpen },
  );
  assert.strictEqual(w2.startDate, '2026-11-02');
});

test('computeNextOccurrenceWindow : sans date de départ, ancrage par échéance', async () => {
  const nextOpen = makeNextOpenDay();
  const w = await computeNextOccurrenceWindow(
    { start_date: null, due_date: '2026-09-12', created_at: '2026-09-11' },
    'weekly',
    '2026-09-14',
    { nextOpenDay: nextOpen },
  );
  const legacyDue = await computeNextOccurrenceDue('2026-09-12', 'weekly', '2026-09-14', {
    nextOpenDay: nextOpen,
  });
  assert.strictEqual(w.dueDate, legacyDue);
});

test('computeNextOccurrenceWindow : départ postérieur à l’échéance → repli sur l’échéance', async () => {
  const nextOpen = makeNextOpenDay();
  const w = await computeNextOccurrenceWindow(
    { start_date: '2026-09-20', due_date: '2026-09-11' },
    'weekly',
    '2026-09-14',
    { nextOpenDay: nextOpen },
  );
  assert.strictEqual(w.dueDate, '2026-09-18');
  assert.ok(w.startDate <= w.dueDate);
});

test('computeNextOccurrenceWindow : rattrapage = une seule occurrence, départ aligné', async () => {
  const nextOpen = makeNextOpenDay();
  // Départ mardi 06/01/2026, échéance vendredi 09/01 ; reprise le 16/09.
  const w = await computeNextOccurrenceWindow(
    { start_date: '2026-01-06', due_date: '2026-01-09' },
    'weekly',
    '2026-09-16',
    { nextOpenDay: nextOpen },
  );
  assert.strictEqual(w.startDate, '2026-09-15'); // mardi
  assert.strictEqual(w.dueDate, '2026-09-18'); // vendredi
  assert.ok(w.dueDate >= '2026-09-16');
});

test('computeNextOccurrenceWindow : mensuel et bimensuel ancrés sur le départ', async () => {
  const nextOpen = makeNextOpenDay();
  const monthly = await computeNextOccurrenceWindow(
    { start_date: '2026-09-15', due_date: '2026-09-18' },
    'monthly',
    '2026-09-16',
    { nextOpenDay: nextOpen },
  );
  assert.strictEqual(monthly.startDate, '2026-10-15');
  assert.strictEqual(monthly.dueDate, '2026-10-19'); // 18/10 = dimanche → lundi

  const biweekly = await computeNextOccurrenceWindow(
    { start_date: '2026-09-15', due_date: '2026-09-15' },
    'biweekly',
    '2026-09-16',
    { nextOpenDay: nextOpen },
  );
  assert.deepStrictEqual(biweekly, { startDate: '2026-09-29', dueDate: '2026-09-29' });
});

test('computeNextOccurrenceWindow : entrées inexploitables', async () => {
  const nextOpen = makeNextOpenDay();
  assert.strictEqual(
    await computeNextOccurrenceWindow(
      { start_date: '2026-09-15', due_date: null },
      'weekly',
      '2026-09-16',
      {
        nextOpenDay: nextOpen,
      },
    ),
    null,
  );
  assert.strictEqual(
    await computeNextOccurrenceWindow(
      { start_date: '2026-09-15', due_date: '2026-09-18' },
      'daily',
      '2026-09-16',
      { nextOpenDay: nextOpen },
    ),
    null,
  );
});
