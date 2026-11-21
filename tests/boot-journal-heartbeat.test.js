'use strict';

/**
 * Diagnostic des arrêts sans trace (`lib/bootJournal.js`) : signaux tracés, sortie tracée,
 * battement (dernière minute de vie connue), répartition par heure de la mort et conseil
 * écrit à partir des mesures.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const journal = require('../lib/bootJournal');
const { evaluateHealth } = require('../lib/mcp/health/rules');
const { restartsDiagnosisFields } = require('../lib/mcp/tools/diagnosticsInternal');
const { describeEntry, diagnosisLines } = require('../scripts/prod-uptime-report');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foretmap-boot-heartbeat-'));
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
  delete process.env.FORETMAP_BOOT_JOURNAL;
  delete process.env.FORETMAP_BOOT_JOURNAL_HEARTBEAT_MS;
});

test.after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

/** Date locale du jour à l'heure donnée, dans le passé proche (heure du serveur). */
function localAt(now, hour, minute = 0) {
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

/* ------------------------------------------------------------------ signaux */

test('tracedSignals : SIGTERM, SIGINT et les signaux jusque-là non suivis ; jamais SIGUSR1', () => {
  if (process.platform === 'win32') return;
  const dev = journal.tracedSignals({ env: { NODE_ENV: 'development' } });
  for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGQUIT', 'SIGXCPU']) {
    assert.ok(dev.includes(s), `${s} doit être tracé`);
  }
  // nodemon relance le serveur par SIGUSR2 ; l'inspecteur Node démarre par SIGUSR1.
  assert.ok(!dev.includes('SIGUSR2'), 'SIGUSR2 laissé à nodemon hors production');
  const prod = journal.tracedSignals({ env: { NODE_ENV: 'production' } });
  assert.ok(prod.includes('SIGUSR2'));
  for (const never of ['SIGUSR1', 'SIGPROF', 'SIGPIPE', 'SIGKILL', 'SIGSEGV', 'SIGABRT']) {
    assert.ok(!prod.includes(never), `${never} ne doit pas être écouté`);
  }
});

test('tracedSignals : un nom inconnu de la plateforme est écarté', () => {
  const out = journal.tracedSignals({
    env: { NODE_ENV: 'production' },
    platformSignals: { SIGTERM: 15, SIGINT: 2, SIGHUP: 1 },
  });
  assert.deepStrictEqual(out, ['SIGTERM', 'SIGINT', 'SIGHUP']);
});

test('registerTracedSignalHandlers : un écouteur par signal, une erreur n’arrête pas les autres', () => {
  const seen = [];
  const proc = {
    once(signal, fn) {
      if (signal === 'SIGQUIT') throw new Error('refusé');
      seen.push([signal, fn]);
    },
  };
  const got = [];
  const registered = journal.registerTracedSignalHandlers((s) => got.push(s), {
    proc,
    signals: ['SIGHUP', 'SIGQUIT', 'SIGXCPU'],
  });
  assert.deepStrictEqual(registered, ['SIGHUP', 'SIGXCPU']);
  seen[1][1]();
  assert.deepStrictEqual(got, ['SIGXCPU']);
});

/** Lance un processus qui écoute les signaux tracés comme `server.js`, puis lui envoie `signal`. */
function runChildAndSignal(file, signal) {
  const script = `
    const j = require(${JSON.stringify(path.join(__dirname, '..', 'lib', 'bootJournal.js'))});
    j.recordBoot({ version: 'test' });
    j.registerTracedSignalHandlers((s) => { j.recordStop(j.resolveStopReason(s)); process.exit(0); });
    process.once('exit', (code) => j.recordExit(code));
    setInterval(() => {}, 1000);
    process.stdout.write('ready\\n');
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', script], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        FORETMAP_BOOT_JOURNAL_FILE: file,
        FORETMAP_BOOT_JOURNAL: '',
      },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    child.stdout.once('data', () => child.kill(signal));
    child.once('error', reject);
    child.once('exit', (code, sig) => resolve({ code, sig }));
  });
}

test('chaque signal retenu laisse une trace d’arrêt avec son motif', async () => {
  if (process.platform === 'win32') return;
  const signals = journal.tracedSignals({ env: { NODE_ENV: 'production' } });
  assert.ok(signals.length >= 8);
  for (const signal of signals) {
    const file = path.join(tmpRoot, `signal-${signal}.ndjson`);
    const { code, sig } = await runChildAndSignal(file, signal);
    assert.strictEqual(sig, null, `${signal} : arrêt maîtrisé, pas l'action par défaut`);
    assert.strictEqual(code, 0);
    const entries = fs
      .readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    const stops = entries.filter((e) => e.event === 'stop');
    assert.strictEqual(stops.length, 1, `${signal} : une seule trace d'arrêt`);
    assert.strictEqual(stops[0].reason, signal);
  }
});

