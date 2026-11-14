'use strict';

/**
 * Migration 343 : les équipes G&L ne pointent plus que vers des packs PUBLIÉS du studio
 * ForêtMap — réattribution par peuple, sans doublon dans une partie, NULL faute de pack —, les
 * assignations suivent, et `gl_mascot_packs` est vidée.
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  initSchema,
  execute,
  queryAll,
  queryOne,
  pool,
  splitSqlStatements,
} = require('../database');
const {
  createGlAdmin,
  createGlClass,
  createGlGameWithTeams,
  createVisitMascotPack,
} = require('./helpers/glFixtures');
const { inferGlMascotTypeFromLabel } = require('../lib/glMascotType');

const FILE = path.join(__dirname, '..', 'migrations', '343_gl_mascots_packs_publies.sql');
const stamp = Date.now();
const createdPacks = [];
let ctx = null;

async function runMigration() {
  const sql = fs.readFileSync(FILE, 'utf8');
  const conn = await pool.getConnection();
  try {
    for (const stmt of splitSqlStatements(sql)) await conn.query(stmt);
  } finally {
    conn.release();
  }
}

/** Peuple d'un pack publié, selon la même règle que le catalogue (et la migration). */
async function publishedPeople() {
  const rows = await queryAll(
    'SELECT catalog_id, label, pack_json FROM visit_mascot_packs WHERE is_published = 1',
  );
  const out = new Map();
  for (const row of rows) {
    let type = null;
    try {
      const t = JSON.parse(row.pack_json)?.type;
      if (t === 'gnome' || t === 'unicorn') type = t;
    } catch (_) {
      /* JSON invalide : déduction par le libellé */
    }
    out.set(row.catalog_id, type || inferGlMascotTypeFromLabel(row.label));
  }
  return out;
}

before(async () => {
  await initSchema();
  const admin = await createGlAdmin({ email: `mig343.${stamp}@ecole.local` });
  const cls = await createGlClass({ name: `Classe mig343 ${stamp}`, adminId: admin.id });
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  const keptPack = await createVisitMascotPack({ label: `Licorne gardée ${stamp}` });
  createdPacks.push(keptPack);
  createdPacks.push(await createVisitMascotPack({ label: `Gnome mig ${stamp} a` }));
  createdPacks.push(await createVisitMascotPack({ label: `Licorne mig ${stamp} a` }));

  // Plus d'équipes gnomes que de packs gnomes publiés : les dernières restent sans mascotte.
  const people = await publishedPeople();
  const gnomeCount = [...people.values()].filter((t) => t === 'gnome').length;
  const teams = [
    { name: 'Licorne gardée', type: 'unicorn', mascotId: keptPack.catalogId },
    { name: 'Licorne SVG', type: 'unicorn', mascotId: 'gl-licorne-aube' },
    { name: 'Licorne SVG bis', type: 'unicorn', mascotId: 'gl-licorne-aube' },
  ];
  for (let i = 0; i < gnomeCount + 1; i += 1) {
    teams.push({
      name: `Gnome ${i}`,
      type: 'gnome',
      mascotId: i === 0 ? 'gnome1-supprime' : 'gl-gnome-mousse',
    });
  }
  teams.push({ name: 'Sans mascotte', type: 'gnome', mascotId: null });
  const seeded = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    name: `Partie mig343 ${stamp}`,
    createdBy: admin.id,
    status: 'live',
    teams,
  });
  ctx = { gameId: Number(seeded.game.id), teams: seeded.teams, keptPack, gnomeCount };
  // Une assignation obsolète (mascotte livrée supprimée) et une valide.
  await execute(
    'INSERT INTO gl_mascot_assignments (game_id, team_id, mascot_id, created_at) VALUES (?, ?, ?, NOW())',
    [ctx.gameId, seeded.teams[3].id, 'gnome1-supprime'],
  );
  await execute(
    'INSERT INTO gl_mascot_assignments (game_id, team_id, mascot_id, created_at) VALUES (?, ?, ?, NOW())',
    [ctx.gameId, seeded.teams[0].id, keptPack.catalogId],
  );
  await execute(
    `INSERT INTO gl_mascot_packs (chapter_id, name, version, payload_json, created_at, updated_at)
     VALUES (NULL, 'Nouveau pack GL', '1.0', '{}', NOW(), NOW())`,
  );
});

