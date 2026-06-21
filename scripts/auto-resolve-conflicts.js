'use strict';

/**
 * auto-resolve-conflicts.js — vérifie et corrige automatiquement les conflits de
 * merge des Pull Requests « en attente de merge » sur la base (`main`).
 *
 * Pourquoi : sur ForetMap, les PR ouvertes en parallèle se télescopent presque
 * toujours sur les MÊMES fichiers cumulatifs — `CHANGELOG.md` (section
 * [Non publié]) et le bump de version dans `package.json` / `package-lock.json`.
 * Ces conflits sont mécaniques et sûrs à résoudre automatiquement (cf. PR #177
 * qui les avait résolus à la main). Tout autre conflit (code métier) reste
 * volontairement NON résolu : la PR est alors étiquetée `merge-conflict` et un
 * commentaire liste les fichiers à traiter manuellement.
 *
 * Stratégie de résolution automatique :
 *   - CHANGELOG.md          → union (on conserve les entrées des DEUX côtés).
 *   - package.json          → on garde la version la PLUS HAUTE (semver max).
 *   - package-lock.json     → idem (champs `version` uniquement).
 *   - tout autre fichier    → non résolu → la PR est signalée.
 *
 * Un fichier n'est auto-résolu QUE si ses seuls conflits relèvent de ces cas
 * (pour package.json/lock : différences limitées à une ligne `"version"`).
 *
 * Utilisé par .github/workflows/auto-resolve-conflicts.yml (push sur main + cron
 * + déclenchement manuel). Les fonctions pures sont exportées et testées dans
 * tests/auto-resolve-conflicts.test.js.
 *
 * Variables d'environnement :
 *   - GH_TOKEN / GITHUB_TOKEN : requis pour `gh` et le push (fourni par la CI).
 *   - GITHUB_REPOSITORY        : "owner/repo" (fourni par la CI).
 *   - AUTO_RESOLVE_BASE        : branche de base (défaut "main").
 *   - AUTO_RESOLVE_DRY_RUN=1   : n'écrit/ne pousse rien, journalise seulement.
 *   - AUTO_RESOLVE_INCLUDE_DRAFTS=1 : traite aussi les PR en brouillon.
 */

const { execFileSync } = require('node:child_process');
const { readFileSync, writeFileSync } = require('node:fs');

const LABEL = 'merge-conflict';
const COMMENT_MARKER = '<!-- auto-resolve-conflicts -->';

// Fichiers auto-résolus et leur stratégie.
const RESOLVERS = {
  'CHANGELOG.md': resolveChangelogConflicts,
  'package.json': resolveVersionOnlyConflicts,
  'package-lock.json': resolveVersionOnlyConflicts,
};

// Capture une ligne JSON `"version": "1.2.3"` (avec suffixe pré-release/build éventuel).
const VERSION_LINE = /^(\s*"version":\s*")(\d+\.\d+\.\d+[^"]*)(",?\s*)$/;

// ───────────────────────────── Fonctions pures ─────────────────────────────

/** Vrai si le texte contient encore des marqueurs de conflit Git. */
function hasConflictMarkers(text) {
  return /^<{7}( |$)/m.test(text) || /^={7}$/m.test(text) || /^>{7}( |$)/m.test(text);
}

/**
 * Compare deux versions semver (MAJEUR.MINEUR.CORRECTIF). Le suffixe
 * pré-release/build éventuel est ignoré (suffisant pour des bumps internes).
 * @returns {number} -1 si a<b, 0 si égal, 1 si a>b.
 */
function compareSemver(a, b) {
  const norm = (v) =>
    String(v)
      .split(/[-+]/)[0]
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);
  const pa = norm(a);
  const pb = norm(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da > db ? 1 : -1;
  }
  return 0;
}

/** Retourne la plus haute des deux versions (a en cas d'égalité). */
function maxVersion(a, b) {
  return compareSemver(a, b) >= 0 ? a : b;
}

/**
 * Découpe un texte en segments : portions sans conflit et blocs de conflit
 * `<<<<<<< / ======= / >>>>>>>` (la section base `|||||||` de diff3 est ignorée).
 * @returns {Array<{type:'text',lines:string[]}|{type:'conflict',ours:string[],theirs:string[]}>}
 */
