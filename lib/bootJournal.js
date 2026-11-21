'use strict';

/**
 * Journal persistant du cycle de vie du process Node (démarrage / arrêt / crash).
 *
 * Pourquoi : `startup.log` et `startup-diag.log` sont **écrasés** à chaque démarrage —
 * après coup, plus rien ne dit pourquoi l'application a été indisponible. Sur mutualisé
 * (o2switch : Passenger + CloudLinux LVE), les causes d'indisponibilité se ressemblent
 * toutes côté utilisateur (« serveur momentanément indisponible ») mais se soignent
 * différemment :
 *
 * | Trace laissée ici                     | Cause réelle                                       | Remède                                            |
 * | ------------------------------------- | -------------------------------------------------- | ------------------------------------------------- |
 * | `stop` avec `reason: 'restart'` ou `'restart-gui'` | redémarrage volontaire (déploiement, IHM admin) | grouper les merges / `DEPLOY_QUIET_SECONDS`    |
 * | `stop` avec `reason: 'restart-file'`  | redémarrage par `tmp/restart.txt` (roue de secours du cron sans secret) | idem ; mettre `DEPLOY_SECRET` pour l'arrêt piloté |
 * | `stop` avec `reason: 'SIGTERM'`       | arrêt décidé par l'hébergeur (inactivité Passenger) | keepalive crontab (voir `docs/CRONTAB.md`)        |
 * | `stop` avec `reason: 'env_invalid'` ou `'listen_error'` | l'application refuse de démarrer (config, port) | corriger le `.env` serveur / le port     |
 * | `crash`                               | exception / rejet non géré côté application         | corriger le bug (`GET /api/admin/logs`)           |
 * | `stop` avec `reason: 'passenger-stdin'` | Passenger a fermé l'entrée standard : c'est sa façon d'arrêter une application Node, **sans signal** (inactivité, recyclage) | réglages Passenger de l'hébergeur |
 * | `stop` avec `reason: 'SIGHUP'`, `'SIGXCPU'`… | signal reçu, désormais tracé (`TRACED_SIGNALS`) | selon le signal (`SIGNAL_HINTS`)                  |
 * | `stop` avec `reason: 'exit'`          | `process.exit()` appelé sans arrêt tracé            | chercher l'appelant (`exitCode`)                  |
 * | démarrage **sans** trace d'arrêt      | process tué sans signal interceptable (SIGKILL), ou second processus lancé en parallèle (`previousPidAlive`) | lire le poids et l'heure de la mort (battement) avant de conclure |
 *
 * Le **battement** (`logs/boot-journal.heartbeat.json`, une valeur réécrite chaque minute)
 * garde la dernière minute de vie connue : le démarrage suivant date la mort, mesure la durée
 * de vie et le poids du processus disparu.
 *
 * Le fichier vit dans `logs/` (non versionné), au format NDJSON, borné en nombre de
 * lignes. Toutes les écritures sont **best-effort** : une erreur d'E/S ne doit jamais
 * empêcher l'application de démarrer ni de s'arrêter.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_MAX_ENTRIES = 800;
/** Marge avant réécriture : on ne compacte pas à chaque ligne. */
const TRIM_TRIGGER_RATIO = 1.25;

/** Horodatage de démarrage de ce process — sert à mesurer la durée de vie à l'arrêt. */
const processStartedAtMs = Date.now();

/** Un seul enregistrement d'arrêt par process (crash puis exit, ou stop puis exit). */
let stopRecorded = false;

function envString(name) {
  const raw = process.env[name];
  return raw == null ? '' : String(raw).trim();
}

/** @returns {string} Chemin absolu du journal (surchargeable pour les tests). */
function bootJournalPath() {
  const override = envString('FORETMAP_BOOT_JOURNAL_FILE');
  if (override) return path.resolve(override);
  return path.join(__dirname, '..', 'logs', 'boot-journal.ndjson');
}

/** @returns {string} Fichier du battement, voisin du journal (suit donc la surcharge des tests). */
function heartbeatPath() {
  return `${bootJournalPath().replace(/\.ndjson$/, '')}.heartbeat.json`;
}

/**
 * Désactivé sous `NODE_ENV=test` sauf chemin explicite : la suite backend démarre
 * des dizaines de fois l'application et n'a pas à polluer le journal de la machine.
 */
function isBootJournalEnabled() {
  if (envString('FORETMAP_BOOT_JOURNAL') === '0') return false;
  if (envString('FORETMAP_BOOT_JOURNAL_FILE')) return true;
  return envString('NODE_ENV').toLowerCase() !== 'test';
}

function maxEntries() {
  const n = parseInt(envString('FORETMAP_BOOT_JOURNAL_MAX_ENTRIES'), 10);
  if (Number.isFinite(n) && n >= 50 && n <= 20000) return n;
  return DEFAULT_MAX_ENTRIES;
}

/** @returns {object[]} Entrées lisibles du journal, dans l'ordre chronologique. */
function readEntries() {
  const file = bootJournalPath();
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const out = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') out.push(parsed);
    } catch {
      // Ligne tronquée (arrêt brutal en pleine écriture) : ignorée, jamais fatale.
    }
  }
  return out;
}

function appendEntry(entry) {
  if (!isBootJournalEnabled()) return null;
  const file = bootJournalPath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    return null;
  }
  return entry;
}

/**
 * Compacte le journal en ne gardant que les dernières entrées (appelé au boot). Les relevés
 * `rss` périodiques sont retirés en premier, du plus ancien au plus récent, tant que la borne
 * est dépassée : ils ne doivent jamais chasser l'historique des arrêts, qui est la raison
 * d'être du journal.
 */
