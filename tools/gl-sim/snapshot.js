'use strict';

/**
 * Instantané de **contenu** d'une base locale pour le banc « Tenir à deux » :
 * `npm run gl:sim:snapshot -- --from-db <nom> [--out <fichier>]`.
 *
 * Tables de contenu seulement (liste blanche `CONTENT_TABLES`) : chapitres, cases, biomes,
 * catégories et questions QCM, feuillets, plateaux du lore, espèces, sorts, rattachements de
 * sorts, liens ressource ↔ question. **Aucune table de personnes, de parties, de joueurs ni de
 * classes** ; une colonne nominative (e-mail, mot de passe, prénom, nom, pseudo…) fait refuser
 * l'export. Les tables absentes de la base source sont ignorées (rapportées).
 *
 * Format : `{ format: 'gl-sim-contenu v1', source: { db, exportedAt, migration },
 *             tables: { <table>: { columns: [...], rows: [[...], ...] } } }`.
 */

const fs = require('node:fs');
const path = require('node:path');

const FORMAT = 'gl-sim-contenu v1';

const CONTENT_TABLES = Object.freeze([
  'gl_chapters',
  'gl_chapter_markers',
  'gl_chapter_biomes',
  'gl_biomes',
  'gl_qcm_categories',
  'gl_qcm_questions',
  'gl_lore_feuillets',
  'gl_lore_plateaux',
  'gl_species',
  'gl_spell_categories',
  'gl_spells',
  'gl_chapter_spells',
  'gl_resource_question_links',
]);

/** Tables qui ne doivent **jamais** figurer dans un instantané (personnes, parties, classes). */
const TABLES_INTERDITES_RE =
  /^(users|gl_players|gl_admins|gl_classes|gl_games|gl_teams|gl_team_members|gl_game_|gl_player_|gl_market_|gl_spell_cast|password_|audit_|students|teachers|gl_forum_)/i;

/** Colonnes nominatives : un instantané qui en porte une est refusé. */
/** Colonnes retirées de l'export (identifiants de comptes, aucun usage pour le banc). */
const COLONNES_EXCLUES = new Set([
  'created_by_user_type',
  'created_by_user_id',
  'created_by',
  'updated_by',
]);

const COLONNES_NOMINATIVES_RE =
  /^(email|e_mail|mail|password|password_hash|pwd|first_name|last_name|prenom|nom_eleve|pseudo|display_name|phone|telephone|adresse|address|ip|totp_secret|token)$/i;

const DEFAULT_OUT_DIR = path.join(__dirname, '..', '..', 'data', 'gl', 'sim');

function defaultOutFile(date = new Date()) {
  const d = date.toISOString().slice(0, 10);
  return path.join(DEFAULT_OUT_DIR, `contenu-prod-${d}.json`);
}

/**
 * Vérifie qu'un instantané ne porte ni table interdite ni colonne nominative (pur).
 * @returns {{ ok: boolean, erreurs: string[] }}
 */
function verifierSnapshotSansNominatif(snapshot) {
  const erreurs = [];
  if (!snapshot || snapshot.format !== FORMAT) erreurs.push(`format attendu « ${FORMAT} »`);
  const tables = snapshot?.tables && typeof snapshot.tables === 'object' ? snapshot.tables : {};
  for (const [table, spec] of Object.entries(tables)) {
    if (!CONTENT_TABLES.includes(table)) erreurs.push(`table hors liste blanche : ${table}`);
    if (TABLES_INTERDITES_RE.test(table)) erreurs.push(`table interdite : ${table}`);
    const cols = Array.isArray(spec?.columns) ? spec.columns : [];
    for (const c of cols) {
      if (COLONNES_NOMINATIVES_RE.test(String(c))) {
        erreurs.push(`colonne nominative : ${table}.${c}`);
      }
    }
    if (!Array.isArray(spec?.rows)) erreurs.push(`${table} : rows[] attendu`);
  }
  return { ok: erreurs.length === 0, erreurs };
}

/**
 * Exporte les tables de contenu d'une connexion mysql2 (`conn.query`) vers un objet instantané.
 * @param {{ query: Function }} conn connexion mysql2/promise ouverte sur `dbName`
 * @param {string} dbName
 */