function parseConflicts(text) {
  const lines = text.split('\n');
  const segments = [];
  let buffer = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('<<<<<<<')) {
      if (buffer.length) {
        segments.push({ type: 'text', lines: buffer });
        buffer = [];
      }
      const ours = [];
      const theirs = [];
      i++;
      while (
        i < lines.length &&
        !lines[i].startsWith('|||||||') &&
        !lines[i].startsWith('=======')
      ) {
        ours.push(lines[i]);
        i++;
      }
      // Section base (diff3) éventuelle : on la saute.
      if (i < lines.length && lines[i].startsWith('|||||||')) {
        i++;
        while (i < lines.length && !lines[i].startsWith('=======')) i++;
      }
      i++; // saute "======="
      while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
        theirs.push(lines[i]);
        i++;
      }
      i++; // saute ">>>>>>>"
      segments.push({ type: 'conflict', ours, theirs });
    } else {
      buffer.push(line);
      i++;
    }
  }
  if (buffer.length) segments.push({ type: 'text', lines: buffer });
  return segments;
}

const sameLines = (a, b) => a.length === b.length && a.every((l, k) => l === b[k]);

/**
 * Résout les conflits d'un CHANGELOG par UNION : on conserve les lignes des deux
 * côtés (ours puis theirs). Si les deux côtés sont identiques, on n'en garde
 * qu'un exemplaire pour éviter les doublons.
 * @returns {{resolved:boolean,text:string}}
 */
function resolveChangelogConflicts(text) {
  if (!hasConflictMarkers(text)) return { resolved: true, text };
  const out = [];
  for (const seg of parseConflicts(text)) {
    if (seg.type === 'text') {
      out.push(...seg.lines);
    } else if (sameLines(seg.ours, seg.theirs)) {
      out.push(...seg.ours);
    } else {
      out.push(...seg.ours, ...seg.theirs);
    }
  }
  const result = out.join('\n');
  return { resolved: !hasConflictMarkers(result), text: result };
}

/**
 * Résout les conflits dont la SEULE différence est une ligne `"version"` (cas
 * des bumps package.json / package-lock.json) en gardant la version la plus
 * haute. Si un bloc diffère ailleurs que sur une ligne de version, on renonce
 * (resolved:false) pour ne rien casser.
 * @returns {{resolved:boolean,text?:string}}
 */
function resolveVersionOnlyConflicts(text) {
  if (!hasConflictMarkers(text)) return { resolved: true, text };
  const out = [];
  for (const seg of parseConflicts(text)) {
    if (seg.type === 'text') {
      out.push(...seg.lines);
      continue;
    }
    const { ours, theirs } = seg;
    if (ours.length !== theirs.length) return { resolved: false };
    const merged = [];
    for (let k = 0; k < ours.length; k++) {
      if (ours[k] === theirs[k]) {
        merged.push(ours[k]);
        continue;
      }
      const mo = ours[k].match(VERSION_LINE);
      const mt = theirs[k].match(VERSION_LINE);
      if (!mo || !mt) return { resolved: false };
      const hi = maxVersion(mo[2], mt[2]);
      const keep = hi === mo[2] ? mo : mt;
      merged.push(`${keep[1]}${hi}${keep[3]}`);
    }
    out.push(...merged);
  }
  const result = out.join('\n');
  return { resolved: !hasConflictMarkers(result), text: result };
}

// ──────────────────────────── Orchestration CLI ────────────────────────────

function git(args, opts = {}) {
  return execFileSync('git', args, { encoding: 'utf8', ...opts }).trim();
}

function gitTry(args) {
  try {
    return { ok: true, out: git(args) };
  } catch (err) {
    return { ok: false, out: `${err.stdout || ''}${err.stderr || ''}` };
  }
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8' }).trim();
}

function ghTry(args) {
  try {
    return { ok: true, out: gh(args) };
  } catch (err) {
    return { ok: false, out: `${err.stdout || ''}${err.stderr || ''}` };
  }
}

function log(...parts) {
  console.log('[auto-resolve]', ...parts);
}

function ensureLabel() {
  ghTry([
    'label',
    'create',
    LABEL,
    '--color',
    'B60205',
    '--description',
    'PR en conflit avec la base — résolution manuelle requise',
  ]);
}

function hasLabel(pr) {
  return Array.isArray(pr.labels) && pr.labels.some((l) => l.name === LABEL);
}

function flagConflict(pr, files) {
  log(`PR #${pr.number} : conflits NON auto-résolubles →`, files.join(', '));
  ghTry(['pr', 'edit', String(pr.number), '--add-label', LABEL]);
  if (!hasLabel(pr)) {
    const body = [
      COMMENT_MARKER,
      '⚠️ **Conflit de merge détecté** avec la base — résolution automatique impossible.',
      '',
      'Fichiers en conflit à traiter manuellement :',
      ...files.map((f) => `- \`${f}\``),
      '',
      '> Les conflits sur `CHANGELOG.md` et les bumps de version sont normalement résolus',
      '> automatiquement. Ceux-ci concernent du code et nécessitent une revue humaine.',
    ].join('\n');
    ghTry(['pr', 'comment', String(pr.number), '--body', body]);
  }
}

