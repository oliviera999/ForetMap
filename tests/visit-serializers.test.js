'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  sanitizeTargetType,
  sanitizeTargetId,
  visitMediaPublicImageUrl,
  serializeVisitMedia,
  pickNewestMapPhotoByTarget,
  serializeMapLeadPhoto,
  serializeMapExtraPhotos,
} = require('../lib/visit/visitSerializers');

test('sanitizeTargetType : zone/marker (casse/espaces) sinon null', () => {
  assert.equal(sanitizeTargetType('zone'), 'zone');
  assert.equal(sanitizeTargetType('  Marker '), 'marker');
  assert.equal(sanitizeTargetType('plant'), null);
  assert.equal(sanitizeTargetType(''), null);
  assert.equal(sanitizeTargetType(null), null);
});

test('sanitizeTargetId : trim, vide → null', () => {
  assert.equal(sanitizeTargetId('  42 '), '42');
  assert.equal(sanitizeTargetId(''), null);
  assert.equal(sanitizeTargetId(null), null);
});

test('visitMediaPublicImageUrl : fichier local → route /data, sinon image_url', () => {
  assert.equal(visitMediaPublicImageUrl({ id: 7, image_path: 'a/b.jpg' }), '/api/visit/media/7/data');
  assert.equal(visitMediaPublicImageUrl({ id: 7, image_url: ' https://x/y.png ' }), 'https://x/y.png');
  assert.equal(visitMediaPublicImageUrl(null), '');
});

test('serializeVisitMedia : retire image_path, pose image_url', () => {
  const out = serializeVisitMedia({ id: 1, image_path: 'p.jpg', caption: 'c' });
  assert.deepEqual(out, { id: 1, caption: 'c', image_url: '/api/visit/media/1/data' });
  assert.ok(!('image_path' in out));
  assert.equal(serializeVisitMedia(null), null);
});

test('pickNewestMapPhotoByTarget : première ligne par cible (ordre conservé)', () => {
  const rows = [
    { target_id: 'z1', id: 10 },
    { target_id: 'z1', id: 11 },
    { target_id: 'z2', id: 20 },
    { foo: '', id: 99 },
  ];
  const m = pickNewestMapPhotoByTarget(rows);
  assert.equal(m.get('z1').id, 10);
  assert.equal(m.get('z2').id, 20);
  assert.equal(m.size, 2);
});

test('serializeMapLeadPhoto : forme {id,image_url,thumb_url,caption} ou null', () => {
  const out = serializeMapLeadPhoto('zone', 'z1', { id: 5, image_path: 'x.jpg', caption: ' hi ' });
  assert.equal(out.id, 5);
  assert.equal(out.caption, 'hi');
  assert.ok(typeof out.image_url === 'string');
  assert.equal(serializeMapLeadPhoto('zone', 'z1', null), null);
  assert.equal(serializeMapLeadPhoto('zone', 'z1', { id: 0 }), null);
});

test('serializeMapExtraPhotos : exclut la première de la cible', () => {
  const rows = [
    { target_id: 'z1', id: 1, image_path: 'a.jpg' },
    { target_id: 'z1', id: 2, image_path: 'b.jpg' },
    { target_id: 'z1', id: 3, image_path: 'c.jpg' },
    { target_id: 'z2', id: 9, image_path: 'd.jpg' },
  ];
  const extras = serializeMapExtraPhotos('zone', 'z1', rows);
  assert.deepEqual(extras.map((p) => p.id), [2, 3]);
  assert.deepEqual(serializeMapExtraPhotos('zone', 'z2', rows), []);
});
