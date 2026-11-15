'use strict';

/**
 * Catalogues de la Trame (`data/gl/tenir/trame-*.json`) — étape CI « Contenu pédagogique ».
 *
 * Mêmes validations que le chargeur, en mode strict, sur les **données** : 8 réseaux de 12
 * cartes, niveaux 5 / 7 / 9 / 12 jouables, scénarios de trame altérée parmi les neuf premières
 * cartes, fils cachés sans flèche d'une carte vers elle-même, réparer (11 mesures, 6 espèces à
 * ranger par plateau), aucune chaîne interdite. Le contrôle des espèces **en base** (codes
 * présents, bon biome) ne tourne que si la base porte le corpus ; une base neuve le saute.
 */

require('../helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { findForbiddenString } = require('../../lib/shared/glGardeFousCore');
const { PLATEAU_BIOMES } = require('../../lib/glTenirImport');
const { controlerReseau, NIVEAUX, NIVEAU_ALTEREE } = require('../../lib/glTrameImport');

const DIR = path.join(__dirname, '..', '..', 'data', 'gl', 'tenir');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), 'utf8'));

/** Toutes les chaînes d'un objet, avec leur chemin (pour le message d'échec). */
function chaines(obj, chemin = '') {
  if (typeof obj === 'string') return [[chemin, obj]];
  if (Array.isArray(obj)) return obj.flatMap((v, i) => chaines(v, `${chemin}[${i}]`));
  if (obj && typeof obj === 'object') {
    return Object.entries(obj).flatMap(([k, v]) => chaines(v, `${chemin}.${k}`));
  }
  return [];
}

test('réseaux : 8 biomes joués, 12 cartes, niveaux jouables, scénarios parmi les 9 premières', () => {
  const json = readJson('trame-reseaux');
  assert.ok(json.format);
  assert.deepEqual(json.niveaux, [...NIVEAUX]);
  assert.equal(json.niveau_trame_alteree, NIVEAU_ALTEREE);
  assert.equal(json.reseaux.length, 8);
  assert.deepEqual(
    json.reseaux.map((r) => r.biome),
    [1, 2, 3, 4].flatMap((p) => PLATEAU_BIOMES[p].slice(0, 2)),
    'deux biomes par plateau, dans l’ordre des plateaux',
  );
  for (const reseau of json.reseaux) {
    const c = controlerReseau(reseau, { plateauBiomes: PLATEAU_BIOMES });
    assert.deepEqual(c.errors, [], reseau.biome);
    assert.equal(c.scenarios.length, 3, `${reseau.biome} : trois scénarios`);
    // Un seul décomposeur générique au plus ; les charognards restent des consommateurs.
    for (const carte of c.cartes) {
      if (carte.regime === 'charognard') assert.equal(carte.role, 'consommateur', carte.code);
      if (carte.generique) assert.equal(carte.role, 'decomposeur', carte.code);
    }
    // Aucun lien écrit ne part d'un décomposeur générique ni n'y arrive : la règle le couvre.
    assert.ok(!c.liens.some((l) => l.de === 'DEC'), `${reseau.biome} : rien ne part de DEC`);
    for (const l of c.aDiscuter)
      assert.ok(l.pourquoi, `${reseau.biome} : un « pourquoi » par lien`);
  }
});

test('fils cachés : 4 plateaux, 9 cartes, liens entre cartes du plateau, jamais vers soi-même', () => {
  const json = readJson('trame-fils');
  assert.ok(json.format);
  assert.deepEqual(
    json.chapitres.map((c) => c.plateau),
    [1, 2, 3, 4],
  );
  for (const ch of json.chapitres) {
    const codes = ch.cartes.map((c) => c[0]);
    assert.equal(new Set(codes).size, 9, `plateau ${ch.plateau} : 9 cartes distinctes`);
    assert.ok(ch.titre && ch.titre.length <= 160);
    const vus = new Set();
    for (const [de, vers] of ch.liens) {
      assert.ok(codes.includes(de) && codes.includes(vers), `plateau ${ch.plateau} ${de}>${vers}`);
      assert.notEqual(de, vers, `plateau ${ch.plateau} : flèche d’une carte vers elle-même`);
      assert.ok(!vus.has(`${de}>${vers}`), `plateau ${ch.plateau} : lien en double`);
      vus.add(`${de}>${vers}`);
    }
    assert.ok(ch.liens.length >= 7);
    // Chaque carte participe à un fil : aucune carte décorative.
    for (const code of codes) {
      assert.ok(
        ch.liens.some(([de, vers]) => de === code || vers === code),
        `plateau ${ch.plateau} : carte ${code} isolée`,
      );
    }
  }
});