after(async () => {
  for (const p of createdPacks)
    await execute('DELETE FROM visit_mascot_packs WHERE id = ?', [p.id]);
});

test('migration 343 : réattribution par peuple, sans doublon, NULL faute de pack', async () => {
  await runMigration();
  await runMigration(); // rejouable
  const people = await publishedPeople();
  const rows = await queryAll(
    'SELECT id, name, type, mascot_id FROM gl_teams WHERE game_id = ? ORDER BY id',
    [ctx.gameId],
  );
  const byName = new Map(rows.map((r) => [r.name, r]));
  // Équipe déjà sur un pack publié : inchangée.
  assert.equal(byName.get('Licorne gardée').mascot_id, ctx.keptPack.catalogId);
  // Aucune équipe ne pointe vers autre chose qu'un pack publié du bon peuple.
  for (const r of rows) {
    if (r.mascot_id == null) continue;
    assert.ok(people.has(r.mascot_id), `${r.name} → ${r.mascot_id} n'est pas un pack publié`);
    assert.equal(people.get(r.mascot_id), r.type, `${r.name} : peuple du pack`);
  }
  // Pas de doublon dans la partie.
  const used = rows.map((r) => r.mascot_id).filter(Boolean);
  assert.equal(new Set(used).size, used.length);
  // Les deux licornes SVG ont reçu un pack (au moins 1 licorne publiée libre, la nôtre).
  assert.ok(byName.get('Licorne SVG').mascot_id);
  // Gnomes : tous les packs gnomes publiés sont pris, la dernière équipe à corriger est NULL.
  const gnomeTeams = rows.filter((r) => r.type === 'gnome' && r.name !== 'Sans mascotte');
  assert.equal(gnomeTeams.filter((r) => r.mascot_id).length, ctx.gnomeCount);
  assert.equal(gnomeTeams.filter((r) => !r.mascot_id).length, 1);
  assert.equal(byName.get('Sans mascotte').mascot_id, null);
});

test('migration 343 : assignations alignées, plus aucune vers une mascotte non publiée', async () => {
  const people = await publishedPeople();
  const assignments = await queryAll(
    'SELECT team_id, mascot_id FROM gl_mascot_assignments WHERE game_id = ?',
    [ctx.gameId],
  );
  const teams = await queryAll('SELECT id, mascot_id FROM gl_teams WHERE game_id = ?', [
    ctx.gameId,
  ]);
  const teamMascot = new Map(teams.map((t) => [Number(t.id), t.mascot_id]));
  for (const a of assignments) {
    assert.ok(people.has(a.mascot_id), `assignation vers ${a.mascot_id}`);
    assert.equal(a.mascot_id, teamMascot.get(Number(a.team_id)));
  }
  // Chaque équipe réattribuée a désormais sa ligne d'assignation (garde anti-doublon de /assign).
  for (const t of teams) {
    const hasRow = assignments.some((a) => Number(a.team_id) === Number(t.id));
    assert.equal(hasRow, Boolean(t.mascot_id), `équipe ${t.id}`);
  }
});

test('migration 343 : gl_mascot_packs vidée, aucune table de travail laissée', async () => {
  const row = await queryOne('SELECT COUNT(*) AS n FROM gl_mascot_packs');
  assert.equal(Number(row.n), 0);
  const leftovers = await queryAll("SHOW TABLES LIKE '\\_mig343%'");
  assert.equal(leftovers.length, 0);
});
