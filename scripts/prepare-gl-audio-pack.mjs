#!/usr/bin/env node
/**
 * Prépare le ZIP audio GL : renomme les MP3 sources en GL_plateau-*.
 * Usage: node scripts/prepare-gl-audio-pack.mjs [dossier_sources]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = process.argv[2] || path.join(process.env.USERPROFILE || '', 'Downloads');
const outDir = path.join(__dirname, '..', 'data', 'gl', 'audio-pack');

/** @type {{ match: RegExp, dest: string, note?: string }[]} */
const RULES = [
  { match: /^jungle(?!\s*\()/i, dest: 'GL_plateau-1_jungle.mp3', note: 'Plateau 1 — jungle / mangrove' },
  { match: /^d[ée]sert(?!\s*froid)(?!\s*\()/i, dest: 'GL_plateau-1_desert-chaud.mp3', note: 'Plateau 1 — sahara' },
  { match: /^savane(?!\s*\()/i, dest: 'GL_plateau-2_savane.mp3', note: 'Plateau 2 — savane' },
  { match: /mediterran/i, dest: 'GL_plateau-2_mediterranee.mp3', note: 'Plateau 2 — forêt méditerranéenne' },
  { match: /^landes(?!\s*\()/i, dest: 'GL_plateau-3_landes.mp3', note: 'Plateau 3 — landes' },
  { match: /^for[êe]t\s+caducif/i, dest: 'GL_plateau-4_foret-caducifoliee.mp3', note: 'Plateau 4 — forêt caducifoliée' },
  { match: /^d[ée]sert\s+froid(?!\s*\()/i, dest: 'GL_plateau-4_desert-froid.mp3', note: 'Plateau 4 — désert froid' },
  { match: /^taiga(?!\s*\()/i, dest: 'GL_plateau-5_taiga.mp3', note: 'Plateau 5 — taïga' },
  { match: /^toundra\s+jour(?!\s*\()/i, dest: 'GL_plateau-5_toundra-jour.mp3', note: 'Plateau 5 — toundra été' },
  { match: /^toundra\s+nuit(?!\s*\()/i, dest: 'GL_plateau-5_toundra-nuit.mp3', note: 'Plateau 5 — toundra hiver' },
];

function normalizeName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\.mp3$/i, '')
    .trim();
}

function isDuplicateVariant(name) {
  return /\(\s*\d+\s*\)\s*$/i.test(String(name || '').replace(/\.mp3$/i, '').trim());
}

function main() {
  if (!fs.existsSync(sourceDir)) {
    console.error(`Dossier introuvable: ${sourceDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(sourceDir)
    .filter((f) => /\.mp3$/i.test(f))
    .map((f) => ({ name: f, full: path.join(sourceDir, f), size: fs.statSync(path.join(sourceDir, f)).size }));

  fs.mkdirSync(outDir, { recursive: true });

  const copied = [];
  const skipped = [];

  for (const rule of RULES) {
    const candidates = files
      .filter((f) => rule.match.test(normalizeName(f.name)))
      .sort((a, b) => {
        const aVar = isDuplicateVariant(a.name) ? 1 : 0;
        const bVar = isDuplicateVariant(b.name) ? 1 : 0;
        if (aVar !== bVar) return aVar - bVar;
        return b.size - a.size;
      });

    if (candidates.length === 0) {
      skipped.push({ dest: rule.dest, reason: 'fichier source absent' });
      continue;
    }

    const src = candidates[0];
    const destPath = path.join(outDir, rule.dest);
    fs.copyFileSync(src.full, destPath);
    copied.push({
      dest: rule.dest,
      from: src.name,
      sizeMb: (src.size / (1024 * 1024)).toFixed(1),
      note: rule.note,
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceDir,
    files: copied,
    skipped,
    uploadHint: 'Contenus → Bibliothèque GL : importer les GL_plateau-*.mp3 (ZIP ou fichiers).',
  };
  fs.writeFileSync(path.join(outDir, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`\nPack audio GL → ${outDir}\n`);
  for (const row of copied) {
    console.log(`✓ ${row.dest} ← ${row.from} (${row.sizeMb} Mo) — ${row.note}`);
  }
  if (skipped.length) {
    console.log('\n○ Non copiés :');
    for (const row of skipped) console.log(`  ${row.dest} : ${row.reason}`);
  }
  console.log(`\n${copied.length} fichier(s) prêt(s) pour upload.\n`);
}

main();
