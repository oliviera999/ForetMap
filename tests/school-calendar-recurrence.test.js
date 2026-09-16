require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const {
  computeNextOccurrenceWindow,
  occurrenceDate,
  estimateOccurrenceIndex,
  resolveRecurrenceAnchor,
  addDaysToDateString,
} = require('../lib/recurringTasks');
const { fallbackIsOpen, parseISODateOnly } = require('../lib/schoolCalendar');

test('occurrenceDate : weekly / biweekly / monthly', () => {
  assert.strictEqual(occurrenceDate('2026-09-15', 'weekly', 1), '2026-09-22');
  assert.strictEqual(occurrenceDate('2026-09-15', 'biweekly', 1), '2026-09-29');
  assert.strictEqual(occurrenceDate('2026-01-31', 'monthly', 1), '2026-02-28');
  // Rang k quelconque : l'écart reste calculé depuis l'ancre, jamais cumulé.
  assert.strictEqual(occurrenceDate('2026-09-15', 'weekly', 4), '2026-10-13');
  assert.strictEqual(occurrenceDate('2026-01-31', 'monthly', 3), '2026-04-30');
});

test('estimateOccurrenceIndex : rang atteignant la cible, au moins 1', () => {
  assert.strictEqual(estimateOccurrenceIndex('2026-09-15', 'weekly', '2026-10-13'), 4);
  assert.strictEqual(estimateOccurrenceIndex('2026-09-15', 'biweekly', '2026-10-13'), 2);
  assert.strictEqual(estimateOccurrenceIndex('2026-09-15', 'monthly', '2027-01-15'), 4);
  // Cible antérieure à l'ancre : on ne remonte jamais avant le rang 1.
  assert.strictEqual(estimateOccurrenceIndex('2026-09-15', 'weekly', '2026-08-01'), 1);
});

test('resolveRecurrenceAnchor : ancre stockée, puis départ, puis création', () => {
  assert.strictEqual(
    resolveRecurrenceAnchor({
      recurrence_anchor_date: '2026-09-15',
      start_date: '2026-10-01',
      created_at: '2026-08-01T09:00:00.000Z',
    }),
    '2026-09-15',
  );
  assert.strictEqual(
    resolveRecurrenceAnchor({ start_date: '2026-10-01', created_at: '2026-08-01T09:00:00.000Z' }),
    '2026-10-01',
  );
  // Sans date de départ, la date de création fait ancre (y compris depuis un objet Date,
  // forme sous laquelle mysql2 rend la colonne DATETIME(3)).
  assert.strictEqual(
    resolveRecurrenceAnchor({ created_at: '2026-08-01T09:00:00.000Z' }),
    '2026-08-01',
  );
  assert.strictEqual(
    resolveRecurrenceAnchor({ created_at: new Date('2026-08-01T09:00:00.000Z') }),
    '2026-08-01',
  );
  assert.strictEqual(resolveRecurrenceAnchor({}), null);
});

test('fallbackIsOpen : week-end fermé', () => {
  assert.strictEqual(fallbackIsOpen('2026-09-05'), false); // samedi
  assert.strictEqual(fallbackIsOpen('2026-09-06'), false); // dimanche
  assert.strictEqual(fallbackIsOpen('2026-09-07'), true); // lundi
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
  // Départ vendredi 11/09, échéance samedi 12/09 : l'échéance s'accroche au lundi, mais le
  // départ doit rester un vendredi.
  const w = await computeNextOccurrenceWindow(
    { start_date: '2026-09-11', due_date: '2026-09-12' },
    'weekly',
    '2026-09-14',
    { nextOpenDay: nextOpen },
  );
  assert.strictEqual(w.startDate, '2026-09-18');
  assert.strictEqual(w.dueDate, '2026-09-21');
  assert.strictEqual(parseISODateOnly(w.startDate), w.startDate);
});

test("computeNextOccurrenceWindow : l'accrochage ne contamine pas l'occurrence suivante", async () => {
  // Semaine du 19/10 fermée (vacances). L'occurrence de cette semaine est repoussée à la
  // rentrée, mais l'ancre reste le mardi : la suivante y revient.
  const nextOpen = makeNextOpenDay([
    '2026-10-19',
    '2026-10-20',
    '2026-10-21',
    '2026-10-22',
    '2026-10-23',
  ]);
  const ancre = '2026-10-13'; // mardi
  const pendant = await computeNextOccurrenceWindow(
    { recurrence_anchor_date: ancre, start_date: ancre, due_date: '2026-10-15' },
    'weekly',
    '2026-10-16',
    { nextOpenDay: nextOpen },
  );
  assert.strictEqual(pendant.startDate, '2026-10-26'); // lundi de rentrée, mardi 20 fermé

  // L'occurrence d'après garde l'ancre du mardi, même si la précédente a été posée un lundi.
  const apres = await computeNextOccurrenceWindow(
    {
      recurrence_anchor_date: ancre,
      start_date: pendant.startDate,
      due_date: pendant.dueDate,
      recurrence: 'weekly',
    },
    'weekly',
    '2026-10-29',
    { nextOpenDay: nextOpen },
  );
  // Mardi retrouvé dès l'occurrence suivante : l'ancre n'a pas bougé, seul l'affichage de
  // l'occurrence de vacances avait glissé au lundi.
  assert.strictEqual(apres.startDate, '2026-10-27');
  assert.strictEqual(new Date(`${apres.startDate}T00:00:00Z`).getUTCDay(), 2);
});

