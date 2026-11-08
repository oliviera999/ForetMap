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

test('SELECT libre : contournements de la liste blanche refusés (AST, B1)', () => {
  assert.equal(validateSelectSql(' SELECT 1 FROM plants '), 'SELECT 1 FROM plants');
  for (const sql of [
    "SELECT id FROM plants WHERE name = 'a b @c users'",
    "SELECT CAST(id AS CHAR), HEX(name), CONCAT(name, 'x') FROM plants",
    'SELECT id FROM plants\tWHERE id > 1\nORDER BY id',
    'SELECT p.id, COUNT(*) AS n FROM plants p JOIN zone_species zs ON zs.plant_id = p.id GROUP BY p.id',
    'WITH x AS (SELECT id FROM plants) SELECT * FROM x',
    'SELECT * FROM (SELECT id FROM plants) t',
    'SELECT id FROM plants UNION SELECT plant_id FROM zone_species',
    'SELECT EXISTS(SELECT 1 FROM zones) FROM plants',
    "SELECT CASE WHEN photo IS NULL THEN 'a' ELSE 'b' END FROM plants",
  ]) {
    assert.doesNotThrow(() => validateSelectSql(sql), sql);
  }
  const rejected = [
    '',
    // Constat B1 : table parenthésée, sous-requêtes, CTE, UNION, jointure.
    'SELECT * FROM (users)',
    'SELECT * FROM ((users))',
    'SELECT 1 FROM plants JOIN (users) ON 1',
    'SELECT id FROM plants WHERE id IN (SELECT id FROM (users))',
    'SELECT * FROM plants WHERE id IN (SELECT plant_id FROM (SELECT * FROM (users)) z)',
    'WITH x AS (SELECT * FROM users) SELECT * FROM x',
    'WITH plants AS (SELECT * FROM users) SELECT * FROM plants',
    'SELECT id FROM plants UNION SELECT id FROM users',
    'SELECT (SELECT email FROM users LIMIT 1) AS x FROM plants',
    'SELECT * FROM plants p, users u',
    'SELECT * FROM (forum_posts)',
    'SELECT * FROM (context_comments)',
    'SELECT * FROM (species_observations)',
    'SELECT * FROM (gl_players)',
    // Commentaires, guillemets obliques, base qualifiée, casse mixte.
    'SELECT * FROM/**/users',
    'SELECT * FROM `users`',
    'SELECT * FROM foretmap.users',
    'SELECT * FROM `foretmap_test`.`plants`',
    'sElEcT * FrOm UsErS',
    'SELECT * FROM information_schema.tables',
    'SELECT * FROM mysql.user',
    'SELECT * FROM performance_schema.threads',
    // Instructions, écriture, verrous, variables, fonctions.
    'SELECT 1; SELECT 2',
    'SELECT 1 FROM plants; DROP TABLE plants',
    'DELETE FROM plants',
    'UPDATE plants SET name = 1',
    'SHOW TABLES',
    "SELECT * FROM plants INTO OUTFILE '/tmp/x'",
    'SELECT * INTO @x FROM plants',
    'SELECT * FROM plants FOR UPDATE',
    'SELECT * FROM plants LOCK IN SHARE MODE',
    'SELECT @@version',
    'SELECT @a := 1 FROM plants',
    'SELECT SLEEP(1) FROM plants',
    'SELECT BENCHMARK(1, 1) FROM plants',
    "SELECT GET_LOCK('a', 1) FROM plants",
    "SELECT LOAD_FILE('/etc/passwd') FROM plants",
    'SELECT x.y() FROM plants',
    // Traces d'élèves et colonnes nominatives.
    'SELECT * FROM user_quiz_attempts',
    'SELECT created_by FROM id_keys',
    'SELECT u.email FROM plants JOIN users u ON 1',
  ];
  for (const sql of rejected) {
    assert.throws(() => validateSelectSql(sql), undefined, `doit être refusé : ${sql}`);
  }
});

