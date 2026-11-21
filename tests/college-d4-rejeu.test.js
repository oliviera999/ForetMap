'use strict';

// Chantier collège (novembre 2026), flux D4 : mécanique de rejeu de la migration
// « college_cles_courtes » (patron `tests/learning-links-migration-300.test.js`).
// Les prérequis (cartes, clades, fiches, clés complètes de renvoi) sont semés sous leurs clés
// naturelles quand la base de test ne les a pas ; la migration est jouée deux fois ; on vérifie
// la forme des clés créées, l'audit des chemins morts, le saut d'une clé dont un prérequis manque
// et l'absence d'écrasement d'une clé déjà présente. Tests BDD partagée : exécution séquentielle.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { initSchema, execute, queryOne, queryAll, splitSqlStatements } = require('../database');
const {
  loadData,
  speciesOf,
  refsOf,
  issueOf,
  plantKey,
} = require('../scripts/college-2026-11/check-d4-donnees');
const { migrationPath } = require('../scripts/college-2026-11/build-d4-migration');
const { loadSnapshot } = require('../lib/mcp/audits');
const { CHECKS } = require('../lib/mcp/audits/checks');

const data = loadData();
const SLUGS = data.cles.map((c) => c.slug);
const created = { maps: [], clades: [], plants: [], keys: [] };
/** Clés courtes déjà présentes avant le test (base partagée) : on ne les supprime pas. */
const preexisting = new Set();

async function runMigration() {
  const sql = fs.readFileSync(migrationPath(), 'utf8');
  for (const stmt of splitSqlStatements(sql)) await execute(stmt);
}

async function counts() {
  const ph = SLUGS.map(() => '?').join(',');
  return queryOne(
    `SELECT COUNT(DISTINCT k.id) AS cles, COUNT(DISTINCT c.id) AS couplets,
            COUNT(DISTINCT l.id) AS propositions,
            (SELECT COUNT(*) FROM id_key_lead_plants lp
               JOIN id_key_leads l3 ON l3.id = lp.lead_id
               JOIN id_key_couplets c3 ON c3.id = l3.couplet_id
               JOIN id_keys k3 ON k3.id = c3.key_id
              WHERE k3.slug IN (${ph})) AS especes_groupes
       FROM id_keys k
       LEFT JOIN id_key_couplets c ON c.key_id = k.id
       LEFT JOIN id_key_leads l ON l.couplet_id = c.id
      WHERE k.slug IN (${ph})`,
    [...SLUGS, ...SLUGS],
  );
}

async function deleteShortKeys() {
  for (const slug of SLUGS) {
    if (!preexisting.has(slug)) await execute('DELETE FROM id_keys WHERE slug = ?', [slug]);
  }
}

before(async () => {
  await initSchema();
  for (const slug of SLUGS) {
    if (await queryOne('SELECT 1 AS ok FROM id_keys WHERE slug = ?', [slug])) preexisting.add(slug);
  }
  // Prérequis absents d'une base fraîche : semés, puis retirés en fin de test.
  const maps = new Set(data.cles.map((c) => c.map_id).filter(Boolean));
  for (const id of maps) {
    if (!(await queryOne('SELECT 1 AS ok FROM maps WHERE id = ?', [id]))) {
      await execute('INSERT INTO maps (id, label) VALUES (?, ?)', [id, `Carte rejeu D4 ${id}`]);
      created.maps.push(id);
    }
  }
  const clades = new Set(data.cles.flatMap((c) => refsOf(c).clades));
  for (const id of clades) {
    if (!(await queryOne('SELECT 1 AS ok FROM clades WHERE id = ?', [id]))) {
      await execute('INSERT INTO clades (id, name, shared_attribute) VALUES (?, ?, ?)', [
        id,
        `Clade rejeu D4 ${id}`,
        'rejeu D4',
      ]);
      created.clades.push(id);
    }
  }
  const seen = new Set();
  for (const p of data.cles.flatMap(speciesOf)) {
    if (seen.has(plantKey(p))) continue;
    seen.add(plantKey(p));
    const found = await queryOne(
      'SELECT id FROM plants WHERE name = ? AND scientific_name <=> ? LIMIT 1',
      [p.name, p.scientific_name],
    );
    if (!found) {
      const { insertId } = await execute(
        'INSERT INTO plants (name, emoji, description, scientific_name) VALUES (?, ?, ?, ?)',
        [p.name, '🌱', 'rejeu D4', p.scientific_name],
      );
      created.plants.push(insertId);
    }
  }
  const renvois = new Set(data.cles.flatMap((c) => refsOf(c).nextKeys));
  for (const slug of renvois) {
    if (!(await queryOne('SELECT 1 AS ok FROM id_keys WHERE slug = ?', [slug]))) {
      const { insertId } = await execute(
        "INSERT INTO id_keys (slug, title, niveau, is_published) VALUES (?, ?, 'lycee', 1)",
        [slug, `Clé complète rejeu D4 ${slug}`],
      );
      created.keys.push(insertId);
    }
  }
  await deleteShortKeys();
});

