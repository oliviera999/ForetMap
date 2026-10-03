'use strict';

/**
 * ci-change-scope.js — dit si un lot de fichiers modifiés mérite la CI complète.
 *
 * Pourquoi : depuis le passage du dépôt en privé, chaque minute d'Actions est décomptée du quota
 * du plan (2 000 min/mois en Free). Un run `CI` complet coûte ~40 min facturées (jobs `test`,
 * `quality`, `contenu`) ; une PR qui n'ajoute qu'un audit Markdown n'a besoin que de lint et
 * Prettier. Utilisé par le job `changes` de .github/workflows/ci.yml.
 *
 * Règle : un fichier est « léger » s'il est de la documentation qu'**aucun test ni code ne lit**.
 * Le lot entier est léger seulement si tous ses fichiers le sont ; un seul fichier hors liste
 * (code, migration, workflow, doc lue par un test…) → CI complète. Dans le doute, complète.
 *
 * Attention : une partie de `docs/` est du **contenu** lu à l'exécution ou par les tests
 * (`docs/reference/**` servi par l'API, `docs/templates/**`, `docs/packs/**`, `docs/API.md`
 * vérifié par tests/api-doc-coverage.test.js…). Seuls les `.md` à la racine de `docs/` et
 * `docs/audits/**` sont admis, moins `DOCS_READ_BY_CODE`. Le test
 * tests/ci-change-scope.test.js vérifie que tout `docs/<X>.md` lu par du code y figure.
 *
 * Usage CLI : liste des fichiers sur stdin (un par ligne) → écrit `full=true|false` sur stdout.
 */

/** Documentation qu'aucun test ni code ne lit. */
const LIGHT_PATTERNS = [
  /^docs\/[^/]+\.md$/,
  /^docs\/audits\/.+/,
  /^\.cursor\/.+/,
  /^\.claude\/.+/,
  /^CLAUDE\.md$/,
  /^AGENTS\.md$/,
  /^CHANGELOG\.md$/,
];

/** Fichiers `docs/*.md` pourtant lus par un test ou servis par le serveur : CI complète. */
const DOCS_READ_BY_CODE = new Set([
  'docs/API.md', // tests/api-doc-coverage.test.js
  'docs/CRONTAB.md', // tests/deploy-cron-scripts.test.js
  'docs/EXPLOITATION.md', // tests/deploy-cron-scripts.test.js
  'docs/SITE_ISSUES.md', // servi par server.js
]);

function isLightPath(file) {
  const f = String(file || '').trim();
  if (!f) return true;
  if (DOCS_READ_BY_CODE.has(f)) return false;
  return LIGHT_PATTERNS.some((re) => re.test(f));
}

/**
 * @param {string[]} files chemins relatifs à la racine du dépôt
 * @returns {boolean} true si la CI complète doit tourner
 */
function needsFullCi(files) {
  const list = (files || []).map((f) => String(f || '').trim()).filter(Boolean);
  // Liste vide (API muette, PR sans fichier) : on ne sait rien → CI complète.
  if (list.length === 0) return true;
  return !list.every(isLightPath);
}

module.exports = { LIGHT_PATTERNS, DOCS_READ_BY_CODE, isLightPath, needsFullCi };

if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    input += chunk;
  });
  process.stdin.on('end', () => {
    const files = input.split('\n');
    process.stdout.write(`full=${needsFullCi(files)}\n`);
  });
}
