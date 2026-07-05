const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
if (process.env.TEST_DB_NAME) process.env.DB_NAME = process.env.TEST_DB_NAME;
process.env.NODE_ENV = 'test';
if (!process.env.TEACHER_ADMIN_EMAIL) process.env.TEACHER_ADMIN_EMAIL = 'admin.test@foretmap.local';
if (!process.env.TEACHER_ADMIN_PASSWORD) process.env.TEACHER_ADMIN_PASSWORD = 'admin1234';

// Each test file calls initSchema/initDatabase independently.
// Reset RBAC bootstrap so roles/permissions are reseeded deterministically.
const database = require('../../database');
const rbac = require('../../lib/rbac');

// --- Mémoïsation initSchema par run de suite (audit §7.3, option 2) -----------------------
// Chaque fichier de test est un PROCESSUS séparé : la mémoïsation passe par un fichier
// sentinelle dans os.tmpdir(), scellé par (1) l'empreinte du schéma + des migrations et
// (2) le PID du runner node:test (process.ppid) — un nouveau run repart donc toujours
// d'un initSchema complet. Avant de court-circuiter, on revérifie en BDD que
// schema_version correspond bien à la dernière migration ; au moindre doute (sentinelle
// illisible, hash différent, version BDD inattendue), on retombe sur initSchema normal.
// Désactivable via FORETMAP_TESTS_SCHEMA_MEMO=0.
const fs = require('fs');
const os = require('os');
const nodeCrypto = require('node:crypto');

const schemaMemoEnabled = process.env.FORETMAP_TESTS_SCHEMA_MEMO !== '0';
let cachedSchemaFingerprint = null;

function computeSchemaFingerprint() {
  if (cachedSchemaFingerprint) return cachedSchemaFingerprint;
  const root = path.join(__dirname, '..', '..');
  const hash = nodeCrypto.createHash('sha256');
  hash.update(fs.readFileSync(path.join(root, 'sql', 'schema_foretmap.sql')));
  const migrationsDir = path.join(root, 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .sort();
  for (const file of files) {
    hash.update(file);
    hash.update(fs.readFileSync(path.join(migrationsDir, file)));
  }
  const lastMigration = files.length ? parseInt(files[files.length - 1].slice(0, 3), 10) : -1;
  cachedSchemaFingerprint = { fingerprint: hash.digest('hex'), lastMigration };
  return cachedSchemaFingerprint;
}

function schemaMemoSentinelPath() {
  const dbKey = nodeCrypto
    .createHash('sha1')
    .update(String(process.env.DB_NAME || ''))
    .digest('hex')
    .slice(0, 12);
  return path.join(os.tmpdir(), `foretmap-tests-schema-memo-${dbKey}.json`);
}

/** Vrai si le schéma a déjà été initialisé par CE run (sentinelle + version BDD à jour). */
async function schemaAlreadyInitializedThisRun() {
  if (!schemaMemoEnabled) return false;
  try {
    const sentinel = JSON.parse(fs.readFileSync(schemaMemoSentinelPath(), 'utf8'));
    const { fingerprint, lastMigration } = computeSchemaFingerprint();
    if (sentinel.runnerPid !== process.ppid) return false;
    if (sentinel.fingerprint !== fingerprint) return false;
    if (sentinel.schemaVersion !== lastMigration) return false;
    const row = await database.queryOne('SELECT version FROM schema_version LIMIT 1');
    return !!row && row.version === lastMigration;
  } catch {
    return false; // Doute sur la fraîcheur → initSchema normal.
  }
}

function markSchemaInitializedThisRun() {
  if (!schemaMemoEnabled) return;
  try {
    const { fingerprint, lastMigration } = computeSchemaFingerprint();
    fs.writeFileSync(
      schemaMemoSentinelPath(),
      JSON.stringify({
        runnerPid: process.ppid,
        fingerprint,
        schemaVersion: lastMigration,
      }),
      'utf8',
    );
  } catch {
    // Sentinelle non écrite : les fichiers suivants feront simplement un initSchema complet.
  }
}

if (typeof rbac.resetRbacBootstrapForTests === 'function') {
  const originalInitSchema = database.initSchema.bind(database);
  const originalInitDatabase = database.initDatabase.bind(database);

  database.initSchema = async (...args) => {
    rbac.resetRbacBootstrapForTests();
    let result;
    if (await schemaAlreadyInitializedThisRun()) {
      result = undefined; // Schéma déjà posé par un fichier précédent de ce run.
    } else {
      result = await originalInitSchema(...args);
      markSchemaInitializedThisRun();
    }
    // Middleware /api (SERVICE_NOT_READY) exige initDatabase() ; la plupart des fichiers
    // de test n’appellent que initSchema() — marquer la BDD prête après chaque init.
    await originalInitDatabase(...args);
    if (typeof rbac.repairSystemN3beurParticipationDefaults === 'function') {
      await rbac.repairSystemN3beurParticipationDefaults();
    }
    return result;
  };

  database.initDatabase = async (...args) => {
    rbac.resetRbacBootstrapForTests();
    return originalInitDatabase(...args);
  };
}
