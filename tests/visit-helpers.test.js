'use strict';

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  sanitizeTargetType,
  sanitizeTargetId,
  visitMediaPublicImageUrl,
  serializeVisitMedia,
  resolveVisitEditorialBlocksForContentRow,
  pickNewestMapPhotoByTarget,
  serializeMapLeadPhoto,
  serializeMapExtraPhotos,
  parsePointsInput,
  normalizePoints,
  normalizeCoord,
  normalizeIdList,
  ratioPct,
} = require('../lib/visitContentHelpers');
const {
  VISIT_MASCOT_CATALOG_MODEL_META,
  visitMascotPackAssetRelativeDir,
  sanitizeMascotPackAssetFilename,
  buildDefaultVisitMascotPackJson,
  listVisitMascotCatalogTemplateIds,
  serializeVisitMascotPackRow,
  classifyMascotPackModuleError,
  mapVisitMascotPackSqlError,
  visitMascotSpriteLibraryRelativeDir,
  visitMascotSpriteLibraryAssetsApiPrefix,
  mascotPackAllowedFramesPrefixesForMap,
  mapVisitMascotSpriteLibSqlError,
  buildRenard2CatalogPackTemplate,
  buildVisitCatalogPackTemplate,
} = require('../lib/visitMascotPackHelpers');
const { resolveVisitEditorialBlocksForContent } = require('../lib/visitEditorialBlocks');

const PACK_UUID = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';

describe('visitContentHelpers — cibles de visite', () => {
  it('sanitizeTargetType accepte zone/marker (insensible à la casse, trim)', () => {
    assert.equal(sanitizeTargetType('zone'), 'zone');
    assert.equal(sanitizeTargetType('  MARKER '), 'marker');
  });

  it('sanitizeTargetType rejette les autres valeurs', () => {
    assert.equal(sanitizeTargetType('plant'), null);
    assert.equal(sanitizeTargetType(''), null);
    assert.equal(sanitizeTargetType(undefined), null);
  });

  it('sanitizeTargetId trim et renvoie null si vide', () => {
    assert.equal(sanitizeTargetId('  z1  '), 'z1');
    assert.equal(sanitizeTargetId('   '), null);
    assert.equal(sanitizeTargetId(null), null);
  });
});

describe('visitContentHelpers — médias de visite', () => {
  it('visitMediaPublicImageUrl privilégie le fichier local puis le lien externe', () => {
    assert.equal(visitMediaPublicImageUrl({ id: 7, image_path: 'visit_media/7.jpg' }), '/api/visit/media/7/data');
    assert.equal(visitMediaPublicImageUrl({ id: 7, image_path: null, image_url: ' https://x/y.jpg ' }), 'https://x/y.jpg');
    assert.equal(visitMediaPublicImageUrl(null), '');
  });

  it('serializeVisitMedia masque image_path et expose image_url public', () => {
    const out = serializeVisitMedia({ id: 7, image_path: 'visit_media/7.jpg', image_url: 'ignored', caption: 'c' });
    assert.equal(out.image_url, '/api/visit/media/7/data');
    assert.equal('image_path' in out, false);
    assert.equal(out.caption, 'c');
    assert.equal(serializeVisitMedia(null), null);
  });

  it('resolveVisitEditorialBlocksForContentRow mappe les colonnes SQL vers le résolveur canonique', () => {
    const row = {
      visit_body_json: null,
      visit_short_description: 'court',
      visit_details_title: 'Titre',
      visit_details_text: 'texte',
    };
    const media = [{ id: 4, image_url: 'https://x/y.jpg', caption: 'leg' }];
    assert.deepEqual(
      resolveVisitEditorialBlocksForContentRow(row, media),
      resolveVisitEditorialBlocksForContent({
        bodyJson: row.visit_body_json,
        shortDescription: row.visit_short_description,
        detailsTitle: row.visit_details_title,
        detailsText: row.visit_details_text,
        visitMedia: media,
      })
    );
    assert.deepEqual(resolveVisitEditorialBlocksForContentRow(null, []), []);
  });
});

