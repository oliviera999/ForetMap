'use strict';

/**
 * Journal persistant du cycle de vie du process (`lib/bootJournal.js`).
 * Ce qui est vérifié ici, c'est la **qualification de l'arrêt précédent** : c'est elle
 * qui distingue un redémarrage de déploiement d'un arrêt subi, donc qui oriente le
 * diagnostic d'une indisponibilité en production (o2switch / Passenger).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const journal = require('../lib/bootJournal');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foretmap-boot-journal-'));
let fileSeq = 0;

/** Isole chaque test dans son propre fichier de journal. */
function useTempJournal(lines = []) {
  fileSeq += 1;
  const file = path.join(tmpRoot, `journal-${fileSeq}.ndjson`);
  if (lines.length > 0) {
    fs.writeFileSync(file, `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`, 'utf8');
  }
  process.env.FORETMAP_BOOT_JOURNAL_FILE = file;
  journal.resetStopRecordedForTests();
  return file;
}

test.afterEach(() => {
  delete process.env.FORETMAP_BOOT_JOURNAL_FILE;
  delete process.env.FORETMAP_BOOT_JOURNAL;
  delete process.env.FORETMAP_BOOT_JOURNAL_MAX_ENTRIES;
});

test('classifyPreviousStop : journal vide -> none', () => {
  assert.deepStrictEqual(journal.classifyPreviousStop([]), {
    previousStop: 'none',
    previousStopReason: null,
    previousStopAt: null,
  });
});

test('classifyPreviousStop : dernier évènement = stop -> arrêt maîtrisé, avec sa raison', () => {
  const out = journal.classifyPreviousStop([
    { event: 'boot', at: '2026-08-26T10:00:00.000Z' },
    { event: 'stop', at: '2026-08-26T11:00:00.000Z', reason: 'restart' },
  ]);
  assert.strictEqual(out.previousStop, 'graceful');
  assert.strictEqual(out.previousStopReason, 'restart');
  assert.strictEqual(out.previousStopAt, '2026-08-26T11:00:00.000Z');
});

test('classifyPreviousStop : dernier évènement = crash -> crash', () => {
  const out = journal.classifyPreviousStop([
    { event: 'boot', at: '2026-08-26T10:00:00.000Z' },
    { event: 'crash', at: '2026-08-26T10:05:00.000Z', kind: 'uncaughtException' },
  ]);
  assert.strictEqual(out.previousStop, 'crash');
  assert.strictEqual(out.previousStopReason, 'uncaughtException');
});

test('classifyPreviousStop : boot suivi d’un boot -> process tué sans signal (hard)', () => {
  const out = journal.classifyPreviousStop([
    { event: 'stop', at: '2026-08-26T09:00:00.000Z', reason: 'SIGTERM' },
    { event: 'boot', at: '2026-08-26T10:00:00.000Z' },
  ]);
  assert.strictEqual(out.previousStop, 'hard');
  assert.strictEqual(out.previousStopReason, null);
});

test('recordBoot : après un arrêt tracé, mesure la fenêtre d’indisponibilité', () => {
  const now = Date.parse('2026-08-26T12:00:00.000Z');
  useTempJournal([
    { event: 'boot', at: '2026-08-26T11:00:00.000Z' },
    { event: 'stop', at: '2026-08-26T11:59:30.000Z', reason: 'restart' },
  ]);
  const entry = journal.recordBoot({ version: '1.129.0', now });
  assert.strictEqual(entry.event, 'boot');
  assert.strictEqual(entry.previousStop, 'graceful');
  assert.strictEqual(entry.previousStopReason, 'restart');
  assert.strictEqual(entry.downtimeMs, 30000);
  assert.strictEqual(entry.version, '1.129.0');
  assert.strictEqual(journal.readEntries().length, 3);
});

test('recordBoot : sans arrêt tracé, pas de durée d’indisponibilité inventée', () => {
  useTempJournal([{ event: 'boot', at: '2026-08-26T11:00:00.000Z' }]);
  const entry = journal.recordBoot({ now: Date.parse('2026-08-26T12:00:00.000Z') });
  assert.strictEqual(entry.previousStop, 'hard');
  assert.strictEqual(entry.downtimeMs, null);
});

test('recordStop : un seul enregistrement d’arrêt par process', () => {
  useTempJournal();
  assert.ok(journal.recordStop('restart'));
  assert.strictEqual(journal.recordStop('SIGTERM'), null);
  const entries = journal.readEntries();
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].reason, 'restart');
});

test('recordCrash : tronque le message et n’écrase pas un arrêt déjà tracé', () => {
  useTempJournal();
  const entry = journal.recordCrash('uncaughtException', new Error('x'.repeat(500)));
  assert.strictEqual(entry.kind, 'uncaughtException');
  assert.strictEqual(entry.message.length, 300);
  assert.strictEqual(journal.recordStop('SIGTERM'), null);
});

test('readEntries : une ligne tronquée (arrêt brutal en pleine écriture) est ignorée', () => {
  const file = useTempJournal([{ event: 'boot', at: '2026-08-26T10:00:00.000Z' }]);
  fs.appendFileSync(file, '{"event":"stop","at":"2026-08\n', 'utf8');
  const entries = journal.readEntries();
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].event, 'boot');
});

