'use strict';

/**
 * Exploitation du site pour `foretmap_ops` (lot D4). Pas de SQL ad hoc d'écriture : chaque
 * opération appelle une fonction existante de `lib/` (jobs quotidiens, migrations, purge de
 * conservation, caches, journal de démarrage). Seuls la sauvegarde (`opsDump.js`) et le relevé
 * de stockage lisent la base.
 *
 * | Fonction           | Appuyée sur                                                        |
 * | ------------------ | ------------------------------------------------------------------ |
 * | `runCron`          | `lib/dailyJobs.js` (`runJobNow`, tracé dans `scheduled_job_runs`)   |
 * | `migrate`          | `lib/migrationStatus.js` puis `initSchema()` (= `npm run db:migrate`) |
 * | `restart`          | `lib/bootJournal.js` (`restartFilePath` : `tmp/restart.txt`)        |
 * | `storageReport`    | `uploads/`, `scripts/reconcile-orphan-uploads.js` (simulation)      |
 * | `deployStatus`     | `package.json`, `dist/`, `.git`, `lib/migrationStatus.js`, `lib/bootJournal.js` |
 * | `retention`        | `lib/retention/retentionPurge.js` (`runRetentionPurge`)             |
 * | `clearCaches`      | fonctions de vidage exportées par les modules qui en ont            |
 */

const fs = require('node:fs');
const path = require('node:path');
const { McpToolError } = require('../registry');

const ROOT = path.resolve(__dirname, '..', '..', '..');

// --------------------------------------------------------------------------------------------
// Tâches planifiées
// --------------------------------------------------------------------------------------------

async function runCron(job) {
  const { runJobNow } = require('../../dailyJobs');
  try {
    return await runJobNow(job);
  } catch (err) {
    if (err?.code === 'UNKNOWN_JOB') throw new McpToolError(err.message, 'MCP_INVALID_ARGS');
    throw new McpToolError(`Tâche ${job} en échec : ${err?.message || err}`, 'MCP_JOB_FAILED');
  }
}

function listCronJobs() {
  return require('../../dailyJobs').listDailyJobs();
}

// --------------------------------------------------------------------------------------------
// Migrations
// --------------------------------------------------------------------------------------------

async function migrationStatus() {
  const { getMigrationStatus } = require('../../migrationStatus');
  const { queryOne } = require('../../../database');
  return getMigrationStatus({ queryOne });
}

/**
 * Applique les migrations en attente, en processus, comme `npm run db:migrate` (`initSchema` :
 * schéma idempotent puis `runMigrations`, puis semis de rattrapage). Sans migration en
 * attente, rien n'est lancé.
 * @param {{ dryRun?: boolean }} [opts]
 */
async function migrate({ dryRun = false } = {}) {
  const before = await migrationStatus();
  if (dryRun || before.upToDate) {
    return { ran: false, dry_run: !!dryRun, up_to_date: before.upToDate, before };
  }
  const started = Date.now();
  const { initSchema } = require('../../../database');
  await initSchema();
  const after = await migrationStatus();
  const logger = require('../../logger');
  logger.info(
    { from: before.current, to: after.current, msg: 'mcp_ops_migrate' },
    'Migrations appliquées par le connecteur',
  );
  return {
    ran: true,
    applied: before.pending.filter((n) => !after.pending.includes(n)),
    duration_ms: Date.now() - started,
    before,
    after,
  };
}

// --------------------------------------------------------------------------------------------
// Redémarrage
// --------------------------------------------------------------------------------------------

/** Touche `tmp/restart.txt` : Passenger redémarre l'application à la requête suivante. */
function restart() {
  const { restartFilePath } = require('../../bootJournal');
  const file = restartFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const now = new Date();
  if (fs.existsSync(file)) fs.utimesSync(file, now, now);
  else fs.writeFileSync(file, '');
  return {
    ok: true,
    file: path.relative(ROOT, file),
    touched_at: now.toISOString(),
    note: 'Passenger redémarre l’application à la prochaine requête ; sans Passenger (node server.js, nodemon), ce fichier est sans effet.',
  };
}

// --------------------------------------------------------------------------------------------
// Stockage
// --------------------------------------------------------------------------------------------

const MAX_WALK_ENTRIES = 200_000;