describe('visitContentHelpers — photos galerie carte', () => {
  it('pickNewestMapPhotoByTarget garde la première ligne par cible et ignore les clés vides', () => {
    const rows = [
      { target_id: 'a', id: 1 },
      { target_id: 'a', id: 2 },
      { target_id: '', id: 3 },
      { target_id: 'b', id: 4 },
    ];
    const m = pickNewestMapPhotoByTarget(rows);
    assert.equal(m.size, 2);
    assert.equal(m.get('a').id, 1);
    assert.equal(m.get('b').id, 4);
  });

  it('pickNewestMapPhotoByTarget accepte un champ identifiant personnalisé', () => {
    const m = pickNewestMapPhotoByTarget([{ zone_id: 'z', id: 9 }], 'zone_id');
    assert.equal(m.get('z').id, 9);
  });

  it('serializeMapLeadPhoto renvoie null sans ligne ou avec id invalide', () => {
    assert.equal(serializeMapLeadPhoto('zone', 'z1', null), null);
    assert.equal(serializeMapLeadPhoto('zone', 'z1', { id: null }), null);
    assert.equal(serializeMapLeadPhoto('zone', 'z1', { id: 0 }), null);
    assert.equal(serializeMapLeadPhoto('zone', 'z1', { id: 'abc' }), null);
  });

  it('serializeMapLeadPhoto construit les URLs zone/marker (repli API sans chemin public)', () => {
    const zone = serializeMapLeadPhoto('zone', 'z1', { id: 5, image_path: null, caption: ' Légende ' });
    assert.deepEqual(zone, { id: 5, image_url: '/api/zones/z1/photos/5/data', thumb_url: null, caption: 'Légende' });
    const marker = serializeMapLeadPhoto('marker', 'm1', { id: 6, image_path: '', caption: '' });
    assert.equal(marker.image_url, '/api/map/markers/m1/photos/6/data');
    assert.equal(marker.thumb_url, null);
  });

  it('serializeMapExtraPhotos renvoie les photos après la première, pour la bonne cible', () => {
    const rows = [
      { target_id: 'z1', id: 1, image_path: null, caption: 'a' },
      { target_id: 'z1', id: 2, image_path: null, caption: 'b' },
      { target_id: 'z2', id: 3, image_path: null, caption: 'c' },
    ];
    const extras = serializeMapExtraPhotos('zone', 'z1', rows);
    assert.equal(extras.length, 1);
    assert.equal(extras[0].id, 2);
    assert.deepEqual(serializeMapExtraPhotos('zone', 'z2', rows), []);
    assert.deepEqual(serializeMapExtraPhotos('zone', 'z1', null), []);
  });
});

describe('visitContentHelpers — normalisations de payload', () => {
  it('parsePointsInput accepte tableau et chaîne JSON, sinon null', () => {
    const arr = [{ xp: 1, yp: 2 }];
    assert.equal(parsePointsInput(arr), arr);
    assert.deepEqual(parsePointsInput('[{"xp":1,"yp":2}]'), [{ xp: 1, yp: 2 }]);
    assert.equal(parsePointsInput('{invalid'), null);
    assert.equal(parsePointsInput(''), null);
    assert.equal(parsePointsInput(42), null);
  });

  it('normalizePoints exige au moins 3 points valides dans [0,100]', () => {
    const pts = [{ xp: 0, yp: 0 }, { xp: 50, yp: 50 }, { xp: 100, yp: 100 }];
    assert.deepEqual(normalizePoints(pts), pts);
    assert.equal(normalizePoints([{ xp: 0, yp: 0 }, { xp: 1, yp: 1 }]), null);
    assert.equal(normalizePoints([...pts.slice(0, 2), { xp: 101, yp: 5 }]), null);
    assert.equal(normalizePoints('non-json'), null);
  });

  it('normalizePoints filtre les points hors bornes ou non numériques', () => {
    const out = normalizePoints([
      { xp: 1, yp: 1 },
      { xp: -1, yp: 1 },
      { xp: 'x', yp: 1 },
      { xp: 2, yp: 2 },
      { xp: 3, yp: 3 },
    ]);
    assert.deepEqual(out, [{ xp: 1, yp: 1 }, { xp: 2, yp: 2 }, { xp: 3, yp: 3 }]);
  });

  it('normalizeCoord borne dans [0,100], sinon null', () => {
    assert.equal(normalizeCoord(0), 0);
    assert.equal(normalizeCoord('55.5'), 55.5);
    assert.equal(normalizeCoord(100), 100);
    assert.equal(normalizeCoord(-0.1), null);
    assert.equal(normalizeCoord(100.1), null);
    assert.equal(normalizeCoord('abc'), null);
  });

  it('normalizeIdList déduplique, trim et ignore les vides ; non-tableau → []', () => {
    assert.deepEqual(normalizeIdList([' a ', 'a', '', null, 'b']), ['a', 'b']);
    assert.deepEqual(normalizeIdList('a,b'), []);
    assert.deepEqual(normalizeIdList(undefined), []);
  });

  it('ratioPct calcule un pourcentage arrondi à 1 décimale, 0 si dénominateur invalide', () => {
    assert.equal(ratioPct(1, 3), 33.3);
    assert.equal(ratioPct(2, 2), 100);
    assert.equal(ratioPct(1, 0), 0);
    assert.equal(ratioPct(1, -5), 0);
    assert.equal(ratioPct(NaN, 10), 0);
  });
});

