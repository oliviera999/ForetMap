'use strict';

/**
 * Scripts d'exploitation lançables par le connecteur (`foretmap_ops` : `scripts`,
 * `script_dry_run`, `run_script`).
 *
 * Pourquoi une liste blanche : un script de `scripts/` tourne avec les droits complets du
 * serveur (base, fichiers, réseau). On n'expose donc **que** des scripts relus, chacun avec ses
 * options déclarées (type, motif, valeurs) ; aucune option libre, aucun chemin, aucune commande
 * shell. Le script est lancé avec le même Node que l'application (`process.execPath`), sans
 * shell (`execFile`), depuis la racine du dépôt, avec un délai maximal.
 *
 * Simulation / application : chaque entrée déclare son mode d'écriture.
 * - `flag` : le script simule par défaut ; `--apply` n'est ajouté qu'en application ;
 * - `inverse` : le script écrit par défaut ; `--dry-run` est ajouté en simulation ;
 * - `none` : lecture seule, identique dans les deux cas ;
 * - `dry_only` : l'application n'est pas exposée (simulation seulement).
 *
 * Sortie : stdout et stderr nettoyés (`maskSecrets` : jetons, hachages, e-mails) et tronqués
 * (on garde la fin, où se trouve le bilan). Un seul script à la fois (verrou de processus).
 */

const path = require('node:path');
const { execFile } = require('node:child_process');
const { McpToolError } = require('../registry');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_CHARS = 20_000;
const MAX_BUFFER = 8 * 1024 * 1024;

const bool = (description) => Object.freeze({ kind: 'bool', description });
const value = (description, spec) => Object.freeze({ kind: 'value', description, ...spec });
const INT_RE = /^\d{1,6}$/;
const NUM_RE = /^\d{1,3}(?:\.\d{1,3})?$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Catalogue. `options` : clé = nom de l'option côté outil (sans tirets) ; `flag` = option
 * passée au script (`--x` pour un booléen, `--x=valeur` pour une valeur).
 */
const SCRIPT_CATALOG = Object.freeze({
  rewards_backfill: Object.freeze({
    file: 'rewards-backfill.js',
    label: 'Rattrapage des badges de la forêt (élèves actifs sur 30 jours, ou tous)',
    writeMode: 'flag',
    timeoutMs: 300_000,
    options: { all: bool('Tous les élèves (défaut : actifs sur 30 jours)') },
  }),
  gl_rewards_backfill: Object.freeze({
    file: 'gl-rewards-backfill.js',
    label: 'Rattrapage des badges Gnomes & Licornes (conversion des badges hérités)',
    writeMode: 'flag',
    timeoutMs: 300_000,
    options: {},
  }),
  task_taxonomy_backfill: Object.freeze({
    file: 'backfill-task-taxonomy.js',
    label: 'Proposition de classement des tâches (métier, format, phase) — simulation seule',
    writeMode: 'dry_only',
    options: { overwrite: bool('Proposer aussi pour les champs déjà renseignés') },
  }),
  db_migration_status: Object.freeze({
    file: 'db-migration-status.js',
    label: 'Base en retard sur les migrations ? (code 3 = migrations en attente)',
    writeMode: 'none',
    options: {},
  }),
  audit_pedago: Object.freeze({
    file: 'audit-pedago-content.js',
    label: 'Audit pédagogique et scientifique du contenu (lecture seule)',
    writeMode: 'none',
    options: {},
  }),
  report_marker_density: Object.freeze({
    file: 'report-marker-density.js',
    label: 'Densité des repères d’une carte (lecture seule)',
    writeMode: 'none',
    options: {
      map: value('Carte (défaut : carte par défaut des profs)', { pattern: ID_RE }),
      cell: value('Côté d’une cellule, en % de l’image', { pattern: NUM_RE }),
      near: value('Distance de superposition, en %', { pattern: NUM_RE }),
      json: bool('Sortie JSON brute'),
    },
  }),
  reconcile_orphan_uploads: Object.freeze({
    file: 'reconcile-orphan-uploads.js',
    label: 'Fichiers orphelins de uploads/ (application = suppression)',
    writeMode: 'flag',
    options: {
      scope: value('Périmètre', { values: ['managed', 'all'] }),
      json: bool('Sortie JSON'),
    },
  }),
  backfill_gbif_keys: Object.freeze({
    file: 'backfill-gbif-keys.js',
    label: 'Clés GBIF manquantes des espèces (recherche sur le nom scientifique)',
    writeMode: 'inverse',
    timeoutMs: 300_000,
    options: { limit: value('Nombre d’espèces traitées', { pattern: INT_RE }) },
  }),
  gl_photo_credits_backfill: Object.freeze({
    file: 'gl-photo-credits-backfill.js',
    label: 'Crédits photo des QCM Gnomes & Licornes depuis Wikimedia Commons',
    writeMode: 'flag',
    timeoutMs: 600_000,
    options: {},
  }),
  suggest_learning_links: Object.freeze({
    file: 'suggest-learning-links.js',
    label: 'Suggestions de liens d’apprentissage pour les questions (statut « suggéré »)',
    writeMode: 'flag',
    timeoutMs: 300_000,
    options: {
      product: value('Produit', { values: ['foretmap', 'gl'], required: true }),
      dataset: value('Jeu de questions', { values: ['quiz', 'qcm', 'qcm_lore'] }),
      'min-confidence': value('Confiance minimale (0 à 1)', { pattern: NUM_RE }),
      'max-per-question': value('Suggestions max par question', { pattern: INT_RE }),
      limit: value('Nombre de questions traitées', { pattern: INT_RE }),
      verbose: bool('Détail par question'),
    },
  }),
});

