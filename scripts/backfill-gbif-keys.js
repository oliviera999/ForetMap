#!/usr/bin/env node
'use strict';

/**
 * Remplit gbif_key manquants via recherche GBIF sur le nom scientifique.
 * Usage : node scripts/backfill-gbif-keys.js [--dry-run] [--limit=50]
 */

require('dotenv').config({ quiet: true });
const { initDatabase, queryAll, execute, pool } = require('../database');

async function fetchGbifKey(scientificName) {
  const q = encodeURIComponent(String(scientificName || '').trim());
  if (!q) return null;
  const url = `https://api.gbif.org/v1/species/match?scientificName=${q}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const data = await res.json();
  const key = Number(data?.usageKey || data?.speciesKey || 0);
  return Number.isFinite(key) && key > 0 ? key : null;
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 50;

  await initDatabase();
  const rows = await queryAll(
    `SELECT id, name, scientific_name, gbif_key
       FROM plants
      WHERE (gbif_key IS NULL OR gbif_key = 0)
        AND scientific_name IS NOT NULL
        AND TRIM(scientific_name) <> ''
      ORDER BY id ASC
      LIMIT ?`,
    [Math.max(1, Math.min(limit, 500))],
  );

  let updated = 0;
  for (const row of rows) {
    const key = await fetchGbifKey(row.scientific_name);
    if (!key) {
      console.log(`skip ${row.id} ${row.scientific_name}`);
      continue;
    }
    console.log(`${dryRun ? '[dry]' : 'update'} plant ${row.id} → gbif_key ${key}`);
    if (!dryRun) {
      await execute('UPDATE plants SET gbif_key = ? WHERE id = ?', [key, row.id]);
    }
    updated += 1;
  }
  console.log(`Terminé : ${updated}/${rows.length} fiches traitées.`);
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