describe('visitMascotPackHelpers — chemins et noms de fichiers', () => {
  it('visitMascotPackAssetRelativeDir exige un UUID', () => {
    assert.equal(visitMascotPackAssetRelativeDir(PACK_UUID), `visit_mascot_packs/${PACK_UUID}`);
    assert.equal(visitMascotPackAssetRelativeDir('nope'), null);
    assert.equal(visitMascotPackAssetRelativeDir(''), null);
  });

  it('sanitizeMascotPackAssetFilename neutralise les traversées et caractères interdits', () => {
    assert.equal(sanitizeMascotPackAssetFilename('frame-1.png'), 'frame-1.png');
    assert.equal(sanitizeMascotPackAssetFilename('../../etc/passwd'), 'passwd');
    assert.equal(sanitizeMascotPackAssetFilename('a b.png'), null);
    assert.equal(sanitizeMascotPackAssetFilename(''), null);
    assert.equal(sanitizeMascotPackAssetFilename(`${'x'.repeat(129)}.png`), null);
  });

  it('visitMascotSpriteLibraryRelativeDir valide le map_id (64 max, [a-zA-Z0-9_-])', () => {
    assert.equal(visitMascotSpriteLibraryRelativeDir('foret'), 'visit_mascot_sprite_library/foret');
    assert.equal(visitMascotSpriteLibraryRelativeDir('a/b'), null);
    assert.equal(visitMascotSpriteLibraryRelativeDir('x'.repeat(65)), null);
    assert.equal(visitMascotSpriteLibraryRelativeDir(''), null);
  });

  it('visitMascotSpriteLibraryAssetsApiPrefix suit la même validation', () => {
    assert.equal(visitMascotSpriteLibraryAssetsApiPrefix('foret'), '/api/visit/mascot-sprite-library/foret/assets/');
    assert.equal(visitMascotSpriteLibraryAssetsApiPrefix('a/b'), null);
  });

  it('mascotPackAllowedFramesPrefixesForMap inclut les préfixes valides uniquement', () => {
    assert.deepEqual(mascotPackAllowedFramesPrefixesForMap('a/b', 'not-a-uuid'), ['/assets/mascots/']);
    assert.deepEqual(mascotPackAllowedFramesPrefixesForMap('foret', PACK_UUID), [
      '/assets/mascots/',
      `/api/visit/mascot-packs/${PACK_UUID}/assets/`,
      '/api/visit/mascot-sprite-library/foret/assets/',
    ]);
  });
});