test('un signal non intercepté (SIGKILL) ne laisse aucune trace : démarrage suivant « hard »', async () => {
  if (process.platform === 'win32') return;
  const file = path.join(tmpRoot, 'signal-kill.ndjson');
  const { sig } = await runChildAndSignal(file, 'SIGKILL');
  assert.strictEqual(sig, 'SIGKILL');
  process.env.FORETMAP_BOOT_JOURNAL_FILE = file;
  const boot = journal.recordBoot({});
  assert.strictEqual(boot.previousStop, 'hard');
  assert.strictEqual(boot.previousPidAlive, false, 'le processus tué n’existe plus');
});

/* ------------------------------------------------------------------ sortie tracée */

test('recordExit : sortie sans arrêt tracé -> `exit` ; chargeur Passenger en arrêt -> `passenger-stdin`', () => {
  const file = useTempJournal();
  const plain = journal.recordExit(3, { passenger: undefined });
  assert.strictEqual(plain.reason, 'exit');
  assert.strictEqual(plain.exitCode, 3);
  journal.resetStopRecordedForTests();
  const viaPassenger = journal.recordExit(0, { passenger: { shutting_down: true } });
  assert.strictEqual(viaPassenger.reason, 'passenger-stdin');
  assert.strictEqual(viaPassenger.event, 'stop');
  assert.strictEqual(fs.readFileSync(file, 'utf8').trim().split('\n').length, 2);
});

test('recordExit : ne double jamais un arrêt ou un crash déjà tracé', () => {
  useTempJournal();
  assert.ok(journal.recordStop('SIGHUP'));
  assert.strictEqual(journal.recordExit(0), null);
  journal.resetStopRecordedForTests();
  assert.ok(journal.recordCrash('uncaughtException', new Error('x')));
  assert.strictEqual(journal.recordExit(1), null);
  assert.strictEqual(journal.readEntries().length, 2);
});

/* ------------------------------------------------------------------ battement */

test('battement : une seule valeur réécrite, jamais une ligne de journal', () => {
  const file = useTempJournal();
  const t0 = Date.parse('2026-11-20T02:00:00.000Z');
  for (let i = 0; i < 30; i += 1) {
    assert.ok(journal.writeHeartbeat({ now: t0 + i * 60000, rssMb: 140 + i }));
  }
  assert.strictEqual(fs.existsSync(file), false, 'le journal ne grossit pas');
  const beat = journal.readHeartbeat();
  assert.strictEqual(beat.at, new Date(t0 + 29 * 60000).toISOString());
  assert.strictEqual(beat.pid, process.pid);
  assert.strictEqual(beat.rssMb, 169);
  assert.strictEqual(beat.maxRssMb, 169);
  assert.deepStrictEqual(
    fs.readdirSync(tmpRoot).filter((f) => f.includes(`journal-${fileSeq}`)),
    [`journal-${fileSeq}.heartbeat.json`],
    'ni fichier temporaire oublié, ni second fichier',
  );
});

test('battement : désactivé comme le journal (NODE_ENV=test sans chemin, ou FORETMAP_BOOT_JOURNAL=0)', () => {
  delete process.env.FORETMAP_BOOT_JOURNAL_FILE;
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  try {
    assert.strictEqual(journal.writeHeartbeat(), null);
    assert.strictEqual(journal.startHeartbeat({ intervalMs: 10 }), null);
  } finally {
    process.env.NODE_ENV = previous;
  }
  useTempJournal();
  process.env.FORETMAP_BOOT_JOURNAL = '0';
  assert.strictEqual(journal.writeHeartbeat(), null);
  assert.strictEqual(fs.existsSync(journal.heartbeatPath()), false);
});