test('SELECT libre : commentaires exécutables et texte non canonique refusés en amont (contre-vérification B1)', () => {
  const fw = (c) => String.fromCodePoint(c);
  const rejected = [
    // Commentaires exécutables MariaDB / MySQL : le parseur les ignore, le serveur les exécute.
    'SELECT id FROM plants /*!UNION SELECT id FROM users*/',
    'SELECT id FROM plants /*!50000 UNION SELECT email FROM users*/',
    'SELECT id FROM plants /*M!100100 UNION SELECT email FROM users*/',
    'SELECT id FROM plants /*!*/',
    "SELECT /*!LOAD_FILE('/etc/passwd')*/ FROM plants",
    'SELECT /*!CURRENT_USER()*/ FROM plants',
    'SELECT /*!USER()*/ FROM plants',
    'SELECT /*!SLEEP(5)*/ FROM plants',
    'SELECT /*!BENCHMARK(1000000, 1)*/ FROM plants',
    'SELECT /*!DATABASE()*/ FROM plants',
    // Commentaires ordinaires, imbriqués, de fin de ligne, sans espace.
    'SELECT 1 /* commentaire */ FROM plants',
    'SELECT id FROM plants /* a /* b */ c */',
    'SELECT id FROM plants */',
    'SELECT id FROM plants # UNION SELECT email FROM users',
    'SELECT id FROM plants --x',
    'SELECT id FROM plants -- x',
    "SELECT id FROM plants WHERE name = 'a#b'",
    // Plusieurs instructions, y compris un « ; » final.
    'SELECT id FROM plants;',
    'SELECT id FROM plants; SELECT email FROM users',
    "SELECT id FROM plants WHERE name = ';'",
    // Unicode : barre et astérisque pleine chasse (NFKC → « /* »), lettres pleine chasse.
    `SELECT id FROM plants ${fw(0xff0f)}${fw(0xff0a)}!UNION SELECT email FROM users${fw(0xff0a)}${fw(0xff0f)}`,
    `SELECT id FROM plants ${fw(0xff03)} x`,
    `SELECT id FROM plants${fw(0xff1b)} SELECT 1`,
    `SELECT * FROM ${fw(0xff55)}sers`,
    // Caractères de contrôle et de format.
    'SELECT id FROM plants\u0000',
    'SELECT id​ FROM plants',
    'SELECT id FROM plants ',
    'SELECT id FROM plants‮',
    // Fonctions d'identité, d'environnement, de fichier ou de temporisation.
    "SELECT LOAD_FILE('/etc/passwd') FROM plants",
    'SELECT CURRENT_USER() FROM plants',
    'SELECT CURRENT_USER FROM plants',
    'SELECT USER() FROM plants',
    'SELECT SYSTEM_USER() FROM plants',
    'SELECT DATABASE() FROM plants',
    'SELECT SCHEMA() FROM plants',
    'SELECT VERSION() FROM plants',
    'SELECT CONNECTION_ID() FROM plants',
    'SELECT CURRENT_ROLE() FROM plants',
    'SELECT SLEEP(1) FROM plants',
    'SELECT BENCHMARK(1, 1) FROM plants',
    // Noms non qualifiés d'information_schema / mysql : hors liste blanche.
    'SELECT * FROM tables',
    'SELECT TABLE_NAME FROM TABLES',
    'SELECT * FROM columns',
    'SELECT * FROM schemata',
    'SELECT * FROM user',
    'SELECT * FROM global_variables',
  ];
  for (const sql of rejected) {
    assert.throws(
      () => validateSelectSql(sql),
      undefined,
      `doit être refusé : ${JSON.stringify(sql)}`,
    );
  }
});

test('droits réels du compte DB_MCP_USER : seules des lignes exactement admises (contre-vérification B1)', () => {
  const { evaluateGrants } = require('../lib/mcp/readOnlyGrants');
  const db = 'base_test';
  const usage = "GRANT USAGE ON *.* TO `fmcp_ro`@`localhost` IDENTIFIED BY PASSWORD '*ABCDEF'";
  const sel = (t, d = db) => `GRANT SELECT ON \`${d}\`.\`${t}\` TO \`fmcp_ro\`@\`localhost\``;
  const ok = evaluateGrants([usage, sel('plants'), sel('zones')], db);
  assert.deepEqual(ok, { ok: true, tables: ['plants', 'zones'] });
  assert.equal(
    evaluateGrants(
      [usage, 'GRANT SELECT (`id`, `name`) ON `base_test`.`plants` TO `fmcp_ro`@`localhost`'],
      db,
    ).ok,
    true,
    'droit de colonnes admis',
  );
  const refused = {
    'aucun droit lisible': [],
    'aucune table de contenu lisible': [usage],
    'droit global autre que USAGE': [usage.replace('USAGE', 'SELECT'), sel('plants')],
    'droit au niveau de la base': [usage, 'GRANT SELECT ON `base_test`.* TO `fmcp_ro`@`localhost`'],
    'droit non reconnu (refusé par défaut)': [
      usage,
      'GRANT SELECT, INSERT ON `base_test`.`plants` TO `fmcp_ro`@`localhost`',
    ],
    'table hors liste blanche (users)': [usage, sel('plants'), sel('users')],
    'droit sur une autre base (autre)': [usage, sel('plants', 'autre')],
    'rôle attribué': [usage, sel('plants'), 'GRANT `lecteur` TO `fmcp_ro`@`localhost`'],
    'droit PROXY': [usage, "GRANT PROXY ON ''@'%' TO 'fmcp_ro'@'localhost'"],
    'droit de transmission (WITH GRANT OPTION)': [usage, `${sel('plants')} WITH GRANT OPTION`],
  };
  for (const [reason, lines] of Object.entries(refused)) {
    const r = evaluateGrants(lines, db);
    assert.equal(r.ok, false, reason);
    assert.equal(r.reason, reason);
  }
  for (const odd of [
    'GRANT EXECUTE ON PROCEDURE `base_test`.`p` TO `fmcp_ro`@`localhost`',
    'GRANT UPDATE ON `base_test`.`plants` TO `fmcp_ro`@`localhost`',
    'GRANT ALL PRIVILEGES ON `base_test`.`plants` TO `fmcp_ro`@`localhost`',
    'GRANT FILE ON *.* TO `fmcp_ro`@`localhost`',
    'quelque chose d’inattendu',
  ]) {
    assert.equal(evaluateGrants([usage, sel('plants'), odd], db).ok, false, odd);
  }
});

