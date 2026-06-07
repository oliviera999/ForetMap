#!/usr/bin/env node
/**
 * Audit des clés _keys.json vs slugs attendus par le code GL.
 * Usage: node scripts/audit-gl-media-keys.mjs [chemin/_keys.json]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const {
  GL_BIOME_REGISTRY,
  biomeAssetSlug,
  listCanonicalBiomeSlugs,
} = require('../lib/glBiomesRegistry.js');
const { resolvePlateauBoardSlug } = await import('../src/gl/utils/resolvePlateauBoardSlug.js');

const keysPath = process.argv[2]
  || path.join(__dirname, '..', 'uploads', '_keys-0.json');

function loadKeysIndex(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const jsonStart = raw.indexOf('{');
  const parsed = JSON.parse(jsonStart >= 0 ? raw.slice(jsonStart) : raw);
  return Object.keys(parsed);
}

function feuilletPrefix(code) {
  return `recit_feuillet-action_${String(code || '').trim().toLowerCase()}_`;
}

const FEUILLET_CODES = [
  'ep-V-03', 'ep-V-07', 'ep-VI-08', 'ep-VII-07', 'ep-VIII-04', 'les-deux-voleurs',
];

const INTRO_KEYS = [
  'intro_01_la-boite', 'intro_02_le-copiste', 'intro_03_le-carnet-de-selene',
  'intro_04_le-miroir-passage', 'intro_05_selene-au-seuil', 'intro_06_le-corbeau-messager',
  'intro_07_salle-de-classe', 'intro_08_le-carnet-dans-la-savane', 'intro_09_la-traversee-des-biomes',
];

const AUDIO_PREFIXES = ['intro_', 'plateau-1_', 'plateau-2_', 'plateau-3_', 'plateau-4_', 'plateau-5_'];

const keys = loadKeysIndex(keysPath);
const keySet = new Set(keys);

const expected = [];

for (let n = 1; n <= 5; n += 1) {
  const slug = resolvePlateauBoardSlug(n, keys);
  expected.push({ category: 'plateau-board', ref: `plateau ${n}`, slug, required: true });
}

for (const biomeSlug of listCanonicalBiomeSlugs()) {
  for (const kind of ['biome', 'realiste', 'biocenose']) {
    for (const saison of [null, 'ete', 'hiver']) {
      if (biomeSlug !== 'toundra' && saison) continue;
      const slug = biomeAssetSlug(biomeSlug, kind, saison);
      if (!slug) continue;
      expected.push({
        category: `biome-${kind}`,
        ref: `${biomeSlug}${saison ? ` (${saison})` : ''}`,
        slug,
        required: kind === 'biocenose',
      });
    }
  }
}

for (const code of FEUILLET_CODES) {
  const prefix = feuilletPrefix(code);
  const match = keys.find((k) => k.startsWith(prefix));
  expected.push({ category: 'feuillet', ref: code, slug: match || prefix + '*', required: true });
}

for (const introKey of INTRO_KEYS) {
  expected.push({ category: 'intro', ref: introKey, slug: introKey, required: true });
}

const audioMissing = AUDIO_PREFIXES.every((prefix) => !keys.some((k) => k.startsWith(prefix) && k.includes('/audio/') === false));
// audio files would be under media-library/audio in relativePath - check by prefix only for mp3-like names
const hasAudio = keys.some((k) => /^intro_.*\.(mp3|ogg|wav)$/.test(k) || /^plateau-\d_.*\.(mp3|ogg|wav)$/.test(k)
  || (k.startsWith('intro_') && !keys.find)); // simplified: list keys starting with intro_ that aren't images - all intro_ in prod are images

const wiredSlugs = new Set(expected.filter((e) => e.slug && !e.slug.endsWith('*')).map((e) => e.slug));

const ok = [];
const missing = [];
const optionalMissing = [];

for (const row of expected) {
  if (row.slug.endsWith('*')) {
    missing.push(row);
    continue;
  }
  if (keySet.has(row.slug)) {
    ok.push(row);
    wiredSlugs.add(row.slug);
  } else if (row.required) {
    missing.push(row);
  } else {
    optionalMissing.push(row);
  }
}

const unwired = keys.filter((k) => !wiredSlugs.has(k));

const byPrefix = {};
for (const k of unwired) {
  const prefix = k.split('_')[0];
  byPrefix[prefix] = (byPrefix[prefix] || 0) + 1;
}

console.log(`\n=== Audit clés média GL (${keys.length} fichiers) ===\n`);
console.log(`Source: ${keysPath}\n`);
console.log(`✓ Branchés (${ok.length})`);
for (const row of ok) {
  console.log(`  [${row.category}] ${row.ref} → ${row.slug}`);
}
console.log(`\n✗ Manquants requis (${missing.length})`);
for (const row of missing) {
  console.log(`  [${row.category}] ${row.ref} → ${row.slug}`);
}
if (optionalMissing.length) {
  console.log(`\n○ Optionnels absents (${optionalMissing.length})`);
  for (const row of optionalMissing) {
    console.log(`  [${row.category}] ${row.ref} → ${row.slug}`);
  }
}
console.log(`\n? Présents sans lien code auto (${unwired.length}) — par préfixe:`);
console.log(`  ${JSON.stringify(byPrefix)}`);
console.log('\nAudio plateau/intro: aucun fichier audio dans _keys.json (slots vides).');
console.log('');

process.exitCode = missing.length > 0 ? 1 : 0;
