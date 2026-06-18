'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseZoneMusicInput,
  serializeZoneMusicRow,
  normalizeMusicUrlList,
} = require('../lib/glZoneMusic.js');

const urlA = '/uploads/media-library/audio/2026/05/track-a.mp3';
const urlB = '/uploads/media-library/audio/2026/05/track-b.mp3';

test('parseZoneMusicInput: musicUrls valide une playlist', () => {
  const parsed = parseZoneMusicInput({
    musicUrls: [urlA, urlB],
    musicVolume: 0.5,
  });
  assert.equal(parsed.error, undefined);
  assert.deepEqual(parsed.musicUrls, [urlA, urlB]);
  assert.equal(parsed.musicUrl, urlA);
  assert.equal(parsed.musicVolume, 0.5);
  assert.equal(parsed.hasMusicUrls, true);
});

test('parseZoneMusicInput: musicUrl legacy devient une playlist à une piste', () => {
  const parsed = parseZoneMusicInput({ musicUrl: urlA });
  assert.deepEqual(parsed.musicUrls, [urlA]);
  assert.equal(parsed.musicUrl, urlA);
});

test('parseZoneMusicInput: musicUrls vide efface la musique', () => {
  const parsed = parseZoneMusicInput({ musicUrls: [] });
  assert.deepEqual(parsed.musicUrls, []);
  assert.equal(parsed.musicUrl, null);
});

test('parseZoneMusicInput: refuse une playlist invalide', () => {
  const parsed = parseZoneMusicInput({
    musicUrls: [urlA, '/uploads/media-library/image/2026/05/not-audio.mp3'],
  });
  assert.match(parsed.error, /invalide/i);
});

test('serializeZoneMusicRow: préfère music_urls_json avec repli legacy', () => {
  const fromJson = serializeZoneMusicRow({
    music_url: urlA,
    music_urls_json: JSON.stringify([urlA, urlB]),
    music_volume: 0.8,
  });
  assert.deepEqual(fromJson.musicUrls, [urlA, urlB]);
  assert.equal(fromJson.musicUrl, urlA);
  assert.equal(fromJson.musicVolume, 0.8);

  const legacy = serializeZoneMusicRow({
    music_url: urlA,
    music_urls_json: null,
    music_volume: 0.6,
  });
  assert.deepEqual(legacy.musicUrls, [urlA]);
});

test('normalizeMusicUrlList: ignore les entrées vides', () => {
  assert.deepEqual(normalizeMusicUrlList([urlA, '', '  ', urlB]), [urlA, urlB]);
});
