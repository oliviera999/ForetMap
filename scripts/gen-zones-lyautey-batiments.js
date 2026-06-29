#!/usr/bin/env node
/**
 * Génère `sql/zones_lyautey_batiments.sql` — zones « bâtiments » de la partie
 * centrale de la carte `lyautey` (Lycée Lyautey), directement importables en BDD.
 *
 * Pourquoi un générateur plutôt qu'un SQL écrit à la main ?
 *  - Les coordonnées sont relevées **visuellement** sur la capture de la carte
 *    (premier jet, à affiner) ; les ajuster = éditer le tableau `BATIMENTS`
 *    ci-dessous puis relancer `node scripts/gen-zones-lyautey-batiments.js`.
 *  - Le JSON `points` reste forcément valide (généré via JSON.stringify).
 *
 * Système de coordonnées (cf. src/components/map-views.jsx : toWorld) :
 *  chaque sommet de polygone est exprimé en **pourcentages** de l'image de fond
 *  ( {xp, yp}, 0 → 100, origine en haut-gauche ). C'est indépendant de la taille
 *  en pixels de l'image, donc robuste si la map est ré-uploadée à une autre
 *  résolution tant que le **cadrage** reste identique.
 *
 * Modèle de zone (table `zones`, cf. sql/schema_foretmap.sql) : les zones
 * modernes sont des polygones → x/y/width/height = 0, shape = 'rect' (legacy,
 * non utilisé quand `points` est renseigné), géométrie portée par `points`.
 */

const fs = require('fs');
const path = require('path');

const MAP_ID = 'lyautey';
// Gris semi-transparent (alpha ~50 %) : distingue les bâtiments des zones
// de culture (vert `#86efac80` par défaut).
const COULEUR_BATIMENT = '#9ca3af80';

/**
 * Bâtiments de la partie centrale (campus du lycée), du nord vers le sud.
 * `points` : sommets [xp, yp] en % de l'image. Relevé visuel — à affiner.
 */
const BATIMENTS = [
  {
    id: 'lyautey-bat-01',
    name: 'Bâtiment Nord-Ouest',
    description: 'Bâtiment au nord-ouest du campus (côté Rue de la Réunion).',
    points: [
      [12, 5],
      [21, 5],
      [21, 12],
      [12, 12],
    ],
  },
  {
    id: 'lyautey-bat-02',
    name: 'Grand bâtiment Nord',
    description: 'Grand bâtiment au nord du campus (bloc central supérieur).',
    points: [
      [31, 5.5],
      [55, 5.5],
      [55, 13],
      [31, 13],
    ],
  },
  {
    id: 'lyautey-bat-03',
    name: 'Bâtiment Nord-Est',
    description: 'Bâtiment au nord-est du campus (côté Rue Indochine).',
    points: [
      [63, 13],
      [72, 13],
      [72, 21],
      [63, 21],
    ],
  },
  {
    id: 'lyautey-bat-04',
    name: 'Bâtiment Ouest',
    description: 'Bâtiment sur le flanc ouest du campus.',
    points: [
      [12, 16],
      [21, 16],
      [21, 26],
      [12, 26],
    ],
  },
  {
    id: 'lyautey-bat-05',
    name: 'Bâtiment central',
    description: 'Bâtiment principal au centre, près du repère « Lycée Lyautey ».',
    points: [
      [40, 34],
      [51, 34],
      [51, 43],
      [40, 43],
    ],
  },
  {
    id: 'lyautey-bat-06',
    name: 'Bâtiment Centre-Ouest',
    description: 'Bâtiment du centre, à l’ouest du repère principal.',
    points: [
      [34, 38],
      [40, 38],
      [40, 47],
      [34, 47],
    ],
  },
  {
    id: 'lyautey-bat-07',
    name: 'Bâtiment Centre-Est',
    description: 'Bâtiment du centre, à l’est du repère principal.',
    points: [
      [60, 31],
      [72, 31],
      [72, 42],
      [60, 42],
    ],
  },
  {
    id: 'lyautey-bat-08',
    name: 'Bâtiment Est',
    description: 'Bâtiment sur le flanc est du campus (vers le Lycée Maïmonide).',
    points: [
      [71, 43],
      [81, 43],
      [81, 51],
      [71, 51],
    ],
  },
  {
    id: 'lyautey-bat-09',
    name: 'Bâtiment Sud-Ouest',
    description: 'Bâtiment au sud-ouest, au-dessus du long bâtiment central.',
    points: [
      [20, 47],
      [29, 47],
      [29, 54],
      [20, 54],
    ],
  },
  {
    id: 'lyautey-bat-10',
    name: 'Long bâtiment Sud',
    description: 'Long bâtiment horizontal traversant le sud du campus.',
    points: [
      [21, 56],
      [61, 56],
      [61, 61],
      [21, 61],
    ],
  },
  {
    id: 'lyautey-bat-11',
    name: 'Bâtiment Sud-Centre',
    description: 'Bâtiment au sud du long bâtiment central.',
    points: [
      [37, 68],
      [47, 68],
      [47, 74],
      [37, 74],
    ],
  },
  {
    id: 'lyautey-bat-12',
    name: 'Bâtiment Sud-Est',
    description: 'Bâtiment au sud-est du campus.',
    points: [
      [60, 64],
      [70, 64],
      [70, 71],
      [60, 71],
    ],
  },
];

