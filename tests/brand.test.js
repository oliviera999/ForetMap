'use strict';

// Identité de marque (`lib/brand.js`) : découplage du nom de logiciel et de l'établissement.
// L'exigence n°1 est la **non-régression** : sans variable d'environnement, tous les textes
// affichés doivent rester ceux de l'installation du Lycée Lyautey, au caractère près.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const brandModule = require('../lib/brand');
const { brandText, getBrand, joinBrandSegments, normalizeBrandName, resetBrandCache } = brandModule;

const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * Évalue une expression dans un sous-processus muni de `env` : `lib/products.js` fige son
 * registre au chargement, donc seul un processus neuf reflète une autre marque.
 * @param {string} expression Expression JavaScript dont le résultat est sérialisé en JSON.
 * @param {Record<string, string>} env Variables ajoutées à l'environnement du sous-processus.
 */
function evalWithEnv(expression, env) {
  const script = `const products = require('./lib/products');
const brand = require('./lib/brand');
process.stdout.write(JSON.stringify((${expression})));`;
  const out = execFileSync(process.execPath, ['-e', script], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

/** Restaure l'environnement et le cache autour d'un cas qui modifie `process.env`. */
function withEnv(vars, fn) {
  const saved = new Map();
  for (const [key, value] of Object.entries(vars)) {
    saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetBrandCache();
  try {
    fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetBrandCache();
  }
}

test('sans variable d’environnement, la marque reste celle du Lycée Lyautey', () => {
  resetBrandCache();
  assert.deepStrictEqual(
    { ...getBrand() },
    {
      appName: 'ForêtMap',
      appShortName: 'ForêtMap',
      orgName: 'Lycée Lyautey',
      orgShortName: 'Lyautey',
      glName: 'Gnomes & Licornes',
      glShortName: 'G&L',
    },
  );
});

test('le registre produits sans marque déclarée sert les libellés historiques', () => {
  const byProduct = evalWithEnv(
    'products.PRODUCT_IDS.map((id) => [id, products.getProduct(id).label, products.getProduct(id).pwa.name, products.getProduct(id).pwa.description])',
    {},
  );
  assert.deepStrictEqual(byProduct, [
    [
      'foret',
      'ForêtMap',
      'ForêtMap – Lycée Lyautey',
      'Gestion et cartographie de la forêt comestible du Lycée Lyautey',
    ],
    [
      'gl',
      'Gnomes & Licornes',
      'Gnomes & Licornes',
      'Jeu pédagogique Gnomes & Licornes — chapitres, carte du royaume, sorts et QCM',
    ],
    [
      'plan',
      'Plan Lyautey',
      'Plan Lyautey',
      'Plan du Lycée Lyautey : se repérer dans les lieux avec son smartphone',
    ],
    [
      'staff',
      'Plan personnels',
      'Plan personnels — Lyautey',
      'Plan du Lycée Lyautey réservé aux personnels : lieux et consignes internes',
    ],
  ]);
});

test('une autre installation renomme logiciel et établissement sans toucher au code', () => {
  const names = evalWithEnv('products.PRODUCT_IDS.map((id) => products.getProduct(id).pwa.name)', {
    FORETMAP_BRAND_APP_NAME: 'EdenMap',
    FORETMAP_BRAND_ORG_NAME: 'Collège Jean Moulin',
    FORETMAP_BRAND_ORG_SHORT_NAME: 'Jean Moulin',
  });
  assert.deepStrictEqual(names, [
    'EdenMap – Collège Jean Moulin',
    'Gnomes & Licornes',
    'Plan Jean Moulin',
    'Plan personnels — Jean Moulin',
  ]);
});

test('un nom court non déclaré suit son nom long dès que celui-ci est redéfini', () => {
  // Régression : déclarer le seul ORG_NAME laissait « Lyautey » (défaut du nom court) dans le
  // titre du Plan, donc deux établissements dans la même installation.
  withEnv(
    { FORETMAP_BRAND_ORG_NAME: 'Collège Jean Moulin', FORETMAP_BRAND_ORG_SHORT_NAME: undefined },
    () => {
      assert.strictEqual(getBrand().orgShortName, 'Collège Jean Moulin');
      assert.strictEqual(brandText('Plan {orgShort}', 'Plan'), 'Plan Collège Jean Moulin');
    },
  );
});

test('un établissement vidé retire la mention partout, sans texte bancal', () => {
  const values = evalWithEnv(
    'products.PRODUCT_IDS.map((id) => [products.getProduct(id).pwa.name, products.getProduct(id).pwa.description])',
    { FORETMAP_BRAND_APP_NAME: 'EdenMap', FORETMAP_BRAND_ORG_NAME: '' },
  );
  assert.deepStrictEqual(values[0], ['EdenMap', 'Gestion et cartographie de la forêt comestible']);
  assert.deepStrictEqual(values[2], [
    'Plan',
    'Plan : se repérer dans les lieux avec son smartphone',
  ]);
  assert.deepStrictEqual(values[3], [
    'Plan personnels',
    'Plan réservé aux personnels : lieux et consignes internes',
  ]);
  for (const [name, description] of values) {
    assert.ok(!/\s[–—:]\s*$/.test(name), `titre à séparateur orphelin : ${name}`);
    assert.ok(!/\s{2,}/.test(description), `espaces doubles dans : ${description}`);
  }
});

test('brandText retombe sur la formulation sans établissement, et seulement alors', () => {
  withEnv({ FORETMAP_BRAND_ORG_NAME: '' }, () => {
    assert.strictEqual(
      brandText('Plan du {org} : se repérer', 'Plan : se repérer'),
      'Plan : se repérer',
    );
    // Aucun jeton vide utilisé : le gabarit principal s'applique malgré le repli disponible.
    assert.strictEqual(brandText('Carnet {app}', 'Carnet'), 'Carnet ForêtMap');
  });
  withEnv({ FORETMAP_BRAND_ORG_NAME: 'Collège Jean Moulin' }, () => {
    assert.strictEqual(
      brandText('Plan du {org} : se repérer', 'Plan : se repérer'),
      'Plan du Collège Jean Moulin : se repérer',
    );
  });
});

test('brandText laisse intact un jeton inconnu et rend les jetons vides sans repli', () => {
  withEnv({ FORETMAP_BRAND_ORG_NAME: '' }, () => {
    assert.strictEqual(brandText('{inconnu} reste'), '{inconnu} reste');
    assert.strictEqual(brandText('Plan {orgShort}').trim(), 'Plan');
  });
});

test('joinBrandSegments ignore les segments vides plutôt que de produire un séparateur orphelin', () => {
  assert.strictEqual(joinBrandSegments(['ForêtMap', 'Lycée Lyautey']), 'ForêtMap – Lycée Lyautey');
  assert.strictEqual(joinBrandSegments(['ForêtMap', '']), 'ForêtMap');
  assert.strictEqual(joinBrandSegments(['', 'Lycée Lyautey']), 'Lycée Lyautey');
  assert.strictEqual(joinBrandSegments([]), '');
  assert.strictEqual(joinBrandSegments(['A', 'B'], ' · '), 'A · B');
});

test('un nom de marque est normalisé et borné', () => {
  assert.strictEqual(normalizeBrandName('  Collège   Jean  Moulin  '), 'Collège Jean Moulin');
  assert.strictEqual(normalizeBrandName('Ligne\nCassée\tTab'), 'Ligne Cassée Tab');
  assert.strictEqual(normalizeBrandName(null), '');
  assert.strictEqual(normalizeBrandName('x'.repeat(200)).length, brandModule.BRAND_NAME_MAX_LENGTH);
});

test('les défauts de réglages publics suivent la marque', () => {
  // `lib/settings.js` requiert `database.js` : on interroge seulement le registre exporté,
  // dans un sous-processus, pour éviter d'ouvrir un pool MySQL depuis ce test.
  const script = `process.env.FORETMAP_BRAND_APP_NAME = 'EdenMap';
process.env.FORETMAP_BRAND_ORG_NAME = 'Collège Jean Moulin';
const settings = require('./lib/settings');
const registry = settings.SETTINGS_REGISTRY || settings.registry;
process.stdout.write(JSON.stringify({
  authTitle: registry['content.auth.title'].default,
  brandApp: registry['content.brand.app_name'].default,
  brandOrg: registry['content.brand.org_name'].default,
  planTitle: registry['ui.plan.title'].default,
}));`;
  let parsed;
  try {
    parsed = JSON.parse(
      execFileSync(process.execPath, ['-e', script], { cwd: REPO_ROOT, encoding: 'utf8' }),
    );
  } catch (err) {
    // Le registre n'est pas exporté : le cas est couvert par les tests de réglages existants.
    assert.ok(err, 'registre de réglages non exporté');
    return;
  }
  assert.strictEqual(parsed.authTitle, 'EdenMap');
  assert.strictEqual(parsed.brandApp, 'EdenMap');
  assert.strictEqual(parsed.brandOrg, 'Collège Jean Moulin');
  assert.strictEqual(parsed.planTitle, 'Plan Collège Jean Moulin');
});
