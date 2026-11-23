#!/usr/bin/env node
'use strict';

/**
 * Export du **fixture anonymisé** versionné : `sql/fixtures/foretmap-anonymise.sql.gz`.
 *
 * Objectif : qu'une session éphémère (Claude Code sur le web, Codespace, poste neuf) retrouve
 * la **volumétrie réelle** sans qu'un dump de production circule et sans le réimporter à la
 * main. Le dump brut, lui, n'est jamais versionné (`.gitignore`, règle `CLAUDE.md`).
 *
 * Chaîne complète :
 *   npm run db:import:dump -- --file <dump.sql> --db foretmap_local
 *   npm run db:anonymize              # réécrit les identités, purge, balaye
 *   npm run db:fixture:export         # ce script
 *   npm run db:fixture:load           # dans une autre session
 *
 * Trois garde-fous avant d'écrire quoi que ce soit :
 *   1. la base doit être **locale** et `NODE_ENV` ne doit pas valoir `production` ;
 *   2. le **balayage de l'anonymiseur** doit être propre — un seul motif bloquant et le script
 *      s'arrête sans rien écrire, en nommant la colonne ;
 *   3. contrôle de forme sur `users` : toute adresse hors du domaine d'anonymisation arrête
 *      le script, même si le balayage l'avait tolérée.
 *
 * Reste le cas des adresses **légitimes** que l'anonymiseur tolère (crédit d'illustration
 * Wikimedia, adresse de contact de la page « À propos ») : elles n'ont aucune utilité dans un
 * jeu de test, donc le flux de sortie les neutralise. Le fixture versionné ne contient ainsi
 * **aucune** adresse hors `@exemple.invalid` — ce que `tests/fixture-anonymise.test.js`
 * vérifie à chaque CI, en lisant l'archive telle qu'elle est versionnée.
 *
 * Même logique pour les **noms recopiés** par le jeu Gnomes & Licornes (qui a découvert un
 * feuillet, qui a lancé un sort) : l'anonymiseur réécrit les comptes, pas ces copies. Le flux
 * de sortie les remplace par le pseudonyme du joueur (`joueur<id>`), cf.
 * `scripts/lib/fixturePseudonymes.js` ; `tests/fixture-pseudonymes.test.js` contrôle l'archive.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');
const { StringDecoder } = require('string_decoder');

const { queryAll, queryOne, endPool } = require('../database');
const {
  isLocalDbHost,
  buildScanQuery,
  EMAIL_SQL_REGEXP,
  BCRYPT_SQL_REGEXP,
  RESIDUAL_EXCEPTIONS,
} = require('./anonymize-local-db');
const { creerPseudonymiseurGl } = require('./lib/fixturePseudonymes');

const FIXTURE_PATH = path.join(__dirname, '..', 'sql', 'fixtures', 'foretmap-anonymise.sql.gz');
const ANON_EMAIL_DOMAIN = 'exemple.invalid';
const NEUTRAL_EMAIL = `contact@${ANON_EMAIL_DOMAIN}`;

/** Même forme que le motif SQL, côté JavaScript, pour filtrer le flux de sortie. */
const EMAIL_JS_REGEXP = new RegExp(
  `[A-Za-z0-9._%+-]+@(?!${ANON_EMAIL_DOMAIN.replace(/\./g, '\\.')})[A-Za-z0-9-]+\\.[A-Za-z]{2,}`,
  'g',
);

function parseArgs(argv) {
  const out = { database: process.env.DB_NAME || 'foretmap_local', output: FIXTURE_PATH };
  for (const arg of argv) {
    if (arg.startsWith('--db=')) out.database = arg.slice('--db='.length);
    else if (arg.startsWith('--out=')) out.output = arg.slice('--out='.length);
  }
  return out;
}

/** Nom de l'outil de dump disponible (MariaDB 11 a renommé `mysqldump`). */
function dumpBinary() {
  for (const candidate of ['mariadb-dump', 'mysqldump']) {
    const found = require('child_process').spawnSync('sh', ['-c', `command -v ${candidate}`], {
      encoding: 'utf8',
    });
    if (found.status === 0 && String(found.stdout).trim()) return String(found.stdout).trim();
  }
  return null;
}