after(async () => {
  await deleteShortKeys();
  for (const id of created.keys) await execute('DELETE FROM id_keys WHERE id = ?', [id]);
  for (const id of created.plants) await execute('DELETE FROM plants WHERE id = ?', [id]);
  for (const id of created.clades) await execute('DELETE FROM clades WHERE id = ?', [id]);
  for (const id of created.maps) await execute('DELETE FROM maps WHERE id = ?', [id]);
});

const attendu = {
  cles: data.cles.length,
  couplets: data.cles.reduce((n, c) => n + c.couplets.length, 0),
  propositions: data.cles.reduce(
    (n, c) => n + c.couplets.reduce((m, cp) => m + cp.leads.length, 0),
    0,
  ),
  especes_groupes: data.cles.reduce(
    (n, c) =>
      n +
      c.couplets.reduce(
        (m, cp) => m + cp.leads.reduce((o, l) => o + (l.groupe ? l.groupe.plants.length : 0), 0),
        0,
      ),
    0,
  ),
};

test('D4 rejeu : deux passages créent les six clés une seule fois', async () => {
  await runMigration();
  const premier = await counts();
  assert.deepEqual({ ...premier }, attendu);
  await runMigration();
  assert.deepEqual({ ...(await counts()) }, attendu);
});

test('D4 rejeu : clés publiées au niveau collège, renvois et issues conformes', async () => {
  for (const cle of data.cles) {
    const k = await queryOne('SELECT * FROM id_keys WHERE slug = ?', [cle.slug]);
    assert.equal(k.niveau, 'college');
    assert.equal(Number(k.is_published), 1);
    assert.equal(k.created_by, null);
    assert.equal(k.map_id, cle.map_id);
    assert.equal(k.tool_required, cle.tool_required);
    assert.equal(k.safety_note, cle.safety_note);
    for (const c of cle.couplets) {
      const rows = await queryAll(
        `SELECT l.*, nk.slug AS next_slug, nc.number AS next_number, p.name AS plant_name
           FROM id_key_leads l
           JOIN id_key_couplets c ON c.id = l.couplet_id
           LEFT JOIN id_keys nk ON nk.id = l.next_key_id
           LEFT JOIN id_key_couplets nc ON nc.id = l.next_couplet_id
           LEFT JOIN plants p ON p.id = l.plant_id
          WHERE c.key_id = ? AND c.number = ?
          ORDER BY l.sort_order`,
        [k.id, c.number],
      );
      assert.equal(rows.length, c.leads.length);
      c.leads.forEach((l, i) => {
        const r = rows[i];
        const issue = issueOf(l);
        assert.equal(r.outcome, issue);
        assert.equal(r.statement, l.statement);
        if (issue === 'couplet') {
          assert.equal(r.next_number, l.couplet);
          assert.equal(r.next_key_id, null);
        } else {
          assert.equal(r.next_slug, l.next_key ?? cle.full_key_slug);
        }
        if (issue === 'espece') assert.equal(r.plant_name, l.espece.name);
        if (issue === 'clade') {
          assert.equal(r.clade_id, l.clade);
          assert.equal(r.result_label, null);
        }
        if (issue === 'groupe') assert.equal(r.result_label, l.groupe.label);
      });
    }
  }
});