function trimIfNeeded() {
  const limit = maxEntries();
  let entries = readEntries();
  if (entries.length <= Math.floor(limit * TRIM_TRIGGER_RATIO)) return;
  let excess = entries.length - limit;
  if (excess > 0) {
    entries = entries.filter((e) => {
      if (excess > 0 && e.event === 'rss') {
        excess -= 1;
        return false;
      }
      return true;
    });
  }
  const kept = entries.slice(-limit);
  try {
    fs.writeFileSync(
      bootJournalPath(),
      `${kept.map((e) => JSON.stringify(e)).join('\n')}\n`,
      'utf8',
    );
  } catch {
    // Compactage best-effort.
  }
}

function toMs(value) {
  const t = Date.parse(String(value || ''));
  return Number.isFinite(t) ? t : null;
}

/**
 * Qualifie la fin du process précédent à partir de la dernière entrée du journal.
 * Un démarrage précédé d'un autre **démarrage** signifie que le process a disparu
 * sans laisser de trace : ni signal, ni exception — donc un SIGKILL (mémoire LVE,
 * arrêt forcé de l'hébergeur).
 *
 * @param {object[]} entries
 * @returns {{ previousStop: 'none'|'graceful'|'crash'|'hard', previousStopReason: string|null, previousStopAt: string|null }}
 */
function classifyPreviousStop(entries) {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const e = entries[i];
    if (e.event === 'stop') {
      return {
        previousStop: 'graceful',
        previousStopReason: e.reason ? String(e.reason) : null,
        previousStopAt: e.at ? String(e.at) : null,
      };
    }
    if (e.event === 'crash') {
      return {
        previousStop: 'crash',
        previousStopReason: e.kind ? String(e.kind) : 'crash',
        previousStopAt: e.at ? String(e.at) : null,
      };
    }
    if (e.event === 'boot') {
      return { previousStop: 'hard', previousStopReason: null, previousStopAt: e.at || null };
    }
  }
  return { previousStop: 'none', previousStopReason: null, previousStopAt: null };
}

/** `AAAA-MM-JJ` à l'heure du serveur (`null` si date invalide). */
function localDay(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Enregistre le démarrage du process et qualifie la fin du précédent.
 * @param {{ version?: string, now?: number }} [options]
 * @returns {object|null} L'entrée écrite (ou `null` si journal désactivé / E/S en échec).
 */
function recordBoot({ version = null, now = Date.now() } = {}) {
  if (!isBootJournalEnabled()) return null;
  trimIfNeeded();
  const entries = readEntries();
  const previous = classifyPreviousStop(entries);
  const previousAtMs = toMs(previous.previousStopAt);
  const died = previous.previousStop === 'hard' ? describeVanishedProcess(entries, now) : {};
  const entry = {
    at: new Date(now).toISOString(),
    event: 'boot',
    pid: process.pid,
    version: version || null,
    node: process.version,
    previousStop: previous.previousStop,
    previousStopReason: previous.previousStopReason,
    // Fenêtre d'indisponibilité mesurable seulement après un arrêt tracé.
    downtimeMs:
      previous.previousStop === 'graceful' || previous.previousStop === 'crash'
        ? previousAtMs != null
          ? Math.max(0, now - previousAtMs)
          : null
        : null,
    passengerAppEnv: envString('PASSENGER_APP_ENV') || null,
    ...died,
  };
  return appendEntry(entry);
}

/* ------------------------------------------------------------------ Battement */

/**
 * Le journal ne connaît que l'heure du **redémarrage** d'un processus disparu sans trace. Le
 * battement note la dernière minute de vie : une seule valeur, réécrite (jamais une ligne par
 * minute), dans un fichier voisin du journal. Coût : une écriture d'environ 150 octets par
 * minute (`FORETMAP_BOOT_JOURNAL_HEARTBEAT_MS`, défaut 60 s ; `0` coupe). Best-effort.
 */
const HEARTBEAT_DEFAULT_MS = 60 * 1000;
const heartbeatState = { timer: null };

function heartbeatMs() {
  const raw = envString('FORETMAP_BOOT_JOURNAL_HEARTBEAT_MS');
  if (raw === '') return HEARTBEAT_DEFAULT_MS;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

/** @returns {object|null} Dernier battement écrit (`null` : absent, illisible ou tronqué). */
function readHeartbeat() {
  try {
    const parsed = JSON.parse(fs.readFileSync(heartbeatPath(), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Réécrit le battement (fichier temporaire puis renommage : jamais de valeur à moitié écrite).
 * @param {{ now?: number, rssMb?: number|null, intervalMs?: number }} [options]
 * @returns {object|null} La valeur écrite, ou `null` (journal coupé, E/S en échec).
 */
function writeHeartbeat({
  now = Date.now(),
  rssMb = currentRssMb(),
  intervalMs = heartbeatMs(),
} = {}) {
  if (!isBootJournalEnabled()) return null;
  if (Number.isFinite(rssMb) && (rssState.maxRssMb == null || rssMb > rssState.maxRssMb)) {
    rssState.maxRssMb = rssMb;
  }
  const beat = {
    at: new Date(now).toISOString(),
    pid: process.pid,
    bootedAt: new Date(processStartedAtMs).toISOString(),
    rssMb: Number.isFinite(rssMb) ? rssMb : null,
    maxRssMb: rssState.maxRssMb,
    intervalMs,
  };
  const file = heartbeatPath();
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(beat), 'utf8');
    fs.renameSync(tmp, file);
  } catch {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // Rien à nettoyer.
    }
    return null;
  }
  return beat;
}

/**
 * Démarre le battement (un seul par process, minuterie `unref`). Premier battement immédiat :
 * même un processus tué dans sa première minute est daté.
 * @param {{ intervalMs?: number }} [options]
 * @returns {NodeJS.Timeout|null}
 */
function startHeartbeat({ intervalMs = heartbeatMs() } = {}) {
  if (!isBootJournalEnabled() || !(intervalMs > 0) || heartbeatState.timer) return null;
  writeHeartbeat({ intervalMs });
  heartbeatState.timer = setInterval(() => {
    try {
      writeHeartbeat({ intervalMs });
    } catch {
      // Best-effort : un battement manqué ne doit rien casser.
    }
  }, intervalMs);
  if (typeof heartbeatState.timer.unref === 'function') heartbeatState.timer.unref();
  return heartbeatState.timer;
}

function stopHeartbeat() {
  if (heartbeatState.timer) clearInterval(heartbeatState.timer);
  heartbeatState.timer = null;
}

/**
 * Un autre processus porte-t-il encore ce PID ? `true` au démarrage signifie que le processus
 * « disparu » ne l'est pas : Passenger en a lancé un second en parallèle, ce n'est pas une mort.
 * @returns {boolean|null} `null` quand on ne peut pas le dire (PID inconnu, le nôtre, erreur).
 */
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return null;
  try {
    process.kill(pid, 0);
    // Un processus mort mais pas encore récolté par son parent (zombie) répond encore au
    // signal 0 : sous Linux, son état se lit dans /proc (`Z` zombie, `X` mort).
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const state = stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3);
      if (state === 'Z' || state === 'X') return false;
    } catch {
      // Pas de /proc lisible : on s'en tient au signal 0.
    }
    return true;
  } catch (err) {
    if (err && err.code === 'EPERM') return true;
    if (err && err.code === 'ESRCH') return false;
    return null;
  }
}

