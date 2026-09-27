'use strict';

/**
 * Registre des nettoyeurs de compte (`lib/accounts/cleanerRegistry.js`) — sans base : les
 * déclarations de chaque domaine, leur ordre, et l'orchestration sur un exécuteur factice.
 * Les effets réels en base sont figés par `tests/account-cleaners-characterization.test.js`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  describeAccountCleaners,
  collectMergePolymorphicRefs,
  collectMergeSpecialForeignKeys,
  runStudentDeleteCleaners,
  runGroupDetachCleaners,
  runStudentRenameCleaners,
} = require('../lib/accounts/cleanerRegistry');
const { POLYMORPHIC_REFS } = require('../lib/accountMerge');

/** Exécuteur factice : consigne chaque requête, répond par `answer(sql)`. */
function fakeTx(answer = () => undefined) {
  const calls = [];
  const run = (sql, params) => {
    calls.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
    return answer(sql, params);
  };
  return {
    calls,
    queryOne: async (sql, params) => run(sql, params),
    queryAll: async (sql, params) => run(sql, params) || [],
    execute: async (sql, params) => run(sql, params) || { affectedRows: 0 },
  };
}

test('chaque domaine déclare ses nettoyeurs, le produit G&L à part', () => {
  assert.deepEqual(describeAccountCleaners(), [
    {
      domain: 'Gnomes & Licornes (joueur lié)',
      product: 'gl',
      hooks: ['studentDelete'],
      mergeSpecialForeignKeys: ['gl_players.linked_foretmap_user_id'],
    },
    {
      domain: 'Vie sociale — forum',
      product: 'foret',
      hooks: ['studentDelete', 'groupDetach', 'mergeRefs'],
      mergeSpecialForeignKeys: [],
    },
    {
      domain: 'Vie sociale — commentaires contextuels',
      product: 'foret',
      hooks: ['studentDelete', 'mergeRefs'],
      mergeSpecialForeignKeys: [],
    },
    {
      domain: 'Identité — profils, jetons et journaux',
      product: 'foret',
      hooks: ['studentDelete', 'mergeRefs'],
      mergeSpecialForeignKeys: [],
    },
    {
      domain: 'Tâches',
      product: 'foret',
      hooks: ['studentDelete', 'afterStudentDelete', 'groupDetach', 'studentRename'],
      mergeSpecialForeignKeys: [],
    },
    {
      domain: 'Observations',
      product: 'foret',
      hooks: ['studentDelete', 'afterStudentDelete'],
      mergeSpecialForeignKeys: [],
    },
  ]);
});

test('fusion : colonnes polymorphes dans l’ordre historique, joueur G&L laissé à sa règle', () => {
  const expected = [
    { table: 'forum_threads', typeColumn: 'author_user_type', idColumn: 'author_user_id' },
    { table: 'forum_posts', typeColumn: 'author_user_type', idColumn: 'author_user_id' },
    { table: 'forum_reports', typeColumn: 'reporter_user_type', idColumn: 'reporter_user_id' },
    { table: 'forum_post_reactions', typeColumn: 'reactor_user_type', idColumn: 'reactor_user_id' },
    { table: 'context_comments', typeColumn: 'author_user_type', idColumn: 'author_user_id' },
    {
      table: 'context_comment_reports',
      typeColumn: 'reporter_user_type',
      idColumn: 'reporter_user_id',
    },
    {
      table: 'context_comment_reactions',
      typeColumn: 'reactor_user_type',
      idColumn: 'reactor_user_id',
    },
    {
      table: 'password_reset_tokens',
      typeColumn: 'user_type',
      idColumn: 'user_id',
      dropInstead: true,
    },
    { table: 'user_roles', typeColumn: 'user_type', idColumn: 'user_id', dropInstead: true },
    { table: 'elevation_audit', typeColumn: 'user_type', idColumn: 'user_id' },
    { table: 'security_events', typeColumn: 'actor_user_type', idColumn: 'actor_user_id' },
    { table: 'audit_log', typeColumn: 'actor_user_type', idColumn: 'actor_user_id' },
  ];
  assert.deepEqual(collectMergePolymorphicRefs(), expected);
  assert.deepEqual(POLYMORPHIC_REFS, expected);
  assert.deepEqual(collectMergeSpecialForeignKeys(), ['gl_players.linked_foretmap_user_id']);
  // Copies : un appelant ne modifie pas les déclarations.
  collectMergePolymorphicRefs()[0].table = 'modifie';
  assert.equal(collectMergePolymorphicRefs()[0].table, 'forum_threads');
});