async function exporterSnapshot(conn, dbName) {
  const [versionRows] = await conn.query('SELECT version FROM schema_version LIMIT 1');
  const migration = versionRows?.[0]?.version != null ? Number(versionRows[0].version) : null;
  const tables = {};
  const absentes = [];
  for (const table of CONTENT_TABLES) {
    const [cols] = await conn.query(
      'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
      [dbName, table],
    );
    // Colonnes d'auteur (identifiant d'un compte du personnel) : hors de l'instantané, le banc
    // n'en a pas besoin et aucune donnée de personne ne doit y entrer.
    const columns = cols.map((c) => String(c.COLUMN_NAME)).filter((c) => !COLONNES_EXCLUES.has(c));
    if (!columns.length) {
      absentes.push(table);
      continue;
    }
    const nominative = columns.find((c) => COLONNES_NOMINATIVES_RE.test(c));
    if (nominative) {
      throw new Error(`Refus d'exporter ${table} : colonne nominative « ${nominative} »`);
    }
    const [rows] = await conn.query(
      `SELECT ${columns.map((c) => `\`${c}\``).join(', ')} FROM \`${table}\``,
    );
    tables[table] = {
      columns,
      rows: rows.map((r) => columns.map((c) => normaliserValeur(r[c]))),
    };
  }
  const snapshot = {
    format: FORMAT,
    source: {
      db: dbName,
      exportedAt: new Date().toISOString(),
      migration,
      tablesAbsentes: absentes,
    },
    tables,
  };
  const check = verifierSnapshotSansNominatif(snapshot);
  if (!check.ok) throw new Error(`Instantané refusé : ${check.erreurs.join(' ; ')}`);
  return snapshot;
}

/** Dates → ISO, Buffer → base64 (préfixé), le reste tel quel (JSON). */
function normaliserValeur(v) {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (Buffer.isBuffer(v)) return `base64:${v.toString('base64')}`;
  if (typeof v === 'bigint') return Number(v);
  return v;
}

function parseArgs(argv) {
  const out = { fromDb: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--from-db') out.fromDb = argv[++i];
    else if (a.startsWith('--from-db=')) out.fromDb = a.slice('--from-db='.length);
    else if (a === '--out') out.out = argv[++i];
    else if (a.startsWith('--out=')) out.out = a.slice('--out='.length);
  }
  return out;
}

async function main() {
  require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
  const args = parseArgs(process.argv.slice(2));
  if (!args.fromDb) {
    console.error('Usage : npm run gl:sim:snapshot -- --from-db <nom> [--out <fichier>]');
    process.exit(2);
  }
  if (/prod/i.test(args.fromDb) && !/_sim$|_test$|_local$/.test(args.fromDb)) {
    // Un instantané se prend sur une COPIE locale, jamais sur la base de production.
    console.error(`Refus : « ${args.fromDb} » ressemble à une base de production.`);
    process.exit(2);
  }
  const mysql = require('mysql2/promise');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: args.fromDb,
    charset: 'utf8mb4',
  });
  try {
    const snapshot = await exporterSnapshot(conn, args.fromDb);
    const file = path.resolve(args.out || defaultOutFile());
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(snapshot));
    const counts = Object.fromEntries(
      Object.entries(snapshot.tables).map(([t, s]) => [t, s.rows.length]),
    );
    console.log(`Instantané écrit : ${file}`);
    console.log(`Source ${args.fromDb} (migration ${snapshot.source.migration})`);
    console.log(JSON.stringify(counts, null, 2));
    if (snapshot.source.tablesAbsentes.length) {
      console.log(`Tables absentes de la source : ${snapshot.source.tablesAbsentes.join(', ')}`);
    }
  } finally {
    await conn.end();
  }
}

module.exports = {
  FORMAT,
  CONTENT_TABLES,
  TABLES_INTERDITES_RE,
  COLONNES_NOMINATIVES_RE,
  DEFAULT_OUT_DIR,
  defaultOutFile,
  verifierSnapshotSansNominatif,
  exporterSnapshot,
  normaliserValeur,
  parseArgs,
};

if (require.main === module) {
  main().catch((err) => {
    console.error('[gl-sim:snapshot] erreur :', err.message || err);
    process.exit(1);
  });
}
