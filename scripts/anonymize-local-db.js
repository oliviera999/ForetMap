#!/usr/bin/env node
'use strict';

/**
 * Anonymisation d'une base **locale** importée depuis un dump de production.
 *
 * Objectif : disposer en développement / en session éphémère d'une base à la **volumétrie
 * réelle** (listes longues, réseaux trophiques denses, journaux fournis) sans conserver la
 * moindre donnée personnelle — le dump lui-même n'est jamais versionné (`.gitignore`).
 *
 * Usage :
 *   npm run db:import:dump -- --file /chemin/dump.sql   # importe (base DB_NAME courante)
 *   npm run db:anonymize:dry                            # simulation, aucune écriture
 *   npm run db:anonymize                                # applique + contrôle des résidus
 *   npm run db:seed:teacher                             # recrée un compte prof exploitable
 *
 * Garde-fous :
 *   - refus si `DB_HOST` n'est pas local (127.0.0.1 / localhost / ::1) ;
 *   - refus si `NODE_ENV=production` ;
 *   - simulation par défaut — il faut `--apply` pour écrire ;
 *   - après écriture, un **balayage de toutes les colonnes texte** cherche les e-mails et les
 *     hachages bcrypt résiduels et fait échouer la commande s'il en reste.
 *
 * Options :
 *   --apply                 écrit réellement (défaut : --dry-run)
 *   --keep-text             conserve les contenus libres (forum, journaux, observations)
 *                           au lieu de les remplacer par un texte de même longueur
 *   --password=<mdp>        mot de passe unique attribué à tous les comptes (défaut : motdepasse)
 *   --allow-residual        n'échoue pas si le balayage final trouve encore des motifs
 *   --scan-only             ne fait que le balayage (diagnostic d'un dump déjà importé)
 *
 * Ce que le script **ne peut pas** faire : les fichiers déposés (photos d'élèves sous
 * `uploads/`) ne font pas partie d'un dump SQL — ils ne doivent tout simplement pas être
 * copiés. Les contenus libres conservés avec `--keep-text` peuvent contenir des prénoms
 * écrits par les élèves : ne l'utiliser que sur un poste de développement.
 */

require('dotenv').config();

const bcrypt = require('bcryptjs');
const { queryAll, queryOne, execute, endPool } = require('../database');

const LOCAL_DB_HOSTS = new Set(['', '127.0.0.1', 'localhost', '::1']);

/** Domaine réservé par la RFC 2606 : aucune adresse n'y est délivrable. */
const ANON_EMAIL_DOMAIN = 'exemple.invalid';

/**
 * Motifs recherchés par le balayage final. `REGEXP` s'appuie sur PCRE côté MariaDB :
 * l'anticipation négative exclut les adresses **déjà anonymisées** sans masquer une adresse
 * réelle présente dans la même valeur (un message qui citerait les deux reste signalé).
 */
const EMAIL_SQL_REGEXP = `[[:alnum:]._%+-]+@(?!${ANON_EMAIL_DOMAIN.replace(/\./g, '\\.')})[[:alnum:]-]+[.][[:alpha:]]{2,}`;
const BCRYPT_SQL_REGEXP = '[$]2[aby][$][0-9]{2}[$]';

/**
 * Colonnes d'identité, par table. Chaque valeur est une expression SQL évaluée côté serveur,
 * dans laquelle `{{hash}}` est remplacé par le hachage bcrypt calculé une fois pour toutes.
 *
 * Toutes les expressions préservent `NULL` : une colonne vide doit le rester, sans quoi on
 * fausse les tests qui distinguent « pas de pseudo » de « pseudo vide ».
 */
