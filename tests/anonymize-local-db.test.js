'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  parseArgs,
  isLocalDbHost,
  quoteIdent,
  buildStatements,
  buildScanQuery,
  EMAIL_SQL_REGEXP,
} = require('../scripts/anonymize-local-db');

/** Schéma minimal simulé : Map(table → Set(colonnes)). */
function schemaOf(spec) {
  return new Map(Object.entries(spec).map(([table, cols]) => [table, new Set(cols)]));
}

test('anonymize-local-db : options', async (t) => {
  await t.test('simulation par défaut', () => {
    const opts = parseArgs([]);
    assert.strictEqual(opts.dryRun, true);
    assert.strictEqual(opts.keepText, false);
    assert.strictEqual(opts.scanOnly, false);
  });

  await t.test('--apply, --keep-text, --password', () => {
    const opts = parseArgs(['--apply', '--keep-text', '--password=secret42']);
    assert.strictEqual(opts.dryRun, false);
    assert.strictEqual(opts.keepText, true);
    assert.strictEqual(opts.password, 'secret42');
  });
});

test('anonymize-local-db : garde-fou hôte local', () => {
  for (const host of ['', '127.0.0.1', 'localhost', 'LOCALHOST', '::1']) {
    assert.strictEqual(isLocalDbHost(host), true, `attendu local : ${host}`);
  }
  for (const host of ['db.olution.info', '10.0.0.5', 'mysql.prod']) {
    assert.strictEqual(isLocalDbHost(host), false, `attendu distant : ${host}`);
  }
});

test('anonymize-local-db : identifiants SQL', () => {
  assert.strictEqual(quoteIdent('users'), '`users`');
  assert.throws(() => quoteIdent('users`; DROP TABLE users; --'), /refusé/);
});

test('anonymize-local-db : plan construit à partir du schéma réel', async (t) => {
  await t.test('ignore les tables absentes', () => {
    const statements = buildStatements(schemaOf({ users: ['id', 'email'] }), {
      passwordHash: '$2b$10$hash',
    });
    const tables = statements.map((s) => s.table);
    assert.deepStrictEqual(tables, ['users']);
  });

  await t.test('ignore les colonnes absentes de la table', () => {
    const [statement] = buildStatements(schemaOf({ users: ['id', 'email'] }), {
      passwordHash: '$2b$10$hash',
    });
    assert.match(statement.sql, /`email` =/);
    assert.doesNotMatch(statement.sql, /`pseudo`/);
    assert.doesNotMatch(statement.sql, /`password_hash`/);
  });

  await t.test('injecte le hachage bcrypt commun', () => {
    const [statement] = buildStatements(schemaOf({ users: ['id', 'password_hash'] }), {
      passwordHash: '$2b$10$remplacant',
    });
    assert.match(statement.sql, /'\$2b\$10\$remplacant'/);
    assert.doesNotMatch(statement.sql, /\{\{hash\}\}/);
  });

  await t.test('--keep-text n’émet aucune réécriture de contenu libre', () => {
    const schema = schemaOf({ users: ['id', 'email'], forum_posts: ['id', 'body'] });
    const withText = buildStatements(schema, { passwordHash: 'h' });
    const withoutText = buildStatements(schema, { passwordHash: 'h', keepText: true });
    assert.ok(withText.some((s) => s.kind === 'text'));
    assert.ok(!withoutText.some((s) => s.kind === 'text'));
  });

  await t.test('les tables de jetons sont purgées, pas réécrites', () => {
    const statements = buildStatements(schemaOf({ password_reset_tokens: ['id', 'token_hash'] }), {
      passwordHash: 'h',
    });
    assert.deepStrictEqual(
      statements.map((s) => [s.kind, s.sql]),
      [['purge', 'DELETE FROM `password_reset_tokens`']],
    );
  });

  await t.test('les compléments réservés sont réécrits là où ils vivent (migration 263)', () => {
    // Un complément est du texte libre saisi par un prof : il peut nommer un élève. Depuis la
    // 263 il a déménagé de `zones.restricted_note` vers `location_notes` — si le plan ne suit
    // pas le déménagement, le fixture local reste porteur de PII sans que rien n'échoue.
    const [statement] = buildStatements(
      schemaOf({ location_notes: ['id', 'title', 'body', 'audience_role_slugs'] }),
      { passwordHash: 'h' },
    );
    assert.strictEqual(statement.kind, 'text');
    assert.match(statement.sql, /`title` =/);
    assert.match(statement.sql, /`body` =/);
    assert.doesNotMatch(statement.sql, /`audience_role_slugs`/);
  });

  await t.test('préserve NULL sur les colonnes d’identité', () => {
    const [statement] = buildStatements(schemaOf({ users: ['id', 'email', 'pseudo'] }), {
      passwordHash: 'h',
    });
    assert.match(statement.sql, /CASE WHEN email IS NULL THEN NULL/);
    assert.match(statement.sql, /CASE WHEN pseudo IS NULL THEN NULL/);
  });
});

test('anonymize-local-db : requête de balayage', async (t) => {
  await t.test('deux compteurs (total, bloquant) et six paramètres par colonne', () => {
    const sql = buildScanQuery('users', ['email', 'first_name']);
    assert.strictEqual((sql.match(/\?/g) || []).length, 12);
    assert.match(sql, /AS `email`/);
    assert.match(sql, /AS `email__bloquant`/);
    assert.match(sql, /FROM `users`$/);
  });

  await t.test('une exception déclarée ne retire pas la colonne du contrôle', () => {
    // `app_settings.value_json` porte l'adresse de contact de la page « À propos ». Le
    // compteur total continue de la voir ; seul le compteur bloquant l'exclut, via la
    // condition déclarée — un e-mail dans un réglage technique reste donc bloquant.
    const sql = buildScanQuery('app_settings', ['value_json']);
    assert.match(sql, /AS `value_json`/);
    assert.match(sql, /AND NOT \(`key` LIKE 'content\.%'\)/);
    assert.ok(
      sql.indexOf('AND NOT') > sql.indexOf('AS `value_json`'),
      'la condition ne doit porter que sur le compteur bloquant',
    );
  });

  await t.test('sans exception, les deux compteurs sont identiques', () => {
    const sql = buildScanQuery('users', ['email']);
    assert.doesNotMatch(sql, /AND NOT \(/);
  });

  await t.test('le motif e-mail exclut le domaine d’anonymisation', () => {
    // Anticipation négative PCRE : une adresse déjà anonymisée ne doit pas être signalée,
    // sans quoi le contrôle final échouerait sur son propre résultat.
    assert.match(EMAIL_SQL_REGEXP, /\(\?!exemple\\\.invalid\)/);
  });
});
