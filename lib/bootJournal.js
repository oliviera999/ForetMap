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
 * | `stop` avec `reason: 'restart'`       | redémarrage de déploiement (`POST /api/admin/restart`) | grouper les merges / `DEPLOY_QUIET_SECONDS`    |
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

/** Compacte le journal en ne gardant que les dernières entrées (appelé au boot). */
function trimIfNeeded() {
  const limit = maxEntries();
  const entries = readEntries();
  if (entries.length <= Math.floor(limit * TRIM_TRIGGER_RATIO)) return;
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
  let rssMb = null;
  try {
    rssMb = Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100;
  } catch {
    rssMb = null;
  }
  return appendEntry({
    at: new Date(now).toISOString(),
    event: 'stop',
    pid: process.pid,
    reason: reason ? String(reason) : 'shutdown',
    lifetimeMs: Math.max(0, now - processStartedAtMs),
    rssMb,
  });
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
      if (reason === 'restart') counts.deployRestarts += 1;
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
  return {
    enabled: isBootJournalEnabled(),
    file: bootJournalPath(),
    entriesTotal: entries.length,
    windowHours: hours,
    counts,
    /** Indisponibilité cumulée *mesurable* (arrêts tracés seulement — un SIGKILL n'en laisse pas). */
    downtime: {
      samples: downtimeSamples,
      totalMs: downtimeTotalMs,
      averageMs: downtimeSamples > 0 ? Math.round(downtimeTotalMs / downtimeSamples) : null,
    },
    verdict,
    advice,
    recent: entries.slice(-last),
  };
}

/** Tests uniquement : réautorise l'enregistrement d'un arrêt dans le même process. */
function resetStopRecordedForTests() {
  stopRecorded = false;
}

module.exports = {
  bootJournalPath,
  isBootJournalEnabled,
  readEntries,
  recordBoot,
  recordStop,
  recordCrash,
  summarizeBootJournal,
  classifyPreviousStop,
  resetStopRecordedForTests,
};
