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
      hooks: ['studentDelete', 'afterStudentDelete'],
      mergeSpecialForeignKeys: ['gl_players.linked_foretmap_user_id'],
    },
    {
      domain: 'Vie sociale — forum',
      product: 'foret',
      hooks: ['studentDelete', 'afterStudentDelete', 'groupDetach', 'mergeRefs'],
      mergeSpecialForeignKeys: [],
    },
    {
      domain: 'Vie sociale — commentaires contextuels',
      product: 'foret',
      hooks: ['studentDelete', 'afterStudentDelete', 'mergeRefs'],
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
    {
      domain: 'Carnet personnel',
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
    contributions: {
      forumImagePaths: [],
      contextCommentImagePaths: [],
      affectedTaskIds: [],
      affectedMapIds: [],
      taskLogImagePaths: [],
      speciesObservationPhotoPaths: [],
      userJournalAssetPaths: [],
      userJournalDirectory: 'user-journal/eleve-1',
    },
  });
  const tables = tx.calls.map((c) => /(?:FROM|INTO|UPDATE)\s+(\w+)/i.exec(c.sql)[1]);
  assert.deepEqual(tables, [
    // Lecture des chemins d'images avant chaque suppression : fichiers supprimés après validation.
    'forum_posts',
    'forum_post_reactions',
    'forum_reports',
    'forum_posts',
    'forum_threads',
    'context_comments',
    'context_comment_reactions',
    'context_comment_reports',
    'context_comments',
    'user_roles',
    'password_reset_tokens',
    // Effacement RGPD (RG3, audit du 30/09/2026) : IP/UA, libellés d'audit, activité ; la
    // table d'échafaudage `elevation_audit` n'est touchée que si elle existe encore.
    'security_events',
    'audit_log',
    'user_activity_events',
    'INFORMATION_SCHEMA',
    'task_assignments',
    'task_logs',
    'task_assignments',
    'task_logs',
    // Observations d'espèces : lecture des chemins de photos, supprimées après validation.
    'species_observation_photos',
    // Carnet personnel : chemins des pièces jointes, supprimées (avec le dossier) après validation.
    'user_journal_article_assets',
  ]);
  assert.ok(
    tx.calls.every((c) => !/gl_/.test(c.sql)),
    'aucune requête G&L quand le produit est sauté',
  );
});

test('suppression d’un élève : les images jointes sont relevées puis supprimées après validation', async () => {
  const tx = fakeTx((sql) => {
    if (/SELECT p\.image_paths_json/.test(sql)) {
      return [{ image_paths_json: '["forum-posts/p1/0.jpg","../evasion.jpg"]' }];
    }
    if (/SELECT image_paths_json FROM context_comments/.test(sql)) {
      return [{ image_paths_json: '["context-comments/c1/0.jpg","forum-posts/intrus.jpg"]' }];
    }
    if (/SELECT image_path FROM task_logs/.test(sql)) return [{ image_path: 'task-logs/7.jpg' }];
    if (/SELECT asset_path FROM user_journal_article_assets/.test(sql)) {
      return [{ asset_path: 'user-journal/eleve-4/1.jpg' }];
    }
    if (/^\s*SELECT DISTINCT task_id/.test(sql)) return [];
    return undefined;
  });
  const out = await runStudentDeleteCleaners(
    tx,
    { id: 'eleve-4', first_name: 'D', last_name: 'E' },
    { skipProducts: ['gl'] },
  );
  assert.equal(out.ok, true);
  assert.deepEqual(out.contributions.forumImagePaths, ['forum-posts/p1/0.jpg']);
  assert.deepEqual(out.contributions.contextCommentImagePaths, ['context-comments/c1/0.jpg']);
  assert.deepEqual(out.contributions.taskLogImagePaths, ['task-logs/7.jpg']);

  // Suites : chaque domaine supprime ses fichiers — jamais si la suppression a échoué.
  const uploads = require('../lib/uploads');
  const original = uploads.deleteFile;
  const originalDir = uploads.deleteDirectory;
  const deleted = [];
  const deletedDirs = [];
  uploads.deleteFile = (p) => deleted.push(p);
  uploads.deleteDirectory = (p) => deletedDirs.push(p);
  try {
    // Les modules ont capturé `deleteFile` au chargement : on les recharge sous l’espion.
    for (const mod of [
      '../lib/accounts/cleanerRegistry',
      '../lib/social/accountCleaners',
      '../lib/tasks/accountCleaners',
      '../lib/observations/accountCleaners',
      '../lib/accounts/userJournalAccountCleaners',
    ]) {
      delete require.cache[require.resolve(mod)];
    }
    const fresh = require('../lib/accounts/cleanerRegistry');
    await fresh.runAfterStudentDeleteCleaners({ ok: false }, out.contributions);
    await fresh.runAfterStudentDeleteCleaners({ ok: true, affectedTaskIds: [] }, out.contributions);
  } finally {
    uploads.deleteFile = original;
    uploads.deleteDirectory = originalDir;
  }
  assert.deepEqual(deleted.sort(), [
    'context-comments/c1/0.jpg',
    'forum-posts/p1/0.jpg',
    'task-logs/7.jpg',
    'user-journal/eleve-4/1.jpg',
  ]);
  // Dossier du carnet (RG3) : supprimé une seule fois, et jamais si la suppression a échoué.
  assert.deepEqual(deletedDirs, ['user-journal/eleve-4']);
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