/** Rejoue le balayage de l'anonymiseur sur toutes les colonnes texte de la base. */
async function assertAnonymized(database) {
  const rows = await queryAll(
    `SELECT table_name AS t, column_name AS c
       FROM information_schema.columns
      WHERE table_schema = ?
        AND data_type IN ('varchar','char','text','tinytext','mediumtext','longtext')`,
    [database],
  );
  const byTable = new Map();
  for (const row of rows) {
    if (!byTable.has(row.t)) byTable.set(row.t, []);
    byTable.get(row.t).push(row.c);
  }

  const blocking = [];
  for (const [table, columns] of byTable) {
    const params = [];
    for (let i = 0; i < columns.length; i += 1) {
      params.push(EMAIL_SQL_REGEXP, BCRYPT_SQL_REGEXP, '');
      params.push(EMAIL_SQL_REGEXP, BCRYPT_SQL_REGEXP, '');
    }
    let row;
    try {
      row = await queryOne(buildScanQuery(table, columns), params);
    } catch (err) {
      blocking.push({ table, column: '*', detail: err.message });
      continue;
    }
    if (!row) continue;
    for (const column of columns) {
      const count = Number(row[`${column}__bloquant`] || 0);
      // Le hachage d'anonymisation est commun à tous les comptes : il correspond au motif
      // bcrypt sans être un résidu. On ne bloque donc que si `users.password_hash` porte
      // PLUSIEURS valeurs distinctes — un seul hachage partagé est le résultat attendu.
      if (count > 0 && !(table === 'users' && column === 'password_hash')) {
        blocking.push({
          table,
          column,
          count,
          tolerated: RESIDUAL_EXCEPTIONS.has(`${table}.${column}`),
        });
      }
    }
  }
  return blocking.filter((f) => !f.tolerated);
}

/** Contrôle de forme : aucune adresse de compte ne doit sortir du domaine d'anonymisation. */
async function assertAccountsAnonymized() {
  const row = await queryOne(
    `SELECT
       SUM(CASE WHEN email IS NOT NULL AND email NOT LIKE ? THEN 1 ELSE 0 END) AS emails_reels,
       COUNT(DISTINCT password_hash) AS hachages_distincts
     FROM users`,
    [`%@${ANON_EMAIL_DOMAIN}`],
  );
  return {
    emailsReels: Number(row?.emails_reels || 0),
    hachagesDistincts: Number(row?.hachages_distincts || 0),
  };
}

async function volumetrie(database) {
  const rows = await queryAll(
    `SELECT table_name AS t, table_rows AS n
       FROM information_schema.tables
      WHERE table_schema = ? AND table_type = 'BASE TABLE'
      ORDER BY table_rows DESC
      LIMIT 8`,
    [database],
  );
  return rows.map((r) => `${r.t}~${r.n}`).join(', ');
}

/**
 * Flux de sortie de l'export : consignes SQL en tête et en pied, neutralisation des adresses
 * tolérées, pseudonymisation des noms recopiés par le jeu. Exporté pour les tests, qui y font
 * passer un faux dump découpé en morceaux arbitraires.
 */
