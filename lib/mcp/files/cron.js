'use strict';

/**
 * `foretmap_cron_status` — dernières exécutions et retards des tâches planifiées connues,
 * **à partir de ce que le code trace déjà** :
 *
 * | Tâche                       | Trace lue                                                     | Attendue      |
 * | --------------------------- | ------------------------------------------------------------- | ------------- |
 * | jobs quotidiens du serveur  | `scheduled_job_runs` (`recurring_tasks`, `auto_archive`, …)   | 24 h (+ marge)|
 * | `health_report`             | `scheduled_job_runs` (script `scripts/health-report.js`)      | 24 h          |
 * | `retention_purge`           | `retention_purge_runs` (migration 319)                        | 24 h          |
 * | `auto_deploy`               | dernière ligne horodatée de `logs/foretmap-auto-deploy.log`   | 2 min         |
 * | `db_backup`                 | `logs/db-backup.log`                                          | 24 h          |
 * | `uptime_check`              | `logs/uptime.log`                                             | 5 min         |
 * | `moodle_sync`               | `logs/moodle-sync.log` (facultatif, jours ouvrés)             | 4 j           |
 * | `reconcile_uploads`         | `logs/reconcile-uploads.log` (facultatif, mensuel)            | 32 j          |
 *
 * Statut par tâche : `ok`, `late` (dernière trace plus vieille que l'attente + 50 %),
 * `failure` (dernière exécution en échec), `blocked` (purge arrêtée par un seuil), `never`
 * (aucune trace : ligne de crontab absente ou journal ailleurs). Les dates des fichiers de
 * journal sont lues dans le texte (`[AAAA-MM-JJ HH:MM:SS]`, heure du serveur), sinon la date de
 * modification du fichier.
 *
 * Crontab : lue par `crontab -l` (`child_process.execFile`, 3 s) **seulement** si
 * `MCP_CRON_READ_CRONTAB=true` — sur o2switch le binaire existe, mais un environnement
 * Passenger restreint (CageFS) peut le refuser ; la sortie est nettoyée (secrets masqués,
 * `NOM=valeur` sensibles en `****`).
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { cronLogDirCandidates, firstExisting } = require('./roots');

const H = 3600 * 1000;

/** Tâches journalisées par fichier : nom, fichier, attente (heures), facultative ? */
const FILE_JOBS = Object.freeze([
  { job: 'auto_deploy', file: 'foretmap-auto-deploy.log', everyHours: 2 / 60, optional: false },
  { job: 'db_backup', file: 'db-backup.log', everyHours: 24, optional: false },
  { job: 'uptime_check', file: 'uptime.log', everyHours: 5 / 60, optional: false },
  { job: 'moodle_sync', file: 'moodle-sync.log', everyHours: 96, optional: true },
  { job: 'reconcile_uploads', file: 'reconcile-uploads.log', everyHours: 32 * 24, optional: true },
]);

/** Tâches tracées en base (`scheduled_job_runs`), avec leur attente. */
const DB_JOBS = Object.freeze({
  recurring_tasks: { everyHours: 24, origin: 'serveur (jobs quotidiens)' },
  auto_archive: { everyHours: 24, origin: 'serveur (jobs quotidiens)' },
  notifications_purge: { everyHours: 24, origin: 'serveur (jobs quotidiens)' },
  task_deadline_reminders: { everyHours: 24, origin: 'serveur (jobs quotidiens)' },
  rewards_evaluate: { everyHours: 24, origin: 'serveur (jobs quotidiens)' },
  health_report: { everyHours: 24, origin: 'crontab (scripts/health-report.js)' },
});

/**
 * Lignes de crontab attendues (reprises de `docs/CRONTAB.md`, gabarit : `USER` = compte
 * hébergeur, `<domaine-foretmap>` = domaine du site). Servies en `hint` quand une tâche
 * obligatoire n'a **jamais** laissé de trace (`state: 'never'`) : la ligne manque
 * probablement dans cPanel → Tâches cron, et la règle de santé le signale en orange.
 */
