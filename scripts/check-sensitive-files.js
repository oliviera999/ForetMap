#!/usr/bin/env node
'use strict';

/**
 * Garde-fou contre les fuites de secrets et de données personnelles dans le dépôt.
 *
 * Pourquoi : un export complet de la base de production a déjà été versionné par erreur. Une
 * fois publié, un fichier ne se retire plus vraiment d'un dépôt hébergé (historique, références
 * de PR, caches). `.gitignore` ne protège pas d'un `git add -f`, ni d'un dump renommé ; le hook
 * pre-commit ne vérifiait que lint et format.
 *
 * Ce que le script refuse :
 *  - des NOMS de fichiers : `.env` (hors modèles `.example`), clés privées (`.pem`, `.key`,
 *    `id_rsa`…), dumps et sauvegardes (`*.sql.gz`, `*.dump`, `backups/`…) ;
 *  - des CONTENUS : hachage bcrypt, bloc de clé privée, jetons d'API connus, JWT signé,
 *    en-tête de dump (mysqldump, MariaDB, phpMyAdmin) ;
 *  - des fichiers SQL : tout `INSERT` dans un fichier hors des jeux déclarés
 *    (`DECLARED_SQL_SETS`, `migrations/*.sql`), et, dans les jeux de contenu, tout
 *    `INSERT … VALUES` sur une table de données personnelles (`PERSONAL_TABLE_RE`). Seul le
 *    jeu anonymisé déclaré peut en porter (`tests/fixture-anonymise.test.js` le revérifie).
 *
 * La sortie ne cite JAMAIS la valeur trouvée : seulement le fichier, la ligne et la règle (le
 * rapport s'affiche dans les journaux de la CI).
 *
 * Usage :
 *   node scripts/check-sensitive-files.js --staged      fichiers indexés (hook pre-commit)
 *   node scripts/check-sensitive-files.js [--all]       tous les fichiers suivis (CI)
 *   node scripts/check-sensitive-files.js <fichier…>    fichiers donnés
 *   git show <rev>:<chemin> | node scripts/check-sensitive-files.js --stdin --as <chemin>
 * Sortie : code 0 si rien n'est trouvé, 1 sinon, 2 en cas d'erreur d'usage.
 *
 * Inspiration : règles de gitleaks (https://github.com/gitleaks/gitleaks, MIT) pour les formats
 * de jetons ; aucune dépendance ajoutée, pour tourner aussi dans le hook sans installation.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');

/** Taille décompressée au-delà de laquelle un fichier n'est plus lu (et est signalé). */
const MAX_SCAN_BYTES = 64 * 1024 * 1024;
/** Occurrences rapportées par fichier et par règle ; le reste est compté. */
const MAX_REPORTED_PER_RULE = 5;

/**
 * Jeux SQL autorisés à porter des `INSERT`. `anonymise` : seul type admis pour des tables de
 * données personnelles. `contenu` : données pédagogiques ou de configuration, jamais de compte.
 * Ajouter une entrée ici est une décision de revue : le fichier doit être anonymisé ou ne
 * contenir que du contenu.
 */
const DECLARED_SQL_SETS = new Map([
  ['sql/fixtures/foretmap-anonymise.sql.gz', 'anonymise'],
  ['sql/schema_foretmap.sql', 'contenu'],
  ['sql/biodiv_pedago_seed.sql', 'contenu'],
  ['sql/quiz_foretmap_data.sql', 'contenu'],
  ['sql/zones_lyautey_batiments.sql', 'contenu'],
  ['data/import/foret-comestible-garden.sql', 'contenu'],
  ['docker/mysql-init/01-databases.sql', 'contenu'],
]);

/** Tables qui portent des données personnelles (comptes, contributions, journaux, traces). */
const PERSONAL_TABLE_RE = new RegExp(
  '^(?:' +
    [
      'users',
      'user_\\w+',
      'students',
      'teachers',
      'password_reset_tokens',
      'audit_log',
      'elevation_audit',
      'security_events',
      'notifications',
      'group_members',
      'external_group_members',
      'forum_\\w+',
      'context_comment\\w*',
      'task_assignments',
      'task_logs',
      'task_referents',
      'observation_logs',
      'species_observation\\w*',
      'visit_seen_\\w+',
      'pedago_session_runs',
      'lti_\\w+',
      'gl_players',
      'gl_player_\\w+',
      'gl_team_members',
      'gl_forum_\\w+',
      'gl_qcm_attempts',
      'gl_game_events',
      'gl_market_trade_messages',
      'gl_mascot_assignments',
    ].join('|') +
    ')$',
  'i',
);