test('droits réels : PUBLIC, rôle actif, erreurs 1141/1064, cache (troisième relecture)', async () => {
  const {
    checkReadOnlyGrants,
    evaluatePublicGrants,
    resetGrantsCacheForTests,
  } = require('../lib/mcp/readOnlyGrants');
  assert.deepEqual(evaluatePublicGrants([]), { ok: true });
  assert.deepEqual(evaluatePublicGrants(['GRANT USAGE ON *.* TO PUBLIC']), { ok: true });
  for (const line of [
    'GRANT SELECT ON `foretmap_test`.`users` TO PUBLIC',
    'GRANT SELECT ON `foretmap_test`.* TO PUBLIC',
    'GRANT SELECT ON `foretmap_test`.`plants` TO PUBLIC',
  ]) {
    assert.deepEqual(evaluatePublicGrants([line]), { ok: false, reason: 'droit accordé à PUBLIC' });
  }
  const prevDb = process.env.DB_NAME;
  process.env.DB_NAME = 'base_test';
  const own = [
    "GRANT USAGE ON *.* TO `fmcp_ro`@`localhost` IDENTIFIED BY PASSWORD '*AB'",
    'GRANT SELECT ON `base_test`.`plants` TO `fmcp_ro`@`localhost`',
  ];
  const fakePool = ({ publicRows, publicErr, role = null, calls }) => ({
    async query(sql) {
      calls?.push(sql);
      if (sql === 'SHOW GRANTS FOR CURRENT_USER()') return [own.map((g) => ({ g }))];
      if (sql === 'SHOW GRANTS FOR PUBLIC') {
        if (publicErr) throw Object.assign(new Error('x'), { errno: publicErr });
        return [(publicRows || []).map((g) => ({ g }))];
      }
      if (/CURRENT_ROLE/.test(sql)) return [[{ r: role }]];
      throw new Error(`inattendu : ${sql}`);
    },
  });
  try {
    const run = async (opts) => {
      resetGrantsCacheForTests();
      return checkReadOnlyGrants(() => fakePool(opts), { force: true });
    };
    assert.equal((await run({})).ok, true);
    assert.equal((await run({ publicErr: 1141 })).ok, true, '1141 : aucun droit PUBLIC');
    assert.equal((await run({ publicErr: 1064 })).ok, true, 'MySQL sans PUBLIC');
    assert.deepEqual(await run({ publicErr: 1045 }), {
      ok: false,
      reason: 'droits illisibles (erreur)',
    });
    assert.deepEqual(await run({ publicRows: ['GRANT SELECT ON `base_test`.`users` TO PUBLIC'] }), {
      ok: false,
      reason: 'droit accordé à PUBLIC',
    });
    assert.deepEqual(await run({ role: 'lecteur' }), { ok: false, reason: 'rôle actif' });
    assert.equal((await run({ role: 'NONE' })).ok, true);
    // Cache : sans `force`, un second appel dans la minute ne relit pas les droits.
    resetGrantsCacheForTests();
    const calls = [];
    await checkReadOnlyGrants(() => fakePool({ calls }));
    const n = calls.length;
    await checkReadOnlyGrants(() => fakePool({ calls }));
    assert.equal(calls.length, n);
    await checkReadOnlyGrants(() => fakePool({ calls }), { force: true });
    assert.ok(calls.length > n, 'force : relecture');
  } finally {
    process.env.DB_NAME = prevDb;
    resetGrantsCacheForTests();
  }
});

