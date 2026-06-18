#!/usr/bin/env node
/**
 * Aligne les URLs média legacy GL en base (gl_chapters, gl_lore_feuillets).
 * Usage: node scripts/migrate-gl-chapter-media-urls.js [--dry-run] [--apply]
 */
'use strict';

require('dotenv').config();

const { initSchema, queryAll, execute } = require('../database');
const { loadMediaKeyIndex } = require('../lib/glAssetManifest');
const { resolveMediaByStableKey } = require('../lib/mediaLibrary');
const {
  isLegacyGlMediaUrl,
  resolveLegacyGlStableKey,
  applyGlLegacyMediaRefs,
  migrateStoryHeroToSceneRef,
} = require('../lib/glLegacyMediaUrl');

const SELENE_SLUGS = [
  'tropiques-africains',
  'aride-chaud',
  'tempere-atlantique',
  'eurasie-continentale',
  'toundra-arctique',
];

function parseArgs(argv) {
  const apply = argv.includes('--apply');
  return { dryRun: !apply, apply };
}

function resolveUrlFromKey(stableKey) {
  const resolved = resolveMediaByStableKey(stableKey);
  return resolved?.url || null;
}

function migrateMarkdownField(markdown) {
  let next = migrateStoryHeroToSceneRef(markdown);
  next = applyGlLegacyMediaRefs(next, (stableKey) => resolveUrlFromKey(stableKey));
  return next;
}

function migrateMapImageUrl(mapImageUrl, knownKeys) {
  const raw = String(mapImageUrl || '').trim();
  if (!raw) return raw;
  if (!isLegacyGlMediaUrl(raw)) return raw;
  const stableKey = resolveLegacyGlStableKey(raw, knownKeys);
  if (!stableKey) return null;
  return resolveUrlFromKey(stableKey);
}

function migrateFeuilletImageUrl(imageUrl, knownKeys) {
  const raw = String(imageUrl || '').trim();
  if (!raw) return raw;
  if (!isLegacyGlMediaUrl(raw)) return raw;
  const stableKey = resolveLegacyGlStableKey(raw, knownKeys);
  if (!stableKey) return null;
  return resolveUrlFromKey(stableKey);
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));
  await initSchema();

  const keyIndex = loadMediaKeyIndex();
  const knownKeys = Object.keys(keyIndex);
  const chapters = await queryAll(
    `SELECT id, slug, map_image_url, story_markdown, biotope_markdown, biocenose_markdown
       FROM gl_chapters
      WHERE slug IN (${SELENE_SLUGS.map(() => '?').join(', ')})
      ORDER BY id ASC`,
    SELENE_SLUGS,
  );

  const chapterChanges = [];
  for (const chapter of chapters) {
    const nextMap = migrateMapImageUrl(chapter.map_image_url, knownKeys);
    const nextStory = migrateMarkdownField(chapter.story_markdown);
    const nextBiotope = migrateMarkdownField(chapter.biotope_markdown);
    const nextBiocenose = migrateMarkdownField(chapter.biocenose_markdown);

    const changed =
      nextMap !== (chapter.map_image_url || null) ||
      nextStory !== (chapter.story_markdown || '') ||
      nextBiotope !== (chapter.biotope_markdown || '') ||
      nextBiocenose !== (chapter.biocenose_markdown || '');

    if (!changed) continue;

    chapterChanges.push({
      id: chapter.id,
      slug: chapter.slug,
      map_image_url: nextMap,
      story_markdown: nextStory,
      biotope_markdown: nextBiotope,
      biocenose_markdown: nextBiocenose,
    });
  }

  const feuillets = await queryAll(
    `SELECT feuillet_code, image_url
       FROM gl_lore_feuillets
      WHERE image_url LIKE '%/uploads/media-library/image/gl-%'`,
  );
  const feuilletChanges = [];
  for (const row of feuillets) {
    const nextUrl = migrateFeuilletImageUrl(row.image_url, knownKeys);
    if (nextUrl === (row.image_url || null)) continue;
    feuilletChanges.push({ code: row.feuillet_code, image_url: nextUrl });
  }

  console.log(`\n=== Migration URLs média GL (${dryRun ? 'dry-run' : 'apply'}) ===\n`);
  console.log(`Chapitres Sélène à mettre à jour : ${chapterChanges.length}`);
  for (const row of chapterChanges) {
    console.log(`  • ${row.slug} (id ${row.id})`);
    const prev = chapters.find((c) => c.id === row.id);
    if (prev && isLegacyGlMediaUrl(prev.map_image_url)) {
      console.log(`    map_image_url → ${row.map_image_url || 'NULL'}`);
    }
  }
  console.log(`Feuillets à mettre à jour : ${feuilletChanges.length}`);
  for (const row of feuilletChanges.slice(0, 8)) {
    console.log(`  • ${row.code} → ${row.image_url || 'NULL'}`);
  }
  if (feuilletChanges.length > 8) {
    console.log(`  … et ${feuilletChanges.length - 8} autre(s)`);
  }

  if (dryRun) {
    console.log('\nRelancer avec --apply pour écrire en base.\n');
    return;
  }

  for (const row of chapterChanges) {
    await execute(
      `UPDATE gl_chapters
          SET map_image_url = ?, story_markdown = ?, biotope_markdown = ?, biocenose_markdown = ?,
              updated_at = NOW()
        WHERE id = ?`,
      [
        row.map_image_url,
        row.story_markdown,
        row.biotope_markdown,
        row.biocenose_markdown,
        row.id,
      ],
    );
  }

  for (const row of feuilletChanges) {
    await execute(
      `UPDATE gl_lore_feuillets SET image_url = ?, updated_at = NOW() WHERE feuillet_code = ?`,
      [row.image_url, row.code],
    );
  }

  console.log('\nMigration terminée.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
