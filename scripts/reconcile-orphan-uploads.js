#!/usr/bin/env node
/**
 * Réconciliation des fichiers orphelins dans uploads/.
 *
 * Par défaut, le script est en dry-run (aucune suppression).
 *
 * Usage:
 *   node scripts/reconcile-orphan-uploads.js
 *   node scripts/reconcile-orphan-uploads.js --apply
 *   node scripts/reconcile-orphan-uploads.js --json
 *   node scripts/reconcile-orphan-uploads.js --apply --scope=all
 *
 * Options:
 *   --apply       Supprime réellement les fichiers orphelins.
 *   --json        Affiche un JSON (utile pour CI/cron).
 *   --scope=...   managed (défaut) | all
 *                 managed => limite aux préfixes gérés par l'app:
 *                   zones/, task-logs/, observations/, students/
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { queryAll } = require('../database');
const { UPLOADS_DIR, deleteFile } = require('../lib/uploads');

const MANAGED_PREFIXES = ['zones/', 'task-logs/', 'observations/', 'students/'];

function parseFlags(argv) {
  const flags = {
    apply: false,
    json: false,
    scope: 'managed',
  };
  for (const raw of argv) {
    const a = String(raw || '').trim();
    if (!a) continue;
    if (a === '--apply') flags.apply = true;
    else if (a === '--json') flags.json = true;
    else if (a.startsWith('--scope=')) {
      const scope = a.slice('--scope='.length).trim();
      if (scope === 'managed' || scope === 'all') flags.scope = scope;
    }
  }
  return flags;
}

function normalizeRelativePath(value) {
  const raw = String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!raw) return '';
  const normalized = path.posix.normalize(raw);
  if (normalized === '.' || normalized.startsWith('../')) return '';
  return normalized;
}

function isManagedPath(relativePath) {
  const rp = normalizeRelativePath(relativePath);
  if (!rp) return false;
  return MANAGED_PREFIXES.some((prefix) => rp.startsWith(prefix));
}

function listUploadFiles(baseDir, scope = 'managed') {
  const out = [];
  if (!fs.existsSync(baseDir)) return out;

  function walk(absDir) {
    const entries = fs.readdirSync(absDir, { withFileTypes: true });
    for (const e of entries) {
      const abs = path.join(absDir, e.name);
      if (e.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!e.isFile()) continue;
      const relative = normalizeRelativePath(path.relative(baseDir, abs));
      if (!relative) continue;
      if (scope === 'managed' && !isManagedPath(relative)) continue;
      out.push(relative);
    }
  }

  walk(baseDir);
  return out;
}

function computeOrphanPaths(diskPaths, referencedPaths) {
  const referenced = new Set(referencedPaths.map(normalizeRelativePath).filter(Boolean));
  return diskPaths
    .map(normalizeRelativePath)
    .filter(Boolean)
    .filter((p) => !referenced.has(p))
    .sort((a, b) => a.localeCompare(b));
}

async function loadReferencedImagePaths(scope = 'managed') {
  const references = [];
  const sources = [
    { name: 'zone_photos', sql: "SELECT image_path AS p FROM zone_photos WHERE image_path IS NOT NULL AND image_path <> ''" },
    { name: 'task_logs', sql: "SELECT image_path AS p FROM task_logs WHERE image_path IS NOT NULL AND image_path <> ''" },
    { name: 'observation_logs', sql: "SELECT image_path AS p FROM observation_logs WHERE image_path IS NOT NULL AND image_path <> ''" },
    { name: 'students', sql: "SELECT avatar_path AS p FROM users WHERE user_type = 'student' AND avatar_path IS NOT NULL AND avatar_path <> ''" },
  ];

  for (const src of sources) {
    const rows = await queryAll(src.sql);
    for (const r of rows) {
      const rp = normalizeRelativePath(r && r.p);
      if (!rp) continue;
      if (scope === 'managed' && !isManagedPath(rp)) continue;
      references.push(rp);
    }
  }

  return references;
}

function printHuman(summary) {
  console.log(`[uploads-reconcile] mode=${summary.apply ? 'APPLY' : 'DRY-RUN'} scope=${summary.scope}`);
  console.log(`[uploads-reconcile] uploads_dir=${summary.uploadsDir}`);
  console.log(`[uploads-reconcile] fichiers_scannes=${summary.diskCount}`);
  console.log(`[uploads-reconcile] references_bdd=${summary.referencedCount}`);
  console.log(`[uploads-reconcile] orphelins=${summary.orphanCount}`);
  if (summary.deletedCount > 0) {
    console.log(`[uploads-reconcile] supprimes=${summary.deletedCount}`);
  }
  if (summary.orphanCount > 0 && !summary.apply) {
    const preview = summary.orphans.slice(0, 25);
    for (const p of preview) console.log(`- ${p}`);
    if (summary.orphanCount > preview.length) {
      console.log(`[uploads-reconcile] ... +${summary.orphanCount - preview.length} autres`);
    }
  }
}

async function run(options) {
  const diskPaths = listUploadFiles(UPLOADS_DIR, options.scope);
  const referencedPaths = await loadReferencedImagePaths(options.scope);
  const orphans = computeOrphanPaths(diskPaths, referencedPaths);

  let deletedCount = 0;
  if (options.apply) {
    for (const rp of orphans) {
      deleteFile(rp);
      deletedCount += 1;
    }
  }

  return {
    uploadsDir: UPLOADS_DIR,
    apply: options.apply,
    scope: options.scope,
    diskCount: diskPaths.length,
    referencedCount: new Set(referencedPaths).size,
    orphanCount: orphans.length,
    deletedCount,
    orphans,
  };
}

async function main() {
  const options = parseFlags(process.argv.slice(2));
  const summary = await run(options);
  if (options.json) {
    console.log(JSON.stringify(summary));
    return;
  }
  printHuman(summary);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[uploads-reconcile] erreur fatale:', err.message || err);
    process.exit(1);
  });
}

module.exports = {
  MANAGED_PREFIXES,
  parseFlags,
  normalizeRelativePath,
  isManagedPath,
  listUploadFiles,
  computeOrphanPaths,
};