test('texte SQL brut : refus NFKC isolé (forme non canonique sans caractère interdit)', () => {
  const { assertPlainSqlText } = require('../lib/mcp/sqlAst');
  // « ﬁ » (U+FB01) se normalise en « fi » : aucun caractère interdit, seule la règle NFKC refuse.
  const lig = `SELECT id FROM plants WHERE name = '${String.fromCodePoint(0xfb01)}g'`;
  assert.throws(() => assertPlainSqlText(lig), /NFKC/);
  assert.throws(() => validateSelectSql(lig), /NFKC/);
  // Exposant ² (U+00B2) → 2 : même règle.
  assert.throws(
    () => assertPlainSqlText(`SELECT ${String.fromCodePoint(0xb2)} FROM plants`),
    /NFKC/,
  );
  assert.equal(assertPlainSqlText('SELECT id FROM plants'), 'SELECT id FROM plants');
});

test('script de droits : un GRANT SELECT par table de contenu, rien d’autre', () => {
  const { buildGrants } = require('../scripts/mcp-print-grants');
  const out = buildGrants({ db: 'base_test', user: 'fmcp_ro', host: 'localhost' });
  const grants = out.split('\n').filter((l) => l.startsWith('GRANT'));
  assert.equal(grants.length, guard.CONTENT_TABLES.size);
  for (const g of grants) {
    assert.match(g, /^GRANT SELECT ON `base_test`\.`[a-z0-9_]+` TO 'fmcp_ro'@'localhost';$/);
  }
  assert.ok(!/`users`|`user_|`oauth_|`mcp_/.test(out));
  assert.throws(() => buildGrants({ db: 'x; DROP', user: 'u' }));
  const filtered = buildGrants({ db: 'b', user: 'u', existingTables: new Set(['plants']) });
  assert.equal(filtered.split('\n').filter((l) => l.startsWith('GRANT')).length, 1);
});

test('journaux MCP : liste blanche de champs, identifiants retirés (contre-vérification I2)', () => {
  const { createLogSanitizer, routeOf } = require('../lib/mcp/logSanitizer');
  const uuid = '2005bf0e-4736-48f7-b2ee-dca6c2c9bf06';
  const uuidCompact = uuid.replace(/-/g, '');
  const reqId = 'c0ffee00-1111-4abc-8def-0a0b0c0d0e0f';
  const entry = {
    level: 40,
    time: 1793670776347,
    pid: 4242,
    hostname: 'vm-prod',
    msg: `Duplication avatar ignorée pour ${uuidCompact} (lot 98765) depuis 192.168.0.9`,
    requestId: reqId,
    method: 'POST',
    statusCode: 500,
    durationMs: 12.5,
    path: '/api/gl/players/4217/journal',
    // Clés imprévues par l'ancienne liste noire : toutes doivent disparaître.
    newId: 'f1e2d3c4b5a6978877665544332211ff',
    sourceId: uuid,
    author: 'Camille Martin',
    teamId: 31337,
    studentIds: [uuid, 'abc-élève'],
    ctx: { student: { id: 'stu_nested_7781', pseudo: 'renard-roux' } },
    pseudo: 'licorne-bleue',
    marker: 'i2_marker',
    err: {
      type: 'Error',
      code: 'ER_DUP_ENTRY',
      message: `Duplicate entry '${uuid}' for key 'PRIMARY' (id 45678)`,
      stack: 'Error: at /home/app/routes/students.js:272',
      sql: 'INSERT INTO users …',
      student: { email: 'a.b@example.test' },
    },
  };
  const s = createLogSanitizer();
  const out = s.sanitizeLogLine(JSON.stringify(entry));
  const text = JSON.stringify(out);
  assert.deepEqual(Object.keys(out).sort(), [
    'durationMs',
    'err',
    'level',
    'method',
    'msg',
    'requestId',
    'route',
    'statusCode',
    'time',
  ]);
  assert.deepEqual(Object.keys(out.err).sort(), ['code', 'message', 'type']);
  for (const leak of [
    uuid,
    uuidCompact,
    'f1e2d3c4b5a6978877665544332211ff',
    'Camille',
    '31337',
    'abc-élève',
    'stu_nested_7781',
    'renard-roux',
    'licorne-bleue',
    'i2_marker',
    '4217',
    '98765',
    '45678',
    '192.168.0.9',
    'a.b@example.test',
    'students.js',
    'vm-prod',
    '4242',
  ]) {
    assert.ok(!text.includes(leak), `${leak} ne doit pas sortir : ${text}`);
  }
  assert.equal(out.route, 'autre', 'chemin sans gabarit Express : jamais transmis');
  assert.equal(out.requestId, reqId, 'requestId généré par le serveur conservé (corrélation)');
  assert.equal(out.statusCode, 500);
  assert.equal(out.durationMs, 12.5);
  assert.equal(out.err.code, 'ER_DUP_ENTRY');
  assert.match(out.msg, /id#[0-9a-f]{6}/);
  assert.match(out.msg, /\[n\]/);
  assert.match(out.msg, /ip#[0-9a-f]{6}/);
  // Littéraux cités de `err.message` remplacés (la valeur en double est souvent nominative).
  assert.equal(out.err.message, "Duplicate entry '[valeur]' for key '[valeur]' (id [n])");
  assert.deepEqual(s.sanitizeLogLine(JSON.stringify(entry)), out);
  assert.notEqual(createLogSanitizer().sanitizeLogLine(JSON.stringify(entry)).msg, out.msg);
  // Gabarit Express prioritaire sur le chemin ; requestId client → pseudonyme.
  const tpl = s.sanitizeLogEntry({
    route: '/api/tasks/:id/done',
    path: '/api/tasks/77/done',
    requestId: 'client-chosen-id-42',
    method: 'TRACE',
  });
  assert.equal(tpl.route, '/api/tasks/:id/done');
  assert.match(tpl.requestId, /^req#[0-9a-f]{6}$/);
  assert.equal(tpl.method, undefined);
  // Route : gabarit Express seulement ; un chemin, même d'allure anodine, devient « autre ».
  for (const [tplIn, path, want] of [
    ['/api/tasks/:id/done', '/api/tasks/77/done', '/api/tasks/:id/done'],
    [undefined, '/api/students/c04-mv/profile', 'autre'],
    [undefined, '/api/visit/zone-Lea_Martin', 'autre'],
    [undefined, '/api/tasks', 'autre'],
    ['/api/users/lea.martin@example.test', undefined, 'autre'],
    ['/api/visit/zone Lea', undefined, 'autre'],
    [undefined, undefined, undefined],
  ]) {
    assert.equal(routeOf(tplIn, path), want, `${tplIn} | ${path}`);
  }
  // Littéraux cités : `msg` et `err.message` ; élision intacte ; code et type d'erreur.
  assert.equal(
    s.cleanText("Duplicate entry 'lea.martin' for key 'users.pseudo'"),
    "Duplicate entry '[valeur]' for key '[valeur]'",
  );
  assert.equal(s.cleanText('Élève "Léa Martin" absent'), "Élève '[valeur]' absent");
  assert.equal(s.cleanText("l'outil n'a pas répondu"), "l'outil n'a pas répondu");
  const errs = s.sanitizeLogEntry({
    msg: "pseudo 'lea.martin' déjà pris",
    err: { type: 'lea.martin', code: 'Lea Martin', message: 'x' },
  });
  assert.equal(errs.msg, "pseudo '[valeur]' déjà pris");
  assert.equal(errs.err.type, '[valeur]');
  assert.equal(errs.err.code, '[valeur]');
  const okErr = s.sanitizeLogEntry({ err: { type: 'TypeError', code: 1062 } });
  assert.deepEqual(okErr.err, { type: 'TypeError', code: 1062 });
  assert.equal(s.sanitizeLogEntry({ err: { code: 'ER_DUP_ENTRY' } }).err.code, 'ER_DUP_ENTRY');
  // Texte libre : heures, versions et petits nombres intacts ; nom en clair = limite assumée.
  assert.equal(s.cleanText('à 12:30:45, v1.22, 2 essais'), 'à 12:30:45, v1.22, 2 essais');
  assert.match(s.cleanText('mail a.b@example.test'), /\[e-mail masqué\]/);
  assert.match(s.cleanText('fe80::1:2 refusé'), /^ip#[0-9a-f]{6} refusé$/);
  // Ligne non JSON : texte nettoyé seulement.
  assert.deepEqual(Object.keys(s.sanitizeLogLine(`brut ${uuid}`)), ['msg']);
});

test('diagnostics MCP : liste blanche de champs (contre-vérification I2)', () => {
  const { createLogSanitizer } = require('../lib/mcp/logSanitizer');
  const uuid = '2005bf0e-4736-48f7-b2ee-dca6c2c9bf06';
  const out = createLogSanitizer().sanitizeDiagnostics({
    ts: '2026-11-03T01:00:00.000Z',
    version: '1.300.0',
    nodeEnv: 'production',
    uptimeSeconds: 12,
    memory: { rssMb: 80, heapUsedMb: 40, owner: 'x' },
    database: { ok: true, latencyMs: 1.2, host: 'db.interne' },
    schema: { ok: true, current: 323, latest: 324, pending: [324] },
    logBuffer: { linesCount: 10, maxLines: 500 },
    metrics: {
      httpRequests: 9,
      http5xx: 1,
      recentHttp5xx: [
        {
          requestId: uuid,
          method: 'GET',
          path: '/api/gl/players/4217/journal',
          route: '/api/gl/players/:id/journal',
          statusCode: 500,
          at: '2026-11-03T00:59:00.000Z',
          userId: uuid,
        },
        { method: 'GET', path: '/api/visit/zone-Lea_Martin', statusCode: 500 },
      ],
      deferredWrites: { count: 1, byRoute: { '/api/tasks/:id/done': 1 } },
    },
    runtimeProcess: { pid: 1, cluster: { isWorker: false, workerId: null }, envHints: { a: 'b' } },
    restarts: {
      enabled: true,
      file: '/home/secret/boot.jsonl',
      counts: { boots: 1, crashes: 1 },
      verdict: 'stable',
      recent: [{ at: '2026-11-03T00:00:00.000Z', event: 'crash', message: `élève ${uuid}` }],
    },
    gl: { ok: true, gamesByStatus: { active: 2 } },
    extra: { student: { pseudo: 'renard-roux' } },
  });
  const text = JSON.stringify(out);
  for (const leak of [
    '4217',
    'db.interne',
    '/home/secret',
    'renard-roux',
    '"owner"',
    '"envHints"',
  ]) {
    assert.ok(!text.includes(leak), `${leak} ne doit pas sortir`);
  }
  assert.ok(!text.includes(uuid.replace(/-/g, '')) && !text.includes('"userId"'));
  assert.equal(out.metrics.recentHttp5xx[0].route, '/api/gl/players/:id/journal');
  assert.equal(out.metrics.recentHttp5xx[1].route, 'autre');
  assert.ok(!text.includes('Lea_Martin'));
  assert.equal(out.schema.latest, 324);
  assert.equal(out.restarts.counts.crashes, 1);
  assert.match(out.restarts.recent[0].message, /^élève id#[0-9a-f]{6}$/);
  assert.equal(out.gl.gamesByStatus.active, 2);
  assert.equal(out.extra, undefined);
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
    // M1 : clés héritées du prototype.
    { op: 'set_field', table: 'plants', key: { id: 1 }, column: 'constructor', value: 'x' },
    { op: 'set_field', table: 'plants', key: { id: 1 }, column: '__proto__', value: 'x' },
    { op: 'set_field', table: 'plants', key: { id: 1 }, column: 'toString', value: 'x' },
    { op: 'set_field', table: 'constructor', key: { id: 1 }, column: 'name', value: 'x' },
    { op: 'set_field', table: '__proto__', key: { id: 1 }, column: 'name', value: 'x' },
    { op: 'link', table: 'hasOwnProperty', key: { zone_id: 'z', plant_id: 1 } },
    {
      op: 'set_field',
      table: 'plants',
      key: JSON.parse('{"__proto__":{"id":5}}'),
      column: 'name',
      value: 'x',
    },
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

test('migration générée : deux corrections de la même cellule s’enchaînent', () => {
  const { buildMigration } = require('../lib/mcp/write/plans');
  // Les deux lectures voient encore la valeur d'origine : l'application en direct écrit
  // d'abord « brouillon » puis « texte final ». Sans enchaînement, le second UPDATE de la
  // migration resterait gardé par NULL et ne modifierait aucune ligne.
  const { migration_sql, rollback_sql } = buildMigration(
    [
      {
        op: 'set_field',
        table: 'plants',
        key: { id: 4 },
        column: 'description',
        value: 'brouillon',
      },
      {
        op: 'set_field',
        table: 'plants',
        key: { id: 4 },
        column: 'description',
        value: 'texte final',
      },
      { op: 'set_field', table: 'plants', key: { id: 9 }, column: 'name', value: 'Figuier' },
    ],
    [
      { exists: true, value: null },
      { exists: true, value: null },
      { exists: true, value: 'Figue' },
    ],
    { planId: 'p2' },
  );
  assert.match(
    migration_sql,
    /SET description = 'brouillon'\n WHERE id = 4 AND description IS NULL;/,
  );
  assert.match(
    migration_sql,
    /SET description = 'texte final'\n WHERE id = 4 AND BINARY description = BINARY 'brouillon';/,
  );
  assert.match(
    migration_sql,
    /SET name = 'Figuier'\n WHERE id = 9 AND BINARY name = BINARY 'Figue';/,
  );
  const nameBack = rollback_sql.indexOf("SET name = 'Figue'");
  const draftBack = rollback_sql.indexOf("SET description = 'brouillon'");
  const originBack = rollback_sql.indexOf('SET description = NULL');
  assert.ok(nameBack >= 0 && draftBack > nameBack && originBack > draftBack, rollback_sql);
  assert.match(
    rollback_sql,
    /SET description = 'brouillon'\n WHERE id = 4 AND BINARY description = BINARY 'texte final';/,
  );
  assert.match(
    rollback_sql,
    /SET description = NULL\n WHERE id = 4 AND BINARY description = BINARY 'brouillon';/,
  );
});

test('usage : fenêtres fixes seulement (M6)', () => {
  const { USAGE_WINDOWS } = require('../lib/mcp/tools/usage');
  assert.deepEqual([...USAGE_WINDOWS], [7, 30, 90, 365]);
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

test('configuration : écriture et SQL actifs par défaut, connecteur coupé par défaut', () => {
  const saved = { ...process.env };
  try {
    delete process.env.MCP_ENABLED;
    delete process.env.MCP_WRITE_ENABLED;
    delete process.env.MCP_SQL_ENABLED;
    const { getMcpConfig } = require('../lib/mcp/config');
    const cfg = getMcpConfig();
    assert.equal(cfg.enabled, false);
    assert.equal(cfg.writeEnabled, true);
    // Défaut ouvert depuis le 05/11/2026 (réglage `mcp.sql_select_enabled`).
    assert.equal(cfg.sqlEnabled, true);
    assert.equal(cfg.accessTokenTtlSeconds, 3600);
    assert.equal(cfg.refreshTokenTtlDays, 30);
    process.env.MCP_WRITE_ENABLED = 'false';
    assert.equal(getMcpConfig().writeEnabled, false);
    // Verrouillé par variable d'environnement.
    process.env.MCP_SQL_ENABLED = 'false';
    assert.equal(getMcpConfig().sqlEnabled, false);
    assert.equal(getMcpConfig().settings['mcp.sql_select_enabled'].locked, true);
  } finally {
    process.env = saved;
  }
});

test('vérité des cases G&L : promesses non tenues sur les plateaux 1-4 seulement', () => {
  const cfg = (effects, eventMeta) => JSON.stringify({ version: 2, effects, eventMeta });
  const out = checks.glMarkerPromises({
    glChapters: [
      { id: 3, slug: 'tropiques-africains', plateau_number: 1 },
      { id: 1, slug: 'foret-magique', plateau_number: null },
    ],
    glChapterMarkers: [
      // Libellé « passe ton tour » sans passTurn : erreur.
      {
        id: 11,
        chapter_id: 3,
        label: 'Tiédeur étrange',
        event_type: 'behavior',
        effet_mecanique: null,
        event_config_json: cfg(
          {
            gnome: { label: 'Gnome : recule de 1 case.', deltaMove: -1 },
            unicorn: { label: 'Licorne : passe ton tour.', passTurn: false },
          },
          { tonalite: 'souffle' },
        ),
      },
      // Texte d'auteur exact : rien.
      {
        id: 41,
        chapter_id: 3,
        label: 'Arrivée',
        event_type: 'story',
        effet_mecanique: 'Arrivée au camp. La première équipe reçoit l’honneur des Éclaireurs.',
        event_config_json: cfg({ neutral: { label: null, deltaPv: 0, deltaGems: 0 } }, null),
      },
      // Chapitre d'essai hors plateau : ignoré même s'il ment.
      {
        id: 2,
        chapter_id: 1,
        label: 'Carrefour',
        event_type: 'quiz',
        effet_mecanique: 'Bonne réponse : +1 gemme.',
        event_config_json: null,
      },
    ],
  });
  assert.deepEqual(
    out.map((f) => f.id),
    ['case:11'],
  );
  assert.match(out[0].detail, /TENIR_BRANCHE_NON_TENUE/);
});

/* ------------------------------------------- G&L « Tenir à deux » : zones, sorts, badges */

test('gl_tenir_zones : écart au réglage, zone sans question, feuillet d’un autre plateau', () => {
  const out = checks.glTenirZones({
    glTenirSettings: { enabled: true, zonesParPlateau: { 1: 2, 2: 1, 3: 0, 4: 0 } },
    glChasseZones: [
      { zone_key: 'cz-p1-01', plateau: 1, feuillet_code: 'f-p1-a', actif: 1 },
      { zone_key: 'cz-p1-02', plateau: 1, feuillet_code: 'f-p2-z', actif: 1 },
      { zone_key: 'cz-p1-03', plateau: 1, feuillet_code: 'f-p1-b', actif: 0 },
      { zone_key: 'cz-p2-01', plateau: 2, feuillet_code: 'f-p2-z', actif: 1 },
      { zone_key: 'cz-p2-02', plateau: 2, feuillet_code: 'f-p2-y', actif: 1 },
    ],
    glTenirQuestionsLecture: [
      { zone_key: 'cz-p1-01', actif: 1 },
      { zone_key: 'cz-p1-02', actif: 0 },
      { zone_key: 'cz-p2-01', actif: 1 },
      { zone_key: 'cz-p2-02', actif: 1 },
    ],
    glLoreFeuilletPlateaux: [
      { feuillet_code: 'f-p1-a', plateau_number: 1 },
      { feuillet_code: 'f-p2-z', plateau_number: 2 },
      { feuillet_code: 'f-p2-y', plateau_number: null },
    ],
  });
  const keys = out.map((f) => `${f.id}|${f.detail}`);
  // cz-p1-02 : question inactive ET feuillet du plateau 2 ; cz-p1-03 inactive : ignorée.
  assert.ok(keys.some((k) => k.startsWith('zone:cz-p1-02|zone active sans question')));
  assert.ok(keys.some((k) => k.startsWith('zone:cz-p1-02|feuillet f-p2-z du plateau 2')));
  // Plateau 1 : 2 actives pour 2 attendues (ok) ; plateau 2 : 2 pour 1 ; 3 et 4 : 0 pour 0 (ok).
  assert.deepEqual(
    out.filter((f) => f.id.startsWith('plateau:')).map((f) => f.id),
    ['plateau:2'],
  );
  assert.equal(out.length, 3);
  // Mode tenir coupé : le réglage ne compte plus, les contrôles de zone restent.
  assert.equal(
    checks.glTenirZones({
      glTenirSettings: { enabled: false, zonesParPlateau: { 1: 9 } },
      glChasseZones: [{ zone_key: 'z', plateau: 1, feuillet_code: 'f', actif: 1 }],
      glTenirQuestionsLecture: [{ zone_key: 'z', actif: 1 }],
      glLoreFeuilletPlateaux: [],
    }).length,
    0,
  );
  // Instantané illisible : contrôle neutre.
  assert.deepEqual(checks.glTenirZones({ glChasseZones: null }), []);
  assert.deepEqual(checks.glTenirZones({}), []);
});

test('gl_spells_legacy : sort officiel hors v2 seulement', () => {
  const out = checks.glSpellsLegacy({
    glSpells: [
      { spell_code: 'S01', nom: 'Vieux sort', statut: 'officiel', tenir_v2: 0 },
      { spell_code: 'S02', nom: 'Sort v2', statut: 'officiel', tenir_v2: 1 },
      { spell_code: 'S03', nom: 'Proposé', statut: 'propose', tenir_v2: 0 },
      { spell_code: 'S04', nom: 'Officiel majuscule', statut: 'Officiel', tenir_v2: null },
    ],
  });
  assert.deepEqual(ids(out), ['spell:S01', 'spell:S04']);
  assert.match(out[0].detail, /Vieux sort/);
  assert.deepEqual(checks.glSpellsLegacy({}), []);
});

test('gl_rewards_catalogue : moteur absent → 0 ; catalogue livré → clés orphelines seulement', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const delivered = fs.existsSync(path.join(__dirname, '..', 'lib', 'glRewards.js'));
  const out = checks.glRewardsCatalogue({
    glPlayerRewardKeys: [{ reward_key: 'chasse.fouilles.1' }, { reward_key: 'inconnu.badge' }],
  });
  if (!delivered) {
    // Lot parallèle non livré dans ce worktree : contrôle neutre, sans exception.
    assert.deepEqual(out, []);
  } else {
    assert.ok(!out.some((f) => f.id === 'catalogue'), 'catalogue livré valide');
    assert.ok(ids(out).includes('reward_key:inconnu.badge'));
    assert.ok(!ids(out).includes('reward_key:chasse.fouilles.1'));
  }
  // Table absente ou illisible : aucune clé examinée, aucune exception.
  assert.ok(Array.isArray(checks.glRewardsCatalogue({ glPlayerRewardKeys: null })));
});

test('registre : les trois contrôles G&L sont listés avec leurs besoins ; gl_settings reste secrète', () => {
  for (const name of ['gl_tenir_zones', 'gl_spells_legacy', 'gl_rewards_catalogue']) {
    assert.ok(checks.CHECK_NAMES.includes(name), name);
    assert.ok(checks.CHECKS[name].description && checks.CHECKS[name].hint);
  }
  assert.deepEqual(checks.CHECKS.gl_tenir_zones.needs, [
    'glChasseZones',
    'glTenirQuestionsLecture',
    'glLoreFeuilletPlateaux',
    'glTenirSettings',
  ]);
  assert.deepEqual(checks.CHECKS.gl_spells_legacy.needs, ['glSpells']);
  assert.deepEqual(checks.CHECKS.gl_rewards_catalogue.needs, ['glPlayerRewardKeys']);
  const { SNAPSHOT_SQL, TOLERANT_PARTS } = require('../lib/mcp/audits');
  for (const part of [
    'glChasseZones',
    'glTenirQuestionsLecture',
    'glLoreFeuilletPlateaux',
    'glSpells',
  ]) {
    assert.ok(SNAPSHOT_SQL[part], part);
    assert.ok(TOLERANT_PARTS.has(part), `${part} tolérant`);
    guard.assertSqlReadable(SNAPSHOT_SQL[part]);
  }
  assert.ok(!Object.values(SNAPSHOT_SQL).some((sql) => /gl_settings/i.test(sql)));
  assert.throws(() => guard.assertTableReadable('gl_settings'), /interdite/);
});
