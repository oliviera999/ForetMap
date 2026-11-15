'use strict';

/**
 * Chargeurs des catalogues de la Trame (« Tenir à deux », lot 3, étape 3.1) :
 * `lib/glTrameImport.js`, enregistrés dans `lib/glTenirImport.js`.
 * - jeu d'exemple : import à blanc sans écriture, puis réel et **idempotent** ;
 * - mode tolérant : un réseau invalide est écarté, les autres sont écrits ; mode strict : refus ;
 * - une espèce absente de la base est un avertissement en tolérant, une erreur en strict ;
 * - les liens acceptés entre deux espèces réelles nourrissent `gl_species_interactions`, dans le
 *   sens de saisie (`from` = celui qui mange), sans doublon ni suppression ;
 * - aucune table `gl_game_*` n'est touchée.
 */

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database');
const { IMPORTERS, IMPORT_ORDER, IMPORT_TABLES } = require('../lib/glTenirImport');
const { controlerReseau, typeInteraction } = require('../lib/glTrameImport');
const { runImports } = require('../scripts/gl-import-tenir');

const EXEMPLE = path.join(__dirname, '..', 'data', 'gl', 'tenir', 'exemple');
const lire = (nom) => JSON.parse(fs.readFileSync(path.join(EXEMPLE, `${nom}.json`), 'utf8'));
const FICHIERS = ['trame-reseaux', 'trame-fils', 'trame-reparer'];
const compte = async (table, where = '1 = 1') =>
  Number((await db.queryOne(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)).n);

async function etat() {
  return {
    reseaux: await compte('gl_trame_reseaux', "actif = 1 AND biome IN ('jungle_afc', 'savane')"),
    cartes: await compte('gl_trame_cartes', "biome IN ('jungle_afc', 'savane')"),
    liens: await compte('gl_trame_liens', "biome IN ('jungle_afc', 'savane')"),
    filsCartes: await compte('gl_trame_fils_cartes', 'plateau = 1'),
    filsLiens: await compte('gl_trame_fils_liens', 'plateau = 1'),
    mesures: await compte('gl_trame_mesures', 'actif = 1'),
    especes: await compte('gl_trame_reparer_especes', 'plateau = 1'),
    aClasser: await compte('gl_trame_reparer_a_classer', 'plateau = 1'),
  };
}

before(async () => {
  await db.initSchema();
});

test('registre : trois chargeurs, en fin d’ordre de chargement, chacun avec sa table de comptes', () => {
  assert.deepEqual(IMPORT_ORDER.slice(-3), FICHIERS);
  for (const f of FICHIERS) {
    assert.equal(typeof IMPORTERS[f], 'function');
    assert.ok(IMPORT_TABLES[f]?.table.startsWith('gl_trame_'));
  }
});

test('jeu d’exemple : à blanc sans écriture, puis réel et idempotent', async () => {
  const avantJeu = await compte('gl_game_events');
  for (const fichier of FICHIERS) {
    const [rep] = await runImports(db, { fichier, dryRun: true, dossier: EXEMPLE });
    assert.deepEqual(rep.errors, [], `${fichier} : ${rep.errors.join(' | ')}`);
    assert.equal(rep.upserted, 0);
  }
  for (const fichier of FICHIERS) {
    const [rep] = await runImports(db, { fichier, dossier: EXEMPLE });
    assert.deepEqual(rep.errors, [], `${fichier} : ${rep.errors.join(' | ')}`);
    assert.ok(rep.upserted > 0, fichier);
  }
  const premier = await etat();
  assert.deepEqual(premier, {
    reseaux: 2,
    cartes: 24,
    liens: 33,
    filsCartes: 9,
    filsLiens: 8,
    mesures: 11,
    especes: 5,
    aClasser: 6,
  });
  for (const fichier of FICHIERS) await runImports(db, { fichier, dossier: EXEMPLE });
  assert.deepEqual(await etat(), premier, 'deux passages = même base');
  assert.equal(await compte('gl_game_events'), avantJeu, 'aucune table de partie touchée');
  // Le titre du plateau et la leçon voyagent avec leurs lignes.
  const fil = await db.queryOne(
    "SELECT chapitre_titre FROM gl_trame_fils_cartes WHERE plateau = 1 AND code = 'A'",
  );
  assert.ok(fil.chapitre_titre);
  const lecon = await db.queryOne(
    'SELECT lecon FROM gl_trame_reparer_a_classer WHERE plateau = 1 LIMIT 1',
  );
  assert.ok(lecon.lecon);
  const discuter = await db.queryOne(
    "SELECT pourquoi FROM gl_trame_liens WHERE biome = 'jungle_afc' AND nature = 'a_discuter' LIMIT 1",
  );
  assert.ok(discuter.pourquoi, 'un lien « à discuter » garde son pourquoi');
});

test('contrôles d’un réseau : niveau sans producteur, carte isolée, scénario hors des 9 premières, lien vers soi', () => {
  const base = lire('trame-reseaux').reseaux[0];
  const plateauBiomes = { 1: ['jungle_afc', 'savane'] };
  assert.deepEqual(controlerReseau(base, { plateauBiomes }).errors, []);
  const sansProducteur = {
    ...base,
    especes: base.especes.map((e, i) => (i === 0 ? { ...e, role: 'consommateur' } : e)),
  };
  assert.ok(
    controlerReseau(sansProducteur, { plateauBiomes }).errors.some((e) =>
      /niveau 5 sans producteur/.test(e),
    ),
  );
  const isolee = { ...base, liens_acceptes: base.liens_acceptes.slice(3) };
  assert.ok(
    controlerReseau(isolee, { plateauBiomes }).errors.some((e) => /sans lien accepté/.test(e)),
  );
  const horsNeuf = { ...base, scenarios_trame_alteree: [base.especes[11].code] };
  assert.ok(
    controlerReseau(horsNeuf, { plateauBiomes }).errors.some((e) =>
      /hors des 9 premières cartes/.test(e),
    ),
  );
  const boucle = {
    ...base,
    liens_acceptes: [...base.liens_acceptes, { de: 'SP0045', vers: 'SP0045' }],
  };
  assert.ok(
    controlerReseau(boucle, { plateauBiomes }).errors.some((e) => /vers elle-même/.test(e)),
  );
  assert.ok(
    controlerReseau({ ...base, biome: 'taiga' }, { plateauBiomes }).errors.some((e) =>
      /biome étranger/.test(e),
    ),
  );
  // 11 cartes : refus.
  assert.ok(
    controlerReseau({ ...base, especes: base.especes.slice(0, 11) }, { plateauBiomes }).errors
      .length > 0,
  );
});