test('suppression d’un élève : ordre des domaines, produit G&L sautable, contributions', async () => {
  const tx = fakeTx((sql) => (/^\s*SELECT DISTINCT task_id/.test(sql) ? [] : undefined));
  const out = await runStudentDeleteCleaners(
    tx,
    { id: 'eleve-1', first_name: 'Ada', last_name: 'L' },
    { skipProducts: ['gl'] },
  );
  assert.deepEqual(out, {
    ok: true,
    contributions: { affectedTaskIds: [], affectedMapIds: [], speciesObservationPhotoPaths: [] },
  });
  const tables = tx.calls.map((c) => /(?:FROM|INTO|UPDATE)\s+(\w+)/i.exec(c.sql)[1]);
  assert.deepEqual(tables, [
    'forum_post_reactions',
    'forum_reports',
    'forum_posts',
    'forum_threads',
    'context_comment_reactions',
    'context_comment_reports',
    'context_comments',
    'user_roles',
    'password_reset_tokens',
    'task_assignments',
    'task_assignments',
    'task_logs',
    // Observations d'espèces : lecture des chemins de photos, supprimées après validation.
    'species_observation_photos',
  ]);
  assert.ok(
    tx.calls.every((c) => !/gl_/.test(c.sql)),
    'aucune requête G&L quand le produit est sauté',
  );
});

test('suppression d’un élève : le refus du produit G&L arrête les autres domaines', async () => {
  // Joueur lié retenu par une partie en cours : `purgeLinkedGlPlayer` refuse, tel quel.
  const tx = fakeTx((sql) => {
    if (/FROM gl_players/.test(sql)) return { id: 42 };
    if (/COUNT\(\*\)/.test(sql)) return { c: 1 };
    return undefined;
  });
  const out = await runStudentDeleteCleaners(tx, {
    id: 'eleve-2',
    first_name: 'B',
    last_name: 'C',
  });
  assert.deepEqual(out, {
    ok: false,
    abort: { reason: 'gl_player_in_active_game', glPlayerId: 42 },
  });
  assert.equal(tx.calls.length, 2, 'aucun autre domaine nettoyé');
});

test('suppression d’un groupe et renommage : ordre des domaines', async () => {
  const tx = fakeTx();
  await runGroupDetachCleaners(tx, 'groupe-1');
  assert.deepEqual(
    tx.calls.map((c) => [c.sql, c.params]),
    [
      ['UPDATE tasks SET group_id = NULL WHERE group_id = ?', ['groupe-1']],
      ['UPDATE forum_threads SET group_id = NULL WHERE group_id = ?', ['groupe-1']],
      // `observation_logs` : plus d'écriture (temps 2) ; la clé étrangère détache le groupe.
    ],
  );

  const db = fakeTx();
  await runStudentRenameCleaners({ studentId: 'eleve-3', firstName: 'Nou', lastName: 'Veau' }, db);
  assert.deepEqual(
    db.calls.map((c) => [c.sql, c.params]),
    [
      [
        'UPDATE task_assignments SET student_first_name = ?, student_last_name = ? WHERE student_id = ?',
        ['Nou', 'Veau', 'eleve-3'],
      ],
      [
        'UPDATE task_logs SET student_first_name = ?, student_last_name = ? WHERE student_id = ?',
        ['Nou', 'Veau', 'eleve-3'],
      ],
    ],
  );
});