/**
 * Ce que l'on sait du processus disparu sans trace : son démarrage (journal) et sa dernière
 * minute de vie (battement, s'il est bien le sien). Champs ajoutés à l'entrée `boot`.
 * @param {object[]} entries journal avant le démarrage en cours
 * @param {number} now
 */
function describeVanishedProcess(entries, now) {
  let prev = null;
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i].event === 'boot') {
      prev = entries[i];
      break;
    }
  }
  if (!prev) return {};
  const out = {
    previousPid: Number.isInteger(prev.pid) ? prev.pid : null,
    previousBootAt: prev.at ? String(prev.at) : null,
    previousPidAlive: pidAlive(prev.pid),
  };
  const beat = readHeartbeat();
  const beatMs = toMs(beat?.at);
  const bootMs = toMs(prev.at);
  // Le battement n'est retenu que s'il vient bien du processus disparu.
  if (!beat || beatMs == null || beat.pid !== prev.pid) return out;
  if (bootMs != null && beatMs < bootMs - 1000) return out;
  if (beatMs > now) return out;
  out.lastAliveAt = new Date(beatMs).toISOString();
  out.heartbeatMs = Number.isFinite(beat.intervalMs) ? beat.intervalMs : null;
  out.previousLifetimeMs = bootMs != null ? Math.max(0, beatMs - bootMs) : null;
  out.previousRssMb = Number.isFinite(beat.rssMb) ? beat.rssMb : null;
  out.previousMaxRssMb = Number.isFinite(beat.maxRssMb) ? beat.maxRssMb : null;
  // Borne haute de l'indisponibilité : la mort a eu lieu dans la minute qui suit le battement.
  out.downtimeEstimateMs = Math.max(0, now - beatMs);
  return out;
}

/**
 * Enregistre un arrêt maîtrisé (déploiement, SIGTERM de l'hébergeur, SIGINT).
 * @param {string} reason `restart`, `SIGTERM`, `SIGINT`…
 */
function recordStop(reason, { now = Date.now(), exitCode } = {}) {
  if (!isBootJournalEnabled() || stopRecorded) return null;
  stopRecorded = true;
  const rssMb = currentRssMb();
  return appendEntry({
    at: new Date(now).toISOString(),
    event: 'stop',
    pid: process.pid,
    reason: reason ? String(reason) : 'shutdown',
    ...(Number.isInteger(exitCode) ? { exitCode } : {}),
    lifetimeMs: Math.max(0, now - processStartedAtMs),
    rssMb,
    maxRssMb: rssState.maxRssMb ?? rssMb,
  });
}

/**
 * Trace de la dernière chance, posée sur l'évènement `exit` : le processus sort **sans** qu'un
 * arrêt ou un crash ait été tracé. C'est le cas que Passenger provoque pour arrêter une
 * application Node : il ferme son entrée standard, et son chargeur (`node-loader.js`, fonction
 * `shutdown`) appelle `process.exit(0)` — aucun signal n'est envoyé. Source :
 * https://github.com/phusion/passenger/blob/stable-6.0/src/helper-scripts/node-loader.js
 * Le chargeur lève alors `PhusionPassenger.shutting_down`, d'où le motif `passenger-stdin` ;
 * tout autre `process.exit()` non tracé donne `exit`.
 * @param {number} [code]
 */
function recordExit(code, { now = Date.now(), passenger = globalThis.PhusionPassenger } = {}) {
  if (!isBootJournalEnabled() || stopRecorded) return null;
  const reason = passenger && passenger.shutting_down === true ? 'passenger-stdin' : 'exit';
  return recordStop(reason, { now, exitCode: Number.isInteger(code) ? code : undefined });
}

