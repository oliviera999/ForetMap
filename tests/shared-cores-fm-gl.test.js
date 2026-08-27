'use strict';

// Verrouille les noyaux mutualisés entre les deux produits par le lot du 27/08 (audit du 26/08,
// §6.1) : commentaires contextuels (102 lignes communes mesurées) et filtre des liens
// ressource ↔ question (104).
//
// Ces tests ne remplacent pas ceux des routes : ils portent sur la **propriété** qui rend la
// mutualisation sûre — les deux produits lisent bien la même source, et l'adaptateur mince
// n'a pas dérivé. Sans eux, une redéclaration locale des bornes rétablirait silencieusement
// la duplication que ce lot supprime.

const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert');

const {
  CONTEXT_COMMENT_LIMITS,
  makeContextTypeNormalizer,
} = require('../lib/shared/contextCommentsCore');

const FM_ROUTE = path.join(__dirname, '..', 'routes', 'context-comments.js');
const GL_ROUTE = path.join(__dirname, '..', 'routes', 'gl', 'context-comments.js');

test('les bornes de saisie sont gelées et partagées', () => {
  assert.deepStrictEqual(
    { ...CONTEXT_COMMENT_LIMITS },
    {
      MIN_BODY: 2,
      MAX_BODY: 4000,
      MIN_REPORT_REASON: 3,
      MAX_REPORT_REASON: 500,
      DEFAULT_PAGE_SIZE: 20,
      MAX_PAGE_SIZE: 50,
    },
    'valeurs historiques des deux produits — les changer est un choix produit, pas un détail',
  );
  assert.ok(Object.isFrozen(CONTEXT_COMMENT_LIMITS));
});

test('aucun routeur ne redéclare une borne en dur', () => {
  // C'est la garde qui empêche le retour de la duplication : redéclarer `MAX_BODY = 4000`
  // localement ne casserait aucun test de route (la valeur serait la même)… jusqu'au jour où
  // l'une des deux bouge.
  const interdits = [
    /const\s+MIN_BODY\s*=\s*\d/,
    /const\s+MAX_BODY\s*=\s*\d/,
    /const\s+MIN_COMMENT_LEN\s*=\s*\d/,
    /const\s+MAX_COMMENT_LEN\s*=\s*\d/,
    /const\s+MIN_REPORT_REASON_LEN\s*=\s*\d/,
    /const\s+MAX_REPORT_REASON_LEN\s*=\s*\d/,
    /const\s+DEFAULT_PAGE_SIZE\s*=\s*\d/,
    /const\s+MAX_PAGE_SIZE\s*=\s*\d/,
  ];
  for (const file of [FM_ROUTE, GL_ROUTE]) {
    const src = fs.readFileSync(file, 'utf8');
    for (const re of interdits) {
      assert.ok(
        !re.test(src),
        `${path.basename(file)} redéclare une borne (${re}) au lieu de la lire dans CONTEXT_COMMENT_LIMITS`,
      );
    }
  }
});

test('les deux routeurs passent par la fabrique de normaliseur', () => {
  for (const file of [FM_ROUTE, GL_ROUTE]) {
    const src = fs.readFileSync(file, 'utf8');
    assert.match(
      src,
      /makeContextTypeNormalizer\(ALLOWED_CONTEXT_TYPES\)/,
      `${path.basename(file)} doit dériver son normaliseur de l'ensemble autorisé, pas le réécrire`,
    );
    assert.ok(
      !/function\s+normalizeContextType\s*\(/.test(src),
      `${path.basename(file)} ne doit plus définir normalizeContextType`,
    );
  }
});

test('le normaliseur garde le contrat historique', () => {
  const norm = makeContextTypeNormalizer(['task', 'zone']);
  assert.strictEqual(norm('task'), 'task');
  assert.strictEqual(norm('  TASK  '), 'task', 'espaces retirés et minuscules');
  assert.strictEqual(norm('inconnu'), '', 'type non autorisé → chaîne vide, pas une exception');
  assert.strictEqual(norm(null), '');
  assert.strictEqual(norm(undefined), '');
  assert.strictEqual(norm(0), '', '0 est falsy — historiquement traité comme absent');
});

test('la fabrique accepte un Set comme un tableau, et isole les ensembles', () => {
  const depuisSet = makeContextTypeNormalizer(new Set(['gl_chapter']));
  const depuisTableau = makeContextTypeNormalizer(['gl_chapter']);
  assert.strictEqual(depuisSet('gl_chapter'), 'gl_chapter');
  assert.strictEqual(depuisTableau('gl_chapter'), 'gl_chapter');

  // Les deux produits ont des ensembles disjoints : aucun ne doit accepter les types de l'autre.
  const fm = makeContextTypeNormalizer(['task', 'project']);
  const gl = makeContextTypeNormalizer(['gl_chapter', 'gl_scene']);
  assert.strictEqual(fm('gl_chapter'), '', 'ForetMap ne connaît pas les types G&L');
  assert.strictEqual(gl('task'), '', 'G&L ne connaît pas les types ForetMap');
});

test('les ensembles de types des deux produits restent disjoints', () => {
  // L'isolement produit est un invariant du dépôt (`CLAUDE.md`). Mutualiser le normaliseur ne
  // doit pas le relâcher : si un type se retrouvait dans les deux, un commentaire pourrait
  // changer de produit sans que rien ne le signale.
  const lire = (file) => {
    const m = fs.readFileSync(file, 'utf8').match(/ALLOWED_CONTEXT_TYPES = new Set\(\[([^\]]*)\]/);
    assert.ok(m, `ensemble autorisé introuvable dans ${path.basename(file)}`);
    return new Set(m[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1)));
  };
  const fm = lire(FM_ROUTE);
  const gl = lire(GL_ROUTE);
  assert.ok(fm.size > 0 && gl.size > 0);
  const communs = [...fm].filter((t) => gl.has(t));
  assert.deepStrictEqual(
    communs,
    [],
    'aucun type de contexte ne doit appartenir aux deux produits',
  );
});

