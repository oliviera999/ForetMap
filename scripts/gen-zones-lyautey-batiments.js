#!/usr/bin/env node
/**
 * Génère `sql/zones_lyautey_batiments.sql` — zones « bâtiments » de la partie
 * centrale de la carte `lyautey` (Lycée Lyautey), directement importables en BDD.
 *
 * Source du tracé : vue OpenStreetMap **étiquetée** du campus (bâtiments G, D, S,
 * M, I, L, K, H + Salle Delacroix, Infirmerie, CDI, Vie scolaire). Les polygones
 * suivent les empreintes visibles, en tenant compte de l'inclinaison du quartier
 * (les rues — Réunion, Indochine, Ziraoui — sont diagonales → bâtiments en quads
 * légèrement tournés, pas de simples rectangles).
 *
 * ⚠ ALIGNEMENT : les sommets sont en **pourcentages du cadrage de l'image OSM**
 * ayant servi au tracé. Les zones ne s'aligneront QUE si le fond de la carte
 * `lyautey` est cette même image (même cadrage). Si le fond reste une autre
 * capture (ex. vue Google Maps), il faut re-mapper.
 *
 * Affiner le tracé : éditer le tableau `BATIMENTS` puis relancer
 *   node scripts/gen-zones-lyautey-batiments.js
 * Le JSON `points` reste forcément valide (généré via JSON.stringify).
 *
 * Système de coordonnées (cf. src/components/map-views.jsx : toWorld) :
 *  chaque sommet de polygone est exprimé en **pourcentages** de l'image de fond
 *  ( {xp, yp}, 0 → 100, origine en haut-gauche ). Indépendant de la taille en
 *  pixels de l'image tant que le **cadrage** reste identique.
 *
 * Modèle de zone (table `zones`, cf. sql/schema_foretmap.sql) : zones modernes =
 *  polygones → x/y/width/height = 0, shape = 'rect' (legacy, ignoré quand
 *  `points` est renseigné), géométrie portée par `points`.
 */

const fs = require('fs');
const path = require('path');

const MAP_ID = 'lyautey';
// Proportions de l'image OSM ayant servi au relevé (px). Utilisé pour l'aperçu.
const IMG_W = 574;
const IMG_H = 682;
// Gris semi-transparent (alpha ~50 %) : distingue les bâtiments des zones de
// culture (vert `#86efac80` par défaut).
const COULEUR_BATIMENT = '#9ca3af80';

// Anciennes zones grossières (rectangles génériques de la 1re passe) — supprimées
// à l'import pour laisser place au tracé étiqueté ci-dessous (no-op si absentes).
const ANCIENS_IDS = Array.from(
  { length: 12 },
  (_, i) => `lyautey-bat-${String(i + 1).padStart(2, '0')}`,
);

/**
 * Bâtiments de la partie centrale (campus), du nord vers le sud.
 * `points` : sommets [xp, yp] en % de l'image OSM (relevé visuel ; quads suivant
 * l'inclinaison du quartier). Ordre horaire à partir du coin haut-gauche.
 */
