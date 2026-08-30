import { describe, test, expect } from 'vitest';
import {
  buildZoneName,
  buildZonePayload,
  computeZoneVisitImageBlocks,
  isZoneVisitBodyReadyForSave,
  mergeZoneListIntoDetail,
  zoneTaskMapId,
} from '../../src/utils/zoneModalForm.js';

describe('buildZoneName', () => {
  test('préfixe l’emoji fourni au nom nettoyé', () => {
    expect(buildZoneName('Potager Est', '🌱', { markerEmojis: ['📍'] })).toBe('🌱 Potager Est');
  });

  test('emoji vide → repli sur markerEmojis[0] puis 📍', () => {
    expect(buildZoneName('Verger', '', { markerEmojis: ['🌳'] })).toBe('🌳 Verger');
    expect(buildZoneName('Verger', '   ', { markerEmojis: [] })).toBe('📍 Verger');
  });

  test('retire un emoji déjà présent en tête du nom saisi avant de re-préfixer', () => {
    expect(buildZoneName('🌳 Verger', '🌱', { markerEmojis: [], emojiParsingList: ['🌳'] })).toBe(
      '🌱 Verger',
    );
  });

  test('nom vide (ou réduit à un emoji parsé) → null pour bloquer la sauvegarde', () => {
    expect(buildZoneName('', '🌱', {})).toBe(null);
    expect(buildZoneName('   ', '🌱', {})).toBe(null);
    expect(buildZoneName('🌳', '🌱', { emojiParsingList: ['🌳'] })).toBe(null);
  });
});

describe('buildZonePayload', () => {
  test('mappe les champs de formulaire, force current_plant vide et normalise les blocs', () => {
    const form = {
      livingBeings: ['Tomate'],
      stage: 'growing',
      zoneColor: '#abc',
      desc: 'desc',
      visitSubtitle: 'st',
      visitShortDesc: 'sd',
      visitDetailsTitle: 'dt',
      visitDetailsText: 'dtx',
    };
    const payload = buildZonePayload('🌱 Potager', form, []);
    expect(payload.name).toBe('🌱 Potager');
    expect(payload.current_plant).toBe('');
    expect(payload.living_beings).toEqual(['Tomate']);
    expect(payload.stage).toBe('growing');
    expect(payload.color).toBe('#abc');
    expect(payload.description).toBe('desc');
    expect(payload.visit_subtitle).toBe('st');
    expect(payload.visit_short_description).toBe('sd');
    expect(payload.visit_details_title).toBe('dt');
    expect(payload.visit_details_text).toBe('dtx');
    expect(Array.isArray(payload.visit_editorial_blocks)).toBe(true);
  });

  test('omitVisitEditorialBlocks : n’envoie pas la clé (PUT conserve body_json)', () => {
    const form = {
      livingBeings: [],
      stage: 'empty',
      special: false,
      zoneColor: '#abc',
      desc: '',
      visitSubtitle: 'st',
      visitShortDesc: '',
      visitDetailsTitle: 'Détails',
      visitDetailsText: '',
    };
    const payload = buildZonePayload('🌱 Potager', form, [], { omitVisitEditorialBlocks: true });
    expect(payload.visit_editorial_blocks).toBeUndefined();
    expect(payload.visit_subtitle).toBe('st');
  });
});

describe('isZoneVisitBodyReadyForSave / mergeZoneListIntoDetail', () => {
  const body = JSON.stringify([{ type: 'paragraph', markdown: 'Texte visite' }]);

  test('prêt si la liste n’annonce pas de corps visite', () => {
    expect(isZoneVisitBodyReadyForSave({ has_visit_body: false }, {})).toBe(true);
  });

  test('pas prêt tant que le détail n’a pas le JSON (liste allégée)', () => {
    expect(
      isZoneVisitBodyReadyForSave({ has_visit_body: true, visit_body_json: undefined }, {}),
    ).toBe(false);
  });

  test('prêt dès que le détail a chargé le corps', () => {
    expect(isZoneVisitBodyReadyForSave({ has_visit_body: true }, { visit_body_json: body })).toBe(
      true,
    );
  });

  test('merge : un poll liste ne doit pas effacer un détail déjà chargé', () => {
    const detail = { id: 'z1', name: 'A', visit_body_json: body, has_visit_body: true };
    const list = { id: 'z1', name: 'A+', visit_body_json: undefined, has_visit_body: true };
    expect(mergeZoneListIntoDetail(detail, list)).toEqual({
      ...list,
      visit_body_json: body,
    });
  });

  test('merge : autre zone → on prend la liste telle quelle', () => {
    const detail = { id: 'z1', visit_body_json: body };
    const list = { id: 'z2', has_visit_body: true };
    expect(mergeZoneListIntoDetail(detail, list)).toEqual(list);
  });
});

describe('réexports mutualisés depuis markerModalForm', () => {
  test('zoneTaskMapId : priorité résolu > map_id > zone_map_id > marker_map_id', () => {
    expect(zoneTaskMapId({ map_id_resolved: 1, map_id: 2 })).toBe(1);
    expect(zoneTaskMapId({ marker_map_id: 4 })).toBe(4);
    expect(zoneTaskMapId({})).toBe(null);
  });

  test('computeZoneVisitImageBlocks : corps vide → blocs par défaut depuis les médias', () => {
    const blocks = computeZoneVisitImageBlocks('', [{ id: 5, caption: ' Vue ' }]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      id: 'default-img-5',
      media_ids: [5],
      size: 'lg',
      caption: 'Vue',
    });
  });
});
