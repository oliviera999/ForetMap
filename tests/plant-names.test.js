'use strict';

// Noms des fiches espèces — `plant_name_aliases.kind` (migration 304), piste C de l'audit du
// 25/09/2026 (§ 1.3.6, § 2.3, § 3.5). Temps 1 : fiche, recherche, reprise des liens et
// carnet lisent les noms de la table ; temps 2 : formulaire et import écrivent les autres
// noms (`nom_secondaire`) et tiennent `plants.second_name` en miroir.

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const {
  pool,
  initSchema,
  queryAll,
  queryOne,
  execute,
  splitSqlStatements,
} = require('../database');
const { app } = require('../server');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const names = require('../lib/biodiv/plantNames');
const { loadSecondaryNamesByPlantId } = require('../lib/biodiv/speciesRelations');
const { searchJournalEmbeds } = require('../lib/fmUserJournal');

const STAMP = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
const MIGRATION = path.join(__dirname, '..', 'migrations', '304_plant_name_aliases_kind.sql');

/**
 * Contrôle de passage au T3 : noms de `second_name` (même découpage que la migration, nom de
 * la fiche exclu) sans ligne `nom_secondaire` pour leur fiche. Le découpage est repris de la
 * migration (sous-requête `s` de l'étape 1).
 */
function t3ControlSql() {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  const start = sql.indexOf('      FROM (\n        SELECT p.id AS plant_id');
  const end = sql.indexOf('     GROUP BY s.plant_id, s.part', start);
  const parts = sql.slice(start, end);
  return `SELECT s.plant_id, s.part ${parts}
       AND NOT EXISTS (SELECT 1 FROM plant_name_aliases a
                        WHERE a.plant_id = s.plant_id AND a.kind = 'nom_secondaire'
                          AND a.alias = s.part)`;
}

describe('plantNames — logique pure', () => {
  test('découpage : virgule, point-virgule, retour à la ligne ; précision et doublons retirés', () => {
    assert.deepEqual(
      names.splitNames(
        'Ail, Ail commun ; Ail cultivé\nail cultivé, Gommier bleu (usage courant),, ',
      ),
      ['Ail', 'Ail commun', 'Ail cultivé', 'Gommier bleu'],
    );
    assert.deepEqual(names.splitNames(['  Nopal ', 'nopal', 'Figue']), ['Nopal', 'Figue']);
    assert.equal(names.cleanName('A (b) (c)'), 'A');
    assert.equal(names.cleanName('(seul)'), '(seul)');
  });

  test('comparaison proche de la collation : casse, accents, ligatures', () => {
    assert.equal(names.foldName(' Œillet  d’Inde '), names.foldName('oeillet d’inde'));
    assert.equal(names.foldName('Pied-d’alouette') === names.foldName("Pied-d'alouette"), false);
  });

  test('resolvePlantNames : table cohérente, repli sur la colonne sinon', () => {
    const plant = { name: 'Ail', second_name: 'Ail, Ail commun, Ail cultivé' };
    const rows = [
      { alias: 'Ail cultivé', kind: 'nom_secondaire', sort_order: 2 },
      { alias: 'Ail commun', kind: 'nom_secondaire', sort_order: 1 },
      { alias: 'Aulx', kind: 'variante', sort_order: 0 },
    ];
    const ok = names.resolvePlantNames(plant, rows);
    assert.equal(ok.origin, 'table');
    assert.deepEqual(ok.secondaryNames, ['Ail commun', 'Ail cultivé']);
    assert.deepEqual(
      ok.aliases.map((a) => a.alias),
      ['Aulx', 'Ail commun', 'Ail cultivé'],
    );
    const stale = names.resolvePlantNames({ ...plant, second_name: 'Ail des jardins' }, rows);
    assert.equal(stale.origin, 'colonnes');
    assert.deepEqual(stale.secondaryNames, ['Ail des jardins']);
    assert.equal(names.resolvePlantNames({ name: 'X' }, []).origin, 'table');
  });

  test('normalizeClientSecondaryNames : bornes et nom de la fiche exclu', () => {
    assert.deepEqual(names.normalizeClientSecondaryNames('Pommier, Malus, pommier', 'Pommier'), {
      names: ['Malus'],
    });
    assert.match(names.normalizeClientSecondaryNames({}, 'x').error, /texte ou liste/);
    assert.match(
      names.normalizeClientSecondaryNames(['a'.repeat(200), 'b'.repeat(100)], 'x').error,
      /au total/,
    );
  });
});