/* ------------------------------------------------------------------ Signaux tracés */

/**
 * Signaux dont l'action par défaut **termine** le processus et qu'un écouteur JavaScript peut
 * recevoir sans danger : chacun déclenche un arrêt maîtrisé, motif écrit dans le journal.
 * Écartés, et pourquoi : `SIGUSR1` (réservé par Node à l'inspecteur), `SIGPROF` (profileur V8),
 * `SIGPIPE` (déjà ignoré par Node), `SIGSEGV`/`SIGBUS`/`SIGFPE`/`SIGILL`/`SIGABRT`/`SIGTRAP`/
 * `SIGSYS` (fautes synchrones : la doc de Node déconseille d'y exécuter du JavaScript, et
 * `abort()` ne se rattrape pas), `SIGKILL`/`SIGSTOP` (non interceptables), `SIGCHLD`/`SIGWINCH`/
 * `SIGCONT`/`SIGURG` (ignorés par défaut), `SIGTSTP`/`SIGTTIN`/`SIGTTOU` (suspendent, ne tuent pas).
 * Doc Node : https://nodejs.org/api/process.html#signal-events
 */
const TRACED_SIGNALS = [
  'SIGTERM',
  'SIGINT',
  'SIGHUP',
  'SIGQUIT',
  'SIGXCPU',
  'SIGXFSZ',
  'SIGALRM',
  'SIGVTALRM',
  'SIGPWR',
];

/** Lecture d'un signal reçu, pour le conseil du diagnostic. */
const SIGNAL_HINTS = {
  SIGHUP: 'fermeture de la session ou du terminal qui a lancé le processus',
  SIGQUIT: "demande d'arrêt d'un opérateur ou d'un superviseur",
  SIGXCPU: 'limite de temps processeur du processus atteinte (RLIMIT_CPU)',
  SIGXFSZ: 'limite de taille de fichier atteinte (RLIMIT_FSIZE)',
  SIGALRM: 'minuterie système',
  SIGVTALRM: 'minuterie système',
  SIGPWR: "coupure d'alimentation annoncée",
  SIGUSR2: 'signal envoyé par un outil de supervision',
};

/**
 * Signaux à écouter dans ce contexte. `SIGUSR2` n'est écouté qu'en production : en
 * développement, nodemon s'en sert pour relancer le serveur et attend son action par défaut.
 * Un nom inconnu de la plateforme (Windows) est écarté.
 * @param {{ env?: object, platformSignals?: object }} [options]
 * @returns {string[]}
 */
function tracedSignals({
  env = process.env,
  platformSignals = require('os').constants.signals,
} = {}) {
  const production =
    String(env.NODE_ENV || '')
      .trim()
      .toLowerCase() === 'production';
  const names = production ? [...TRACED_SIGNALS, 'SIGUSR2'] : TRACED_SIGNALS;
  return names.filter((name) => platformSignals[name] != null);
}

/**
 * Pose un écouteur à usage unique par signal tracé.
 * @param {(signal: string) => void} handler
 * @param {{ proc?: NodeJS.Process, signals?: string[] }} [options]
 * @returns {string[]} Les signaux réellement écoutés.
 */
function registerTracedSignalHandlers(handler, { proc = process, signals = tracedSignals() } = {}) {
  const registered = [];
  for (const signal of signals) {
    try {
      proc.once(signal, () => handler(signal));
      registered.push(signal);
    } catch {
      // Signal refusé par la plateforme : les autres restent écoutés.
    }
  }
  return registered;
}

/* ------------------------------------------------------------------ RSS périodique */

/**
 * Un process tué sans signal (SIGKILL : plafond mémoire LVE) ne laisse aucune trace d'arrêt :
 * la seule façon de rapprocher un « hard kill » de la mémoire consommée est de relever
 * périodiquement la RSS **pendant la vie du process**. Relevé best-effort et borné :
 * une entrée `rss` n'est écrite que quand le maximum vu progresse d'au moins
 * `FORETMAP_BOOT_JOURNAL_RSS_STEP_MB` (défaut 8 Mo), au plus `RSS_MAX_ENTRIES_PER_PROCESS`
 * par process, toutes les `FORETMAP_BOOT_JOURNAL_RSS_TICK_MS` (défaut 60 s ; `0` coupe).
 * `summarizeBootJournal` rapproche ces relevés du démarrage suivant (`maxRssMbBeforeKill`).
 */
const RSS_DEFAULT_TICK_MS = 60 * 1000;
const RSS_DEFAULT_STEP_MB = 8;
const RSS_MAX_ENTRIES_PER_PROCESS = 24;

const rssState = { maxRssMb: null, lastWrittenMb: null, written: 0, timer: null };

function currentRssMb() {
  try {
    return Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100;
  } catch {
    return null;
  }
}