describe('visitMascotPackHelpers — templates de packs', () => {
  it('listVisitMascotCatalogTemplateIds expose les clés du catalogue', () => {
    const ids = listVisitMascotCatalogTemplateIds();
    assert.deepEqual(ids, Object.keys(VISIT_MASCOT_CATALOG_MODEL_META));
    assert.ok(ids.includes('renard2-cut-spritesheet'));
    assert.ok(ids.includes('fox-backpack-spritesheet'));
  });

  it('buildDefaultVisitMascotPackJson normalise le slug et pose le label brouillon', () => {
    const pack = buildDefaultVisitMascotPackJson('Srv UUID!');
    assert.equal(pack.id, 'srv-uuid-');
    assert.equal(pack.label, 'Nouveau pack (brouillon)');
    assert.equal(pack.mascotPackVersion, 2);
    assert.equal(buildDefaultVisitMascotPackJson('').id, 'brouillon');
  });

  it('buildVisitCatalogPackTemplate route vers le bon template', () => {
    assert.deepEqual(
      buildVisitCatalogPackTemplate('renard2-cut-spritesheet', 'mon-pack'),
      buildRenard2CatalogPackTemplate('mon-pack')
    );
    const fox = buildVisitCatalogPackTemplate('fox-backpack-spritesheet', 'mon-pack');
    assert.equal(fox.fallbackSilhouette, 'backpackFox');
    assert.equal(fox.framesBase, '/assets/mascots/fox-backpack/cells/');
    const single = buildVisitCatalogPackTemplate('olu-spritesheet', 'mon-pack');
    assert.equal(single.label, 'OLU (modèle)');
    assert.deepEqual(single.stateFrames.idle.srcs, ['/assets/mascots/olu/olu-spritesheet.png']);
  });

  it('buildVisitCatalogPackTemplate renvoie null si id inconnu ou vide, slug de repli sinon', () => {
    assert.equal(buildVisitCatalogPackTemplate('inconnu', 'x'), null);
    assert.equal(buildVisitCatalogPackTemplate('', 'x'), null);
    assert.equal(buildVisitCatalogPackTemplate('renard2-cut-spritesheet', '').id, 'catalog-clone');
  });
});

describe('visitMascotPackHelpers — sérialisation et erreurs', () => {
  it('serializeVisitMascotPackRow parse pack_json et coerce is_published', () => {
    const row = {
      id: PACK_UUID,
      catalog_id: 'srv-x',
      map_id: 'foret',
      label: 'L',
      pack_json: '{"id":"srv-x"}',
      is_published: '1',
      created_at: 'c',
      updated_at: 'u',
    };
    const out = serializeVisitMascotPackRow(row);
    assert.deepEqual(out.pack, { id: 'srv-x' });
    assert.equal(out.is_published, true);
    assert.equal(serializeVisitMascotPackRow({ ...row, is_published: 0 }).is_published, false);
    assert.deepEqual(serializeVisitMascotPackRow({ ...row, pack_json: '{oops' }).pack, {});
  });

  it('classifyMascotPackModuleError catégorise les erreurs de chargement', () => {
    assert.equal(classifyMascotPackModuleError(new Error("Cannot find package 'zod'")).reason, 'missing_runtime_dependency');
    assert.equal(classifyMascotPackModuleError(new Error('visitMascotState.js missing')).reason, 'incomplete_lib_mirror');
    assert.equal(classifyMascotPackModuleError(new Error('Cannot find module x')).reason, 'validator_module_missing');
    assert.equal(classifyMascotPackModuleError(new Error('boom')).reason, 'validator_import_error');
    assert.equal(classifyMascotPackModuleError(null).reason, 'validator_import_error');
  });

  it('mapVisitMascotPackSqlError mappe 1146→503 et 1452→400, sinon null', () => {
    assert.equal(mapVisitMascotPackSqlError({ errno: 1146 }).status, 503);
    assert.equal(mapVisitMascotPackSqlError({ code: 'ER_NO_SUCH_TABLE' }).body.code, 'visit_mascot_packs_table_missing');
    assert.equal(mapVisitMascotPackSqlError({ errno: 1452 }).status, 400);
    assert.equal(mapVisitMascotPackSqlError({ errno: 1062 }), null);
    assert.equal(mapVisitMascotPackSqlError(null), null);
  });

  it('mapVisitMascotSpriteLibSqlError suit le même contrat pour la bibliothèque sprites', () => {
    assert.equal(mapVisitMascotSpriteLibSqlError({ errno: 1146 }).status, 503);
    assert.equal(
      mapVisitMascotSpriteLibSqlError({ code: 'ER_NO_REFERENCED_ROW_2' }).body.code,
      'visit_mascot_sprite_library_referential_integrity'
    );
    assert.equal(mapVisitMascotSpriteLibSqlError({ errno: 1062 }), null);
    assert.equal(mapVisitMascotSpriteLibSqlError(undefined), null);
  });
});
