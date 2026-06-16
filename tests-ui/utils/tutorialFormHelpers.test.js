import { describe, test, expect } from 'vitest';
import {
  toggleTutorialFormLocation,
  applyTutorialFormMapChange,
  tutorialFormFromDetail,
  buildTutorialSavePayload,
} from '../../src/utils/tutorialFormHelpers.js';

describe('toggleTutorialFormLocation', () => {
  test('ajoute un id absent (normalisé en chaîne)', () => {
    const form = { zone_ids: ['1'], marker_ids: [] };
    expect(toggleTutorialFormLocation(form, 'zone_ids', 2).zone_ids).toEqual(['1', '2']);
  });
  test('retire un id présent et déduplique la liste courante', () => {
    const form = { zone_ids: [1, '1', '3'] };
    expect(toggleTutorialFormLocation(form, 'zone_ids', '1').zone_ids).toEqual(['3']);
  });
  test('id vide → même référence (pas de mise à jour)', () => {
    const form = { zone_ids: ['1'] };
    expect(toggleTutorialFormLocation(form, 'zone_ids', '')).toBe(form);
    expect(toggleTutorialFormLocation(form, 'zone_ids', '   ')).toBe(form);
    expect(toggleTutorialFormLocation(form, 'zone_ids', null)).toBe(form);
  });
  test('ne mute pas le formulaire d’origine', () => {
    const form = { marker_ids: ['m1'] };
    toggleTutorialFormLocation(form, 'marker_ids', 'm2');
    expect(form.marker_ids).toEqual(['m1']);
  });
});

describe('applyTutorialFormMapChange', () => {
  const zones = [
    { id: 'z1', map_id: 'foret' },
    { id: 'z2', map_id: 'jardin' },
  ];
  const markers = [{ id: 'm1', map_id: 'foret' }];
  test('garde uniquement les lieux de la nouvelle carte', () => {
    const form = { map_id: '', zone_ids: ['z1', 'z2'], marker_ids: ['m1'] };
    const next = applyTutorialFormMapChange(form, 'jardin', zones, markers);
    expect(next.map_id).toBe('jardin');
    expect(next.zone_ids).toEqual(['z2']);
    expect(next.marker_ids).toEqual([]);
  });
  test('carte vide (« toutes ») : garde les lieux existants, retire les ids inconnus', () => {
    const form = { map_id: 'foret', zone_ids: ['z1', 'fantome'], marker_ids: ['m1'] };
    const next = applyTutorialFormMapChange(form, '', zones, markers);
    expect(next.zone_ids).toEqual(['z1']);
    expect(next.marker_ids).toEqual(['m1']);
  });
  test('comparaison d’ids tolérante au type (nombre vs chaîne)', () => {
    const next = applyTutorialFormMapChange(
      { zone_ids: [7], marker_ids: [] },
      'foret',
      [{ id: '7', map_id: 'foret' }],
      [],
    );
    expect(next.zone_ids).toEqual([7]);
  });
});

describe('tutorialFormFromDetail', () => {
  test('hydrate les champs avec défauts et normalise les ids', () => {
    const form = tutorialFormFromDetail(
      { id: 5, title: 'Tuto', zone_ids: [1, ' ', null, '2 '], marker_ids: undefined },
      'foret',
    );
    expect(form).toMatchObject({
      id: 5,
      title: 'Tuto',
      summary: '',
      type: 'html',
      html_content: '',
      source_url: '',
      source_file_path: '',
      sort_order: 0,
      is_active: true,
      map_id: 'foret',
    });
    expect(form.zone_ids).toEqual(['1', '2']);
    expect(form.marker_ids).toEqual([]);
  });
  test('carte inférée depuis la 1re zone liée, puis 1er repère, puis activeMapId', () => {
    expect(
      tutorialFormFromDetail(
        { zones_linked: [{ map_id: 'jardin' }], markers_linked: [{ map_id: 'foret' }] },
        'x',
      ).map_id,
    ).toBe('jardin');
    expect(tutorialFormFromDetail({ markers_linked: [{ map_id: 'foret' }] }, 'x').map_id).toBe(
      'foret',
    );
    expect(tutorialFormFromDetail({}, 'foret').map_id).toBe('foret');
    expect(tutorialFormFromDetail({}, undefined).map_id).toBe('');
  });
  test('is_active false conservé', () => {
    expect(tutorialFormFromDetail({ is_active: false }, '').is_active).toBe(false);
  });
});

describe('buildTutorialSavePayload', () => {
  test('type html : html_content gardé, source_url annulée, titre trimé', () => {
    const payload = buildTutorialSavePayload({
      title: '  Mon tuto ',
      summary: 'Résumé',
      type: 'html',
      html_content: '<h1>ok</h1>',
      source_url: 'https://ignoree',
      source_file_path: '',
      sort_order: '4',
      is_active: 1,
      zone_ids: ['1', 1, ' '],
      marker_ids: null,
    });
    expect(payload).toEqual({
      title: 'Mon tuto',
      summary: 'Résumé',
      type: 'html',
      html_content: '<h1>ok</h1>',
      source_url: null,
      source_file_path: null,
      sort_order: 4,
      is_active: true,
      zone_ids: ['1'],
      marker_ids: [],
    });
  });
  test('type link : source_url gardée, html_content annulé', () => {
    const payload = buildTutorialSavePayload({
      title: 'Lien',
      type: 'link',
      html_content: '<p>ignoré</p>',
      source_url: 'https://exemple.fr',
      sort_order: 'abc',
    });
    expect(payload.html_content).toBeNull();
    expect(payload.source_url).toBe('https://exemple.fr');
    expect(payload.sort_order).toBe(0);
    expect(payload.is_active).toBe(false);
  });
});
