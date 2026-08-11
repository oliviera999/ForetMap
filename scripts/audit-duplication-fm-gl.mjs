#!/usr/bin/env node
// Audit de duplication ForetMap <-> Gnomes & Licornes.
//
// Compare chaque fichier ForetMap à chaque fichier GL et signale les paires dont
// les lignes « substantielles » se recouvrent. Sert à instruire les décisions de
// mutualisation sur des mesures plutôt que sur une impression — voir
// `docs/PARTAGE_FM_GL.md`.
//
// Usage :
//   node scripts/audit-duplication-fm-gl.mjs            # front (src/) et back (routes/)
//   node scripts/audit-duplication-fm-gl.mjs --top 40
//
// ⚠️ Un ratio élevé n'est PAS une conclusion. Les listes de champs, les schémas
// et les libellés se ressemblent sans être factorisables : ce script ouvre
// l'enquête, il ne la referme pas (cf. la section « faux positifs » du document).

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const EXTS = new Set(['.js', '.jsx']);

/** Lignes retenues pour la comparaison : ni triviales, ni commentaires. */
const MIN_LINE_LENGTH = 14;
/** En deçà, un fichier est trop court pour qu'un recouvrement soit significatif. */
const MIN_FILE_LINES = 25;
/** En deçà, le recouvrement relève du vocabulaire commun (imports React, etc.). */
const MIN_COMMON_LINES = 15;

const SCOPES = [
  { label: 'Frontend', fm: 'src', gl: 'src/gl', exclude: ['src/gl/', 'src/shared/'] },
  { label: 'Backend', fm: 'routes', gl: 'routes/gl', exclude: ['routes/gl/'] },
];

function normalizedLines(absPath) {
  let raw;
  try {
    raw = fs.readFileSync(absPath, 'utf8');
  } catch {
    return [];
  }
  const lines = [];
  for (const line of raw.split('\n')) {
    const compact = line.replace(/\s+/g, '');
    if (compact.length < MIN_LINE_LENGTH) continue;
    if (compact.startsWith('//') || compact.startsWith('*') || compact.startsWith('/*')) continue;
    lines.push(compact);
  }
  return lines;
}

function walk(absDir) {
  const out = [];
  const stack = [absDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        stack.push(full);
      } else if (EXTS.has(path.extname(entry.name))) {
        out.push(full);
      }
    }
  }
  return out;
}

function collect(relDir, excludes = []) {
  const abs = path.join(ROOT, relDir);
  return walk(abs).filter((p) => {
    const rel = path.relative(ROOT, p).split(path.sep).join('/');
    return !excludes.some((ex) => rel.startsWith(ex));
  });
}

function auditScope({ label, fm, gl, exclude }) {
  const toSets = (files) => {
    const map = new Map();
    for (const file of files) {
      const lines = normalizedLines(file);
      if (lines.length < MIN_FILE_LINES) continue;
      map.set(file, new Set(lines));
    }
    return map;
  };

  const fmFiles = toSets(collect(fm, exclude));
  const glFiles = toSets(collect(gl));

  const pairs = [];
  for (const [fmPath, fmSet] of fmFiles) {
    for (const [glPath, glSet] of glFiles) {
      let common = 0;
      for (const line of fmSet) if (glSet.has(line)) common += 1;
      if (common < MIN_COMMON_LINES) continue;
      pairs.push({
        ratio: common / Math.min(fmSet.size, glSet.size),
        common,
        fmSize: fmSet.size,
        glSize: glSet.size,
        fmPath: path.relative(ROOT, fmPath),
        glPath: path.relative(ROOT, glPath),
      });
    }
  }
  pairs.sort((a, b) => b.ratio - a.ratio || b.common - a.common);
  return { label, pairs };
}

const topArgIndex = process.argv.indexOf('--top');
const top = topArgIndex > -1 ? Number(process.argv[topArgIndex + 1]) || 20 : 20;

for (const scope of SCOPES) {
  const { label, pairs } = auditScope(scope);
  console.log(`\n=== ${label} — ${pairs.length} paire(s) au-dessus du seuil ===`);
  console.log('ratio  comm    FM    GL  fichiers');
  for (const p of pairs.slice(0, top)) {
    const ratio = p.ratio.toFixed(2).padStart(5);
    const common = String(p.common).padStart(5);
    const fmSize = String(p.fmSize).padStart(5);
    const glSize = String(p.glSize).padStart(5);
    console.log(`${ratio} ${common} ${fmSize} ${glSize}  ${p.fmPath}  <->  ${p.glPath}`);
  }
}

console.log(
  '\nRappel : un ratio élevé signale une piste, pas une dette. Vérifier si un noyau\n' +
    'partagé existe déjà (lib/shared, src/shared) avant de conclure à une duplication.',
);
