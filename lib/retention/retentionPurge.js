'use strict';

/**
 * Purge planifiée : applique les durées de conservation (CLI `scripts/retention-purge.js`,
 * tâche planifiée `scripts/retention-purge-cron.sh`, voir docs/CRONTAB.md).
 *
 * SIMULATION PAR DÉFAUT. Une exécution réelle exige DEUX clés à la fois :
 *   - l'option `--apply` sur la ligne de commande (l'intention, portée par la crontab) ;
 *   - `RETENTION_PURGE_APPLY=1` dans l'environnement (l'activation, posée dans le `.env`
 *     du serveur une fois le rapport de simulation relu).
 * Sans l'une ou l'autre, rien n'est supprimé ni modifié : seuls des comptages sont affichés,
 * et une ligne est ajoutée au journal de purge (`retention_purge_runs`).
 *
 * La sortie ne contient que des catégories et des comptages : jamais de nom, d'adresse
 * e-mail, d'adresse IP ni d'identifiant de compte.
 *
 * Catégories (dans l'ordre d'exécution, `--only=` pour en restreindre la liste) : voir
 * {@link CATEGORY_KEYS}. Chacune est indépendante : l'échec de l'une est journalisé et
 * n'empêche pas les suivantes ; l'exécution est alors en échec (code 1). Un seuil dépassé
 * (trop de comptes à supprimer d'un coup) bloque la catégorie sans rien supprimer (code 3).
 *
 * Codes de sortie : 0 succès · 1 échec (dont option invalide, purge déjà en cours) ·
 * 3 bloquée par un seuil.
 */

const { sanitizeForOutput, markInterruptedRuns, startRun, finishRun } = require('./purgeJournal');

const APPLY_ENV = 'RETENTION_PURGE_APPLY';
const LOCK_NAME = 'foretmap_retention_purge';
const LOG_PREFIX = '[conservation]';

/** Lignes de journaux traitées par instruction (une instruction = une transaction courte). */
const DEFAULT_ROW_BATCH_SIZE = 5000;
const MAX_ROW_BATCH_SIZE = 50000;

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const EXIT_BLOCKED = 3;

/**
 * Catégories, dans l'ordre d'exécution. Chaque module exporte `{ key, label, run(ctx) }` ;
 * `run` rend `{ counts, blocked? }`.
 */
function loadCategories() {
  return [
    require('./categories/deactivations'),
    require('./categories/journals'),
    require('./categories/ips'),
  ];
}

const CATEGORY_KEYS = Object.freeze(loadCategories().map((c) => c.key));

/**
 * Mode d'exécution : réel seulement avec `--apply` ET `RETENTION_PURGE_APPLY=1`.
 * @returns {{ apply: boolean, flag: boolean, enabled: boolean }}
 */
function resolveMode(argv = [], env = {}) {
  const flag = argv.some((a) => String(a).trim() === '--apply');
  const enabled = String(env?.[APPLY_ENV] ?? '').trim() === '1';
  return { apply: flag && enabled, flag, enabled };
}

function parsePositiveInt(raw, label, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const text = String(raw ?? '').trim();
  const n = /^\d+$/.test(text) ? Number.parseInt(text, 10) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(
      `Valeur invalide pour ${label} (${text || 'vide'}) : entier de ${min} à ${max}.`,
    );
  }
  return n;
}

/**
 * Options de la purge planifiée. Toute option inconnue est refusée : une faute de frappe dans
 * la crontab doit échouer (et alerter), pas retomber silencieusement en simulation.
 * @param {string[]} argv
 * @param {Record<string, string|undefined>} env
 * @param {{ categoryKeys?: string[], extraParsers?: Array<(arg: string, out: object) => boolean> }} [spec]
 */
