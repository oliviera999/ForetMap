'use strict';

// G4 (audit stabilité/perf 2026-09) — imports GL : transaction et lotissement.
//
// Trois volets, vérifiés SANS base :
//  1. un import de chapitres interrompu APRÈS les suppressions (erreur injectée sur
//     l'écriture des zones) laisse la base inchangée : toutes les écritures passent
//     par les deps transactionnels, le rollback restaure tout ;
//  2. les routes d'import GL enveloppent bien l'application dans `withTransaction`
//     (test de convention sur la source — c'est le câblage qui porte la garantie) ;
//  3. les upserts partent par lots de 100 (`expandMultiRowInsertSql` + moteur commun),
//     avec un comptage created/updated identique à l'exécution unitaire.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { applyChaptersImport } = require('../lib/glChaptersImport');
const {
  IMPORT_INSERT_BATCH_SIZE,
  chunkRows,
  isBatchableInsertSql,
  expandMultiRowInsertSql,
  executeQuestionUpserts,
} = require('../lib/shared/xlsxImportCore');
const { SPELL_UPSERT_SQL } = require('../lib/glSpellsImport');

// ---------------------------------------------------------------------------------------
// 1. Import de chapitres interrompu : la base reste inchangée.
// ---------------------------------------------------------------------------------------

function createStore() {
  return {
    tables: {
      gl_chapters: [
        {
          id: 1,
          slug: 'chap-1',
          title: 'Chapitre 1',
          biome: null,
          map_image_url: null,
          story_markdown: '',
          biotope_markdown: '',
          biocenose_markdown: '',
          sortileges_markdown: '',
          souffle_face: null,
          plateau_number: null,
          order_index: 0,
        },
      ],
      gl_chapter_markers: [
        { id: 11, chapter_id: 1, label: 'Départ' },
        { id: 12, chapter_id: 1, label: 'Repère condamné' },
      ],
      gl_kingdom_zones: [{ id: 21, chapter_id: 1, label: 'Clairière' }],
      gl_teams: [{ id: 31, position_marker_id: 12 }],
    },
    markerDeleteApplied: false,
  };
}

function makeTxDeps(store) {
  return {
    async queryAll(sql, params = []) {
      const q = String(sql);
      if (/FROM gl_chapters/.test(q)) {
        return structuredClone(store.tables.gl_chapters);
      }
      if (/SELECT id, label FROM gl_chapter_markers/.test(q)) {
        return store.tables.gl_chapter_markers
          .filter((m) => Number(m.chapter_id) === Number(params[0]))
          .map((m) => ({ id: m.id, label: m.label }));
      }
      if (/SELECT id, label FROM gl_kingdom_zones/.test(q)) {
        return store.tables.gl_kingdom_zones
          .filter((z) => Number(z.chapter_id) === Number(params[0]))
          .map((z) => ({ id: z.id, label: z.label }));
      }
      throw new Error(`Lecture inattendue : ${q}`);
    },
    async execute(sql, params = []) {
      const q = String(sql);
      if (/UPDATE gl_chapter_markers/.test(q)) {
        const id = Number(params[14]);
        const marker = store.tables.gl_chapter_markers.find((m) => Number(m.id) === id);
        if (marker) marker.label = params[3];
        return { insertId: 0 };
      }
      if (/UPDATE gl_teams SET position_marker_id = NULL/.test(q)) {
        for (const team of store.tables.gl_teams) {
          if (params.map(Number).includes(Number(team.position_marker_id))) {
            team.position_marker_id = null;
          }
        }
        return { insertId: 0 };
      }
      if (/DELETE FROM gl_chapter_markers/.test(q)) {
        const ids = params.slice(1).map(Number);
        store.tables.gl_chapter_markers = store.tables.gl_chapter_markers.filter(
          (m) => !ids.includes(Number(m.id)),
        );
        store.markerDeleteApplied = true;
        return { insertId: 0 };
      }
      if (/gl_kingdom_zones/.test(q)) {
        throw new Error('PANNE_INJECTEE_ZONES');
      }
      throw new Error(`Écriture inattendue : ${q}`);
    },
  };
}