function rssTickMs() {
  const raw = envString('FORETMAP_BOOT_JOURNAL_RSS_TICK_MS');
  if (raw === '') return RSS_DEFAULT_TICK_MS;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

function rssStepMb() {
  const n = Number(envString('FORETMAP_BOOT_JOURNAL_RSS_STEP_MB'));
  return Number.isFinite(n) && n >= 1 ? n : RSS_DEFAULT_STEP_MB;
}

/**
 * Relève la RSS courante ; écrit une entrée `rss` si le maximum vu a progressé d'un pas.
 * @param {{ now?: number, rssMb?: number|null, stepMb?: number }} [options]
 * @returns {object|null} L'entrée écrite, ou `null` (journal coupé, pas de progression, borne).
 */
function recordRssSample({ now = Date.now(), rssMb = currentRssMb(), stepMb = rssStepMb() } = {}) {
  if (!isBootJournalEnabled() || !Number.isFinite(rssMb)) return null;
  if (rssState.maxRssMb == null || rssMb > rssState.maxRssMb) rssState.maxRssMb = rssMb;
  if (rssState.written >= RSS_MAX_ENTRIES_PER_PROCESS) return null;
  if (rssState.lastWrittenMb != null && rssState.maxRssMb - rssState.lastWrittenMb < stepMb) {
    return null;
  }
  const entry = {
    at: new Date(now).toISOString(),
    event: 'rss',
    pid: process.pid,
    rssMb,
    maxRssMb: rssState.maxRssMb,
    lifetimeMs: Math.max(0, now - processStartedAtMs),
  };
  const written = appendEntry(entry);
  if (written) {
    rssState.lastWrittenMb = rssState.maxRssMb;
    rssState.written += 1;
  }
  return written;
}

/**
 * Démarre le relevé périodique (un seul par process, minuterie `unref` : n'empêche jamais
 * l'arrêt). Premier relevé immédiat.
 * @param {{ intervalMs?: number }} [options]
 * @returns {NodeJS.Timeout|null}
 */
function startRssTick({ intervalMs = rssTickMs() } = {}) {
  if (!isBootJournalEnabled() || !(intervalMs > 0) || rssState.timer) return null;
  recordRssSample();
  rssState.timer = setInterval(() => {
    try {
      recordRssSample();
    } catch {
      // Best-effort : un relevé qui échoue ne doit rien casser.
    }
  }, intervalMs);
  if (typeof rssState.timer.unref === 'function') rssState.timer.unref();
  return rssState.timer;
}

function stopRssTick() {
  if (rssState.timer) clearInterval(rssState.timer);
  rssState.timer = null;
}

/**
 * Arrêts brutaux de la fenêtre, chacun rapproché du dernier relevé `rss` du process tué
 * (les entrées entre le démarrage précédent et le démarrage qui constate le « hard »).
 * @param {object[]} entries journal complet, chronologique
 * @param {number} since borne basse (ms)
 * Depuis le battement, s'y ajoutent l'heure de la mort (`lastAliveAt`, à un battement près), la
 * durée de vie, le poids à la dernière minute et l'état du PID précédent. Une entrée d'ancien
 * format (sans battement) rend ces champs à `null`.
 * @returns {Array<object>}
 */
function hardKillDetails(entries, since) {
  const out = [];
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    if (e.event !== 'boot' || e.previousStop !== 'hard') continue;
    const t = toMs(e.at);
    if (t == null || t < since) continue;
    let maxRss = null;
    let lastRssAt = null;
    let bootedAt = null;
    let pid = null;
    for (let j = i - 1; j >= 0; j -= 1) {
      const p = entries[j];
      if (p.event === 'rss') {
        const v = Number(p.maxRssMb ?? p.rssMb);
        if (Number.isFinite(v) && (maxRss == null || v > maxRss)) maxRss = v;
        if (!lastRssAt && p.at) lastRssAt = String(p.at);
        continue;
      }
      if (p.event === 'boot') {
        bootedAt = p.at ? String(p.at) : null;
        pid = Number.isFinite(p.pid) ? p.pid : null;
      }
      break;
    }
    const beatMax = Number(e.previousMaxRssMb);
    if (Number.isFinite(beatMax) && (maxRss == null || beatMax > maxRss)) maxRss = beatMax;
    const finite = (v) => (Number.isFinite(v) ? v : null);
    out.push({
      at: String(e.at),
      bootedAt: bootedAt || (e.previousBootAt ? String(e.previousBootAt) : null),
      pid,
      maxRssMbBeforeKill: maxRss,
      lastRssAt,
      lastAliveAt: e.lastAliveAt ? String(e.lastAliveAt) : null,
      lifetimeMs: finite(e.previousLifetimeMs),
      rssMbBeforeKill: finite(e.previousRssMb),
      downtimeEstimateMs: finite(e.downtimeEstimateMs),
      previousPidAlive: typeof e.previousPidAlive === 'boolean' ? e.previousPidAlive : null,
    });
  }
  return out;
}

/**
 * Enregistre un arrêt sur erreur non gérée.
 * @param {string} kind `uncaughtException` ou `unhandledRejection`
 * @param {unknown} error
 */
function recordCrash(kind, error, { now = Date.now() } = {}) {
  if (!isBootJournalEnabled() || stopRecorded) return null;
  stopRecorded = true;
  let message = '';
  try {
    message = error instanceof Error ? error.message : String(error);
  } catch {
    message = 'unknown';
  }
  return appendEntry({
    at: new Date(now).toISOString(),
    event: 'crash',
    pid: process.pid,
    kind: kind ? String(kind) : 'crash',
    // Message tronqué : le détail (stack) est dans le tampon Pino / GET /api/admin/logs.
    message: message.slice(0, 300),
    lifetimeMs: Math.max(0, now - processStartedAtMs),
  });
}

/**
 * Arrêts volontaires du process pour cause de configuration : tracés pour ne pas être
 * confondus avec un process tué sans signal — mais ce ne sont pas des arrêts hébergeur.
 */
const STARTUP_FAILURE_REASONS = new Set(['env_invalid', 'listen_error']);

