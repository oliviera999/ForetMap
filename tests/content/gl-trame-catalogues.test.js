'use strict';

/**
 * Catalogues de la Trame (`data/gl/tenir/trame-*.json`) — étape CI « Contenu pédagogique ».
 *
 * Mêmes validations que le chargeur, en mode strict, sur les **données** : 8 réseaux de 12
 * cartes, niveaux 5 / 7 / 9 / 12 jouables, scénarios de trame altérée parmi les neuf premières
 * cartes, fils cachés sans flèche d'une carte vers elle-même, réparer (11 mesures, 6 espèces à
 * ranger par plateau), aucune chaîne interdite. Ensemble unifié (M21) : « Le bon rôle » (8 jeux,
 * un par biome), « Le bon pays » (4 jeux, un par plateau) et « Les fils de l'adaptation » (8 jeux,
 * un par biome). Le contrôle des espèces **en base** (codes présents, bon biome) ne tourne que
 * si la base porte le corpus ; une base neuve le saute.
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

const BIOMES_PAR_PLATEAU = [1, 2, 3, 4].map((p) => PLATEAU_BIOMES[p].slice(0, 2));
const BIOMES_JOUES = BIOMES_PAR_PLATEAU.flat();

test('ranger : « Le bon rôle » (un jeu par biome, 8 cartes, trois rôles) et « Le bon pays » (un jeu par plateau, un indice par carte)', () => {
  const json = readJson('trame-ranger');
  assert.ok(json.format);
  assert.deepEqual(Object.keys(json.familles), ['role', 'pays']);
  const roles = json.familles.role.categories.map((c) => c.code);
  assert.deepEqual(roles, ['producteur', 'consommateur', 'decomposeur']);
  for (const f of Object.values(json.familles)) {
    assert.ok(f.nom && f.consigne, 'nom et consigne de la famille');
  }
  const role = json.jeux.filter((j) => j.famille === 'role');
  const pays = json.jeux.filter((j) => j.famille === 'pays');
  assert.equal(json.jeux.length, role.length + pays.length, 'aucune autre famille');
  assert.deepEqual(
    role.map((j) => j.biome),
    BIOMES_JOUES,
    'un jeu de rôle par biome joué, dans l’ordre des plateaux',
  );
  assert.deepEqual(
    pays.map((j) => [j.plateau, j.unite]),
    [1, 2, 3, 4].map((p) => [p, `p${p}`]),
  );
  assert.equal(new Set(json.jeux.map((j) => j.code)).size, json.jeux.length, 'codes distincts');
  for (const j of role) {
    assert.equal(j.unite, j.biome, j.code);
    assert.ok(PLATEAU_BIOMES[j.plateau].includes(j.biome), `${j.code} : biome du plateau`);
    assert.equal(j.cartes.length, 8, `${j.code} : 8 cartes`);
    for (const r of roles) {
      assert.ok(
        j.cartes.some((c) => c.categorie === r),
        `${j.code} : au moins une carte « ${r} »`,
      );
    }
  }
  for (const j of pays) {
    assert.ok(j.cartes.length >= 8 && j.cartes.length <= 10, `${j.code} : 8 à 10 cartes`);
    // Les pays du plateau, et ceux déjà traversés qui reviennent : jamais un pays à venir.
    const connus = BIOMES_PAR_PLATEAU.slice(0, j.plateau).flat();
    for (const c of j.categories) assert.ok(connus.includes(c), `${j.code} : pays ${c} à venir`);
    for (const b of BIOMES_PAR_PLATEAU[j.plateau - 1]) {
      assert.ok(j.categories.includes(b), `${j.code} : pays ${b} du plateau`);
    }
    for (const c of j.cartes) assert.ok(c.indice, `${j.code} ${c.code} : indice`);
  }
  for (const j of json.jeux) {
    assert.ok(j.titre && j.titre.length <= 160, j.code);
    assert.ok(j.bilan, `${j.code} : bilan`);
    assert.equal(new Set(j.cartes.map((c) => c.code)).size, j.cartes.length, `${j.code} : cartes`);
    const admises = j.famille === 'role' ? roles : j.categories;
    for (const c of j.cartes) {
      const ou = `${j.code} ${c.code}`;
      assert.ok(c.nom && c.pourquoi, `${ou} : nom et pourquoi`);
      assert.ok(admises.includes(c.categorie), `${ou} : catégorie ${c.categorie}`);
      // Une carte générique (pas de fiche d'espèce) porte un code DEC-… et `generique` ; elle
      // seule : toute autre carte est une fiche d'espèce.
      assert.equal(c.generique === true, /^DEC-/.test(c.code), `${ou} : générique`);
      if (c.generique) assert.equal(c.categorie, 'decomposeur', `${ou} : rôle d’une carte DEC`);
      else assert.match(c.code, /^SP\d{4}$/, ou);
    }
  }
});

test('fils de l’adaptation : un jeu par biome, 9 cartes, 6 ou 7 fils, chaque carte tient à un fil', () => {
  const json = readJson('trame-adaptations');
  assert.ok(json.format);
  assert.ok(json.consigne);
  assert.deepEqual(
    json.biomes.map((b) => b.biome),
    BIOMES_JOUES,
  );
  for (const b of json.biomes) {
    assert.ok(PLATEAU_BIOMES[b.plateau].includes(b.biome), `${b.biome} : plateau`);
    assert.ok(b.titre && b.titre.length <= 160, b.biome);
    const codes = b.cartes.map((c) => c[0]);
    assert.equal(new Set(codes).size, 9, `${b.biome} : 9 cartes distinctes`);
    assert.ok([6, 7].includes(b.liens.length), `${b.biome} : 6 ou 7 fils`);
    const vus = new Set();
    for (const [de, vers] of b.liens) {
      assert.ok(codes.includes(de) && codes.includes(vers), `${b.biome} ${de}>${vers}`);
      assert.notEqual(de, vers, `${b.biome} : fil d’une carte vers elle-même`);
      assert.ok(!vus.has(`${de}>${vers}`) && !vus.has(`${vers}>${de}`), `${b.biome} ${de}>${vers}`);
      vus.add(`${de}>${vers}`);
    }
    for (const code of codes) {
      assert.ok(
        b.liens.some(([de, vers]) => de === code || vers === code),
        `${b.biome} : carte ${code} isolée`,
      );
    }
    // Du milieu vers l'espèce : au moins un départ (rien n'y mène), au moins une arrivée.
    assert.ok(
      codes.some((c) => !b.liens.some(([, vers]) => vers === c)),
      `${b.biome} : un départ`,
    );
    assert.ok(
      codes.some((c) => !b.liens.some(([de]) => de === c)),
      `${b.biome} : une arrivée`,
    );
  }
});

test('ranger, adaptations : aucune chaîne interdite (ni dans leurs jumeaux d’exemple)', () => {
  for (const name of ['trame-ranger', 'trame-adaptations']) {
    for (const dossier of [DIR, path.join(DIR, 'exemple')]) {
      const json = JSON.parse(fs.readFileSync(path.join(dossier, `${name}.json`), 'utf8'));
      for (const [chemin, valeur] of chaines(json)) {
        assert.equal(findForbiddenString(valeur), null, `${name}${chemin}`);
      }
    }
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
  for (const fichier of [
    'trame-reseaux',
    'trame-fils',
    'trame-reparer',
    'trame-ranger',
    'trame-adaptations',
  ]) {
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
