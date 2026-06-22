import { describe, test, expect } from 'vitest';
import { buildVisitMascotCatalogExtrasFromContent } from '../../src/utils/visitMascotPackExtras.js';

function validServerPack(id = 'srv-1') {
  return {
    catalog_id: id,
    label: 'Gnome importé',
    pack: {
      mascotPackVersion: 2,
      id,
      label: 'Gnome importé',
      renderer: 'sprite_cut',
      framesBase: `/api/visit/mascot-packs/${id}/assets/`,
      frameWidth: 150,
      frameHeight: 180,
      fallbackSilhouette: 'gnome',
      stateFrames: { idle: { files: ['cell-r1-c0.png'], fps: 2 } },
    },
  };
}

describe('buildVisitMascotCatalogExtrasFromContent', () => {
  test('construit une entrée catalogue sprite_cut par pack valide', () => {
    const extras = buildVisitMascotCatalogExtrasFromContent([validServerPack('srv-abc')]);
    expect(extras).toHaveLength(1);
    expect(extras[0].id).toBe('srv-abc');
    expect(extras[0].renderer).toBe('sprite_cut');
    expect(extras[0].fallbackSilhouette).toBe('gnome');
    expect(extras[0].spriteCut.stateFrames.idle.srcs).toEqual([
      '/api/visit/mascot-packs/srv-abc/assets/cell-r1-c0.png',
    ]);
  });

  test('ignore les lignes sans catalog_id ou pack invalide', () => {
    const extras = buildVisitMascotCatalogExtrasFromContent([
      { catalog_id: '', label: 'x', pack: validServerPack().pack }, // pas de catalog_id
      { catalog_id: 'srv-2', label: 'y', pack: { renderer: 'sprite_cut' } }, // pack invalide
      validServerPack('srv-ok'),
    ]);
    expect(extras.map((e) => e.id)).toEqual(['srv-ok']);
  });

  test('entrée non-tableau → []', () => {
    expect(buildVisitMascotCatalogExtrasFromContent(null)).toEqual([]);
    expect(buildVisitMascotCatalogExtrasFromContent(undefined)).toEqual([]);
  });
});
