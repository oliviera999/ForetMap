#!/usr/bin/env node
'use strict';

/**
 * Inventaire des hôtes d'images distantes en base (lot B — lecture seule).
 * Ne parcourt aucune table `gl_*`. Sortie console + CSV dans `tmp/` (non versionné).
 *
 * Usage : node scripts/inventory-remote-media-hosts.js
 */

const fs = require('fs');
const path = require('path');
const { initDatabase, queryAll } = require('../database');

/** Colonnes susceptibles de contenir une URL d'image (hors GL). */
const COLUMNS = Object.freeze([
  { table: 'plants', column: 'photo_url' },
  { table: 'plant_photos', column: 'url' },
  { table: 'map_markers', column: 'photo_url' },
  { table: 'zones', column: 'photo_url' },
  { table: 'maps', column: 'map_image_url' },
  { table: 'visit_media', column: 'url' },
  { table: 'tutorials', column: 'preview_url' },
  { table: 'app_settings', column: 'value_json' },
]);

const HTTPS_RE = /https:\/\/([^/\s"'<>]+)/gi;
const HTTP_RE = /http:\/\/([^/\s"'<>]+)/gi;

function collectHosts(text, into, httpInto) {
  const s = String(text || '');
  let m;
  HTTPS_RE.lastIndex = 0;
  while ((m = HTTPS_RE.exec(s))) {
    const host = m[1].toLowerCase().split(':')[0];
    into.set(host, (into.get(host) || 0) + 1);
  }
  HTTP_RE.lastIndex = 0;
  while ((m = HTTP_RE.exec(s))) {
    httpInto.set(m[0], (httpInto.get(m[0]) || 0) + 1);
  }
}

async function main() {
  await initDatabase();
  const byHost = new Map();
  const httpUrls = new Map();
  const perTable = [];

  for (const { table, column } of COLUMNS) {
    let rows;
    try {
      rows = await queryAll(
        `SELECT \`${column}\` AS v FROM \`${table}\` WHERE \`${column}\` IS NOT NULL AND \`${column}\` != '' LIMIT 5000`,
      );
    } catch (err) {
      perTable.push({ table, column, error: err.message, hosts: 0 });
      continue;
    }
    const before = byHost.size;
    for (const row of rows) {
      const v = row.v;
      if (v && typeof v === 'object') collectHosts(JSON.stringify(v), byHost, httpUrls);
      else collectHosts(v, byHost, httpUrls);
    }
    perTable.push({ table, column, rows: rows.length, hostsDelta: byHost.size - before });
  }

  const sorted = [...byHost.entries()].sort((a, b) => b[1] - a[1]);
  console.log('Hôtes HTTPS (hors gl_*) :');
  for (const [host, n] of sorted) console.log(`  ${n}\t${host}`);
  console.log(`\nURL http: restantes : ${httpUrls.size}`);
  for (const [url, n] of [...httpUrls.entries()].slice(0, 50)) console.log(`  ${n}\t${url}`);

  const tmpDir = path.join(__dirname, '..', 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const csvPath = path.join(tmpDir, `remote-media-hosts-${Date.now()}.csv`);
  const lines = ['host,count', ...sorted.map(([h, n]) => `${JSON.stringify(h)},${n}`)];
  fs.writeFileSync(csvPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(`\nCSV : ${csvPath}`);
  console.log('Par table :', JSON.stringify(perTable, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
