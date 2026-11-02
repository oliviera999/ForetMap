'use strict';

/**
 * Connecteur MCP — fonctions pures (sans base) : contrôles de cohérence du corpus sur des
 * jeux construits (lib/mcp/audits/checks.js), garde SQL (liste blanche / noire, colonnes),
 * validation du SELECT libre, opérations d'écriture admises, migration générée, seuil
 * d'anonymat et accès aux outils par portée / permission / drapeau.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const checks = require('../lib/mcp/audits/checks');
const guard = require('../lib/mcp/sqlGuard');
const { validateSelectSql } = require('../lib/mcp/tools/sqlSelect');
const { normalizeOperation } = require('../lib/mcp/write/operations');
const { checkToolAccess } = require('../lib/mcp/registry');
const { threshold } = require('../lib/mcp/tools/usage');

const ids = (findings) => findings.map((f) => f.id).sort();

test('photos sans crédit ou licence (galerie, principale, G&L, QCM)', () => {
  const out = checks.photosMissingCredit({
    plantPhotos: [
      { id: 1, plant_id: 9, credit: 'A', licence: 'CC0' },
      { id: 2, plant_id: 9, credit: '', licence: 'CC0' },
      { id: 3, plant_id: 9, credit: 'B', licence: null },
    ],
    plants: [
      { id: 9, photo: 'x.jpg', photo_credit: null, photo_licence: 'CC0' },
      { id: 10, photo: '', photo_credit: null },
    ],
    glSpecies: [{ species_code: 'SP1', photo_url: 'u', photo_credit: 'c', photo_licence: '' }],
    quizQuestions: [{ question_code: 'Q1', photo_url: 'u', photo_credit: 'c', photo_licence: 'l' }],
    glQcmQuestions: [{ question_code: 'G1', photo_url: 'u' }],
  });
  assert.deepEqual(ids(out), [
    'gl_qcm:G1',
    'gl_species:SP1',
    'plant:9',
    'plant_photo:2',
    'plant_photo:3',
  ]);
});

const KEY = {
  idKeys: [
    { id: 1, map_id: 'm1', is_published: 1 },
    { id: 2, map_id: null, is_published: 1 },
  ],
  idKeyCouplets: [
    { id: 10, key_id: 1, number: 1 },
    { id: 11, key_id: 1, number: 2 },
    { id: 12, key_id: 1, number: 3 },
    { id: 20, key_id: 2, number: 1 },
  ],
  idKeyLeads: [
    { id: 100, couplet_id: 10, next_couplet_id: 11, plant_id: null },
    { id: 101, couplet_id: 10, next_couplet_id: null, plant_id: 5 },
    { id: 102, couplet_id: 11, next_couplet_id: null, plant_id: 5 },
    { id: 103, couplet_id: 11, next_couplet_id: null, plant_id: null },
    { id: 104, couplet_id: 12, next_couplet_id: null, plant_id: 7 },
    { id: 105, couplet_id: 12, next_couplet_id: 999, plant_id: null },
    { id: 200, couplet_id: 20, next_couplet_id: null, plant_id: 8 },
  ],
};

test('clés : feuille sans espèce, renvoi cassé, couplet inatteignable, espèce atteinte deux fois', () => {
  const out = ids(checks.idKeyDeadPaths(KEY));
  assert.ok(out.includes('lead:103'), 'feuille sans espèce');
  assert.ok(out.includes('lead:105'), 'couplet absent');
  assert.ok(out.includes('couplet:12'), 'inatteignable');
  assert.ok(out.includes('key:1:plant:5'), 'ambiguë');
  assert.ok(out.includes('couplet:20'), 'une seule proposition');
});

test('espèces présentes sur une carte mais hors clé publiée', () => {
  const out = checks.speciesNotCoveredByIdKey({
    ...KEY,
    zones: [{ id: 'z1', map_id: 'm1' }],
    markers: [],
    mapSpecies: [{ map_id: 'm1', plant_id: 6 }],
    zoneSpecies: [{ zone_id: 'z1', plant_id: 5 }],
    markerSpecies: [],
  });
  // 5 atteinte par la clé 1, 6 par aucune clé (ni 1 ni 2, sans carte).
  assert.deepEqual(ids(out), ['map:m1:plant:6']);
  assert.deepEqual(checks.speciesNotCoveredByIdKey({ idKeys: [] }), []);
});

test('glossaire : orphelins (ni lien, ni emploi dans les textes)', () => {
  const out = checks.glossaryOrphans({
    glossaryTerms: [
      { glossary_code: 'G1', terme: 'humus' },
      { glossary_code: 'G2', terme: 'mycorhize' },
      { glossary_code: 'G3', terme: 'stomate' },
    ],
    glossaryTermSpecies: [{ glossary_code: 'G1', plant_id: 1 }],
    tutorials: [{ html_content: '<p>Les <b>stomates</b> s’ouvrent</p>' }],
    glGlossaryTerms: [{ glossary_code: 'L1', terme: 'biome' }],
    glResourceQuestionLinks: [],
    glSpecies: [{ description_courte: 'Vit dans un biome froid' }],
    glLoreGlossaryTerms: [{ lore_code: 'R1', terme: 'Souffle' }],
  });
  assert.deepEqual(ids(out), ['glossary:G2', 'lore_glossary:R1']);
});

test('glossaire : divergence FM ↔ G&L du même terme (accents et casse ignorés)', () => {
  const out = checks.glossaryDivergenceFmGl({
    glossaryTerms: [
      { glossary_code: 'F1', terme: 'Décomposeur', definition_courte: 'Recycle la matière.' },
      { glossary_code: 'F2', terme: 'Biome', definition_courte: 'Grand milieu' },
    ],
    glGlossaryTerms: [
      { glossary_code: 'G1', terme: 'decomposeur', definition_courte: 'Organisme qui dégrade.' },
      { glossary_code: 'G2', terme: 'biome', definition_courte: 'grand  milieu' },
    ],
  });
  assert.deepEqual(ids(out), ['F1~G1']);
});

test('liens glossaire ↔ QCM G&L : ancienne table et liens import périmés', () => {
  const out = checks.glQcmGlossaryLinkDivergence({
    glResourceQuestionLinks: [
      {
        question_dataset: 'qcm',
        resource_type: 'glossary',
        question_code: 'Q1',
        resource_ref: 'A',
        origin: 'import',
      },
      {
        question_dataset: 'qcm',
        resource_type: 'glossary',
        question_code: 'Q1',
        resource_ref: 'B',
        origin: 'manual',
      },
    ],
    legacyGlQcmQuestionGlossary: [
      { question_code: 'Q1', glossary_code: 'B' },
      { question_code: 'Q2', glossary_code: 'C' },
    ],
    expectedImportLinks: new Map([
      ['Q1', new Set(['D'])],
      ['Q3', new Set()],
    ]),
  });
  assert.deepEqual(ids(out), ['Q1+D', 'Q1-A', 'legacy:Q2|C']);
  assert.deepEqual(checks.glQcmGlossaryLinkDivergence({ legacyGlQcmQuestionGlossary: null }), []);
});

test('QCM incomplets : le slot de feedback de la bonne réponse vide n’est jamais signalé', () => {
  const complete = {
    question_code: 'OK',
    question: 'Q ?',
    choix_a: 'a',
    choix_b: 'b',
    reponse_correcte: 'A',
    feedback_correct: 'Oui',
    feedback_a: null,
    feedback_b: 'Non car…',
    niveau: '6e',
    difficulte: 1,
  };
  const out = checks.qcmIncomplete({
    glQcmQuestions: [
      complete,
      { ...complete, question_code: 'NOFB', feedback_b: '' },
      { ...complete, question_code: 'BADANS', reponse_correcte: 'D' },
      { ...complete, question_code: 'NOLVL', niveau: '' },
    ],
    quizQuestions: [{ ...complete, question_code: 'FM', niveau: null }],
  });
  assert.deepEqual(ids(out), ['gl_qcm:BADANS', 'gl_qcm:NOFB', 'gl_qcm:NOLVL']);
});

test('niveaux G&L non harmonisés 6ᵉ : questions, case fixe, tirage', () => {
  const out = checks.glCaseLevelsNot6e({
    glQcmQuestions: [
      { question_code: 'A', niveau: '6e', statut: 'actif' },
      { question_code: 'B', niveau: 'lycee', statut: 'actif' },
      { question_code: 'C', niveau: 'cycle 3', statut: 'actif' },
      { question_code: 'D', niveau: 'lycee', statut: 'archive' },
    ],
    glChapterMarkers: [
      { id: 1, qcm_question_code: 'B' },
      {
        id: 2,
        event_config_json: JSON.stringify({
          question: { mode: 'random', pool: { niveaux: ['6e', 'cycle 4'] } },
        }),
      },
      { id: 3, event_config_json: JSON.stringify({ question: { mode: 'random', pool: {} } }) },
      { id: 4, event_config_json: JSON.stringify({ question: { set: 'lore', pool: {} } }) },
      {
        id: 5,
        event_config_json: JSON.stringify({
          question: { mode: 'random', pool: { niveaux: ['college'] } },
        }),
      },
    ],
  });
  assert.deepEqual(ids(out), ['case:1', 'case:2', 'case:3', 'gl_qcm:B']);
  assert.ok(checks.isSixiemeLevel('6ᵉ'));
  assert.ok(checks.isSixiemeLevel('Cycle 3'));
  assert.ok(!checks.isSixiemeLevel('cycle 4'));
});

test('doublons d’espèces (nom scientifique normalisé) et alias partagés', () => {
  assert.equal(checks.normalizeScientificName('Quercus suber L.'), 'quercus suber');
  assert.equal(checks.normalizeScientificName('QUERCUS  suber (Mill.) 1768'), 'quercus suber');
  const out = checks.speciesDuplicates({
    plants: [
      { id: 1, name: 'Chêne-liège', scientific_name: 'Quercus suber L.' },
      { id: 2, name: 'Chêne liège bis', scientific_name: 'quercus suber' },
      { id: 3, name: 'Romarin', scientific_name: 'Salvia rosmarinus' },
      { id: 4, name: 'Tamaris', scientific_name: 'Tamarix' },
      { id: 5, name: 'Tamaris 2', scientific_name: 'Tamarix' },
    ],
    plantAliases: [{ alias: 'romarin', plant_id: 6 }],
    glSpecies: [],
  });
  assert.deepEqual(ids(out), ['alias:romarin', 'plants:1+2']);
});

test('collisions d’emoji : comparaison binaire (pas de confusion de collation)', () => {
  const out = checks.emojiCollisions({
    plants: [
      { id: 1, emoji: '🐟' },
      { id: 2, emoji: '🐠' },
      { id: 3, emoji: '🐟' },
    ],
    zones: [{ id: 'z', name: '🧪 Labo', emoji: '🧪' }],
    markers: [{ id: 'm', label: 'Mare', emoji: '💧' }],
  });
  assert.deepEqual(ids(out), ['emoji:🐟', 'zone:z']);
});

test('présence : espèces sans lieu, zones sans espèce (zones spéciales exclues)', () => {
  const s = {
    plants: [
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
      { id: 3, name: 'c' },
    ],
    zones: [
      { id: 'z1', map_id: 'm', name: 'Z1', special: 0 },
      { id: 'z2', map_id: 'm', name: 'Z2', special: 0 },
      { id: 'z3', map_id: 'm', name: 'Butte', special: 1 },
    ],
    zoneSpecies: [{ zone_id: 'z1', plant_id: 1 }],
    markerSpecies: [{ marker_id: 'k', plant_id: 2 }],
    mapSpecies: [],
  };
  assert.deepEqual(ids(checks.speciesWithoutPresence(s)), ['plant:3']);
  assert.deepEqual(ids(checks.zonesWithoutSpecies(s)), ['zone:z2']);
});

test('liaisons orphelines (FK logiques cassées)', () => {
  const out = checks.orphanLinks({
    plants: [{ id: 1 }],
    tutorials: [],
    quizQuestions: [{ question_code: 'Q1' }],
    glossaryTerms: [],
    glQcmQuestions: [{ question_code: 'G1' }],
    glQcmLoreQuestions: [],
    glSpecies: [{ id: 1, species_code: 'SP1' }],
    glGlossaryTerms: [],
    glLoreGlossaryTerms: [],
    zones: [],
    markers: [],
    resourceQuestionLinks: [
      { id: 1, resource_type: 'plant', resource_ref: '1', question_code: 'Q1' },
      { id: 2, resource_type: 'plant', resource_ref: '99', question_code: 'Q1' },
      { id: 3, resource_type: 'tutorial', resource_ref: '1', question_code: 'QX' },
    ],
    glResourceQuestionLinks: [
      {
        id: 4,
        question_dataset: 'qcm',
        resource_type: 'species',
        resource_ref: 'SP9',
        question_code: 'G1',
      },
    ],
    quizQuestionSpecies: [],
    glChapterMarkers: [{ id: 7, qcm_question_code: 'G404' }],
    glSpeciesInteractions: [{ id: 5, from_species_id: 1, to_species_id: 2 }],
  });
  const got = ids(out);
  for (const id of ['rql:2', 'rql:3', 'grql:4', 'case:7', 'gl_interaction:5']) {
    assert.ok(got.includes(id), `${id} attendu dans ${got}`);
  }
  assert.ok(!got.includes('rql:1'));
});

test('runCheck : forme {check, description, count, sample_ids ≤ 50, hint}', () => {
  const many = { plants: Array.from({ length: 80 }, (_, i) => ({ id: i, name: `p${i}` })) };
  const r = checks.runCheck('species_without_presence', many);
  assert.equal(r.check, 'species_without_presence');
  assert.equal(r.count, 80);
  assert.equal(r.sample_ids.length, 50);
  assert.ok(r.description && r.hint);
  assert.throws(() => checks.runCheck('inconnu', {}));
});

test('garde SQL : liste blanche, liste noire prioritaire, agrégat seulement, colonnes', () => {
  assert.doesNotThrow(() =>
    guard.assertSqlReadable('SELECT id, name FROM plants p JOIN zone_species z ON 1'),
  );
  for (const sql of [
    'SELECT * FROM users',
    'SELECT 1 FROM plants, user_totp',
    'SELECT * FROM (SELECT id FROM password_reset_tokens) x',
    'SELECT * FROM oauth_clients',
    'SELECT * FROM mcp_oauth_tokens',
    'SELECT * FROM forum_posts',
    'SELECT * FROM audit_log',
    'SELECT * FROM lti_nonces',
    'SELECT * FROM inconnue',
    'SELECT * FROM foretmap.plants',
    'SELECT created_by FROM id_keys',
    'SELECT p.first_name FROM plants p',
  ]) {
    assert.throws(() => guard.assertSqlReadable(sql), guard.McpDataAccessError, sql);
  }
  assert.throws(() => guard.assertSqlReadable('SELECT COUNT(*) FROM species_observations'));
  assert.doesNotThrow(() =>
    guard.assertSqlReadable('SELECT COUNT(*) FROM species_observations', { mode: 'aggregate' }),
  );
  // La liste noire prime même si une table y figure aussi ailleurs.
  assert.ok(guard.isDeniedTable('user_roles'));
  assert.ok(!guard.isDeniedTable('user_quiz_attempts'));
  // Chaîne littérale : pas de faux positif sur un mot interdit dans une valeur.
  assert.doesNotThrow(() => guard.assertSqlReadable("SELECT id FROM plants WHERE name = 'email'"));
});

test('SELECT libre : validation stricte', () => {
  assert.equal(validateSelectSql(' SELECT 1 FROM plants '), 'SELECT 1 FROM plants');
  assert.doesNotThrow(() => validateSelectSql("SELECT id FROM plants WHERE name = 'a;b @c'"));
  for (const sql of [
    '',
    'SELECT 1; SELECT 2',
    'DELETE FROM plants',
    'SELECT 1 /* x */ FROM plants',
    'SELECT 1 FROM plants # x',
    'SELECT * FROM plants FOR UPDATE',
    'SELECT * FROM plants LOCK IN SHARE MODE',
    'SELECT * INTO @x FROM plants',
    'SELECT BENCHMARK(1, 1) FROM plants',
    "SELECT GET_LOCK('a', 1) FROM plants",
    'SHOW TABLES',
    'SELECT 1 FROM plants UNION SELECT TABLE_NAME FROM information_schema.tables',
  ]) {
    assert.throws(() => validateSelectSql(sql), undefined, sql);
  }
});