/** Même contrat que `withTransaction` : tout ou rien sur l'état du store. */
async function fakeWithTransaction(store, fn) {
  const snapshot = structuredClone(store.tables);
  try {
    return await fn(makeTxDeps(store));
  } catch (err) {
    store.tables = snapshot;
    throw err;
  }
}

test('import de chapitres interrompu après les suppressions : la base reste inchangée', async () => {
  const store = createStore();
  const initial = structuredClone(store.tables);

  const parsed = {
    chapterRows: [{ slug: 'chap-1' }],
    // Le repère 12 est absent du fichier : syncReperes le supprime — puis l'écriture
    // des zones échoue (panne injectée), APRÈS les suppressions.
    markerRows: [{ chapitre_slug: 'chap-1', id: '11', label: 'Départ', x_pct: '10', y_pct: '10' }],
    zoneRows: [
      {
        chapitre_slug: 'chap-1',
        label: 'Zone nouvelle',
        points_json: '[{"x":10,"y":10},{"x":40,"y":10},{"x":40,"y":40}]',
      },
    ],
    charteRows: [],
    hasMarkersSheet: true,
    hasZonesSheet: true,
    hasCharteSheet: false,
  };

  await assert.rejects(
    fakeWithTransaction(store, (tx) =>
      applyChaptersImport(tx, parsed, { dryRun: false, syncReperes: true, syncZones: true }),
    ),
    /PANNE_INJECTEE_ZONES/,
  );

  assert.strictEqual(
    store.markerDeleteApplied,
    true,
    'la panne doit être injectée APRÈS les suppressions de repères',
  );
  assert.deepStrictEqual(
    store.tables,
    initial,
    'après rollback, la base doit être STRICTEMENT inchangée (repère supprimé restauré, équipe intacte)',
  );
});

// ---------------------------------------------------------------------------------------
// 2. Convention : les routes d'import GL passent par withTransaction.
// ---------------------------------------------------------------------------------------

const IMPORT_ROUTE_WIRING = [
  ['routes/gl/chapters.js', 'applyChaptersImport'],
  ['routes/gl/qcm.js', 'applyQcmImport'],
  ['routes/gl/spells.js', 'applySpellsImport'],
  ['routes/gl/glossary.js', 'applyGlossaryImport'],
  ['routes/gl/species.js', 'applySpeciesImport'],
];

for (const [routeFile, applyFn] of IMPORT_ROUTE_WIRING) {
  test(`${routeFile} : ${applyFn} s'exécute dans withTransaction avec les deps de la transaction`, () => {
    const source = fs.readFileSync(path.join(__dirname, '..', routeFile), 'utf8');
    const wired = new RegExp(
      `withTransaction\\(\\s*async \\(tx\\) =>\\s*${applyFn}\\(\\s*\\{[^}]*queryAll: tx\\.queryAll[^}]*execute: tx\\.execute`,
    );
    assert.match(
      source,
      wired,
      `${applyFn} doit être appelé dans withTransaction avec tx.queryAll/tx.execute — ` +
        'sans cela, un import interrompu laisse une écriture partielle sans rollback',
    );
    assert.doesNotMatch(
      source,
      new RegExp(`${applyFn}\\(\\s*\\{\\s*queryAll\\s*,\\s*execute\\s*\\}`),
      `${applyFn} ne doit plus recevoir les helpers du pool (hors transaction)`,
    );
  });
}

// ---------------------------------------------------------------------------------------
// 3. Lotissement des upserts.
// ---------------------------------------------------------------------------------------

test('expandMultiRowInsertSql répète le tuple (NOW() imbriqué compris) et garde ON DUPLICATE', () => {
  const sql = `INSERT INTO t (a, b, created_at) VALUES (?, ?, NOW())
    ON DUPLICATE KEY UPDATE b = VALUES(b), updated_at = NOW()`;
  const out = expandMultiRowInsertSql(sql, 3);
  assert.strictEqual((out.match(/\(\?, \?, NOW\(\)\)/g) || []).length, 3);
  assert.strictEqual((out.match(/ON DUPLICATE KEY UPDATE/g) || []).length, 1);
  assert.ok(out.trimEnd().endsWith('updated_at = NOW()'));
  assert.strictEqual(expandMultiRowInsertSql(sql, 1), sql);
});

