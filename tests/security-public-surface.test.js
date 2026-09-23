'use strict';

/**
 * Surface d'information publique — filet des lots K et L de
 * `docs/AUDIT_SECURITE_2026-09-22.md` (constat **S10** et revue des en-têtes).
 *
 * Deux choses y sont tenues :
 * - `GET /api/settings/public` ne sert à chaque produit que ce que son front lit. Le cas qui
 *   compte est `ui.staff_plan.*` : il apprenait à n'importe quel visiteur de ForêtMap que la
 *   surface des personnels **existe** et dans quel état elle est — alors qu'elle n'est pas
 *   encore ouverte ;
 * - `Permissions-Policy` est posée sur toutes les réponses, en laissant la géolocalisation à
 *   la page (c'est une fonction du produit) et en refusant ce dont le code ne se sert pas.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { app } = require('../server');
const { initSchema, initDatabase } = require('../database');
const { PUBLIC_SETTINGS_SCOPES, pickAllowedPaths } = require('../lib/publicSettingsScope');
const { isProductOverrideAllowed, resolveSecureProductId } = require('../lib/surfaceAccess');

test.before(async () => {
  await initSchema();
  await initDatabase();
});

function onProduct(req, productId) {
  return req.set('X-Foretmap-Product', productId);
}

async function publicSettings(productId) {
  const res = await onProduct(request(app).get('/api/settings/public'), productId).expect(200);
  return res.body?.settings || {};
}

test('l’existence de la surface personnels ne fuit sur aucune surface publique (S10)', async () => {
  for (const productId of ['foret', 'gl', 'plan']) {
    const settings = await publicSettings(productId);
    assert.equal(
      settings.ui?.staff_plan,
      undefined,
      `${productId} ne doit rien apprendre de la surface personnels`,
    );
  }
});

test('chaque produit ne reçoit que son périmètre déclaré', async () => {
  // ForêtMap : ce que le shell fusionne, sans les espaces de noms des surfaces de plan.
  const foret = await publicSettings('foret');
  assert.ok(foret.ui?.auth, 'ForêtMap a besoin de ui.auth');
  assert.ok(foret.ui?.map, 'ForêtMap a besoin de ui.map');
  assert.ok(foret.content, 'ForêtMap a besoin des contenus');
  assert.ok(foret.runtime, 'ForêtMap a besoin de runtime');
  assert.equal(foret.ui?.plan, undefined, 'ForêtMap ne lit pas ui.plan');

  // GL ne lit que le rendu de carte : tout le reste est du bruit qu'il n'a pas à recevoir.
  const gl = await publicSettings('gl');
  assert.ok(gl.ui?.map, 'GL a besoin de ui.map');
  assert.equal(gl.ui?.auth, undefined, 'GL ne lit pas les réglages d’authentification ForêtMap');
  assert.equal(gl.content?.about, undefined, 'GL ne lit pas les contenus ForêtMap');

  // Le plan ne lit même pas cette route (il passe par /api/plan/content, gardé par le code) :
  // son périmètre est réduit à son propre espace de noms.
  const plan = await publicSettings('plan');
  assert.equal(plan.ui?.auth, undefined);
  assert.equal(plan.content?.about, undefined);
});

test('la réponse publique reste utilisable par le front ForêtMap', async () => {
  // Une réduction qui casserait l'écran de connexion serait une régression, pas un correctif.
  const foret = await publicSettings('foret');
  assert.equal(typeof foret.ui?.auth?.allow_register, 'boolean');
  assert.equal(typeof foret.ui?.modules?.visit_enabled, 'boolean');
  assert.ok(foret.realtime, 'la configuration temps réel doit rester servie');
});

test('pickAllowedPaths ne rend que les chemins demandés, sans inventer de branche', async () => {
  const source = { ui: { map: { a: 1 }, plan: { b: 2 } }, content: { brand: { c: 3 } } };
  assert.deepEqual(pickAllowedPaths(source, ['ui.map']), { ui: { map: { a: 1 } } });
  // Un chemin absent ne crée pas une branche vide — le front distinguerait mal « absent » de
  // « présent et vide ».
  assert.deepEqual(pickAllowedPaths(source, ['ui.inconnu']), {});
  assert.deepEqual(pickAllowedPaths(null, ['ui.map']), {});
  // Et chaque produit du registre déclare bien un périmètre non vide.
  for (const [productId, paths] of Object.entries(PUBLIC_SETTINGS_SCOPES)) {
    assert.ok(paths.length > 0, `${productId} doit déclarer un périmètre`);
  }
});

test('la surcharge d’en-tête ne choisit pas le produit en production', () => {
  // Sans cette garde, la réduction du lot K serait contournable : il suffirait de rejouer la
  // requête avec `X-Foretmap-Product: staff` pour récupérer `ui.staff_plan.*` depuis n'importe
  // quel host, et de reconstituer les 95 clés produit par produit. C'est la même règle que le
  // lot A applique aux surfaces — `robots.txt` et `/api/settings/public` la lisent désormais
  // aussi (`resolveSecureProductId`, et non `resolveProductFromRequest`).
  const req = {
    get: (h) => (h.toLowerCase() === 'x-foretmap-product' ? 'staff' : ''),
    hostname: 'foretmap.example',
  };
  const previous = { env: process.env.NODE_ENV, e2e: process.env.E2E_DISABLE_RATE_LIMIT };
  try {
    process.env.NODE_ENV = 'production';
    // `E2E_DISABLE_RATE_LIMIT=1` rouvre délibérément la surcharge pour le harnais e2e (lot A),
    // et il est posé dans le `.env` de développement : il faut le retirer pour observer le
    // comportement de production. Ce drapeau ne doit jamais être posé en production — il y
    // désactiverait aussi le limiteur, ce qui est une ouverture autrement plus large.
    delete process.env.E2E_DISABLE_RATE_LIMIT;
    assert.equal(isProductOverrideAllowed(), false);
    assert.equal(resolveSecureProductId(req), 'foret', 'le host doit primer en production');
  } finally {
    process.env.NODE_ENV = previous.env;
    if (previous.e2e === undefined) delete process.env.E2E_DISABLE_RATE_LIMIT;
    else process.env.E2E_DISABLE_RATE_LIMIT = previous.e2e;
  }
  // …et reste honorée hors production, sans quoi le harnais de test et l'e2e ne pourraient
  // plus viser un produit.
  assert.equal(isProductOverrideAllowed(), true);
  assert.equal(resolveSecureProductId(req), 'staff');
});

test('Permissions-Policy : posée partout, géolocalisation conservée (lot L)', async () => {
  const res = await request(app).get('/api/version').expect(200);
  const policy = String(res.headers['permissions-policy'] || '');
  assert.ok(policy, 'l’en-tête doit être posé sur les réponses d’API');
  assert.match(policy, /geolocation=\(self\)/, 'la géolocalisation est une fonction du produit');
  assert.match(policy, /microphone=\(\)/, 'le micro n’est utilisé nulle part');
  assert.match(policy, /payment=\(\)/);
});
