require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');

/**
 * `src/utils/schoolCalendarPeriods.js` : regroupement des jours du calendrier scolaire en
 * périodes lisibles pour le panneau des réglages. Les vacances sont stockées jour par jour,
 * week-ends compris sous le type « week-end » : une période doit les enjamber.
 */
async function load() {
  return import('../src/utils/schoolCalendarPeriods.js');
}

function jour(date, kind, label = null) {
  return { date, kind, label, is_open: kind === 'open' || kind === 'extra_open' };
}

test('groupCalendarPeriods : des vacances coupées par un week-end forment une seule période', async () => {
  const { groupCalendarPeriods } = await load();
  const days = [
    jour('2026-10-16', 'open'),
    jour('2026-10-17', 'weekend'),
    jour('2026-10-18', 'weekend'),
    jour('2026-10-19', 'vacation', 'Toussaint'),
    jour('2026-10-23', 'vacation', 'Toussaint'),
    jour('2026-10-24', 'weekend'),
    jour('2026-10-25', 'weekend'),
    jour('2026-10-26', 'vacation', 'Toussaint'),
    jour('2026-10-30', 'vacation', 'Toussaint'),
    jour('2026-10-31', 'weekend'),
    jour('2026-11-02', 'open'),
  ];
  assert.deepStrictEqual(groupCalendarPeriods(days), [
    { from: '2026-10-19', to: '2026-10-30', kind: 'vacation', label: 'Toussaint', days: 4 },
  ]);
});

test('groupCalendarPeriods : un jour ouvert, un autre type ou un autre libellé coupent la période', async () => {
  const { groupCalendarPeriods } = await load();
  const periods = groupCalendarPeriods([
    // Désordre volontaire : la fonction trie elle-même.
    jour('2026-11-12', 'holiday', 'Armistice'),
    jour('2026-11-11', 'holiday', 'Armistice'),
    jour('2026-11-13', 'closed', 'Conseil de classe'),
    jour('2026-11-16', 'open'),
    jour('2026-11-17', 'vacation', 'A'),
    jour('2026-11-18', 'vacation', 'B'),
    jour('2026-11-21', 'extra_open', 'Portes ouvertes'),
  ]);
  assert.deepStrictEqual(
    periods.map((p) => [p.kind, p.label, p.from, p.to]),
    [
      ['holiday', 'Armistice', '2026-11-11', '2026-11-12'],
      ['closed', 'Conseil de classe', '2026-11-13', '2026-11-13'],
      ['vacation', 'A', '2026-11-17', '2026-11-17'],
      ['vacation', 'B', '2026-11-18', '2026-11-18'],
      ['extra_open', 'Portes ouvertes', '2026-11-21', '2026-11-21'],
    ],
  );
});

test('groupCalendarPeriods : ni jours ordinaires ni entrées illisibles', async () => {
  const { groupCalendarPeriods } = await load();
  assert.deepStrictEqual(
    groupCalendarPeriods([jour('2026-09-07', 'open'), jour('2026-09-12', 'weekend')]),
    [],
  );
  assert.deepStrictEqual(groupCalendarPeriods(null), []);
  assert.deepStrictEqual(groupCalendarPeriods([{ date: 'hier', kind: 'vacation' }]), []);
});

test('describeOpenWeekdays : plage continue en clair, sinon liste', async () => {
  const { describeOpenWeekdays } = await load();
  assert.strictEqual(describeOpenWeekdays([1, 2, 3, 4, 5]), 'du lundi au vendredi');
  assert.strictEqual(describeOpenWeekdays([5, 3, 1]), 'lundi, mercredi, vendredi');
  assert.strictEqual(describeOpenWeekdays([1, 2, 3, 4, 5, 6]), 'du lundi au samedi');
  assert.strictEqual(describeOpenWeekdays([]), 'aucun jour');
});

test('formatPeriodRange : un jour ou une plage', async () => {
  const { formatPeriodRange } = await load();
  assert.match(formatPeriodRange({ from: '2026-11-11', to: '2026-11-11' }), /^le mer\. 11 nov/);
  assert.match(
    formatPeriodRange({ from: '2026-10-19', to: '2026-10-30' }),
    /^du lun\. 19 oct.* au ven\. 30 oct/,
  );
});