test('expandMultiRowInsertSql refuse un SQL sans VALUES ou un rowCount invalide', () => {
  assert.throws(() => expandMultiRowInsertSql('UPDATE t SET a = ?', 2));
  assert.throws(() => expandMultiRowInsertSql('INSERT INTO t (a) VALUES (?)', 0));
});

test('chunkRows découpe par lots de 100 par défaut', () => {
  const chunks = chunkRows(new Array(250).fill(0));
  assert.strictEqual(IMPORT_INSERT_BATCH_SIZE, 100);
  assert.deepStrictEqual(
    chunks.map((c) => c.length),
    [100, 100, 50],
  );
});

test('un SQL non lotissable (des ? dans ON DUPLICATE) repasse en exécution ligne à ligne', async () => {
  // Cas réel : SPELL_UPSERT_SQL porte trois COALESCE(?, …) dans sa clause ON DUPLICATE —
  // un paramètre unique par requête ne peut pas porter une valeur différente par ligne.
  assert.strictEqual(isBatchableInsertSql(SPELL_UPSERT_SQL), false);
  assert.throws(() => expandMultiRowInsertSql(SPELL_UPSERT_SQL, 2), /non lotissable/);
  assert.doesNotThrow(() => expandMultiRowInsertSql(SPELL_UPSERT_SQL, 1));

  const nonBatchableSql =
    'INSERT INTO t (code, valeur) VALUES (?, ?) ON DUPLICATE KEY UPDATE valeur = COALESCE(?, valeur)';
  const calls = [];
  const deps = { execute: async (sql, params) => calls.push({ sql, params }) };
  const validRows = [
    { rowNumber: 2, payload: { code: 'C1', valeur: 1 } },
    { rowNumber: 3, payload: { code: 'C2', valeur: 2 } },
  ];
  const totals = { created: 0, updated: 0 };
  await executeQuestionUpserts(deps, validRows, {
    sql: nonBatchableSql,
    buildParams: (payload) => [payload.code, payload.valeur, payload.valeur],
    existingCodes: new Set(['C1']),
    totals,
    codeOf: (payload) => payload.code,
  });
  assert.strictEqual(calls.length, 2, 'une requête PAR LIGNE, jamais un lot bancal');
  for (const call of calls) {
    assert.strictEqual(call.sql, nonBatchableSql);
    assert.strictEqual(
      (call.sql.match(/\?/g) || []).length,
      call.params.length,
      'placeholders et paramètres doivent rester alignés',
    );
  }
  assert.deepStrictEqual(totals, { created: 1, updated: 1 });
});

test('executeQuestionUpserts : 250 lignes = 3 requêtes, comptage created/updated inchangé', async () => {
  const calls = [];
  const deps = { execute: async (sql, params) => calls.push({ sql, params }) };
  const validRows = [];
  for (let i = 1; i <= 250; i += 1) {
    validRows.push({ rowNumber: i + 1, payload: { code: `C${i}`, valeur: i } });
  }
  const existingCodes = new Set(['C1', 'C2', 'C3']);
  const totals = { created: 0, updated: 0 };

  await executeQuestionUpserts(deps, validRows, {
    sql: 'INSERT INTO t (code, valeur) VALUES (?, ?) ON DUPLICATE KEY UPDATE valeur = VALUES(valeur)',
    buildParams: (payload) => [payload.code, payload.valeur],
    existingCodes,
    totals,
    codeOf: (payload) => payload.code,
  });

  assert.strictEqual(calls.length, 3, 'un aller-retour SQL par lot de 100, pas par ligne');
  assert.deepStrictEqual(
    calls.map((c) => c.params.length),
    [200, 200, 100],
  );
  assert.strictEqual((calls[0].sql.match(/\(\?, \?\)/g) || []).length, 100);
  assert.strictEqual(totals.updated, 3);
  assert.strictEqual(totals.created, 247);
  assert.strictEqual(existingCodes.size, 250);
});