/**
 * Arrêts demandés par l'application elle-même : cron de déploiement
 * (`POST /api/admin/restart` → `restart`) et bouton de l'IHM admin
 * (`POST /api/admin/system/restart` → `restart-gui`). Sans `restart-gui` ici, un
 * redémarrage volontaire était compté comme arrêt hébergeur et pouvait produire le
 * verdict `host_idle_stops` — donc le conseil « installez le keepalive Passenger »
 * pour une cause qui n'a rien à voir.
 */
const DEPLOY_RESTART_REASONS = new Set(['restart', 'restart-gui', 'restart-file']);

/** Fichier que Passenger surveille pour redémarrer l'application (`touch tmp/restart.txt`). */
function restartFilePath() {
  return path.join(__dirname, '..', 'tmp', 'restart.txt');
}

/** Fenêtre pendant laquelle un `touch tmp/restart.txt` explique le signal d'arrêt reçu. */
const RESTART_FILE_WINDOW_MS = 10 * 60 * 1000;

/**
 * Motif d'arrêt à journaliser pour un signal. Passenger arrête l'application par un signal
 * quand `tmp/restart.txt` change (roue de secours du cron de déploiement sans `DEPLOY_SECRET`,
 * scripts/auto-deploy-cron.sh) : sans cette distinction, ce redémarrage voulu serait compté
 * comme un arrêt de l'hébergeur (`SIGTERM`), avec le conseil « keepalive » qui va avec.
 *
 * `restart-file` seulement si le fichier a été touché **pendant la vie de ce process** et
 * récemment ; tout autre motif (`restart`, `listen_error`…) est rendu tel quel.
 *
 * @param {string} signal
 * @param {{ file?: string, now?: number, startedAtMs?: number }} [options]
 * @returns {string}
 */
function resolveStopReason(
  signal,
  { file = restartFilePath(), now = Date.now(), startedAtMs = processStartedAtMs } = {},
) {
  if (signal !== 'SIGTERM' && signal !== 'SIGINT') return signal;
  try {
    const { mtimeMs } = fs.statSync(file);
    if (mtimeMs >= startedAtMs && now - mtimeMs <= RESTART_FILE_WINDOW_MS) return 'restart-file';
  } catch {
    // Pas de fichier : arrêt ordinaire.
  }
  return signal;
}

/** Catégories de causes, dans l'ordre de priorité du verdict. */
const VERDICTS = {
  startupFailures: {
    verdict: 'startup_failures',
    advice:
      "L'application refuse de démarrer (configuration invalide ou port indisponible) : elle n'est pas « lente », elle n'est pas là. Vérifier le `.env` du serveur et le port attribué par l'hébergeur, puis relancer depuis Setup Node.js App.",
  },
  crashes: {
    verdict: 'crashes',
    advice:
      "L'application s'arrête sur erreur non gérée. Croiser les horodatages avec GET /api/admin/logs : c'est un bug applicatif, pas un problème d'hébergement.",
  },
  signalStops: { verdict: 'signal_stops' },
  hardKills: { verdict: 'hard_kills' },
  hostStops: {
    verdict: 'host_idle_stops',
    advice:
      "L'hébergeur arrête l'application (SIGTERM) : arrêt d'inactivité Passenger. Chaque retour coûte un démarrage à froid. Installer le keepalive crontab (docs/CRONTAB.md) pour maintenir l'application éveillée aux heures d'usage.",
  },
  passengerStops: {
    verdict: 'host_idle_stops',
    advice:
      "Passenger arrête lui-même l'application en fermant son entrée standard (motif `passenger-stdin`, aucun signal) : inactivité, recyclage ou redémarrage décidé par l'hébergeur. La mémoire n'est pas en cause. Croiser les heures avec le keepalive (docs/CRONTAB.md) et les réglages Passenger du compte (PassengerPoolIdleTime, PassengerMaxRequests) ; au besoin, ticket o2switch.",
  },
  deployRestarts: {
    verdict: 'deploy_churn',
    advice:
      'Les redémarrages viennent des déploiements automatiques. Grouper les merges sur main, ou augmenter DEPLOY_QUIET_SECONDS dans le cron de déploiement pour fusionner une rafale de commits en un seul redémarrage.',
  },
};

/** En dessous de ce poids avant l'arrêt, la mémoire de l'application n'explique pas la mort. */
const LOW_RSS_DEFAULT_MB = 250;

function lowRssMb() {
  const n = Number(envString('FORETMAP_BOOT_JOURNAL_LOW_RSS_MB'));
  return Number.isFinite(n) && n > 0 ? n : LOW_RSS_DEFAULT_MB;
}

/** @returns {{ samples: number, min: number|null, median: number|null, max: number|null }} */
function spread(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return { samples: 0, min: null, median: null, max: null };
  const mid = Math.floor(v.length / 2);
  const median = v.length % 2 ? v[mid] : Math.round(((v[mid - 1] + v[mid]) / 2) * 100) / 100;
  return { samples: v.length, min: v[0], median, max: v[v.length - 1] };
}

/** Signal reçu autre que ceux de l'arrêt ordinaire (`SIGTERM`, `SIGINT`). */
function isUnusualSignal(reason) {
  return /^SIG[A-Z0-9]+$/.test(reason) && reason !== 'SIGTERM' && reason !== 'SIGINT';
}

/**
 * Conseil des arrêts sans trace, écrit **à partir des mesures** : il n'affirme la mémoire que
 * si le poids relevé avant l'arrêt est élevé, et le dit quand ce poids est bas ou inconnu.
 * Tenu sous 600 caractères (borne de la liste blanche du connecteur).
 */