const IDENTITY_PLAN = [
  {
    table: 'users',
    columns: {
      email: `CASE WHEN email IS NULL THEN NULL ELSE CONCAT('u', id, '@${ANON_EMAIL_DOMAIN}') END`,
      pseudo: `CASE WHEN pseudo IS NULL THEN NULL ELSE CONCAT('u', id) END`,
      first_name: `CASE WHEN first_name IS NULL THEN NULL ELSE CONCAT('Prenom', id) END`,
      last_name: `CASE WHEN last_name IS NULL THEN NULL ELSE CONCAT('Nom', id) END`,
      display_name: `CASE WHEN display_name IS NULL THEN NULL ELSE CONCAT('Utilisateur ', id) END`,
      description: 'NULL',
      password_hash: `CASE WHEN password_hash IS NULL THEN NULL ELSE '{{hash}}' END`,
      google_sub: 'NULL',
    },
  },
  {
    table: 'gl_players',
    columns: {
      pseudo: `CASE WHEN pseudo IS NULL THEN NULL ELSE CONCAT('joueur', id) END`,
      first_name: `CASE WHEN first_name IS NULL THEN NULL ELSE CONCAT('Prenom', id) END`,
      last_name: `CASE WHEN last_name IS NULL THEN NULL ELSE CONCAT('Nom', id) END`,
      legacy_email: `CASE WHEN legacy_email IS NULL THEN NULL ELSE CONCAT('gl', id, '@${ANON_EMAIL_DOMAIN}') END`,
      legacy_password_hash: 'NULL',
    },
  },
  {
    table: 'gl_admins',
    columns: {
      email: `CASE WHEN email IS NULL THEN NULL ELSE CONCAT('mj', id, '@${ANON_EMAIL_DOMAIN}') END`,
      display_name: `CASE WHEN display_name IS NULL THEN NULL ELSE CONCAT('MJ ', id) END`,
    },
  },
  {
    table: 'external_identities',
    columns: {
      external_id: `CASE WHEN external_id IS NULL THEN NULL ELSE CONCAT('ext', id) END`,
      external_idnumber: `CASE WHEN external_idnumber IS NULL THEN NULL ELSE CONCAT('idn', id) END`,
      external_username: `CASE WHEN external_username IS NULL THEN NULL ELSE CONCAT('login', id) END`,
    },
  },
  // Noms dénormalisés : recopiés au moment de l'affectation, ils survivent à l'anonymisation
  // de `users` si on les oublie.
  {
    table: 'task_assignments',
    columns: {
      student_first_name: `CASE WHEN student_first_name IS NULL THEN NULL ELSE CONCAT('Prenom', COALESCE(student_id, id)) END`,
      student_last_name: `CASE WHEN student_last_name IS NULL THEN NULL ELSE CONCAT('Nom', COALESCE(student_id, id)) END`,
    },
  },
  {
    table: 'task_logs',
    columns: {
      student_first_name: `CASE WHEN student_first_name IS NULL THEN NULL ELSE CONCAT('Prenom', COALESCE(student_id, id)) END`,
      student_last_name: `CASE WHEN student_last_name IS NULL THEN NULL ELSE CONCAT('Nom', COALESCE(student_id, id)) END`,
    },
  },
  {
    table: 'security_events',
    columns: {
      ip_address: `CASE WHEN ip_address IS NULL THEN NULL ELSE '0.0.0.0' END`,
      // Charge utile d'un évènement de sécurité : e-mail tenté, identifiant, agent… La ligne
      // garde sa valeur statistique une fois la charge vidée.
      payload_json: 'NULL',
    },
  },
  {
    // Rapports de synchronisation Moodle : listes nominatives (identifiants, e-mails, cohortes).
    table: 'sync_runs',
    columns: { report_json: 'NULL' },
  },
  {
    // Détail action par action d'une synchronisation Moodle : `before_json` / `after_json`
    // portent l'état nominatif du compte concerné. La ligne (type d'action, horodatage) est
    // conservée — c'est elle qui a une valeur pour rejouer un écran d'historique.
    table: 'sync_actions',
    columns: { before_json: 'NULL', after_json: 'NULL' },
  },
];

/**
 * Colonnes où un motif « e-mail » est **légitime** et n'a rien de personnel. La valeur est
 * la condition SQL qui décrit les lignes tolérées : elles sont comptées à part et ne font pas
 * échouer la commande, tout ce qui sort de cette condition reste bloquant.
 *
 * `app_settings` illustre l'intérêt d'une condition plutôt que d'une colonne entière : le
 * corps éditorial de la page « À propos » contient une adresse de contact publiée sur le site,
 * mais un e-mail qui apparaîtrait dans un réglage technique (SMTP, alertes) doit continuer de
 * faire échouer le contrôle.
 */
const RESIDUAL_EXCEPTIONS = new Map([
  ['plants.photo_credit', 'TRUE'],
  ['gl_species.photo_credit', 'TRUE'],
  ['app_settings.value_json', "`key` LIKE 'content.%'"],
]);