test('opérations d’écriture : liste blanche tables/colonnes, clés et longueurs', () => {
  const ok = normalizeOperation({
    op: 'set_field',
    table: 'plant_photos',
    key: { id: 3 },
    column: 'credit',
    value: 'X',
  });
  assert.deepEqual(ok.key, { id: 3 });
  const bad = [
    { op: 'set_field', table: 'users', key: { id: 'a' }, column: 'email', value: 'x' },
    { op: 'set_field', table: 'plants', key: { id: 1 }, column: 'hazard_reviewed_by', value: 'x' },
    { op: 'set_field', table: 'plants', key: { id: 1 }, column: 'id', value: '2' },
    { op: 'set_field', table: 'plants', key: {}, column: 'name', value: 'x' },
    {
      op: 'set_field',
      table: 'plant_photos',
      key: { id: 1 },
      column: 'licence',
      value: 'x'.repeat(65),
    },
    { op: 'link', table: 'group_members', key: { group_id: 'g', plant_id: 1 } },
    { op: 'link', table: 'zone_species', key: { zone_id: 'z', plant_id: 'abc' } },
    { op: 'drop', table: 'plants' },
  ];
  for (const op of bad) assert.throws(() => normalizeOperation(op), undefined, JSON.stringify(op));
});

test('migration générée : idempotente (garde de valeur) et rollback inverse', () => {
  const { buildMigration } = require('../lib/mcp/write/plans');
  const { migration_sql, rollback_sql } = buildMigration(
    [
      { op: 'set_field', table: 'plants', key: { id: 4 }, column: 'description', value: "l'été" },
      { op: 'unlink', table: 'zone_species', key: { zone_id: 'z1', plant_id: 4 } },
    ],
    [{ exists: true, value: null }, { exists: true }],
    { planId: 'p', note: 'n' },
  );
  assert.match(
    migration_sql,
    /SET description = 'l\\'été'\n WHERE id = 4 AND description IS NULL;/,
  );
  assert.match(migration_sql, /DELETE FROM zone_species WHERE zone_id = 'z1' AND plant_id = 4;/);
  assert.match(
    rollback_sql,
    /INSERT IGNORE INTO zone_species \(zone_id, plant_id\) VALUES \('z1', 4\);/,
  );
  assert.match(
    rollback_sql,
    /SET description = NULL\n WHERE id = 4 AND BINARY description = BINARY 'l\\'été';/,
  );
});