function hardKillAdvice({ total, alive, rss, basis, thresholdMb }) {
  const parts = [
    `${total} démarrage(s) sans trace d'arrêt du processus précédent : ni signal tracé, ni sortie, ni erreur (tué sans signal : SIGKILL, limite CloudLinux LVE, ou machine).`,
  ];
  if (alive > 0) {
    parts.push(
      `Pour ${alive}, le processus précédent vivait encore : second processus lancé en parallèle, pas une mort.`,
    );
  }
  if (rss.samples === 0) {
    parts.push("Poids avant l'arrêt inconnu : ne rien conclure sur la mémoire.");
  } else if (rss.max < thresholdMb) {
    parts.push(
      `Poids avant l'arrêt bas (médiane ${rss.median} Mo, max ${rss.max} Mo) : la mémoire de l'application n'explique pas ces arrêts.`,
    );
  } else {
    parts.push(
      `Poids avant l'arrêt jusqu'à ${rss.max} Mo : une limite de mémoire est plausible (cPanel, « Resource Usage »).`,
    );
  }
  parts.push(
    basis.death > 0
      ? `Heure de la mort connue pour ${basis.death} arrêt(s) sur ${total} (hardKillsByHour) : chercher un rythme fixe (tâche planifiée, recyclage).`
      : 'Heures connues : celles du redémarrage seulement (pas encore de battement).',
  );
  return parts.join(' ');
}

function signalStopAdvice(stopsByReason) {
  const list = Object.entries(stopsByReason)
    .filter(([reason]) => isUnusualSignal(reason))
    .sort((a, b) => b[1] - a[1])
    .map(
      ([reason, n]) => `${reason} ×${n}${SIGNAL_HINTS[reason] ? ` (${SIGNAL_HINTS[reason]})` : ''}`,
    )
    .slice(0, 4)
    .join(', ');
  return `L'application est arrêtée par un signal reçu, désormais tracé : ${list}. Ce n'est ni un crash ni une mort sans signal : chercher l'émetteur (hébergeur, tâche planifiée, limite du compte) aux heures relevées dans \`recent\`.`;
}

/**
 * Synthèse exploitable du journal : combien de redémarrages sur la fenêtre, et
 * surtout **de quelle nature** — c'est la réponse à « pourquoi le serveur tombe ».
 *
 * @param {{ windowHours?: number, now?: number, lastCount?: number }} [options]
 * @returns {object}
 */