test('summarizeBootJournal : compte par nature et ignore hors fenêtre', () => {
  const now = Date.parse('2026-08-26T12:00:00.000Z');
  const iso = (minutesAgo) => new Date(now - minutesAgo * 60000).toISOString();
  useTempJournal([
    { event: 'stop', at: iso(60 * 40), reason: 'restart' }, // hors fenêtre 24 h
    { event: 'stop', at: iso(300), reason: 'restart' },
    { event: 'boot', at: iso(299), previousStop: 'graceful', downtimeMs: 60000 },
    { event: 'stop', at: iso(200), reason: 'SIGTERM' },
    { event: 'stop', at: iso(180), reason: 'env_invalid' },
    { event: 'boot', at: iso(150), previousStop: 'graceful', downtimeMs: 40000 },
    { event: 'boot', at: iso(30), previousStop: 'hard', downtimeMs: null },
  ]);
  const s = journal.summarizeBootJournal({ now });
  assert.strictEqual(s.counts.deployRestarts, 1);
  assert.strictEqual(s.counts.hostStops, 1);
  assert.strictEqual(s.counts.startupFailures, 1);
  assert.strictEqual(s.counts.boots, 3);
  assert.strictEqual(s.counts.hardKills, 1);
  assert.strictEqual(s.counts.crashes, 0);
  assert.strictEqual(s.downtime.samples, 2);
  assert.strictEqual(s.downtime.totalMs, 100000);
  assert.strictEqual(s.downtime.averageMs, 50000);
});

test("summarizeBootJournal : un refus de démarrage n'est pas compté comme arrêt hébergeur", () => {
  const now = Date.now();
  useTempJournal([
    { event: 'stop', at: new Date(now - 120000).toISOString(), reason: 'env_invalid' },
    { event: 'stop', at: new Date(now - 60000).toISOString(), reason: 'listen_error' },
  ]);
  const s = journal.summarizeBootJournal({ now });
  assert.strictEqual(s.counts.startupFailures, 2);
  assert.strictEqual(s.counts.hostStops, 0);
  assert.strictEqual(s.verdict, 'startup_failures');
  assert.match(s.advice, /\.env/);
});

test('summarizeBootJournal : un crash prime sur toute autre cause', () => {
  const now = Date.now();
  useTempJournal([
    { event: 'crash', at: new Date(now - 60000).toISOString(), kind: 'unhandledRejection' },
    { event: 'boot', at: new Date(now - 59000).toISOString(), previousStop: 'crash' },
  ]);
  const s = journal.summarizeBootJournal({ now });
  assert.strictEqual(s.verdict, 'crashes');
  assert.match(s.advice, /bug applicatif/);
});

test('summarizeBootJournal : deux process tués sans signal -> verdict mémoire/LVE', () => {
  const now = Date.now();
  useTempJournal([
    { event: 'boot', at: new Date(now - 300000).toISOString(), previousStop: 'hard' },
    { event: 'boot', at: new Date(now - 100000).toISOString(), previousStop: 'hard' },
  ]);
  const s = journal.summarizeBootJournal({ now });
  assert.strictEqual(s.verdict, 'hard_kills');
  assert.match(s.advice, /LVE/);
});

test('summarizeBootJournal : arrêts hébergeur répétés -> verdict inactivité (keepalive)', () => {
  const now = Date.now();
  const entries = [];
  for (let i = 1; i <= 4; i += 1) {
    entries.push({
      event: 'stop',
      at: new Date(now - i * 600000).toISOString(),
      reason: 'SIGTERM',
    });
  }
  useTempJournal(entries);
  const s = journal.summarizeBootJournal({ now });
  assert.strictEqual(s.verdict, 'host_idle_stops');
  assert.match(s.advice, /keepalive/);
});

test('summarizeBootJournal : déploiements en rafale -> verdict deploy_churn', () => {
  const now = Date.now();
  const entries = [];
  for (let i = 1; i <= 5; i += 1) {
    entries.push({
      event: 'stop',
      at: new Date(now - i * 300000).toISOString(),
      reason: 'restart',
    });
  }
  useTempJournal(entries);
  const s = journal.summarizeBootJournal({ now });
  assert.strictEqual(s.verdict, 'deploy_churn');
});

test('summarizeBootJournal : journal calme -> stable', () => {
  const now = Date.now();
  useTempJournal([
    { event: 'stop', at: new Date(now - 3600000).toISOString(), reason: 'restart' },
    { event: 'boot', at: new Date(now - 3590000).toISOString(), previousStop: 'graceful' },
  ]);
  assert.strictEqual(journal.summarizeBootJournal({ now }).verdict, 'stable');
});

test('recordBoot : le journal est borné (compactage au démarrage)', () => {
  process.env.FORETMAP_BOOT_JOURNAL_MAX_ENTRIES = '50';
  const lines = [];
  for (let i = 0; i < 200; i += 1) {
    lines.push({ event: 'boot', at: new Date(Date.now() - (200 - i) * 1000).toISOString() });
  }
  useTempJournal(lines);
  journal.recordBoot({});
  assert.strictEqual(journal.readEntries().length, 51);
});

test('journal désactivé sous NODE_ENV=test sans chemin explicite', () => {
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  delete process.env.FORETMAP_BOOT_JOURNAL_FILE;
  try {
    assert.strictEqual(journal.isBootJournalEnabled(), false);
    assert.strictEqual(journal.recordBoot({}), null);
  } finally {
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
  }
});

test('FORETMAP_BOOT_JOURNAL=0 coupe l’écriture même avec un chemin défini', () => {
  useTempJournal();
  process.env.FORETMAP_BOOT_JOURNAL = '0';
  assert.strictEqual(journal.isBootJournalEnabled(), false);
  assert.strictEqual(journal.recordBoot({}), null);
});