test('seuil d’anonymat : effectifs 1 à 4 masqués', () => {
  assert.equal(threshold(0), 0);
  assert.equal(threshold(1), '<5');
  assert.equal(threshold(4), '<5');
  assert.equal(threshold(5), 5);
});

test('accès aux outils : portée, permission et drapeau', () => {
  const def = {
    requires: { scope: 'foretmap.write', permission: ['mcp.use', 'mcp.write'], flag: 'write' },
  };
  const full = {
    scopes: ['foretmap.read', 'foretmap.write'],
    permissions: ['mcp.use', 'mcp.write'],
    flags: { write: true },
  };
  assert.equal(checkToolAccess(def, full).ok, true);
  assert.equal(checkToolAccess(def, { ...full, flags: { write: false } }).ok, false);
  assert.equal(checkToolAccess(def, { ...full, scopes: ['foretmap.read'] }).ok, false);
  assert.equal(checkToolAccess(def, { ...full, permissions: ['mcp.use'] }).ok, false);
});

test('configuration : écriture active par défaut, SQL et connecteur coupés par défaut', () => {
  const saved = { ...process.env };
  try {
    delete process.env.MCP_ENABLED;
    delete process.env.MCP_WRITE_ENABLED;
    delete process.env.MCP_SQL_ENABLED;
    const { getMcpConfig } = require('../lib/mcp/config');
    const cfg = getMcpConfig();
    assert.equal(cfg.enabled, false);
    assert.equal(cfg.writeEnabled, true);
    assert.equal(cfg.sqlEnabled, false);
    assert.equal(cfg.accessTokenTtlSeconds, 3600);
    assert.equal(cfg.refreshTokenTtlDays, 30);
    process.env.MCP_WRITE_ENABLED = 'false';
    assert.equal(getMcpConfig().writeEnabled, false);
  } finally {
    process.env = saved;
  }
});