function summarizeBootJournal({ windowHours = 24, now = Date.now(), lastCount = 12 } = {}) {
  const hours = Number.isFinite(windowHours) && windowHours > 0 ? windowHours : 24;
  const since = now - hours * 3600 * 1000;
  const entries = readEntries();
  const inWindow = entries.filter((e) => {
    const t = toMs(e.at);
    return t != null && t >= since;
  });

  const counts = {
    boots: 0,
    deployRestarts: 0,
    hostStops: 0,
    startupFailures: 0,
    crashes: 0,
    hardKills: 0,
  };
  let downtimeTotalMs = 0;
  let downtimeSamples = 0;
  /** Mêmes compteurs, par jour (heure du serveur) : tableau des causes sur une semaine. */
  const byDay = {};
  /**
   * Arrêts sans trace par heure (heure du serveur) : heure **de la mort** quand le battement la
   * donne (`lastAliveAt`, à un battement près), sinon heure **du redémarrage** — le décompte
   * des deux cas est dans `hardKillsByHourBasis`.
   */
  const hardKillsByHour = Array.from({ length: 24 }, () => 0);
  const hardKillsByHourBasis = { death: 0, restart: 0 };
  /** Arrêts tracés de la fenêtre, par motif (`SIGTERM`, `SIGHUP`, `passenger-stdin`, `restart`…). */
  const stopsByReason = {};
  const bump = (key, day) => {
    counts[key] += 1;
    if (!day) return;
    if (!byDay[day]) {
      byDay[day] = Object.fromEntries(Object.keys(counts).map((k) => [k, 0]));
    }
    byDay[day][key] += 1;
  };

  for (const e of inWindow) {
    const at = new Date(toMs(e.at));
    const day = localDay(at);
    if (e.event === 'boot') {
      bump('boots', day);
      if (e.previousStop === 'hard') {
        bump('hardKills', day);
        const diedMs = toMs(e.lastAliveAt);
        if (diedMs != null) {
          hardKillsByHour[new Date(diedMs).getHours()] += 1;
          hardKillsByHourBasis.death += 1;
        } else {
          hardKillsByHour[at.getHours()] += 1;
          hardKillsByHourBasis.restart += 1;
        }
      }
      if (Number.isFinite(e.downtimeMs)) {
        downtimeTotalMs += e.downtimeMs;
        downtimeSamples += 1;
      }
    } else if (e.event === 'crash') {
      bump('crashes', day);
    } else if (e.event === 'stop') {
      const reason = String(e.reason || '').toLowerCase();
      const label = String(e.reason || 'shutdown').slice(0, 40);
      stopsByReason[label] = (stopsByReason[label] || 0) + 1;
      if (DEPLOY_RESTART_REASONS.has(reason)) bump('deployRestarts', day);
      else if (STARTUP_FAILURE_REASONS.has(reason)) bump('startupFailures', day);
      else bump('hostStops', day);
    }
  }

  let verdict = 'stable';
  let advice =
    'Aucun redémarrage anormal sur la fenêtre : si une indisponibilité est ressentie malgré tout, elle vient du réseau, du navigateur ou du frontal (Tiger Protect / HTTP/2) — voir docs/EXPLOITATION.md.';
  if (counts.startupFailures > 0) ({ verdict, advice } = VERDICTS.startupFailures);
  else if (counts.crashes > 0) ({ verdict, advice } = VERDICTS.crashes);
  const hardKills = hardKillDetails(entries, since);
  const rssSeen = hardKills.map((k) => k.maxRssMbBeforeKill).filter((v) => Number.isFinite(v));
  const hardKillRssMb = spread(hardKills.map((k) => k.maxRssMbBeforeKill));
  const hardKillLifetimeMs = spread(hardKills.map((k) => k.lifetimeMs));
  const hardKillDowntimeEstimateMs = spread(hardKills.map((k) => k.downtimeEstimateMs));
  const hardKillsPreviousAlive = hardKills.filter((k) => k.previousPidAlive === true).length;
  const signalStops = Object.entries(stopsByReason)
    .filter(([reason]) => isUnusualSignal(reason))
    .reduce((sum, [, n]) => sum + n, 0);
  const passengerStops = stopsByReason['passenger-stdin'] || 0;
  if (verdict !== 'stable') {
    // Refus de démarrage ou crash : verdict déjà posé.
  } else if (signalStops >= 2) {
    verdict = VERDICTS.signalStops.verdict;
    advice = signalStopAdvice(stopsByReason);
  } else if (counts.hardKills >= 2) {
    verdict = VERDICTS.hardKills.verdict;
    advice = hardKillAdvice({
      total: counts.hardKills,
      alive: hardKillsPreviousAlive,
      rss: hardKillRssMb,
      basis: hardKillsByHourBasis,
      thresholdMb: lowRssMb(),
    });
  } else if (counts.hostStops >= 3) {
    ({ verdict, advice } =
      passengerStops * 2 >= counts.hostStops ? VERDICTS.passengerStops : VERDICTS.hostStops);
  } else if (counts.deployRestarts >= 4) ({ verdict, advice } = VERDICTS.deployRestarts);

  const last = Math.min(Math.max(1, lastCount), 200);
  const visible = inWindow.filter((e) => e.event !== 'rss');
  return {
    enabled: isBootJournalEnabled(),
    file: bootJournalPath(),
    entriesTotal: entries.length,
    windowHours: hours,
    counts,
    byDay,
    hardKillsByHour,
    hardKillsByHourBasis,
    /** Arrêts tracés par motif, dont les signaux reçus (`signalStops` : hors SIGTERM/SIGINT). */
    stopsByReason,
    signalStops,
    passengerStops,
    /** Durée de vie, poids et indisponibilité estimée des processus disparus sans trace. */
    hardKillLifetimeMs,
    hardKillRssMb,
    /** Seuil (Mo) sous lequel le poids avant l'arrêt écarte la mémoire de l'application. */
    lowRssMb: lowRssMb(),
    hardKillDowntimeEstimateMs,
    /** Démarrages « sans trace » dont le processus précédent vivait encore (second processus). */
    hardKillsPreviousAlive,
    /**
     * Arrêts brutaux de la fenêtre, avec la RSS maximale relevée pendant la vie du process tué
     * (`null` quand aucun relevé `rss` n'existe : process trop court, relevé coupé, journal
     * antérieur à la mesure). Le maximum global sert au rapport de santé.
     */
    hardKills,
    maxRssMbBeforeKill: rssSeen.length ? Math.max(...rssSeen) : null,
    rssSamples: inWindow.length - visible.length,
    /** Indisponibilité cumulée *mesurable* (arrêts tracés seulement — un SIGKILL n'en laisse pas). */
    downtime: {
      samples: downtimeSamples,
      totalMs: downtimeTotalMs,
      averageMs: downtimeSamples > 0 ? Math.round(downtimeTotalMs / downtimeSamples) : null,
    },
    verdict,
    advice,
    /**
     * Derniers évènements **de la fenêtre demandée**. Auparavant pris sur tout le journal :
     * avec `?restartsWindowHours=1`, la liste affichait des arrêts vieux de plusieurs jours
     * sous un titre qui promettait l'heure écoulée.
     */
    recent: visible.slice(-last),
    /** Évènements antérieurs à la fenêtre (non listés) : distingue « rien eu » de « rien gardé ». */
    entriesBeforeWindow: entries.length - inWindow.length,
  };
}

/** Tests uniquement : réautorise l'enregistrement d'un arrêt dans le même process. */
function resetStopRecordedForTests() {
  stopRecorded = false;
}

/** Tests uniquement : remet à zéro le relevé RSS et le battement du process. */
function resetRssForTests() {
  stopRssTick();
  stopHeartbeat();
  rssState.maxRssMb = null;
  rssState.lastWrittenMb = null;
  rssState.written = 0;
}

module.exports = {
  RSS_MAX_ENTRIES_PER_PROCESS,
  bootJournalPath,
  isBootJournalEnabled,
  readEntries,
  recordBoot,
  recordStop,
  recordCrash,
  recordExit,
  recordRssSample,
  startRssTick,
  stopRssTick,
  heartbeatPath,
  readHeartbeat,
  writeHeartbeat,
  startHeartbeat,
  stopHeartbeat,
  TRACED_SIGNALS,
  SIGNAL_HINTS,
  tracedSignals,
  registerTracedSignalHandlers,
  resolveStopReason,
  restartFilePath,
  summarizeBootJournal,
  hardKillDetails,
  classifyPreviousStop,
  resetStopRecordedForTests,
  resetRssForTests,
};
