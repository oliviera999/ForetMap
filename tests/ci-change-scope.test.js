'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { DOCS_READ_BY_CODE, isLightPath, needsFullCi } = require('../scripts/ci-change-scope.js');

const ROOT = path.join(__dirname, '..');

test('un audit Markdown seul ne déclenche pas la CI complète', () => {
  assert.equal(needsFullCi(['docs/AUDIT_QUOTA_ACTIONS_2026-10-01.md']), false);
  assert.equal(needsFullCi(['docs/audits/README.md', 'CHANGELOG.md']), false);
  assert.equal(
    needsFullCi(['.cursor/rules/foo.mdc', '.claude/skills/x/SKILL.md', 'CLAUDE.md']),
    false,
  );
});

test('un seul fichier de code dans le lot suffit à déclencher la CI complète', () => {
  assert.equal(needsFullCi(['docs/AUDIT_X.md', 'routes/zones.js']), true);
  assert.equal(needsFullCi(['CHANGELOG.md', 'migrations/250_x.sql']), true);
  assert.equal(needsFullCi(['docs/AUDIT_X.md', '.github/workflows/ci.yml']), true);
});

test('la doc lue à l’exécution ou par les tests reste en CI complète', () => {
  for (const f of [
    'docs/API.md',
    'docs/EXPLOITATION.md',
    'docs/CRONTAB.md',
    'docs/reference/foretmap/presentation.md',
    'docs/reference/gl/alpha.md',
    'docs/templates/comptes.csv',
    'docs/packs/olu-planches-pack.json',
    'README.md',
  ]) {
    assert.equal(isLightPath(f), false, f);
    assert.equal(needsFullCi([f]), true, f);
  }
});

test('liste vide ou illisible : CI complète par prudence', () => {
  assert.equal(needsFullCi([]), true);
  assert.equal(needsFullCi(['', '  ']), true);
  assert.equal(needsFullCi(undefined), true);
});

/** Fichiers de code susceptibles de lire un `docs/*.md` (tests compris). */
function listCodeFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(c|m)?jsx?$/.test(entry.name)) out.push(full);
    }
  };
  for (const dir of ['tests', 'tests-ui', 'e2e', 'lib', 'routes', 'scripts']) {
    const full = path.join(ROOT, dir);
    if (fs.existsSync(full)) walk(full);
  }
  for (const f of ['server.js', 'database.js']) out.push(path.join(ROOT, f));
  return out;
}

test('tout docs/<X>.md lu par du code ou un test figure dans DOCS_READ_BY_CODE', () => {
  // Un littéral qui est **exactement** un chemin `docs/<X>.md` (ou `'docs', '<X>.md'` passé à
  // path.join) : c'est une lecture de fichier, pas une citation dans un commentaire ou un
  // message. Le premier test qui lit un nouveau document de `docs/` fait tomber ce garde-fou.
  const literal = /['"`]docs\/([^'"`/\s]+\.md)['"`]/g;
  const joined = /['"`]docs['"`]\s*,\s*['"`]([^'"`/\s]+\.md)['"`]/g;
  const missing = new Set();
  for (const file of listCodeFiles()) {
    if (file === __filename) continue; // ses propres exemples
    // Lignes de commentaire retirées (elles citent volontiers des audits entre accents
    // graves) : seules comptent les lignes qui **commencent** par `//`, `*` ou `/*`. Retirer
    // les blocs `/* … */` au vol mangerait du code (un glob `'/api/*'` ouvre un faux bloc).
    const src = fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line))
      .join('\n');
    for (const re of [literal, joined]) {
      for (const m of src.matchAll(re)) {
        const doc = `docs/${m[1]}`;
        if (!DOCS_READ_BY_CODE.has(doc)) missing.add(`${doc} (${path.relative(ROOT, file)})`);
      }
    }
  }
  assert.deepEqual([...missing], [], 'à ajouter à DOCS_READ_BY_CODE (scripts/ci-change-scope.js)');
});

test('CLI : lit la liste sur stdin et répond full=true|false', () => {
  const { execFileSync } = require('node:child_process');
  const script = path.join(ROOT, 'scripts', 'ci-change-scope.js');
  const run = (input) => execFileSync(process.execPath, [script], { input }).toString().trim();
  assert.equal(run('docs/AUDIT_X.md\nCHANGELOG.md\n'), 'full=false');
  assert.equal(run('docs/AUDIT_X.md\nsrc/App.jsx\n'), 'full=true');
  assert.equal(run(''), 'full=true');
});