const SCRIPT_IDS = Object.freeze(Object.keys(SCRIPT_CATALOG));

/** Catalogue public (pour l'action `scripts`). */
function listScripts() {
  return SCRIPT_IDS.map((id) => {
    const s = SCRIPT_CATALOG[id];
    return {
      id,
      label: s.label,
      file: `scripts/${s.file}`,
      apply_available: s.writeMode === 'flag' || s.writeMode === 'inverse',
      read_only: s.writeMode === 'none',
      options: Object.entries(s.options).map(([name, o]) => ({
        name,
        kind: o.kind,
        description: o.description,
        ...(o.values ? { values: o.values } : {}),
        ...(o.required ? { required: true } : {}),
      })),
    };
  });
}

/**
 * Construit les arguments du script après validation stricte.
 * @param {string} id
 * @param {Record<string, unknown>} [options]
 * @param {{ apply: boolean }} mode
 * @returns {string[]}
 */
function buildArgs(id, options = {}, { apply }) {
  const spec = SCRIPT_CATALOG[id];
  if (!spec) {
    throw new McpToolError(
      `Script inconnu : ${id} (connus : ${SCRIPT_IDS.join(', ')})`,
      'MCP_INVALID_ARGS',
    );
  }
  if (apply && (spec.writeMode === 'none' || spec.writeMode === 'dry_only')) {
    throw new McpToolError(
      spec.writeMode === 'none'
        ? `${id} est en lecture seule : utiliser script_dry_run.`
        : `${id} n’expose que la simulation (son application passe par une relecture du CSV sur le serveur).`,
      'MCP_INVALID_ARGS',
    );
  }
  const args = [];
  const given = options && typeof options === 'object' ? options : {};
  for (const name of Object.keys(given)) {
    if (!Object.prototype.hasOwnProperty.call(spec.options, name)) {
      const known = Object.keys(spec.options);
      throw new McpToolError(
        `Option inconnue pour ${id} : ${name}${known.length ? ` (admises : ${known.join(', ')})` : ' (aucune option)'}`,
        'MCP_INVALID_ARGS',
      );
    }
  }
  for (const [name, o] of Object.entries(spec.options)) {
    const v = given[name];
    if (v === undefined || v === null || v === false) {
      if (o.required) {
        throw new McpToolError(`Option obligatoire pour ${id} : ${name}`, 'MCP_INVALID_ARGS');
      }
      continue;
    }
    if (o.kind === 'bool') {
      if (v !== true) {
        throw new McpToolError(`Option ${name} : booléen attendu`, 'MCP_INVALID_ARGS');
      }
      args.push(`--${name}`);
      continue;
    }
    const s = String(v);
    const ok = o.values ? o.values.includes(s) : o.pattern.test(s);
    if (!ok || typeof v === 'object') {
      throw new McpToolError(
        `Option ${name} : valeur refusée${o.values ? ` (admises : ${o.values.join(', ')})` : ''}`,
        'MCP_INVALID_ARGS',
      );
    }
    args.push(`--${name}=${s}`);
  }
  if (spec.writeMode === 'flag' && apply) args.push('--apply');
  if (spec.writeMode === 'inverse' && !apply) args.push('--dry-run');
  if (spec.writeMode === 'dry_only') args.push('--dry-run');
  return args;
}