describe('noms des fiches — base et API', () => {
  let token;
  const ids = [];

  before(async () => {
    await initSchema();
    token = await ensureAdminTeacherAuthToken();
  });

  after(async () => {
    for (const id of ids) await execute('DELETE FROM plants WHERE id = ?', [id]).catch(() => {});
  });

  async function listRow(id) {
    const res = await request(app).get('/api/plants').expect(200);
    return res.body.find((p) => Number(p.id) === Number(id));
  }

  async function aliasRows(plantId) {
    return queryAll(
      'SELECT alias, kind, sort_order FROM plant_name_aliases WHERE plant_id = ? ORDER BY kind, sort_order, alias',
      [plantId],
    );
  }

  test('migration 304 — sortes, reprise de second_name, idempotence, contrôle T3', async () => {
    const cols = await queryOne(
      `SELECT COUNT(*) AS c FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'plant_name_aliases'
          AND column_name IN ('kind', 'sort_order')`,
    );
    assert.equal(Number(cols.c), 2);

    const other = await execute("INSERT INTO plants (name, emoji) VALUES (?, '🐝')", [
      `Nom pris M304 ${STAMP}`,
    ]);
    ids.push(other.insertId);
    const plant = await execute(
      "INSERT INTO plants (name, emoji, second_name) VALUES (?, '🌿', ?)",
      [
        `Fiche M304 ${STAMP}`,
        `Fiche M304 ${STAMP}, Nouveau M304 ${STAMP} (usage courant); Ancien M304 ${STAMP}, Nom pris M304 ${STAMP}, nouveau m304 ${STAMP}`,
      ],
    );
    ids.push(plant.insertId);
    // Nom reconnu d'avant la migration (sorte par défaut : variante).
    await execute('INSERT INTO plant_name_aliases (alias, plant_id) VALUES (?, ?)', [
      `Ancien M304 ${STAMP}`,
      plant.insertId,
    ]);
    await execute(
      "UPDATE plant_name_aliases SET kind = 'variante' WHERE plant_id = ? AND alias = ?",
      [plant.insertId, `Ancien M304 ${STAMP}`],
    );

    const sql = fs.readFileSync(MIGRATION, 'utf8');
    const run = async () => {
      for (const stmt of splitSqlStatements(sql)) {
        try {
          await pool.query(stmt);
        } catch (err) {
          // Colonnes / index déjà présents : tolérés comme par le moteur de migrations.
          if (![1060, 1061].includes(err.errno)) throw err;
        }
      }
    };
    await run();
    await run();

    assert.deepEqual(
      (await aliasRows(plant.insertId)).map((r) => [r.alias, r.kind, Number(r.sort_order)]),
      [
        [`Nouveau M304 ${STAMP}`, 'nom_secondaire', 1],
        [`Ancien M304 ${STAMP}`, 'nom_secondaire', 2],
      ],
    );
    // Le nom d'une autre fiche n'est pas repris : il reste lisible en repli, et compte au
    // contrôle de passage au T3.
    const control = await queryAll(t3ControlSql());
    const mine = control.filter((row) => Number(row.plant_id) === Number(plant.insertId));
    assert.deepEqual(
      mine.map((r) => r.part),
      [`Nom pris M304 ${STAMP}`],
    );
    const row = await listRow(plant.insertId);
    assert.equal(row.names_origin, 'colonnes');
    assert.ok(row.secondary_names.includes(`Nom pris M304 ${STAMP}`));
  });

  test('PUT secondary_names : table, ordre, miroir, recherche et conflits', async () => {
    const other = await request(app)
      .post('/api/plants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Autre fiche ${STAMP}`, secondary_names: `Nom déjà pris ${STAMP}` })
      .expect(201);
    ids.push(other.body.id);
    assert.deepEqual(other.body.secondary_names, [`Nom déjà pris ${STAMP}`]);

    const created = await request(app)
      .post('/api/plants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Pissenlit ${STAMP}` })
      .expect(201);
    const id = created.body.id;
    ids.push(id);

    const res = await request(app)
      .put(`/api/plants/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Pissenlit ${STAMP}`,
        secondary_names: `Dent-de-lion ${STAMP}, Salade de taupe ${STAMP}, Pissenlit ${STAMP}`,
      })
      .expect(200);
    assert.deepEqual(res.body.secondary_names, [
      `Dent-de-lion ${STAMP}`,
      `Salade de taupe ${STAMP}`,
    ]);
    assert.equal(res.body.names_origin, 'table');
    assert.equal(res.body.second_name, `Dent-de-lion ${STAMP}, Salade de taupe ${STAMP}`);
    assert.equal(res.body.secondary_name_conflicts, undefined);
    const col = await queryOne('SELECT second_name FROM plants WHERE id = ?', [id]);
    assert.equal(col.second_name, `Dent-de-lion ${STAMP}, Salade de taupe ${STAMP}`);

    // Recherche du catalogue (même fonction que le front) : le nom secondaire est trouvé.
    const filters = await import(
      pathToFileURL(path.join(__dirname, '..', 'src', 'utils', 'plantFilters.js')).href
    );
    const row = await listRow(id);
    assert.equal(
      filters.plantTextMatchesQuery(row, `salade de taupe ${STAMP}`.toLowerCase()),
      true,
    );

    // Recherche du carnet et reprise des liens : même source.
    const found = await searchJournalEmbeds('plant', `Salade de taupe ${STAMP}`);
    assert.deepEqual(
      found.map((r) => r.ref),
      [String(id)],
    );
    const byId = await loadSecondaryNamesByPlantId([id]);
    assert.deepEqual(byId.get(Number(id)), [`Dent-de-lion ${STAMP}`, `Salade de taupe ${STAMP}`]);

    // Réordonner, retirer, et un nom déjà pris par une autre fiche.
    const res2 = await request(app)
      .put(`/api/plants/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Pissenlit ${STAMP}`,
        secondary_names: [`Salade de taupe ${STAMP}`, `Nom déjà pris ${STAMP}`],
      })
      .expect(200);
    assert.deepEqual(res2.body.secondary_name_conflicts, [
      {
        name: `Nom déjà pris ${STAMP}`,
        reason: 'nom_deja_utilise',
        plant_id: Number(other.body.id),
        plant_name: `Autre fiche ${STAMP}`,
      },
    ]);
    assert.deepEqual(
      (await aliasRows(id)).map((r) => [r.alias, r.kind, Number(r.sort_order)]),
      [[`Salade de taupe ${STAMP}`, 'nom_secondaire', 0]],
    );
    // Le nom en conflit reste dans le miroir : la fiche l'affiche (repli), rien n'est perdu.
    assert.equal(res2.body.names_origin, 'colonnes');
    assert.deepEqual(res2.body.secondary_names, [
      `Salade de taupe ${STAMP}`,
      `Nom déjà pris ${STAMP}`,
    ]);

    // Le nom d'une autre fiche est refusé de la même façon.
    const res3 = await request(app)
      .put(`/api/plants/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Pissenlit ${STAMP}`, secondary_names: `autre FICHE ${STAMP}` })
      .expect(200);
    assert.equal(res3.body.secondary_name_conflicts[0].reason, 'nom_d_une_autre_fiche');
    assert.deepEqual(await aliasRows(id), []);
  });

  test('client historique et import : second_name → table (variante promue)', async () => {
    const created = await request(app)
      .post('/api/plants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Figuier ${STAMP}` })
      .expect(201);
    const id = created.body.id;
    ids.push(id);
    await execute(
      "INSERT INTO plant_name_aliases (alias, plant_id, kind) VALUES (?, ?, 'variante')",
      [`Figues ${STAMP}`, id],
    );
    const res = await request(app)
      .put(`/api/plants/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Figuier ${STAMP}`, second_name: `figues ${STAMP}, Nopal ${STAMP}` })
      .expect(200);
    assert.deepEqual(res.body.secondary_names, [`figues ${STAMP}`, `Nopal ${STAMP}`]);
    assert.deepEqual(
      (await aliasRows(id)).map((r) => [r.alias, r.kind]),
      [
        [`figues ${STAMP}`, 'nom_secondaire'],
        [`Nopal ${STAMP}`, 'nom_secondaire'],
      ],
    );

    const name = `Import noms ${STAMP}`;
    await request(app)
      .post('/api/plants/import')
      .set('Authorization', `Bearer ${token}`)
      .send({
        strategy: 'upsert_name',
        rows: [{ nom: name, deuxieme_nom: `Alias import ${STAMP}` }],
      })
      .expect(200);
    const imported = await queryOne('SELECT id FROM plants WHERE name = ?', [name]);
    ids.push(imported.id);
    assert.deepEqual(
      (await aliasRows(imported.id)).map((r) => [r.alias, r.kind]),
      [[`Alias import ${STAMP}`, 'nom_secondaire']],
    );
  });

  test('repli : second_name réécrit sans la table (retour arrière du code)', async () => {
    const created = await request(app)
      .post('/api/plants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Repli noms ${STAMP}`, secondary_names: `Premier ${STAMP}` })
      .expect(201);
    ids.push(created.body.id);
    await execute('UPDATE plants SET second_name = ? WHERE id = ?', [
      `Premier ${STAMP}, Second ${STAMP}`,
      created.body.id,
    ]);
    const row = await listRow(created.body.id);
    assert.equal(row.names_origin, 'colonnes');
    assert.deepEqual(row.secondary_names, [`Premier ${STAMP}`, `Second ${STAMP}`]);
    assert.equal(row.second_name, `Premier ${STAMP}, Second ${STAMP}`);
  });

  test('lecteurs hors fiche : plus de lecture directe de second_name', () => {
    const route = fs.readFileSync(
      path.join(__dirname, '..', 'routes', 'learning-links.js'),
      'utf8',
    );
    assert.ok(!/second_name/.test(route.replace(/\/\/.*$/gm, '')));
    const journal = fs.readFileSync(path.join(__dirname, '..', 'lib', 'fmUserJournal.js'), 'utf8');
    assert.ok(!/second_name/.test(journal.replace(/\/\/.*$/gm, '')));
  });
});