function parseRetentionArgs(argv = [], env = {}, spec = {}) {
  const categoryKeys = spec.categoryKeys || CATEGORY_KEYS;
  const extraParsers = spec.extraParsers || [];
  const mode = resolveMode(argv, env);
  const out = {
    ...mode,
    only: new Set(categoryKeys),
    rowBatchSize: DEFAULT_ROW_BATCH_SIZE,
  };
  for (const raw of argv) {
    const arg = String(raw ?? '').trim();
    if (!arg || arg === '--apply') continue;
    if (arg.startsWith('--only=')) {
      const keys = arg
        .slice('--only='.length)
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      const unknown = keys.filter((k) => !categoryKeys.includes(k));
      if (!keys.length || unknown.length) {
        throw new Error(
          `Catégorie inconnue dans --only (${unknown.join(', ') || 'liste vide'}). ` +
            `Catégories : ${categoryKeys.join(', ')}.`,
        );
      }
      out.only = new Set(keys);
      continue;
    }
    if (arg.startsWith('--row-batch-size=')) {
      out.rowBatchSize = parsePositiveInt(
        arg.slice('--row-batch-size='.length),
        '--row-batch-size',
        {
          min: 100,
          max: MAX_ROW_BATCH_SIZE,
        },
      );
      continue;
    }
    if (extraParsers.some((parse) => parse(arg, out))) continue;
    throw new Error(`Option inconnue : ${arg.split('=')[0]}.`);
  }
  return out;
}

/**
 * Verrou de base (`GET_LOCK`) : deux purges ne tournent jamais ensemble, même lancées de deux
 * machines ou d'un terminal pendant le cron. Tenu par une connexion dédiée ; un processus tué
 * le libère avec sa connexion.
 * @returns {Promise<{ release: () => Promise<void> } | null>}
 */
async function acquirePurgeLock(pool) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT GET_LOCK(?, 0) AS got', [LOCK_NAME]);
    if (Number(rows?.[0]?.got) !== 1) {
      conn.release();
      return null;
    }
  } catch (err) {
    conn.release();
    throw err;
  }
  return {
    async release() {
      try {
        await conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
      } finally {
        conn.release();
      }
    },
  };
}

/** Accès base par défaut (ceux de `database.js`), injectables pour les tests. */
function defaultDb() {
  const database = require('../../database');
  return {
    queryAll: database.queryAll,
    queryOne: database.queryOne,
    execute: database.execute,
    acquireLock: () => acquirePurgeLock(database.pool),
  };
}

/** Durées et réglages de l'exécution, tels qu'enregistrés au journal (sans `only` en Set). */
function journalOptions(options) {
  const out = {};
  for (const [key, value] of Object.entries(options)) {
    if (['apply', 'flag', 'enabled'].includes(key)) continue;
    out[key] = value instanceof Set ? [...value] : value;
  }
  return out;
}

function exitCodeFor(outcome) {
  if (outcome === 'success') return EXIT_SUCCESS;
  if (outcome === 'blocked') return EXIT_BLOCKED;
  return EXIT_FAILURE;
}