test('réparer : 11 mesures, 6 espèces à ranger par plateau, au moins une mesure acceptée par espèce', () => {
  const json = readJson('trame-reparer');
  assert.ok(json.format);
  const mesures = json.mesures.map((m) => m.code);
  assert.equal(new Set(mesures).size, 11);
  assert.deepEqual(
    json.chapitres.map((c) => c.plateau),
    [1, 2, 3, 4],
  );
  for (const ch of json.chapitres) {
    assert.equal(ch.a_classer.length, 6, `plateau ${ch.plateau}`);
    assert.equal(new Set(ch.a_classer.map((e) => e.code)).size, 6);
    for (const e of ch.a_classer) {
      assert.ok(['en_danger', 'fragile', 'pas_menace'].includes(e.categorie), e.code);
    }
    assert.ok(ch.especes.length >= 2, `plateau ${ch.plateau} : deux espèces menacées au moins`);
    for (const e of ch.especes) {
      assert.ok(e.menace, e.code);
      assert.ok(e.mesures.length >= 1, `${e.code} : une mesure acceptée`);
      for (const m of e.mesures) assert.ok(mesures.includes(m), `${e.code} : mesure ${m}`);
    }
    assert.ok(ch.lecon, `plateau ${ch.plateau} : leçon`);
  }
});

test('aucune chaîne interdite dans les trois fichiers (ni dans leurs jumeaux d’exemple)', () => {
  for (const name of ['trame-reseaux', 'trame-fils', 'trame-reparer']) {
    for (const dossier of [DIR, path.join(DIR, 'exemple')]) {
      const json = JSON.parse(fs.readFileSync(path.join(dossier, `${name}.json`), 'utf8'));
      // `classement` est une clé technique du fichier (les statuts rangés par catégorie) et sa
      // `consigne` une note de construction : elles ne sont jamais servies à un élève.
      const { classement: _technique, ...visible } = json;
      for (const [chemin, valeur] of chaines(visible)) {
        assert.equal(findForbiddenString(valeur), null, `${name}${chemin}`);
      }
    }
  }
});

test('en base : import strict à blanc (espèces présentes et du bon biome) — sauté sans corpus', async (t) => {
  const db = require('../../database');
  await db.initSchema();
  const corpus = await db.queryOne(
    "SELECT COUNT(*) AS n FROM gl_species WHERE species_code IN ('SP0045', 'SP0095', 'SP0052')",
  );
  if (Number(corpus?.n) < 3) {
    t.skip('base sans le corpus des espèces : contrôle en base sauté');
    return;
  }
  const { runImports } = require('../../scripts/gl-import-tenir');
  for (const fichier of ['trame-reseaux', 'trame-fils', 'trame-reparer']) {
    const [rep] = await runImports(db, { fichier, dryRun: true, strict: true, dossier: DIR });
    assert.deepEqual(rep.errors, [], fichier);
    assert.equal(rep.ecartees, 0, fichier);
  }
});

test('pages de veillée gagnées par un défi : sur le corpus, aucune ne nomme l’oiseau ni ne sort du Passeur', async () => {
  const db = require('../../database');
  const { pagesTirables } = require('../../lib/glTrameDefis');
  await db.initSchema();
  const chapitres = await db.queryAll(
    `SELECT MIN(id) AS id, plateau_number FROM gl_chapters
      WHERE plateau_number BETWEEN 1 AND 4 GROUP BY plateau_number ORDER BY plateau_number`,
  );
  const chasse = new Set(
    (
      await db.queryAll('SELECT feuillet_code FROM gl_chasse_zones WHERE feuillet_code IS NOT NULL')
    ).map((r) => String(r.feuillet_code)),
  );
  let vues = 0;
  for (const ch of chapitres) {
    const pages = await pagesTirables(db, { chapter_id: ch.id });
    for (const f of pages) {
      vues += 1;
      const ou = `plateau ${ch.plateau_number}, ${f.feuillet_code}`;
      assert.equal(findForbiddenString(f.titre), null, `${ou} : titre`);
      assert.equal(findForbiddenString(f.incipit), null, `${ou} : incipit`);
      assert.ok(!['corbeau', 'carnet_route'].includes(String(f.mode_apparition)), ou);
      assert.ok(!chasse.has(String(f.feuillet_code)), `${ou} : page de zone de chasse`);
    }
  }
  // Une base sans corpus de pages (CI minimale) n'a rien à tirer : le contrôle est sans objet.
  if (!vues) return;
  assert.ok(vues >= chapitres.length, 'au moins une page à gagner par plateau');
});
