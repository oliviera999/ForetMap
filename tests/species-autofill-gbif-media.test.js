require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeReusableLicense,
  isHttpsDirectImageUrl,
  extractGbifOccurrencePhotos,
  fetchGbifMediaSource,
  MAX_PHOTOS,
} = require('../lib/speciesAutofillGbifMedia');

test('normalizeReusableLicense accepte CC0 / CC BY / CC BY-SA et refuse NC', () => {
  assert.equal(normalizeReusableLicense('CC0'), 'CC0');
  assert.equal(
    normalizeReusableLicense('http://creativecommons.org/publicdomain/zero/1.0/'),
    'CC0',
  );
  assert.equal(
    normalizeReusableLicense('https://creativecommons.org/licenses/by/4.0/'),
    'CC BY 4.0',
  );
  assert.equal(
    normalizeReusableLicense('https://creativecommons.org/licenses/by-sa/3.0/'),
    'CC BY-SA 3.0',
  );
  assert.equal(normalizeReusableLicense('cc-by-4.0'), 'CC BY 4.0');
  assert.equal(normalizeReusableLicense('https://creativecommons.org/licenses/by-nc/4.0/'), null);
  assert.equal(normalizeReusableLicense('All rights reserved'), null);
  assert.equal(normalizeReusableLicense(''), null);
});

test('isHttpsDirectImageUrl exige HTTPS + extension image', () => {
  assert.equal(
    isHttpsDirectImageUrl('https://inaturalist-open-data.s3.amazonaws.com/photos/1/medium.jpg'),
    true,
  );
  assert.equal(isHttpsDirectImageUrl('http://example.org/a.jpg'), false);
  assert.equal(isHttpsDirectImageUrl('https://example.org/page'), false);
  assert.equal(isHttpsDirectImageUrl('https://example.org/a.png?size=large'), true);
});

test('extractGbifOccurrencePhotos filtre licence / URL et privilégie HUMAN_OBSERVATION', () => {
  const { photos, warnings, skippedLicense } = extractGbifOccurrencePhotos([
    {
      key: 11,
      basisOfRecord: 'PRESERVED_SPECIMEN',
      license: 'https://creativecommons.org/licenses/by/4.0/',
      media: [
        {
          type: 'StillImage',
          identifier: 'https://example.org/herbarium.jpg',
          rightsHolder: 'Muséum',
          license: 'https://creativecommons.org/licenses/by/4.0/',
        },
      ],
    },
    {
      key: 22,
      basisOfRecord: 'HUMAN_OBSERVATION',
      references: 'https://www.inaturalist.org/observations/1',
      media: [
        {
          type: 'StillImage',
          identifier: 'https://inaturalist-open-data.s3.amazonaws.com/photos/9/original.jpg',
          creator: 'Alice',
          rightsHolder: 'Alice',
          license: 'https://creativecommons.org/licenses/by/4.0/',
          references: 'https://www.inaturalist.org/photos/9',
        },
        {
          type: 'StillImage',
          identifier: 'https://example.org/nc.jpg',
          license: 'https://creativecommons.org/licenses/by-nc/4.0/',
          rightsHolder: 'Bob',
        },
        {
          type: 'StillImage',
          identifier: 'https://example.org/no-ext',
          license: 'https://creativecommons.org/licenses/by/4.0/',
          rightsHolder: 'Carol',
        },
      ],
    },
  ]);
  assert.equal(photos.length, 2);
  assert.equal(
    photos[0].url,
    'https://inaturalist-open-data.s3.amazonaws.com/photos/9/original.jpg',
  );
  assert.equal(photos[0].license, 'CC BY 4.0');
  assert.equal(photos[0].credit, 'Alice');
  assert.equal(photos[0].source, 'gbif_media');
  assert.ok(photos[0].confidence > photos[1].confidence);
  assert.equal(photos[1].url, 'https://example.org/herbarium.jpg');
  assert.ok(skippedLicense >= 1);
  assert.ok(warnings.some((w) => /occurrences/i.test(w)));
});

test('extractGbifOccurrencePhotos borne le nombre de photos', () => {
  const results = [];
  for (let i = 0; i < 12; i += 1) {
    results.push({
      key: i,
      basisOfRecord: 'HUMAN_OBSERVATION',
      media: [
        {
          type: 'StillImage',
          identifier: `https://example.org/p${i}.jpg`,
          license: 'https://creativecommons.org/licenses/by/4.0/',
          rightsHolder: `Auteur ${i}`,
        },
      ],
    });
  }
  const { photos } = extractGbifOccurrencePhotos(results);
  assert.equal(photos.length, MAX_PHOTOS);
});

test('fetchGbifMediaSource construit un pack (fetch mock)', async () => {
  const fetchJson = async (url) => {
    assert.match(String(url), /occurrence\/search/);
    assert.match(String(url), /taxon_key=2874515/);
    assert.match(String(url), /media_type=StillImage/);
    return {
      results: [
        {
          key: 99,
          basisOfRecord: 'HUMAN_OBSERVATION',
          media: [
            {
              type: 'StillImage',
              identifier: 'https://example.org/live.jpg',
              license: 'https://creativecommons.org/licenses/by-sa/4.0/',
              rightsHolder: 'Dana',
            },
          ],
        },
      ],
    };
  };
  const pack = await fetchGbifMediaSource(2874515, fetchJson, {});
  assert.equal(pack.source, 'gbif_media');
  assert.equal(pack.photos.length, 1);
  assert.equal(pack.photos[0].license, 'CC BY-SA 4.0');
  assert.match(pack.source_url, /occurrence\/gallery/);
});

test('fetchGbifMediaSource retourne null si usageKey invalide', async () => {
  assert.equal(await fetchGbifMediaSource(0, async () => ({}), {}), null);
  assert.equal(await fetchGbifMediaSource('x', async () => ({}), {}), null);
});