/** Taille et nombre de fichiers par sous-dossier de premier niveau (parcours borné). */
function walkSizes(baseDir) {
  const byTop = new Map();
  let seen = 0;
  let truncated = false;
  const visit = (abs, top) => {
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (seen >= MAX_WALK_ENTRIES) {
        truncated = true;
        return;
      }
      seen += 1;
      const full = path.join(abs, e.name);
      const key = top || (e.isDirectory() ? e.name : '(racine)');
      if (e.isDirectory()) {
        visit(full, key);
        continue;
      }
      if (!e.isFile()) continue;
      let size = 0;
      try {
        size = fs.statSync(full).size;
      } catch {
        continue;
      }
      const cur = byTop.get(key) || { files: 0, bytes: 0 };
      cur.files += 1;
      cur.bytes += size;
      byTop.set(key, cur);
    }
  };
  visit(baseDir, null);
  const dirs = [...byTop.entries()]
    .map(([dir, v]) => ({ dir, files: v.files, bytes: v.bytes, mb: toMb(v.bytes) }))
    .sort((a, b) => b.bytes - a.bytes);
  const total = dirs.reduce((acc, d) => acc + d.bytes, 0);
  return { dirs, total_bytes: total, total_mb: toMb(total), truncated };
}

function toMb(bytes) {
  return Math.round((bytes / 1024 / 1024) * 100) / 100;
}

/**
 * Volumes de `uploads/`, médias orphelins (simulation de `reconcile-orphan-uploads`, rien
 * n'est supprimé) et cache du relais d'images.
 * @param {{ orphansPreview?: number }} [opts]
 */
async function storageReport({ orphansPreview = 50 } = {}) {
  const { UPLOADS_DIR } = require('../../uploads');
  const volumes = walkSizes(UPLOADS_DIR);
  let orphans;
  try {
    const reconcile = require('../../../scripts/reconcile-orphan-uploads');
    const disk = reconcile.listUploadFiles(UPLOADS_DIR, 'managed');
    const referenced = await reconcile.loadReferencedImagePaths('managed');
    const list = reconcile.computeOrphanPaths(disk, referenced);
    let bytes = 0;
    for (const rp of list) {
      try {
        bytes += fs.statSync(path.join(UPLOADS_DIR, rp)).size;
      } catch {
        /* disparu entre-temps */
      }
    }
    orphans = {
      scope: 'managed',
      scanned: disk.length,
      count: list.length,
      bytes,
      mb: toMb(bytes),
      preview: list.slice(0, orphansPreview),
      note: 'Simulation : suppression par `node scripts/reconcile-orphan-uploads.js --apply`.',
    };
  } catch (err) {
    orphans = { error: `Recherche des orphelins impossible : ${err?.message || err}` };
  }
  const relay = volumes.dirs.find((d) => d.dir === 'remote-cache') || { files: 0, bytes: 0 };
  const maxBytes = Number.parseInt(String(process.env.FORETMAP_REMOTE_MEDIA_CACHE_MAX_BYTES), 10);
  return {
    uploads: volumes,
    orphans,
    image_relay_cache: {
      dir: 'uploads/remote-cache',
      // Une entrée = un `.bin` (image) et un `.json` (métadonnées).
      entries: Math.floor(relay.files / 2),
      bytes: relay.bytes,
      mb: toMb(relay.bytes),
      max_mb: toMb(Number.isFinite(maxBytes) && maxBytes >= 1024 * 1024 ? maxBytes : 500 * 2 ** 20),
    },
  };
}