const CRONTAB_HINTS = Object.freeze({
  auto_deploy:
    '*/2 * * * * mkdir -p /home/USER/foretmap/logs && APP_DIR=/home/USER/foretmap DEPLOY_BASE_URL=https://<domaine-foretmap> DEPLOY_AUTO_MIGRATE=1 bash /home/USER/foretmap/scripts/auto-deploy-cron.sh >> /home/USER/foretmap/logs/foretmap-auto-deploy.log 2>&1',
  db_backup:
    '0 3 * * * APP_DIR=/home/USER/foretmap bash /home/USER/foretmap/scripts/db-backup.sh >> /home/USER/foretmap/logs/db-backup.log 2>&1',
  uptime_check:
    '*/5 * * * * APP_DIR=/home/USER/foretmap DEPLOY_BASE_URL=https://<domaine-foretmap> bash /home/USER/foretmap/scripts/uptime-check.sh >> /home/USER/foretmap/logs/uptime.log 2>&1',
  retention_purge:
    '10 4 * * * mkdir -p /home/USER/foretmap/logs && APP_DIR=/home/USER/foretmap bash /home/USER/foretmap/scripts/retention-purge-cron.sh --apply >> /home/USER/foretmap/logs/retention-purge.log 2>&1',
  health_report:
    '40 6 * * * mkdir -p /home/USER/foretmap/logs && bash /home/USER/foretmap/scripts/with-app-node.sh node scripts/health-report.js >> /home/USER/foretmap/logs/health-report.log 2>&1',
});

/** `hint` d'une tâche jamais tracée : la ligne de crontab à copier dans cPanel. */
function crontabHint(job) {
  const line = CRONTAB_HINTS[job];
  if (!line) return undefined;
  return `Ligne de crontab attendue (docs/CRONTAB.md ; remplacer USER et <domaine-foretmap>) : ${line}`;
}

const FAILURE_LINE_RE = /\b(?:ÉCHEC|ECHEC|FAIL(?:ED|URE)?|ERREUR|ERROR|ROLLBACK)\b/i;
const STAMP_RE = /^\[(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\]/;

function stateFor(lastMs, everyHours, now) {
  if (lastMs == null) return { state: 'never', ageHours: null };
  const ageHours = Math.round(((now - lastMs) / H) * 10) / 10;
  const graceHours = Math.max(everyHours * 1.5, everyHours + 0.25);
  return { state: ageHours > graceHours ? 'late' : 'ok', ageHours };
}

/** Dernière ligne horodatée d'un journal de cron (lecture des 64 derniers ko seulement). */
function lastStampedLine(file) {
  const st = fs.statSync(file);
  const len = Math.min(st.size, 64 * 1024);
  const fd = fs.openSync(file, 'r');
  let text;
  try {
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, st.size - len);
    text = buf.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
  const lines = text.split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const m = STAMP_RE.exec(lines[i]);
    if (m) {
      // Heure locale du serveur (format `date` des scripts shell).
      const at = new Date(`${m[1]}T${m[2]}`);
      return { atMs: at.getTime(), line: lines[i], mtimeMs: st.mtimeMs };
    }
  }
  return { atMs: null, line: lines[lines.length - 1] || null, mtimeMs: st.mtimeMs };
}

function fileJobs(now) {
  const dir = firstExisting(cronLogDirCandidates());
  const { createLogSanitizer } = require('../logSanitizer');
  const { cleanLogText } = createLogSanitizer();
  return FILE_JOBS.map((def) => {
    const base = {
      job: def.job,
      origin: `crontab (logs/${def.file})`,
      expectedEveryHours: Math.round(def.everyHours * 100) / 100,
    };
    const file = dir ? path.join(dir, def.file) : null;
    if (!file || !fs.existsSync(file)) {
      if (def.optional) return { ...base, state: 'not_configured', ageHours: null };
      return { ...base, state: 'never', ageHours: null, hint: crontabHint(def.job) };
    }
    try {
      const last = lastStampedLine(file);
      const lastMs = last.atMs ?? last.mtimeMs;
      const s = stateFor(lastMs, def.everyHours, now);
      const failed = last.line && FAILURE_LINE_RE.test(last.line);
      return {
        ...base,
        ...s,
        state: failed ? 'failure' : s.state,
        last_at: new Date(lastMs).toISOString(),
        detail: last.line ? cleanLogText(last.line, { maxChars: 300 }) : undefined,
      };
    } catch (err) {
      return { ...base, state: 'unreadable', error: String(err?.code || err?.message) };
    }
  });
}

