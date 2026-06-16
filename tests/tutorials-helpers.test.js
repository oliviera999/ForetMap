'use strict';

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeString,
  detectImageExtensionFromDataUrl,
  extractUploadsRelativePath,
  validateTutorialCoverImageUrl,
  normalizeIdArray,
  resolveLinkedTaskMapId,
  isValidHttpUrl,
  sanitizeSortOrder,
  slugify,
  decodeHtmlEntities,
  htmlToPlainText,
  htmlToPdfBuffer,
  TUTORIAL_VIEW_IFRAME_LINK_SCRIPT,
  injectTutorialViewIframeLinkScript,
  toPublicTutorialRow,
  buildLinkedTaskLocationHint,
} = require('../lib/tutorialRouteHelpers');

describe('tutorialRouteHelpers (logique pure de routes/tutorials.js, sans DB)', () => {
  it('normalizeString : null/undefined → chaîne vide, sinon trim', () => {
    assert.equal(normalizeString(null), '');
    assert.equal(normalizeString(undefined), '');
    assert.equal(normalizeString('  abc  '), 'abc');
    assert.equal(normalizeString(42), '42');
  });

  it('detectImageExtensionFromDataUrl : jpeg → jpg, casse ignorée, refus hors data URL image', () => {
    assert.equal(detectImageExtensionFromDataUrl('data:image/jpeg;base64,AAAA'), 'jpg');
    assert.equal(detectImageExtensionFromDataUrl('data:image/PNG;base64,AAAA'), 'png');
    assert.equal(detectImageExtensionFromDataUrl('data:image/webp;base64,AAAA'), 'webp');
    assert.equal(detectImageExtensionFromDataUrl('data:text/plain;base64,AAAA'), null);
    assert.equal(detectImageExtensionFromDataUrl('https://example.com/a.png'), null);
    assert.equal(detectImageExtensionFromDataUrl(''), null);
  });

  it('extractUploadsRelativePath : chemin local, URL absolue /uploads/, sinon null', () => {
    assert.equal(
      extractUploadsRelativePath('/uploads/tutorials/3/cover.png'),
      'tutorials/3/cover.png',
    );
    assert.equal(extractUploadsRelativePath('https://foretmap.fr/uploads/a/b.jpg'), 'a/b.jpg');
    assert.equal(extractUploadsRelativePath('https://foretmap.fr/autre/b.jpg'), null);
    assert.equal(extractUploadsRelativePath('pas-une-url'), null);
    assert.equal(extractUploadsRelativePath(''), null);
  });

  it('validateTutorialCoverImageUrl : vide → null (valide)', () => {
    assert.equal(validateTutorialCoverImageUrl(''), null);
    assert.equal(validateTutorialCoverImageUrl(null), null);
    assert.equal(validateTutorialCoverImageUrl('   '), null);
  });

  it('validateTutorialCoverImageUrl : chemin /uploads/ avec extension image accepté, sans extension refusé', () => {
    assert.equal(validateTutorialCoverImageUrl('/uploads/tutorials/1/cover.webp'), null);
    assert.match(
      String(validateTutorialCoverImageUrl('/uploads/tutorials/1/cover')),
      /chemin local invalide/,
    );
  });

  it('validateTutorialCoverImageUrl : URL non parsable refusée', () => {
    assert.match(String(validateTutorialCoverImageUrl('pas une url')), /URL invalide/);
  });

  it('validateTutorialCoverImageUrl : HTTPS exigé sauf localhost en dev', () => {
    assert.match(String(validateTutorialCoverImageUrl('http://example.com/a.png')), /HTTPS/);
    assert.equal(validateTutorialCoverImageUrl('http://localhost:3000/a.png'), null);
    assert.equal(validateTutorialCoverImageUrl('http://127.0.0.1/a.jpg'), null);
  });

  it('validateTutorialCoverImageUrl : image directe ou Special:FilePath exigée', () => {
    assert.equal(validateTutorialCoverImageUrl('https://example.com/img/photo.JPG'), null);
    assert.equal(
      validateTutorialCoverImageUrl(
        'https://commons.wikimedia.org/wiki/Special:FilePath/Quercus.jpg',
      ),
      null,
    );
    assert.match(
      String(validateTutorialCoverImageUrl('https://example.com/page.html')),
      /image directe/,
    );
  });

  it('normalizeIdArray : dédoublonne, trim, filtre les vides, non-tableau → []', () => {
    assert.deepEqual(normalizeIdArray([' a ', 'a', 1, null, '', 'b']), ['a', '1', 'b']);
    assert.deepEqual(normalizeIdArray('a'), []);
    assert.deepEqual(normalizeIdArray(undefined), []);
  });

  it('resolveLinkedTaskMapId : carte unique des liens, sinon map_id de la tâche, sinon premier lien', () => {
    const task = { map_id: 'map-task' };
    assert.equal(resolveLinkedTaskMapId(task, [{ map_id: 'm1' }], [{ map_id: 'm1' }]), 'm1');
    assert.equal(resolveLinkedTaskMapId(task, [], []), 'map-task');
    assert.equal(resolveLinkedTaskMapId({ map_id: null }, [], []), null);
    assert.equal(resolveLinkedTaskMapId(task, [{ map_id: 'm1' }], [{ map_id: 'm2' }]), 'm1');
  });

  it('isValidHttpUrl : http(s) uniquement', () => {
    assert.equal(isValidHttpUrl('https://example.com'), true);
    assert.equal(isValidHttpUrl('http://example.com'), true);
    assert.equal(isValidHttpUrl('ftp://example.com'), false);
    assert.equal(isValidHttpUrl('javascript:alert(1)'), false);
    assert.equal(isValidHttpUrl(''), false);
    assert.equal(isValidHttpUrl('pas une url'), false);
  });

  it('sanitizeSortOrder : entier ≥ 0, sinon 0', () => {
    assert.equal(sanitizeSortOrder(5), 5);
    assert.equal(sanitizeSortOrder('12'), 12);
    assert.equal(sanitizeSortOrder(-3), 0);
    assert.equal(sanitizeSortOrder('abc'), 0);
    assert.equal(sanitizeSortOrder(undefined), 0);
  });

  it('slugify : accents retirés, minuscules, séparateurs normalisés', () => {
    assert.equal(slugify('Élagage des chênes — été 2026'), 'elagage-des-chenes-ete-2026');
    assert.equal(slugify('  Forêt & Cie !!'), 'foret-cie');
  });

  it('slugify : vide → "tuto", longueur plafonnée à 180', () => {
    assert.equal(slugify(''), 'tuto');
    assert.equal(slugify('???'), 'tuto');
    assert.equal(slugify('a'.repeat(300)).length, 180);
  });

  it('decodeHtmlEntities : entités usuelles décodées', () => {
    assert.equal(
      decodeHtmlEntities('a&nbsp;&amp;&nbsp;b &lt;c&gt; &quot;d&quot; &#39;e&#39;'),
      'a & b <c> "d" \'e\'',
    );
    assert.equal(decodeHtmlEntities(null), '');
  });

  it('htmlToPlainText : retire script/style, garde le texte', () => {
    const html = '<p>Avant</p><script>alert("x")</script><style>.a{color:red}</style><p>Après</p>';
    // L'espace résiduel après le saut de ligne vient du remplacement des balises par ' '.
    assert.equal(htmlToPlainText(html), 'Avant\n Après');
  });

  it('htmlToPlainText : listes en puces, entités décodées, blancs compactés', () => {
    const html = '<ul><li>Chêne &amp; hêtre</li><li>Frêne</li></ul>\r\n\n\n<div>Fin   ici</div>';
    assert.equal(htmlToPlainText(html), '• Chêne & hêtre\n• Frêne\n\n Fin ici');
    assert.equal(htmlToPlainText(''), '');
  });

  it('injectTutorialViewIframeLinkScript : insère le script avant </body>', () => {
    const out = injectTutorialViewIframeLinkScript('<html><body><p>x</p></body></html>');
    assert.equal(out, `<html><body><p>x</p>${TUTORIAL_VIEW_IFRAME_LINK_SCRIPT}</body></html>`);
  });

  it('injectTutorialViewIframeLinkScript : sans </body>, ajoute en fin ; vide inchangé', () => {
    assert.equal(
      injectTutorialViewIframeLinkScript('<p>x</p>'),
      `<p>x</p>${TUTORIAL_VIEW_IFRAME_LINK_SCRIPT}`,
    );
    assert.equal(injectTutorialViewIframeLinkScript(''), '');
    assert.equal(injectTutorialViewIframeLinkScript('   '), '   ');
  });

  it('toPublicTutorialRow : projection complète d’une ligne SQL', () => {
    const row = {
      id: 7,
      title: 'Tuto',
      slug: 'tuto',
      type: 'html',
      summary: null,
      cover_image_url: '',
      source_url: null,
      source_file_path: null,
      is_active: '1',
      sort_order: '3',
      created_at: '2026-01-01',
      updated_at: null,
      linked_tasks_count: '2',
      html_content: '<p>privé</p>',
    };
    const out = toPublicTutorialRow(
      row,
      [{ id: 'z1', name: 'Clairière', map_id: 'm1', extra: 'x' }],
      [{ id: 'k1', label: 'Repère', map_id: 'm1' }],
    );
    assert.deepEqual(out, {
      id: 7,
      title: 'Tuto',
      slug: 'tuto',
      type: 'html',
      summary: '',
      cover_image_url: null,
      source_url: null,
      source_file_path: null,
      is_active: true,
      sort_order: 3,
      created_at: '2026-01-01',
      updated_at: null,
      linked_tasks_count: 2,
      zone_ids: ['z1'],
      marker_ids: ['k1'],
      zones_linked: [{ id: 'z1', name: 'Clairière', map_id: 'm1' }],
      markers_linked: [{ id: 'k1', label: 'Repère', map_id: 'm1' }],
    });
    assert.equal('html_content' in out, false);
  });

  it('toPublicTutorialRow : défauts sûrs (inactif, listes absentes → vides)', () => {
    const out = toPublicTutorialRow(
      { id: 1, title: 't', slug: 's', type: 'link', is_active: 0 },
      null,
      null,
    );
    assert.equal(out.is_active, false);
    assert.equal(out.sort_order, 0);
    assert.equal(out.linked_tasks_count, 0);
    assert.deepEqual(out.zone_ids, []);
    assert.deepEqual(out.markers_linked, []);
  });

  it('buildLinkedTaskLocationHint : zone · repère, valeurs seules, vide', () => {
    assert.equal(buildLinkedTaskLocationHint(' Clairière ', 'Repère 3'), 'Clairière · Repère 3');
    assert.equal(buildLinkedTaskLocationHint('Clairière', ''), 'Clairière');
    assert.equal(buildLinkedTaskLocationHint(null, 'Repère 3'), 'Repère 3');
    assert.equal(buildLinkedTaskLocationHint(null, undefined), '');
  });

  it('htmlToPdfBuffer : produit un PDF en mémoire (en-tête %PDF)', async () => {
    const buf = await htmlToPdfBuffer('Mon tuto', '<p>Contenu &amp; suite</p>');
    assert.ok(Buffer.isBuffer(buf));
    assert.ok(buf.length > 500);
    assert.equal(buf.subarray(0, 5).toString('ascii'), '%PDF-');
  });

  it('htmlToPdfBuffer : HTML vide → PDF valide quand même', async () => {
    const buf = await htmlToPdfBuffer(null, '');
    assert.equal(buf.subarray(0, 5).toString('ascii'), '%PDF-');
  });
});
