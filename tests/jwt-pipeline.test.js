require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const {
  parseBearerToken,
  verifyJwtForProduct,
  parseOptionalForetAuth,
  checkClaimsProduct,
} = require('../lib/auth/jwtPipeline');
const {
  hydrateAuthFromTokenClaims,
  signAuthToken,
  JWT_SECRET,
} = require('../middleware/requireTeacher');
const { initSchema, queryOne } = require('../database');

test('parseBearerToken extrait le token Bearer', () => {
  const req = { headers: { authorization: 'Bearer abc.def.ghi' } };
  assert.strictEqual(parseBearerToken(req), 'abc.def.ghi');
  assert.strictEqual(parseBearerToken({ headers: {} }), null);
});

test('checkClaimsProduct : contrôle produit pur (réutilisation des claims vérifiés)', () => {
  // Foret attendu (défaut) : claims foret ou sans produit → ok.
  assert.deepStrictEqual(checkClaimsProduct({ product: 'foret', userId: 1 }, 'foret'), {
    claims: { product: 'foret', userId: 1 },
  });
  assert.deepStrictEqual(checkClaimsProduct({ userId: 1 }, 'foret'), { claims: { userId: 1 } });
  assert.strictEqual(checkClaimsProduct({ product: 'GL' }, 'foret').status, 403);
  // GL attendu : seul un token gl passe.
  assert.ok(checkClaimsProduct({ product: 'gl' }, 'gl').claims);
  const rejForet = checkClaimsProduct({ product: 'foret' }, 'gl');
  assert.strictEqual(rejForet.status, 403);
  assert.match(rejForet.error, /Gnomes & Licornes/);
});

test('verifyJwtForProduct rejette un token Foret sur produit gl', async () => {
  await initSchema();
  const teacher = await queryOne("SELECT id FROM users WHERE user_type = 'teacher' LIMIT 1");
  assert.ok(teacher?.id, 'enseignant seed requis');
  const token = await signAuthToken(
    {
      userType: 'teacher',
      userId: teacher.id,
      product: 'foret',
    },
    false,
  );
  const result = verifyJwtForProduct(token, JWT_SECRET, 'gl');
  assert.ok(result.error);
  assert.strictEqual(result.status, 403);
});

test('parseOptionalForetAuth retourne null sans token', async () => {
  const auth = await parseOptionalForetAuth(
    { headers: {} },
    {
      jwtSecret: JWT_SECRET,
      hydrateAuthFromTokenClaims,
    },
  );
  assert.strictEqual(auth, null);
});
