'use strict';

const fs = require('fs');
const path = require('path');
const {
  biomeAssetSlug,
  listCanonicalBiomeSlugs,
} = require('./glBiomesRegistry');

const {
  chapterRecitRefs,
  findSuspectRecitKeys,
} = require('../src/gl/utils/glChapterRecitConvention.js');

const FEUILLET_CODES = [
  'ep-V-03', 'ep-V-07', 'ep-VI-08', 'ep-VII-07', 'ep-VIII-04', 'les-deux-voleurs',
];

/** Scènes de récit par chapitre (pays 1–5) + prologue — convention partagée. */
const CHAPTER_RECIT_REFS = chapterRecitRefs();

const INTRO_IMAGE_KEYS = [
  'intro_01_la-boite', 'intro_02_le-copiste', 'intro_03_le-carnet-de-selene',
  'intro_04_le-miroir-passage', 'intro_05_selene-au-seuil', 'intro_06_le-corbeau-messager',
  'intro_07_salle-de-classe', 'intro_08_le-carnet-dans-la-savane', 'intro_09_la-traversee-des-biomes',
];

const AUDIO_SLOT_DEFS = [
  { slot: 'intro', prefix: 'intro_', kind: 'audio' },
  ...Array.from({ length: 5 }, (_, index) => ({
    slot: `plateau-${index + 1}`,
    prefix: `plateau-${index + 1}_`,
    kind: 'audio',
  })),
];

const PLATEAU_AUDIO_EXPECTED = [
  { ref: 'plateau 1 jungle', slug: 'plateau-1_jungle', required: true },
  { ref: 'plateau 1 desert-chaud', slug: 'plateau-1_desert-chaud', required: true },
  { ref: 'plateau 2 savane', slug: 'plateau-2_savane', required: true },
  { ref: 'plateau 2 mediterranee', slug: 'plateau-2_mediterranee', required: true },
  { ref: 'plateau 3 landes', slug: 'plateau-3_landes', required: true },
  { ref: 'plateau 4 foret-caducifoliee', slug: 'plateau-4_foret-caducifoliee', required: true },
  { ref: 'plateau 4 desert-froid', slug: 'plateau-4_desert-froid', required: true },
  { ref: 'plateau 5 taiga', slug: 'plateau-5_taiga', required: true },
  { ref: 'plateau 5 toundra-jour', slug: 'plateau-5_toundra-jour', required: true },
  { ref: 'plateau 5 toundra-nuit', slug: 'plateau-5_toundra-nuit', required: true },
];

function feuilletPrefix(code) {
  return `recit_feuillet-action_${String(code || '').trim().toLowerCase()}_`;
}

function loadKeysIndexFromFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const jsonStart = raw.indexOf('{');
  const parsed = JSON.parse(jsonStart >= 0 ? raw.slice(jsonStart) : raw);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function isAudioRelativePath(relativePath) {
  return String(relativePath || '').replace(/\\/g, '/').includes('/audio/');
}

function isImageRelativePath(relativePath) {
  const rel = String(relativePath || '').replace(/\\/g, '/');
  return rel.includes('/image/') || rel.includes('/video/');
}