/**
 * Tables purgées : jetons, journaux d'audit et cookies de visite ne portent aucune valeur
 * pour un test et concentrent des données sensibles (adresses, charges utiles JSON).
 */
const PURGE_TABLES = [
  'password_reset_tokens',
  'visit_seen_anonymous',
  'audit_log',
  'gl_player_journal_imports',
  'user_journal_imports',
];

/**
 * Contenus libres : remplacés par un texte de **même longueur**, pour conserver le poids des
 * réponses API et donc la valeur des mesures de charge.
 */
const TEXT_PLAN = [
  { table: 'forum_posts', columns: ['body'] },
  { table: 'forum_threads', columns: ['title'] },
  { table: 'context_comments', columns: ['body'] },
  { table: 'gl_forum_posts', columns: ['body'] },
  { table: 'gl_forum_threads', columns: ['title'] },
  { table: 'gl_market_trade_messages', columns: ['body'] },
  { table: 'user_journal_articles', columns: ['title', 'body_markdown'] },
  { table: 'gl_player_journal_articles', columns: ['title', 'body_markdown'] },
  { table: 'observation_logs', columns: ['content'] },
  // Compléments réservés saisis par un prof sur une zone ou un repère : texte libre, donc
  // susceptible de nommer un élève ou de porter un contact. Depuis la migration 263 ils
  // vivent dans `location_notes` (les colonnes `restricted_note` sont retirées au démarrage
  // par `lib/legacySchemaCleanup.js`) ; les quatre entrées historiques restent listées pour
  // un dump antérieur à la migration, où les colonnes existent encore.
  { table: 'location_notes', columns: ['title', 'body'] },
  { table: 'zones', columns: ['restricted_note'] },
  { table: 'visit_zones', columns: ['restricted_note'] },
  { table: 'map_markers', columns: ['restricted_note'] },
  { table: 'visit_markers', columns: ['restricted_note'] },
  // Intitulés et consignes saisis par les profs. Le balayage e-mail/bcrypt ne les voyait pas,
  // et la base réelle en contenait au moins un qui nomme une personne (« Pailler les tomates
  // de monsieur blanc »). Un nom propre dans un texte libre ne se détecte pas de façon fiable :
  // ces colonnes sont donc remplacées par principe, pas sur signalement.
  { table: 'tasks', columns: ['title', 'description'] },
  { table: 'projects', columns: ['name', 'description'] },
  { table: 'zones', columns: ['name', 'description'] },
  { table: 'visit_zones', columns: ['name', 'description'] },
  { table: 'map_markers', columns: ['label', 'note'] },
  { table: 'visit_markers', columns: ['label', 'note'] },
  { table: 'groups', columns: ['description'] },
];

function parseArgs(argv) {
  const out = {
    dryRun: true,
    keepText: false,
    password: 'motdepasse',
    allowResidual: false,
    scanOnly: false,
  };
  for (const a of argv) {
    if (a === '--apply') out.dryRun = false;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--keep-text') out.keepText = true;
    else if (a === '--allow-residual') out.allowResidual = true;
    else if (a === '--scan-only') out.scanOnly = true;
    else if (a.startsWith('--password=')) out.password = a.slice('--password='.length);
  }
  return out;
}

function isLocalDbHost(host) {
  return LOCAL_DB_HOSTS.has(
    String(host || '')
      .trim()
      .toLowerCase(),
  );
}

function quoteIdent(name) {
  if (!/^[A-Za-z0-9_]+$/.test(String(name))) {
    throw new Error(`Identifiant SQL refusé : ${name}`);
  }
  return `\`${name}\``;
}

/** Texte de remplacement de même longueur que l'original (NULL et chaîne vide préservés). */
function sameLengthPlaceholder(column) {
  const col = quoteIdent(column);
  return (
    `CASE WHEN ${col} IS NULL OR ${col} = '' THEN ${col} ` +
    `ELSE RPAD(LEFT('Contenu anonymise. ', CHAR_LENGTH(${col})), CHAR_LENGTH(${col}), '.') END`
  );
}

/**
 * Construit les instructions à jouer à partir du schéma **réellement présent**.
 * `schema` : Map(table → Set(colonnes)). Une table ou une colonne absente est ignorée
 * silencieusement : le schéma bouge à chaque migration, le script ne doit pas casser pour
 * autant.
 */
