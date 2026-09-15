'use strict';

/**
 * Corpus du Complexe Nawal El Moutawakel (carte `beaulieu`, migration 246).
 *
 * Contrôle **statique** du fichier de migration, sans base : le contenu n'est semé qu'en
 * production (les inserts sont gardés par l'existence de la carte, absente d'une base neuve),
 * donc une assertion SQL ne verrait rien en CI. Ce qui peut dériver ici, c'est la **géométrie** :
 * un polygone hors cadre ou à moins de trois sommets est silencieusement écarté du calque
 * (`parseZonesForLayer`), et la zone disparaît de la carte sans erreur.
 */

const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert');

const MIGRATION = path.join(
  __dirname,
  '..',
  '..',
  'migrations',
  '246_beaulieu_complexe_nawal_el_moutawakel.sql',
);
const SQL = fs.readFileSync(MIGRATION, 'utf8');

/** Blocs `INSERT IGNORE INTO <table> ... FROM maps WHERE id = 'beaulieu';` du fichier. */
function insertBlocks(table) {
  const re = new RegExp(
    `INSERT IGNORE INTO ${table}\\b[\\s\\S]*?FROM maps WHERE id = 'beaulieu';`,
    'g',
  );
  return SQL.match(re) || [];
}

/** Premier littéral SQL d'un bloc : l'identifiant de la ligne insérée. */
function firstLiteral(block) {
  const match = /SELECT '([^']+)'/.exec(block);
  return match ? match[1] : null;
}

const zoneBlocks = insertBlocks('zones');
const markerBlocks = insertBlocks('map_markers');
const categoryBlocks = insertBlocks('location_categories');

test('la migration sème bien zones, repères et catégories de la carte beaulieu', () => {
  assert.ok(zoneBlocks.length >= 8, `zones attendues : ${zoneBlocks.length}`);
  assert.ok(markerBlocks.length >= 10, `repères attendus : ${markerBlocks.length}`);
  assert.ok(categoryBlocks.length >= 6, `catégories attendues : ${categoryBlocks.length}`);
});

test('tous les identifiants semés sont préfixés beaulieu- et uniques', () => {
  const ids = [...zoneBlocks, ...markerBlocks, ...categoryBlocks].map(firstLiteral);
  assert.ok(
    ids.every((id) => id && id.startsWith('beaulieu-')),
    `identifiants hors préfixe : ${ids.filter((id) => !id || !id.startsWith('beaulieu-')).join(', ')}`,
  );
  assert.equal(new Set(ids).size, ids.length, 'identifiant en double dans la migration');
});

test('chaque zone porte un polygone exploitable, entièrement dans le cadre', () => {
  for (const block of zoneBlocks) {
    const id = firstLiteral(block);
    const raw = /'(\[\{"xp"[^']+\])'/.exec(block);
    assert.ok(raw, `${id} : pas de polygone`);
    const points = JSON.parse(raw[1]);
    // < 3 sommets : la zone est écartée du calque carte, donc invisible sans erreur.
    assert.ok(points.length >= 3, `${id} : ${points.length} sommet(s), minimum 3`);
    for (const point of points) {
      assert.ok(
        Number.isFinite(point.xp) && point.xp >= 0 && point.xp <= 100,
        `${id} : xp hors [0, 100] (${point.xp})`,
      );
      assert.ok(
        Number.isFinite(point.yp) && point.yp >= 0 && point.yp <= 100,
        `${id} : yp hors [0, 100] (${point.yp})`,
      );
    }
  }
});

test('chaque repère est posé dans le cadre du plan', () => {
  for (const block of markerBlocks) {
    const id = firstLiteral(block);
    const coords = /SELECT '[^']+', 'beaulieu', ([\d.]+), ([\d.]+),/.exec(block);
    assert.ok(coords, `${id} : coordonnées illisibles`);
    const [xp, yp] = [Number(coords[1]), Number(coords[2])];
    assert.ok(xp > 0 && xp < 100, `${id} : x_pct hors cadre (${xp})`);
    assert.ok(yp > 0 && yp < 100, `${id} : y_pct hors cadre (${yp})`);
  }
});

test('chaque zone et chaque repère porte une description non vide', () => {
  for (const block of [...zoneBlocks, ...markerBlocks]) {
    const id = firstLiteral(block);
    // Le texte long est le seul littéral de plus de 80 caractères du bloc.
    const longest = (block.match(/'(?:[^']|'')*'/g) || [])
      .map((s) => s.slice(1, -1))
      .sort((a, b) => b.length - a.length)[0];
    assert.ok(longest && longest.length >= 80, `${id} : description absente ou trop courte`);
  }
});

test('chaque rattachement de catégorie vise une catégorie semée par la migration', () => {
  const declared = new Set(categoryBlocks.map(firstLiteral));
  // `cat-infrastructure` est la catégorie globale du schéma, valide sans être semée ici.
  declared.add('cat-infrastructure');
  const links = [
    ...SQL.matchAll(
      /INSERT IGNORE INTO (?:zone|marker)_categories[\s\S]*?SELECT '[^']+', '([^']+)'/g,
    ),
  ].map((m) => m[1]);
  assert.ok(links.length >= zoneBlocks.length + markerBlocks.length, 'rattachements manquants');
  for (const category of links) {
    assert.ok(declared.has(category), `catégorie inconnue : ${category}`);
  }
});