test('D4 rejeu : l’audit des chemins morts ne remonte rien sur les clés courtes', async () => {
  const snapshot = await loadSnapshot(CHECKS.id_key_dead_paths.needs);
  const ph = SLUGS.map(() => '?').join(',');
  const keyIds = new Set(
    (await queryAll(`SELECT id FROM id_keys WHERE slug IN (${ph})`, SLUGS)).map((r) => r.id),
  );
  const couplets = await queryAll(
    `SELECT c.id FROM id_key_couplets c JOIN id_keys k ON k.id = c.key_id WHERE k.slug IN (${ph})`,
    SLUGS,
  );
  const leads = await queryAll(
    `SELECT l.id FROM id_key_leads l JOIN id_key_couplets c ON c.id = l.couplet_id
       JOIN id_keys k ON k.id = c.key_id WHERE k.slug IN (${ph})`,
    SLUGS,
  );
  const ours = new Set([
    ...[...keyIds].map((id) => `key:${id}`),
    ...couplets.map((r) => `couplet:${r.id}`),
    ...leads.map((r) => `lead:${r.id}`),
  ]);
  const findings = CHECKS.id_key_dead_paths
    .run(snapshot)
    .filter((f) => ours.has(f.id) || [...keyIds].some((id) => f.id.startsWith(`key:${id}:`)));
  assert.deepEqual(findings, []);
});

test('D4 rejeu : une clé déjà présente (modifiée dans l’application) n’est pas complétée', async () => {
  const cle = data.cles[0];
  const k = await queryOne('SELECT id FROM id_keys WHERE slug = ?', [cle.slug]);
  await execute('UPDATE id_keys SET title = ? WHERE id = ?', ['Titre changé dans l’appli', k.id]);
  await execute(
    `DELETE l FROM id_key_leads l JOIN id_key_couplets c ON c.id = l.couplet_id
      WHERE c.key_id = ? AND c.number = 1 AND l.sort_order = 0`,
    [k.id],
  );
  await runMigration();
  const restored = await queryOne(
    `SELECT COUNT(*) AS n FROM id_key_leads l JOIN id_key_couplets c ON c.id = l.couplet_id
      WHERE c.key_id = ? AND c.number = 1 AND l.sort_order = 0`,
    [k.id],
  );
  assert.equal(Number(restored.n), 0, 'proposition supprimée dans l’appli non recréée');
  const t = await queryOne('SELECT title FROM id_keys WHERE id = ?', [k.id]);
  assert.equal(t.title, 'Titre changé dans l’appli');
});

test('D4 rejeu : une clé dont un prérequis manque est sautée en entier, sans erreur', async () => {
  const cle = data.cles.find((c) => c.slug === 'papillons-college');
  await execute('DELETE FROM id_keys WHERE slug = ?', [cle.slug]);
  const p = speciesOf(cle)[0];
  const plant = await queryOne(
    'SELECT id, name FROM plants WHERE name = ? AND scientific_name <=> ?',
    [p.name, p.scientific_name],
  );
  await execute('UPDATE plants SET name = ? WHERE id = ?', [`${plant.name} (renommée)`, plant.id]);
  try {
    await runMigration();
    assert.ok(!(await queryOne('SELECT id FROM id_keys WHERE slug = ?', [cle.slug])));
  } finally {
    await execute('UPDATE plants SET name = ? WHERE id = ?', [plant.name, plant.id]);
  }
  await runMigration();
  assert.ok(await queryOne('SELECT id FROM id_keys WHERE slug = ?', [cle.slug]));
});