function auditGlMediaKeys(keyIndex, options = {}) {
  const index = keyIndex && typeof keyIndex === 'object' ? keyIndex : {};
  const keys = Object.keys(index);
  const keySet = new Set(keys);
  const resolvePlateauBoardSlug = options.resolvePlateauBoardSlug
    || require('../src/gl/utils/resolvePlateauBoardSlug.js').resolvePlateauBoardSlug;

  const expected = [];

  for (let n = 1; n <= 5; n += 1) {
    const slug = resolvePlateauBoardSlug(n, keys, index);
    expected.push({
      category: 'plateau-board',
      ref: `plateau ${n}`,
      slug: slug || `plateau-${n}_*`,
      required: true,
    });
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
    expected.push({ category: 'feuillet', ref: code, slug: match || `${prefix}*`, required: true });
  }

  // Scènes de récit de chapitre : optionnelles (auditées seulement si présentes).
  const chapterRecitKeys = new Set();
  for (const { ref, prefix } of CHAPTER_RECIT_REFS) {
    const matches = keys.filter((k) => k.startsWith(prefix)).sort();
    for (const k of matches) chapterRecitKeys.add(k);
    if (matches.length) {
      expected.push({ category: 'chapitre-recit', ref, slug: matches[0], required: false });
    }
  }

  for (const introKey of INTRO_IMAGE_KEYS) {
    expected.push({ category: 'intro', ref: introKey, slug: introKey, required: true });
  }

  for (const row of PLATEAU_AUDIO_EXPECTED) {
    expected.push({ category: 'audio-plateau', ...row });
  }

  const wiredSlugs = new Set(expected.filter((e) => e.slug && !e.slug.endsWith('*')).map((e) => e.slug));

  const ok = [];
  const missing = [];
  const optionalMissing = [];

  for (const row of expected) {
    if (!row.slug || row.slug.endsWith('*')) {
      missing.push(row);
      continue;
    }
    const entry = index[row.slug];
    const isAudioRow = row.category.startsWith('audio');
    const pathOk = entry?.relativePath
      && (isAudioRow ? isAudioRelativePath(entry.relativePath) : isImageRelativePath(entry.relativePath));

    if (keySet.has(row.slug) && (!isAudioRow || pathOk)) {
      ok.push(row);
      wiredSlugs.add(row.slug);
    } else if (row.required) {
      missing.push(row);
    } else {
      optionalMissing.push(row);
    }
  }

  const audioSlots = {};
  for (const { slot, prefix } of AUDIO_SLOT_DEFS) {
    const match = keys
      .filter((key) => key.startsWith(prefix) && isAudioRelativePath(index[key]?.relativePath))
      .sort()[0] || null;
    audioSlots[slot] = match;
  }

  // Toutes les scènes d'un chapitre sont considérées branchées (résolues par `chapterIllustrations`).
  for (const k of chapterRecitKeys) wiredSlugs.add(k);

  const unwired = keys.filter((k) => !wiredSlugs.has(k));
  const byPrefix = {};
  for (const k of unwired) {
    const prefix = k.split('_')[0];
    byPrefix[prefix] = (byPrefix[prefix] || 0) + 1;
  }

  // Clés `recit*` qui ne matchent aucun chapitre ni feuillet : très
  // probablement une faute de frappe — l'image est invisible en jeu.
  const suspectRecitKeys = findSuspectRecitKeys(keys);

  return {
    keysPath: options.keysPath || null,
    keyCount: keys.length,
    ok,
    missing,
    optionalMissing,
    unwired,
    byPrefix,
    suspectRecitKeys,
    audioSlots,
  };
}

function formatAuditReport(report) {
  const lines = [];
  lines.push(`\n=== Audit clés média GL (${report.keyCount} fichiers) ===\n`);
  if (report.keysPath) lines.push(`Source: ${report.keysPath}\n`);
  lines.push(`✓ Branchés (${report.ok.length})`);
  for (const row of report.ok) {
    lines.push(`  [${row.category}] ${row.ref} → ${row.slug}`);
  }
  lines.push(`\n✗ Manquants requis (${report.missing.length})`);
  for (const row of report.missing) {
    lines.push(`  [${row.category}] ${row.ref} → ${row.slug}`);
  }
  if (report.optionalMissing.length) {
    lines.push(`\n○ Optionnels absents (${report.optionalMissing.length})`);
    for (const row of report.optionalMissing) {
      lines.push(`  [${row.category}] ${row.ref} → ${row.slug}`);
    }
  }
  if (report.suspectRecitKeys?.length) {
    lines.push(`\n⚠ Clés récit suspectes — typo probable, invisibles en jeu (${report.suspectRecitKeys.length})`);
    for (const key of report.suspectRecitKeys) {
      lines.push(`  ${key}`);
    }
  }
  lines.push(`\n? Présents sans lien code auto (${report.unwired.length}) — par préfixe:`);
  lines.push(`  ${JSON.stringify(report.byPrefix)}`);
  lines.push('\nSlots audio manifeste:');
  for (const [slot, key] of Object.entries(report.audioSlots)) {
    lines.push(`  ${slot}: ${key || '(vide)'}`);
  }
  lines.push('');
  return lines.join('\n');
}

module.exports = {
  FEUILLET_CODES,
  INTRO_IMAGE_KEYS,
  PLATEAU_AUDIO_EXPECTED,
  loadKeysIndexFromFile,
  auditGlMediaKeys,
  formatAuditReport,
  isAudioRelativePath,
  isImageRelativePath,
};