/** Échappe une chaîne pour une valeur SQL entre quotes simples. */
function sqlStr(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Sérialise les sommets [xp, yp] vers le JSON attendu par le front. */
function pointsJson(points) {
  return JSON.stringify(points.map(([xp, yp]) => ({ xp, yp })));
}

function buildSql() {
  const lignes = [];
  lignes.push('-- Zones « bâtiments » — partie centrale de la carte `lyautey` (Lycée Lyautey).');
  lignes.push('-- Généré par scripts/gen-zones-lyautey-batiments.js — NE PAS éditer à la main.');
  lignes.push('--');
  lignes.push('-- Import : mysql -u <user> -p <base> < sql/zones_lyautey_batiments.sql');
  lignes.push(
    '-- Idempotent : ré-exécutable sans doublon (ON DUPLICATE KEY UPDATE par id stable).',
  );
  lignes.push('-- Géométrie : polygones en % de l’image de fond ({xp,yp}, 0→100).');
  lignes.push(
    '-- ⚠ Coordonnées relevées visuellement sur la capture — à affiner dans l’éditeur prof.',
  );
  lignes.push('');
  lignes.push('-- Garde-fou : la carte doit exister (no-op si déjà présente).');
  lignes.push(
    `INSERT IGNORE INTO maps (id, label, sort_order) VALUES (${sqlStr(MAP_ID)}, ${sqlStr(
      'Lycée Lyautey',
    )}, 3);`,
  );
  lignes.push('');

  for (const b of BATIMENTS) {
    lignes.push(`-- ${b.name}`);
    lignes.push(
      'INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description) VALUES',
    );
    lignes.push(
      `  (${sqlStr(b.id)}, ${sqlStr(MAP_ID)}, ${sqlStr(b.name)}, 0, 0, 0, 0, '', 'special', 1, ` +
        `'rect', ${sqlStr(pointsJson(b.points))}, ${sqlStr(COULEUR_BATIMENT)}, ${sqlStr(
          b.description,
        )})`,
    );
    lignes.push('ON DUPLICATE KEY UPDATE');
    lignes.push('  map_id = VALUES(map_id),');
    lignes.push('  name = VALUES(name),');
    lignes.push('  stage = VALUES(stage),');
    lignes.push('  special = VALUES(special),');
    lignes.push('  shape = VALUES(shape),');
    lignes.push('  points = VALUES(points),');
    lignes.push('  color = VALUES(color),');
    lignes.push('  description = VALUES(description);');
    lignes.push('');
  }

  return `${lignes.join('\n')}\n`;
}

module.exports = { MAP_ID, COULEUR_BATIMENT, BATIMENTS, pointsJson, sqlStr };

if (require.main === module) {
  const outPath = path.join(__dirname, '..', 'sql', 'zones_lyautey_batiments.sql');
  fs.writeFileSync(outPath, buildSql(), 'utf8');
  process.stdout.write(
    `Écrit : ${path.relative(path.join(__dirname, '..'), outPath)} (${BATIMENTS.length} bâtiments)\n`,
  );
}