test('battement : une erreur d’E/S ne lève jamais (ni à l’écriture, ni au démarrage suivant)', () => {
  // Le « dossier » du journal est un fichier : toute écriture échoue.
  const blocker = path.join(tmpRoot, 'pas-un-dossier');
  fs.writeFileSync(blocker, 'x');
  process.env.FORETMAP_BOOT_JOURNAL_FILE = path.join(blocker, 'journal.ndjson');
  assert.strictEqual(journal.writeHeartbeat(), null);
  assert.strictEqual(journal.readHeartbeat(), null);
  assert.doesNotThrow(() => journal.recordBoot({}));
  assert.doesNotThrow(() => journal.startHeartbeat({ intervalMs: 1000 }));
});

test('startHeartbeat : premier battement immédiat, minuterie unique, `0` coupe', () => {
  useTempJournal();
  assert.strictEqual(journal.startHeartbeat({ intervalMs: 0 }), null);
  assert.strictEqual(journal.readHeartbeat(), null);
  const timer = journal.startHeartbeat({ intervalMs: 60000 });
  assert.ok(timer);
  assert.strictEqual(timer.hasRef(), false, 'la minuterie ne retient pas le processus');
  assert.strictEqual(journal.readHeartbeat().pid, process.pid);
  assert.strictEqual(journal.startHeartbeat({ intervalMs: 60000 }), null, 'un seul par process');
});

test('recordBoot : le battement du processus disparu date sa mort', () => {
  const bootAt = Date.parse('2026-11-20T00:10:00.000Z');
  const lastBeat = Date.parse('2026-11-20T02:00:00.000Z');
  const now = Date.parse('2026-11-20T02:01:30.000Z');
  useTempJournal([
    { event: 'boot', at: new Date(bootAt).toISOString(), pid: process.pid, previousStop: 'none' },
    { event: 'rss', at: new Date(bootAt + 1000).toISOString(), pid: process.pid, rssMb: 140 },
  ]);
  journal.writeHeartbeat({ now: lastBeat, rssMb: 147.2, intervalMs: 60000 });
  const boot = journal.recordBoot({ now });
  assert.strictEqual(boot.previousStop, 'hard');
  assert.strictEqual(boot.lastAliveAt, new Date(lastBeat).toISOString());
  assert.strictEqual(boot.previousBootAt, new Date(bootAt).toISOString());
  assert.strictEqual(boot.previousLifetimeMs, lastBeat - bootAt);
  assert.strictEqual(boot.previousRssMb, 147.2);
  assert.strictEqual(boot.heartbeatMs, 60000);
  assert.strictEqual(boot.downtimeEstimateMs, 90000);
  assert.strictEqual(
    boot.downtimeMs,
    null,
    'l’indisponibilité mesurée reste réservée aux arrêts tracés',
  );
});

test('recordBoot : un battement qui n’est pas celui du processus disparu est ignoré', () => {
  const now = Date.parse('2026-11-20T03:00:00.000Z');
  useTempJournal([
    { event: 'boot', at: '2026-11-20T01:00:00.000Z', pid: 999999991, previousStop: 'none' },
  ]);
  // Battement d'un autre PID (le nôtre) : ne doit pas dater la mort du 999999991.
  journal.writeHeartbeat({ now: now - 60000, rssMb: 150 });
  const other = journal.recordBoot({ now });
  assert.strictEqual(other.previousStop, 'hard');
  assert.strictEqual(other.lastAliveAt, undefined);
  assert.strictEqual(other.previousPid, 999999991);

  // Battement du bon PID mais antérieur à son démarrage (PID réutilisé) : ignoré aussi.
  useTempJournal([
    { event: 'boot', at: '2026-11-20T01:00:00.000Z', pid: process.pid, previousStop: 'none' },
  ]);
  journal.writeHeartbeat({ now: Date.parse('2026-11-19T23:00:00.000Z'), rssMb: 150 });
  assert.strictEqual(journal.recordBoot({ now }).lastAliveAt, undefined);
});

