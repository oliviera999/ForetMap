'use strict';

/**
 * Synchronisation des catalogues « Tenir à deux » (`data/gl/tenir/*.json`) avec la base.
 *
 * Constat de la simulation du 7 novembre 2026 : les fichiers étaient dans le dépôt depuis la
 * PR #638, mais rien ne les chargeait en prod (ni migration, ni tâche cPanel, ni bouton).
 * Désormais, au démarrage (après `initSchema`) :
 * - empreinte SHA-256 de chaque fichier, mémorisée dans `gl_settings`
 *   (`content.tenir_catalogues_hash` : `{ "<fichier>": "<sha256>" }`) ;
 * - si une empreinte diffère, import **tolérant** du fichier (`lib/glTenirImport.js`), puis
 *   rapport dans les logs (`gl.tenir.sync`, comptes seulement) et dans
 *   `content.tenir_catalogues_report` ;
 * - jamais d'état de partie touché (les chargeurs n'écrivent aucune table `gl_game_*`) ;
 * - non bloquant : une erreur est journalisée, le serveur démarre ;
 * - désactivable : `GL_TENIR_SYNC=0` ; en `NODE_ENV=test`, elle ne tourne que si
 *   `GL_TENIR_SYNC=1` (les suites chargent le jeu d'exemple elles-mêmes).
 *
 * `POST /api/gl/admin/tenir/catalogues/sync` rejoue la même fonction (`force`, `dryRun`,
 * `fichier`) depuis l'écran Contenus → Chapitres.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const logger = require('./logger');
const { IMPORTERS, IMPORT_ORDER, IMPORT_TABLES } = require('./glTenirImport');

const HASH_KEY = 'content.tenir_catalogues_hash';
const REPORT_KEY = 'content.tenir_catalogues_report';
const DEFAULT_DIR = path.join(__dirname, '..', 'data', 'gl', 'tenir');
const MAX_MESSAGES = 30;

function isDisabledByEnv() {
  const flag = String(process.env.GL_TENIR_SYNC || '').trim();
  if (flag === '0') return true;
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'test' && flag !== '1') return true;
  return false;
}

function fileOf(dossier, name) {
  return path.join(dossier, `${name}.json`);
}

/** Empreinte SHA-256 (hex) d'un fichier, `null` s'il est absent. */
function hashFile(file) {
  if (!fs.existsSync(file)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** Empreintes du dépôt : `{ "<fichier>": "<sha256>" | null }`. */
function hashRepoCatalogues(dossier = DEFAULT_DIR) {
  const out = {};
  for (const name of IMPORT_ORDER) out[name] = hashFile(fileOf(dossier, name));
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function readSettingJson(db, key, fallback) {
  const row = await db.queryOne('SELECT value_json FROM gl_settings WHERE `key` = ? LIMIT 1', [
    key,
  ]);
  if (!row || row.value_json == null) return fallback;
  try {
    const parsed = JSON.parse(String(row.value_json));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

async function writeSettingJson(db, key, value) {
  await db.execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_by, updated_at) VALUES (?, ?, NULL, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
    [key, JSON.stringify(value)],
  );
  try {
    require('./glSettings').invalidateGameplayCache();
  } catch (_) {
    /* registre sans cache (tests avec base factice) */
  }
}

/** Empreintes mémorisées en base. */
async function readStoredHashes(db) {
  return readSettingJson(db, HASH_KEY, {});
}

/** Dernier rapport de synchronisation, ou `null`. */
async function readLastReport(db) {
  const report = await readSettingJson(db, REPORT_KEY, null);
  return report && typeof report === 'object' && Object.keys(report).length ? report : null;
}

/** Rapport compact d'un chargeur (comptes + messages tronqués, aucune donnée d'élève). */
function compactReport(rep) {
  return {
    fichier: rep.fichier,
    count: Number(rep.count) || 0,
    upserted: Number(rep.upserted) || 0,
    desactives: Number(rep.desactives) || 0,
    ecartees: Number(rep.ecartees) || 0,
    refuse: rep.refuse === true,
    errors: (rep.errors || []).slice(0, MAX_MESSAGES),
    warnings: (rep.warnings || []).slice(0, MAX_MESSAGES),
    errorsTotal: (rep.errors || []).length,
    warningsTotal: (rep.warnings || []).length,
  };
}

/**
 * Synchronise les catalogues dont l'empreinte diffère (ou tous avec `force`).
 *
 * @param {object} db `{ queryAll, queryOne, execute }` (module database ou transaction)
 * @param {object} [opts]
 * @param {boolean} [opts.force] ignore les empreintes mémorisées
 * @param {boolean} [opts.dryRun] valide sans écrire (les empreintes ne sont pas mémorisées)
 * @param {string|null} [opts.fichier] un seul fichier (`IMPORT_ORDER`), sinon tous
 * @param {string} [opts.dossier]
 * @returns {Promise<{ skipped: boolean, reason?: string, files: Array, at: string }>}
 */
async function syncTenirCatalogues(
  db,
  { force = false, dryRun = false, fichier = null, dossier = DEFAULT_DIR } = {},
) {
  const at = new Date().toISOString();
  const names = fichier ? [fichier] : IMPORT_ORDER;
  for (const name of names) if (!IMPORTERS[name]) throw new Error(`Fichier inconnu : ${name}`);
  const stored = await readStoredHashes(db);
  const repo = hashRepoCatalogues(dossier);
  const titres = fs.existsSync(fileOf(dossier, 'titres'))
    ? readJson(fileOf(dossier, 'titres'))
    : null;
  const zones = fs.existsSync(fileOf(dossier, 'chasse-zones'))
    ? readJson(fileOf(dossier, 'chasse-zones'))
    : null;
  const files = [];
  const nextHashes = { ...stored };
  for (const name of names) {
    const hash = repo[name];
    if (!hash) {
      files.push({ fichier: name, status: 'absent' });
      continue;
    }
    if (!force && stored[name] === hash) {
      files.push({ fichier: name, status: 'a_jour' });
      continue;
    }
    const rep = await IMPORTERS[name](db, readJson(fileOf(dossier, name)), {
      dryRun,
      strict: false,
      titres,
      zones,
    });
    const compact = compactReport(rep);
    const status = rep.refuse ? 'refuse' : dryRun ? 'dry_run' : 'synchronise';
    files.push({ ...compact, status, hash });
    if (!dryRun && !rep.refuse) nextHashes[name] = hash;
  }
  const result = { skipped: false, at, dryRun: !!dryRun, force: !!force, files };
  if (!dryRun) {
    await writeSettingJson(db, HASH_KEY, nextHashes);
    if (files.some((f) => f.status === 'synchronise' || f.status === 'refuse')) {
      await writeSettingJson(db, REPORT_KEY, result);
    }
  }
  return result;
}

/**
 * Appel du démarrage : non bloquant, désactivable, journal en comptes seulement.
 * @returns {Promise<object|null>} résultat, ou `null` si sautée / en échec
 */
async function syncTenirCataloguesAtStartup(db, opts = {}) {
  if (isDisabledByEnv()) return null;
  try {
    const result = await syncTenirCatalogues(db, opts);
    const touched = result.files.filter((f) => f.status === 'synchronise' || f.status === 'refuse');
    if (touched.length) {
      logger.info(
        {
          msg: 'gl.tenir.sync',
          files: touched.map((f) => ({
            fichier: f.fichier,
            status: f.status,
            count: f.count,
            upserted: f.upserted,
            desactives: f.desactives,
            ecartees: f.ecartees,
            errors: f.errorsTotal,
            warnings: f.warningsTotal,
          })),
        },
        'Catalogues « Tenir à deux » synchronisés',
      );
    } else {
      logger.debug({ msg: 'gl.tenir.sync', files: 0 }, 'Catalogues « Tenir à deux » à jour');
    }
    return result;
  } catch (err) {
    logger.warn({ msg: 'gl.tenir.sync', err }, 'Synchronisation des catalogues Tenir ignorée');
    return null;
  }
}

/** Comptes par table alimentée (lignes actives), pour l'écran d'administration. */
async function countCatalogueRows(db) {
  const out = {};
  for (const name of IMPORT_ORDER) {
    const spec = IMPORT_TABLES[name];
    if (!spec) {
      out[name] = null;
      continue;
    }
    try {
      const row = await db.queryOne(`SELECT COUNT(*) AS c FROM ${spec.table} WHERE ${spec.where}`);
      out[name] = Number(row?.c) || 0;
    } catch (_) {
      out[name] = null;
    }
  }
  return out;
}

/** Vue d'administration : comptes, empreintes dépôt / base, écart, dernier rapport. */
async function describeTenirCatalogues(db, { dossier = DEFAULT_DIR } = {}) {
  const [stored, counts, rapport] = await Promise.all([
    readStoredHashes(db),
    countCatalogueRows(db),
    readLastReport(db),
  ]);
  const repo = hashRepoCatalogues(dossier);
  const fichiers = IMPORT_ORDER.map((name) => ({
    fichier: name,
    table: IMPORT_TABLES[name]?.table || null,
    count: counts[name],
    hashDepot: repo[name] ? repo[name].slice(0, 12) : null,
    hashBase: stored[name] ? String(stored[name]).slice(0, 12) : null,
    present: !!repo[name],
    aJour: !!repo[name] && stored[name] === repo[name],
  }));
  return {
    fichiers,
    ecarts: fichiers.filter((f) => f.present && !f.aJour).map((f) => f.fichier),
    rapport,
    syncDesactivee: isDisabledByEnv(),
  };
}

module.exports = {
  HASH_KEY,
  REPORT_KEY,
  DEFAULT_DIR,
  isDisabledByEnv,
  hashFile,
  hashRepoCatalogues,
  readStoredHashes,
  readLastReport,
  compactReport,
  syncTenirCatalogues,
  syncTenirCataloguesAtStartup,
  countCatalogueRows,
  describeTenirCatalogues,
};
