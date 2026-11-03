'use strict';

/**
 * Racines de fichiers consultables par le connecteur MCP (`foretmap_list_files`,
 * `foretmap_read_file`, `foretmap_grep_files`) — **lecture seule, administrateurs**.
 *
 * Une racine = un nom court + un chemin absolu (dossier ou fichier). Rien n'est lisible hors
 * d'une racine : le chemin demandé est résolu par `realpath` (liens symboliques compris) et
 * doit rester **dans la même racine** (`resolveInRoot`).
 *
 * `MCP_FILE_ROOTS` (facultatif) remplace la liste par défaut : `nom=chemin` séparés par des
 * virgules, chemin absolu ou relatif à la racine de l'application
 * (ex. `logs=logs,passenger=/home/u/foretmap/stderr.log,docs=docs`). Une racine absente du
 * disque est ignorée (et signalée par `foretmap_list_files`).
 *
 * Racines par défaut (seules celles qui existent sont exposées) :
 * - `logs` : journaux des lignes de crontab et `boot-journal.ndjson` (`logs/` de l'application,
 *   ou `MCP_CRON_LOG_DIR`, ou `~/foretmap-logs` recommandé hors racine web, EXPLOITATION § 11.4) ;
 * - `startup` : `startup.log`, `startup-diag.log` (écrasés à chaque démarrage) ;
 * - `passenger` : `stderr.log` de Passenger / cPanel (`MCP_PASSENGER_LOG`, sinon
 *   `<application>/stderr.log`, sinon `~/logs/<dossier>.stderr.log`) ;
 * - `cpanel` : `.cpanel.yml` ; `scripts`, `docs`, `migrations` : dossiers du dépôt.
 *
 * Le tampon Pino en mémoire est la racine virtuelle `pino` (lecture : mêmes règles que
 * `foretmap_tail_logs`).
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const APP_ROOT = path.resolve(__dirname, '..', '..', '..');
const PINO_ROOT = 'pino';
const ROOT_NAME_RE = /^[a-z][a-z0-9_-]{0,31}$/;

class McpFileAccessError extends Error {
  constructor(message, code = 'MCP_FILE_REFUSED') {
    super(message);
    this.name = 'McpToolError';
    this.code = code;
  }
}

function resolveFromApp(p) {
  return path.isAbsolute(p) ? path.normalize(p) : path.resolve(APP_ROOT, p);
}

/** Dossier des journaux de la crontab (premier existant). */
function cronLogDirCandidates() {
  const out = [];
  const env = String(process.env.MCP_CRON_LOG_DIR || '').trim();
  if (env) out.push(resolveFromApp(env));
  out.push(path.join(APP_ROOT, 'logs'));
  out.push(path.join(os.homedir(), 'foretmap-logs'));
  return out;
}