/**
 * Exceptions ciblées (fichier + règle), chacune justifiée. Préférer corriger le fichier : une
 * valeur factice de test se construit à l'exécution (`'$2b$10$' + 'a'.repeat(53)`).
 */
const CONTENT_ALLOWLIST = [
  {
    path: 'lib/auth/timingEqualizer.js',
    rule: 'bcrypt',
    reason: "hachage factice d'égalisation du temps de réponse, ne correspond à aucun compte",
  },
];

function sqlSetKind(relPath) {
  if (DECLARED_SQL_SETS.has(relPath)) return DECLARED_SQL_SETS.get(relPath);
  if (/^migrations\/[^/]+\.sql$/.test(relPath)) return 'contenu';
  return null;
}

const NAME_RULES = [
  {
    id: 'fichier-env',
    message: "fichier d'environnement (secrets) : seuls les modèles `.example` se versionnent",
    test: (p) => /(^|\/)\.env(\.[^/]*)?$/.test(p) && !/\.(example|sample|template|dist)$/i.test(p),
  },
  {
    id: 'fichier-cle-privee',
    message: 'clé privée ou magasin de certificats',
    test: (p) =>
      /\.(pem|key|p12|pfx|jks|keystore|ppk)$/i.test(p) ||
      /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(_[^/.]*)?$/.test(p),
  },
  {
    id: 'fichier-dump',
    message: 'dump ou sauvegarde de base (données personnelles)',
    test: (p) =>
      sqlSetKind(p) === null &&
      (/\.sql\.(gz|zip|bz2|xz|7z|zst)$/i.test(p) ||
        /\.(dump|bak\.sql|mysql)$/i.test(p) ||
        /(dump|bdd_complete|backup|sauvegarde)[^/]*\.sql$/i.test(p) ||
        /(^|\/)(backups|sql\/dumps)\//.test(p)),
  },
];

const CONTENT_RULES = [
  {
    id: 'bcrypt',
    message: 'hachage de mot de passe bcrypt',
    re: /\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}/g,
  },
  {
    id: 'cle-privee',
    message: 'bloc de clé privée',
    // Corps réel (≥ 40 caractères base64) : les gabarits `\n...\n` des modèles ne comptent pas.
    re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----(?:\\n|\s)*[A-Za-z0-9+/=]{40}/g,
  },
  {
    id: 'jeton-github',
    message: "jeton d'accès GitHub",
    re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})/g,
  },
  { id: 'secret-google', message: 'secret OAuth Google', re: /\bGOCSPX-[A-Za-z0-9_-]{24,}/g },
  { id: 'cle-google', message: "clé d'API Google", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: 'cle-aws', message: "clé d'accès AWS", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: 'jeton-slack', message: 'jeton Slack', re: /\bxox[abposr]-[0-9A-Za-z-]{10,}/g },
  {
    id: 'cle-api',
    message: "clé d'API (Anthropic, OpenAI, Stripe…)",
    re: /\b(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}|[sr]k_live_[A-Za-z0-9]{20,})/g,
  },
  {
    id: 'jwt-signe',
    message: 'jeton JWT signé',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}/g,
  },
];

const EMAIL_RE = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g;
/** Domaines réservés (RFC 2606 / 6761) : seuls admis dans le jeu anonymisé. */
const RESERVED_EMAIL_DOMAIN_RE =
  /(?:^|\.)(?:invalid|test|example|localhost|example\.(?:com|net|org))$/i;

const DUMP_HEADER_RE =
  /^-- (?:MariaDB dump|MySQL dump|phpMyAdmin SQL Dump|Généré le\s*:|Generation Time\s*:)/m;
const INSERT_RE =
  /\bINSERT\s+(?:(?:IGNORE|LOW_PRIORITY|DELAYED|HIGH_PRIORITY)\s+)*INTO\s+(?:`?\w+`?\s*\.\s*)?`?(\w+)`?/gi;

function lineOf(text, index) {
  let line = 1;
  for (let i = text.indexOf('\n'); i !== -1 && i < index; i = text.indexOf('\n', i + 1)) line++;
  return line;
}