function formatDuration(ms) {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

/**
 * Exécute la purge planifiée.
 * @param {{ argv?: string[], env?: object, db?: object, log?: (line: string) => void,
 *   categories?: Array<{ key: string, label: string, run: Function }>, now?: () => number }} [params]
 * @returns {Promise<{ exitCode: number, outcome: string, mode: string|null, runId: number|null,
 *   counts: Record<string, object> }>}
 */
async function runRetentionPurge(params = {}) {
  const argv = params.argv || [];
  const env = params.env || {};
  const log = params.log || ((line) => process.stdout.write(`${line}\n`));
  const now = params.now || (() => Date.now());
  const categories = params.categories || loadCategories();
  const say = (text) => log(`${LOG_PREFIX} ${text}`);

  let options;
  try {
    options = parseRetentionArgs(argv, env, {
      categoryKeys: categories.map((c) => c.key),
      extraParsers: categories.map((c) => c.parseArg).filter(Boolean),
    });
    for (const category of categories) {
      if (typeof category.prepareOptions === 'function') category.prepareOptions(options, env);
    }
  } catch (err) {
    say(`ÉCHEC : ${sanitizeForOutput(err?.message || err)}`);
    return { exitCode: EXIT_FAILURE, outcome: 'failure', mode: null, runId: null, counts: {} };
  }

  const mode = options.apply ? 'apply' : 'simulation';
  if (options.apply) {
    say('Mode : EXÉCUTION RÉELLE (--apply et RETENTION_PURGE_APPLY=1).');
  } else {
    say('Mode : SIMULATION — rien n’est supprimé ni modifié, seuls des comptages sont affichés.');
    if (options.flag && !options.enabled) {
      say(`--apply est ignoré : ${APPLY_ENV} n’est pas à 1 dans l’environnement.`);
    } else if (!options.flag && options.enabled) {
      say(`${APPLY_ENV}=1, mais sans --apply sur la ligne de commande.`);
    }
  }

  const db = params.db || defaultDb();
  const startedAt = now();
  let lock = null;
  try {
    lock = await db.acquireLock();
  } catch (err) {
    say(`ÉCHEC : verrou de purge indisponible (${sanitizeForOutput(err?.message || err)}).`);
    return { exitCode: EXIT_FAILURE, outcome: 'failure', mode, runId: null, counts: {} };
  }
  if (!lock) {
    say('ÉCHEC : une autre purge est déjà en cours (verrou pris) — rien n’a été fait.');
    return { exitCode: EXIT_FAILURE, outcome: 'failure', mode, runId: null, counts: {} };
  }

  const counts = {};
  let outcome = 'success';
  let errorMessage = null;
  let runId = null;
  try {
    const interrupted = await markInterruptedRuns(db);
    if (interrupted > 0) say(`${interrupted} exécution(s) précédente(s) interrompue(s), reprise.`);
    runId = await startRun(db, { mode, options: journalOptions(options) });

    for (const category of categories) {
      if (!options.only.has(category.key)) continue;
      try {
        const result = await category.run({
          apply: options.apply,
          db,
          options,
          now,
          log: (text) => say(`${category.label} — ${text}`),
        });
        counts[category.key] = result?.counts || {};
        if (result?.blocked && outcome === 'success') outcome = 'blocked';
      } catch (err) {
        const message = sanitizeForOutput(err?.message || err);
        counts[category.key] = { erreur: message.slice(0, 200) };
        outcome = 'failure';
        errorMessage = errorMessage || `${category.key} : ${message}`;
        say(`${category.label} — ÉCHEC : ${message}`);
      }
    }
  } catch (err) {
    outcome = 'failure';
    errorMessage = sanitizeForOutput(err?.message || err);
    say(`ÉCHEC : ${errorMessage}`);
  } finally {
    if (runId != null) {
      try {
        await finishRun(db, runId, {
          outcome,
          counts,
          durationMs: now() - startedAt,
          errorMessage,
        });
      } catch (err) {
        outcome = 'failure';
        say(`ÉCHEC : journal de purge non mis à jour (${sanitizeForOutput(err?.message || err)}).`);
      }
    }
    try {
      await lock.release();
    } catch {
      /* le verrou tombe avec la connexion */
    }
  }

  const verdict = {
    success: 'succès',
    blocked: 'bloquée par un seuil',
    failure: 'ÉCHEC',
  }[outcome];
  say(
    `Terminé en ${formatDuration(now() - startedAt)} — exécution n° ${runId ?? '?'} ` +
      `(${mode === 'apply' ? 'réelle' : 'simulation'}) : ${verdict}.`,
  );
  return { exitCode: exitCodeFor(outcome), outcome, mode, runId, counts };
}

module.exports = {
  APPLY_ENV,
  LOCK_NAME,
  LOG_PREFIX,
  CATEGORY_KEYS,
  DEFAULT_ROW_BATCH_SIZE,
  EXIT_SUCCESS,
  EXIT_FAILURE,
  EXIT_BLOCKED,
  resolveMode,
  parsePositiveInt,
  parseRetentionArgs,
  acquirePurgeLock,
  defaultDb,
  runRetentionPurge,
};