test('recordBoot : après un arrêt tracé, le battement n’est pas rapporté', () => {
  const now = Date.parse('2026-11-20T03:00:00.000Z');
  useTempJournal([
    { event: 'boot', at: '2026-11-20T01:00:00.000Z', pid: process.pid, previousStop: 'none' },
    { event: 'stop', at: '2026-11-20T02:00:00.000Z', pid: process.pid, reason: 'SIGHUP' },
  ]);
  journal.writeHeartbeat({ now: Date.parse('2026-11-20T01:59:00.000Z'), rssMb: 150 });
  const boot = journal.recordBoot({ now });
  assert.strictEqual(boot.previousStop, 'graceful');
  assert.strictEqual(boot.previousStopReason, 'SIGHUP');
  assert.strictEqual(boot.lastAliveAt, undefined);
  assert.strictEqual(boot.downtimeMs, 3600000);
});

test('recordBoot : battement tronqué ou illisible -> démarrage normal, mort non datée', () => {
  const now = Date.parse('2026-11-20T03:00:00.000Z');
  useTempJournal([
    { event: 'boot', at: '2026-11-20T01:00:00.000Z', pid: process.pid, previousStop: 'none' },
  ]);
  fs.writeFileSync(journal.heartbeatPath(), '{"at":"2026-11-20T02:0', 'utf8');
  const boot = journal.recordBoot({ now });
  assert.strictEqual(boot.previousStop, 'hard');
  assert.strictEqual(boot.lastAliveAt, undefined);
});

test('recordBoot : la description du processus disparu en échec laisse l’entrée normale s’écrire', () => {
  const now = Date.parse('2026-11-20T03:00:00.000Z');
  const file = useTempJournal([
    { event: 'boot', at: '2026-11-20T01:00:00.000Z', pid: process.pid, previousStop: 'none' },
  ]);
  let boot;
  assert.doesNotThrow(() => {
    boot = journal.recordBoot({
      now,
      version: '9.9.9',
      describeVanished: () => {
        throw new Error('battement illisible');
      },
    });
  });
  assert.strictEqual(boot.event, 'boot');
  assert.strictEqual(boot.previousStop, 'hard');
  assert.strictEqual(boot.version, '9.9.9');
  assert.strictEqual(boot.lastAliveAt, undefined);
  assert.strictEqual(fs.readFileSync(file, 'utf8').trim().split('\n').length, 2);

  // Entrée de journal inattendue (champs de mauvais type) : pas d'exception non plus.
  useTempJournal([{ event: 'boot', at: { x: 1 }, pid: 'abc', previousStop: 7 }]);
  fs.writeFileSync(journal.heartbeatPath(), '[1,2,3]', 'utf8');
  const odd = journal.recordBoot({ now });
  assert.strictEqual(odd.previousStop, 'hard');
  assert.strictEqual(odd.lastAliveAt, undefined);
});

test('previousPidAlive : vrai quand le processus « disparu » vit encore (second processus)', async () => {
  if (process.platform === 'win32') return;
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  try {
    useTempJournal([
      { event: 'boot', at: new Date(Date.now() - 5000).toISOString(), pid: child.pid },
    ]);
    const boot = journal.recordBoot({});
    assert.strictEqual(boot.previousStop, 'hard');
    assert.strictEqual(boot.previousPidAlive, true);
    const s = journal.summarizeBootJournal({});
    assert.strictEqual(s.hardKillsPreviousAlive, 1);
  } finally {
    child.kill('SIGKILL');
  }
});

/* ------------------------------------------------------------------ lecture */

test('journal d’ancien format (sans battement) : lisible, heures du redémarrage, dit comme tel', () => {
  const now = Date.now();
  const at3 = localAt(now, 3, 10);
  useTempJournal([
    { event: 'boot', at: new Date(at3 - 7200000).toISOString(), pid: 1, previousStop: 'none' },
    { event: 'boot', at: new Date(at3 - 3600000).toISOString(), pid: 2, previousStop: 'hard' },
    { event: 'boot', at: new Date(at3).toISOString(), pid: 3, previousStop: 'hard' },
  ]);
  const s = journal.summarizeBootJournal({ now, windowHours: 48 });
  assert.strictEqual(s.counts.hardKills, 2);
  assert.deepStrictEqual(s.hardKillsByHourBasis, { death: 0, restart: 2 });
  assert.strictEqual(s.hardKillsByHour[3], 1);
  assert.strictEqual(s.hardKillsByHour[2], 1);
  assert.strictEqual(s.hardKills[0].lastAliveAt, null);
  assert.strictEqual(s.hardKills[0].lifetimeMs, null);
  assert.strictEqual(s.hardKillLifetimeMs.samples, 0);
  assert.strictEqual(s.verdict, 'hard_kills');
  assert.match(s.advice, /celles du redémarrage seulement/);
  assert.match(s.advice, /ne rien conclure sur la mémoire/);
  assert.doesNotMatch(s.advice, /réduire la RAM/);
});