test('tolérant : le réseau invalide est écarté, l’autre est écrit ; strict : rien n’est écrit', async () => {
  const json = lire('trame-reseaux');
  json.reseaux[1] = { ...json.reseaux[1], scenarios_trame_alteree: ['INCONNU'] };
  const tolerant = await IMPORTERS['trame-reseaux'](db, json, {});
  assert.equal(tolerant.ecartees, 1);
  assert.equal(tolerant.upserted, 1);
  assert.ok(tolerant.errors.some((e) => /savane/.test(e)));
  const strict = await IMPORTERS['trame-reseaux'](db, json, { strict: true });
  assert.equal(strict.refuse, true);
  assert.equal(strict.upserted, 0);
  // Texte visible relu : un mot interdit écarte la ligne.
  const fils = lire('trame-fils');
  fils.chapitres[0].cartes[0][1] = 'La classe a perdu le fil';
  const rep = await IMPORTERS['trame-fils'](db, fils, {});
  assert.equal(rep.ecartees, 1);
  assert.ok(rep.errors.some((e) => /chaîne interdite/.test(e)));
  const reparer = lire('trame-reparer');
  reparer.chapitres[0].especes[0].mesures = ['M99'];
  const rep2 = await IMPORTERS['trame-reparer'](db, reparer, {});
  assert.ok(rep2.errors.some((e) => /mesure M99 inconnue/.test(e)));
  // Remise au propre pour les suites suivantes.
  for (const fichier of FICHIERS) await runImports(db, { fichier, dossier: EXEMPLE });
});

test('espèces : absentes de la base → avertissement (erreur en strict) ; présentes → interactions versées dans le bon sens', async () => {
  assert.equal(typeInteraction('producteur', 'consommateur'), 'herbivorie');
  assert.equal(typeInteraction('consommateur', 'consommateur'), 'predation');
  assert.equal(typeInteraction('producteur', 'decomposeur'), 'decomposition');
  const json = lire('trame-reseaux');
  const presentes = await compte(
    'gl_species',
    "species_code IN ('SP0045', 'SP0023', 'SP0032', 'SP0031')",
  );
  if (presentes === 0) {
    const tolerant = await IMPORTERS['trame-reseaux'](db, json, { dryRun: true });
    assert.ok(tolerant.warnings.some((w) => /absente de gl_species/.test(w)));
    assert.deepEqual(tolerant.errors, []);
    const strict = await IMPORTERS['trame-reseaux'](db, json, { dryRun: true, strict: true });
    assert.ok(strict.errors.some((e) => /absente de gl_species/.test(e)));
  }
  // Deux espèces réelles du réseau : Marantacée (producteur) → Bongo (consommateur).
  const stamp = Date.now();
  const semees = [];
  for (const [code, nom, type] of [
    ['SP0045', 'Marantacée', 'flore'],
    ['SP0032', 'Bongo', 'faune'],
  ]) {
    const deja = await db.queryOne('SELECT id FROM gl_species WHERE species_code = ?', [code]);
    if (deja) continue;
    await db.execute(
      `INSERT INTO gl_species (species_code, biome_slug, type, nom_commun, statut, created_at, updated_at)
       VALUES (?, 'jungle_afc', ?, ?, 'actif', NOW(), NOW())`,
      [code, type, `${nom} (test ${stamp})`],
    );
    semees.push(code);
  }
  const id = async (code) =>
    Number((await db.queryOne('SELECT id FROM gl_species WHERE species_code = ?', [code])).id);
  await IMPORTERS['trame-reseaux'](db, json, {});
  await IMPORTERS['trame-reseaux'](db, json, {});
  const lien = await db.queryAll(
    'SELECT interaction_type FROM gl_species_interactions WHERE from_species_id = ? AND to_species_id = ?',
    [await id('SP0032'), await id('SP0045')],
  );
  assert.deepEqual(
    lien.map((l) => l.interaction_type),
    ['herbivorie'],
    'le Bongo (from) mange la Marantacée (to), une seule fois',
  );
  // Une espèce d'un autre biome est une erreur de ligne, pas un simple avertissement.
  await db.execute("UPDATE gl_species SET biome_slug = 'taiga' WHERE species_code = 'SP0032'");
  const mauvaisBiome = await IMPORTERS['trame-reseaux'](db, json, { dryRun: true });
  assert.ok(mauvaisBiome.errors.some((e) => /SP0032 du biome taiga/.test(e)));
  await db.execute("UPDATE gl_species SET biome_slug = 'jungle_afc' WHERE species_code = 'SP0032'");
  for (const code of semees) {
    await db.execute(
      'DELETE FROM gl_species_interactions WHERE from_species_id = ? OR to_species_id = ?',
      [await id(code), await id(code)],
    );
    await db.execute('DELETE FROM gl_species WHERE species_code = ?', [code]);
  }
});