function buildStatements(schema, options) {
  const hash = options.passwordHash || '';
  const statements = [];

  for (const entry of IDENTITY_PLAN) {
    const columns = schema.get(entry.table);
    if (!columns) continue;
    const assignments = Object.entries(entry.columns)
      .filter(([column]) => columns.has(column))
      .map(([column, expr]) => `${quoteIdent(column)} = ${expr.replace(/\{\{hash\}\}/g, hash)}`);
    if (assignments.length === 0) continue;
    statements.push({
      kind: 'identity',
      table: entry.table,
      sql: `UPDATE ${quoteIdent(entry.table)} SET ${assignments.join(', ')}`,
    });
  }

  if (!options.keepText) {
    for (const entry of TEXT_PLAN) {
      const columns = schema.get(entry.table);
      if (!columns) continue;
      const assignments = entry.columns
        .filter((column) => columns.has(column))
        .map((column) => `${quoteIdent(column)} = ${sameLengthPlaceholder(column)}`);
      if (assignments.length === 0) continue;
      statements.push({
        kind: 'text',
        table: entry.table,
        sql: `UPDATE ${quoteIdent(entry.table)} SET ${assignments.join(', ')}`,
      });
    }
  }

  for (const table of PURGE_TABLES) {
    if (!schema.has(table)) continue;
    statements.push({ kind: 'purge', table, sql: `DELETE FROM ${quoteIdent(table)}` });
  }

  return statements;
}

/**
 * Une requête par table : somme des lignes dont une colonne texte porte encore un motif.
 * Trois paramètres par colonne — motif e-mail, motif bcrypt, hachage d'anonymisation à
 * ignorer (celui que le script vient de poser ; chaîne vide en mode diagnostic).
 */
function buildScanQuery(table, columns) {
  const tests = [];
  for (const column of columns) {
    const col = quoteIdent(column);
    const match = `(${col} REGEXP ? OR (${col} REGEXP ? AND ${col} <> ?))`;
    const exception = RESIDUAL_EXCEPTIONS.get(`${table}.${column}`);
    // Deux compteurs par colonne : tout ce qui correspond, puis ce qui reste après exception.
    // Une exception qui cesserait de s'appliquer (réglage renommé, colonne déplacée) redevient
    // donc bloquante d'elle-même, au lieu de disparaître du contrôle.
    tests.push(`SUM(CASE WHEN ${match} THEN 1 ELSE 0 END) AS ${quoteIdent(column)}`);
    tests.push(
      `SUM(CASE WHEN ${match}${exception ? ` AND NOT (${exception})` : ''} THEN 1 ELSE 0 END) ` +
        `AS ${quoteIdent(`${column}__bloquant`)}`,
    );
  }
  return `SELECT ${tests.join(', ')} FROM ${quoteIdent(table)}`;
}

async function loadSchema(databaseName) {
  const rows = await queryAll(
    `SELECT table_name AS t, column_name AS c, data_type AS d
       FROM information_schema.columns
      WHERE table_schema = ?`,
    [databaseName],
  );
  const schema = new Map();
  const textColumns = new Map();
  for (const row of rows) {
    if (!schema.has(row.t)) schema.set(row.t, new Set());
    schema.get(row.t).add(row.c);
    if (['varchar', 'char', 'text', 'tinytext', 'mediumtext', 'longtext'].includes(row.d)) {
      if (!textColumns.has(row.t)) textColumns.set(row.t, []);
      textColumns.get(row.t).push(row.c);
    }
  }
  return { schema, textColumns };
}

