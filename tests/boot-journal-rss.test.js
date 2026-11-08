'use strict';

/**
 * Journal de cycle de vie — relevé périodique de la RSS (`lib/bootJournal.js`).
 * Un process tué sans signal (SIGKILL : plafond mémoire LVE de l'hébergeur) ne laisse aucune
 * trace d'arrêt ; les entrées `rss` écrites pendant sa vie permettent au démarrage suivant
 * d'exposer la dernière mémoire connue (`maxRssMbBeforeKill`), reprise par le rapport de santé.
 * Fichier de journal temporaire via `FORETMAP_BOOT_JOURNAL_FILE`.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const journal = require('../lib/bootJournal');
const { evaluateHealth } = require('../lib/mcp/health/rules');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foretmap-boot-journal-rss-'));
let fileSeq = 0;

function useTempJournal(lines = []) {
  fileSeq += 1;
  const file = path.join(tmpRoot, `journal-${fileSeq}.ndjson`);
  if (lines.length > 0) {
    fs.writeFileSync(file, `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`, 'utf8');
  }
  process.env.FORETMAP_BOOT_JOURNAL_FILE = file;
  journal.resetStopRecordedForTests();
  journal.resetRssForTests();
  return file;
}

test.afterEach(() => {
  journal.resetRssForTests();
  delete process.env.FORETMAP_BOOT_JOURNAL_FILE;
  delete process.env.FORETMAP_BOOT_JOURNAL_RSS_TICK_MS;
  delete process.env.FORETMAP_BOOT_JOURNAL_RSS_STEP_MB;
});

test('recordRssSample : écrit au premier relevé, puis seulement quand le maximum progresse d’un pas', () => {
  useTempJournal();
  const now = Date.parse('2026-11-08T10:00:00.000Z');
  assert.ok(journal.recordRssSample({ now, rssMb: 120, stepMb: 8 }), 'premier relevé écrit');
  assert.strictEqual(journal.recordRssSample({ now, rssMb: 124, stepMb: 8 }), null, '+4 Mo : rien');
  assert.strictEqual(
    journal.recordRssSample({ now, rssMb: 110, stepMb: 8 }),
    null,
    'baisse : rien',
  );
  const grown = journal.recordRssSample({ now: now + 60000, rssMb: 131, stepMb: 8 });
  assert.ok(grown, '+11 Mo depuis le dernier relevé écrit : écrit');
  assert.strictEqual(grown.event, 'rss');
  assert.strictEqual(grown.maxRssMb, 131);
  const entries = journal.readEntries();
  assert.deepStrictEqual(
    entries.map((e) => [e.event, e.rssMb, e.maxRssMb]),
    [
      ['rss', 120, 120],
      ['rss', 131, 131],
    ],
  );
});

test('recordRssSample : borné par process, jamais plus de RSS_MAX_ENTRIES_PER_PROCESS entrées', () => {
  useTempJournal();
  let written = 0;
  for (let i = 0; i < journal.RSS_MAX_ENTRIES_PER_PROCESS + 10; i += 1) {
    if (journal.recordRssSample({ rssMb: 100 + i * 50, stepMb: 8 })) written += 1;
  }
  assert.strictEqual(written, journal.RSS_MAX_ENTRIES_PER_PROCESS);
  assert.strictEqual(journal.readEntries().length, journal.RSS_MAX_ENTRIES_PER_PROCESS);
});

test('recordRssSample : rien quand le journal est coupé', () => {
  useTempJournal();
  process.env.FORETMAP_BOOT_JOURNAL = '0';
  try {
    assert.strictEqual(journal.recordRssSample({ rssMb: 200 }), null);
    assert.deepStrictEqual(journal.readEntries(), []);
  } finally {
    delete process.env.FORETMAP_BOOT_JOURNAL;
  }
});

test('startRssTick : un seul relevé immédiat, minuterie unref, FORETMAP_BOOT_JOURNAL_RSS_TICK_MS=0 coupe', () => {
  useTempJournal();
  const timer = journal.startRssTick({ intervalMs: 60000 });
  assert.ok(timer, 'minuterie démarrée');
  assert.strictEqual(journal.startRssTick({ intervalMs: 60000 }), null, 'une seule par process');
  const entries = journal.readEntries();
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].event, 'rss');
  assert.ok(Number.isFinite(entries[0].rssMb) && entries[0].rssMb > 0, 'RSS réelle du process');
  journal.stopRssTick();

  journal.resetRssForTests();
  useTempJournal();
  process.env.FORETMAP_BOOT_JOURNAL_RSS_TICK_MS = '0';
  assert.strictEqual(journal.startRssTick(), null);
  assert.deepStrictEqual(journal.readEntries(), []);
});

test('recordStop : emporte la RSS maximale vue pendant la vie du process', () => {
  useTempJournal();
  journal.recordRssSample({ rssMb: 150, stepMb: 8 });
  journal.recordRssSample({ rssMb: 260, stepMb: 8 });
  const stop = journal.recordStop('SIGTERM');
  assert.strictEqual(stop.maxRssMb, 260);
});

test('classifyPreviousStop : les relevés rss ne masquent pas un process tué sans signal', () => {
  const out = journal.classifyPreviousStop([
    { event: 'boot', at: '2026-11-08T08:00:00.000Z', pid: 11 },
    { event: 'rss', at: '2026-11-08T08:01:00.000Z', pid: 11, rssMb: 120, maxRssMb: 120 },
    { event: 'rss', at: '2026-11-08T08:20:00.000Z', pid: 11, rssMb: 410, maxRssMb: 410 },
  ]);
  assert.strictEqual(out.previousStop, 'hard');
});

test('summarizeBootJournal : chaque arrêt brutal est rapproché de la dernière RSS connue du process tué', () => {
  const now = Date.parse('2026-11-08T12:00:00.000Z');
  const iso = (minutesAgo) => new Date(now - minutesAgo * 60000).toISOString();
  useTempJournal([
    // Process 11 : relevés, puis tué sans signal (le boot 12 le constate).
    { event: 'boot', at: iso(300), pid: 11, previousStop: 'none' },
    { event: 'rss', at: iso(299), pid: 11, rssMb: 118, maxRssMb: 118 },
    { event: 'rss', at: iso(250), pid: 11, rssMb: 402, maxRssMb: 402 },
    { event: 'rss', at: iso(240), pid: 11, rssMb: 380, maxRssMb: 402 },
    { event: 'boot', at: iso(200), pid: 12, previousStop: 'hard' },
    // Process 12 : arrêt tracé (déploiement) — pas un arrêt brutal.
    { event: 'rss', at: iso(199), pid: 12, rssMb: 120, maxRssMb: 120 },
    { event: 'stop', at: iso(100), pid: 12, reason: 'restart', maxRssMb: 120 },
    // Process 13 : trop court pour un relevé, tué lui aussi.
    { event: 'boot', at: iso(99), pid: 13, previousStop: 'graceful', downtimeMs: 60000 },
    { event: 'boot', at: iso(30), pid: 14, previousStop: 'hard' },
    { event: 'rss', at: iso(29), pid: 14, rssMb: 125, maxRssMb: 125 },
  ]);
  const s = journal.summarizeBootJournal({ now });
  assert.strictEqual(s.counts.hardKills, 2);
  assert.strictEqual(s.verdict, 'hard_kills');
  assert.deepStrictEqual(
    s.hardKills.map((k) => [k.pid, k.maxRssMbBeforeKill]),
    [
      [11, 402],
      [13, null],
    ],
  );
  assert.strictEqual(s.hardKills[0].bootedAt, iso(300));
  assert.strictEqual(s.hardKills[0].lastRssAt, iso(240));
  assert.strictEqual(s.maxRssMbBeforeKill, 402);
  assert.strictEqual(s.rssSamples, 5);
  assert.ok(
    s.recent.every((e) => e.event !== 'rss'),
    'les relevés rss ne polluent pas la liste des derniers évènements',
  );
  assert.strictEqual(s.recent.length, 5, 'boot, boot, stop, boot, boot');
});

test('summarizeBootJournal : sans relevé rss, maxRssMbBeforeKill est null (jamais inventé)', () => {
  const now = Date.now();
  useTempJournal([
    { event: 'boot', at: new Date(now - 300000).toISOString(), pid: 1, previousStop: 'none' },
    { event: 'boot', at: new Date(now - 100000).toISOString(), pid: 2, previousStop: 'hard' },
  ]);
  const s = journal.summarizeBootJournal({ now });
  assert.strictEqual(s.counts.hardKills, 1);
  assert.strictEqual(s.maxRssMbBeforeKill, null);
  assert.deepStrictEqual(s.hardKills[0].maxRssMbBeforeKill, null);
});

test('recordBoot : le compactage retire d’abord les relevés rss anciens, jamais les arrêts', () => {
  process.env.FORETMAP_BOOT_JOURNAL_MAX_ENTRIES = '50';
  try {
    const lines = [];
    const base = Date.parse('2026-11-01T00:00:00.000Z');
    // 40 démarrages, chacun suivi de 3 relevés rss : 160 lignes pour une borne de 50.
    for (let b = 0; b < 40; b += 1) {
      const at = base + b * 3600 * 1000;
      lines.push({ event: 'boot', at: new Date(at).toISOString(), pid: b, previousStop: 'hard' });
      for (let r = 1; r <= 3; r += 1) {
        lines.push({
          event: 'rss',
          at: new Date(at + r * 60000).toISOString(),
          pid: b,
          rssMb: 100 + r,
          maxRssMb: 100 + r,
        });
      }
    }
    useTempJournal(lines);
    journal.recordBoot({ now: base + 41 * 3600 * 1000 });
    const entries = journal.readEntries();
    assert.ok(entries.length <= 51, `borné (${entries.length})`);
    const boots = entries.filter((e) => e.event === 'boot');
    assert.ok(boots.length >= 20, `l’historique des démarrages est préservé (${boots.length})`);
    const rss = entries.filter((e) => e.event === 'rss');
    assert.ok(
      rss.every((e) => e.pid >= 20),
      'seuls les relevés des derniers démarrages restent',
    );
  } finally {
    delete process.env.FORETMAP_BOOT_JOURNAL_MAX_ENTRIES;
  }
});

test('règle de santé `restarts` : la RSS max avant arrêt brutal apparaît dans le constat', () => {
  const withRss = evaluateHealth({
    restarts: { counts: { hardKills: 3 }, verdict: 'hard_kills', maxRssMbBeforeKill: 487.5 },
  });
  assert.strictEqual(withRss.status, 'orange');
  assert.match(withRss.findings[0].message, /RSS max relevée avant arrêt brutal : 487\.5 Mo/);
  const without = evaluateHealth({
    restarts: { counts: { hardKills: 1 }, verdict: 'stable', maxRssMbBeforeKill: null },
  });
  assert.match(without.findings[0].message, /RSS avant arrêt brutal inconnue/);
  const crashOnly = evaluateHealth({ restarts: { counts: { crashes: 1 } } });
  assert.doesNotMatch(crashOnly.findings[0].message, /RSS/);
});