async function dbJobs(now) {
  const { listJobSummaries } = require('../../scheduledJobs');
  let rows = [];
  try {
    rows = await listJobSummaries();
  } catch (err) {
    return [
      { job: 'scheduled_job_runs', state: 'unreadable', error: String(err?.code || err?.message) },
    ];
  }
  const byJob = new Map(rows.map((r) => [r.job, r]));
  const out = [];
  for (const [job, def] of Object.entries(DB_JOBS)) {
    const r = byJob.get(job);
    const base = { job, origin: def.origin, expectedEveryHours: def.everyHours };
    if (!r) {
      out.push({ ...base, state: 'never', ageHours: null, hint: crontabHint(job) });
      continue;
    }
    const s = stateFor(new Date(r.last_started_at).getTime(), def.everyHours, now);
    out.push({
      ...base,
      ...s,
      state:
        r.last_outcome === 'failure'
          ? 'failure'
          : r.last_outcome === 'running' && s.state === 'late'
            ? 'late'
            : s.state,
      last_at: r.last_started_at,
      last_outcome: r.last_outcome,
      last_duration_ms: r.last_duration_ms,
      runs_7d: r.runs_7d,
      failures_7d: r.failures_7d,
      detail: r.last_detail || undefined,
    });
  }
  // Tâches tracées mais inconnues ici (ajoutées plus tard) : affichées sans attente.
  for (const r of rows) {
    if (DB_JOBS[r.job]) continue;
    out.push({
      job: r.job,
      origin: 'scheduled_job_runs',
      state: r.last_outcome === 'failure' ? 'failure' : 'ok',
      last_at: r.last_started_at,
      last_outcome: r.last_outcome,
      runs_7d: r.runs_7d,
    });
  }
  return out;
}

async function retentionJob(now) {
  const base = {
    job: 'retention_purge',
    origin: 'crontab (scripts/retention-purge-cron.sh)',
    expectedEveryHours: 24,
  };
  try {
    const { queryOne } = require('../../../database');
    const r = await queryOne(
      'SELECT started_at, finished_at, mode, outcome, duration_ms FROM retention_purge_runs ORDER BY id DESC LIMIT 1',
    );
    if (!r)
      return { ...base, state: 'never', ageHours: null, hint: crontabHint('retention_purge') };
    const s = stateFor(new Date(r.started_at).getTime(), 24, now);
    let state = s.state;
    if (r.outcome === 'failure' || r.outcome === 'interrupted') state = 'failure';
    else if (r.outcome === 'blocked') state = 'blocked';
    return {
      ...base,
      ...s,
      state,
      last_at: new Date(r.started_at).toISOString(),
      last_outcome: r.outcome,
      mode: r.mode,
      last_duration_ms: r.duration_ms,
    };
  } catch (err) {
    return { ...base, state: 'unreadable', error: String(err?.code || err?.message) };
  }
}

/** `crontab -l` si l'environnement le permet (`MCP_CRON_READ_CRONTAB=true`). */
function readCrontab() {
  const enabled = ['1', 'true', 'oui', 'yes'].includes(
    String(process.env.MCP_CRON_READ_CRONTAB || '')
      .trim()
      .toLowerCase(),
  );
  if (!enabled) {
    return Promise.resolve({
      available: false,
      reason:
        'Lecture de la crontab désactivée (MCP_CRON_READ_CRONTAB=true pour l’activer) : sous Passenger/CageFS, `crontab -l` peut être refusé au processus web. Le statut ci-dessus vient des traces écrites par les tâches elles-mêmes.',
    });
  }
  return new Promise((resolve) => {
    execFile('crontab', ['-l'], { timeout: 3000, maxBuffer: 64 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        resolve({
          available: false,
          reason: `crontab -l impossible ici (${err.code || 'erreur'}${stderr ? ` : ${String(stderr).trim().slice(0, 120)}` : ''})`,
        });
        return;
      }
      const { maskSecrets } = require('../secretMask');
      const lines = String(stdout)
        .split('\n')
        .filter((l) => l.trim())
        .slice(0, 100)
        .map((l) => maskSecrets(l).slice(0, 500));
      resolve({ available: true, lines });
    });
  });
}

/**
 * @param {{ includeCrontab?: boolean, now?: number }} [opts]
 */
async function getCronStatus({ includeCrontab = true, now = Date.now() } = {}) {
  const [db, retention, crontab] = await Promise.all([
    dbJobs(now),
    retentionJob(now),
    includeCrontab ? readCrontab() : Promise.resolve(undefined),
  ]);
  const jobs = [...db, retention, ...fileJobs(now)];
  const problems = jobs.filter((j) => ['late', 'failure', 'blocked'].includes(j.state));
  return {
    generated_at: new Date(now).toISOString(),
    jobs,
    problems: problems.map((j) => j.job),
    crontab,
    note: 'never : aucune trace (ligne de crontab absente, ou tâche jamais lancée depuis la migration 325) — `hint` donne alors la ligne de crontab attendue ; not_configured : tâche facultative sans journal.',
  };
}

module.exports = {
  CRONTAB_HINTS,
  DB_JOBS,
  FILE_JOBS,
  crontabHint,
  getCronStatus,
  lastStampedLine,
  readCrontab,
  stateFor,
};