function firstExisting(paths) {
  return paths.find((p) => {
    try {
      fs.accessSync(p, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  });
}

function defaultRoots() {
  const roots = [];
  const logs = firstExisting(cronLogDirCandidates());
  if (logs)
    roots.push({
      name: 'logs',
      path: logs,
      kind: 'dir',
      description: 'Journaux de la crontab et du cycle de vie',
    });
  for (const f of ['startup.log', 'startup-diag.log']) {
    const p = path.join(APP_ROOT, f);
    if (firstExisting([p])) {
      roots.push({
        name: f === 'startup.log' ? 'startup' : 'startup-diag',
        path: p,
        kind: 'file',
        description: 'Diagnostic du dernier démarrage (écrasé à chaque démarrage)',
      });
    }
  }
  const passengerCandidates = [];
  const envP = String(process.env.MCP_PASSENGER_LOG || '').trim();
  if (envP) passengerCandidates.push(resolveFromApp(envP));
  passengerCandidates.push(path.join(APP_ROOT, 'stderr.log'));
  passengerCandidates.push(
    path.join(os.homedir(), 'logs', `${path.basename(APP_ROOT)}.stderr.log`),
  );
  const passenger = firstExisting(passengerCandidates);
  if (passenger) {
    roots.push({
      name: 'passenger',
      path: passenger,
      kind: 'file',
      description: 'Sortie d’erreur Passenger / cPanel',
    });
  }
  const repo = [
    ['cpanel', '.cpanel.yml', 'file', 'Tâches de déploiement cPanel'],
    ['scripts', 'scripts', 'dir', 'Scripts d’exploitation du dépôt'],
    ['docs', 'docs', 'dir', 'Documentation du dépôt'],
    ['migrations', 'migrations', 'dir', 'Migrations SQL'],
  ];
  for (const [name, rel, kind, description] of repo) {
    const p = path.join(APP_ROOT, rel);
    if (firstExisting([p])) roots.push({ name, path: p, kind, description });
  }
  return roots;
}

/** Racines configurées (`MCP_FILE_ROOTS`) ou par défaut, chemins réels résolus. */
function getFileRoots() {
  const raw = String(process.env.MCP_FILE_ROOTS || '').trim();
  let roots;
  const missing = [];
  if (raw) {
    roots = [];
    for (const part of raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)) {
      const eq = part.indexOf('=');
      const name = (eq > 0 ? part.slice(0, eq) : path.basename(part)).trim().toLowerCase();
      const p = resolveFromApp((eq > 0 ? part.slice(eq + 1) : part).trim());
      if (!ROOT_NAME_RE.test(name) || name === PINO_ROOT) continue;
      let st;
      try {
        st = fs.statSync(p);
      } catch {
        missing.push(name);
        continue;
      }
      roots.push({
        name,
        path: p,
        kind: st.isDirectory() ? 'dir' : 'file',
        description: 'Racine configurée (MCP_FILE_ROOTS)',
      });
    }
  } else {
    roots = defaultRoots();
  }
  const seen = new Set();
  const out = [];
  for (const r of roots) {
    if (seen.has(r.name)) continue;
    let real;
    try {
      real = fs.realpathSync(r.path);
    } catch {
      missing.push(r.name);
      continue;
    }
    seen.add(r.name);
    out.push({ ...r, real });
  }
  return { roots: out, missing };
}

function findRoot(name) {
  const { roots } = getFileRoots();
  const root = roots.find((r) => r.name === String(name || '').toLowerCase());
  if (!root) {
    throw new McpFileAccessError(
      `Racine inconnue « ${name} » : appeler foretmap_list_files sans argument pour la liste`,
      'MCP_FILE_UNKNOWN_ROOT',
    );
  }
  return root;
}

function isInside(base, target) {
  return target === base || target.startsWith(base.endsWith(path.sep) ? base : base + path.sep);
}

/**
 * Résout `rel` dans `root` : refus des chemins absolus, des octets nuls, et de tout chemin
 * dont le **chemin réel** (liens symboliques résolus) sort de la racine.
 * @returns {{ root: object, real: string, rel: string }}
 */
function resolveInRoot(rootName, rel = '') {
  const root = findRoot(rootName);
  const relStr = String(rel ?? '');
  if (relStr.includes('\0')) throw new McpFileAccessError('Chemin invalide');
  if (path.isAbsolute(relStr) || /^[A-Za-z]:[\\/]/.test(relStr)) {
    throw new McpFileAccessError('Chemin absolu refusé : donner un chemin relatif à la racine');
  }
  if (root.kind === 'file' && relStr && relStr !== '.' && relStr !== path.basename(root.real)) {
    throw new McpFileAccessError(
      'Cette racine est un fichier unique : ne pas donner de sous-chemin',
    );
  }
  const candidate = root.kind === 'file' ? root.real : path.resolve(root.real, relStr || '.');
  if (!isInside(root.real, candidate)) {
    throw new McpFileAccessError('Chemin hors de la racine refusé (« .. »)', 'MCP_FILE_TRAVERSAL');
  }
  let real;
  try {
    real = fs.realpathSync(candidate);
  } catch {
    throw new McpFileAccessError('Fichier introuvable', 'MCP_NOT_FOUND');
  }
  if (!isInside(root.real, real)) {
    throw new McpFileAccessError(
      'Lien symbolique qui sort de la racine : refusé',
      'MCP_FILE_TRAVERSAL',
    );
  }
  return {
    root,
    real,
    rel: path.relative(root.real, real) || (root.kind === 'file' ? path.basename(real) : '.'),
  };
}

module.exports = {
  APP_ROOT,
  McpFileAccessError,
  PINO_ROOT,
  cronLogDirCandidates,
  firstExisting,
  getFileRoots,
  isInside,
  resolveInRoot,
};
