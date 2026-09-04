#!/usr/bin/env node
/**
 * Rapport de densité des lieux d'une carte — **lecture seule** (lot 5 du plan de convergence,
 * `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8.3, point 6).
 *
 * À quoi ça sert : régler les seuils de désencombrement sur les données réelles au lieu de
 * deviner, et repérer l'empilement de repères qui rend une carte illisible (ou les doublons
 * d'inventaire). Le script n'écrit **rien** : aucune requête d'écriture, aucun fichier.
 *
 * Usage :
 *   node scripts/report-marker-density.js                # carte par défaut des profs
 *   node scripts/report-marker-density.js --map=lyautey
 *   node scripts/report-marker-density.js --map=lyautey --cell=2 --near=1 --json
 *
 * Options :
 *   --map=<id>    carte à analyser (défaut : `ui.map.default_map_teacher`)
 *   --cell=<pct>  côté d'une cellule d'analyse, en % de l'image (défaut : 2)
 *   --near=<pct>  distance en dessous de laquelle deux repères sont « superposés » (défaut : 1)
 *   --json        sortie JSON brute plutôt que le tableau lisible
 */

'use strict';

require('dotenv').config();

const { queryAll, queryOne, pool } = require('../database');
const { resolveDefaultMapId } = require('../lib/settings');

function readOption(name, fallback) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function readNumberOption(name, fallback) {
  const raw = readOption(name, null);
  const n = Number(raw);
  return raw != null && Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Comptage par catégorie (les lieux sans catégorie sont comptés ensemble). */
function countByCategory(rows) {
  const counts = new Map();
  for (const row of rows) {
    const labels = row.category_labels || [];
    if (labels.length === 0) {
      counts.set('(sans catégorie)', (counts.get('(sans catégorie)') || 0) + 1);
      continue;
    }
    for (const label of labels) counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));
}

/** Cellules de `cellPct` % de l'image, triées par nombre de repères décroissant. */
function countByCell(rows, cellPct) {
  const cells = new Map();
  for (const row of rows) {
    const cx = Math.floor(Number(row.x_pct) / cellPct);
    const cy = Math.floor(Number(row.y_pct) / cellPct);
    const key = `${cx}:${cy}`;
    const cell = cells.get(key) || { cx, cy, labels: [] };
    cell.labels.push(row.label);
    cells.set(key, cell);
  }
  return [...cells.values()]
    .map((cell) => ({
      x_pct: cell.cx * cellPct,
      y_pct: cell.cy * cellPct,
      count: cell.labels.length,
      labels: cell.labels,
    }))
    .sort((a, b) => b.count - a.count);
}

/** Paires de repères distantes de moins de `nearPct` % (superpositions à l'œil). */
function findNearPairs(rows, nearPct) {
  const pairs = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const dx = Number(rows[i].x_pct) - Number(rows[j].x_pct);
      const dy = Number(rows[i].y_pct) - Number(rows[j].y_pct);
      const distance = Math.hypot(dx, dy);
      if (distance <= nearPct) {
        pairs.push({ a: rows[i].label, b: rows[j].label, distance: Number(distance.toFixed(3)) });
      }
    }
  }
  return pairs.sort((a, b) => a.distance - b.distance);
}

async function main() {
  const cellPct = readNumberOption('cell', 2);
  const nearPct = readNumberOption('near', 1);
  const asJson = process.argv.includes('--json');
  const mapId = readOption('map', null) || (await resolveDefaultMapId('teacher'));

  const map = await queryOne('SELECT id, label FROM maps WHERE id = ? LIMIT 1', [mapId]);
  if (!map) {
    process.stderr.write(`Carte introuvable : ${mapId}\n`);
    process.exitCode = 1;
    return;
  }

  const rows = await queryAll(
    `SELECT id, label, x_pct, y_pct
       FROM map_markers
      WHERE map_id = ?
      ORDER BY label`,
    [mapId],
  );
  // Catégories en requête séparée puis jointure en mémoire : un `GROUP_CONCAT` demanderait un
  // séparateur littéral dans le SQL, donc un libellé qui le contient fausserait le comptage.
  const categoryRows = await queryAll(
    `SELECT mc.marker_id, c.label
       FROM marker_categories mc
       JOIN location_categories c ON c.id = mc.category_id
       JOIN map_markers m ON m.id = mc.marker_id
      WHERE m.map_id = ?
      ORDER BY c.sort_order, c.label`,
    [mapId],
  );
  const categoriesByMarker = new Map();
  for (const row of categoryRows) {
    const key = String(row.marker_id);
    if (!categoriesByMarker.has(key)) categoriesByMarker.set(key, []);
    categoriesByMarker.get(key).push(String(row.label));
  }
  const markers = rows.map((row) => ({
    ...row,
    category_labels: categoriesByMarker.get(String(row.id)) || [],
  }));
  const zoneCount = await queryOne('SELECT COUNT(*) AS n FROM zones WHERE map_id = ?', [mapId]);

  const byCategory = countByCategory(markers);
  const byCell = countByCell(markers, cellPct);
  const nearPairs = findNearPairs(markers, nearPct);
  const crowded = byCell.filter((cell) => cell.count > 1);

  if (asJson) {
    process.stdout.write(
      `${JSON.stringify(
        {
          map: { id: map.id, label: map.label },
          cell_pct: cellPct,
          near_pct: nearPct,
          markers: markers.length,
          zones: Number(zoneCount?.n) || 0,
          by_category: byCategory.map(([label, count]) => ({ label, count })),
          crowded_cells: crowded,
          near_pairs: nearPairs,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const lines = [];
  lines.push(`Carte « ${map.label} » (${map.id})`);
  lines.push(`  repères : ${markers.length}   zones : ${Number(zoneCount?.n) || 0}`);
  lines.push('');
  lines.push('Repères par catégorie');
  for (const [label, count] of byCategory) lines.push(`  ${String(count).padStart(4)}  ${label}`);
  lines.push('');
  lines.push(`Cellules de ${cellPct} % contenant plus d'un repère : ${crowded.length}`);
  for (const cell of crowded.slice(0, 20)) {
    const shown = cell.labels.slice(0, 6).join(', ');
    const more = cell.labels.length > 6 ? '…' : '';
    lines.push(
      `  ${String(cell.count).padStart(4)}  à ${cell.x_pct.toFixed(1)} % / ${cell.y_pct.toFixed(1)} %  ${shown}${more}`,
    );
  }
  if (crowded.length > 20) lines.push(`  … ${crowded.length - 20} autres cellules`);
  lines.push('');
  lines.push(`Paires de repères à moins de ${nearPct} % : ${nearPairs.length}`);
  for (const pair of nearPairs.slice(0, 20)) {
    lines.push(`  ${pair.distance.toFixed(2)} %  ${pair.a}  ↔  ${pair.b}`);
  }
  if (nearPairs.length > 20) lines.push(`  … ${nearPairs.length - 20} autres paires`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

main()
  .catch((err) => {
    process.stderr.write(`${err?.stack || err}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