/** Garde la fin d'une sortie (le bilan y est), secrets masqués. */
function cleanOutput(text) {
  const { maskSecrets } = require('../secretMask');
  const masked = maskSecrets(String(text || ''));
  if (masked.length <= MAX_OUTPUT_CHARS) return { text: masked, truncated: false };
  return { text: `…\n${masked.slice(-MAX_OUTPUT_CHARS)}`, truncated: true };
}

let running = null;

/**
 * Lance un script du catalogue et attend sa fin.
 * @param {string} id
 * @param {{ options?: object, apply?: boolean, runner?: Function }} [opts] `runner` : injection
 *   pour les tests (signature d'`execFile`).
 * @returns {Promise<object>}
 */
async function runScript(id, { options, apply = false, runner = execFile } = {}) {
  const args = buildArgs(id, options, { apply });
  if (running) {
    throw new McpToolError(
      `Un script est déjà en cours (${running}) : attendre sa fin.`,
      'MCP_BUSY',
    );
  }
  const spec = SCRIPT_CATALOG[id];
  const file = path.join(SCRIPTS_DIR, spec.file);
  const timeoutMs = spec.timeoutMs || DEFAULT_TIMEOUT_MS;
  const started = Date.now();
  running = id;
  try {
    const result = await new Promise((resolve) => {
      runner(
        process.execPath,
        [file, ...args],
        { cwd: ROOT, env: process.env, timeout: timeoutMs, maxBuffer: MAX_BUFFER },
        (err, stdout, stderr) => resolve({ err, stdout, stderr }),
      );
    });
    const { err } = result;
    const timedOut = !!(err && err.killed && err.signal);
    const exitCode = err ? (typeof err.code === 'number' ? err.code : null) : 0;
    if (err && exitCode === null && !timedOut) {
      throw new McpToolError(
        `Lancement de ${id} impossible : ${err.message || err}`,
        'MCP_SCRIPT_FAILED',
      );
    }
    const out = cleanOutput(result.stdout);
    const errOut = cleanOutput(result.stderr);
    return {
      script: id,
      file: `scripts/${spec.file}`,
      mode: apply ? 'application' : spec.writeMode === 'none' ? 'lecture' : 'simulation',
      args,
      exit_code: exitCode,
      ok: exitCode === 0,
      timed_out: timedOut,
      timeout_ms: timeoutMs,
      duration_ms: Date.now() - started,
      stdout: out.text,
      stderr: errOut.text,
      truncated: out.truncated || errOut.truncated,
    };
  } finally {
    running = null;
  }
}

module.exports = { SCRIPT_CATALOG, SCRIPT_IDS, listScripts, buildArgs, runScript };
