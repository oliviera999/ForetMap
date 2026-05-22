import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeDefaultVisitMediaImageBlocks,
  resolveVisitEditorialBlocksForContent,
} from '../lib/visitEditorialBlocks.js';
import { resolveEditorialBlocksForEditor } from '../src/utils/visitEditorialBlocks.js';

describe('visitEditorialBlocks', () => {
  it('mergeDefaultVisitMediaImageBlocks ajoute les photos visit_media absentes des blocs image', () => {
    const blocks = [
      { id: 'p1', type: 'paragraph', markdown: 'Intro' },
    ];
    const visitMedia = [
      { id: 10, caption: 'Photo A' },
      { id: 11, caption: 'Photo B' },
    ];
    const merged = mergeDefaultVisitMediaImageBlocks(blocks, visitMedia);
    assert.equal(merged.length, 3);
    assert.equal(merged[0].type, 'paragraph');
    assert.equal(merged[1].type, 'image');
    assert.deepEqual(merged[1].media_ids, [10]);
    assert.equal(merged[1].size, 'lg');
    assert.equal(merged[2].type, 'image');
    assert.deepEqual(merged[2].media_ids, [11]);
    assert.equal(merged[2].size, 'md');
  });

  it('mergeDefaultVisitMediaImageBlocks ne duplique pas une photo déjà dans un bloc', () => {
    const blocks = [
      { id: 'img1', type: 'image', media_ids: [10], layout: 'single', size: 'md', align: 'center', caption: '' },
    ];
    const visitMedia = [{ id: 10 }, { id: 11 }];
    const merged = mergeDefaultVisitMediaImageBlocks(blocks, visitMedia);
    assert.equal(merged.length, 2);
    assert.deepEqual(merged[1].media_ids, [11]);
  });

  it('resolveVisitEditorialBlocksForContent : body_json vide → legacy complet', () => {
    const out = resolveVisitEditorialBlocksForContent({
      bodyJson: null,
      shortDescription: 'Accroche',
      detailsTitle: 'Détails',
      detailsText: 'Suite',
      visitMedia: [{ id: 5, caption: 'Vue' }],
    });
    assert.ok(out.some((b) => b.type === 'paragraph' && b.markdown === 'Accroche'));
    assert.ok(out.some((b) => b.type === 'image' && b.media_ids[0] === 5));
    assert.ok(out.some((b) => b.type === 'heading'));
  });

  it('resolveVisitEditorialBlocksForContent : texte sans bloc image → fusion des photos', () => {
    const bodyJson = JSON.stringify([{ type: 'paragraph', markdown: 'Seul texte' }]);
    const out = resolveVisitEditorialBlocksForContent({
      bodyJson,
      shortDescription: '',
      detailsTitle: '',
      detailsText: '',
      visitMedia: [{ id: 7 }, { id: 8 }],
    });
    assert.equal(out.filter((b) => b.type === 'image').length, 2);
    assert.equal(out[0].type, 'paragraph');
  });

  it('resolveEditorialBlocksForEditor conserve les paragraphes en ajoutant les photos par défaut', () => {
    const out = resolveEditorialBlocksForEditor(
      [{ type: 'paragraph', markdown: 'Texte carte' }],
      { visit_body_json: JSON.stringify([{ type: 'paragraph', markdown: 'Texte carte' }]) },
      [{ id: 17, caption: 'Photo carte' }],
    );
    assert.equal(out[0].type, 'paragraph');
    assert.equal(out[0].markdown, 'Texte carte');
    assert.equal(out[1].type, 'image');
    assert.deepEqual(out[1].media_ids, [17]);
  });

  it('resolveVisitEditorialBlocksForContent : blocs image enregistrés → pas de fusion', () => {
    const bodyJson = JSON.stringify([
      { type: 'paragraph', markdown: 'Texte' },
      { type: 'image', media_ids: [7], layout: 'single', size: 'md', align: 'center', caption: '' },
    ]);
    const out = resolveVisitEditorialBlocksForContent({
      bodyJson,
      shortDescription: '',
      detailsTitle: '',
      detailsText: '',
      visitMedia: [{ id: 7 }, { id: 8 }],
    });
    assert.equal(out.filter((b) => b.type === 'image').length, 1);
    assert.deepEqual(out.find((b) => b.type === 'image').media_ids, [7]);
  });
});