/** `INSERT … VALUES` / `SET` (valeurs littérales) ou `INSERT … SELECT` (copie entre tables) ? */
function insertHasLiteralValues(text, from) {
  let rest = text.slice(from, from + 4000).trimStart();
  if (rest.startsWith('(')) {
    const close = rest.indexOf(')');
    rest = close === -1 ? '' : rest.slice(close + 1).trimStart();
  }
  return /^(?:VALUES?|SET)\b/i.test(rest);
}

/** Contenu lisible (décompressé, texte) ; `null` si binaire. */
function readableText(relPath, buffer) {
  let data = buffer;
  if (/\.gz$/i.test(relPath)) {
    try {
      data = zlib.gunzipSync(buffer, { maxOutputLength: MAX_SCAN_BYTES });
    } catch (err) {
      return { error: `archive gzip illisible (${err.code || err.message})` };
    }
  }
  if (data.length > MAX_SCAN_BYTES) return { error: 'fichier trop volumineux pour être analysé' };
  if (data.subarray(0, 8000).includes(0)) return { text: null };
  return { text: data.toString('utf8') };
}

function isAllowed(relPath, rule) {
  return CONTENT_ALLOWLIST.some((entry) => entry.path === relPath && entry.rule === rule);
}

/**
 * Analyse un fichier. Renvoie `[{ path, line, rule, message, count }]` — jamais la valeur.
 * @param {string} relPath chemin relatif à la racine du dépôt, séparateur `/`
 * @param {Buffer} buffer contenu
 */
function scanFile(relPath, buffer) {
  const findings = [];
  const add = (rule, message, line = null, count = 1) =>
    findings.push({ path: relPath, line, rule, message, count });

  for (const rule of NAME_RULES) {
    if (rule.test(relPath)) add(rule.id, rule.message);
  }

  const { text, error } = readableText(relPath, buffer);
  if (error) {
    add('illisible', error);
    return findings;
  }
  if (text == null) return findings;

  const kind = sqlSetKind(relPath);
  for (const rule of CONTENT_RULES) {
    if (isAllowed(relPath, rule.id)) continue;
    if (rule.id === 'bcrypt' && kind === 'anonymise') {
      // Le jeu anonymisé porte UN hachage générique (mot de passe de démonstration unique) ;
      // plusieurs hachages distincts trahiraient des mots de passe réels.
      const distinct = new Set([...text.matchAll(rule.re)].map((m) => m[0])).size;
      if (distinct > 1) {
        add('bcrypt', `${distinct} hachages bcrypt distincts dans le jeu anonymisé (1 attendu)`);
      }
      continue;
    }
    const lines = [];
    for (const m of text.matchAll(rule.re)) lines.push(lineOf(text, m.index));
    lines.slice(0, MAX_REPORTED_PER_RULE).forEach((line) => add(rule.id, rule.message, line));
    if (lines.length > MAX_REPORTED_PER_RULE) {
      add(
        rule.id,
        `${rule.message} (autres occurrences)`,
        null,
        lines.length - MAX_REPORTED_PER_RULE,
      );
    }
  }

  if (kind === 'anonymise') {
    // Les adresses du jeu anonymisé sont réécrites en `@exemple.invalid` (anonymize-local-db.js).
    const real = [...text.matchAll(EMAIL_RE)].filter((m) => !RESERVED_EMAIL_DOMAIN_RE.test(m[1]));
    if (real.length > 0) {
      add(
        'email-reel',
        'adresse e-mail hors domaine réservé dans le jeu anonymisé',
        null,
        real.length,
      );
    }
  }

  // Les jeux déclarés peuvent être des exports de contenu (phpMyAdmin, mysqldump) : c'est la
  // règle des tables personnelles qui les garde.
  if (kind === null) {
    const header = DUMP_HEADER_RE.exec(text);
    if (header)
      add('entete-dump', 'en-tête de dump de base de données', lineOf(text, header.index));
  }

  if (/\.sql(\.gz)?$/i.test(relPath)) {
    if (kind === null) {
      const first = /\bINSERT\s+(?:\w+\s+)*?INTO\b/i.exec(text);
      if (first) {
        add(
          'sql-non-declare',
          'INSERT dans un fichier SQL hors des jeux déclarés (DECLARED_SQL_SETS)',
          lineOf(text, first.index),
        );
      }
    } else if (kind === 'contenu') {
      const hits = [];
      for (const m of text.matchAll(INSERT_RE)) {
        if (PERSONAL_TABLE_RE.test(m[1]) && insertHasLiteralValues(text, m.index + m[0].length)) {
          hits.push({ line: lineOf(text, m.index), table: m[1] });
        }
      }
      hits
        .slice(0, MAX_REPORTED_PER_RULE)
        .forEach((h) =>
          add(
            'sql-donnees-personnelles',
            `INSERT de valeurs dans la table personnelle \`${h.table}\` (jeu de contenu)`,
            h.line,
          ),
        );
      if (hits.length > MAX_REPORTED_PER_RULE) {
        add(
          'sql-donnees-personnelles',
          'INSERT de valeurs personnelles (autres occurrences)',
          null,
          hits.length - MAX_REPORTED_PER_RULE,
        );
      }
    }
  }
  return findings;
}