test('computeNextOccurrenceWindow : sans date de départ, la date de création fait ancre', async () => {
  const nextOpen = makeNextOpenDay();
  const w = await computeNextOccurrenceWindow(
    { start_date: null, due_date: '2026-09-18', created_at: '2026-09-15T08:00:00.000Z' },
    'weekly',
    '2026-09-16',
    { nextOpenDay: nextOpen },
  );
  // Ancre = mardi 15/09 → rang 1 = mardi 22/09 ; l'écart création→échéance (3 j) est conservé.
  assert.strictEqual(w.startDate, '2026-09-22');
  assert.strictEqual(w.dueDate, '2026-09-25');
});

test('computeNextOccurrenceWindow : rattrapage = une seule occurrence, sur le jour d’ancre', async () => {
  const nextOpen = makeNextOpenDay();
  // Ancre mardi 06/01/2026, échéance vendredi 09/01 ; reprise le 16/09 après une longue
  // coupure — une seule occurrence, et elle retombe sur le mardi.
  const w = await computeNextOccurrenceWindow(
    { recurrence_anchor_date: '2026-01-06', start_date: '2026-01-06', due_date: '2026-01-09' },
    'weekly',
    '2026-09-16',
    { nextOpenDay: nextOpen },
  );
  assert.strictEqual(w.startDate, '2026-09-15'); // mardi
  assert.strictEqual(new Date(`${w.startDate}T00:00:00Z`).getUTCDay(), 2);
  assert.strictEqual(w.dueDate, '2026-09-18'); // vendredi
  // L'invariant porte sur l'échéance, pas sur le départ : celui-ci peut être de quelques
  // jours dans le passé (la tâche est alors simplement ouverte tout de suite), tant que
  // l'échéance reste à venir.
  assert.ok(w.dueDate >= '2026-09-16');
  assert.ok(w.startDate < '2026-09-16');
});

test('computeNextOccurrenceWindow : échéance strictement postérieure à celle de la source', async () => {
  const nextOpen = makeNextOpenDay();
  // Source dont l'échéance tombe aujourd'hui : la nouvelle ne doit pas la répéter, sinon
  // l'index unique (série, échéance) refuserait le clone et la série se bloquerait.
  const w = await computeNextOccurrenceWindow(
    { recurrence_anchor_date: '2026-09-15', start_date: '2026-09-15', due_date: '2026-09-18' },
    'weekly',
    '2026-09-18',
    { nextOpenDay: nextOpen },
  );
  assert.ok(w.dueDate > '2026-09-18', `${w.dueDate} doit dépasser l'échéance source`);
  assert.strictEqual(w.startDate, '2026-09-22');
});

test('computeNextOccurrenceWindow : mensuel et bimensuel ancrés de la même façon', async () => {
  const nextOpen = makeNextOpenDay();
  const monthly = await computeNextOccurrenceWindow(
    { recurrence_anchor_date: '2026-09-15', start_date: '2026-09-15', due_date: '2026-09-18' },
    'monthly',
    '2026-09-19',
    { nextOpenDay: nextOpen },
  );
  assert.strictEqual(monthly.startDate, '2026-10-15');
  assert.strictEqual(monthly.dueDate, '2026-10-19'); // 18/10 = dimanche → lundi

  const biweekly = await computeNextOccurrenceWindow(
    { recurrence_anchor_date: '2026-09-15', start_date: '2026-09-15', due_date: '2026-09-15' },
    'biweekly',
    '2026-09-16',
    { nextOpenDay: nextOpen },
  );
  assert.strictEqual(biweekly.startDate, '2026-09-29');
  assert.strictEqual(biweekly.dueDate, '2026-09-29');
});

test('computeNextOccurrenceWindow : entrées inexploitables', async () => {
  const nextOpen = makeNextOpenDay();
  const opts = { nextOpenDay: nextOpen };
  // Pas d'échéance : rien à faire avancer.
  assert.strictEqual(
    await computeNextOccurrenceWindow({ start_date: '2026-09-15' }, 'weekly', '2026-09-16', opts),
    null,
  );
  // Récurrence hors liste blanche.
  assert.strictEqual(
    await computeNextOccurrenceWindow(
      { start_date: '2026-09-15', due_date: '2026-09-18' },
      'daily',
      '2026-09-16',
      opts,
    ),
    null,
  );
  // Aucune ancre dérivable (ni départ, ni création).
  assert.strictEqual(
    await computeNextOccurrenceWindow({ due_date: '2026-09-18' }, 'weekly', '2026-09-16', opts),
    null,
  );
});

test('computeNextOccurrenceWindow : le coût calendrier reste borné sur une ancre ancienne', async () => {
  let appels = 0;
  const nextOpen = async (d) => {
    appels += 1;
    let cur = d;
    for (let i = 0; i < 60; i += 1) {
      if (fallbackIsOpen(cur)) return cur;
      cur = addDaysToDateString(cur, 1);
    }
    return null;
  };
  // Ancre vieille de six ans : une boucle partant de l'ancre ferait ~300 tours et autant
  // d'allers-retours en base. L'estimation arithmétique doit ramener cela à une poignée.
  const w = await computeNextOccurrenceWindow(
    { recurrence_anchor_date: '2020-09-15', start_date: '2020-09-15', due_date: '2020-09-18' },
    'weekly',
    '2026-09-16',
    { nextOpenDay: nextOpen },
  );
  assert.ok(w?.dueDate >= '2026-09-16');
  assert.ok(appels <= 40, `trop d'appels calendrier : ${appels}`);
});
