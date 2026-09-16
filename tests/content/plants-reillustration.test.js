'use strict';

require('../helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, queryAll } = require('../../database');

/**
 * Réillustration des fiches à photo morte (migration 257).
 *
 * Test de **contenu** : il porte sur les données semées par les migrations, pas sur une
 * fonction, et tombe donc dans le job CI `contenu` (cf. CLAUDE.md).
 *
 * Ce qu'il tient, c'est la leçon des deux migrations précédentes. La 252 a trouvé
 * 42 fiches pointant un fichier supprimé de Commons ; la 257 les a réillustrées, et son
 * premier jet automatique attribuait au criquet marocain une photo d'une autre espèce.
 * Les deux défauts — le lien mort et l'illustration plausible mais fausse — se rattrapent
 * mal à l'œil sur 250 fiches.
 */

/** Les 30 fiches que la migration 252 avait laissées sans photo. */
const REILLUSTREES = [
  'Arganier',
  'Artichaut',
  'Bois mort',
  'Bougainvillier',
  'Capucine',
  'Caroubier',
  'Champignons de litière',
  'Citronnier',
  'Coccinelle à sept points',
  'Cochenille de la figue de Barbarie',
  'Crapaud de Maurétanie',
  'Criquet marocain',
  'Escargot petit-gris',
  'Fenouil',
  'Figuier commun',
  'Figuier de Barbarie',
  'Merle noir',
  'Moustique commun',
  'Olivier',
  'Palmier-dattier',
  'Pois chiche',
  'Pâquerette',
  'Rhizobium',
  'Souci officinal',
  'Sureau noir',
  'Syrphe ceinturé',
  'Tarente de Maurétanie',
  'Tillandsia',
  'Violette odorante',
  'Volubilis',
];

let fiches = [];

before(async () => {
  await initSchema();
  fiches = await queryAll(
    `SELECT name, photo, photo_credit, photo_licence
       FROM plants
      WHERE name IN (${REILLUSTREES.map(() => '?').join(',')})
      ORDER BY name`,
    REILLUSTREES,
  );
});

test('aucune des fiches réillustrées n’est restée sans photo', () => {
  const nues = fiches.filter((row) => !row.photo).map((row) => row.name);
  assert.deepStrictEqual(nues, [], 'fiche sans photo principale');
});

test('chaque photo porte son auteur et sa licence', () => {
  const sansAttribution = fiches
    .filter((row) => !row.photo_credit || !row.photo_licence)
    .map((row) => row.name);
  assert.deepStrictEqual(
    sansAttribution,
    [],
    'les licences CC du catalogue imposent de nommer l’auteur',
  );
});

test('les fiches pointent un fichier Commons, pas un hébergement de passage', () => {
  const ailleurs = fiches
    .filter((row) => !/^https:\/\/(upload|commons)\.wikimedia\.org\//.test(String(row.photo)))
    .map((row) => `${row.name} → ${row.photo}`);
  assert.deepStrictEqual(ailleurs, [], 'photo hors Wikimedia : licence et pérennité inconnues');
});

/**
 * Le garde-fou « bonne espèce ». Il ne peut pas remplacer une relecture humaine, mais il
 * attrape le cas qui s'est réellement produit : un fichier dont le nom annonce un autre
 * taxon que celui de la fiche. Seules les fiches dont le nom de fichier mentionne un genre
 * latin sont jugées — c'est le cas de la plupart, et un nom vernaculaire n'apprend rien.
 */
const GENRE_ATTENDU = {
  // « Champignons de litière » n'y figure pas volontairement : la fiche est un clade
  // (`Fungi (saprophytes)`), pas une espèce. Le catalogue livré l'illustre par un
  // *Coprinellus disseminatus* et la production par un *Marasmius oreades* — deux
  // champignons de litière, tous deux justes. Exiger un genre y serait un faux positif.
  'Coccinelle à sept points': 'coccinella',
  'Cochenille de la figue de Barbarie': 'dactylopius',
  'Crapaud de Maurétanie': 'mauritanic',
  'Criquet marocain': 'dociostaurus',
  'Escargot petit-gris': 'cornu',
  Fenouil: 'foeniculum',
  'Figuier commun': 'ficus',
  'Figuier de Barbarie': 'opuntia',
  'Merle noir': 'turdus',
  'Moustique commun': 'culex',
  Olivier: 'olea',
  'Palmier-dattier': 'phoenix',
  'Pois chiche': 'cicer',
  Pâquerette: 'bellis',
  Rhizobium: 'rhizobium',
  'Souci officinal': 'calendula',
  'Sureau noir': 'sambucus',
  'Syrphe ceinturé': 'episyrphus',
  'Tarente de Maurétanie': 'tarentola',
  Tillandsia: 'tillandsia',
  'Violette odorante': 'viola',
  Volubilis: 'ipomoea',
  Artichaut: 'cynara',
  Bougainvillier: 'bougainvillea',
  Capucine: 'tropaeolum',
  Caroubier: 'ceratonia',
};

test('le nom du fichier ne désigne pas un autre taxon que la fiche', () => {
  const suspectes = [];
  for (const row of fiches) {
    const attendu = GENRE_ATTENDU[row.name];
    if (!attendu) continue;
    const fichier = decodeURIComponent(String(row.photo)).toLowerCase();
    if (!fichier.includes(attendu)) suspectes.push(`${row.name} → ${row.photo}`);
  }
  assert.deepStrictEqual(
    suspectes,
    [],
    'le fichier ne nomme pas le taxon attendu : vérifier qu’il ne montre pas une autre espèce',
  );
});

test('aucune fiche n’est illustrée par une planche ancienne ou une carte', () => {
  // Une planche du XIXᵉ ou une carte de répartition n'apprend pas à reconnaître l'espèce
  // sur le terrain, qui est l'usage de ce catalogue.
  const inadapte =
    /k(ö|oe|o)hler|sturm|lindman|botanical.register|illustration|planche|presence.in|distribution.map/i;
  const mauvaises = fiches
    .filter((row) => inadapte.test(decodeURIComponent(String(row.photo))))
    .map((row) => `${row.name} → ${row.photo}`);
  assert.deepStrictEqual(mauvaises, [], 'illustration inadaptée à la détermination de terrain');
});
