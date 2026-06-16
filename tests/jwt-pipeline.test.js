require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const {
  parseBearerToken,
  verifyJwtForProduct,
  parseOptionalForetAuth,
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