const BATIMENTS = [
  {
    id: 'lyautey-bat-g',
    name: 'Bâtiment G',
    description: 'Bâtiment G (nord du campus).',
    points: [
      [49.3, 10.0],
      [65.9, 8.1],
      [67.9, 17.6],
      [51.7, 19.5],
    ],
  },
  {
    id: 'lyautey-salle-delacroix',
    name: 'Salle Delacroix',
    description: 'Salle Delacroix (nord-est, à droite du Bâtiment G).',
    points: [
      [67.4, 12.0],
      [77.0, 11.0],
      [78.4, 19.4],
      [68.5, 20.5],
    ],
  },
  {
    id: 'lyautey-bat-d',
    name: 'Bâtiment D',
    description: 'Bâtiment D (nord-ouest du campus).',
    points: [
      [18.8, 14.4],
      [36.9, 12.0],
      [38.7, 23.2],
      [20.6, 25.7],
    ],
  },
  {
    id: 'lyautey-bat-s',
    name: 'Bâtiment S',
    description: 'Bâtiment S (flanc ouest, côté Rue de la Réunion).',
    points: [
      [5.2, 22.3],
      [18.8, 20.5],
      [20.6, 33.0],
      [6.6, 34.9],
    ],
  },
  {
    id: 'lyautey-infirmerie',
    name: 'Infirmerie du Lycée Lyautey',
    description: 'Infirmerie du Lycée Lyautey (centre).',
    points: [
      [60.3, 31.4],
      [70.0, 30.5],
      [71.1, 36.4],
      [61.3, 37.2],
    ],
  },
  {
    id: 'lyautey-cdi',
    name: 'Centre de Documentation et d’Information',
    description: 'CDI — Centre de Documentation et d’Information (centre).',
    points: [
      [44.6, 36.7],
      [60.6, 34.9],
      [62.4, 47.8],
      [46.3, 49.6],
    ],
  },
  {
    id: 'lyautey-bat-m',
    name: 'Bâtiment M',
    description: 'Bâtiment M (centre-ouest).',
    points: [
      [10.5, 42.5],
      [32.8, 39.9],
      [34.5, 52.5],
      [12.2, 55.1],
    ],
  },
  {
    id: 'lyautey-bat-i',
    name: 'Bâtiment I',
    description: 'Bâtiment I (centre-est, côté Rue d’Indochine).',
    points: [
      [71.4, 42.8],
      [86.2, 41.1],
      [88.0, 52.8],
      [73.2, 54.5],
    ],
  },
  {
    id: 'lyautey-bat-l',
    name: 'Bâtiment L',
    description: 'Bâtiment L (long bâtiment, centre-sud).',
    points: [
      [21.3, 57.5],
      [51.9, 54.0],
      [53.7, 64.2],
      [23.0, 67.7],
    ],
  },
  {
    id: 'lyautey-vie-scolaire',
    name: 'Vie scolaire',
    description: 'Vie scolaire (sud-est).',
    points: [
      [74.9, 61.0],
      [89.2, 59.2],
      [90.6, 66.9],
      [76.3, 68.6],
    ],
  },
  {
    id: 'lyautey-bat-k',
    name: 'Bâtiment K',
    description: 'Bâtiment K (sud du campus).',
    points: [
      [43.9, 65.7],
      [60.6, 63.6],
      [62.4, 73.3],
      [45.6, 75.4],
    ],
  },
  {
    id: 'lyautey-bat-h',
    name: 'Bâtiment H',
    description: 'Bâtiment H (long bâtiment sud, côté Boulevard Ziraoui).',
    points: [
      [46.7, 74.5],
      [82.6, 70.1],
      [84.7, 81.5],
      [48.8, 85.9],
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
  lignes.push('-- Tracé relevé sur la vue OpenStreetMap étiquetée du campus (G, D, S, M, I, L,');
  lignes.push('--   K, H, Salle Delacroix, Infirmerie, CDI, Vie scolaire).');
  lignes.push('-- ⚠ Les % sont relatifs au CADRAGE de cette image OSM : le fond de la carte');
  lignes.push('--   `lyautey` doit être cette même image pour que les zones s’alignent.');
  lignes.push('');
  lignes.push('-- Garde-fou : la carte doit exister (no-op si déjà présente).');
  lignes.push(
    `INSERT IGNORE INTO maps (id, label, sort_order) VALUES (${sqlStr(MAP_ID)}, ${sqlStr(
      'Lycée Lyautey',
    )}, 3);`,
  );
  lignes.push('');
  lignes.push('-- Nettoyage des rectangles génériques de la 1re passe (no-op si absents).');
  lignes.push(
    `DELETE FROM zones WHERE map_id = ${sqlStr(MAP_ID)} AND id IN (${ANCIENS_IDS.map(sqlStr).join(
      ', ',
    )});`,
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

module.exports = {
  MAP_ID,
  IMG_W,
  IMG_H,
  COULEUR_BATIMENT,
  ANCIENS_IDS,
  BATIMENTS,
  pointsJson,
  sqlStr,
};

if (require.main === module) {
  const outPath = path.join(__dirname, '..', 'sql', 'zones_lyautey_batiments.sql');
  fs.writeFileSync(outPath, buildSql(), 'utf8');
  process.stdout.write(
    `Écrit : ${path.relative(path.join(__dirname, '..'), outPath)} (${BATIMENTS.length} bâtiments)\n`,
  );
}
