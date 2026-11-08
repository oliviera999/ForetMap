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
 * | démarrage **sans** trace d'arrêt      | process tué sans signal (SIGKILL : mémoire/LVE)     | réduire la RAM, ou ticket hébergeur               |
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
  };
  return appendEntry(entry);
}

/**
 * Enregistre un arrêt maîtrisé (déploiement, SIGTERM de l'hébergeur, SIGINT).
 * @param {string} reason `restart`, `SIGTERM`, `SIGINT`…
 */
function recordStop(reason, { now = Date.now() } = {}) {
  if (!isBootJournalEnabled() || stopRecorded) return null;
  stopRecorded = true;
  const rssMb = currentRssMb();
  return appendEntry({
    at: new Date(now).toISOString(),
    event: 'stop',
    pid: process.pid,
    reason: reason ? String(reason) : 'shutdown',
    lifetimeMs: Math.max(0, now - processStartedAtMs),
    rssMb,
    maxRssMb: rssState.maxRssMb ?? rssMb,
  });
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
 * @returns {Array<{ at: string, bootedAt: string|null, pid: number|null, maxRssMbBeforeKill: number|null, lastRssAt: string|null }>}
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
    out.push({ at: String(e.at), bootedAt, pid, maxRssMbBeforeKill: maxRss, lastRssAt });
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
  hardKills: {
    verdict: 'hard_kills',
    advice:
      "Le process est tué sans signal (aucun arrêt tracé avant le redémarrage) : limite de mémoire ou de processus de l'hébergeur (CloudLinux LVE). Vérifier « Resource Usage » dans cPanel ; réduire la RAM du process ou demander un relèvement à o2switch.",
  },
  hostStops: {
    verdict: 'host_idle_stops',
    advice:
      "L'hébergeur arrête l'application (SIGTERM) : arrêt d'inactivité Passenger. Chaque retour coûte un démarrage à froid. Installer le keepalive crontab (docs/CRONTAB.md) pour maintenir l'application éveillée aux heures d'usage.",
  },
  deployRestarts: {
    verdict: 'deploy_churn',
    advice:
      'Les redémarrages viennent des déploiements automatiques. Grouper les merges sur main, ou augmenter DEPLOY_QUIET_SECONDS dans le cron de déploiement pour fusionner une rafale de commits en un seul redémarrage.',
  },
};

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

  for (const e of inWindow) {
    if (e.event === 'boot') {
      counts.boots += 1;
      if (e.previousStop === 'hard') counts.hardKills += 1;
      if (Number.isFinite(e.downtimeMs)) {
        downtimeTotalMs += e.downtimeMs;
        downtimeSamples += 1;
      }
    } else if (e.event === 'crash') {
      counts.crashes += 1;
    } else if (e.event === 'stop') {
      const reason = String(e.reason || '').toLowerCase();
      if (DEPLOY_RESTART_REASONS.has(reason)) counts.deployRestarts += 1;
      else if (STARTUP_FAILURE_REASONS.has(reason)) counts.startupFailures += 1;
      else counts.hostStops += 1;
    }
  }

  let verdict = 'stable';
  let advice =
    'Aucun redémarrage anormal sur la fenêtre : si une indisponibilité est ressentie malgré tout, elle vient du réseau, du navigateur ou du frontal (Tiger Protect / HTTP/2) — voir docs/EXPLOITATION.md.';
  if (counts.startupFailures > 0) ({ verdict, advice } = VERDICTS.startupFailures);
  else if (counts.crashes > 0) ({ verdict, advice } = VERDICTS.crashes);
  else if (counts.hardKills >= 2) ({ verdict, advice } = VERDICTS.hardKills);
  else if (counts.hostStops >= 3) ({ verdict, advice } = VERDICTS.hostStops);
  else if (counts.deployRestarts >= 4) ({ verdict, advice } = VERDICTS.deployRestarts);

  const last = Math.min(Math.max(1, lastCount), 200);
  const hardKills = hardKillDetails(entries, since);
  const rssSeen = hardKills.map((k) => k.maxRssMbBeforeKill).filter((v) => Number.isFinite(v));
  const visible = inWindow.filter((e) => e.event !== 'rss');
  return {
    enabled: isBootJournalEnabled(),
    file: bootJournalPath(),
    entriesTotal: entries.length,
    windowHours: hours,
    counts,
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

/** Tests uniquement : remet à zéro le relevé RSS du process. */
function resetRssForTests() {
  stopRssTick();
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
  recordRssSample,
  startRssTick,
  stopRssTick,
  resolveStopReason,
  restartFilePath,
  summarizeBootJournal,
  hardKillDetails,
  classifyPreviousStop,
  resetStopRecordedForTests,
  resetRssForTests,
};