async function scanResiduals(textColumns, anonymizedHash = '') {
  const findings = [];
  for (const [table, columns] of textColumns) {
    // Les requêtes restent bornées : une par table, agrégée côté serveur.
    const params = [];
    for (let i = 0; i < columns.length; i += 1) {
      // Deux compteurs par colonne (total puis bloquant) → deux jeux de paramètres.
      params.push(EMAIL_SQL_REGEXP, BCRYPT_SQL_REGEXP, anonymizedHash);
      params.push(EMAIL_SQL_REGEXP, BCRYPT_SQL_REGEXP, anonymizedHash);
    }
    let row;
    try {
      row = await queryOne(buildScanQuery(table, columns), params);
    } catch (err) {
      findings.push({ table, column: '*', count: null, error: err.message });
      continue;
    }
    if (!row) continue;
    for (const column of columns) {
      const count = Number(row[column] || 0);
      const blocking = Number(row[`${column}__bloquant`] || 0);
      if (count > 0) {
        findings.push({ table, column, count, blocking, tolerated: blocking === 0 });
      }
    }
  }
  return findings.sort((a, b) => (b.count || 0) - (a.count || 0));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (String(process.env.NODE_ENV) === 'production') {
    console.error('Refus : NODE_ENV=production. Ce script ne s’exécute que sur une base locale.');
    process.exitCode = 1;
    return;
  }
  if (!isLocalDbHost(process.env.DB_HOST)) {
    console.error(
      `Refus : DB_HOST=${process.env.DB_HOST} n’est pas local. Importez le dump en local avant d’anonymiser.`,
    );
    process.exitCode = 1;
    return;
  }

  const databaseName = process.env.DB_NAME || 'foretmap_local';
  const { schema, textColumns } = await loadSchema(databaseName);
  if (schema.size === 0) {
    console.error(`Refus : aucune table dans « ${databaseName} ». Importez d’abord un dump.`);
    process.exitCode = 1;
    return;
  }

  if (options.scanOnly) {
    const findings = await scanResiduals(textColumns);
    const blocking = findings.filter((f) => !f.tolerated);
    console.log(JSON.stringify({ base: databaseName, mode: 'scan-only', findings }, null, 2));
    process.exitCode = blocking.length > 0 && !options.allowResidual ? 1 : 0;
    return;
  }

  const passwordHash = await bcrypt.hash(options.password, 10);
  const statements = buildStatements(schema, { ...options, passwordHash });

  console.log(
    `Base « ${databaseName} » — ${statements.length} instruction(s), mode ${options.dryRun ? 'SIMULATION' : 'ÉCRITURE'}` +
      (options.keepText ? ' (contenus libres conservés)' : ''),
  );

  const results = [];
  for (const statement of statements) {
    if (options.dryRun) {
      console.log(`  [simulation] ${statement.sql}`);
      results.push({ ...statement, affected: null });
      continue;
    }
    const result = await execute(statement.sql);
    const affected = Number(result?.affectedRows ?? 0);
    console.log(`  [${statement.kind}] ${statement.table} → ${affected} ligne(s)`);
    results.push({ ...statement, affected });
  }

  if (options.dryRun) {
    console.log('\nSimulation terminée — relancer avec --apply pour écrire.');
    return;
  }

  const findings = await scanResiduals(textColumns, passwordHash);
  const tolerated = findings.filter((f) => f.tolerated);
  const blocking = findings.filter((f) => !f.tolerated);

  for (const f of tolerated) {
    console.log(
      `\nToléré : ${f.table}.${f.column} — ${f.count} ligne(s) couverte(s) par une exception ` +
        `déclarée (contenu éditorial ou crédit d’illustration externe).`,
    );
  }

  if (blocking.length === 0) {
    console.log('\nBalayage final : aucun e-mail ni hachage bcrypt résiduel.');
    console.log('Pensez à `npm run db:seed:teacher` pour recréer un compte prof exploitable.');
    return;
  }

  console.error('\nBalayage final — motifs encore présents :');
  for (const f of blocking) {
    console.error(
      `  ${f.table}.${f.column} : ${f.error ? `erreur (${f.error})` : `${f.blocking} ligne(s) sur ${f.count}`}`,
    );
  }
  console.error(
    'Compléter IDENTITY_PLAN / TEXT_PLAN dans scripts/anonymize-local-db.js, ou --allow-residual si ces motifs sont légitimes (contenus pédagogiques, réglages).',
  );
  process.exitCode = options.allowResidual ? 0 : 1;
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await endPool().catch(() => {});
    });
}

module.exports = {
  parseArgs,
  isLocalDbHost,
  quoteIdent,
  sameLengthPlaceholder,
  buildStatements,
  buildScanQuery,
  IDENTITY_PLAN,
  TEXT_PLAN,
  PURGE_TABLES,
  RESIDUAL_EXCEPTIONS,
  EMAIL_SQL_REGEXP,
  BCRYPT_SQL_REGEXP,
};