function creerFluxSortie() {
  let neutralisees = 0;
  let premierMorceau = true;
  // Traitement ligne à ligne : un morceau du flux peut couper une ligne d'INSERT en deux, et
  // la pseudonymisation des tables du jeu a besoin de la ligne entière pour lire ses valeurs.
  let resteLigne = '';
  // Un caractère multioctet peut aussi tomber à cheval sur deux morceaux.
  const decodeur = new StringDecoder('utf8');
  const pseudonymiseur = creerPseudonymiseurGl();
  const traiterLignes = (lignes) =>
    lignes
      .map((l) => pseudonymiseur.ligne(l))
      .join('\n')
      .replace(EMAIL_JS_REGEXP, () => {
        neutralisees += 1;
        return NEUTRAL_EMAIL;
      });
  const flux = new Transform({
    transform(chunk, _enc, done) {
      let texte = decodeur.write(chunk);
      if (premierMorceau) {
        premierMorceau = false;
        // 1. La ligne « sandbox mode » est une extension MariaDB que les analyseurs stricts
        //    (dont `splitSqlStatements`) ne savent pas lire.
        texte = texte.replace(/^\/\*M!\d+\\?-[^\n]*\n/, '');
        // 2. `mariadb-dump` désactive bien les clés étrangères, mais dans un commentaire
        //    versionné `/*!40014 … */` que l'importeur du dépôt ne rejoue pas : les tables
        //    sortent par ordre alphabétique, donc `audit_log` est créée avant `users` et la
        //    contrainte échoue. On pose donc les consignes en SQL ordinaire.
        texte = `SET FOREIGN_KEY_CHECKS=0;\nSET UNIQUE_CHECKS=0;\n${texte}`;
      }
      const lignes = (resteLigne + texte).split('\n');
      resteLigne = lignes.pop();
      done(null, lignes.length ? `${traiterLignes(lignes)}\n` : '');
    },
    flush(done) {
      done(
        null,
        `${traiterLignes([resteLigne + decodeur.end()])}\nSET FOREIGN_KEY_CHECKS=1;\nSET UNIQUE_CHECKS=1;\n`,
      );
    },
  });

  return {
    flux,
    compteurs: () => ({ neutralisees, pseudonymises: pseudonymiseur.stats.modifies }),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (String(process.env.NODE_ENV) === 'production') {
    console.error('Refus : NODE_ENV=production.');
    process.exitCode = 1;
    return;
  }
  if (!isLocalDbHost(process.env.DB_HOST)) {
    console.error(`Refus : DB_HOST=${process.env.DB_HOST} n’est pas local.`);
    process.exitCode = 1;
    return;
  }

  const binary = dumpBinary();
  if (!binary) {
    console.error('Refus : ni `mariadb-dump` ni `mysqldump` disponibles.');
    process.exitCode = 1;
    return;
  }

  console.log(`Contrôle d’anonymisation sur « ${options.database} »…`);
  const residus = await assertAnonymized(options.database);
  if (residus.length > 0) {
    console.error('Refus : la base n’est pas anonymisée. Motifs encore présents :');
    for (const r of residus) {
      console.error(`  ${r.table}.${r.column} : ${r.detail || `${r.count} ligne(s)`}`);
    }
    console.error('Lancer `npm run db:anonymize` avant d’exporter.');
    process.exitCode = 1;
    return;
  }

  const comptes = await assertAccountsAnonymized();
  if (comptes.emailsReels > 0) {
    console.error(
      `Refus : ${comptes.emailsReels} adresse(s) de compte hors du domaine d’anonymisation.`,
    );
    process.exitCode = 1;
    return;
  }
  if (comptes.hachagesDistincts > 1) {
    console.error(
      `Refus : ${comptes.hachagesDistincts} hachages distincts dans users.password_hash — l’anonymisation attend un mot de passe unique.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Volumétrie (estimations) : ${await volumetrie(options.database)}`);

  fs.mkdirSync(path.dirname(options.output), { recursive: true });

  const args = [
    `--host=${process.env.DB_HOST || '127.0.0.1'}`,
    `--port=${process.env.DB_PORT || '3306'}`,
    `--user=${process.env.DB_USER || 'root'}`,
    '--single-transaction',
    '--no-tablespaces',
    // Sans `--skip-dump-date`, chaque export change d'une ligne (l'horodatage) et produit un
    // diff de 1,4 Mo pour rien.
    '--skip-dump-date',
    '--default-character-set=utf8mb4',
    options.database,
  ];
  const env = { ...process.env };
  if (process.env.DB_PASS) env.MYSQL_PWD = process.env.DB_PASS;

  const sortie = creerFluxSortie();

  const enfant = spawn(binary, args, { env, stdio: ['ignore', 'pipe', 'inherit'] });
  // Le listener est posé AVANT d'attendre le flux : `close` est émis une seule fois, et sur un
  // dump rapide il peut l'être avant la fin de `pipeline`. S'abonner après laisserait la
  // promesse en suspens pour toujours — le script écrivait alors le fichier puis restait
  // suspendu, sans rien dire.
  const fin = new Promise((resolve) => enfant.on('close', resolve));
  await pipeline(
    enfant.stdout,
    sortie.flux,
    zlib.createGzip({ level: 9 }),
    fs.createWriteStream(options.output),
  );
  const code = await fin;
  if (code !== 0) {
    console.error(`Refus : ${path.basename(binary)} a terminé en code ${code}.`);
    fs.rmSync(options.output, { force: true });
    process.exitCode = 1;
    return;
  }

  const taille = fs.statSync(options.output).size;
  console.log(
    `\nFixture écrit : ${path.relative(process.cwd(), options.output)} (${(taille / 1048576).toFixed(2)} Mo)`,
  );
  const { neutralisees, pseudonymises } = sortie.compteurs();
  if (neutralisees > 0) {
    console.log(
      `${neutralisees} adresse(s) tolérée(s) neutralisée(s) dans le flux (crédit d’illustration, contact éditorial) → ${NEUTRAL_EMAIL}.`,
    );
  }
  if (pseudonymises > 0) {
    console.log(
      `${pseudonymises} nom(s) recopié(s) dans des tables du jeu pseudonymisé(s) → joueur<id>.`,
    );
  }
  console.log('Chargement dans une autre session : `npm run db:fixture:load`.');
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await endPool().catch(() => {});
      // Sortie explicite, comme `db:init` : le pool mysql2 suffit à garder la boucle
      // d'évènements ouverte, et le script resterait suspendu après avoir tout écrit.
      process.exit(process.exitCode || 0);
    });
}

module.exports = {
  FIXTURE_PATH,
  ANON_EMAIL_DOMAIN,
  NEUTRAL_EMAIL,
  EMAIL_JS_REGEXP,
  parseArgs,
  creerFluxSortie,
};
