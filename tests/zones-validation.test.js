'use strict';

// O7 — vérifie SANS DB que les schémas zod de `routes/zones.js` reproduisent exactement les
// gardes manuelles d'origine :
// - `PUT /:id/photos/reorder` :
//     `const raw = req.body?.photo_ids ?? req.body?.ordered_ids; if (!Array.isArray(raw)) -> 400`
//     'Liste photo_ids (ou ordered_ids) requise' ;
// - `POST /:id/photos` : `const { image_data } = req.body; if (!image_data) -> 400 'Image requise'`.
const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate');
const {
  reorderZonePhotosBodySchema,
  addZonePhotoBodySchema,
} = require('../routes/zones');

function runValidation(schema, body) {
  const req = { body };
  const res = {
    statusCode: 200,
    body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(payload) { this.body = payload; return this; },
  };
  let nextCalled = false;
  validate({ body: schema })(req, res, () => { nextCalled = true; });
  return { nextCalled, status: res.statusCode, error: res.body?.error, reqBody: req.body };
}

// Ancienne garde : `const raw = req.body?.photo_ids ?? req.body?.ordered_ids; !Array.isArray(raw)`.
function legacyReorderRejects(body) {
  const raw = body == null ? undefined : (body.photo_ids ?? body.ordered_ids);
  return !Array.isArray(raw);
}

test('reorder : rejet 400 quand ni photo_ids ni ordered_ids n’est un tableau', () => {
  const rejectCases = [
    {},
    { photo_ids: undefined },
    { photo_ids: null },
    { photo_ids: '1,2,3' },
    { ordered_ids: 42 },
    { photo_ids: { 0: 1 } },
  ];
  for (const body of rejectCases) {
    const r = runValidation(reorderZonePhotosBodySchema, body);
    assert.strictEqual(legacyReorderRejects(body), true, `legacy devrait rejeter ${JSON.stringify(body)}`);
    assert.strictEqual(r.nextCalled, false, `next ne doit pas être appelé pour ${JSON.stringify(body)}`);
    assert.strictEqual(r.status, 400, `status 400 attendu pour ${JSON.stringify(body)}`);
    assert.strictEqual(
      r.error,
      'Liste photo_ids (ou ordered_ids) requise',
      `message exact attendu pour ${JSON.stringify(body)}`
    );
  }
});

test('reorder : laisse passer un tableau (photo_ids ou ordered_ids) sans transformer le corps', () => {
  const passCases = [
    { photo_ids: [] },
    { photo_ids: [3, 1, 2] },
    { ordered_ids: [5, 4] },
    { photo_ids: ['a', 'b'], extra: 'toléré' }, // éléments coercés plus tard par le handler
  ];
  for (const body of passCases) {
    const r = runValidation(reorderZonePhotosBodySchema, body);
    assert.strictEqual(legacyReorderRejects(body), false, `legacy ne devrait pas rejeter ${JSON.stringify(body)}`);
    assert.strictEqual(r.nextCalled, true, `next doit être appelé pour ${JSON.stringify(body)}`);
    assert.strictEqual(r.status, 200, `pas de 400 pour ${JSON.stringify(body)}`);
    // Corps non transformé : le handler relit photo_ids ?? ordered_ids tel quel.
    assert.deepStrictEqual(r.reqBody, body, 'le corps ne doit pas être altéré');
  }
});

// Ancienne garde : `const { image_data } = req.body; if (!image_data)`.
function legacyPhotoRejects(body) {
  return !(body && body.image_data);
}

test('add photo : rejet 400 quand image_data est absent/falsy', () => {
  const rejectCases = [
    {},
    { image_data: undefined },
    { image_data: null },
    { image_data: '' },
    { image_data: 0 },
    { image_data: false },
    { caption: 'sans image' },
  ];
  for (const body of rejectCases) {
    const r = runValidation(addZonePhotoBodySchema, body);
    assert.strictEqual(legacyPhotoRejects(body), true, `legacy devrait rejeter ${JSON.stringify(body)}`);
    assert.strictEqual(r.nextCalled, false, `next ne doit pas être appelé pour ${JSON.stringify(body)}`);
    assert.strictEqual(r.status, 400, `status 400 attendu pour ${JSON.stringify(body)}`);
    assert.strictEqual(r.error, 'Image requise', `message exact attendu pour ${JSON.stringify(body)}`);
  }
});

test('add photo : laisse passer dès qu’image_data est truthy, sans transformer le corps', () => {
  const passCases = [
    { image_data: 'data:image/jpeg;base64,AAA' },
    { image_data: 'x', caption: 'légende' },
  ];
  for (const body of passCases) {
    const r = runValidation(addZonePhotoBodySchema, body);
    assert.strictEqual(legacyPhotoRejects(body), false, `legacy ne devrait pas rejeter ${JSON.stringify(body)}`);
    assert.strictEqual(r.nextCalled, true, `next doit être appelé pour ${JSON.stringify(body)}`);
    assert.strictEqual(r.status, 200, `pas de 400 pour ${JSON.stringify(body)}`);
    assert.deepStrictEqual(r.reqBody, body, 'le corps ne doit pas être altéré');
  }
});