function clearConflictFlag(pr, { comment } = {}) {
  if (hasLabel(pr)) {
    ghTry(['pr', 'edit', String(pr.number), '--remove-label', LABEL]);
  }
  if (comment) {
    ghTry(['pr', 'comment', String(pr.number), '--body', `${COMMENT_MARKER}\n${comment}`]);
  }
}

function processPr(pr, { base, dryRun }) {
  const branch = pr.headRefName;
  log(`PR #${pr.number} « ${pr.title} » (${branch})`);

  gitTry(['merge', '--abort']);
  const fetched = gitTry(['fetch', 'origin', branch]);
  if (!fetched.ok) {
    log(`PR #${pr.number} : impossible de récupérer ${branch}, ignorée.`);
    return;
  }
  git(['checkout', '-f', '-B', branch, `origin/${branch}`]);

  const merge = gitTry(['merge', '--no-edit', `origin/${base}`]);
  if (merge.ok) {
    // Pas de conflit : la PR est déjà fusionnable, on ne pousse aucun merge gratuit.
    git(['reset', '--hard', `origin/${branch}`]);
    clearConflictFlag(pr);
    log(`PR #${pr.number} : déjà fusionnable, rien à faire.`);
    return;
  }

  const conflicted = git(['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean);

  const unresolved = [];
  const fixed = [];
  for (const file of conflicted) {
    const resolver = RESOLVERS[file];
    if (!resolver) {
      unresolved.push(file);
      continue;
    }
    const result = resolver(readFileSync(file, 'utf8'));
    if (result.resolved) {
      writeFileSync(file, result.text);
      git(['add', '--', file]);
      fixed.push(file);
    } else {
      unresolved.push(file);
    }
  }

  if (unresolved.length) {
    gitTry(['merge', '--abort']);
    flagConflict(pr, unresolved);
    return;
  }

  if (dryRun) {
    gitTry(['merge', '--abort']);
    log(`PR #${pr.number} : [dry-run] résoudrait`, fixed.join(', '));
    return;
  }

  git(['commit', '--no-edit']);
  const pushed = gitTry(['push', 'origin', `HEAD:refs/heads/${branch}`]);
  if (!pushed.ok) {
    log(`PR #${pr.number} : échec du push →`, pushed.out);
    gitTry(['merge', '--abort']);
    return;
  }
  clearConflictFlag(pr, {
    comment: `✅ Conflits de merge résolus automatiquement (${fixed
      .map((f) => `\`${f}\``)
      .join(', ')}) en intégrant \`${base}\`.`,
  });
  log(`PR #${pr.number} : conflits résolus et poussés (${fixed.join(', ')}).`);
}

function main() {
  const base = process.env.AUTO_RESOLVE_BASE || 'main';
  const dryRun = process.env.AUTO_RESOLVE_DRY_RUN === '1';
  const includeDrafts = process.env.AUTO_RESOLVE_INCLUDE_DRAFTS === '1';
  const [owner] = (process.env.GITHUB_REPOSITORY || '/').split('/');

  git(['config', 'user.name', 'foretmap-bot']);
  git(['config', 'user.email', 'foretmap-bot@users.noreply.github.com']);
  git(['fetch', 'origin', base]);

  ensureLabel();

  const prs = JSON.parse(
    gh([
      'pr',
      'list',
      '--state',
      'open',
      '--base',
      base,
      '--limit',
      '100',
      '--json',
      'number,headRefName,headRepositoryOwner,isDraft,title,labels',
    ]) || '[]',
  );

  log(`${prs.length} PR ouverte(s) vers ${base}${dryRun ? ' [dry-run]' : ''}.`);

  for (const pr of prs) {
    const prOwner = pr.headRepositoryOwner && pr.headRepositoryOwner.login;
    if (owner && prOwner && prOwner !== owner) {
      log(`PR #${pr.number} : fork (${prOwner}), push impossible, ignorée.`);
      continue;
    }
    if (pr.isDraft && !includeDrafts) {
      log(`PR #${pr.number} : brouillon, ignorée (AUTO_RESOLVE_INCLUDE_DRAFTS=1 pour inclure).`);
      continue;
    }
    try {
      processPr(pr, { base, dryRun });
    } catch (err) {
      log(`PR #${pr.number} : erreur inattendue →`, err.message);
      gitTry(['merge', '--abort']);
    }
  }
}

module.exports = {
  hasConflictMarkers,
  compareSemver,
  maxVersion,
  parseConflicts,
  resolveChangelogConflicts,
  resolveVersionOnlyConflicts,
};

if (require.main === module) {
  main();
}