// --------------------------------------------------------------------------------------------
// État du déploiement
// --------------------------------------------------------------------------------------------

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Révision Git du dossier de l'application, lue dans `.git` sans lancer `git`. */
function gitRevision() {
  const gitDir = path.join(ROOT, '.git');
  try {
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref:')) return { sha: head.slice(0, 40), branch: null };
    const ref = head.slice(4).trim();
    const branch = ref.replace(/^refs\/heads\//, '');
    const loose = path.join(gitDir, ref);
    if (fs.existsSync(loose)) return { sha: fs.readFileSync(loose, 'utf8').trim(), branch };
    const packed = fs.readFileSync(path.join(gitDir, 'packed-refs'), 'utf8');
    const line = packed.split('\n').find((l) => l.endsWith(` ${ref}`));
    return { sha: line ? line.split(' ')[0] : null, branch };
  } catch {
    return null;
  }
}

/** Version, révision déployée (si connue), état du build et des migrations, redémarrages. */
async function deployStatus() {
  const pkg = readJson(path.join(ROOT, 'package.json')) || {};
  const distDir = path.join(ROOT, 'dist');
  const buildInfo =
    readJson(path.join(distDir, 'BUILD_INFO.json')) || readJson(path.join(ROOT, 'BUILD_INFO.json'));
  let dist = { present: false };
  try {
    const st = fs.statSync(path.join(distDir, 'index.vite.html'));
    dist = { present: true, built_at: st.mtime.toISOString() };
  } catch {
    /* pas de build */
  }
  let schema;
  try {
    schema = await migrationStatus();
  } catch (err) {
    schema = { error: `schema_version illisible : ${err?.message || err}` };
  }
  const { summarizeBootJournal } = require('../../bootJournal');
  let restarts = null;
  try {
    const s = summarizeBootJournal({ windowHours: 24 * 7, lastCount: 5 });
    restarts = { verdict: s.verdict || null, counts: s.counts || null, recent: s.recent || [] };
  } catch {
    restarts = null;
  }
  const git = gitRevision();
  return {
    version: pkg.version || null,
    // Version chargée au démarrage du processus (diffère de package.json après un déploiement
    // non suivi d'un redémarrage).
    running_since: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    node: process.version,
    node_env: process.env.NODE_ENV || null,
    revision: {
      git_sha: git?.sha || null,
      git_branch: git?.branch || null,
      build_source_commit: buildInfo?.sourceCommit || null,
      build_version: buildInfo?.version || null,
      build_built_at: buildInfo?.builtAt || null,
    },
    dist,
    schema,
    restarts,
  };
}

// --------------------------------------------------------------------------------------------
// Purge de conservation
// --------------------------------------------------------------------------------------------

/**
 * Lance la purge planifiée. `apply` exige en plus `RETENTION_PURGE_APPLY=1` dans
 * l'environnement : sans lui, rien n'est fait et l'appel est refusé clairement (la simulation
 * reste disponible).
 * @param {{ apply?: boolean, only?: string[] }} opts
 */
async function retention({ apply = false, only } = {}) {
  const rp = require('../../retention/retentionPurge');
  if (apply && String(process.env[rp.APPLY_ENV] ?? '').trim() !== '1') {
    throw new McpToolError(
      `Purge réelle verrouillée par l’environnement : ${rp.APPLY_ENV}=1 absent du .env du serveur (la simulation reste disponible : retention_preview).`,
      'MCP_ENV_LOCKED',
    );
  }
  const argv = [];
  if (apply) argv.push('--apply');
  if (Array.isArray(only) && only.length) argv.push(`--only=${only.join(',')}`);
  const lines = [];
  const out = await rp.runRetentionPurge({ argv, env: process.env, log: (l) => lines.push(l) });
  return { ...out, categories: rp.CATEGORY_KEYS, log: lines.slice(-200) };
}

// --------------------------------------------------------------------------------------------
// Caches
// --------------------------------------------------------------------------------------------

/** Caches mémoire qui exposent une fonction de vidage (`[nom, module, fonction]`). */
const CACHES = Object.freeze([
  ['réglages', '../../settings', 'invalidateSettingsCache'],
  ['réglages du connecteur', '../config', 'invalidateMcpSettingsCache'],
  ['vues de tutoriels', '../../tutorialViewCache', 'clearTutorialViewCache'],
  ['liste des cartes', '../../terrain/mapService', 'invalidateMapsListCache'],
  ['liste des espèces', '../../biodiv/speciesService', 'invalidatePlantsListCache'],
  ['accès aux cartes', '../../mapAccess', 'clearMapAccessCache'],
  ['codes de verrouillage strict', '../../learningGatingLockMode', 'invalidateStrictCodesCache'],
  ['avatars par défaut', '../../defaultAvatar', 'clearDefaultAvatarCache'],
  ['marque', '../../brand', 'resetBrandCache'],
]);

function clearCaches() {
  const cleared = [];
  const failed = [];
  for (const [label, mod, fn] of CACHES) {
    try {
      const f = require(mod)[fn];
      if (typeof f !== 'function') throw new Error('fonction absente');
      f();
      cleared.push(label);
    } catch (err) {
      failed.push({ cache: label, error: String(err?.message || err).slice(0, 200) });
    }
  }
  return {
    cleared,
    failed,
    note: 'Caches de ce processus seulement (plusieurs instances : chacune garde le sien jusqu’à expiration). Le cache disque du relais d’images est purgé par sa propre rotation.',
  };
}

module.exports = {
  CACHES,
  clearCaches,
  deployStatus,
  gitRevision,
  listCronJobs,
  migrate,
  migrationStatus,
  restart,
  retention,
  runCron,
  storageReport,
  walkSizes,
};