class UsageError extends Error {}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, maxBuffer: 1024 * 1024 * 1024 });
}

function splitZ(buffer) {
  return buffer.toString('utf8').split('\0').filter(Boolean);
}

/** Fichiers à analyser selon le mode : `[{ relPath, read: () => Buffer }]`. */
function collectTargets(argv, cwd) {
  const args = argv.filter((a) => a !== '--all');
  if (args[0] === '--staged') {
    return splitZ(git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], cwd)).map(
      (relPath) => ({ relPath, read: () => git(['show', `:${relPath}`], cwd) }),
    );
  }
  if (args[0] === '--stdin') {
    const asIndex = args.indexOf('--as');
    const relPath = asIndex === -1 ? null : args[asIndex + 1];
    if (asIndex === -1 || !relPath) throw new UsageError('--stdin exige --as <chemin>');
    return [{ relPath, read: () => fs.readFileSync(0) }];
  }
  if (args.length > 0) {
    return args.map((file) => ({
      relPath: path.relative(cwd, path.resolve(cwd, file)).split(path.sep).join('/'),
      read: () => fs.readFileSync(path.resolve(cwd, file)),
    }));
  }
  return splitZ(git(['ls-files', '-z'], cwd))
    .filter((relPath) => fs.existsSync(path.join(cwd, relPath)))
    .filter((relPath) => fs.lstatSync(path.join(cwd, relPath)).isFile())
    .map((relPath) => ({ relPath, read: () => fs.readFileSync(path.join(cwd, relPath)) }));
}

function formatFinding(f) {
  const where = f.line ? `${f.path}:${f.line}` : f.path;
  const count = f.count > 1 ? ` ×${f.count}` : '';
  return `  ${where}  [${f.rule}] ${f.message}${count}`;
}

function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  let targets;
  try {
    targets = collectTargets(argv, cwd);
  } catch (err) {
    process.stderr.write(`check-sensitive-files : ${err.message}\n`);
    return 2;
  }
  const findings = [];
  for (const target of targets) findings.push(...scanFile(target.relPath, target.read()));

  if (findings.length === 0) {
    if (!argv.includes('--staged')) {
      process.stdout.write(
        `check-sensitive-files : ${targets.length} fichier(s) analysé(s), rien de sensible.\n`,
      );
    }
    return 0;
  }
  const out = [
    `✖ Données sensibles détectées (${findings.length}) — valeurs non affichées :`,
    ...findings.map(formatFinding),
    '',
    'Que faire :',
    '  - retirer le fichier de l’index : git rm --cached <fichier> (il reste sur le disque) ;',
    '  - un secret, même déjà retiré, est à considérer comme exposé : le révoquer / le changer ;',
    '  - jeu SQL légitime : anonymiser (npm run db:fixture:export) ou le déclarer dans',
    '    DECLARED_SQL_SETS de scripts/check-sensitive-files.js, en revue de code ;',
    '  - faux positif : construire la valeur factice à l’exécution, ou ajouter une exception',
    '    justifiée à CONTENT_ALLOWLIST.',
  ];
  process.stderr.write(`${out.join('\n')}\n`);
  return 1;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  scanFile,
  sqlSetKind,
  main,
  DECLARED_SQL_SETS,
  PERSONAL_TABLE_RE,
  NAME_RULES,
  CONTENT_RULES,
  CONTENT_ALLOWLIST,
};