// ── Filtre partagé des liens ressource ↔ question ──────────────────────────────────────────
// Deuxième paire mutualisée du lot (`routes/learning-links.js` ↔ `routes/gl/learning-links.js`,
// 104 lignes communes mesurées). L'ordre des critères compte : il fixe l'ordre des `?` dans
// `params`, donc une inversion produirait un filtre silencieusement faux.

const { buildLinksFilter, linksWhereClause } = require('../lib/shared/resourceQuestionGatingCore');

test('filtre de liens : aucun critère → clause vide', () => {
  const r = buildLinksFilter({}, { allowedTypes: ['tutorial'] });
  assert.deepStrictEqual(r.where, []);
  assert.deepStrictEqual(r.params, []);
  assert.strictEqual(linksWhereClause(r.where), '', 'pas de WHERE quand rien ne filtre');
});

test('filtre de liens : ordre des critères et des paramètres', () => {
  const r = buildLinksFilter(
    { resourceType: 'tutorial', resourceRef: 'ref-1', questionCode: 'Q1', status: 'approved' },
    { allowedTypes: ['tutorial'] },
  );
  assert.deepStrictEqual(r.where, [
    'resource_type = ?',
    'resource_ref = ?',
    'question_code = ?',
    'status = ?',
  ]);
  assert.deepStrictEqual(r.params, ['tutorial', 'ref-1', 'Q1', 'approved']);
  assert.strictEqual(
    linksWhereClause(r.where),
    'WHERE resource_type = ? AND resource_ref = ? AND question_code = ? AND status = ?',
  );
});

test('filtre de liens : une référence sans type est ignorée', () => {
  // Filtrer `resource_ref` seul ferait correspondre des ressources homonymes de familles
  // différentes — le comportement historique l'ignore, et c'est le bon.
  const r = buildLinksFilter({ resourceRef: 'ref-1' }, { allowedTypes: ['tutorial'] });
  assert.deepStrictEqual(r.where, []);
});

test('filtre de liens : type non autorisé → message de 400, pas une exception', () => {
  const r = buildLinksFilter({ resourceType: 'inconnu' }, { allowedTypes: ['tutorial'] });
  assert.strictEqual(r.error, 'Type de ressource invalide');
  assert.strictEqual(r.where, undefined);
});

test('filtre de liens : le critère jeu de questions est propre à G&L', () => {
  const sans = buildLinksFilter({ questionDataset: 'qcm_lore' }, { allowedTypes: ['gl_chapter'] });
  assert.deepStrictEqual(sans.where, [], 'ForetMap ignore questionDataset');

  const avec = buildLinksFilter(
    { questionDataset: 'qcm_lore' },
    { allowedTypes: ['gl_chapter'], withDataset: true },
  );
  assert.deepStrictEqual(avec.where, ['question_dataset = ?']);
  assert.deepStrictEqual(avec.params, ['qcm_lore']);

  const invalide = buildLinksFilter(
    { questionDataset: 'nimporte-quoi' },
    { allowedTypes: ['gl_chapter'], withDataset: true },
  );
  assert.strictEqual(invalide.error, 'Jeu de questions invalide');
});

test('filtre de liens : le jeu de questions passe avant le type de ressource', () => {
  // G&L construisait sa clause dans cet ordre ; le changer réordonnerait les `?`.
  const r = buildLinksFilter(
    { questionDataset: 'qcm_lore', resourceType: 'gl_chapter' },
    { allowedTypes: ['gl_chapter'], withDataset: true },
  );
  assert.deepStrictEqual(r.where, ['question_dataset = ?', 'resource_type = ?']);
  assert.deepStrictEqual(r.params, ['qcm_lore', 'gl_chapter']);
});