test('répartition par heure de la mort quand le battement la donne, sinon du redémarrage', () => {
  const now = Date.now();
  const died2 = localAt(now, 2, 0);
  const restart = died2 + 4 * 60000; // redémarré à 2 h 04
  const died4 = localAt(now, 4, 59);
  const restart5 = died4 + 3 * 60000; // mort à 4 h 59, redémarré à 5 h 02
  const old = Math.min(died2, died4) - 6 * 3600000;
  const lines = [
    { event: 'boot', at: new Date(old).toISOString(), pid: 1, previousStop: 'none' },
    {
      event: 'boot',
      at: new Date(restart).toISOString(),
      pid: 2,
      previousStop: 'hard',
      lastAliveAt: new Date(died2).toISOString(),
      previousLifetimeMs: 7200000,
      previousRssMb: 147,
      previousMaxRssMb: 149,
      downtimeEstimateMs: 240000,
      previousPidAlive: false,
    },
    {
      event: 'boot',
      at: new Date(restart5).toISOString(),
      pid: 3,
      previousStop: 'hard',
      lastAliveAt: new Date(died4).toISOString(),
      previousLifetimeMs: 3600000,
      previousRssMb: 145,
      previousMaxRssMb: 146,
      downtimeEstimateMs: 180000,
      previousPidAlive: false,
    },
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  useTempJournal(lines);
  const s = journal.summarizeBootJournal({ now, windowHours: 48 });
  assert.deepStrictEqual(s.hardKillsByHourBasis, { death: 2, restart: 0 });
  assert.strictEqual(s.hardKillsByHour[2], 1);
  assert.strictEqual(s.hardKillsByHour[4], 1, 'compté à l’heure de la mort (4 h)…');
  assert.strictEqual(s.hardKillsByHour[5], 0, '…pas à celle du redémarrage (5 h)');
  assert.deepStrictEqual(s.hardKillLifetimeMs, {
    samples: 2,
    min: 3600000,
    median: 5400000,
    max: 7200000,
  });
  assert.strictEqual(s.hardKillRssMb.max, 149);
  assert.strictEqual(s.hardKillDowntimeEstimateMs.max, 240000);
  assert.strictEqual(s.maxRssMbBeforeKill, 149);
});

test('conseil corrigé : poids bas avant l’arrêt -> la mémoire n’est plus affirmée', () => {
  const now = Date.now();
  const mk = (minAgo, pid, rss) => ({
    event: 'boot',
    at: new Date(now - minAgo * 60000).toISOString(),
    pid,
    previousStop: 'hard',
    lastAliveAt: new Date(now - (minAgo + 2) * 60000).toISOString(),
    previousLifetimeMs: 600000,
    previousRssMb: rss,
    previousMaxRssMb: rss,
  });
  useTempJournal([mk(300, 1, 146), mk(200, 2, 147), mk(100, 3, 148)]);
  const low = journal.summarizeBootJournal({ now });
  assert.strictEqual(low.verdict, 'hard_kills');
  assert.match(low.advice, /Poids avant l'arrêt bas \(médiane 147 Mo, max 148 Mo\)/);
  assert.match(low.advice, /n'explique pas ces arrêts/);
  assert.doesNotMatch(low.advice, /réduire la RAM|mémoire est plausible/);
  assert.ok(low.advice.length <= 600, 'tient dans la borne du connecteur');

  useTempJournal([mk(300, 1, 146), mk(200, 2, 612), mk(100, 3, 148)]);
  const high = journal.summarizeBootJournal({ now });
  assert.match(high.advice, /jusqu'à 612 Mo : une limite de mémoire est plausible/);
  assert.ok(high.advice.length <= 600);
});

test('signal reçu (tracé) distingué de « tué sans signal »', () => {
  const now = Date.now();
  const at = (minAgo) => new Date(now - minAgo * 60000).toISOString();
  useTempJournal([
    { event: 'boot', at: at(500), pid: 1, previousStop: 'none' },
    { event: 'stop', at: at(400), pid: 1, reason: 'SIGXCPU' },
    { event: 'boot', at: at(399), pid: 2, previousStop: 'graceful', previousStopReason: 'SIGXCPU' },
    { event: 'stop', at: at(300), pid: 2, reason: 'SIGXCPU' },
    { event: 'boot', at: at(299), pid: 3, previousStop: 'graceful', previousStopReason: 'SIGXCPU' },
    { event: 'stop', at: at(200), pid: 3, reason: 'SIGHUP' },
    { event: 'boot', at: at(199), pid: 4, previousStop: 'graceful', previousStopReason: 'SIGHUP' },
    { event: 'stop', at: at(100), pid: 4, reason: 'restart' },
    { event: 'boot', at: at(99), pid: 5, previousStop: 'graceful', previousStopReason: 'restart' },
  ]);
  const s = journal.summarizeBootJournal({ now });
  assert.deepStrictEqual(s.stopsByReason, { SIGXCPU: 2, SIGHUP: 1, restart: 1 });
  assert.strictEqual(s.signalStops, 3);
  assert.strictEqual(s.counts.hardKills, 0);
  assert.strictEqual(s.verdict, 'signal_stops');
  assert.match(s.advice, /SIGXCPU ×2 \(limite de temps processeur/);
  assert.match(s.advice, /SIGHUP ×1/);
  assert.ok(s.advice.length <= 600);
});

test('arrêts `passenger-stdin` : comptés côté hébergeur, conseil sans mémoire ni signal', () => {
  const now = Date.now();
  const lines = [];
  for (let i = 4; i >= 1; i -= 1) {
    lines.push({ event: 'boot', at: new Date(now - i * 3600000).toISOString(), pid: i });
    lines.push({
      event: 'stop',
      at: new Date(now - i * 3600000 + 1800000).toISOString(),
      pid: i,
      reason: 'passenger-stdin',
      exitCode: 0,
    });
  }
  useTempJournal(lines);
  const s = journal.summarizeBootJournal({ now });
  assert.strictEqual(s.counts.hostStops, 4);
  assert.strictEqual(s.passengerStops, 4);
  assert.strictEqual(s.signalStops, 0);
  assert.strictEqual(s.verdict, 'host_idle_stops');
  assert.match(s.advice, /entrée standard/);
  assert.match(s.advice, /mémoire n'est pas en cause/);
  assert.ok(s.advice.length <= 600);
});

/* ------------------------------------------------------------------ sorties */

test('règle de santé `restarts` : poids bas dit comme tel, signaux reçus et second processus', () => {
  const low = evaluateHealth({
    restarts: { counts: { hardKills: 3 }, verdict: 'hard_kills', maxRssMbBeforeKill: 147 },
  });
  assert.match(
    low.findings[0].message,
    /147 Mo \(basse : la mémoire de l'application n'explique pas/,
  );
  const high = evaluateHealth({
    restarts: { counts: { hardKills: 3 }, verdict: 'hard_kills', maxRssMbBeforeKill: 487.5 },
  });
  assert.doesNotMatch(high.findings[0].message, /basse/);
  const signals = evaluateHealth({
    restarts: {
      counts: {},
      verdict: 'signal_stops',
      signalStops: 2,
      stopsByReason: { SIGXCPU: 2, SIGTERM: 5, restart: 1 },
      hardKillsPreviousAlive: 1,
    },
  });
  assert.strictEqual(signals.status, 'orange');
  assert.match(signals.findings[0].message, /2 arrêt\(s\) sur signal reçu \(SIGXCPU ×2\)/);
  assert.match(signals.findings[0].message, /1 avec le processus précédent encore en vie/);
});

test('connecteur : champs du diagnostic repris un à un, sans texte libre', () => {
  const out = restartsDiagnosisFields({
    hardKillsByHourBasis: { death: 2, restart: 1 },
    stopsByReason: { SIGHUP: 2, 'passenger-stdin': 3, 'élève Dupont <x>': 1 },
    signalStops: 2,
    passengerStops: 3,
    hardKillLifetimeMs: { samples: 2, min: 1, median: 2, max: 3 },
    hardKillsPreviousAlive: 1,
    hardKills: [
      {
        at: '2026-11-20T02:04:00.000Z',
        bootedAt: '2026-11-20T00:00:00.000Z',
        lastAliveAt: '2026-11-20T02:00:00.000Z',
        lifetimeMs: 7200000,
        rssMbBeforeKill: 147,
        maxRssMbBeforeKill: 149,
        previousPidAlive: false,
        pid: 4217,
        note: 'texte libre',
      },
    ],
    file: '/home/secret/boot.ndjson',
  });
  assert.deepStrictEqual(out.stopsByReason, { SIGHUP: 2, 'passenger-stdin': 3 });
  assert.deepStrictEqual(out.hardKillsByHourBasis, { death: 2, restart: 1 });
  assert.strictEqual(out.hardKills[0].lastAliveAt, '2026-11-20T02:00:00.000Z');
  assert.strictEqual(out.hardKills[0].pid, undefined);
  assert.strictEqual(out.hardKills[0].note, undefined);
  assert.strictEqual(out.file, undefined);
  assert.deepStrictEqual(out.hardKillRssMb, { samples: 0, min: null, median: null, max: null });
  assert.doesNotThrow(() => restartsDiagnosisFields());
});

test('rapport de stabilité : motifs tracés, heure de la mort et poids lisibles', () => {
  assert.match(
    describeEntry({ at: '2026-11-20T02:00:00.000Z', event: 'stop', reason: 'SIGHUP' }),
    /signal reçu SIGHUP \(tracé\)/,
  );
  assert.match(
    describeEntry({ at: '2026-11-20T02:00:00.000Z', event: 'stop', reason: 'passenger-stdin' }),
    /Passenger a fermé l'entrée standard/,
  );
  assert.match(
    describeEntry({ at: '2026-11-20T02:00:00.000Z', event: 'stop', reason: 'SIGTERM' }),
    /signal SIGTERM/,
  );
  const dated = describeEntry({
    at: '2026-11-20T02:04:00.000Z',
    event: 'boot',
    previousStop: 'hard',
    lastAliveAt: '2026-11-20T02:00:00.000Z',
    previousLifetimeMs: 7200000,
    previousRssMb: 147,
  });
  assert.match(
    dated,
    /vu en vie pour la dernière fois à 2026-11-20 02:00:00, après 2 h 0 min de vie, 147 Mo/,
  );
  assert.match(
    describeEntry({ at: '2026-11-20T02:04:00.000Z', event: 'boot', previousStop: 'hard' }),
    /heure de la mort inconnue/,
  );
  const hours = Array.from({ length: 24 }, () => 0);
  hours[2] = 3;
  const lines = diagnosisLines({
    counts: { hardKills: 3 },
    stopsByReason: { SIGHUP: 1 },
    hardKillsByHour: hours,
    hardKillsByHourBasis: { death: 2, restart: 1 },
    hardKillLifetimeMs: { samples: 2, min: 3600000, median: 5400000, max: 7200000 },
    hardKillRssMb: { samples: 2, min: 145, median: 146, max: 147 },
    hardKillsPreviousAlive: 0,
  }).join('\n');
  assert.match(lines, /SIGHUP ×1/);
  assert.match(lines, /heure de la mort pour 2, du redémarrage pour 1\) : 2 h ×3/);
  assert.match(lines, /Durée de vie avant l'arrêt : médiane 1 h 30 min/);
  assert.match(lines, /Poids avant l'arrêt : médiane 146 Mo/);
});

test('server.js : les signaux tracés, la sortie et le battement sont branchés', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /registerTracedSignalHandlers\(\(signal\) => gracefulShutdown\(signal\)\)/);
  assert.match(src, /process\.once\('exit'/);
  assert.match(src, /recordExit\(code\)/);
  assert.match(src, /startHeartbeat\(\)/);
});
